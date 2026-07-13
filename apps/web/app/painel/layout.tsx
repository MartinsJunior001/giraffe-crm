import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { obterContexto } from '@/lib/contexto';
import { itensVisiveis, type Papel } from '@/lib/navegacao';
import { Sidebar } from './_componentes/Sidebar';
import { Topbar } from './_componentes/Topbar';

/**
 * Casca do segmento autenticado (Story 1.7): Sidebar + Topbar + conteúdo.
 *
 * O contexto é confirmado no SERVIDOR. Sessão inválida (401) → volta ao Login (a mesma verdade que a
 * página do Dashboard usa; deduplicada por `obterContexto`). Sem Organização ativa ou API indisponível,
 * a casca ainda renderiza — o estado honesto aparece no conteúdo (a página), sem inventar navegação.
 *
 * A navegação é filtrada pelo `papel` do servidor: item sem acesso não é renderizado (UX; a segurança
 * real é do backend). Sem Org ativa, cai no piso `GUEST` — sem elevar nada.
 */
export const dynamic = 'force-dynamic';

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const estado = await obterContexto();

  if (!estado.ok && estado.motivo === 'sem-sessao') redirect('/login');

  const papel: Papel = estado.ok ? estado.papel : 'GUEST';
  const orgNome = estado.ok ? estado.orgNome : '—';
  const itens = itensVisiveis(papel);

  return (
    <div className="flex min-h-screen bg-surface-soft">
      <Sidebar itens={itens} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar orgNome={orgNome} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
