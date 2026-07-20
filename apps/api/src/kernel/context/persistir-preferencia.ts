import type { IncomingMessage } from 'node:http';
import type { Auth } from '../auth/auth.tokens';
import type { PrismaService } from '../db/prisma.service';

/**
 * Persistência da Organização escolhida na SESSÃO AUTENTICADA EXATA (Story 1.9).
 *
 * Isolado num arquivo próprio porque a escolha do mecanismo é uma decisão com justificativa, e
 * porque ela é o ponto do sistema onde um erro de escopo viraria "trocar a Organização da sessão de
 * OUTRA pessoa". Concentrar isso em uma função pequena é o que torna a garantia revisável.
 *
 * ── Por que a API oficial é tentada primeiro ────────────────────────────────────────────────────
 *
 * `auth.api.updateSession({ body, headers })` é o caminho documentado do Better Auth 1.6 para
 * campos adicionais de sessão, e resolve a sessão alvo pelos PRÓPRIOS headers — o escopo correto sai
 * de graça, sem o código precisar escolher um `id`.
 *
 * ── Por que existe um caminho alternativo ───────────────────────────────────────────────────────
 *
 * `activeOrganizationId` é declarado com `input: false` (`auth.factory.ts`), justamente para que
 * NENHUMA entrada de usuário o escreva — é o que impede um cliente de forjar a Organização ativa no
 * cadastro ou em qualquer payload. Esse mesmo flag pode fazer o Better Auth descartar o campo no
 * corpo do `updateSession`. **Remover o `input: false` para contornar isso está proibido, e com
 * razão: seria trocar um invariante de segurança por conveniência de implementação.**
 *
 * Quando a via oficial não persiste, a escrita é feita diretamente na linha de sessão, com o escopo
 * imposto no `where`:
 *
 *   · `id` da sessão resolvida pelo PRÓPRIO Better Auth a partir dos headers (nunca do corpo);
 *   · **`userId: accountId`** — a segunda trava. Mesmo que um `id` de sessão alheia vazasse para cá,
 *     o `updateMany` não casaria nenhuma linha. `AuthSession` é GLOBAL e sem RLS (AD-10: sessão é da
 *     PESSOA, não de uma Organização), então não há policy para servir de rede — a restrição
 *     precisa estar explícita, e está.
 *
 * `updateMany`, não `update`: com filtro composto, `update` exigiria uma chave única composta que
 * não existe; e `{ count: 0 }` é a resposta honesta para "essa sessão não é sua", em vez de uma
 * exceção que poderia ser confundida com falha de infraestrutura.
 */
export async function persistirOrganizacaoAtiva(
  auth: Auth,
  prisma: PrismaService,
  req: IncomingMessage,
  accountId: string,
  orgId: string,
): Promise<void> {
  const headers = paraHeaders(req.headers);

  // A sessão alvo é a desta requisição, resolvida pelo Better Auth. Nunca escolhida pelo cliente.
  const sessao = await auth.api.getSession({ headers });
  const sessionId = (sessao?.session as { id?: string } | undefined)?.id;
  if (!sessionId) {
    // Sem sessão não se chega aqui (o guard já exigiu principal); se chegou, falhar é o certo.
    throw new Error('sessão ausente ao persistir a Organização ativa');
  }

  // 1) Via oficial.
  try {
    await auth.api.updateSession({
      body: { activeOrganizationId: orgId } as Record<string, unknown>,
      headers,
    });
  } catch {
    // Erro aqui não é fatal: o passo 2 confere o resultado REAL e corrige. Engolir a exceção sem
    // verificar é que seria errado — e é justamente o que o passo 2 impede.
  }

  // 2) Confere o efeito REAL no banco. Esta verificação é o que transforma "a doc diz que funciona"
  //    em evidência: se o `input: false` descartou o campo, o valor não estará lá.
  const persistida = await prisma.authSession.findFirst({
    where: { id: sessionId, userId: accountId },
    select: { activeOrganizationId: true },
  });

  if (persistida?.activeOrganizationId === orgId) return;

  // 3) Escrita direta, restrita à sessão desta requisição E à conta autenticada.
  const { count } = await prisma.authSession.updateMany({
    where: { id: sessionId, userId: accountId },
    data: { activeOrganizationId: orgId },
  });

  if (count !== 1) {
    // Zero linhas = a sessão não pertence a esta conta. Não é caso esperado; é sinal de que algo
    // muito errado aconteceu no caminho da identidade, e seguir em frente seria pior que falhar.
    throw new Error('não foi possível persistir a Organização ativa na sessão da conta');
  }
}

/** Headers do Node → `Headers` do padrão web, preservando repetições (mesmo critério da 1.4). */
function paraHeaders(brutos: IncomingMessage['headers']): Headers {
  const headers = new Headers();
  for (const [chave, valor] of Object.entries(brutos)) {
    if (Array.isArray(valor)) valor.forEach((v) => headers.append(chave, v));
    else if (valor !== undefined) headers.append(chave, valor);
  }
  return headers;
}
