import type { Marcos } from '../../phases/milestones/phase-milestones.core';

/**
 * Núcleo PURO da saúde temporal do Card (Story 2.13). Sem I/O, sem Nest, sem Prisma — só a derivação:
 *  - `derivarSaude`: o eixo de saúde (`ok`/`atrasado`/`vencido`/`expirado`) a partir dos marcos reais (base da 2.12)
 *    comparados com "agora". **Derivação pura na leitura** (decisão do dono: sem persistir, sem evento, sem
 *    agendador — coerente com a 2.12).
 *  - `indicadorDominante`: o indicador de APRESENTAÇÃO (precedência `arquivado > finalizado > [saúde]`), que **não**
 *    substitui os dois eixos canônicos (ciclo de vida + saúde) — só resume o dominante para a UI (consumo no E7).
 */

/** Eixo de saúde temporal — derivado dos marcos, nunca manual (PRD D2.3). */
export type SaudeTemporal = 'ok' | 'atrasado' | 'vencido' | 'expirado';

/** Indicador dominante de apresentação (precedência ciclo de vida › saúde). Só resumo; não é um 3º estado canônico. */
export type IndicadorDominante =
  'arquivado' | 'finalizado' | 'expirado' | 'vencido' | 'atrasado' | 'ok';

/**
 * Deriva a saúde a partir dos marcos e do instante "agora". Atribuição ASCENDENTE por severidade: passar o prazo
 * esperado → `atrasado`; o vencimento → `vencido`; a expiração → `expirado`. Um marco **ausente** (`null`) é
 * ignorado — "sem o marco, o estado não se aplica" (epics §966). Como a 2.12 garante `esperado ≤ vencimento ≤
 * expiração`, passar a expiração implica os demais, e o resultado é o **mais severo alcançado**. Sem marco algum →
 * `ok`. O limiar é **inclusivo** (`agora >= marco`): no exato instante do marco a saúde já escala.
 */
export function derivarSaude(marcos: Marcos, agora: Date): SaudeTemporal {
  const t = agora.getTime();
  let saude: SaudeTemporal = 'ok';
  if (marcos.esperado !== null && t >= marcos.esperado.getTime()) saude = 'atrasado';
  if (marcos.vencimento !== null && t >= marcos.vencimento.getTime()) saude = 'vencido';
  if (marcos.expiracao !== null && t >= marcos.expiracao.getTime()) saude = 'expirado';
  return saude;
}

/**
 * Indicador dominante de apresentação (PRD §897): o **ciclo de vida** tem precedência sobre a saúde —
 * `ARQUIVADO`→`arquivado`, `FINALIZADO`→`finalizado`; um Card **ATIVO** apresenta a própria `saude`. NÃO funde os
 * eixos: o chamador continua expondo `lifecycleState` e `saude` separadamente. Enquanto inativo, a saúde não é o
 * efetivo (a apresentação prioriza o ciclo de vida — epics §962); ao reabrir/restaurar para ATIVO, a saúde volta a
 * ser o dominante automaticamente (a derivação é pura na leitura, sem estado a recalcular).
 */
export function indicadorDominante(
  lifecycleState: string,
  saude: SaudeTemporal,
): IndicadorDominante {
  if (lifecycleState === 'ARQUIVADO') return 'arquivado';
  if (lifecycleState === 'FINALIZADO') return 'finalizado';
  return saude;
}
