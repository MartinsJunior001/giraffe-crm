'use client';

import { LayoutDashboard, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ehAtivo, type ItemNav } from '@/lib/navegacao';
import { cn } from '@/lib/utils';

/** Ícones disponíveis por nome (o config de navegação referencia por string). */
const ICONES: Record<string, LucideIcon> = { LayoutDashboard };

/**
 * Navegação primária (Story 1.7). Adapta-se à largura:
 * - `vertical` = sidebar (desktop), escondida em telas estreitas;
 * - `horizontal` = barra rolável na casca (mobile/tablet), escondida no desktop.
 * Assim a navegação **permanece utilizável em qualquer largura** (AC4): o EXPERIENCE.md pede
 * "navegação adaptada (menu/topbar)" no mobile — aqui a nav migra da lateral para o topo.
 *
 * O item ativo NÃO depende só de cor: fundo `accent`, ícone `primary`, peso 600 E
 * `aria-current="page"`. Itens já vêm filtrados por papel pelo servidor (item sem acesso nem chega
 * aqui — fora do DOM, sem revelar recurso). Filtrar é UX; a segurança é do backend.
 */
export function Navegacao({
  itens,
  orientacao = 'vertical',
}: {
  itens: readonly ItemNav[];
  orientacao?: 'vertical' | 'horizontal';
}) {
  const pathname = usePathname();
  const vertical = orientacao === 'vertical';

  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        'border-border bg-background',
        vertical
          ? 'flex w-60 shrink-0 flex-col gap-1 border-r p-3 max-md:hidden'
          : 'flex gap-1 overflow-x-auto border-b p-2 md:hidden',
      )}
    >
      {vertical && <span className="px-3 py-2 text-lg font-semibold text-foreground">Giraffe</span>}
      <ul className={cn('flex gap-1', vertical ? 'flex-col' : 'flex-row')}>
        {itens.map((item) => {
          const Icone = ICONES[item.icone] ?? LayoutDashboard;
          const ativo = ehAtivo(item.href, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-[--radius-button] px-3 py-2 text-sm ' +
                    'whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                    'focus-visible:ring-offset-1 transition-colors motion-reduce:transition-none',
                  ativo
                    ? 'bg-accent font-semibold text-foreground'
                    : 'font-medium text-foreground-soft hover:bg-muted',
                )}
              >
                <Icone
                  aria-hidden
                  className={cn('size-5', ativo ? 'text-primary' : 'text-muted-foreground')}
                />
                <span>{item.rotulo}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
