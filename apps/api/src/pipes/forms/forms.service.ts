import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { type FieldType, type FormContext, Prisma } from '../../../generated/prisma';
import { getEnv } from '../../kernel/config/env';
import { RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { withTenantContext } from '../../kernel/db/tenant-context';
import { exigirGerenciarPipe, resolverPoderNoPipe } from '../pipe-authz';
import {
  type AlvoFormulario,
  SELECT_FORM,
  acharForm,
  exigirFaseDoPipe,
  resolverContexto,
} from './form-locate';
import type { AdicionarCampoDTO } from './forms.dto';

/**
 * O que um Campo expõe pela API interna. `orgId` NÃO sai (fronteira interna) e `position` **também não**: a
 * posição é a chave de ordenação interna (um `Decimal` fracionário), não dado de apresentação — a ordem já
 * vem materializada na sequência da lista. `typeConfig` traz o que varia por tipo (opções de Seleção, com
 * id estável). `formId` sai (identifica o Formulário concreto).
 */
export interface CampoVisao {
  id: string;
  formId: string;
  label: string;
  type: FieldType;
  help: string | null;
  typeConfig: Prisma.JsonValue;
  defaultValue: Prisma.JsonValue | null;
  state: 'ACTIVE' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

/**
 * O que um Formulário expõe. O **contexto é sempre identificado** (AC2): `context` + o owner (`pipeId` para o
 * inicial, `phaseId` para o de Fase). `id` é `null` enquanto o Formulário do contexto ainda não foi
 * materializado (montar o 1º Campo o cria — ver `adicionarCampo`); ler NÃO cria (leitura sem efeito
 * colateral). `capabilities.fileUpload` indica honestamente se o Campo Arquivo é funcional (gate AD-28).
 */
export interface FormularioVisao {
  id: string | null;
  context: FormContext;
  pipeId: string | null;
  phaseId: string | null;
  capabilities: { fileUpload: boolean };
  fields: CampoVisao[];
}

/** Projeção fixa do Campo — mantém `orgId` e `position` fora do payload por construção. */
export const SELECT_CAMPO = {
  id: true,
  formId: true,
  label: true,
  type: true,
  help: true,
  typeConfig: true,
  defaultValue: true,
  state: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
} as const;

/** Uma opção de Seleção materializada no `typeConfig` — com identidade ESTÁVEL (AD-12/SC-242). */
interface OpcaoSelecao {
  id: string;
  label: string;
  position: number;
}

/** Prisma `PrismaClientKnownRequestError` de violação de unicidade (índice único parcial do Form). */
function isViolacaoUnicidade(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

/**
 * Domínio Formulário (Story 2.4). TODA query passa por `withTenantContext`: o isolamento entre Organizações é
 * do banco (RLS), não desta camada. Configurar Formulário (inicial e de Fase) é **config do Pipe** (D3.2) —
 * a autorização fina reusa a resolução da 2.3 (`pipe-authz`), sem tocar o mecanismo C3.
 *
 * **Um Formulário por contexto** (linha distinta) faz de INV-FORM-01 (não-contaminação entre contextos) uma
 * consequência de linhas separadas + RLS. **Ordenação intra-Formulário por chave fracionária** (`position`),
 * como `Phase`: mover um Campo é UM único UPDATE — `withTenantContext` recusa transação multi-statement.
 *
 * **Opções de Seleção vivem no `typeConfig`** (JSON com UUID estável), não em tabela: assim adicionar um
 * Campo de Seleção com suas opções é UM único `create` atômico (DBT-2.4-OPCOES-JSON).
 */
@Injectable()
export class FormsService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db() {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /** Obtém o Formulário **inicial** do Pipe e seus Campos na ordem. Exige ao menos leitura (senão 404). */
  async obterInicial(pipeId: string): Promise<FormularioVisao> {
    const { contexto, db } = this.db();
    await resolverPoderNoPipe(db, contexto, pipeId); // 404 se não há acesso ao Pipe
    return this.montarVisao(db, { pipeId }, 'PIPE_INITIAL');
  }

  /** Obtém o Formulário **de Fase** e seus Campos na ordem. Exige ao menos leitura do Pipe (senão 404). */
  async obterDeFase(pipeId: string, phaseId: string): Promise<FormularioVisao> {
    const { contexto, db } = this.db();
    await resolverPoderNoPipe(db, contexto, pipeId); // 404 se não há acesso ao Pipe
    await exigirFaseDoPipe(db, pipeId, phaseId);
    return this.montarVisao(db, { pipeId, phaseId }, 'PHASE');
  }

  /**
   * Adiciona um Campo ao Formulário do contexto, ao **final da ordem ativa**. Exige **gerenciar** (Admin da
   * Org ou Admin do Pipe). O Formulário é **materializado sob demanda** aqui (getOrCreate) — a 1ª adição o
   * cria. `orgId` vem do servidor, nunca do corpo. Um único `create` (opções de Seleção no `typeConfig`).
   */
  async adicionarCampo(alvo: AlvoFormulario, dto: AdicionarCampoDTO): Promise<CampoVisao> {
    const { contexto, db } = this.db();
    await exigirGerenciarPipe(db, contexto, alvo.pipeId);
    const { context, owner } = await resolverContexto(db, alvo);
    const form = await this.getOrCreateForm(db, contexto.orgId, context, owner);
    const position = await this.proximaPosicao(db, form.id);
    const typeConfig = this.montarTypeConfig(dto.type, dto.options);
    return db.field.create({
      data: {
        orgId: contexto.orgId,
        formId: form.id,
        label: dto.label,
        type: dto.type,
        help: dto.help ?? undefined,
        typeConfig,
        position,
      },
      select: SELECT_CAMPO,
    });
  }

  /**
   * Move um Campo ACTIVE para logo **depois** de `afterFieldId` (ou para o **início** se `null`), com um
   * **único UPDATE**: `position` = ponto médio dos vizinhos no destino. Exige **gerenciar**. Intra-Formulário:
   * a ordem de outro Formulário não é tocada. O Formulário deve existir (senão 404 — não se reordena o vazio).
   */
  async reordenarCampo(
    alvo: AlvoFormulario,
    fieldId: string,
    afterFieldId: string | null,
  ): Promise<CampoVisao> {
    const { contexto, db } = this.db();
    await exigirGerenciarPipe(db, contexto, alvo.pipeId);
    if (afterFieldId === fieldId) throw new NotFoundException(); // "depois de si mesmo" não é posição válida
    const { context, owner } = await resolverContexto(db, alvo);
    const form = await acharForm(db, contexto.orgId, context, owner);
    if (!form) throw new NotFoundException();

    const alvoCampo = await db.field.findUnique({
      where: { id: fieldId },
      select: { id: true, formId: true, state: true },
    });
    if (!alvoCampo || alvoCampo.formId !== form.id || alvoCampo.state !== 'ACTIVE') {
      throw new NotFoundException();
    }

    // Ordem ativa atual, sem o Campo que está sendo movido — os vizinhos do destino saem daqui.
    const ativos = await db.field.findMany({
      where: { formId: form.id, state: 'ACTIVE', id: { not: fieldId } },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true, position: true },
    });

    let anterior: Prisma.Decimal | null = null;
    let seguinte: Prisma.Decimal | null = null;
    if (afterFieldId === null) {
      const primeiro = ativos[0];
      seguinte = primeiro ? new Prisma.Decimal(primeiro.position) : null;
    } else {
      const idx = ativos.findIndex((c) => c.id === afterFieldId);
      const referencia = idx === -1 ? undefined : ativos[idx];
      if (!referencia) throw new NotFoundException(); // âncora não é um Campo ativo deste Formulário
      anterior = new Prisma.Decimal(referencia.position);
      const prox = ativos[idx + 1];
      seguinte = prox ? new Prisma.Decimal(prox.position) : null;
    }

    const novaPosicao = this.pontoMedio(anterior, seguinte);
    const { count } = await db.field.updateMany({
      where: { id: fieldId, formId: form.id, state: 'ACTIVE' },
      data: { position: novaPosicao },
    });
    if (count === 0) throw new NotFoundException();
    return this.lerCampo(db, form.id, fieldId);
  }

  // ── Internos ───────────────────────────────────────────────────────────────────────────────

  /**
   * Materialização sob demanda do Formulário do contexto. Sem `upsert` (o alvo de unicidade é um índice
   * único PARCIAL, invisível ao Prisma): busca; se não há, cria; se uma corrida criou entre a busca e o
   * INSERT, o índice parcial recusa (P2002) e relemos. Convergente e sem duplicata.
   */
  private async getOrCreateForm(
    db: ReturnType<typeof withTenantContext>,
    orgId: string,
    context: FormContext,
    owner: { pipeId?: string; phaseId?: string },
  ) {
    const existente = await acharForm(db, orgId, context, owner);
    if (existente) return existente;
    try {
      return await db.form.create({ data: { orgId, context, ...owner }, select: SELECT_FORM });
    } catch (err) {
      if (isViolacaoUnicidade(err)) {
        const denovo = await acharForm(db, orgId, context, owner);
        if (denovo) return denovo;
      }
      throw err;
    }
  }

  /** Monta a visão do Formulário (contexto identificado + Campos na ordem + capabilities do gate). */
  private async montarVisao(
    db: ReturnType<typeof withTenantContext>,
    alvo: AlvoFormulario,
    context: FormContext,
  ): Promise<FormularioVisao> {
    const owner =
      context === 'PHASE' ? { phaseId: alvo.phaseId ?? undefined } : { pipeId: alvo.pipeId };
    const form = await acharForm(db, this.requestContext.obter().orgId, context, owner);
    const fields = form ? await this.listarCampos(db, form.id) : [];
    return {
      id: form?.id ?? null,
      context,
      pipeId: form?.pipeId ?? (context === 'PIPE_INITIAL' ? alvo.pipeId : null),
      phaseId: form?.phaseId ?? (context === 'PHASE' ? (alvo.phaseId ?? null) : null),
      capabilities: { fileUpload: getEnv().FILE_UPLOAD_ENABLED },
      fields,
    };
  }

  /** Lista os Campos de um Formulário **na ordem** `[state, position, id]` (ativos primeiro). */
  private async listarCampos(
    db: ReturnType<typeof withTenantContext>,
    formId: string,
  ): Promise<CampoVisao[]> {
    return db.field.findMany({
      where: { formId },
      select: SELECT_CAMPO,
      orderBy: [{ state: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    });
  }

  /** Lê um Campo do Formulário. 404 se não existe ou é de outro Formulário. */
  private async lerCampo(
    db: ReturnType<typeof withTenantContext>,
    formId: string,
    fieldId: string,
  ): Promise<CampoVisao> {
    const campo = await db.field.findUnique({ where: { id: fieldId }, select: SELECT_CAMPO });
    if (!campo || campo.formId !== formId) throw new NotFoundException();
    return campo;
  }

  /** Maior `position` entre os Campos ACTIVE do Formulário + 1 (append ao final); 1 se não houver. */
  private async proximaPosicao(
    db: ReturnType<typeof withTenantContext>,
    formId: string,
  ): Promise<Prisma.Decimal> {
    const ultimo = await db.field.findFirst({
      where: { formId, state: 'ACTIVE' },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return ultimo ? new Prisma.Decimal(ultimo.position).plus(1) : new Prisma.Decimal(1);
  }

  /**
   * Ponto médio entre dois vizinhos da ordem. Entre ambos: `(a+b)/2`. Só anterior (final): `a+1`. Só
   * seguinte (início): `b/2`. Nenhum (o Campo movido era o único ativo): `1`.
   */
  private pontoMedio(
    anterior: Prisma.Decimal | null,
    seguinte: Prisma.Decimal | null,
  ): Prisma.Decimal {
    if (anterior && seguinte) return anterior.plus(seguinte).div(2);
    if (anterior) return anterior.plus(1);
    if (seguinte) return seguinte.div(2);
    return new Prisma.Decimal(1);
  }

  /**
   * `typeConfig` a partir do tipo e dos rótulos de opção. Tipos de Seleção materializam `options` com
   * **UUID estável** por opção (a identidade não depende do rótulo — AD-12/SC-242). Demais tipos: `{}`.
   */
  private montarTypeConfig(_type: FieldType, options: string[] | null): Prisma.InputJsonValue {
    if (options) {
      const opcoes: OpcaoSelecao[] = options.map((label, i) => ({
        id: randomUUID(),
        label,
        position: i + 1,
      }));
      // O `InputJsonValue` do Prisma exige index signature em objetos; um objeto literal serializável é
      // seguro aqui (só strings/números). O cast documenta que o conteúdo é JSON puro, sem `undefined`.
      return { options: opcoes } as unknown as Prisma.InputJsonValue;
    }
    return {};
  }
}
