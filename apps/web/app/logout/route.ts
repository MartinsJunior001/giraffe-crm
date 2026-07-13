import { NextResponse, type NextRequest } from 'next/server';
import { getApiBaseUrl } from '@/lib/env';
import { logoutNaApi } from '@/lib/auth';
import { ehMesmaOrigem } from '@/lib/session';

/**
 * Encerra a sessão CORRENTE (RN-012) e volta ao Login. Relay do `Set-Cookie` de limpeza da API para
 * apagar o cookie no browser. Sem revogação global (isso é 1.10/1.12/1.13).
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  // CSRF: um POST cross-site não pode forçar logout da vítima.
  if (
    !ehMesmaOrigem(req.headers.get('sec-fetch-site'), req.headers.get('origin'), req.nextUrl.origin)
  ) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const cookie = req.headers.get('cookie') ?? '';
  const limpeza = await logoutNaApi(getApiBaseUrl(), cookie, req.nextUrl.origin);

  const res = NextResponse.redirect(new URL('/login', req.nextUrl.origin), { status: 303 });
  for (const c of limpeza) res.headers.append('set-cookie', c);
  return res;
}
