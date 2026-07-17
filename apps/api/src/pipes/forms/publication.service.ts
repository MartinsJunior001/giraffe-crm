import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '../../../generated/prisma';
import { getEnv } from '../../kernel/config/env';
import { type ContextoOrganizacional, RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { definirContextoOrg, withTenantContext } from '../../kernel/db/tenant-context';
import { exigirGerenciarForm, resolverPoderNoForm } from './form-authz';
import { type AlvoFormulario, acharForm, resolverContexto } from './form-locate';
import {
  type CampoParaSnapshot,
  type FormSnapshot,
  PublicacaoInvalidaError,
  calcularRevisao,
  montarSnapshot,
} from './snapshot';

type Db = ReturnType<typeof withTenantContext>;

/** Metadados de uma versão publicada (sem o snapshot integral). */
export interface VersaoResumo {
  version: number;
  revision: string;
  publishedAt: Date;
  actorId: string | null;
}

/** Uma versão com o snapshot integral (para renderizar o histórico). */
export interface VersaoDetalhe extends VersaoResumo {
  snapshot: Prisma.JsonValue;
}

/** Estado de publicação de um Formulário: qual versão está ativa (ou nenhuma) e o histórico. */
export interface EstadoPublicacao {
  formId: string;
  publishedVersion: number | null;
  versions: VersaoResumo[];
}

/** Projeção fixa de uma versão (metadados; `orgId`/`formId` fora do payload). */
const SELECT_RESUMO = {
  version: true,
  revision: true,
  publishedAt: true,
  actorId: true,
} as const;

/**
 * O erro da publicação atômica é um CONFLITO de concorrência (→ 409, o cliente recarrega e repete)?
 *
 * - **P2002**: violação do `@@unique([orgId, formId, version])` — duas publicações calcularam o mesmo número; o
 *   banco barrou a segunda. É o caminho comum sob concorrência.
 * - **P2028**: a transação interativa expirou/fechou. Sob contenção pesada no MESMO Formulário, a segunda
 *   publicação BLOQUEIA no índice único até a primeira comitar; se esse bloqueio estourar o timeout da
 *   transação ANTES de a violação de unicidade se materializar, o Prisma lança P2028. Semanticamente ainda é
 *   contenção de publicação — mapeá-lo para 409 (retry) é honesto; deixá-lo virar 500 esconderia um conflito
 *   atrás de "erro interno". A transação é minúscula (1 insert + 1 update), então P2028 aqui só ocorre por
 *   contenção, não por trabalho lento.
 */
export function isConflitoDePublicacao(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Ciclo de publicação do Formulário (Story 2.6). Publicar CONGELA o rascunho VALIDADO num `FormVersion`
 * imutável e numerado; despublicar zera o ponteiro (preserva versões e dados); ler devolve estado e histórico.
 * Reusa a autorização fina "config do Pipe" (`pipe-authz`) e os localizadores (`form-locate`).
 *
 * **Imutabilidade** é do banco: o runtime não tem GRANT de UPDATE/DELETE em `FormVersion`. Editar o rascunho
 * (2.4/2.5) NUNCA toca versões já publicadas — são linhas separadas e congeladas.
 *
 * **Atomicidade da publicação**: publicar toca DUAS escritas (INSERT `FormVersion` + UPDATE do ponteiro em
 * `Form`). `withTenantContext` recusa `$transaction` no client ESTENDIDO — mas o client RAIZ pode rodar uma
 * transação interativa onde o contexto é definido com `set_config(..., true)` (transaction-local), exatamente
 * o primitivo que a extensão usa por dentro. Publicar é o **consumidor concreto** que a nota da Story 1.3
 * previa. A numeração é servida pelo banco: `UNIQUE(orgId, formId, version)` barra número duplicado sob
 * concorrência — a transação inteira faz rollback e o cliente recebe 409 (nunca versão parcial/duplicada).
 */
@Injectable()
export class FormPublicationService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /**
   * Publica o Formulário do contexto: valida o rascunho, monta o snapshot e cria uma `FormVersion` imutável,
   * numerada monotonicamente, apontada pelo `Form`. Exige **gerenciar** (roteado por contexto em `form-authz`:
   * Pipe/Fase → config do Pipe; Database → Admin da Org/Admin do Database). 400 se o rascunho é
   * inválido (sem Campos ativos, Seleção sem opção, gate de Arquivo, `typeConfig` malformado); 409 em
   * concorrência de número; 404 se o Formulário ainda não foi materializado (não se publica o inexistente).
   */
  async publicar(alvo: AlvoFormulario): Promise<VersaoDetalhe> {
    const { contexto, db } = this.db();
    await exigirGerenciarForm(db, contexto, alvo);
    const form = await this.localizarForm(db, alvo);

    // Rascunho = Campos ATIVOS na ordem. Arquivados não entram na definição publicada.
    const camposAtivos = (await db.field.findMany({
      where: { formId: form.id, state: 'ACTIVE' },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true, label: true, type: true, help: true, typeConfig: true, required: true },
    })) as CampoParaSnapshot[];

    let snapshot: FormSnapshot;
    try {
      snapshot = montarSnapshot(form.id, camposAtivos, {
        fileUpload: getEnv().FILE_UPLOAD_ENABLED,
      });
    } catch (err) {
      if (err instanceof PublicacaoInvalidaError) throw new BadRequestException(err.message);
      throw err;
    }
    const revision = calcularRevisao(snapshot);

    return this.publicarAtomico(contexto, form.id, snapshot, revision);
  }

  /**
   * Despublica: zera o ponteiro `publishedVersion` (bloqueia novas submissões — 2.7+), preservando versões e
   * dados. Idempotente: se já está despublicado, não emite `updateMany` (evita falso `denied` na auditoria).
   */
  async despublicar(alvo: AlvoFormulario): Promise<EstadoPublicacao> {
    const { contexto, db } = this.db();
    await exigirGerenciarForm(db, contexto, alvo);
    const form = await this.localizarForm(db, alvo);

    const atual = await db.form.findUnique({
      where: { id: form.id },
      select: { publishedVersion: true },
    });
    if (atual?.publishedVersion != null) {
      const { count } = await db.form.updateMany({
        where: { id: form.id, publishedVersion: { not: null } },
        data: { publishedVersion: null },
      });
      if (count === 0) throw new NotFoundException();
    }
    return this.montarEstado(db, form.id);
  }

  /** Estado de publicação + histórico. Exige ao menos **leitura** do contexto (Pipe/Fase ou Database) — senão 404. */
  async estado(alvo: AlvoFormulario): Promise<EstadoPublicacao> {
    const { contexto, db } = this.db();
    await resolverPoderNoForm(db, contexto, alvo);
    const form = await this.localizarForm(db, alvo);
    return this.montarEstado(db, form.id);
  }

  /** Snapshot integral de UMA versão publicada. Exige leitura do contexto; 404 se a versão não existe. */
  async versao(alvo: AlvoFormulario, version: number): Promise<VersaoDetalhe> {
    const { contexto, db } = this.db();
    await resolverPoderNoForm(db, contexto, alvo);
    const form = await this.localizarForm(db, alvo);
    const versao = await db.formVersion.findFirst({
      where: { formId: form.id, version },
      select: { ...SELECT_RESUMO, snapshot: true },
    });
    if (!versao) throw new NotFoundException();
    return versao;
  }

  // ── Internos ─────────────────────────────────────────────────────────────────────────────────

  /**
   * A escrita atômica da publicação. Transação interativa no client RAIZ com contexto transaction-local
   * (`set_config(..., true)`) — RLS e `WITH CHECK` valem dentro dela. O número da versão é `max+1`; se duas
   * publicações concorrentes calcularem o mesmo, o `UNIQUE` do banco barra a segunda, a transação inteira faz
   * rollback e o cliente recebe **409**. A auditoria (FR-214) é emitida à mão, pois este caminho não passa
   * pela extensão `withTenantContext`.
   */
  private async publicarAtomico(
    contexto: ContextoOrganizacional,
    formId: string,
    snapshot: FormSnapshot,
    revision: string,
  ): Promise<VersaoDetalhe> {
    let criado: VersaoDetalhe;
    try {
      criado = await this.prisma.$transaction(async (tx) => {
        // Contexto transaction-local pela MESMA fonte que a extensão usa (single-source — sem cópia do
        // `set_config` que possa divergir). RLS/WITH CHECK valem dentro desta transação interativa.
        for (const p of definirContextoOrg(tx, contexto)) await p;

        const ultimo = await tx.formVersion.findFirst({
          where: { formId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const version = (ultimo?.version ?? 0) + 1;

        const novo = await tx.formVersion.create({
          data: {
            orgId: contexto.orgId,
            formId,
            version,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            revision,
            actorId: contexto.accountId ?? null,
          },
          select: { ...SELECT_RESUMO, snapshot: true },
        });

        // Aponta o Form para a nova versão. `updateMany` (não `update`) para não lançar por RLS: 0 linhas
        // aqui significaria Form fora do contexto — impossível, já foi localizado nesta Org, mas o guardamos.
        const { count } = await tx.form.updateMany({
          where: { id: formId },
          data: { publishedVersion: version },
        });
        if (count === 0) throw new NotFoundException();

        return novo;
      });
    } catch (err) {
      if (isConflitoDePublicacao(err)) {
        throw new ConflictException('publicação concorrente; recarregue o estado e tente de novo');
      }
      throw err;
    }

    // Auditoria manual (o caminho da transação raiz não passa pela extensão que auto-audita
    // `MODELOS_AUDITADOS`). Emitimos as DUAS mutações da publicação — a criação da `FormVersion` E a mudança do
    // ponteiro em `Form` — para que a trilha (FR-214) fique simétrica ao `despublicar` (que passa pela extensão
    // e é auditado). Nunca logamos o snapshot (pode conter rótulos de negócio): só ator/Org/ação/recurso/
    // resultado, mais o número da versão e a revisão (hash) como âncora.
    const at = new Date().toISOString();
    this.logger.info(
      {
        event: 'audit',
        actor: contexto.accountId ?? null,
        orgId: contexto.orgId,
        action: 'create',
        resource: 'FormVersion',
        result: 'allowed',
        at,
        version: criado.version,
        revision: criado.revision,
      },
      'auditoria',
    );
    this.logger.info(
      {
        event: 'audit',
        actor: contexto.accountId ?? null,
        orgId: contexto.orgId,
        action: 'update',
        resource: 'Form',
        result: 'allowed',
        at,
        version: criado.version,
      },
      'auditoria',
    );
    return criado;
  }

  /** Localiza o Formulário do contexto; 404 se ainda não materializado (publicar/ler pressupõe existência). */
  private async localizarForm(db: Db, alvo: AlvoFormulario): Promise<{ id: string }> {
    const { context, owner } = await resolverContexto(db, alvo);
    const form = await acharForm(db, this.requestContext.obter().orgId, context, owner);
    if (!form) throw new NotFoundException();
    return form;
  }

  /** Estado + histórico de versões (metadados, ordenados por número). */
  private async montarEstado(db: Db, formId: string): Promise<EstadoPublicacao> {
    const [form, versions] = await Promise.all([
      db.form.findUnique({ where: { id: formId }, select: { publishedVersion: true } }),
      db.formVersion.findMany({
        where: { formId },
        orderBy: { version: 'asc' },
        select: SELECT_RESUMO,
      }),
    ]);
    return { formId, publishedVersion: form?.publishedVersion ?? null, versions };
  }
}
