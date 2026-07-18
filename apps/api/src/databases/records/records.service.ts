import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '../../../generated/prisma';
import { type ContextoOrganizacional, RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { definirContextoOrg, withTenantContext } from '../../kernel/db/tenant-context';
import { getEnv } from '../../kernel/config/env';
import {
  extrairArquivosReferenciados,
  SubmissaoInvalidaError,
  validarSubmissao,
  type OpcoesSubmissao,
} from '../../pipes/cards/submission';
import { snapshotExigeCapacidadeArquivo } from '../../pipes/forms/file-gate';
import { exigirLerDatabase, exigirOperarDatabase } from '../database-authz';
import type { CriarRegistroDTO, EditarRegistroDTO } from './records.dto';

type Db = ReturnType<typeof withTenantContext>;

/** O que um Registro expõe pela API interna (`orgId` fica fora da fronteira). */
export interface RecordVisao {
  id: string;
  databaseId: string;
  formId: string;
  formVersionId: string;
  origin: string;
  lifecycleState: string;
  valores: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

/** Projeção fixa do Registro. `orgId`/`idempotencyKey` nunca saem pela fronteira. */
const SELECT_RECORD = {
  id: true,
  databaseId: true,
  formId: true,
  formVersionId: true,
  origin: true,
  lifecycleState: true,
  valores: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Conflito de concorrência na criação (→ caminho idempotente / 409), simétrico ao `isConflitoDeSubmissao` da 2.7:
 * P2002 (violação do `@@unique([orgId, databaseId, idempotencyKey])`) ou P2028 (timeout da tx interativa sob
 * contenção no mesmo índice). Tratar como conflito é honesto; virar 500 esconderia a corrida.
 */
function isConflito(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Ciclo do Registro — criação e edição de valores (Story 3.4). Reutiliza a maquinaria da submissão de Card (2.7):
 * valida `valores` contra o snapshot da `FormVersion` publicada do **Formulário de Database** (3.3), grava JSONB
 * por `Field.id` (AD-11) e escreve um evento no `RecordHistory` na MESMA transação (AD-13). **Card ≠ Registro**:
 * o Registro pertence a 1 Database e não percorre Fases.
 *
 * **Autorização:** OPERAR o Database (`exigirOperarDatabase` — Admin da Org / Admin do Database / MEMBER); VIEWER
 * → 403; sem acesso → 404. **Idempotência:** `idempotencyKey` + `@@unique([orgId, databaseId, idempotencyKey])`.
 * **Database arquivado = somente-leitura integral** (3.1): criar/editar sob Database ARCHIVED → 409.
 */
@Injectable()
export class RecordsService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /** Garante que o Database está ATIVO (somente-leitura integral sob arquivamento — 3.1). 409 se ARQUIVADO. */
  private async exigirDatabaseAtivo(db: Db, databaseId: string): Promise<void> {
    const database = await db.database.findUnique({
      where: { id: databaseId },
      select: { state: true },
    });
    // A existência/acesso já foram provados pela autz; aqui só o estado importa.
    if (database?.state === 'ARCHIVED') {
      throw new ConflictException({ motivo: 'DATABASE_ARQUIVADO' });
    }
  }

  /**
   * Cria um Registro a partir do Formulário de Database publicado. 404 sem acesso ao Database; 403 se só lê; 409
   * se o Formulário não está publicado ou o Database está arquivado; 400 se os valores são inválidos.
   */
  async criar(databaseId: string, dto: CriarRegistroDTO): Promise<RecordVisao> {
    const { contexto, db } = this.db();
    await exigirOperarDatabase(db, contexto, databaseId); // 404 sem acesso; 403 VIEWER
    await this.exigirDatabaseAtivo(db, databaseId);

    // Formulário de Database materializado e PUBLICADO?
    const form = await db.form.findFirst({
      where: { orgId: contexto.orgId, context: 'DATABASE', databaseId },
      select: { id: true, publishedVersion: true },
    });
    if (!form) throw new ConflictException('o Formulário de Database não está publicado');
    if (form.publishedVersion == null) {
      throw new ConflictException('o Formulário de Database não está publicado');
    }

    const versao = await db.formVersion.findFirst({
      where: { formId: form.id, version: form.publishedVersion },
      select: { id: true, snapshot: true },
    });
    if (!versao) throw new ConflictException('versão publicada indisponível');

    const valores = this.validar(versao.snapshot, dto.valores);

    return this.criarAtomico(contexto, {
      databaseId,
      formId: form.id,
      formVersionId: versao.id,
      idempotencyKey: dto.idempotencyKey,
      valores,
    });
  }

  /**
   * Edita os `valores` de um Registro ATIVO, revalidando contra a `FormVersion` **congelada do próprio Registro**
   * (AD-12 — não o rascunho atual). 404 sem acesso/Registro inexistente; 403 se só lê; 409 se o Registro ou o
   * Database está arquivado; 400 se os valores são inválidos.
   */
  async editarValores(
    databaseId: string,
    recordId: string,
    dto: EditarRegistroDTO,
  ): Promise<RecordVisao> {
    const { contexto, db } = this.db();
    await exigirOperarDatabase(db, contexto, databaseId); // 404 sem acesso; 403 VIEWER
    await this.exigirDatabaseAtivo(db, databaseId);

    const record = await db.record.findFirst({
      where: { id: recordId, databaseId },
      select: { id: true, lifecycleState: true, formVersionId: true },
    });
    if (!record) throw new NotFoundException();
    if (record.lifecycleState === 'ARQUIVADO') {
      throw new ConflictException({ motivo: 'RECORD_ARQUIVADO' });
    }

    const versao = await db.formVersion.findUnique({
      where: { id: record.formVersionId },
      select: { snapshot: true },
    });
    if (!versao) throw new ConflictException('versão do Registro indisponível');

    // Edição: o Registro já existe (e o arquivo já foi enviado e vinculado a ele), então Campo Arquivo é aceito
    // como REFERÊNCIA tipada (Story 3.8, Opção 1). O vínculo é conferido contra ESTE Registro.
    const valores = this.validar(versao.snapshot, dto.valores, { arquivo: 'referencia' });
    await this.exigirArquivosVinculados(db, versao.snapshot, valores, recordId);

    let atualizado: RecordVisao | null;
    try {
      atualizado = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        // Guarda otimista: só edita se o Registro AINDA está ATIVO (senão foi arquivado concorrentemente).
        const { count } = await tx.record.updateMany({
          where: { id: recordId, lifecycleState: 'ATIVO' },
          data: { valores: valores as Prisma.InputJsonValue },
        });
        if (count === 0) return null;

        await tx.recordHistory.create({
          data: {
            orgId: contexto.orgId,
            recordId,
            type: 'VALUES_UPDATED',
            summary: 'Valores do Registro atualizados',
            actorId: contexto.accountId ?? null,
          },
        });

        return tx.record.findUniqueOrThrow({ where: { id: recordId }, select: SELECT_RECORD });
      });
    } catch (err) {
      if (isConflito(err)) {
        throw new ConflictException('edição concorrente em andamento; reconsulte e repita');
      }
      throw err;
    }

    if (!atualizado) throw new ConflictException({ motivo: 'RECORD_ARQUIVADO' });

    this.auditar(contexto, 'update', 'Record');
    this.auditar(contexto, 'create', 'RecordHistory');
    return atualizado;
  }

  /** Detalhe de um Registro (leitura básica para 3.5/3.6). 404 sem acesso/inexistente. Sem listagem (3.5). */
  async obter(databaseId: string, recordId: string): Promise<RecordVisao> {
    const { contexto, db } = this.db();
    await exigirLerDatabase(db, contexto, databaseId); // 404 sem acesso
    const record = await db.record.findFirst({
      where: { id: recordId, databaseId },
      select: SELECT_RECORD,
    });
    if (!record) throw new NotFoundException();
    return record;
  }

  // ── Internos ─────────────────────────────────────────────────────────────────────────────────

  /** Valida os valores contra o snapshot (400 determinístico), reusando o núcleo puro da 2.7. */
  private validar(
    snapshot: Prisma.JsonValue,
    valores: unknown,
    opcoes?: OpcoesSubmissao,
  ): Record<string, unknown> {
    // Gate de CONSUMO (Story 3.8, RF-3 / ADR AC-2): snapshot publicado exige Campo Arquivo mas a capacidade
    // está desligada ⇒ 409 honesto. Vale para criar E editar (ambos passam por aqui). Fail-closed.
    if (snapshotExigeCapacidadeArquivo(snapshot) && !getEnv().FILE_UPLOAD_ENABLED) {
      throw new ConflictException({ motivo: 'CAPACIDADE_ARQUIVO_INDISPONIVEL' });
    }
    try {
      return validarSubmissao(snapshot, valores, opcoes);
    } catch (err) {
      if (err instanceof SubmissaoInvalidaError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  /**
   * Confere que cada arquivo referenciado nos `valores` (Campo `FILE`, Story 3.8) está DISPONIVEL e **vinculado
   * a ESTE Registro** (`resourceType='RECORD'`, `resourceId=recordId`). Herda a 3.7: RLS escopa `FileObject` ao
   * tenant, então um `fileId` de outro tenant simplesmente não é encontrado; um `fileId` de OUTRO Registro ou em
   * QUARENTENA/removido não casa o vínculo. Qualquer falha ⇒ 400 uniforme (não-enumerante — não distingue
   * "inexistente" de "de outro recurso"). Só de LEITURA; roda antes da transação de escrita.
   */
  private async exigirArquivosVinculados(
    db: Db,
    snapshot: Prisma.JsonValue,
    valores: Record<string, unknown>,
    recordId: string,
  ): Promise<void> {
    const ids = extrairArquivosReferenciados(snapshot, valores);
    if (ids.length === 0) return;
    const arquivos = await db.fileObject.findMany({
      where: { id: { in: ids } },
      select: { id: true, state: true, resourceType: true, resourceId: true },
    });
    const validos = new Set(
      arquivos
        .filter(
          (a) => a.state === 'DISPONIVEL' && a.resourceType === 'RECORD' && a.resourceId === recordId,
        )
        .map((a) => a.id),
    );
    for (const id of ids) {
      if (!validos.has(id)) throw new BadRequestException('referência de arquivo inválida');
    }
  }

  /**
   * Cria o Registro e o evento `CREATED` numa transação interativa atômica com contexto. Idempotência: se
   * `(orgId, databaseId, idempotencyKey)` já existe (retry), o `UNIQUE` dispara P2002, a tx faz rollback e
   * devolvemos o Registro **existente** — uma ação lógica cria 0 ou 1 Registro.
   */
  private async criarAtomico(
    contexto: ContextoOrganizacional,
    dados: {
      databaseId: string;
      formId: string;
      formVersionId: string;
      idempotencyKey: string;
      valores: Record<string, unknown>;
    },
  ): Promise<RecordVisao> {
    let record: RecordVisao;
    try {
      record = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        const novo = await tx.record.create({
          data: {
            orgId: contexto.orgId,
            databaseId: dados.databaseId,
            formId: dados.formId,
            formVersionId: dados.formVersionId,
            idempotencyKey: dados.idempotencyKey,
            valores: dados.valores as Prisma.InputJsonValue,
          },
          select: SELECT_RECORD,
        });

        // Evento de criação — MESMA transação (AD-13): não há Registro sem evento nem evento sem Registro.
        await tx.recordHistory.create({
          data: {
            orgId: contexto.orgId,
            recordId: novo.id,
            type: 'CREATED',
            summary: 'Registro criado pela submissão do Formulário de Database',
            actorId: contexto.accountId ?? null,
          },
        });

        return novo;
      });
    } catch (err) {
      if (isConflito(err)) {
        const existente = await this.acharPorChave(dados.databaseId, dados.idempotencyKey);
        if (existente) return existente;
        throw new ConflictException('criação concorrente em andamento; repita a requisição');
      }
      throw err;
    }

    this.auditar(contexto, 'create', 'Record');
    this.auditar(contexto, 'create', 'RecordHistory');
    return record;
  }

  /** Registro por chave de idempotência (para o caminho de retry). */
  private async acharPorChave(
    databaseId: string,
    idempotencyKey: string,
  ): Promise<RecordVisao | null> {
    const { db } = this.db();
    return db.record.findFirst({
      where: { databaseId, idempotencyKey },
      select: SELECT_RECORD,
    });
  }

  /** Auditoria manual (FR-214) — a tx raiz não passa pela extensão. Só metadados; nunca `valores` (PII). */
  private auditar(contexto: ContextoOrganizacional, action: string, resource: string): void {
    this.logger.info(
      {
        event: 'audit',
        actor: contexto.accountId ?? null,
        orgId: contexto.orgId,
        action,
        resource,
        result: 'allowed',
        at: new Date().toISOString(),
      },
      'auditoria',
    );
  }
}
