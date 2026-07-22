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
import { exigirGerenciarPipe, resolverPoderNoPipe } from '../pipe-authz';
import {
  ConfiguracaoInvalidaError,
  type ConfiguracaoValidada,
  LIMITE_NOME,
  validarConfiguracao,
} from './automation-config';
import { revalidarReferencias } from './automation-references';
import {
  EventoForaDoCatalogoError,
  exigirEventoNoCatalogo,
} from '../../domain-events/event-catalog';
import {
  CondicaoForaDoCatalogoError,
  exigirCondicoesNoCatalogo,
} from './conditions/condition-catalog';
import { type AcaoCiclo, planejarTransicao } from './automation-lifecycle.transitions';
import { calcularRevisaoAutomacao, montarSnapshotAutomacao } from './automation-snapshot';
import {
  type AutomationVisao,
  isConflitoDeEscrita,
  SELECT_AUTOMATION,
} from './automations.service';

type Db = ReturnType<typeof withTenantContext>;
type Principal = { accountId: string; papel: string };

/**
 * A guarda otimista (`updateMany where state=<lido>`) não casou: outra transição venceu a corrida entre a
 * leitura e a escrita. É lançada DENTRO da transação interativa de propósito — para fazer ROLLBACK de uma
 * versão que já tenha sido congelada nesta mesma tx (sem ela, um `return null` comitaria a versão órfã). O
 * desfecho (idempotente ou 409) é decidido FORA da tx, por releitura.
 */
class CorridaPerdida extends Error {}

/** Metadados de uma versão congelada (sem o snapshot integral). */
export interface VersaoResumo {
  version: number;
  revision: string;
  configSchemaVersion: number;
  createdAt: Date;
  actorId: string | null;
}

/** Uma versão com o snapshot integral (para inspecionar a config congelada). */
export interface VersaoDetalhe extends VersaoResumo {
  snapshot: Prisma.JsonValue;
}

const SELECT_VERSAO_RESUMO = {
  version: true,
  revision: true,
  configSchemaVersion: true,
  createdAt: true,
  actorId: true,
} as const;

/** Patch de edição da configuração — todos opcionais; o que vier sobrescreve, o resto é preservado. */
export interface EditarAutomacaoPatch {
  name?: string;
  quando?: unknown;
  condicoes?: unknown;
  entao?: unknown;
}

/**
 * Gestão do ciclo de vida da Automação (Story 4.2). ESTENDE o modelo `Automation` (4.1): editar a config,
 * ativar/desativar/arquivar/restaurar e duplicar — mais o VERSIONAMENTO por snapshot (`AutomationVersion`).
 *
 * **Autorização:** gerenciar Automação é "config do Pipe" (`exigirGerenciarPipe` — Admin da Org / Admin do
 * Pipe; Membro só lê → 403; sem acesso → 404 não-enumerante; GUEST barrado pelo teto do PipeGrant). Ler
 * versões exige apenas algum poder no Pipe (`resolverPoderNoPipe`). Guard/`ability.ts` intocados (C3).
 *
 * **Atomicidade:** cada transição/edição vive numa transação interativa no client RAIZ com contexto
 * transaction-local (`definirContextoOrg`), como 2.6/2.11 — a mudança de estado/config e o congelamento da
 * versão são uma unidade; a auditoria (FR-214) é emitida à mão, pois este caminho não passa pela extensão.
 *
 * **Concorrência:** guarda otimista — o `updateMany` só aplica se o estado AINDA é o lido
 * (`where: { state: <lido> }`); número de versão duplicado colide no `UNIQUE` → rollback → 409. P2002/P2028
 * → 409, nunca 500, nunca lost update silencioso.
 *
 * **Snapshot (D-4.2-B):** ativar e editar-enquanto-ativa CONGELAM a config vigente numa `AutomationVersion`
 * imutável e avançam `Automation.activeVersion` — twin de `FormVersion`/`Form.publishedVersion` (2.6). O
 * motor (4.6) só avalia ACTIVE e captura `activeVersion`: rascunho e versão nunca se misturam numa Execução.
 */
@Injectable()
export class AutomationLifecycleService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db(): { contexto: ContextoOrganizacional; principal: Principal; db: Db } {
    const contexto = this.requestContext.obter();
    return {
      contexto,
      principal: { accountId: contexto.accountId, papel: contexto.papel },
      db: withTenantContext(this.prisma, contexto, this.logger),
    };
  }

  // ── Edição ────────────────────────────────────────────────────────────────────────────────────

  /**
   * Edita a configuração da Automação. Sob `INACTIVE` só reescreve o rascunho; sob `ACTIVE` também CONGELA
   * uma nova versão e avança `activeVersion` (D4.3: "salvar cria nova versão/snapshot; novas avaliações
   * usam a nova versão"). Sob `ARCHIVED` → **409** `AUTOMACAO_ARQUIVADA` (restaure antes — D-4.2-E). 404
   * sem acesso/inexistente; 403 se só lê; 400 se a config (estrutura ou referências) é inválida.
   */
  async editar(
    pipeId: string,
    automationId: string,
    patch: EditarAutomacaoPatch,
  ): Promise<AutomationVisao> {
    const { contexto, principal, db } = this.db();
    await exigirGerenciarPipe(db, principal, pipeId);

    const a = await db.automation.findFirst({
      where: { id: automationId, pipeId },
      select: { id: true, state: true, name: true, quando: true, condicoes: true, entao: true },
    });
    if (!a) throw new NotFoundException();
    if (a.state === 'ARCHIVED') throw new ConflictException({ motivo: 'AUTOMACAO_ARQUIVADA' });

    // Merge: o campo omitido preserva o valor atual; o presente sobrescreve. Depois valida o conjunto.
    const validada = this.validar({
      quando: patch.quando ?? a.quando,
      condicoes: patch.condicoes ?? a.condicoes,
      entao: patch.entao ?? a.entao,
    });
    await revalidarReferencias(db, pipeId, validada);
    const novoNome = patch.name ?? a.name;

    let resultado: { visao: AutomationVisao; criouVersao: boolean };
    try {
      resultado = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        // Relê o estado DENTRO da tx (race-safety): editar e transicionar podem correr em paralelo.
        const atual = await tx.automation.findUnique({
          where: { id: automationId },
          select: { state: true },
        });
        if (!atual) throw new NotFoundException();
        if (atual.state === 'ARCHIVED') {
          throw new ConflictException({ motivo: 'AUTOMACAO_ARQUIVADA' });
        }

        // Sob ACTIVE, congela a nova versão e avança o ponteiro (novas avaliações usam a nova).
        const novaVersao =
          atual.state === 'ACTIVE'
            ? await this.congelarVersao(tx, contexto, automationId, validada)
            : null;

        const { count } = await tx.automation.updateMany({
          where: { id: automationId, state: atual.state }, // guarda otimista pelo estado lido
          data: {
            name: novoNome,
            quando: validada.quando as object,
            condicoes: validada.condicoes as object[],
            entao: validada.entao as object[],
            configSchemaVersion: validada.schemaVersion,
            ...(novaVersao !== null ? { activeVersion: novaVersao } : {}),
          },
        });
        if (count === 0) throw new CorridaPerdida(); // rollback da versão eventualmente congelada

        const visao = await tx.automation.findUniqueOrThrow({
          where: { id: automationId },
          select: SELECT_AUTOMATION,
        });
        return { visao, criouVersao: novaVersao !== null };
      });
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ConflictException) throw err;
      if (err instanceof CorridaPerdida || isConflitoDeEscrita(err)) {
        throw new ConflictException('edição concorrente; recarregue e tente de novo');
      }
      throw err;
    }

    // Auditoria (FR-214) DEPOIS do commit — a tx raiz não passa pela extensão que auto-audita.
    this.auditar(contexto, 'update', 'Automation');
    if (resultado.criouVersao) this.auditar(contexto, 'create', 'AutomationVersion');
    return resultado.visao;
  }

  // ── Transições de estado ───────────────────────────────────────────────────────────────────────

  ativar(pipeId: string, automationId: string): Promise<AutomationVisao> {
    return this.transicionar(pipeId, automationId, 'ativar');
  }
  desativar(pipeId: string, automationId: string): Promise<AutomationVisao> {
    return this.transicionar(pipeId, automationId, 'desativar');
  }
  arquivar(pipeId: string, automationId: string): Promise<AutomationVisao> {
    return this.transicionar(pipeId, automationId, 'arquivar');
  }
  restaurar(pipeId: string, automationId: string): Promise<AutomationVisao> {
    return this.transicionar(pipeId, automationId, 'restaurar');
  }

  /**
   * Aplica uma transição de ciclo de vida. 404 sem acesso/inexistente; 403 se só lê; **409** se a transição
   * é inválida a partir do estado atual (ex.: ativar um arquivado) ou se uma transição concorrente venceu a
   * corrida. Idempotente: pedir o estado em que já se está devolve a Automação sem novo evento e sem versão.
   * **`ativar` revalida referências fail-closed** (AC-4/4.1: referência inacessível na ativação → 400).
   */
  private async transicionar(
    pipeId: string,
    automationId: string,
    acao: AcaoCiclo,
  ): Promise<AutomationVisao> {
    const { contexto, principal, db } = this.db();
    await exigirGerenciarPipe(db, principal, pipeId);

    const a = await db.automation.findFirst({
      where: { id: automationId, pipeId },
      select: {
        id: true,
        state: true,
        quando: true,
        condicoes: true,
        entao: true,
      },
    });
    if (!a) throw new NotFoundException();

    const plano = planejarTransicao(acao, a.state);
    if (plano.tipo === 'idempotente') {
      return db.automation.findFirstOrThrow({
        where: { id: automationId, pipeId },
        select: SELECT_AUTOMATION,
      });
    }
    if (plano.tipo === 'invalido') throw new ConflictException({ motivo: plano.motivo });

    const { transicao } = plano;

    // Ativar CONGELA a config vigente — e antes disso a revalida FAIL-CLOSED (estrutura + referências): uma
    // referência que ficou inacessível (Fase/Registro arquivado ou removido) bloqueia a ativação (400).
    let validada: ConfiguracaoValidada | null = null;
    if (transicao.criaVersao) {
      validada = this.validar({ quando: a.quando, condicoes: a.condicoes, entao: a.entao });
      await revalidarReferencias(db, pipeId, validada);
    }

    let resultado: { visao: AutomationVisao; criouVersao: boolean };
    try {
      resultado = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        const novaVersao =
          transicao.criaVersao && validada
            ? await this.congelarVersao(tx, contexto, automationId, validada)
            : null;

        const { count } = await tx.automation.updateMany({
          where: { id: automationId, state: a.state }, // guarda otimista pelo estado lido
          data: {
            state: transicao.target,
            ...(novaVersao !== null ? { activeVersion: novaVersao } : {}),
          },
        });
        if (count === 0) throw new CorridaPerdida(); // rollback da versão eventualmente congelada

        const visao = await tx.automation.findUniqueOrThrow({
          where: { id: automationId },
          select: SELECT_AUTOMATION,
        });
        return { visao, criouVersao: novaVersao !== null };
      });
    } catch (err) {
      if (err instanceof CorridaPerdida) {
        // Corrida perdida. Se o estado atual já é o alvo, foi idempotente; senão, divergência real → 409.
        const agora = await db.automation.findFirst({
          where: { id: automationId, pipeId },
          select: SELECT_AUTOMATION,
        });
        if (agora && agora.state === transicao.target) return agora;
        throw new ConflictException('o estado mudou concorrentemente; reconsulte e repita');
      }
      if (isConflitoDeEscrita(err)) {
        throw new ConflictException('transição concorrente em andamento; reconsulte e repita');
      }
      throw err;
    }

    // Auditoria (FR-214) DEPOIS do commit — a tx raiz não passa pela extensão que auto-audita.
    this.auditar(contexto, 'update', 'Automation');
    if (resultado.criouVersao) this.auditar(contexto, 'create', 'AutomationVersion');
    return resultado.visao;
  }

  // ── Duplicação ─────────────────────────────────────────────────────────────────────────────────

  /**
   * Duplica uma Automação: NOVA identidade no MESMO Pipe, nome editável, copia **só a configuração** (sem
   * versões, sem estado ativo), nasce `INACTIVE` e **revalida referências** fail-closed (D4.3). Idempotência
   * opcional por `idempotencyKey` (retry devolve a cópia existente). 404 sem acesso/inexistente; 403 se só
   * lê; 409 se o Pipe está arquivado (autz resolve poder, não estado, como a `criar`).
   */
  async duplicar(
    pipeId: string,
    automationId: string,
    nome?: string,
    idempotencyKey?: string,
  ): Promise<AutomationVisao> {
    const { contexto, principal, db } = this.db();
    await exigirGerenciarPipe(db, principal, pipeId);

    const src = await db.automation.findFirst({
      where: { id: automationId, pipeId },
      select: { name: true, quando: true, condicoes: true, entao: true },
    });
    if (!src) throw new NotFoundException();

    const pipe = await db.pipe.findUnique({ where: { id: pipeId }, select: { state: true } });
    if (pipe?.state === 'ARCHIVED') throw new ConflictException({ motivo: 'PIPE_ARQUIVADO' });

    // Nome: o informado (já validado no DTO) ou "Cópia de <nome>", truncado ao limite do catálogo.
    const novoNome = (nome ?? `Cópia de ${src.name}`).slice(0, LIMITE_NOME).trim() || 'Cópia';

    // Revalida a config copiada (estrutura + referências): "revalida referências/permissões/recursos".
    const validada = this.validar({
      quando: src.quando,
      condicoes: src.condicoes,
      entao: src.entao,
    });
    await revalidarReferencias(db, pipeId, validada);

    let nova: AutomationVisao;
    try {
      nova = await db.automation.create({
        data: {
          orgId: contexto.orgId,
          pipeId,
          name: novoNome,
          // Nasce INACTIVE (default), sem `activeVersion` e sem versões: só a config foi copiada.
          configSchemaVersion: validada.schemaVersion,
          quando: validada.quando as object,
          condicoes: validada.condicoes as object[],
          entao: validada.entao as object[],
          idempotencyKey: idempotencyKey ?? null,
        },
        select: SELECT_AUTOMATION,
      });
    } catch (err) {
      if (idempotencyKey !== undefined && isConflitoDeEscrita(err)) {
        const existente = await db.automation.findFirst({
          where: { pipeId, idempotencyKey },
          select: SELECT_AUTOMATION,
        });
        if (existente) return existente;
        throw new ConflictException('duplicação concorrente; recarregue e tente de novo');
      }
      throw err;
    }

    this.logger.info(
      { automationId: nova.id, origem: automationId, pipeId, state: nova.state },
      'automação duplicada',
    );
    return nova;
  }

  // ── Leitura de versões ──────────────────────────────────────────────────────────────────────────

  /** Histórico de versões congeladas (metadados; sem o snapshot). Exige ao menos leitura do Pipe. */
  async listarVersoes(pipeId: string, automationId: string): Promise<VersaoResumo[]> {
    const { principal, db } = this.db();
    await resolverPoderNoPipe(db, principal, pipeId);
    await this.exigirAutomacaoDoPipe(db, pipeId, automationId);

    return db.automationVersion.findMany({
      where: { automationId },
      select: SELECT_VERSAO_RESUMO,
      orderBy: { version: 'asc' },
    });
  }

  /** Snapshot integral de UMA versão. Exige leitura do Pipe; 404 se a versão não existe. */
  async obterVersao(pipeId: string, automationId: string, version: number): Promise<VersaoDetalhe> {
    const { principal, db } = this.db();
    await resolverPoderNoPipe(db, principal, pipeId);
    await this.exigirAutomacaoDoPipe(db, pipeId, automationId);

    const versao = await db.automationVersion.findFirst({
      where: { automationId, version },
      select: { ...SELECT_VERSAO_RESUMO, snapshot: true },
    });
    if (!versao) throw new NotFoundException();
    return versao;
  }

  // ── Internos ─────────────────────────────────────────────────────────────────────────────────

  /**
   * Congela a config validada numa `AutomationVersion` imutável, numerada monotonicamente por Automação
   * (`max+1`). Sob concorrência, o `UNIQUE(orgId, automationId, version)` barra o número duplicado (P2002)
   * → a transação inteira faz rollback → 409. Roda DENTRO da tx interativa (client raiz, contexto local).
   */
  private async congelarVersao(
    tx: Prisma.TransactionClient,
    contexto: ContextoOrganizacional,
    automationId: string,
    config: ConfiguracaoValidada,
  ): Promise<number> {
    const ultimo = await tx.automationVersion.findFirst({
      where: { automationId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (ultimo?.version ?? 0) + 1;
    const snapshot = montarSnapshotAutomacao(config);
    const revision = calcularRevisaoAutomacao(snapshot);

    await tx.automationVersion.create({
      data: {
        orgId: contexto.orgId,
        automationId,
        version,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        revision,
        configSchemaVersion: config.schemaVersion,
        actorId: contexto.accountId ?? null,
      },
    });
    return version;
  }

  /** Garante que a Automação pertence a ESTE Pipe (uma de outro Pipe não é alcançável por esta rota). */
  private async exigirAutomacaoDoPipe(db: Db, pipeId: string, automationId: string): Promise<void> {
    const a = await db.automation.findFirst({
      where: { id: automationId, pipeId },
      select: { id: true },
    });
    if (!a) throw new NotFoundException();
  }

  /**
   * Traduz a falha do núcleo puro em 400 sanitizado — motivo estrutural, sem eco do payload. Impõe também o
   * CATÁLOGO de Eventos (Story 4.3, CA1) e o CATÁLOGO de Condições (Story 4.4): editar/duplicar/ativar com
   * `quando.tipo` ou uma Condição fora do catálogo → 400. Como criar já rejeita config inválida, a
   * re-validação na ativação de uma Automação existente sempre passa (o tipo dela já é do catálogo); a
   * revalidação na ATIVAÇÃO fecha o fail-closed do §1362 quando uma referência ficou inalcançável (via
   * `revalidarReferencias`), enquanto o catálogo garante o VOCABULÁRIO.
   */
  private validar(config: {
    quando: unknown;
    condicoes?: unknown;
    entao: unknown;
  }): ConfiguracaoValidada {
    try {
      const validada = validarConfiguracao(config);
      exigirEventoNoCatalogo(validada.quando.tipo);
      exigirCondicoesNoCatalogo(validada.condicoes);
      return validada;
    } catch (erro) {
      if (erro instanceof ConfiguracaoInvalidaError) {
        throw new BadRequestException({ motivo: 'CONFIGURACAO_INVALIDA', detalhe: erro.motivo });
      }
      if (erro instanceof EventoForaDoCatalogoError) {
        throw new BadRequestException({ motivo: 'EVENTO_FORA_DO_CATALOGO', detalhe: erro.motivo });
      }
      if (erro instanceof CondicaoForaDoCatalogoError) {
        throw new BadRequestException({
          motivo: 'CONDICAO_FORA_DO_CATALOGO',
          detalhe: erro.motivo,
        });
      }
      throw erro;
    }
  }

  /** Auditoria manual (FR-214) — a tx raiz não passa pela extensão. Só metadados; nunca a configuração. */
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
