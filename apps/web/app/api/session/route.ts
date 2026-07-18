import { NextResponse, type NextRequest } from 'next/server';
import { getApiBaseUrl, getInternalHmac, getPublicOrigin } from '@/lib/env';
import { loginNaApi } from '@/lib/auth';
import { derivarIpValidadoDoXff } from '@/lib/client-ip';
import { ehMesmaOrigem } from '@/lib/session';

/**
 * Recebe o POST do formulário de Login, autentica na API interna (server-side) e faz o RELAY do
 * cookie de sessão para o browser. Sucesso → `/painel`; falha → volta ao `/login` com um motivo neutro.
 *
 * Relay VERBATIM do `Set-Cookie` da API: os atributos de segurança (`HttpOnly`/`Secure`/`SameSite`) e a
 * assinatura vêm prontos do Better Auth; reserializar arriscaria perder um deles.
 *
 * Redirects são RELATIVOS (`Location: /login`): atrás de proxy, `req.nextUrl.origin` é o bind
 * interno do container (`0.0.0.0:3000`), e um redirect absoluto montado com ele manda o browser
 * para fora do ar. O caminho relativo é resolvido pelo browser contra a origem em que ele já está
 * — a única sempre correta, sem depender de configuração nem de header.
 */
export const dynamic = 'force-dynamic';

/** 303 See Other com `Location` RELATIVA — nunca depende da origem interna do container. */
function redirecionar(destino: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { location: destino } });
}

export async function POST(req: NextRequest): Promise<Response> {
  const origemPublica = getPublicOrigin();

  // CSRF: só aceita o POST de login se for da MESMA ORIGEM (senão um form cross-site plantaria no
  // navegador da vítima a sessão do ATACANTE — login CSRF → vazamento cross-tenant). A origem
  // esperada é a PÚBLICA configurada, não a do `nextUrl` (que atrás de proxy é o bind interno e
  // nunca casaria com o `Origin` real do browser).
  if (!ehMesmaOrigem(req.headers.get('sec-fetch-site'), req.headers.get('origin'), origemPublica)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const form = await req.formData();
  const email = String(form.get('email') ?? '');
  const senha = String(form.get('senha') ?? '');

  // O `Origin` do relay é a origem pública — a que consta em CORS_ALLOWED_ORIGINS/trustedOrigins
  // da API. Com o valor do `nextUrl`, o Better Auth recusaria o login em produção.
  //
  // O IP do cliente vai junto (D-01): derivado da ÚLTIMA entrada do X-Forwarded-For — a única
  // que o Traefik escreveu vendo o socket; a ponta esquerda é a que um atacante controla. Sem
  // ele, o rate limit do login (G2) contaria a Web como origem única.
  const ipCliente = derivarIpValidadoDoXff(req.headers.get('x-forwarded-for'));
  const resultado = await loginNaApi(
    getApiBaseUrl(),
    email,
    senha,
    origemPublica,
    ipCliente,
    getInternalHmac(),
  );

  if (!resultado.ok) {
    return redirecionar(`/login?erro=${resultado.motivo}`);
  }

  const res = redirecionar('/painel');
  for (const cookie of resultado.cookies) res.headers.append('set-cookie', cookie);
  return res;
}
