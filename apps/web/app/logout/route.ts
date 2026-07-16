import { NextResponse, type NextRequest } from 'next/server';
import { getApiBaseUrl, getPublicOrigin } from '@/lib/env';
import { logoutNaApi } from '@/lib/auth';
import { ehMesmaOrigem } from '@/lib/session';

/**
 * Encerra a sessão CORRENTE (RN-012) e volta ao Login. Relay do `Set-Cookie` de limpeza da API para
 * apagar o cookie no browser. Sem revogação global (isso é 1.10/1.12/1.13).
 *
 * Origem e redirect seguem o mesmo racional do login (`app/api/session/route.ts`): a origem
 * esperada/enviada é a PÚBLICA configurada (`WEB_PUBLIC_ORIGIN`), nunca `req.nextUrl.origin`
 * (bind interno atrás de proxy), e o redirect é RELATIVO.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  const origemPublica = getPublicOrigin();

  // CSRF: um POST cross-site não pode forçar logout da vítima.
  if (!ehMesmaOrigem(req.headers.get('sec-fetch-site'), req.headers.get('origin'), origemPublica)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const cookie = req.headers.get('cookie') ?? '';
  const limpeza = await logoutNaApi(getApiBaseUrl(), cookie, origemPublica);

  const res = new NextResponse(null, { status: 303, headers: { location: '/login' } });
  for (const c of limpeza) res.headers.append('set-cookie', c);
  return res;
}
