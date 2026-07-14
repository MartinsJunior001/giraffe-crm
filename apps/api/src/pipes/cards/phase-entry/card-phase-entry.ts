import { Prisma } from '../../../../generated/prisma';
import { montarSnapshotConfig } from '../../phases/milestones/phase-milestones.core';

/**
 * Write-side da REFERÊNCIA de entrada na Fase (Story 2.12). Contrato ÚNICO que insere uma `CardPhaseEntry`
 * (append-only, imutável) DENTRO de uma transação já existente com contexto — recebe o `tx` do chamador (nunca
 * abre transação própria), para nascer atômico com a criação/movimentação do Card (AD-13).
 *
 * **Consumidores:**
 *  - **entrada inicial** (`origin=SUBMISSION`): a criação do Card (submissão interna 2.7 e conversão pública 2.8)
 *    chama este helper na MESMA transação em que cria o Card e o evento `CREATED` — não há Card sem sua 1ª entrada;
 *  - **reentrada** (`origin=MOVE`): a movimentação (2.14, futura) o consumirá na sua transação. O contrato existe
 *    agora porque a entrada inicial já é um consumidor concreto (AD-11 — nada materializado só para o futuro).
 *
 * **Snapshot (D-OA1=A):** congela a config de marcos VIGENTE da Fase no instante da entrada. Mudar a config da Fase
 * depois NÃO altera esta linha — "sem recálculo retroativo silencioso" cai por construção (padrão da `FormVersion`).
 * `enteredAt` usa o default do banco (`now()`, Timestamptz).
 */

const SELECT_CONFIG_FASE = {
  expectedDurationMin: true,
  dueDurationMin: true,
  expirationDurationMin: true,
  expectedFieldId: true,
  dueFieldId: true,
  expirationFieldId: true,
} as const;

/** Origem de uma entrada. Espelha o enum `CardPhaseEntryOrigin` do schema. */
export type OrigemEntrada = 'SUBMISSION' | 'MOVE';

export async function registrarEntradaNaFase(
  tx: Prisma.TransactionClient,
  contexto: { orgId: string },
  dados: { cardId: string; phaseId: string; origin: OrigemEntrada },
): Promise<void> {
  // Lê a config vigente da Fase para congelá-la no snapshot. O chamador garante que a Fase existe (o Card nasce/entra
  // nela); se por algum motivo não existir, o snapshot nasce todo-nulo (nenhum marco) — fail-closed, nunca lança.
  const fase = await tx.phase.findUnique({
    where: { id: dados.phaseId },
    select: SELECT_CONFIG_FASE,
  });
  const snapshot = montarSnapshotConfig(fase);

  await tx.cardPhaseEntry.create({
    data: {
      orgId: contexto.orgId,
      cardId: dados.cardId,
      phaseId: dados.phaseId,
      origin: dados.origin,
      configSnapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });
}
