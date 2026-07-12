/**
 * Resolve a URL base da API interna. Variável de SERVIDOR (`API_BASE_URL`) —
 * NÃO usa o prefixo `NEXT_PUBLIC_` porque não deve ser inlinada no bundle do
 * browser: é lida server-side (no compose aponta para `http://api:3001`, uma
 * URL da rede interna inalcançável pelo browser). Nenhum segredo aqui.
 */
export function getApiBaseUrl(raw: string | undefined = process.env.API_BASE_URL): string {
  const url = (raw ?? '').trim();
  if (!url) {
    throw new Error('API_BASE_URL ausente: configure a URL base da API interna (server-side).');
  }
  return url.replace(/\/+$/, '');
}
