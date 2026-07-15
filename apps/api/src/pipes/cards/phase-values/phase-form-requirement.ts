import { withTenantContext } from '../../../kernel/db/tenant-context';
import { validarSubmissao } from '../submission';
import { requisitosFaltantes } from './phase-values.core';

/**
 * Resolução (com I/O) dos requisitos do Formulário de Fase (Story 2.15) que alimenta o preflight PURO da 2.14. Lê o
 * `Form` de contexto PHASE da Fase e, se ele tem o modo (entrada/saída) e uma `FormVersion` **publicada**, valida
 * contra o **snapshot congelado** (AD-12) — nunca contra o rascunho vivo. Devolve um flag materializado que o
 * validador puro (`validarRequisitoEntrada`/`Saida`) consome; assim o núcleo de transição segue sem banco.
 *
 * Sem modo, ou sem versão publicada, NÃO há requisito efetivo a impor (não há definição congelada de Campos
 * obrigatórios) → `ok = undefined` (o validador não bloqueia).
 */

type Db = ReturnType<typeof withTenantContext>;

const SELECT_FORM = {
  id: true,
  requisitoEntrada: true,
  requisitoSaida: true,
  publishedVersion: true,
} as const;

/** Localiza o Formulário de Fase publicado (id da versão + snapshot) da Fase, ou `null` se não há. */
export async function formularioPublicadoDaFase(
  db: Db,
  phaseId: string,
): Promise<{
  form: { id: string; requisitoEntrada: boolean; requisitoSaida: boolean };
  versionId: string;
  snapshot: unknown;
} | null> {
  const form = await db.form.findFirst({
    where: { context: 'PHASE', phaseId },
    select: SELECT_FORM,
  });
  if (!form || form.publishedVersion === null) return null;
  const version = await db.formVersion.findFirst({
    where: { formId: form.id, version: form.publishedVersion },
    select: { id: true, snapshot: true },
  });
  if (!version) return null;
  return {
    form: {
      id: form.id,
      requisitoEntrada: form.requisitoEntrada,
      requisitoSaida: form.requisitoSaida,
    },
    versionId: version.id,
    snapshot: version.snapshot,
  };
}

export interface RequisitoSaidaResolvido {
  /** `undefined` = sem requisito; `true`/`false` = satisfeito/faltando (o validador bloqueia só em `false`). */
  ok?: boolean;
}

/**
 * Requisito de SAÍDA (D6): valida os valores **já persistidos** da Fase de origem (o conjunto corrente = mais
 * recente por `createdAt`) contra o snapshot publicado da Fase de origem. Não usa nada do request.
 */
export async function resolverRequisitoSaida(
  db: Db,
  phaseIdOrigem: string,
  cardId: string,
): Promise<RequisitoSaidaResolvido> {
  const publicado = await formularioPublicadoDaFase(db, phaseIdOrigem);
  if (!publicado || !publicado.form.requisitoSaida) return { ok: undefined };

  const corrente = await db.cardPhaseValues.findFirst({
    where: { cardId, phaseId: phaseIdOrigem },
    orderBy: { createdAt: 'desc' },
    select: { valores: true },
  });
  const valores = (corrente?.valores ?? {}) as Record<string, unknown>;
  return { ok: requisitosFaltantes(publicado.snapshot as never, valores).length === 0 };
}

export interface RequisitoEntradaResolvido {
  ok?: boolean;
  /** Presente só quando há requisito satisfeito com valores a gravar na tx da movimentação. */
  persistir?: { formVersionId: string; valores: Record<string, unknown> };
}

/**
 * Requisito de ENTRADA: valida os valores do request (`valoresDeFase`) contra o snapshot publicado da Fase de
 * DESTINO. `validarSubmissao` (reuso 2.7) garante tipo/allowlist/Seleção-por-id (lança `SubmissaoInvalidaError` →
 * o serviço traduz em 400); `requisitosFaltantes` garante os obrigatórios. Satisfeito ⇒ devolve os valores
 * normalizados + a `formVersionId` congelada para gravar em `CardPhaseValues` na MESMA transação da movimentação.
 */
export async function resolverRequisitoEntrada(
  db: Db,
  phaseIdDestino: string,
  valoresDeFase: Record<string, unknown> | undefined,
): Promise<RequisitoEntradaResolvido> {
  const publicado = await formularioPublicadoDaFase(db, phaseIdDestino);
  if (!publicado || !publicado.form.requisitoEntrada) return { ok: undefined };

  const normalizados = validarSubmissao(publicado.snapshot as never, valoresDeFase ?? {});
  const faltantes = requisitosFaltantes(publicado.snapshot as never, normalizados);
  if (faltantes.length > 0) return { ok: false };
  return {
    ok: true,
    persistir: { formVersionId: publicado.versionId, valores: normalizados },
  };
}
