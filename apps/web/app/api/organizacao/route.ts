import { NextResponse, type NextRequest } from 'next/server';
import { trocarOrganizacaoNaApi } from '@/lib/auth';
import { getApiBaseUrl, getPublicOrigin } from '@/lib/env';
import { ehMesmaOrigem } from '@/lib/session';

/**
 * Troca a Organização ativa (Story 1.9), pelo SERVIDOR — o browser nunca fala com a API interna.
 *
 * Mesmo racional do login (`app/api/session/route.ts`) e do logout: a origem esperada é a PÚBLICA
 * configurada (`WEB_PUBLIC_ORIGIN`), nunca `req.nextUrl.origin`, que atrás de proxy é o bind interno
 * do container e jamais casaria com o `Origin` real do browser.
 *
 * **CSRF importa especialmente aqui.** Sem a checagem de mesma origem, um formulário em site alheio
 * poderia trocar a Organização ativa da vítima sem que ela percebesse — e a requisição seguinte dela
 * operaria noutro tenant. Não é escalonamento de privilégio (a API revalida a Membership e só aceita
 * Organização onde ela já tem acesso), mas é indução a operar no contexto errado: criar um Card no
 * Pipe da Organização errada é dano real.
 *
 * A resposta é deliberadamente magra: `{ ok }` e o status. O 404 uniforme da API (inexistente /
 * sem Membership / inativa) não é traduzido em motivos distintos — desfazer a não-enumeração na
 * camada de apresentação anularia a proteção construída no backend.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  const origemPublica = getPublicOrigin();

  if (!ehMesmaOrigem(req.headers.get('sec-fetch-site'), req.headers.get('origin'), origemPublica)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const corpo = (await req.json().catch(() => null)) as { orgId?: unknown } | null;
  const orgId = corpo?.orgId;
  if (typeof orgId !== 'string' || orgId.length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const cookie = req.headers.get('cookie') ?? '';
  const resultado = await trocarOrganizacaoNaApi(getApiBaseUrl(), cookie, origemPublica, orgId);

  // O status da API é repassado (401/404/400/…), mas o CORPO não: nada do erro interno atravessa.
  return NextResponse.json(
    { ok: resultado.ok },
    { status: resultado.ok ? 200 : resultado.status || 502 },
  );
}
