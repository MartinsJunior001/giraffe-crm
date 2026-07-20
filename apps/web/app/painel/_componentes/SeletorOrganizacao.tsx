'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { OrganizacaoElegivel } from '@/lib/auth';

/**
 * Seletor de contexto de Organização (Story 1.9 · UX-DR5, Forma B).
 *
 * **Aparece somente com mais de uma Membership ativa** (AC-1): com uma só, não há escolha a fazer, e
 * um controle que só tem uma opção é ruído que sugere uma capacidade inexistente. A decisão de
 * mostrar ou não é do componente pai, com a lista que o SERVIDOR devolveu — a web nunca filtra
 * elegibilidade por conta própria.
 *
 * `<select>` nativo de propósito: foco, navegação por teclado, leitura por leitor de tela e
 * comportamento em mobile vêm prontos e corretos. Um dropdown customizado precisaria reconstruir
 * tudo isso para empatar, e é onde acessibilidade costuma se perder.
 */
export function SeletorOrganizacao({
  organizacoes,
  atual,
}: {
  organizacoes: OrganizacaoElegivel[];
  atual: string | null;
}) {
  const router = useRouter();
  const [pendente, iniciarTransicao] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // `enviando` é separado de `pendente`: o primeiro cobre o fetch, o segundo o refresh do servidor.
  // Juntos, mantêm o controle desabilitado do clique até a árvore nova estar pronta — é o que impede
  // a submissão concorrente (duplo clique / troca em rajada) de disparar duas trocas.
  const ocupado = enviando || pendente;

  async function trocar(orgId: string) {
    if (orgId === atual || ocupado) return; // trocar para a atual não é operação
    setErro(null);
    setEnviando(true);

    try {
      const res = await fetch('/api/organizacao', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });

      if (!res.ok) {
        // Mensagem ÚNICA para qualquer falha. A API responde 404 uniforme para inexistente / sem
        // Membership / inativa justamente para não virar oráculo de existência; detalhar aqui
        // desfaria isso na tela. O usuário não perde nada: ele escolhe de uma lista que o servidor
        // lhe deu, então uma falha aqui significa que algo mudou — e reabrir é a ação certa.
        setErro('Não foi possível trocar de Organização. Recarregue a página e tente de novo.');
        return;
      }

      // Sucesso: a preferência já está no servidor. `router.refresh()` refaz os Server Components
      // com o contexto NOVO — é o que invalida, de uma vez, todo dado da Organização anterior
      // (navegação, topbar, conteúdo), em vez de remendar peça por peça no cliente.
      iniciarTransicao(() => router.refresh());
    } catch {
      setErro('Não foi possível trocar de Organização. Recarregue a página e tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="seletor-organizacao" className="text-sm text-muted-foreground">
        Organização:
      </label>

      <select
        id="seletor-organizacao"
        name="organizacao"
        // `value` controlado pelo servidor (`atual`): depois do refresh, ele reflete o que o backend
        // resolveu — nunca um estado local que possa divergir do contexto real.
        value={atual ?? ''}
        disabled={ocupado}
        aria-busy={ocupado}
        aria-describedby={erro ? 'erro-organizacao' : undefined}
        onChange={(e) => void trocar(e.target.value)}
        className="rounded-[--radius-button] border border-border bg-background px-2 py-1 text-sm text-foreground disabled:opacity-60"
      >
        {/* Sem escolha válida em vigor: o estado é explícito, e não uma Organização adivinhada. */}
        {atual === null && (
          <option value="" disabled>
            Selecione uma Organização
          </option>
        )}
        {organizacoes.map((org) => (
          <option key={org.id} value={org.id}>
            {org.nome}
          </option>
        ))}
      </select>

      {/* `role="status"` (polite): anuncia a troca sem interromper quem estiver lendo outra coisa. */}
      {ocupado && (
        <span role="status" className="text-xs text-muted-foreground">
          Trocando…
        </span>
      )}

      {/* `role="alert"` (assertive): erro precisa ser anunciado de imediato. */}
      {erro && (
        <span id="erro-organizacao" role="alert" className="text-xs text-destructive">
          {erro}
        </span>
      )}
    </div>
  );
}
