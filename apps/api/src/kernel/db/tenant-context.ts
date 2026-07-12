import { Prisma, PrismaClient } from '../../../generated/prisma';
import { isRlsDenial } from './rls-denial';

/** Contexto organizacional. Resolvido SEMPRE no servidor — nunca vem do cliente (AD-7). */
export interface TenantContext {
  /** Organização ativa. */
  orgId: string;
  /** Conta autenticada. Permite ler as próprias Memberships antes de haver Org ativa. */
  accountId?: string;
}

/**
 * Subconjunto mínimo do logger que a camada de banco usa. Depender da interface, e não do
 * Pino, é o que permite ao teste observar o que foi (e o que NÃO foi) registrado.
 */
export interface TenantLogger {
  debug(obj: object, msg: string): void;
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

/** Default silencioso: o log é opcional para quem chama, mas o gancho existe sempre. */
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

/** Entidades cujas mutações exigem trilha de auditoria (FR-214). */
const MODELOS_AUDITADOS = new Set(['Organization', 'Membership']);

/** Só mutações são auditadas — auditar leitura afogaria a trilha no ruído. */
const MUTACOES = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

interface ContextoOperacao {
  orgId?: string;
  accountId?: string;
  model?: string;
  operation: string;
}

/**
 * Emite o evento de auditoria com os seis campos exigidos pelo FR-214: ator, Organização,
 * ação, recurso, resultado e timestamp.
 *
 * É um evento estruturado, não uma tabela: nem o Spec nem o Plan pedem persistência, e uma
 * tabela de auditoria precisaria das suas próprias policies de RLS — escopo que ninguém
 * especificou. O `at` é explícito porque o campo faz parte do contrato, e não pode depender
 * de o transporte de log carimbar a hora.
 *
 * A TENTATIVA NEGADA também é auditada (`result: 'denied'`). Auditar só o que deu certo
 * deixaria de fora exatamente o acesso cruzado que se quer detectar.
 */
function auditar(
  logger: TenantLogger,
  ctx: ContextoOperacao,
  resultado: 'allowed' | 'denied',
): void {
  if (!ctx.model || !MODELOS_AUDITADOS.has(ctx.model) || !MUTACOES.has(ctx.operation)) return;

  logger.info(
    {
      event: 'audit',
      actor: ctx.accountId ?? null, // Sem sessão ainda (Story 1.4) ⇒ ator nulo, explicitamente.
      orgId: ctx.orgId ?? null,
      action: ctx.operation,
      resource: ctx.model,
      result: resultado,
      at: new Date().toISOString(),
    },
    'auditoria',
  );
}

/**
 * Registra a operação e, principalmente, a NEGAÇÃO.
 *
 * O que entra no log: Organização, modelo e operação — o suficiente para investigar uma
 * tentativa de acesso cruzado. O que NÃO entra: `args` (carregam PII, como `Account.email`)
 * e a string de conexão (carrega senha). O erro é relançado: registrar não é engolir.
 */
async function executarComLog<T>(
  logger: TenantLogger,
  contexto: ContextoOperacao,
  executar: () => Promise<T>,
): Promise<T> {
  try {
    const resultado = await executar();
    logger.debug({ ...contexto, event: 'db.query' }, 'consulta executada');
    auditar(logger, contexto, 'allowed');
    return resultado;
  } catch (err) {
    if (isRlsDenial(err)) {
      // Negação é falha HONESTA e visível. Silenciá-la esconderia justamente o evento
      // que mais interessa — alguém tentando alcançar dados de outra Organização.
      logger.warn({ ...contexto, event: 'rls.denied' }, 'acesso negado por RLS');
      auditar(logger, contexto, 'denied');
    }
    throw err;
  }
}

/**
 * Envolve o client de modo que TODA query rode dentro de uma transação onde o
 * contexto foi definido com `set_config(..., true)`.
 *
 * O `true` é o ponto crítico: torna o contexto **transaction-local**. Com `false`
 * ele persistiria na CONEXÃO, que volta ao pool — e a próxima requisição, de outra
 * Organização, herdaria o contexto da anterior. Esse é o vazamento clássico de RLS
 * com pool, e é silencioso.
 *
 * Sem contexto, `current_setting(..., true)` devolve NULL, as policies não casam e
 * o banco NEGA (deny-by-default). Não existe caminho de bypass — por decisão, não
 * por omissão: o exemplo oficial do Prisma sugere uma `bypass_rls_policy`, e o AD-6
 * a proíbe.
 */
export function withTenantContext(
  prisma: PrismaClient,
  ctx: TenantContext,
  logger: TenantLogger = semLog,
) {
  return prisma.$extends(
    Prisma.defineExtension({
      name: 'tenant-context',
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            return executarComLog(
              logger,
              { orgId: ctx.orgId, accountId: ctx.accountId, model, operation },
              async () => {
                const results = await prisma.$transaction([
                  prisma.$executeRaw`SELECT set_config('app.current_org_id', ${ctx.orgId}, true)`,
                  prisma.$executeRaw`SELECT set_config('app.current_account_id', ${ctx.accountId ?? ''}, true)`,
                  query(args),
                ]);
                // O resultado da query é o último item do lote.
                return results[results.length - 1];
              },
            );
          },
        },
      },
    }),
  );
}

/**
 * Contexto APENAS de conta, sem Organização ativa. É o caso do login (Story 1.4):
 * "a quais Organizações esta conta pertence?" é perguntado ANTES de existir Org ativa.
 *
 * Não afrouxa o isolamento: a policy de SELECT de Membership só libera as linhas
 * da PRÓPRIA conta, e toda escrita continua exigindo contexto de Organização.
 */
export function withAccountContext(
  prisma: PrismaClient,
  accountId: string,
  logger: TenantLogger = semLog,
) {
  return prisma.$extends(
    Prisma.defineExtension({
      name: 'account-context',
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            return executarComLog(logger, { accountId, model, operation }, async () => {
              const results = await prisma.$transaction([
                prisma.$executeRaw`SELECT set_config('app.current_account_id', ${accountId}, true)`,
                query(args),
              ]);
              return results[results.length - 1];
            });
          },
        },
      },
    }),
  );
}
