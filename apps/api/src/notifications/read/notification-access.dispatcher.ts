import { withTenantContext } from '../../kernel/db/tenant-context';
import { exigirLerCard, resolverPoderNoPipe } from '../../pipes/pipe-authz';
import { exigirLerDatabase } from '../../databases/database-authz';

/**
 * Revalidação de ACESSO na leitura de Notificações (Story 5.4, §1571/§1574 — o AC3 que a 5.3 deixou; segurança
 * #1). Espelho do `file-authz/file-authz.dispatcher.ts`: roteia `(resourceType, resourceId)` para a guarda FINA
 * pura do recurso dono (DBT-AUTHZ-01), **deny-by-default** e **fail-closed**. Para cada Notificação
 * exibida/contada, revalida a autorização ATUAL de **LER** a origem; quem perdeu acesso tem a Notificação
 * **oculta** (fora da resposta e da contagem) — a Notificação **NUNCA concede acesso** e **não revela**
 * título/conteúdo/existência do recurso inacessível.
 *
 * **Funções puras** (não módulos Nest): importar `pipe-authz`/`database-authz` aqui **não cria ciclo de módulo**
 * (mesmo motivo do `file-authz.dispatcher`). Recebe um `db` já com contexto (`withTenantContext`) — a RLS isola
 * entre Organizações; aqui só se decide o poder DENTRO da Org do contexto.
 *
 * **Eficiência (performance #1) — sem N+1:** opera sobre a JANELA (bounded pela superfície/CAP). Para
 * TASK/SOLICITACAO/RECORD, o dono (`pipeId`/`databaseId`) é **batch-carregado** por `resourceType` (um
 * `findMany … where id in [...]`), e o poder por dono **DISTINTO** é resolvido **uma vez** e memoizado — N
 * Notificações do mesmo Pipe/Database custam UMA resolução. CARD é por-Card (composição de acesso: papel-de-Pipe
 * + `CardGrant` + `restritoAoProprio` + Responsável), mas ainda memoizado por `cardId` e bounded pela janela.
 */

type DbComContexto = ReturnType<typeof withTenantContext>;

/** Só o que a decisão consome do contexto: o principal e seu papel de Organização (idêntico a pipe/database-authz). */
export interface PrincipalAcesso {
  accountId: string;
  papel: string;
}

/** Uma Notificação a revalidar — só a referência-por-id (a projeção de conteúdo é do read-service). */
export interface ItemRevalidavel {
  notificationId: string;
  resourceType: string;
  resourceId: string | null;
}

const RESOURCE_CARD = 'CARD';
const RESOURCE_TASK = 'TASK';
const RESOURCE_SOLICITACAO = 'SOLICITACAO';
const RESOURCE_RECORD = 'RECORD';

/** Traduz uma guarda que LANÇA (404/403) em booleano fail-closed: qualquer negativa/erro ⇒ `false` (nega). */
async function tolerar(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
}

/**
 * Revalida o acesso de LEITURA de um conjunto de Notificações. Devolve `Map<notificationId, acessível>`.
 * `resourceId` nulo ⇒ **acessível** (não há recurso a revalidar — aviso de sistema; sem referência, nada a
 * vazar). `resourceType` desconhecido ⇒ **inacessível** (deny-by-default: não há dono conhecido).
 */
export async function revalidarAcessos(
  db: DbComContexto,
  principal: PrincipalAcesso,
  itens: readonly ItemRevalidavel[],
): Promise<Map<string, boolean>> {
  const resultado = new Map<string, boolean>();

  // Agrupa por resourceType para batch-load e memoização por dono.
  const cardIds = new Set<string>();
  const taskIds = new Set<string>();
  const solicitacaoIds = new Set<string>();
  const recordIds = new Set<string>();

  for (const it of itens) {
    if (it.resourceId === null) {
      resultado.set(it.notificationId, true); // sem recurso → nada a revalidar
      continue;
    }
    switch (it.resourceType) {
      case RESOURCE_CARD:
        cardIds.add(it.resourceId);
        break;
      case RESOURCE_TASK:
        taskIds.add(it.resourceId);
        break;
      case RESOURCE_SOLICITACAO:
        solicitacaoIds.add(it.resourceId);
        break;
      case RESOURCE_RECORD:
        recordIds.add(it.resourceId);
        break;
      default:
        // resourceType desconhecido: já resolvido como inacessível abaixo (não entra em nenhum batch).
        break;
    }
  }

  // Batch-load dos donos (um findMany por resourceType) → mapa recurso → dono. Recurso inexistente/cross-tenant
  // (RLS) simplesmente não aparece no mapa → inacessível (fail-closed).
  const [tasks, solicitacoes, records] = await Promise.all([
    taskIds.size
      ? db.task.findMany({
          where: { id: { in: [...taskIds] } },
          select: { id: true, pipeId: true },
        })
      : Promise.resolve([]),
    solicitacaoIds.size
      ? db.solicitacao.findMany({
          where: { id: { in: [...solicitacaoIds] } },
          select: { id: true, pipeId: true },
        })
      : Promise.resolve([]),
    recordIds.size
      ? db.record.findMany({
          where: { id: { in: [...recordIds] } },
          select: { id: true, databaseId: true },
        })
      : Promise.resolve([]),
  ]);
  const pipeDaTask = new Map(tasks.map((t) => [t.id, t.pipeId]));
  const pipeDaSolicitacao = new Map(solicitacoes.map((s) => [s.id, s.pipeId]));
  const dbDoRecord = new Map(records.map((r) => [r.id, r.databaseId]));

  // Memoização do poder por dono DISTINTO (uma resolução por Pipe/Database/Card, não por Notificação).
  const acessoPipe = new Map<string, boolean>();
  const acessoDatabase = new Map<string, boolean>();
  const acessoCard = new Map<string, boolean>();

  const podePipe = async (pipeId: string): Promise<boolean> => {
    const cache = acessoPipe.get(pipeId);
    if (cache !== undefined) return cache;
    const ok = await tolerar(() => resolverPoderNoPipe(db, principal, pipeId)); // qualquer poder = pode ler
    acessoPipe.set(pipeId, ok);
    return ok;
  };
  const podeDatabase = async (databaseId: string): Promise<boolean> => {
    const cache = acessoDatabase.get(databaseId);
    if (cache !== undefined) return cache;
    const ok = await tolerar(() => exigirLerDatabase(db, principal, databaseId));
    acessoDatabase.set(databaseId, ok);
    return ok;
  };
  const podeCard = async (cardId: string): Promise<boolean> => {
    const cache = acessoCard.get(cardId);
    if (cache !== undefined) return cache;
    const ok = await tolerar(() => exigirLerCard(db, principal, cardId));
    acessoCard.set(cardId, ok);
    return ok;
  };

  // Resolve cada item ainda pendente (os com `resourceId` nulo já foram resolvidos acima).
  for (const it of itens) {
    if (resultado.has(it.notificationId)) continue;
    const rid = it.resourceId as string; // não-nulo aqui (nulos já resolvidos)
    let acessivel = false;
    switch (it.resourceType) {
      case RESOURCE_CARD:
        acessivel = await podeCard(rid);
        break;
      case RESOURCE_TASK: {
        const pipeId = pipeDaTask.get(rid);
        acessivel = pipeId !== undefined && (await podePipe(pipeId));
        break;
      }
      case RESOURCE_SOLICITACAO: {
        const pipeId = pipeDaSolicitacao.get(rid);
        acessivel = pipeId !== undefined && (await podePipe(pipeId));
        break;
      }
      case RESOURCE_RECORD: {
        const databaseId = dbDoRecord.get(rid);
        acessivel = databaseId !== undefined && (await podeDatabase(databaseId));
        break;
      }
      default:
        acessivel = false; // deny-by-default
        break;
    }
    resultado.set(it.notificationId, acessivel);
  }

  return resultado;
}
