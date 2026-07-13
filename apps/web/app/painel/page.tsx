import { Botao } from '@/components/ui/button';
import { obterContexto } from '@/lib/contexto';

/**
 * Conteúdo do Dashboard dentro da casca (Story 1.7).
 *
 * A casca (layout) já resolveu o contexto e já redirecionou quem não tem sessão. Aqui mostramos SÓ a
 * rota/casca do Dashboard — **sem indicadores de FR-4** (que são do Épico 7) e **sem dado fictício**.
 * O estado honesto do contexto (org ativa × sem-org × indisponível) é preservado, herdado da 1.5.
 */
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const estado = await obterContexto();

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>

      {estado.ok ? (
        <p className="text-sm text-muted-foreground">
          Você está em <span className="font-medium text-foreground">{estado.orgNome}</span>. Os
          indicadores chegam em uma etapa futura — por ora, esta é a casca navegável.
        </p>
      ) : estado.motivo === 'sem-organizacao' ? (
        <p className="text-sm text-muted-foreground">
          Você está autenticado, mas sem Organização ativa.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Não foi possível confirmar seu contexto agora. Tente novamente.
        </p>
      )}

      <form method="post" action="/logout" className="mt-2">
        <Botao type="submit" variante="secondary" tamanho="sm">
          Sair
        </Botao>
      </form>
    </section>
  );
}
