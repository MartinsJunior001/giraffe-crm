import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '../../../generated/prisma';
import { type ContextoOrganizacional, RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { definirContextoOrg, withTenantContext } from '../../kernel/db/tenant-context';
import { exigirLerDatabase } from '../database-authz';
import {
  type CampoDef,
  ConsultaInvalidaError,
  type FiltroPlano,
  type OrderByPlano,
  planejarConsulta,
  type QueryEntrada,
} from './record-query.core';

type Db = ReturnType<typeof withTenantContext>;

/** Uma linha da tabela de Registros (a `valores` é exibida — o Registro É o dado; `orgId` fora da fronteira). */
export interface RecordLinhaVisao {
  id: string;
  valores: Prisma.JsonValue;
  lifecycleState: string;
  /** Reflete (não executa) a capacidade de edição: Database ATIVO && Registro ATIVO. Mutação é 3.4. */
  podeEditar: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Uma página da tabela: linhas + total escopado ao Database + colunas (Campos ativos da definição). */
export interface RecordPaginaVisao {
  linhas: RecordLinhaVisao[];
  total: number;
  skip: number;
  take: number;
  colunas: { fieldId: string; label: string; type: string }[];
}

interface LinhaRaw {
  id: string;
  valores: Prisma.JsonValue;
  lifecycleState: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Visualização/navegação de Registros (Story 3.5) — **leitura pura** sobre `Record` (3.4). Sem migration, sem
 * GRANT novo (o runtime já lê via `SELECT`). Espelha o Kanban read (2.9) no rigor; a diferença é que o Registro É
 * o dado, então a tabela **exibe `valores`** (acesso por Database, não há PII por-linha a esconder como no Card).
 *
 * **Autorização:** `exigirLerDatabase` (qualquer poder — ler ≠ operar); sem acesso → 404 não-enumerante.
 * **INV-REPORT-01:** o escopo é sempre um Database legível; a contagem (`total`) é só dos Registros visíveis dele.
 * **Segurança da query:** o núcleo puro (`record-query.core`) valida filtros/ordenação contra a definição
 * (allowlist de `Field.id` + operadores por tipo, fail-closed); o SQL é **totalmente parametrizado** (`Prisma.sql`),
 * rodado sob RLS pelo primitivo `$transaction([...definirContextoOrg, $queryRaw])` (o `withTenantContext` embrulha
 * operações de modelo, não `$queryRaw`).
 */
@Injectable()
export class RecordsReadService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /** Lista Registros do Database em tabela (filtros/ordenação/paginação). 404 sem acesso; 400 query inválida. */
  async listar(databaseId: string, entrada: QueryEntrada): Promise<RecordPaginaVisao> {
    const { contexto, db } = this.db();
    await exigirLerDatabase(db, contexto, databaseId); // 404 não-enumerante sem acesso

    const database = await db.database.findUnique({
      where: { id: databaseId },
      select: { state: true },
    });
    const databaseAtivo = database?.state === 'ACTIVE';

    // Definição: o Formulário de Database e seus Campos ATIVOS (allowlist + colunas da tabela).
    const form = await db.form.findFirst({
      where: { orgId: contexto.orgId, context: 'DATABASE', databaseId },
      select: { id: true },
    });
    const campos = form
      ? await db.field.findMany({
          where: { formId: form.id, state: 'ACTIVE' },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: { id: true, label: true, type: true },
        })
      : [];
    const colunas = campos.map((c) => ({ fieldId: c.id, label: c.label, type: c.type }));

    // Plano validado (fail-closed → 400).
    const defs: CampoDef[] = campos.map((c) => ({ id: c.id, type: c.type }));
    let plano;
    try {
      plano = planejarConsulta(defs, entrada);
    } catch (err) {
      if (err instanceof ConsultaInvalidaError) throw new BadRequestException(err.message);
      throw err;
    }

    // WHERE parametrizado.
    const predicados: Prisma.Sql[] = [Prisma.sql`"databaseId" = ${databaseId}::uuid`];
    if (!plano.incluirArquivados) {
      predicados.push(Prisma.sql`"lifecycleState" = 'ATIVO'`);
    }
    for (const f of plano.filtros) predicados.push(this.predicadoFiltro(f));
    const where = Prisma.join(predicados, ' AND ');

    const ordExpr = this.expressaoOrdenacao(plano.orderBy);
    const dir = Prisma.raw(plano.orderBy.dir); // literal de allowlist ('ASC'/'DESC'), nunca entrada do cliente

    const linhasSql = Prisma.sql`
      SELECT "id", "valores", "lifecycleState", "createdAt", "updatedAt"
      FROM "Record"
      WHERE ${where}
      ORDER BY ${ordExpr} ${dir} NULLS LAST, "id" ASC
      LIMIT ${plano.take} OFFSET ${plano.skip}`;
    const totalSql = Prisma.sql`SELECT COUNT(*)::int AS total FROM "Record" WHERE ${where}`;

    // Raw sob RLS: mesmo primitivo do withTenantContext (contexto transaction-local no client raiz).
    const [, , linhasRaw, totalRows] = (await this.prisma.$transaction([
      ...definirContextoOrg(this.prisma, contexto),
      this.prisma.$queryRaw<LinhaRaw[]>(linhasSql),
      this.prisma.$queryRaw<{ total: number }[]>(totalSql),
    ])) as [unknown, unknown, LinhaRaw[], { total: number }[]];

    const linhas: RecordLinhaVisao[] = linhasRaw.map((r) => ({
      id: r.id,
      valores: r.valores,
      lifecycleState: r.lifecycleState,
      podeEditar: databaseAtivo && r.lifecycleState === 'ATIVO',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return { linhas, total: totalRows[0]?.total ?? 0, skip: plano.skip, take: plano.take, colunas };
  }

  // ── Internos: construção parametrizada do SQL (Campo/operador/valor validados pelo núcleo) ─────

  /** Predicado SQL de um filtro validado. `fieldId`/valores são bound; o operador vem da allowlist do núcleo. */
  private predicadoFiltro(f: FiltroPlano): Prisma.Sql {
    const path = Prisma.sql`"valores"->>${f.fieldId}`; // fieldId bound como parâmetro
    const [a, b] = f.valores;
    switch (f.categoria) {
      case 'texto':
        return f.op === 'contem'
          ? Prisma.sql`${path} ILIKE ${'%' + String(a) + '%'}`
          : Prisma.sql`${path} = ${a}`;
      case 'data':
        // Comparação como TEXTO (ISO lexicográfico) — evita DoS de cast de valor malformado.
        if (f.op === 'intervalo') return Prisma.sql`${path} BETWEEN ${a} AND ${b}`;
        if (f.op === 'maior') return Prisma.sql`${path} > ${a}`;
        if (f.op === 'menor') return Prisma.sql`${path} < ${a}`;
        return Prisma.sql`${path} = ${a}`;
      case 'numero': {
        // `::numeric` é seguro: NUMBER é validado como número na escrita (submission.ts).
        const num = Prisma.sql`(${path})::numeric`;
        if (f.op === 'intervalo') return Prisma.sql`${num} BETWEEN ${a} AND ${b}`;
        if (f.op === 'maior') return Prisma.sql`${num} > ${a}`;
        if (f.op === 'menor') return Prisma.sql`${num} < ${a}`;
        return Prisma.sql`${num} = ${a}`;
      }
      case 'booleano':
        return Prisma.sql`(${path})::boolean = ${a}`;
      case 'selecao':
        // Cobre SELECT_SINGLE (string) e SELECT_MULTI (array JSONB) — contém a opção por `id`.
        return f.op === 'contemOpcao'
          ? Prisma.sql`(${path} = ${a} OR "valores"->${f.fieldId} @> ${JSON.stringify([a])}::jsonb)`
          : Prisma.sql`${path} = ${a}`;
    }
  }

  /** Expressão de ordenação (Campo validado ou `createdAt`). */
  private expressaoOrdenacao(o: OrderByPlano): Prisma.Sql {
    if (o.campo.tipo === 'createdAt') return Prisma.sql`"createdAt"`;
    const path = Prisma.sql`"valores"->>${o.campo.fieldId}`;
    return o.campo.categoria === 'numero' ? Prisma.sql`(${path})::numeric` : path;
  }
}
