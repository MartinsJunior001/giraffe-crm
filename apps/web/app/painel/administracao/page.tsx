import { redirect } from 'next/navigation';
import { obterEscopoAdmin } from '@/lib/contexto';

/**
 * Casca do Painel Administrativo (Story 8.1 · FR-33).
 *
 * **A guarda é do SERVIDOR, e este componente não a duplica.** Ele pergunta à API
 * (`/organizations/admin-scope`, protegida por `@Requer('administrar','Organizacao')`) e reflete a
 * resposta. Não há checagem de papel aqui — se houvesse, a segurança do Painel passaria a depender
 * de um valor que viajou até o cliente, e a fronteira deixaria de estar onde é imposta.
 *
 * **Negado NÃO renderiza conteúdo administrativo.** A área restrita não é escondida por CSS nem
 * marcada `hidden`: ela simplesmente **não entra no HTML**. A diferença é a que separa "o usuário
 * não vê" de "o conteúdo não foi enviado" — só a segunda resiste a quem abre o DevTools ou lê a
 * resposta crua.
 *
 * **Troca de Organização recarrega o escopo integralmente** (AC-3): `force-dynamic` + `no-store` na
 * busca fazem o `router.refresh()` do seletor (1.9) reexecutar isto com o contexto novo.
 *
 * **INV-ADMIN-02 — o que esta casca deliberadamente NÃO tem:** Financeiro, módulo de Estatísticas,
 * API/Tokens/Webhooks, contadores, gráficos ou qualquer "em breve" com número. Um card ilustrativo
 * seria pior que a ausência: ensinaria o Administrador a confiar num dado que não existe. As seções
 * reais chegam com as Stories que as tornam operacionais (8.2+).
 */
export const dynamic = 'force-dynamic';

export default async function AdministracaoPage() {
  const escopo = await obterEscopoAdmin();

  // Sessão inválida é caso de autenticação, não de autorização — volta ao Login, como o resto do
  // painel (1.7). Não é "negado": o usuário talvez seja Admin, só não está mais autenticado.
  if (!escopo.ok && escopo.motivo === 'sem-sessao') redirect('/login');

  if (!escopo.ok) {
    const indisponivel = escopo.motivo === 'indisponivel';
    return (
      <section aria-labelledby="titulo-admin" className="max-w-2xl">
        <h1 id="titulo-admin" className="text-xl font-semibold text-foreground">
          {indisponivel ? 'Não foi possível carregar' : 'Acesso restrito'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {indisponivel
            ? 'Não foi possível confirmar seu acesso agora. Tente novamente em instantes.'
            : 'Esta área é restrita aos administradores desta Organização.'}
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="titulo-admin">
      <h1 id="titulo-admin" className="text-xl font-semibold text-foreground">
        Administração
      </h1>
      {/* O nome vem do escopo confirmado pelo servidor — é a Organização ATUAL e apenas ela
          (INV-ADMIN-01). Nenhum identificador de Organização é aceito do cliente em rota alguma
          deste Painel, então não há superfície para alcançar ou descobrir outra. */}
      <p className="mt-2 text-sm text-muted-foreground">
        Organização: <strong className="font-medium text-foreground">{escopo.orgNome}</strong>
      </p>

      {/* Estrutura vazia por decisão (INV-ADMIN-02): as seções chegam com as Stories que as tornam
          operacionais — Convites e Membros (8.2–8.7), Auditoria (8.8). Nada de placeholder com
          número inventado, e nada de Financeiro/Estatísticas/API, que não pertencem à Fase 1. */}
      <p className="mt-6 text-sm text-muted-foreground">
        As ferramentas de administração desta Organização aparecerão aqui.
      </p>
    </section>
  );
}
