import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { type FieldType, Prisma } from '../../../generated/prisma';
import { RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { withTenantContext } from '../../kernel/db/tenant-context';
import { exigirGerenciarPipe } from '../pipe-authz';
import { type EditarCampoDTO } from './fields.dto';
import { type AlvoFormulario, acharForm, resolverContexto } from './form-locate';
import { type CampoVisao, SELECT_CAMPO } from './forms.service';
import {
  type Opcao,
  OpcaoNaoEncontradaError,
  TypeConfigInvalidoError,
  adicionarOpcao,
  arquivarOpcao,
  lerOpcoes,
  removerOpcao,
  renomearOpcao,
  reordenarOpcao,
  serializarOpcoes,
} from './option-config';

type Db = ReturnType<typeof withTenantContext>;

/** Tipos de Seleção — os únicos com ciclo de opções (senão 400). */
const TIPOS_SELECAO = new Set<FieldType>(['SELECT_SINGLE', 'SELECT_MULTI']);

/**
 * Evolução segura de Campos (Story 2.5) — editar, arquivar/restaurar e o ciclo de opções de Seleção. Irmão
 * do `FormsService` (2.4, montagem) no mesmo módulo: reusa a autorização fina (`pipe-authz`, "config do
 * Pipe") e os localizadores (`form-locate`), e faz TODA query por `withTenantContext` (isolamento é do banco).
 *
 * **Cada operação é UM único `update`/`updateMany`** — nada de transação multi-statement (recusada pela
 * extensão de contexto). As opções vivem no `typeConfig` JSON (Opção A, sem migration): ler → transformar em
 * memória (funções puras de `option-config`, que guardam os invariantes) → regravar o array inteiro num
 * `field.update`. A identidade da opção (`id`) é estável (AD-12); renomear nunca a altera.
 *
 * **Sem exclusão**: arquivar Campo é `state=ARCHIVED` (reversível); remover opção é UPDATE do `typeConfig`,
 * nunca DELETE de linha (o runtime não tem GRANT DELETE). Idempotência sem `updateMany` no caminho
 * já-no-estado (evita falso `denied` na auditoria — lição 2.1/2.3).
 */
@Injectable()
export class FieldsService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db() {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /**
   * Edita `label`/`help`/`defaultValue` de um Campo. **Não** toca `type` (imutável), `id`/`position`
   * (identidade/ordem) nem `typeConfig` cru (opções têm rotas próprias) — o DTO já recusou essas chaves.
   */
  async editarCampo(
    alvo: AlvoFormulario,
    fieldId: string,
    dto: EditarCampoDTO,
  ): Promise<CampoVisao> {
    const { db, form } = await this.exigirCampoGerenciavel(alvo, fieldId);

    const data: Prisma.FieldUpdateInput = {};
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.help !== undefined) data.help = dto.help; // string ou null (limpar)
    if (dto.defaultValue.tipo === 'limpar') data.defaultValue = Prisma.DbNull;
    else if (dto.defaultValue.tipo === 'definir') data.defaultValue = dto.defaultValue.valor;

    const { count } = await db.field.updateMany({ where: { id: fieldId, formId: form.id }, data });
    if (count === 0) throw new NotFoundException();
    return this.lerCampo(db, form.id, fieldId);
  }

  /** Arquiva o Campo (`ACTIVE→ARCHIVED`, `archivedAt` marcado). Idempotente sem falso `denied`. */
  async arquivarCampo(alvo: AlvoFormulario, fieldId: string): Promise<CampoVisao> {
    const { db, form, campo } = await this.exigirCampoGerenciavel(alvo, fieldId);
    if (campo.state === 'ARCHIVED') return this.lerCampo(db, form.id, fieldId); // já arquivado: no-op
    const { count } = await db.field.updateMany({
      where: { id: fieldId, formId: form.id, state: 'ACTIVE' },
      data: { state: 'ARCHIVED', archivedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException();
    return this.lerCampo(db, form.id, fieldId);
  }

  /** Restaura o Campo (`ARCHIVED→ACTIVE`, `archivedAt=null`) ao **final da ordem ativa**. Idempotente. */
  async restaurarCampo(alvo: AlvoFormulario, fieldId: string): Promise<CampoVisao> {
    const { db, form, campo } = await this.exigirCampoGerenciavel(alvo, fieldId);
    if (campo.state === 'ACTIVE') return this.lerCampo(db, form.id, fieldId); // já ativo: no-op
    const position = await this.proximaPosicao(db, form.id);
    const { count } = await db.field.updateMany({
      where: { id: fieldId, formId: form.id, state: 'ARCHIVED' },
      data: { state: 'ACTIVE', archivedAt: null, position },
    });
    if (count === 0) throw new NotFoundException();
    return this.lerCampo(db, form.id, fieldId);
  }

  // ── Ciclo de opções (só SELECT_SINGLE / SELECT_MULTI) ────────────────────────────────────────

  /** Adiciona uma opção ACTIVE ao final (id do servidor). */
  async adicionarOpcaoCampo(
    alvo: AlvoFormulario,
    fieldId: string,
    label: string,
  ): Promise<CampoVisao> {
    return this.transformarOpcoes(alvo, fieldId, (opcoes) => adicionarOpcao(opcoes, label));
  }

  /** Renomeia a opção — muda só o `label`; o `id` permanece (identidade estável). */
  async renomearOpcaoCampo(
    alvo: AlvoFormulario,
    fieldId: string,
    optionId: string,
    label: string,
  ): Promise<CampoVisao> {
    return this.transformarOpcoes(alvo, fieldId, (opcoes) =>
      renomearOpcao(opcoes, optionId, label),
    );
  }

  /** Recoloca a opção após `afterOptionId` (ou no início se `null`) e reindexa. */
  async reordenarOpcaoCampo(
    alvo: AlvoFormulario,
    fieldId: string,
    optionId: string,
    afterOptionId: string | null,
  ): Promise<CampoVisao> {
    return this.transformarOpcoes(alvo, fieldId, (opcoes) =>
      reordenarOpcao(opcoes, optionId, afterOptionId),
    );
  }

  /** Arquiva a opção (`state=ARCHIVED`, preserva `id`/`label`). */
  async arquivarOpcaoCampo(
    alvo: AlvoFormulario,
    fieldId: string,
    optionId: string,
  ): Promise<CampoVisao> {
    return this.transformarOpcoes(alvo, fieldId, (opcoes) => arquivarOpcao(opcoes, optionId));
  }

  /** Remove a opção do array (UPDATE do `typeConfig`, não DELETE de linha). */
  async removerOpcaoCampo(
    alvo: AlvoFormulario,
    fieldId: string,
    optionId: string,
  ): Promise<CampoVisao> {
    return this.transformarOpcoes(alvo, fieldId, (opcoes) => removerOpcao(opcoes, optionId));
  }

  // ── Internos ─────────────────────────────────────────────────────────────────────────────────

  /**
   * Aplica uma transformação pura sobre as opções de um Campo de Seleção e regrava o `typeConfig` inteiro
   * num único `field.update`. Traduz os erros do núcleo puro: opção inexistente → 404; config/opção inválida
   * (limite, id duplicado, malformado) → 400 sanitizado.
   */
  private async transformarOpcoes(
    alvo: AlvoFormulario,
    fieldId: string,
    transformar: (opcoes: Opcao[]) => Opcao[],
  ): Promise<CampoVisao> {
    const { db, form, campo } = await this.exigirCampoGerenciavel(alvo, fieldId);
    if (!TIPOS_SELECAO.has(campo.type)) {
      throw new BadRequestException('operação de opção só se aplica a Campos de Seleção');
    }
    let typeConfig: Prisma.InputJsonValue;
    try {
      typeConfig = serializarOpcoes(transformar(lerOpcoes(campo.typeConfig)));
    } catch (err) {
      if (err instanceof OpcaoNaoEncontradaError) throw new NotFoundException();
      if (err instanceof TypeConfigInvalidoError) throw new BadRequestException('opção inválida');
      throw err;
    }
    // Guarda otimista (invariante 12 — "atualização concorrente não perde alteração silenciosamente"):
    // o `typeConfig` LIDO é o token de versão. Ler → transformar em memória → regravar são passos
    // separados (cada operação é UMA transação de contexto; não há transação multi-statement). Sem esta
    // guarda, dois administradores editando as opções em paralelo se sobrescreveriam — o segundo `update`
    // partiria de uma leitura obsoleta e a alteração do primeiro seria perdida em silêncio. Com o `equals`
    // no `where`, se o `typeConfig` mudou desde a leitura o UPDATE atinge 0 linhas → 409 (falha alto),
    // não NotFoundException (o Campo existe; quem confirmou foi `exigirCampoGerenciavel`).
    const { count } = await db.field.updateMany({
      where: {
        id: fieldId,
        formId: form.id,
        typeConfig: { equals: campo.typeConfig as Prisma.InputJsonValue },
      },
      data: { typeConfig },
    });
    if (count === 0) {
      throw new ConflictException(
        'o Campo foi alterado concorrentemente; recarregue e tente de novo',
      );
    }
    return this.lerCampo(db, form.id, fieldId);
  }

  /**
   * Guarda comum: exige **gerenciar** o Pipe (403/404 — reusa `pipe-authz`), localiza o Formulário do
   * contexto (404 se não materializado — evoluir pressupõe Campo) e o Campo por `id` **confirmando o
   * `formId`** (404 não-enumerante se não é deste Formulário). Devolve `db`, `form` e o Campo (com `type`,
   * `typeConfig`, `state`).
   */
  private async exigirCampoGerenciavel(
    alvo: AlvoFormulario,
    fieldId: string,
  ): Promise<{
    db: Db;
    form: { id: string };
    campo: {
      id: string;
      formId: string;
      type: FieldType;
      typeConfig: Prisma.JsonValue;
      state: 'ACTIVE' | 'ARCHIVED';
    };
  }> {
    const { contexto, db } = this.db();
    await exigirGerenciarPipe(db, contexto, alvo.pipeId);
    const { context, owner } = await resolverContexto(db, alvo);
    const form = await acharForm(db, contexto.orgId, context, owner);
    if (!form) throw new NotFoundException();
    const campo = await db.field.findUnique({
      where: { id: fieldId },
      select: { id: true, formId: true, type: true, typeConfig: true, state: true },
    });
    if (!campo || campo.formId !== form.id) throw new NotFoundException();
    return { db, form, campo };
  }

  /** Lê um Campo com a projeção pública. 404 se não existe ou é de outro Formulário. */
  private async lerCampo(db: Db, formId: string, fieldId: string): Promise<CampoVisao> {
    const campo = await db.field.findUnique({ where: { id: fieldId }, select: SELECT_CAMPO });
    if (!campo || campo.formId !== formId) throw new NotFoundException();
    return campo;
  }

  /** Maior `position` entre os Campos ACTIVE + 1 (append ao final); 1 se não houver ativo. */
  private async proximaPosicao(db: Db, formId: string): Promise<Prisma.Decimal> {
    const ultimo = await db.field.findFirst({
      where: { formId, state: 'ACTIVE' },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return ultimo ? new Prisma.Decimal(ultimo.position).plus(1) : new Prisma.Decimal(1);
  }
}
