import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { PrismaClient } from '../../../generated/prisma';
import { getEnv } from '../config/env';
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
 * Lista de proxies confiáveis, a partir do ambiente. **Vazia por padrão** — e isso é a decisão.
 *
 * Confiar em `X-Forwarded-For` sem saber quem o escreveu é o mesmo que não ter limite por IP: o
 * atacante forja o header e cada requisição chega de um "IP" novo, de modo que o G2 nunca dispara.
 * Com a lista vazia, o Better Auth cai no IP do **socket**, que ninguém pode forjar.
 *
 * O que NÃO se faz aqui: colocar uma faixa privada ampla (`10.0.0.0/8`) "porque o proxy está na rede
 * interna". Isso declararia confiável qualquer coisa dentro da rede — inclusive um contêiner
 * comprometido. São os endereços dos NOSSOS proxies, e só. Os do Coolify entram quando forem
 * verificados contra o ambiente real (gate de staging), não por suposição.
 */
function proxiesConfiaveis(): string[] {
  return getEnv()
    .TRUSTED_PROXY_IPS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

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
      // Verificação de e-mail é da Story 1.10. Exigi-la aqui anteciparia escopo (Constitution II) e
      // deixaria a Story sem caminho positivo demonstrável.
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
      // Os ids gerados precisam caber em `@db.Uuid` (o `Account.id` é UUID).
      database: { generateId: 'uuid' },
      ipAddress: {
        // D5. Vazio ⇒ IP do socket. Ver `proxiesConfiaveis()`.
        trustedProxies: proxiesConfiaveis(),
      },
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
          throw new APIError('TOO_MANY_REQUESTS', {
            message: MENSAGEM_LIMITE,
            // Contrato do G3: o cliente sabe quando voltar. Nenhum bloqueio permanente.
            headers: { 'X-Retry-After': String(G2_JANELA_S) },
          });
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
