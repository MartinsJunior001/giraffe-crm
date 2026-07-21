/**
 * Chamadas à API interna, feitas SEMPRE no servidor (BFF).
 *
 * O browser fala apenas com a origem da Web; é este código, no servidor Next, que conversa com a API
 * interna (`API_BASE_URL`, sem `NEXT_PUBLIC_`) e faz o RELAY do cookie de sessão. Assim a API continua
 * inalcançável pelo browser, não há cookie cross-origin, e nada de segredo/URL interna vaza para o
 * cliente. O cookie do Better Auth é validado por ASSINATURA (independe de domínio), então guardá-lo
 * na origem da Web e reencaminhá-lo à API funciona.
 */

import { cabecalhoHop } from './internal-hop';

export type MotivoFalhaLogin = 'credenciais' | 'limite' | 'indisponivel';
export type ResultadoLogin =
  { ok: true; cookies: string[] } | { ok: false; motivo: MotivoFalhaLogin };

function lerSetCookies(res: Response): string[] {
  return res.headers.getSetCookie?.() ?? [];
}

/**
 * Autentica na API e devolve os `Set-Cookie` para reencaminhar ao browser.
 *
 * A falha é NEUTRA de propósito: qualquer resposta não-OK que não seja 429 vira `credenciais`, sem
 * distinguir "conta não existe" de "senha errada" — a neutralidade contra enumeração é herdada da API
 * (Story 1.4) e não pode ser desfeita aqui. O 429 vira `limite`; erro de rede vira `indisponivel`.
 */
export async function loginNaApi(
  baseUrl: string,
  email: string,
  senha: string,
  origin: string,
  ipCliente?: string,
  hmac?: { secret: string; keyVersion: number },
): Promise<ResultadoLogin> {
  const path = '/api/auth/sign-in/email';
  // Hop autenticado (D-01): com o segredo configurado, o IP do cliente vai DENTRO de um envelope
  // assinado (`x-internal-hop`), não como `x-forwarded-for` cru — a API só honra o IP com a prova, sem
  // depender do endereço (dinâmico) do container da Web. Sem o segredo (dev/CI), mantém o modo direto:
  // manda o XFF único já validado por `derivarIpValidadoDoXff`. Ausente o IP, nenhum dos dois vai.
  const hop = cabecalhoHop({ hmac, ipCliente, method: 'POST', path });
  const usaHop = Object.keys(hop).length > 0;
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      // `origin` é exigido pelo CSRF do Better Auth fora de teste; mandamos a origem da própria Web,
      // que está na allowlist (CORS_ALLOWED_ORIGINS/trustedOrigins).
      headers: {
        'content-type': 'application/json',
        origin,
        ...hop,
        ...(usaHop || ipCliente === undefined ? {} : { 'x-forwarded-for': ipCliente }),
      },
      body: JSON.stringify({ email, password: senha }),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, motivo: 'indisponivel' };
  }
  if (res.status === 429) return { ok: false, motivo: 'limite' };
  if (!res.ok) return { ok: false, motivo: 'credenciais' };
  return { ok: true, cookies: lerSetCookies(res) };
}

/**
 * Encerra a sessão CORRENTE na API (RN-012) e devolve os `Set-Cookie` de limpeza para reencaminhar.
 *
 * Best-effort: se a API não responder, ainda assim o chamador limpa o cookie local e manda ao Login —
 * um logout que só falha porque a rede piscou seria pior que inútil.
 */
export async function logoutNaApi(
  baseUrl: string,
  cookie: string,
  origin: string,
): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/api/auth/sign-out`, {
      method: 'POST',
      // Manda o `origin` (na allowlist) como o login faz: em produção o Better Auth confere a Origin, e
      // um sign-out sem ela poderia ser recusado — logout que falha em silêncio é pior que inútil.
      headers: { 'content-type': 'application/json', origin, cookie },
      body: '{}',
      cache: 'no-store',
    });
    return lerSetCookies(res);
  } catch {
    return [];
  }
}

import type { Papel } from './navegacao';

export type EstadoOrg =
  | { ok: true; orgId: string; orgNome: string; papel: Papel }
  | { ok: false; motivo: 'sem-sessao' | 'sem-organizacao' | 'indisponivel' };

/**
 * Confirma no SERVIDOR o contexto da Organização — a fonte de verdade é o backend, não o middleware.
 *
 * 401 = sem sessão válida (expirada/ausente) → volta ao Login. 403 = autenticado, mas sem Organização
 * ativa (Membership suspensa/removida, ou nenhuma) — estado honesto, não erro de credencial.
 */
export async function fetchOrgAtual(baseUrl: string, cookie: string): Promise<EstadoOrg> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/organizations/current`, {
      headers: { cookie },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, motivo: 'indisponivel' };
  }
  if (res.status === 401) return { ok: false, motivo: 'sem-sessao' };
  if (res.status === 403) return { ok: false, motivo: 'sem-organizacao' };
  if (!res.ok) return { ok: false, motivo: 'indisponivel' };
  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    papel?: Papel;
  };
  return body.id && body.name && body.papel
    ? { ok: true, orgId: body.id, orgNome: body.name, papel: body.papel }
    : { ok: false, motivo: 'sem-organizacao' };
}

/** Uma Organização elegível para troca (Story 1.9). Espelha o contrato de `GET /session/organizacoes`. */
export interface OrganizacaoElegivel {
  id: string;
  nome: string;
  papel: Papel;
}

export type EstadoOrganizacoes =
  | { ok: true; atual: string | null; organizacoes: OrganizacaoElegivel[] }
  | { ok: false; motivo: 'sem-sessao' | 'indisponivel' };

/**
 * Organizações que a conta pode escolher (Story 1.9) — só Memberships ACTIVE, decidido pelo SERVIDOR.
 *
 * A web nunca filtra nem completa esta lista: ela renderiza o que a API devolveu. Enumerar do lado do
 * cliente seria reconstruir uma regra de acesso fora de onde ela é imposta, e é assim que aparece uma
 * Organização inacessível numa tela.
 *
 * 401 = sem sessão (volta ao Login). Qualquer outra falha vira `indisponivel` — sem vazar URL interna,
 * corpo de erro ou stack (NFR-1).
 */
export async function fetchOrganizacoes(
  baseUrl: string,
  cookie: string,
): Promise<EstadoOrganizacoes> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/session/organizacoes`, {
      headers: { cookie },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, motivo: 'indisponivel' };
  }
  if (res.status === 401) return { ok: false, motivo: 'sem-sessao' };
  if (!res.ok) return { ok: false, motivo: 'indisponivel' };

  const body = (await res.json().catch(() => ({}))) as {
    atual?: string | null;
    organizacoes?: OrganizacaoElegivel[];
  };
  if (!Array.isArray(body.organizacoes)) return { ok: false, motivo: 'indisponivel' };
  return { ok: true, atual: body.atual ?? null, organizacoes: body.organizacoes };
}

/**
 * Troca a Organização ativa na API (Story 1.9). Devolve só o desfecho — a autoridade é do servidor.
 *
 * O 404 da API é UNIFORME para inexistente/sem-Membership/inativa (não-enumeração), e aqui ele
 * permanece indistinguível de propósito: traduzi-lo em mensagens diferentes na UI desfaria, na
 * camada de apresentação, a proteção que o backend construiu.
 */
export async function trocarOrganizacaoNaApi(
  baseUrl: string,
  cookie: string,
  origem: string,
  orgId: string,
): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch(`${baseUrl}/session/organizacao`, {
      method: 'POST',
      headers: { cookie, origin: origem, 'content-type': 'application/json' },
      body: JSON.stringify({ orgId }),
      cache: 'no-store',
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * Escopo administrativo (Story 8.1). `negado` é estado de PRODUTO, não erro: o servidor respondeu
 * e disse não.
 */
export type EstadoAdmin =
  | { ok: true; orgId: string; orgNome: string }
  | { ok: false; motivo: 'sem-sessao' | 'negado' | 'indisponivel' };

/**
 * Confirma no SERVIDOR o acesso ao Painel Administrativo (Story 8.1).
 *
 * A web NÃO decide quem entra: ela pergunta. O `papel` que a casca já tem (`fetchOrgAtual`) é dado
 * de apresentação — usá-lo como fronteira faria a segurança do Painel depender de um valor que
 * viajou até o cliente. Aqui quem nega é o `AuthzGuard` da API (deny-by-default), e esta função só
 * traduz a resposta.
 *
 * 401 = sem sessão → Login. **403 = negado** (não-Admin, ou Membership suspensa/encerrada, que
 * sequer resolve contexto). Os dois casos colapsam num só motivo de propósito: distinguir "você não
 * é Admin" de "sua Membership foi suspensa" seria devolver ao cliente informação sobre o próprio
 * estado administrativo que a negação existe para não detalhar.
 */
export async function fetchEscopoAdmin(baseUrl: string, cookie: string): Promise<EstadoAdmin> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/organizations/admin-scope`, {
      headers: { cookie },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, motivo: 'indisponivel' };
  }
  if (res.status === 401) return { ok: false, motivo: 'sem-sessao' };
  if (res.status === 403) return { ok: false, motivo: 'negado' };
  if (!res.ok) return { ok: false, motivo: 'indisponivel' };

  const body = (await res.json().catch(() => ({}))) as { id?: string; name?: string };
  return body.id && body.name
    ? { ok: true, orgId: body.id, orgNome: body.name }
    : { ok: false, motivo: 'indisponivel' };
}
