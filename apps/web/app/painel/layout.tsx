import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { obterContexto, obterOrganizacoes } from '@/lib/contexto';
import { itensVisiveis, type Papel } from '@/lib/navegacao';
import { Navegacao } from './_componentes/Navegacao';
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

  // Story 1.9: as Organizações elegíveis vêm do SERVIDOR a cada render. Como este layout é
  // `force-dynamic` e a busca usa `cache: 'no-store'`, o `router.refresh()` disparado pelo seletor
  // após a troca reexecuta isto com o contexto NOVO — é o que invalida de uma vez tudo que dependia
  // da Organização anterior, sem cache de cliente a sincronizar à mão.
  //
  // Falha na listagem NÃO derruba a casca: sem lista, o seletor não aparece e a topbar cai na
  // exibição simples. Degradar para "não dá para trocar agora" é honesto; derrubar o painel inteiro
  // por causa de um seletor não seria.
  const orgs = await obterOrganizacoes();
  const organizacoes = orgs.ok ? orgs.organizacoes : [];
  const orgAtual = orgs.ok ? orgs.atual : null;

  return (
    <div className="flex min-h-screen bg-surface-soft">
      {/* Sidebar vertical (desktop). Em telas estreitas ela se esconde e a nav migra para o topo. */}
      <Navegacao itens={itens} orientacao="vertical" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar orgNome={orgNome} organizacoes={organizacoes} orgAtual={orgAtual} />
        {/* Nav adaptada (mobile/tablet): barra horizontal logo abaixo da topbar. */}
        <Navegacao itens={itens} orientacao="horizontal" />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
