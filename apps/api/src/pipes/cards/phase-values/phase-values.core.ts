import type { Prisma } from '../../../../generated/prisma';

/**
 * Núcleo PURO da obrigatoriedade do Formulário de Fase (Story 2.15) — decide quais Campos OBRIGATÓRIOS do snapshot
 * ficaram sem valor. Sem framework, sem banco: provável em unidade. A validação de TIPO/allowlist/Seleção-por-id
 * continua sendo a de `submission.ts` (reuso 2.7); aqui só se acrescenta a checagem que a 2.7 deliberadamente não
 * fazia — obrigatoriedade — usando o atributo `required` **congelado no snapshot** (AD-12), nunca a definição viva.
 */

/** Um Campo do snapshot, no mínimo que a checagem de obrigatoriedade observa. */
interface CampoSnapshotReq {
  id: string;
  type: string;
  required?: boolean;
}

/** Lê os Campos do snapshot (Json da `FormVersion`). Fail-closed: snapshot malformado ⇒ lista vazia de Campos. */
function camposDoSnapshot(snapshot: Prisma.JsonValue): CampoSnapshotReq[] {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) return [];
  const fields = (snapshot as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return [];
  const out: CampoSnapshotReq[] = [];
  for (const f of fields) {
    if (f === null || typeof f !== 'object') continue;
    const obj = f as Record<string, unknown>;
    if (typeof obj.id !== 'string' || typeof obj.type !== 'string') continue;
    out.push({ id: obj.id, type: obj.type, required: obj.required === true });
  }
  return out;
}

/**
 * Um valor conta como PREENCHIDO quando está presente e não-vazio para o seu tipo: string não-vazia (após trim),
 * array não-vazio (Seleção múltipla), e presença simples para número/booleano (onde `0`/`false` são respostas
 * válidas). Ausente/`null`/`undefined` nunca preenche.
 */
function preenchido(valor: unknown): boolean {
  if (valor === undefined || valor === null) return false;
  if (typeof valor === 'string') return valor.trim().length > 0;
  if (Array.isArray(valor)) return valor.length > 0;
  return true; // número, booleano, objeto — presença basta
}

/**
 * Devolve os `Field.id` dos Campos OBRIGATÓRIOS (no snapshot) que não vieram preenchidos em `valores`. Lista vazia
 * ⇒ requisito satisfeito. Não valida tipo (isso é `validarSubmissao`); assume `valores` já um objeto por `Field.id`.
 */
export function requisitosFaltantes(
  snapshot: Prisma.JsonValue,
  valores: Record<string, unknown>,
): string[] {
  const faltantes: string[] = [];
  for (const campo of camposDoSnapshot(snapshot)) {
    if (campo.required && !preenchido(valores[campo.id])) faltantes.push(campo.id);
  }
  return faltantes;
}

/** Conveniência: o requisito está satisfeito quando não falta nenhum Campo obrigatório. */
export function requisitoSatisfeito(
  snapshot: Prisma.JsonValue,
  valores: Record<string, unknown>,
): boolean {
  return requisitosFaltantes(snapshot, valores).length === 0;
}
