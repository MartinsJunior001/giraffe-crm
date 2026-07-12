/** Resultado honesto da checagem da API (nunca vaza detalhes internos). */
export type ApiHealth = { ok: true; status: string } | { ok: false; reason: string };

/**
 * Consulta o /health da API interna com timeout. Em qualquer falha retorna um
 * estado HONESTO e sanitizado — sem stack trace, sem URL interna, sem segredo.
 */
export async function fetchApiHealth(baseUrl: string, timeoutMs = 2000): Promise<ApiHealth> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/health`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    const body = (await res.json()) as { status?: string };
    return { ok: true, status: body.status ?? 'ok' };
  } catch {
    return { ok: false, reason: 'sem conexão' };
  } finally {
    clearTimeout(timer);
  }
}
