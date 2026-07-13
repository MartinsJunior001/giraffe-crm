/** Código SQLSTATE do PostgreSQL para violação de policy de RLS. */
const INSUFFICIENT_PRIVILEGE = '42501';

/** Prisma: registro não encontrado — ou invisível, que é como a RLS o faz parecer. */
const REGISTRO_NAO_ENCONTRADO = 'P2025';

/**
 * Identifica uma negação por Row-Level Security.
 *
 * Existe para que a negação seja tratada como EVENTO DE SEGURANÇA — registrado, contável,
 * visível — e não como um 500 anônimo perdido no meio dos erros de banco. Uma tentativa de
 * acesso cruzado é exatamente o que se quer enxergar num log.
 *
 * Checamos o código SQLSTATE e, como rede, o texto da mensagem: o Prisma nem sempre propaga
 * o `meta.code` para todas as operações, e perder a classificação silenciosamente seria o
 * oposto do objetivo. A rede é rede, e não o critério principal, porque a mensagem do
 * PostgreSQL é traduzível (`lc_messages`) — num banco em pt-BR o texto não casaria.
 */
export function isRlsDenial(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;

  const code = (err as { meta?: { code?: unknown } }).meta?.code;
  if (code === INSUFFICIENT_PRIVILEGE) return true;

  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' && /row-level security/i.test(message);
}

/**
 * `update`/`delete` de um único registro que a policy `USING` filtrou.
 *
 * A RLS não diz "proibido": ela faz a linha DESAPARECER. O Prisma, ao não encontrar o
 * registro que ia alterar, lança `P2025` — indistinguível, de fora, de um id que de fato
 * não existe. Os dois casos merecem a mesma leitura na trilha: uma mutação que mirou uma
 * linha que o requisitante não podia enxergar.
 *
 * Sem isto, um `update` cruzado não gerava evento nenhum — não era `allowed` (lançou) nem
 * `denied` (`isRlsDenial` não reconhece P2025). Simplesmente sumia da auditoria.
 */
export function isRegistroNaoEncontrado(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  return (err as { code?: unknown }).code === REGISTRO_NAO_ENCONTRADO;
}
