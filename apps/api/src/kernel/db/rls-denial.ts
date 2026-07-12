/** Código SQLSTATE do PostgreSQL para violação de policy de RLS. */
const INSUFFICIENT_PRIVILEGE = '42501';

/**
 * Identifica uma negação por Row-Level Security.
 *
 * Existe para que a negação seja tratada como EVENTO DE SEGURANÇA — registrado, contável,
 * visível — e não como um 500 anônimo perdido no meio dos erros de banco. Uma tentativa de
 * acesso cruzado é exatamente o que se quer enxergar num log.
 *
 * Checamos o código SQLSTATE e, como rede, o texto da mensagem: o Prisma nem sempre propaga
 * o `meta.code` para todas as operações, e perder a classificação silenciosamente seria o
 * oposto do objetivo.
 */
export function isRlsDenial(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;

  const code = (err as { meta?: { code?: unknown } }).meta?.code;
  if (code === INSUFFICIENT_PRIVILEGE) return true;

  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' && /row-level security/i.test(message);
}
