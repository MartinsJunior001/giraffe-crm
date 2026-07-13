/**
 * Navegação da casca (Story 1.7).
 *
 * IMPORTANTE: esconder um item aqui é **UX**, não fronteira de segurança. A autorização efetiva é do
 * SERVIDOR (Stories 1.6/1.3, deny-by-default) — mesmo que um item vazasse, o backend negaria a ação.
 * Filtrar a navegação evita ruído e honra "não revelar recurso" (INV-REPORT-01) ao **não renderizar**
 * o item oculto. Nenhuma regra de domínio vive no frontend: aqui só há filtragem de apresentação.
 */

/** Papel efetivo na Organização atual (espelha o MembershipRole do servidor). */
export type Papel = 'ADMIN' | 'MEMBER' | 'GUEST';

export interface ItemNav {
  readonly href: string;
  readonly rotulo: string;
  /** Nome do ícone lucide (resolvido na Sidebar). */
  readonly icone: string;
  /**
   * Papéis que enxergam o item. **Ausência = visível a toda Membership ativa.** Presença = allowlist:
   * só os papéis listados veem (os demais nem sabem que o item existe — item fora do DOM).
   */
  readonly papeis?: readonly Papel[];
}

/**
 * Navegação primária. Hoje só o Dashboard existe de fato — os módulos de domínio (Pipes, Databases,
 * etc.) chegam nos Épicos que os introduzirem, cada um declarando seu `papeis` quando fizer sentido.
 * NÃO adicionar itens sem rota real (sem controle falso — AC3).
 */
export const ITENS_NAV: readonly ItemNav[] = [
  { href: '/painel', rotulo: 'Dashboard', icone: 'LayoutDashboard' },
];

/** Itens que o papel pode ver. Item com `papeis` só aparece se o papel estiver na allowlist. */
export function itensVisiveis(papel: Papel, itens: readonly ItemNav[] = ITENS_NAV): ItemNav[] {
  return itens.filter((item) => item.papeis === undefined || item.papeis.includes(papel));
}

/**
 * O item ativo é aquele cuja `href` casa com o começo do pathname atual (cobre subrotas). A raiz do
 * painel casa exatamente para não "acender" em toda subrota.
 */
export function ehAtivo(href: string, pathname: string): boolean {
  if (href === '/painel') return pathname === '/painel';
  return pathname === href || pathname.startsWith(`${href}/`);
}
