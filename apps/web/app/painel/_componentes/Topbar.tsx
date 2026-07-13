/**
 * Topbar da casca (Story 1.7). Mostra a **Organização atual** (à direita) e **reserva** os espaços de
 * Busca, Notificações e Perfil — que só ganham controle funcional nos Épicos respectivos (7, 5) e na
 * Story 1.11. Aqui NÃO há controle falso: os espaços reservados são não-interativos (`aria-hidden`,
 * sem handler, sem rota) — reservam a estrutura sem enganar o usuário (AC3).
 */
export function Topbar({ orgNome }: { orgNome: string }) {
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

        {/* Contexto da Organização atual (Forma B): sempre visível. É exibição, não um controle. */}
        <span className="text-sm text-muted-foreground">
          Organização: <strong className="font-medium text-foreground">{orgNome}</strong>
        </span>
      </div>
    </header>
  );
}
