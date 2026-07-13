import { Inject, Injectable } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import type { Principal, PrincipalProvider } from '../context/principal.provider';
import { AUTH, type Auth } from './auth.tokens';

/**
 * A identidade vem da SESSÃO VALIDADA no servidor. De mais nada.
 *
 * Esta classe substitui o `SemSessaoPrincipalProvider` da Story 1.3 — e é a única coisa que a 1.4
 * troca no caminho de autorização. O `TenantContextGuard` e o `OrgContextResolver` não mudam uma
 * linha: era exatamente para isso que a inversão de dependência existia.
 *
 * O que NÃO é fonte de identidade aqui: nenhum header, nenhum campo de corpo, nenhum parâmetro de
 * rota. Se um deles pudesse dizer "eu sou a conta X", teríamos construído um bypass de autenticação
 * com aparência de conveniência.
 */
@Injectable()
export class SessaoPrincipalProvider implements PrincipalProvider {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async resolver(req: IncomingMessage): Promise<Principal | null> {
    // O Better Auth valida assinatura e expiração do cookie de sessão. Sessão inválida ou expirada
    // devolve `null` — que o guard traduz em 401. Não é erro: é ausência, e a diferença importa.
    const sessao = await this.auth.api.getSession({
      headers: paraHeaders(req.headers),
    });

    if (!sessao?.user?.id) return null;

    // `user.id` É o `Account.id` — porque o `user` do Better Auth É a nossa tabela `Account` (D1).
    // Não há tradução, não há tabela de-para, não há sincronização que possa divergir.
    return { accountId: sessao.user.id };
  }
}

/**
 * Converte os headers do Node (`IncomingHttpHeaders`) para o `Headers` do padrão web, que é o que o
 * Better Auth espera.
 *
 * Headers repetidos chegam do Node como array; `append` preserva **todos** em vez de descartar
 * silenciosamente os extras. Descartar seria a mesma assimetria que abre request smuggling — o
 * proxy vê um conjunto de headers, a aplicação vê outro.
 */
function paraHeaders(brutos: IncomingMessage['headers']): Headers {
  const headers = new Headers();
  for (const [nome, valor] of Object.entries(brutos)) {
    if (valor === undefined) continue;
    if (Array.isArray(valor)) {
      for (const v of valor) headers.append(nome, v);
    } else {
      headers.append(nome, valor);
    }
  }
  return headers;
}
