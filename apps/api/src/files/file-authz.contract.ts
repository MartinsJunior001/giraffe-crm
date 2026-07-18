/**
 * Porta de AUTORIZAÇÃO por recurso (Story 3.7, contrato C1) — a 3.7 **não** conhece Card/Registro/Conta.
 *
 * A permissão de arquivo HERDA do recurso dono: ver/baixar = leitura do recurso; enviar/substituir/remover =
 * edição do recurso. Quem resolve isso para um `(resourceType, resourceId)` concreto é o CONSUMIDOR (3.8 liga
 * Card/Registro; 3.10 liga Conta/avatar), implementando esta interface e ligando-a pelo token abaixo. A 3.7
 * fornece a porta e um **binding de teste** (recurso fictício) para provar a capacidade isolada.
 *
 * Deny-by-default: sem acesso, o serviço responde **404 não-enumerante** (não confirma existência do arquivo/
 * recurso); ler-sem-editar em rota de mutação ⇒ 403. A porta resolve o PRINCIPAL atual pelo contexto de
 * requisição (o consumidor injeta o que precisa) — a assinatura não recebe o principal por parâmetro.
 */
export interface FileAuthzContract {
  /** O principal atual pode LER (ver/baixar) arquivos do recurso `(resourceType, resourceId)`? */
  podeLer(resourceType: string, resourceId: string): Promise<boolean>;
  /** O principal atual pode EDITAR (enviar/substituir/remover) arquivos do recurso `(resourceType, resourceId)`? */
  podeEditar(resourceType: string, resourceId: string): Promise<boolean>;
}

/**
 * Token de injeção da porta. O consumidor liga a implementação real via `{ provide: FILE_AUTHZ_CONTRACT, useClass: ... }`.
 * A 3.7 registra um binding de teste; nunca uma implementação de domínio especulativa (AD-11).
 */
export const FILE_AUTHZ_CONTRACT = Symbol('FILE_AUTHZ_CONTRACT');
