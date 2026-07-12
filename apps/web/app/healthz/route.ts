/**
 * Liveness da Web — deliberadamente local e independente.
 *
 * NÃO consulta a API, não lê `API_BASE_URL` e não faz I/O: responde apenas se este
 * processo Next está de pé. A página `/` continua consultando a API para a experiência
 * visual, mas a saúde do container não pode depender da disponibilidade nem da latência
 * de um serviço terceiro (AD-32).
 */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok' });
}
