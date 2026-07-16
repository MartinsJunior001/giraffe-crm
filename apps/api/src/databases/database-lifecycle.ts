import type { DatabaseState } from '../../generated/prisma';

/**
 * Núcleo PURO do ciclo de vida do Database (Story 3.1). Sem I/O, sem Nest, sem Prisma-client: só a
 * DECISÃO das transições e do gate de somente-leitura. O serviço aplica; aqui mora a regra, testável
 * em isolamento. Espelha `cards/lifecycle/card-lifecycle.transitions.ts` (E2), sem herdá-lo (entidades
 * distintas — Database ≠ Card).
 *
 * Dois eixos:
 *  - transições `arquivar`/`restaurar` (idempotentes por construção);
 *  - `podeEditarDatabase(state)` — o gate de SOMENTE-LEITURA INTEGRAL (D1): um Database `ARCHIVED` só
 *    aceita `restaurar` como escrita; renomear é bloqueado. É o PONTO DE EXTENSÃO que 3.3/3.4/3.7/3.8/
 *    3.9 reusarão para negar escrita de dados dependentes quando `state !== ACTIVE` — sem materializar
 *    nada aqui (AD-11): o consumidor concreto na 3.1 é `renomear`.
 */

/** Plano de uma transição de estado: se aplica, o novo estado e o `archivedAt` resultante. */
export interface PlanoTransicaoDatabase {
  /** `false` quando já está no estado-alvo — caminho idempotente (o serviço NÃO emite `updateMany`). */
  readonly aplicar: boolean;
  readonly novoState: DatabaseState;
  /** Valor a gravar em `archivedAt`: instante ao arquivar, `null` ao restaurar. `undefined` = não tocar. */
  readonly archivedAt: Date | null | undefined;
}

/**
 * Arquivar: `ACTIVE → ARCHIVED` com `archivedAt = agora`. Já-`ARCHIVED` → idempotente (não reescreve
 * `archivedAt`, preserva o instante original). Recebe `agora` por injeção para ser puro/testável.
 */
export function planejarArquivamento(
  state: DatabaseState,
  agora: Date,
): PlanoTransicaoDatabase {
  if (state === 'ARCHIVED') {
    return { aplicar: false, novoState: 'ARCHIVED', archivedAt: undefined };
  }
  return { aplicar: true, novoState: 'ARCHIVED', archivedAt: agora };
}

/**
 * Restaurar: `ARCHIVED → ACTIVE` com `archivedAt = null`, PRESERVANDO identidade e referências (não
 * cria nova linha, não toca `id`/`name`). Já-`ACTIVE` → idempotente.
 */
export function planejarRestauracao(state: DatabaseState): PlanoTransicaoDatabase {
  if (state === 'ACTIVE') {
    return { aplicar: false, novoState: 'ACTIVE', archivedAt: undefined };
  }
  return { aplicar: true, novoState: 'ACTIVE', archivedAt: null };
}

/**
 * Gate de SOMENTE-LEITURA INTEGRAL (D1, confirmado pelo dono): um Database só é editável quando
 * `ACTIVE`. Em `ARCHIVED`, a única escrita permitida é `restaurar` — renomear (e, no futuro, toda
 * escrita de dados dependentes) é bloqueado. Função pura: quem traduz `false` em 409 é o serviço.
 */
export function podeEditarDatabase(state: DatabaseState): boolean {
  return state === 'ACTIVE';
}
