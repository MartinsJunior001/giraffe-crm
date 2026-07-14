import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../kernel/db/prisma.service';
import { type TenantContext, withTenantContext } from '../../kernel/db/tenant-context';
import { SubmissaoInvalidaError, validarSubmissao } from '../cards/submission';
import { converterSubmissaoEmCard } from './converter-submissao';
import { PublicRateLimit } from './public-rate-limit';
import { PublicRouteResolver } from './public-route.resolver';

/**
 * Conflito de idempotência do Prisma na criação da submissão (dedup por `idempotencyKey` do cliente público):
 * - **P2002**: violação do `@@unique([orgId, formId, idempotencyKey])` — reenvio da mesma chave; caso comum.
 * - **P2028**: o batch-transaction do `withTenantContext` expirou esperando o lock do índice sob contenção.
 * Ambos são contenção de idempotência (o mesmo tratamento da 2.7): reler e devolver a existente, ou 409 — nunca 500.
 */
function isConflitoDeSubmissao(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Submissão PÚBLICA (não autenticada) do Formulário inicial (Story 2.8) — o ponto mais sensível do sistema.
 *
 * O ator externo apresenta APENAS o `publicId` opaco. O fluxo NUNCA aceita `orgId`/`formId`/`pipeId` do cliente:
 *  1. resolve o `publicId` → `(orgId, formId)` pelo mapa GLOBAL `PublicFormRoute` (pré-contexto);
 *  2. rate limit atômico por IP confiável + `publicId` (baseline antiabuso; fail-closed);
 *  3. entra em `withTenantContext(orgId)` e **RELÊ o Form sob RLS** — precisa existir, ser `PIPE_INITIAL`, estar
 *     com `publicEnabled` e ter versão publicada; qualquer falha → **404 uniforme** (não enumera);
 *  4. valida os `valores` contra o snapshot da versão publicada; **Arquivo é bloqueado no público** (AD-28);
 *  5. cria a `SubmissaoPublica` (idempotente por chave do cliente): `TRIAGE` → PENDING (não cria Card);
 *     `DIRECT` → converte em 1 Card na 1ª Fase ativa (reusa a conversão atômica).
 *
 * A resposta é **só confirmação** (`{ ok: true }`) — sem id, sem dado interno, sem revelar se virou Card ou
 * ficou pendente. Erros de validação viram **400 genérico** (nunca ecoam rótulos/estrutura interna). `valores`
 * são PII de titular externo: NUNCA em log.
 */
@Injectable()
export class PublicSubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rotas: PublicRouteResolver,
    private readonly rateLimit: PublicRateLimit,
    private readonly logger: PinoLogger,
  ) {}

  /** Submete o Formulário público. `ip` é o IP confiável já resolvido (nunca o X-Forwarded-For cru). */
  async submeter(
    publicId: string,
    ip: string | undefined,
    dto: { valores: unknown; idempotencyKey?: string },
  ): Promise<{ ok: true }> {
    // 1. Resolver o tenant pelo publicId (global, pré-contexto). Inválida/revogada → 404 uniforme.
    const destino = await this.rotas.resolver(publicId);
    if (!destino) throw new NotFoundException();

    // 2. Rate limit (fail-closed) por IP + publicId. Excedido → 429.
    await this.rateLimit.registrar(ip, publicId);

    const contexto: TenantContext = { orgId: destino.orgId };
    // Logger REAL (não no-op): a camada só registra metadados (orgId/model/operation/result) — nunca os `valores`,
    // que são PII. Silenciar aqui apagaria a auditoria (FR-214) do INSERT de SubmissaoPublica e o sinal `rls.denied`
    // no endpoint mais atacado do sistema.
    const db = withTenantContext(this.prisma, contexto, this.logger);

    // 3. Reler o Form SOB RLS e validar. Nunca confia no formId do cliente — usa o do destino resolvido.
    const form = await db.form.findFirst({
      where: {
        id: destino.formId,
        context: 'PIPE_INITIAL',
        publicEnabled: true,
      },
      select: { id: true, pipeId: true, publishedVersion: true, publicMode: true },
    });
    if (!form || form.pipeId == null || form.publishedVersion == null) {
      throw new NotFoundException(); // não publicado / não público / inexistente → 404 uniforme
    }

    const versao = await db.formVersion.findFirst({
      where: { formId: form.id, version: form.publishedVersion },
      select: { id: true, snapshot: true },
    });
    if (!versao) throw new NotFoundException();

    // 4. Validar valores contra o snapshot; Arquivo bloqueado no público; erro → 400 GENÉRICO (sem vazar).
    const valores = this.validarValoresPublicos(versao.snapshot, dto.valores);

    // 5. Criar a submissão (idempotente por chave do cliente); converter se DIRECT.
    const submissao = await this.criarSubmissao(db, {
      orgId: destino.orgId,
      formId: form.id,
      formVersionId: versao.id,
      valores,
      idempotencyKey: dto.idempotencyKey,
    });

    if (form.publicMode === 'DIRECT' && submissao.state === 'PENDING') {
      const fase = await db.phase.findFirst({
        where: { pipeId: form.pipeId, state: 'ACTIVE' },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      if (fase) {
        await converterSubmissaoEmCard(
          this.prisma,
          contexto,
          {
            submissaoId: submissao.id,
            formId: form.id,
            formVersionId: versao.id,
            pipeId: form.pipeId,
            phaseId: fase.id,
            valores,
          },
          this.logger,
        );
      }
      // Sem Fase ativa: a submissão fica PENDING (recuperável pela triagem) — nunca vaza esse detalhe ao ator.
    }

    return { ok: true }; // confirmação opaca — nada interno
  }

  // ── Internos ─────────────────────────────────────────────────────────────────────────────────

  /** Valida os valores contra o snapshot e BLOQUEIA valor de Campo `FILE` no canal público (AD-28). Erro → 400. */
  private validarValoresPublicos(
    snapshot: Prisma.JsonValue,
    valores: unknown,
  ): Record<string, unknown> {
    // Arquivo gated: nenhum valor para Campo FILE é aceito pelo público.
    const idsArquivo = this.camposArquivo(snapshot);
    if (valores !== null && typeof valores === 'object' && !Array.isArray(valores)) {
      for (const chave of Object.keys(valores as Record<string, unknown>)) {
        if (idsArquivo.has(chave)) throw new BadRequestException('submissão inválida');
      }
    }
    try {
      return validarSubmissao(snapshot, valores);
    } catch (err) {
      if (err instanceof SubmissaoInvalidaError)
        throw new BadRequestException('submissão inválida'); // genérico
      throw err;
    }
  }

  /** Ids de Campos do tipo FILE no snapshot (para bloquear no público). Fail-safe: snapshot ruim → conjunto vazio. */
  private camposArquivo(snapshot: Prisma.JsonValue): Set<string> {
    const ids = new Set<string>();
    if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) return ids;
    const fields = (snapshot as { fields?: unknown }).fields;
    if (!Array.isArray(fields)) return ids;
    for (const f of fields) {
      if (f && typeof f === 'object') {
        const obj = f as { id?: unknown; type?: unknown };
        if (obj.type === 'FILE' && typeof obj.id === 'string') ids.add(obj.id);
      }
    }
    return ids;
  }

  /**
   * Cria a `SubmissaoPublica` PENDING; se a chave do cliente colidir (reenvio), devolve a existente — idempotente,
   * sem 2ª submissão. Sem chave, sempre cria (não deduplica).
   */
  private async criarSubmissao(
    db: ReturnType<typeof withTenantContext>,
    dados: {
      orgId: string;
      formId: string;
      formVersionId: string;
      valores: Record<string, unknown>;
      idempotencyKey?: string;
    },
  ): Promise<{ id: string; state: 'PENDING' | 'CONVERTED' | 'REJECTED' }> {
    try {
      return await db.submissaoPublica.create({
        data: {
          orgId: dados.orgId,
          formId: dados.formId,
          formVersionId: dados.formVersionId,
          valores: dados.valores as Prisma.InputJsonValue,
          idempotencyKey: dados.idempotencyKey ?? null,
        },
        select: { id: true, state: true },
      });
    } catch (err) {
      if (isConflitoDeSubmissao(err) && dados.idempotencyKey) {
        const existente = await db.submissaoPublica.findFirst({
          where: { formId: dados.formId, idempotencyKey: dados.idempotencyKey },
          select: { id: true, state: true },
        });
        if (existente) return existente; // reenvio: idempotente
        // Conflito sem linha visível ainda (P2028 esperando o vencedor comitar): contenção, não erro interno → 409.
        throw new ConflictException('submissão concorrente em andamento; repita a requisição');
      }
      throw err;
    }
  }
}
