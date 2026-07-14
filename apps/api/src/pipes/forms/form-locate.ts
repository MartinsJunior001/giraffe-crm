import { NotFoundException } from '@nestjs/common';
import type { FormContext } from '../../../generated/prisma';
import type { withTenantContext } from '../../kernel/db/tenant-context';

/**
 * Localizadores compartilhados do domínio Formulário — extraídos para serem reusados por `FormsService`
 * (2.4, montagem) e `FieldsService` (2.5, evolução), sem duplicar a resolução de contexto/owner. Segue o
 * mesmo precedente da extração de `pipe-authz` (2.3→2.4). Sem regra de autorização aqui (essa é do
 * `pipe-authz`); apenas resolução de contexto e localização de Formulário, tudo por `withTenantContext`.
 */

type Db = ReturnType<typeof withTenantContext>;

/** Alvo de um Formulário: sempre um Pipe; opcionalmente uma Fase dele (contexto de Fase). */
export interface AlvoFormulario {
  pipeId: string;
  phaseId?: string | null;
}

/** Projeção fixa do Formulário (sem `orgId`). */
export const SELECT_FORM = {
  id: true,
  context: true,
  pipeId: true,
  phaseId: true,
} as const;

/** 404 (não-enumerante) se a Fase não existe ou não é deste Pipe (RN-030 — Fase não migra). */
export async function exigirFaseDoPipe(db: Db, pipeId: string, phaseId: string): Promise<void> {
  const fase = await db.phase.findUnique({
    where: { id: phaseId },
    select: { id: true, pipeId: true },
  });
  if (!fase || fase.pipeId !== pipeId) throw new NotFoundException();
}

/** Deriva contexto + owner do alvo; valida que a Fase pertence ao Pipe quando é contexto de Fase. */
export async function resolverContexto(
  db: Db,
  alvo: AlvoFormulario,
): Promise<{ context: FormContext; owner: { pipeId?: string; phaseId?: string } }> {
  if (alvo.phaseId) {
    await exigirFaseDoPipe(db, alvo.pipeId, alvo.phaseId);
    return { context: 'PHASE', owner: { phaseId: alvo.phaseId } };
  }
  return { context: 'PIPE_INITIAL', owner: { pipeId: alvo.pipeId } };
}

/** Busca o Formulário do contexto (sem criar). `null` se ainda não foi materializado. */
export async function acharForm(
  db: Db,
  orgId: string,
  context: FormContext,
  owner: { pipeId?: string; phaseId?: string },
) {
  return db.form.findFirst({
    where: { orgId, context, pipeId: owner.pipeId ?? null, phaseId: owner.phaseId ?? null },
    select: SELECT_FORM,
  });
}
