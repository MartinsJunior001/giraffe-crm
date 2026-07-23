import type { EstadoArquivamento, EstadoOperacional } from './task-lifecycle.transitions';

/**
 * Núcleo PURO da condição temporal da Tarefa (Story 5.1). Sem I/O, sem Nest, sem Prisma. Espelha o
 * `card-health.core.ts` (2.13): o estado `atrasada` é DERIVADO na leitura — nunca persistido, sem evento,
 * sem agendador. A OCORRÊNCIA canônica do Evento (a que a 5.7 consumirá) é persistida à parte
 * (`TaskOverdueOccurrence`), mas o veredito "está atrasada agora?" é sempre recomputado.
 *
 * **Fuso oficial / determinismo (§1535):** `dueAt` é um INSTANTE absoluto (Timestamptz). A comparação
 * `agora >= dueAt` é instante × instante — o mesmo resultado em qualquer fuso de exibição, então "vencido no
 * fuso oficial da Organização" cai por construção, sem ambiguidade de wall-clock nem janela de DST. Ver a
 * decision doc `task-overdue-mechanism-5-1.md`.
 */

/**
 * A Tarefa está ATRASADA agora? Só se estiver ABERTA **e** ATIVA (não arquivada) **e** com prazo definido
 * **e** o prazo já venceu (`agora >= dueAt`, limiar inclusivo — no exato instante do prazo já conta). Uma
 * Tarefa CONCLUIDA ou ARQUIVADA **nunca** aparece atrasada (§1524), ainda que o Histórico registre conclusão
 * após o prazo. Sem prazo (`dueAt = null`) ⇒ nunca atrasada. Alterar o prazo recalcula imediatamente (isto é
 * puro na leitura — não há estado a recomputar).
 */
export function derivarAtrasada(
  lifecycleState: EstadoOperacional,
  archiveState: EstadoArquivamento,
  dueAt: Date | null,
  agora: Date,
): boolean {
  if (lifecycleState !== 'ABERTA') return false;
  if (archiveState !== 'ATIVA') return false;
  if (dueAt === null) return false;
  return agora.getTime() >= dueAt.getTime();
}

/**
 * A Tarefa é ELEGÍVEL para o mecanismo temporal emitir a ocorrência do Evento "Tarefa atrasada"? Mesma
 * condição de `derivarAtrasada` — o scan só materializa a ocorrência de Tarefas efetivamente atrasadas.
 * Concluir/arquivar antes do processamento tira a Tarefa do conjunto elegível (impede emissão incorreta —
 * §1535).
 */
export function elegivelParaOcorrencia(
  lifecycleState: EstadoOperacional,
  archiveState: EstadoArquivamento,
  dueAt: Date | null,
  agora: Date,
): boolean {
  return derivarAtrasada(lifecycleState, archiveState, dueAt, agora);
}
