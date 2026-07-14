import { Prisma, PrismaClient } from '../../../generated/prisma';
import { isRegistroNaoEncontrado, isRlsDenial } from './rls-denial';

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

/** Entidades cujas mutações exigem trilha de auditoria (FR-214). */
const MODELOS_AUDITADOS = new Set([
  'Organization',
  'Membership',
  'Pipe',
  'PipeGrant',
  'Phase',
  'Form',
  'Field',
]);

/** Só mutações são auditadas — auditar leitura afogaria a trilha no ruído. */
const MUTACOES = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

/**
 * Mutações em lote: devolvem `{ count }` em vez de lançar quando nenhuma linha casa.
 * É por aqui que uma tentativa de acesso cruzado passa DESPERCEBIDA — ver `foiFiltrada`.
 */
const MUTACOES_EM_LOTE = new Set([
  'createMany',
  'createManyAndReturn',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
]);

interface ContextoOperacao {
  orgId?: string;
  accountId?: string;
  model?: string;
  operation: string;
}

/**
 * A mutação "deu certo" sem tocar em linha alguma?
 *
 * O `USING` de uma policy NÃO lança erro: ele FILTRA. Um `updateMany`/`deleteMany` mirando
 * outra Organização retorna `{ count: 0 }` com sucesso — e, sem esta checagem, a tentativa
 * mais óbvia de vandalismo cross-tenant era registrada como `result: 'allowed'`. Só o
 * `WITH CHECK` (INSERT) levanta exceção; era essa a minoria dos caminhos que a auditoria
 * enxergava.
 *
 * O que se paga por isso: um `updateMany` legítimo que não casa com nada também vira uma
 * linha `denied` na trilha. É a troca certa — o falso positivo custa uma linha de log; o
 * falso negativo custa uma tentativa de acesso cruzado invisível.
 */
function foiFiltrada(operation: string, resultado: unknown): boolean {
  if (!MUTACOES_EM_LOTE.has(operation)) return false;
  return (
    typeof resultado === 'object' &&
    resultado !== null &&
    (resultado as { count?: unknown }).count === 0
  );
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
 *
 * A RLS nega de TRÊS formas diferentes, e as três precisam aparecer na trilha:
 *   1. `WITH CHECK` violado (INSERT/UPDATE) ......... exceção 42501     → `rls.denied`
 *   2. `USING` filtrou em mutação de um registro .... exceção P2025     → `rls.denied`
 *   3. `USING` filtrou em mutação em lote ........... `{ count: 0 }`    → `rls.filtered`
 *
 * Só a primeira era detectada. As outras duas passavam por "sucesso".
 */
async function executarComLog<T>(
  logger: TenantLogger,
  contexto: ContextoOperacao,
  executar: () => Promise<T>,
): Promise<T> {
  try {
    const resultado = await executar();

    if (foiFiltrada(contexto.operation, resultado)) {
      logger.warn(
        { ...contexto, event: 'rls.filtered' },
        'mutação em lote não atingiu nenhuma linha — possível acesso cruzado filtrado por RLS',
      );
      auditar(logger, contexto, 'denied');
      return resultado;
    }

    logger.debug({ ...contexto, event: 'db.query' }, 'consulta executada');
    auditar(logger, contexto, 'allowed');
    return resultado;
  } catch (err) {
    if (isRlsDenial(err) || isRegistroNaoEncontrado(err)) {
      // Negação é falha HONESTA e visível. Silenciá-la esconderia justamente o evento
      // que mais interessa — alguém tentando alcançar dados de outra Organização.
      logger.warn({ ...contexto, event: 'rls.denied' }, 'acesso negado por RLS');
      auditar(logger, contexto, 'denied');
    }
    throw err;
  }
}

/**
 * Mensagem única do bloqueio de transação — ver `recusarTransacao`.
 */
const TRANSACAO_NAO_SUPORTADA =
  'withTenantContext/withAccountContext não suportam $transaction. ' +
  'A extensão define o contexto por operação, em uma transação própria; uma transação ' +
  'externa rodaria em OUTRA conexão, sem contexto — a operação seria negada ou, pior, ' +
  'perderia a atomicidade em silêncio. Transação com contexto organizacional é escopo da ' +
  'Story 1.3 (propagação de contexto), onde há consumidor real para desenhá-la.';

/**
 * Recusa `$transaction` no client estendido, em vez de deixá-la corromper o contexto.
 *
 * O gancho `$allOperations` não recebe o client da transação corrente: ele fecha sobre o
 * client RAIZ. Numa `$transaction` interativa, portanto, cada `tx.model.op()` dispararia uma
 * SEGUNDA transação, em outra conexão do pool — quebrando a atomicidade (a escrita commita
 * fora da transação externa) e podendo travar em deadlock contra os locks que a transação
 * externa já segura.
 *
 * Nada disso apareceria como erro. Por isso o caminho é FECHADO, não remendado: falhar alto
 * é honesto; suportar transação de verdade exige um desenho que só a Story 1.3 pode validar
 * contra um consumidor concreto — e a Constitution proíbe abstração especulativa.
 */
function recusarTransacao(): never {
  throw new Error(TRANSACAO_NAO_SUPORTADA);
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
 *
 * O `logger` é OBRIGATÓRIO. Já foi opcional, com um default silencioso — e um default
 * silencioso significa que o primeiro chamador que esquecesse o argumento perderia a
 * trilha de auditoria (FR-214) sem nenhum sinal. Um requisito de compliance não pode
 * depender de ninguém lembrar de um parâmetro.
 *
 * ATENÇÃO (fronteira para a Story 1.3): esta função NÃO verifica que `accountId` possui
 * Membership em `orgId`. Ela CONFIA no contexto que recebe. Quem resolve o contexto é
 * responsável por derivá-lo de uma Membership validada no servidor — nunca de algo que o
 * cliente enviou. A RLS impõe o isolamento ENTRE Organizações; ela não decide a qual
 * Organização o requisitante pertence.
 */
export function withTenantContext(prisma: PrismaClient, ctx: TenantContext, logger: TenantLogger) {
  return prisma
    .$extends(
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
    )
    .$extends(
      Prisma.defineExtension({
        name: 'no-transaction',
        client: { $transaction: recusarTransacao },
      }),
    );
}

/**
 * Contexto APENAS de conta, sem Organização ativa. É o caso do login (Story 1.4):
 * "a quais Organizações esta conta pertence?" é perguntado ANTES de existir Org ativa.
 *
 * Não afrouxa o isolamento: a policy de SELECT de Membership só libera as linhas
 * da PRÓPRIA conta — e apenas enquanto NÃO houver Organização no contexto. Havendo Org
 * ativa, ela é a única fronteira, e o ramo da conta deixa de valer. Toda escrita continua
 * exigindo contexto de Organização.
 */
export function withAccountContext(prisma: PrismaClient, accountId: string, logger: TenantLogger) {
  return prisma
    .$extends(
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
    )
    .$extends(
      Prisma.defineExtension({
        name: 'no-transaction',
        client: { $transaction: recusarTransacao },
      }),
    );
}
