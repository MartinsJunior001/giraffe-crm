import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { withTenantContext } from '../../kernel/db/tenant-context';
import { exigirGerenciarPipe, resolverPoderNoPipe } from '../pipe-authz';
import {
  ConfiguracaoInvalidaError,
  type ConfiguracaoValidada,
  extrairReferencias,
  type TipoDeReferencia,
  validarConfiguracao,
} from './automation-config';

/**
 * O que uma Automação expõe pela API interna. `orgId` NÃO sai — fronteira interna, não dado de
 * apresentação; quem lê já está no escopo da própria Organização.
 */
export interface AutomationVisao {
  id: string;
  pipeId: string;
  name: string;
  state: 'INACTIVE' | 'ACTIVE' | 'ARCHIVED';
  quando: unknown;
  condicoes: unknown;
  entao: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/** Projeção de toda leitura/escrita — mantém `orgId` fora do payload por construção. */
const SELECT_AUTOMATION = {
  id: true,
  pipeId: true,
  name: true,
  state: true,
  quando: true,
  condicoes: true,
  entao: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Resumo para LISTA: sem a configuração. Ver §"listar". */
const SELECT_AUTOMATION_RESUMO = {
  id: true,
  pipeId: true,
  name: true,
  state: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type AutomationResumoVisao = Omit<AutomationVisao, 'quando' | 'condicoes' | 'entao'>;

/**
 * Modelo da Automação e seu vínculo ao Pipe (Story 4.1 — FR-21, RN-100/101, D4.1).
 *
 * TODA query passa por `withTenantContext`: o isolamento é do banco (RLS), não desta camada — não há um
 * único `where orgId` manual. O `orgId` vem do contexto resolvido no servidor, nunca do cliente.
 *
 * **Esta Story CRIA e LÊ — não edita e não transiciona estado.** Não é uma omissão de código: o runtime
 * não tem GRANT de `UPDATE` em `Automation` (a 4.2 o abrirá com o seu consumidor e o seu teste). Uma
 * rota de edição acrescentada por engano aqui bateria em `permission denied` no banco.
 *
 * **Autorização (D4.3):** administram o ciclo de vida o **Admin da Organização** e o **Admin do Pipe**;
 * o **Membro do Pipe** tem acesso **somente leitura** à configuração; o **Convidado não acessa**. Isso é
 * exatamente `exigirGerenciarPipe` (escrita) × `resolverPoderNoPipe` (leitura) — o helper compartilhado
 * de `pipe-authz.ts` (DBT-AUTHZ-01), sem tocar o guard/`ability.ts` (C3 congelado).
 */
@Injectable()
export class AutomationsService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db() {
    const contexto = this.requestContext.obter();
    return {
      contexto,
      principal: { accountId: contexto.accountId, papel: contexto.papel },
      db: withTenantContext(this.prisma, contexto, this.logger),
    };
  }

  /**
   * Cria uma Automação ligada a EXATAMENTE UM Pipe (RN-100), sempre `INACTIVE` (D4.3).
   *
   * Ordem deliberada das checagens:
   *
   *   1. **autorização** (`exigirGerenciarPipe`) — que já resolve "o Pipe existe e é alcançável nesta
   *      Organização"; sem acesso ⇒ **404 não-enumerante**, sem revelar que o Pipe existe;
   *   2. **estado** do Pipe — autorização resolve PODER, não ESTADO; Pipe arquivado ⇒ **409**;
   *   3. **configuração** — núcleo puro, fail-closed ⇒ **400**.
   *
   * A validação vem DEPOIS da autorização de propósito: responder 400 a quem sequer alcança o Pipe
   * confirmaria a existência dele pelo formato do erro.
   *
   * O `pipeId` cross-tenant já foi barrado no passo 1 (a releitura acontece sob RLS). Mas essa releitura
   * **não é a garantia** — é a fonte do 404. A garantia é a **FK composta** `(orgId, pipeId) →
   * Pipe(orgId, id)` (F-A1): mesmo que este método fosse contornado, o banco recusaria o par.
   */
  async criar(
    pipeId: string,
    name: string,
    config: { quando: unknown; condicoes?: unknown; entao: unknown },
  ): Promise<AutomationVisao> {
    const { contexto, principal, db } = this.db();

    await exigirGerenciarPipe(db, principal, pipeId);

    const pipe = await db.pipe.findUnique({ where: { id: pipeId }, select: { state: true } });
    // `exigirGerenciarPipe` já garantiu a existência sob RLS; a releitura aqui é do ESTADO.
    if (pipe?.state === 'ARCHIVED') {
      throw new ConflictException({ motivo: 'PIPE_ARQUIVADO' });
    }

    const validada = this.validar(config);
    await this.revalidarReferencias(db, pipeId, validada);

    const criada = await db.automation.create({
      data: {
        orgId: contexto.orgId,
        pipeId,
        name,
        // `state` não é aceito do cliente: nasce INACTIVE pelo default da coluna (D4.3).
        // `configSchemaVersion` idem: carimbado pelo servidor via o núcleo puro.
        configSchemaVersion: validada.schemaVersion,
        quando: validada.quando as object,
        condicoes: validada.condicoes as object[],
        entao: validada.entao as object[],
      },
      select: SELECT_AUTOMATION,
    });

    // Log sem a configuração: `quando`/`condicoes`/`entao` podem carregar valores de Campo (possível
    // PII), pelo mesmo critério que mantém `valores` fora da lista do Kanban (NFR-1/8/16).
    this.logger.info({ automationId: criada.id, pipeId, state: criada.state }, 'automação criada');

    return criada;
  }

  /**
   * Automações de um Pipe. Leitura exige apenas **algum** poder no Pipe — ler ≠ administrar (D4.3:
   * "Membro do Pipe: acesso somente leitura à configuração"). Sem acesso ⇒ **404 não-enumerante**.
   *
   * A lista **não devolve a configuração**, só o resumo. Mesmo critério do Kanban (2.9): o que pode
   * conter PII fica no detalhe, nunca na listagem.
   */
  async listar(pipeId: string): Promise<AutomationResumoVisao[]> {
    const { principal, db } = this.db();
    await resolverPoderNoPipe(db, principal, pipeId);

    return db.automation.findMany({
      where: { pipeId },
      select: SELECT_AUTOMATION_RESUMO,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Detalhe de uma Automação, com a configuração. Mesma regra de leitura da lista. */
  async obter(pipeId: string, automationId: string): Promise<AutomationVisao> {
    const { principal, db } = this.db();
    await resolverPoderNoPipe(db, principal, pipeId);

    // `findFirst` com o `pipeId` no filtro: uma Automação de OUTRO Pipe da mesma Organização não pode
    // ser lida pela rota deste Pipe (o poder foi resolvido para ESTE Pipe, não para aquele).
    const automacao = await db.automation.findFirst({
      where: { id: automationId, pipeId },
      select: SELECT_AUTOMATION,
    });
    if (!automacao) throw new NotFoundException();
    return automacao;
  }

  /**
   * Relê TODA referência da configuração **sob RLS**, antes de persistir. Fail-closed: o que não for
   * encontrado invalida a configuração (400).
   *
   * Por que isto é necessário mesmo com a FK composta: a FK cobre o **Pipe proprietário** (F-A1), mas as
   * referências vivem dentro do JSON, onde **não há FK alguma**. Sem esta releitura, um `Field.id` ou um
   * `Record.id` de OUTRA Organização seria persistido tal e qual — e só falharia (ou pior, resolveria)
   * quando o motor da 4.6 fosse executá-lo. "Referência inválida/inacessível ⇒ configuração inválida em
   * modo fail-closed" é critério de aceite da própria Story.
   *
   * A releitura acontece sob `withTenantContext`: a policy é quem responde "não existe" para um ID de
   * outra Organização — não há `where orgId` manual aqui, e não há como o serviço esquecer o filtro.
   *
   * **Alvo determinístico, nunca busca em massa:** cada referência é resolvida por `id` exato
   * (`findUnique`/`findFirst` com o `id`), jamais por varredura ou filtro amplo — "não é permitido
   * pesquisar e atualizar indiscriminadamente vários Registros" (escopo da Story).
   *
   * Referências ao PIPE só podem apontar para o Pipe proprietário: uma Automação alcança "apenas Cards do
   * Pipe proprietário", então referenciar outro Pipe é incoerente por definição, ainda que da mesma Org.
   */
  private async revalidarReferencias(
    db: ReturnType<typeof withTenantContext>,
    pipeId: string,
    config: ConfiguracaoValidada,
  ): Promise<void> {
    // Agrupa por TIPO e resolve cada tipo em UMA query (`id: { in: [...] }`).
    //
    // A alternativa ingênua — uma query por referência — é um amplificador de carga: o núcleo permite
    // até `LIMITE_REFS_TOTAL` referências, e um payload barato de escrever viraria centenas de idas ao
    // banco por requisição (NFR-4). Aqui o custo é limitado ao número de TIPOS, que é fixo.
    const porTipo = new Map<TipoDeReferencia, Set<string>>();
    for (const ref of extrairReferencias(config)) {
      const ids = porTipo.get(ref.tipo) ?? new Set<string>();
      ids.add(ref.id); // `Set`: a mesma referência repetida não vira trabalho repetido.
      porTipo.set(ref.tipo, ids);
    }

    for (const [tipo, ids] of porTipo) {
      const encontrados = await this.idsAlcancaveis(db, pipeId, tipo, [...ids]);
      if (encontrados.size !== ids.size) {
        // Sanitizado: diz o TIPO e que é inalcançável, sem revelar QUAL id faltou nem confirmar se o
        // recurso existe noutra Organização — a resposta não pode virar oráculo de existência.
        throw new BadRequestException({ motivo: 'REFERENCIA_INALCANCAVEL', tipo });
      }
    }
  }

  /** Quais dos `ids` daquele tipo são alcançáveis nesta Organização (e, quando cabe, neste Pipe). */
  private async idsAlcancaveis(
    db: ReturnType<typeof withTenantContext>,
    pipeId: string,
    tipo: TipoDeReferencia,
    ids: string[],
  ): Promise<Set<string>> {
    const colher = (linhas: { id: string }[]): Set<string> => new Set(linhas.map((l) => l.id));

    switch (tipo) {
      case 'PIPE':
        // Só o Pipe proprietário — ver docstring de `revalidarReferencias`.
        return new Set(ids.filter((id) => id === pipeId));
      case 'PHASE':
        // A Fase precisa ser do Pipe proprietário: uma Automação não alcança Fases de outro Pipe.
        return colher(
          await db.phase.findMany({ where: { id: { in: ids }, pipeId }, select: { id: true } }),
        );
      case 'FORM':
        return colher(await db.form.findMany({ where: { id: { in: ids } }, select: { id: true } }));
      case 'FIELD':
        return colher(
          await db.field.findMany({ where: { id: { in: ids } }, select: { id: true } }),
        );
      case 'DATABASE':
        return colher(
          await db.database.findMany({ where: { id: { in: ids } }, select: { id: true } }),
        );
      case 'RECORD':
        return colher(
          await db.record.findMany({ where: { id: { in: ids } }, select: { id: true } }),
        );
      default: {
        // Exaustividade verificada em COMPILAÇÃO: um tipo novo na allowlist sem tratamento aqui quebra
        // o build, em vez de silenciosamente passar a aceitar referência não validada.
        const _exaustivo: never = tipo;
        return _exaustivo;
      }
    }
  }

  /** Traduz a falha do núcleo puro em 400 sanitizado — motivo estrutural, sem eco do payload. */
  private validar(config: {
    quando: unknown;
    condicoes?: unknown;
    entao: unknown;
  }): ConfiguracaoValidada {
    try {
      return validarConfiguracao(config);
    } catch (erro) {
      if (erro instanceof ConfiguracaoInvalidaError) {
        throw new BadRequestException({ motivo: 'CONFIGURACAO_INVALIDA', detalhe: erro.motivo });
      }
      throw erro;
    }
  }
}
