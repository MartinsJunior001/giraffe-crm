import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Botão fundamental do design system (Story 1.7). Variantes fiéis ao DESIGN.md:
 * - primary: laranja com texto Ink; secondary: muted com borda; tertiary: transparente; destructive.
 * Foco SEMPRE visível (`ring #CC5B00`) — piso de acessibilidade. Área de toque adequada (min-h).
 * O laranja orienta, não domina: `primary` é o CTA; o resto é neutro.
 */
export const variantesBotao = cva(
  'inline-flex items-center justify-center gap-2 rounded-[--radius-button] text-sm font-semibold ' +
    'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
    'disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
  {
    variants: {
      variante: {
        primary:
          'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed',
        secondary: 'bg-muted text-foreground border border-border hover:bg-surface-soft',
        tertiary: 'bg-transparent text-foreground-soft hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
      },
      tamanho: {
        md: 'h-10 px-4 min-h-11', // 44px de alvo de toque para ações principais
        sm: 'h-9 px-3',
        icone: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: { variante: 'primary', tamanho: 'md' },
  },
);

export interface BotaoProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof variantesBotao> {}

export function Botao({ className, variante, tamanho, type, ...props }: BotaoProps) {
  return (
    <button
      // `type` explícito: sem ele, um botão dentro de <form> submete por padrão — pegadinha clássica.
      type={type ?? 'button'}
      className={cn(variantesBotao({ variante, tamanho }), className)}
      {...props}
    />
  );
}
