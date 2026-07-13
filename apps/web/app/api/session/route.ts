import { NextResponse, type NextRequest } from 'next/server';
import { getApiBaseUrl } from '@/lib/env';
import { loginNaApi } from '@/lib/auth';
import { ehMesmaOrigem } from '@/lib/session';

/**
 * Recebe o POST do formulário de Login, autentica na API interna (server-side) e faz o RELAY do
 * cookie de sessão para o browser. Sucesso → `/painel`; falha → volta ao `/login` com um motivo neutro.
 *
 * Relay VERBATIM do `Set-Cookie` da API: os atributos de segurança (`HttpOnly`/`Secure`/`SameSite`) e a
 * assinatura vêm prontos do Better Auth; reserializar arriscaria perder um deles.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  // CSRF: só aceita o POST de login se for da MESMA ORIGEM (senão um form cross-site plantaria no
  // navegador da vítima a sessão do ATACANTE — login CSRF → vazamento cross-tenant).
  if (
    !ehMesmaOrigem(req.headers.get('sec-fetch-site'), req.headers.get('origin'), req.nextUrl.origin)
  ) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const form = await req.formData();
  const email = String(form.get('email') ?? '');
  const senha = String(form.get('senha') ?? '');

  const resultado = await loginNaApi(getApiBaseUrl(), email, senha, req.nextUrl.origin);

  if (!resultado.ok) {
    const destino = new URL('/login', req.nextUrl.origin);
    destino.searchParams.set('erro', resultado.motivo);
    return NextResponse.redirect(destino, { status: 303 });
  }

  const res = NextResponse.redirect(new URL('/painel', req.nextUrl.origin), { status: 303 });
  for (const cookie of resultado.cookies) res.headers.append('set-cookie', cookie);
  return res;
}
