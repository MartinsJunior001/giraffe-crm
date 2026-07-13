import { randomUUID } from 'node:crypto';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { PrismaClient } from '../../../generated/prisma';
import { getEnv, parseCorsOrigins } from '../config/env';
import type { LoginFailureService } from './login-failure.service';

/** Rota do login por e-mail no Better Auth. Constante porque dois hooks dependem dela. */
export const ROTA_LOGIN = '/sign-in/email';

/** G2, ratificado: 20 solicitações por IP em 15 minutos. */
const G2_MAX = 20;
const G2_JANELA_S = 15 * 60;

/**
 * Mensagem única para TODA falha de autenticação e para o 429.
 *
 * Uma mensagem diferente para "conta não existe" e "senha errada" é um oráculo de enumeração: o
 * atacante descobre quais e-mails existem sem nunca acertar uma senha. E um 429 que só dispara para
 * contas reais é o mesmo oráculo, com passos extras.
 */
const MENSAGEM_NEUTRA = 'Credenciais inválidas.';
const MENSAGEM_LIMITE = 'Muitas tentativas. Tente novamente mais tarde.';

/**
 * Constrói a instância do Better Auth.
 *
 * Recebe o `PrismaClient` e o contador de falhas por injeção — nada de singleton com estado global,
 * que tornaria impossível testar dois ambientes na mesma execução.
 */
export function criarAuth(prisma: PrismaClient, falhas: LoginFailureService) {
  const env = getEnv();

  const opcoes = {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',

    database: prismaAdapter(prisma, { provider: 'postgresql' }),

    // ── CSRF: a allowlist de origens é a MESMA do CORS ──────────────────────────────────────
    // O Better Auth recusa requisições cuja `Origin` não esteja aqui (e, em produção, recusa também
    // as sem `Origin`) — é a defesa contra um site terceiro disparar login/logout no navegador de
    // quem está logado.
    //
    // O default seria apenas o `baseURL` (a própria API, :3001). Só que quem faz login é o
    // navegador, a partir da Web (:3000): com o default, TODO login vindo do front seria rejeitado.
    // Foi o container de produção que mostrou isso — no ambiente de teste a checagem é relaxada, e a
    // suíte passava sem nunca tocar nela.
    //
    // Reusar `CORS_ALLOWED_ORIGINS` mantém uma allowlist só. Duas listas divergiriam, e a que
    // ninguém revisa é a que autoriza a origem errada.
    trustedOrigins: parseCorsOrigins(env.CORS_ALLOWED_ORIGINS),

    // ── D1: o `user` do Better Auth É o nosso `Account` ────────────────────────────────────
    // Uma identidade, uma tabela. A alternativa — `user` dona da sessão e `Account` dona da
    // Membership, sincronizadas para sempre — é a dívida que termina em "o usuário X viu os dados
    // do usuário Y".
    user: { modelName: 'Account' },
    session: {
      modelName: 'AuthSession',
      // `activeOrganizationId` é PEDIDO persistido, não autoridade. Quem decide se ele vale é o
      // OrgContextResolver (1.3), conferindo contra a Membership ATIVA a cada requisição. Se a
      // sessão fosse autoridade, suspender uma Membership não tiraria o acesso de ninguém.
      additionalFields: {
        activeOrganizationId: { type: 'string', required: false, input: false },
      },
    },
    // Ela guarda hash de senha e vínculos de provedor — não "contas". O nome original colidiria
    // com o nosso `Account` (nome de model em Prisma é único) e seria ativamente enganoso.
    account: { modelName: 'AuthCredential' },
    verification: { modelName: 'AuthVerification' },

    emailAndPassword: {
      enabled: true,

      // **Cadastro DESLIGADO.** Ligar `emailAndPassword` habilita, junto, o `/sign-up/email` — e
      // isso é autocadastro aberto: qualquer pessoa na internet cria uma conta na plataforma.
      //
      // Ninguém pediu isso. Esta Story entrega LOGIN; a entrada de novas contas se dá por convite
      // do Admin da Organização (Épico 8). Deixar o cadastro ligado "porque veio junto" seria
      // publicar uma superfície de ataque por descuido de configuração — e ela nasceria sem rate
      // limit próprio, sem verificação de e-mail e sem dono.
      disableSignUp: true,

      // Verificação de e-mail é da Story 1.10. Exigi-la aqui anteciparia escopo (Constitution II) e
      // deixaria esta Story sem caminho positivo demonstrável.
      requireEmailVerification: false,
    },

    // ── G2: solicitações por IP ────────────────────────────────────────────────────────────
    rateLimit: {
      enabled: true,
      // No BANCO, não em memória. `memory` (o padrão) não sobrevive a restart — o atacante zera a
      // contagem esperando o container reciclar — e não é compartilhado entre réplicas: com 3
      // instâncias, o limite efetivo TRIPLICA. Um limite assim não protege, decora.
      storage: 'database',
      modelName: 'RateLimit',
      window: G2_JANELA_S,
      max: 100,
      customRules: {
        [ROTA_LOGIN]: { window: G2_JANELA_S, max: G2_MAX },
      },
    },

    advanced: {
      // **Função, e não a string `'uuid'`.** Documentado: com `'uuid'` em PostgreSQL, o Better Auth
      // NÃO envia `id` e espera que o BANCO preencha via `gen_random_uuid()`. O adapter do Prisma,
      // porém, exige o campo no `create()` sempre que o schema não declara um default — o INSERT era
      // recusado e o login inteiro devolvia 500. Gerar o UUID aqui mantém o id sob controle da
      // aplicação e independe de default de coluna.
      database: { generateId: () => randomUUID() },

      // **Sem `trustedProxies` aqui — de propósito.** O `getIp()` do Better Auth só lê headers: ele
      // nunca vê o socket, então não tem como saber se quem enviou o `X-Forwarded-For` era o nosso
      // proxy ou o próprio atacante falando direto com o contêiner. Configurá-lo aqui daria a
      // impressão de uma defesa que não existe.
      //
      // Quem resolve o IP é o `AuthController`, a partir do endereço do socket (ver `client-ip.ts`).
      // O header que chega até aqui já vem saneado, com um único valor — e é justamente esse o
      // caminho que o Better Auth trata como confiável.
    },

    hooks: {
      /**
       * G1 — bloqueio ANTES de verificar a senha.
       *
       * A ordem é a regra inteira. Se checássemos depois, a 6ª tentativa com a senha CERTA passaria
       * — e o limite não limitaria coisa alguma: bastaria ao atacante acertar na tentativa seguinte
       * à quinta.
       *
       * O 429 é idêntico para conta existente e inexistente: um limite que só dispara para contas
       * reais é um oráculo de enumeração com passos extras.
       */
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== ROTA_LOGIN) return;

        const email = (ctx.body as { email?: unknown } | undefined)?.email;
        if (typeof email !== 'string' || email === '') return;

        if (await falhas.estaBloqueado(email)) {
          // Os headers são o TERCEIRO argumento do `APIError` — não uma chave do corpo. O corpo é
          // tipado `Record<string, any>`, então passá-los ali compila em silêncio, vira um campo do
          // JSON e NENHUM header HTTP é emitido. É o mesmo `X-Retry-After` que o rate limiter nativo
          // usa, para que o cliente veja um contrato só.
          throw new APIError(
            'TOO_MANY_REQUESTS',
            { message: MENSAGEM_LIMITE },
            // Contrato do G3: o cliente sabe quando voltar. Nenhum bloqueio permanente.
            { 'X-Retry-After': String(G2_JANELA_S) },
          );
        }
      }),

      /**
       * G1 — contabiliza a falha, ou limpa o contador no sucesso (G4).
       *
       * Só o contador do IDENTIFICADOR é limpo. O de IP (G2) **não** — se fosse, o atacante
       * intercalaria um login válido da própria conta a cada N tentativas e zeraria o antiabuso de
       * origem para sempre.
       */
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== ROTA_LOGIN) return;

        const email = (ctx.body as { email?: unknown } | undefined)?.email;
        if (typeof email !== 'string' || email === '') return;

        const devolvido = ctx.context.returned;
        const falhou = devolvido instanceof APIError;

        if (falhou) {
          await falhas.registrarFalha(email);
          return;
        }

        await falhas.limpar(email);
      }),
    },
  } satisfies BetterAuthOptions;

  return betterAuth(opcoes);
}

export type Auth = ReturnType<typeof criarAuth>;
export { MENSAGEM_NEUTRA, MENSAGEM_LIMITE, G2_MAX, G2_JANELA_S };
