import type { OrganizacaoElegivel } from '@/lib/auth';
import { SeletorOrganizacao } from './SeletorOrganizacao';

/**
 * Topbar da casca (Story 1.7). Mostra a **Organização atual** (à direita) e **reserva** os espaços de
 * Busca, Notificações e Perfil — que só ganham controle funcional nos Épicos respectivos (7, 5) e na
 * Story 1.11. Aqui NÃO há controle falso: os espaços reservados são não-interativos (`aria-hidden`,
 * sem handler, sem rota) — reservam a estrutura sem enganar o usuário (AC3).
 *
 * **Story 1.9:** este mesmo canto vira **seletor** quando — e somente quando — há mais de uma
 * Membership ativa (UX-DR5/AC-1). Com uma só, permanece exibição: um controle com uma única opção
 * sugeriria uma escolha que não existe. A decisão sai da LISTA que o servidor devolveu; a web não
 * filtra elegibilidade por conta própria.
 */
export function Topbar({
  orgNome,
  organizacoes = [],
  orgAtual = null,
}: {
  orgNome: string;
  organizacoes?: OrganizacaoElegivel[];
  orgAtual?: string | null;
}) {
  const podeTrocar = organizacoes.length > 1;

  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-background px-4">
      {/* Espaço reservado da Busca Global (Épico 7) — estrutural, não funcional. */}
      <div
        aria-hidden
        data-reservado="busca"
        className="h-9 w-full max-w-sm rounded-[--radius-button] bg-muted max-md:hidden"
      />

      <div className="ml-auto flex items-center gap-4">
        {/* Espaços reservados de Notificações e Perfil — estruturais, não funcionais. */}
        <div aria-hidden data-reservado="notificacoes" className="size-9 rounded-full bg-muted" />
        <div aria-hidden data-reservado="perfil" className="size-9 rounded-full bg-muted" />

        {podeTrocar ? (
          <SeletorOrganizacao organizacoes={organizacoes} atual={orgAtual} />
        ) : (
          /* Contexto da Organização atual (Forma B): sempre visível. É exibição, não um controle. */
          <span className="text-sm text-muted-foreground">
            Organização: <strong className="font-medium text-foreground">{orgNome}</strong>
          </span>
        )}
      </div>
    </header>
  );
}
