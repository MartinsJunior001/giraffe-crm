/**
 * Núcleo PURO do preflight de transição de Fase (Story 2.14) — derivado direto dos ACs e de RN-046, sem banco. É o
 * **contrato que a 2.14 produz** para 2.15 (Formulário de Fase como requisito de entrada/saída) e para E4/E5
 * (Automação/Notificação): elas ACRESCENTAM validadores compondo uma nova lista, **sem** reescrever o serviço de
 * movimentação. Ser puro é o que permite provar toda a matriz de regras em teste de unidade, sem PostgreSQL.
 *
 * **Sem abstração especulativa** (Constitution): não há registry/DI de plugins. Os validadores built-in da 2.14 são
 * os consumidores concretos; o ponto de extensão é a **composição de lista** (`[...VALIDADORES_PADRAO, novo]`). Um
 * validador que precise de I/O resolve o I/O ANTES, no serviço, e injeta o resultado já materializado no
 * `ContextoDeTransicao` (mantendo o núcleo puro).
 *
 * **Autorização NÃO é validador puro** (depende de I/O): entra como pré-condição do serviço (`exigirMoverCard`).
 */

/** Estados de ciclo de vida relevantes (espelha `CardLifecycleState`). Só ATIVO move (`Fase ≠ Status do Card`). */
export type EstadoCicloCard = 'ATIVO' | 'FINALIZADO' | 'ARQUIVADO';

/** Contexto imutável de uma tentativa de transição, montado pelo serviço a partir de dados lidos sob RLS. */
export interface ContextoDeTransicao {
  card: { id: string; lifecycleState: EstadoCicloCard; phaseId: string };
  faseOrigem: { id: string; pipeId: string; ativa: boolean };
  faseDestino: { id: string; pipeId: string; ativa: boolean };
  /** Confirmação humana explícita do request (D2/R2/D2.4) — sem contornar confirmação. */
  confirmado: boolean;
}

/** Motivo tipado de bloqueio — estável; a camada HTTP e 2.15/E4/E5 mapeiam a partir dele. */
export type MotivoBloqueio =
  | 'CICLO_NAO_ABERTO' // card.lifecycleState ≠ ATIVO
  | 'FASE_DESTINO_ARQUIVADA'
  | 'FASE_DESTINO_OUTRO_PIPE'
  | 'FASE_DESTINO_IGUAL_ORIGEM' // o serviço trata como no-op idempotente (200), não erro — ver D4
  | 'CONFIRMACAO_AUSENTE';

export type ResultadoPreflight = { ok: true } | { ok: false; motivo: MotivoBloqueio };

/** Um validador é uma função PURA. Ordenado e componível; devolve `ok` ou o primeiro bloqueio. */
export type ValidadorDeTransicao = (ctx: ContextoDeTransicao) => ResultadoPreflight;

const OK: ResultadoPreflight = { ok: true };

/** Só ciclo ATIVO move — FINALIZADO/ARQUIVADO precisam ser reabertos/restaurados antes (2.11). */
export const validarCicloAberto: ValidadorDeTransicao = (ctx) =>
  ctx.card.lifecycleState === 'ATIVO' ? OK : { ok: false, motivo: 'CICLO_NAO_ABERTO' };

/** A Fase destino precisa estar ATIVA — não se move para/de Fase arquivada (RN-046, epics §800). */
export const validarFaseDestinoAtiva: ValidadorDeTransicao = (ctx) =>
  ctx.faseDestino.ativa ? OK : { ok: false, motivo: 'FASE_DESTINO_ARQUIVADA' };

/** Nunca entre Pipes (RN-030/RN-046): destino deve pertencer ao MESMO Pipe da origem. */
export const validarMesmoPipe: ValidadorDeTransicao = (ctx) =>
  ctx.faseDestino.pipeId === ctx.faseOrigem.pipeId
    ? OK
    : { ok: false, motivo: 'FASE_DESTINO_OUTRO_PIPE' };

/** Destino ≠ origem. Mover para a mesma Fase é no-op idempotente (D4), decidido no serviço; aqui só sinaliza. */
export const validarDestinoDiferente: ValidadorDeTransicao = (ctx) =>
  ctx.faseDestino.id !== ctx.faseOrigem.id
    ? OK
    : { ok: false, motivo: 'FASE_DESTINO_IGUAL_ORIGEM' };

/** Confirmação humana explícita (D2/R2/D2.4). Ausência/`false` bloqueia — nunca se contorna a confirmação. */
export const validarConfirmacao: ValidadorDeTransicao = (ctx) =>
  ctx.confirmado === true ? OK : { ok: false, motivo: 'CONFIRMACAO_AUSENTE' };

/**
 * Lista PADRÃO da 2.14, na ordem de avaliação. A ordem coloca as regras de estado/estrutura antes da confirmação,
 * para que um bloqueio estrutural (ciclo/Fase/Pipe) prevaleça sobre a ausência de confirmação. 2.15/E4/E5 estendem
 * compondo `[...VALIDADORES_PADRAO, novoValidador]` — NÃO reescrevendo esta constante.
 */
export const VALIDADORES_PADRAO: readonly ValidadorDeTransicao[] = [
  validarCicloAberto,
  validarFaseDestinoAtiva,
  validarMesmoPipe,
  validarDestinoDiferente,
  validarConfirmacao,
];

/**
 * Aplica os validadores EM ORDEM e devolve o PRIMEIRO bloqueio (curto-circuito), ou `{ ok: true }` se todos passam.
 * Fail-closed por composição: qualquer bloqueio ⇒ o serviço não persiste nada (CA2).
 */
export function executarPreflight(
  ctx: ContextoDeTransicao,
  validadores: readonly ValidadorDeTransicao[] = VALIDADORES_PADRAO,
): ResultadoPreflight {
  for (const validar of validadores) {
    const r = validar(ctx);
    if (!r.ok) return r;
  }
  return OK;
}
