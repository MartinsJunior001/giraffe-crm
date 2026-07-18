import type { FieldState, FieldType } from '../../../generated/prisma';

/**
 * Gate do Campo Arquivo (AD-27/AD-28) — regra **fail-closed**, pura e determinística.
 *
 * O tipo `FILE` existe no catálogo canônico, mas o armazenamento de arquivos é do Épico 3. Enquanto a
 * capacidade de upload estiver **desabilitada** (`FILE_UPLOAD_ENABLED` default falso), um Formulário com um
 * Campo `FILE` **ativo** não pode ser publicado. Esta função é o **contrato** da regra: a Story 2.6 a
 * **consome** no ato de publicar; a 2.4 apenas a entrega e a prova (não há rota de publicar aqui).
 *
 * Fail-closed: na dúvida, NÃO publica. Só a habilitação explícita da capacidade libera.
 */

/** O mínimo que o gate observa de cada Campo do Formulário. */
export interface CampoParaGate {
  type: FieldType;
  state: FieldState;
}

/**
 * Um Formulário pode ser publicado quanto ao Campo Arquivo? Verdadeiro se a capacidade de upload está
 * habilitada, OU se não há nenhum Campo `FILE` **ativo**. Um `FILE` arquivado não barra (não será exibido).
 */
export function podePublicarComArquivo(
  campos: readonly CampoParaGate[],
  opcoes: { fileUpload: boolean },
): boolean {
  if (opcoes.fileUpload) return true;
  return !campos.some((campo) => campo.type === 'FILE' && campo.state === 'ACTIVE');
}

/**
 * O tipo `FILE` está disponível para uso **funcional** no builder? Fail-closed: só quando a capacidade de
 * upload está habilitada. Adicionar um Campo `FILE` continua permitido (entra na definição), mas o builder o
 * apresenta como **indisponível** enquanto isto for falso — e a publicação fica barrada por
 * `podePublicarComArquivo`.
 */
export function tipoArquivoDisponivel(fileUpload: boolean): boolean {
  return fileUpload;
}

/**
 * O snapshot de uma `FormVersion` publicada (Campos ativos congelados — 2.6) contém algum Campo `FILE`?
 * Base do **gate de CONSUMO** (Story 3.8, RF-3 / ADR AC-2, "[3.8, não 3.7]"): um Formulário publicado enquanto
 * a capacidade estava ligada pode ser SUBMETIDO depois que ela foi desligada — a definição congelada ainda
 * exige arquivo, mas a capacidade não existe. Fail-closed: snapshot malformado ⇒ `false` (não bloqueia a
 * submissão por um formato que não reconhece; a validação de valores já é fail-closed em `submission.ts`).
 * Pura e testável; o serviço compõe com `getEnv().FILE_UPLOAD_ENABLED` para decidir o 409.
 */
export function snapshotExigeCapacidadeArquivo(snapshot: unknown): boolean {
  if (snapshot === null || typeof snapshot !== 'object') return false;
  const fields = (snapshot as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return false;
  return fields.some(
    (f) => f !== null && typeof f === 'object' && (f as { type?: unknown }).type === 'FILE',
  );
}
