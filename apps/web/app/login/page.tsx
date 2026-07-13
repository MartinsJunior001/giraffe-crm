/**
 * Login mínimo (Story 1.5). UI enxuta de propósito — a casca rica e o design system são a 1.7.
 *
 * O formulário posta para `/api/session` (route handler no servidor), que autentica na API interna e
 * reencaminha o cookie. Sem JavaScript de cliente: funciona como um POST de formulário puro.
 */
export const dynamic = 'force-dynamic';

const MENSAGENS: Record<string, string> = {
  // Neutra: não diz se a conta existe. A distinção seria um oráculo de enumeração (Story 1.4).
  credenciais: 'E-mail ou senha inválidos.',
  limite: 'Muitas tentativas. Tente novamente mais tarde.',
  indisponivel: 'Serviço indisponível no momento. Tente novamente.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const mensagem = erro ? MENSAGENS[erro] : undefined;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Entrar — Giraffe CRM</h1>

      {mensagem && (
        <p role="alert" className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700">
          {mensagem}
        </p>
      )}

      <form method="post" action="/api/session" className="flex w-full max-w-xs flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span>E-mail</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="username"
            className="rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Senha</span>
          <input
            type="password"
            name="senha"
            required
            autoComplete="current-password"
            className="rounded-md border px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded-md border px-4 py-2 font-medium">
          Entrar
        </button>
      </form>
    </main>
  );
}
