import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/env';
import { fetchOrgAtual, type EstadoOrg } from '@/lib/auth';

/**
 * Página protegida mínima (Story 1.5).
 *
 * O middleware já barra quem não tem cookie de sessão — mas isso é UX. AQUI a verdade é confirmada no
 * SERVIDOR contra a API: se a sessão não vale mais (401), volta ao Login; se vale mas não há Organização
 * ativa (403 — Membership suspensa/removida/ausente), mostra o estado honesto "sem Organização", que
 * NÃO é erro de credencial. A negação real é sempre do backend.
 */
export const dynamic = 'force-dynamic';

export default async function PainelPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  let estado: EstadoOrg;
  try {
    estado = await fetchOrgAtual(getApiBaseUrl(), cookieHeader);
  } catch {
    estado = { ok: false, motivo: 'indisponivel' };
  }

  // Sessão inválida/expirada: a negação real do backend leva ao Login (o middleware só cobre a ausência
  // do cookie; um cookie expirado só o backend reprova).
  if (!estado.ok && estado.motivo === 'sem-sessao') redirect('/login');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Painel</h1>

      {estado.ok ? (
        <p className="rounded-md border px-4 py-2 text-sm">
          Organização ativa: <span className="font-medium">{estado.orgId}</span>
        </p>
      ) : estado.motivo === 'sem-organizacao' ? (
        <p className="rounded-md border px-4 py-2 text-sm">
          Você está autenticado, mas sem Organização ativa.
        </p>
      ) : (
        <p className="rounded-md border px-4 py-2 text-sm">
          Não foi possível confirmar seu contexto agora. Tente novamente.
        </p>
      )}

      <form method="post" action="/logout">
        <button type="submit" className="rounded-md border px-4 py-2 font-medium">
          Sair
        </button>
      </form>
    </main>
  );
}
