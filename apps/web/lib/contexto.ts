import { cache } from 'react';
import { cookies } from 'next/headers';
import { fetchOrgAtual, fetchOrganizacoes, type EstadoOrg, type EstadoOrganizacoes } from './auth';
import { getApiBaseUrl } from './env';

/**
 * Contexto da Organização atual, resolvido no SERVIDOR e **deduplicado por requisição** (React
 * `cache`): a casca (layout) e o conteúdo (página do Dashboard) compartilham UMA única chamada à API,
 * em vez de bater duas vezes. A fonte de verdade é sempre o backend (Stories 1.5/1.6).
 */
export const obterContexto = cache(async (): Promise<EstadoOrg> => {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  try {
    return await fetchOrgAtual(getApiBaseUrl(), cookieHeader);
  } catch {
    return { ok: false, motivo: 'indisponivel' };
  }
});

/**
 * Organizações elegíveis da conta (Story 1.9), resolvidas no SERVIDOR e deduplicadas por requisição.
 *
 * Deliberadamente separada de `obterContexto`: a lista é usada só pela casca (topbar), enquanto o
 * contexto é usado também pelo conteúdo. Fundi-las faria toda página pagar uma chamada que só a
 * topbar precisa.
 */
export const obterOrganizacoes = cache(async (): Promise<EstadoOrganizacoes> => {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  try {
    return await fetchOrganizacoes(getApiBaseUrl(), cookieHeader);
  } catch {
    return { ok: false, motivo: 'indisponivel' };
  }
});
