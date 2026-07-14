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
