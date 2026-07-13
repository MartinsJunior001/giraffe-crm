import { fetchApiHealth, type ApiHealth } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/env';

// Casca dinâmica: reflete o estado real da API a cada requisição.
// `force-dynamic` também garante que o build (sem env) não pré-renderize esta página.
export const dynamic = 'force-dynamic';

export default async function Home() {
  let health: ApiHealth;
  try {
    health = await fetchApiHealth(getApiBaseUrl());
  } catch {
    // Configuração ausente → estado honesto degradado (não derruba a casca com HTTP 500).
    health = { ok: false, reason: 'configuração ausente' };
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Giraffe CRM</h1>
      <p className="text-sm opacity-70">
        Esqueleto executável — casca vazia navegável (Story 1.1). Sem conteúdo de domínio.
      </p>
      <div className="rounded-md border px-4 py-2 text-sm">
        API interna:{' '}
        {health.ok ? (
          <span className="font-medium">disponível ({health.status})</span>
        ) : (
          <span className="font-medium">indisponível — {health.reason}</span>
        )}
      </div>
    </main>
  );
}
