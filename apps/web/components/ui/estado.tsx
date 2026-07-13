import { Inbox, Lock, LoaderCircle, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Estados honestos de sistema (Story 1.8). Cada estado combina **cor semântica + texto + ícone** —
 * nunca só cor (EXPERIENCE §89). Usa sempre **tokens** (globals.css), nunca hex cru.
 *
 * Semântica de leitura de tela:
 * - `status` (padrão) para carregando / vazio / sem-permissão — informativo, não urgente;
 * - `alert` para erro — o leitor de tela interrompe e anuncia.
 * Carregando marca `aria-busy`, o que o distingue de "vazio" mesmo compartilhando `role="status"`
 * (AC2: zero legítimo ≠ carregando ≠ falha).
 */

type Tom = 'neutro' | 'erro';

const CLASSE_ICONE: Record<Tom, string> = {
  neutro: 'text-muted-foreground',
  erro: 'text-destructive',
};

interface EstadoProps {
  icone: LucideIcon;
  titulo: string;
  descricao?: string;
  tom?: Tom;
  papel?: 'status' | 'alert';
  /** Marca `aria-busy` — usado por "carregando" para se distinguir de "vazio". */
  ocupado?: boolean;
  /** Ação de recuperação REAL (ex.: link para recarregar). Omitida quando não há ação honesta. */
  acao?: ReactNode;
  iconeClassName?: string;
  className?: string;
}

/** Bloco de estado base: ícone + título + descrição + ação opcional, centralizado. */
export function Estado({
  icone: Icone,
  titulo,
  descricao,
  tom = 'neutro',
  papel = 'status',
  ocupado,
  acao,
  iconeClassName,
  className,
}: EstadoProps) {
  return (
    <div
      role={papel}
      aria-busy={ocupado || undefined}
      className={cn(
        'flex flex-col items-center gap-3 rounded-[--radius-card] border border-border ' +
          'bg-surface-soft px-6 py-10 text-center',
        className,
      )}
    >
      <Icone aria-hidden className={cn('size-8', CLASSE_ICONE[tom], iconeClassName)} />
      <div className="flex flex-col gap-1">
        <p
          className={cn(
            'text-sm font-semibold',
            tom === 'erro' ? 'text-destructive' : 'text-foreground',
          )}
        >
          {titulo}
        </p>
        {descricao ? <p className="text-sm text-muted-foreground">{descricao}</p> : null}
      </div>
      {acao ? <div className="mt-1">{acao}</div> : null}
    </div>
  );
}

/** Carregando — informativo e "ocupado". Ícone anima só quando o usuário não pediu menos movimento. */
export function Carregando({
  titulo = 'Carregando…',
  descricao,
}: {
  titulo?: string;
  descricao?: string;
}) {
  return (
    <Estado
      icone={LoaderCircle}
      titulo={titulo}
      descricao={descricao}
      papel="status"
      ocupado
      iconeClassName="motion-safe:animate-spin"
    />
  );
}

/** Vazio legítimo — zero real, NÃO é falha (sem tom de erro, sem `alert`). */
export function EstadoVazio({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return <Estado icone={Inbox} titulo={titulo} descricao={descricao} papel="status" />;
}

/** Erro / indisponibilidade — `alert` + tom `erro`. `acao` só quando houver recuperação real. */
export function EstadoErro({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <Estado
      icone={TriangleAlert}
      titulo={titulo}
      descricao={descricao}
      tom="erro"
      papel="alert"
      acao={acao}
    />
  );
}

/**
 * Sem permissão — mensagem **genérica**, não-reveladora (INV-REPORT-01): não recebe nem exibe nome
 * de recurso, e não oferece link para ele. É estado informativo (`status`), não falha do sistema.
 */
export function SemPermissao({
  titulo = 'Você não tem acesso a este conteúdo.',
  descricao,
}: {
  titulo?: string;
  descricao?: string;
}) {
  return <Estado icone={Lock} titulo={titulo} descricao={descricao} papel="status" />;
}
