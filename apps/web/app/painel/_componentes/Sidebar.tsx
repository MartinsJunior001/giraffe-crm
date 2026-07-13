'use client';

import { LayoutDashboard, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ehAtivo, type ItemNav } from '@/lib/navegacao';
import { cn } from '@/lib/utils';

/** Ícones disponíveis por nome (o config de navegação referencia por string). */
const ICONES: Record<string, LucideIcon> = { LayoutDashboard };

/**
 * Navegação primária (Story 1.7). O item ativo NÃO depende só de cor: fundo `accent`, ícone `primary`,
 * peso 600 E `aria-current="page"` — piso de acessibilidade. Itens já vêm filtrados por papel pelo
 * servidor (item sem acesso nem chega aqui — fora do DOM, sem revelar recurso).
 */
export function Sidebar({ itens }: { itens: readonly ItemNav[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className="flex w-60 shrink-0 flex-col gap-1 border-r border-border bg-background p-3 max-md:hidden"
    >
      <span className="px-3 py-2 text-lg font-semibold text-foreground">Giraffe</span>
      <ul className="flex flex-col gap-1">
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
                    'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ' +
                    'transition-colors motion-reduce:transition-none',
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
