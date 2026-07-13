import Link from 'next/link';
import { Botao } from '@/components/ui/button';
import { EstadoErro, EstadoVazio } from '@/components/ui/estado';
import { obterContexto } from '@/lib/contexto';

/**
 * Conteúdo do Dashboard dentro da casca (Story 1.7 + estados honestos da 1.8).
 *
 * A casca (layout) já resolveu o contexto e já redirecionou quem não tem sessão. Aqui mostramos SÓ a
 * rota/casca do Dashboard — **sem indicadores de FR-4** (que são do Épico 7) e **sem dado fictício**.
 * Os dois ramos sem conteúdo usam os estados honestos da 1.8, que os tornam **distinguíveis** (AC2):
 * "sem Organização" é um vazio legítimo (`status`); "indisponível" é uma falha (`alert`) com
 * recuperação real (recarregar).
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
        <EstadoVazio
          titulo="Nenhuma Organização ativa"
          descricao="Você está autenticado, mas ainda não pertence a uma Organização ativa."
        />
      ) : (
        <EstadoErro
          titulo="Não foi possível confirmar seu contexto"
          descricao="Isto costuma ser temporário. Tente novamente em instantes."
          acao={
            <Link
              href="/painel"
              className="inline-flex items-center rounded-[--radius-button] px-3 py-2 text-sm font-semibold text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Tentar novamente
            </Link>
          }
        />
      )}

      <form method="post" action="/logout" className="mt-2">
        <Botao type="submit" variante="secondary" tamanho="sm">
          Sair
        </Botao>
      </form>
    </section>
  );
}
