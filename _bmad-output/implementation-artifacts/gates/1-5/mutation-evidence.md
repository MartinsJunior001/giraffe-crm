# Evidência de mutação — Story 1.5 (fase vermelha dos invariantes críticos)

> Processo crítico (item 7 do checkpoint): aplicar cada mutação a um invariante crítico, confirmar que
> o(s) teste(s) correspondente(s) fica(m) VERMELHO(S), reverter. Um teste que não falha sob mutação não
> guarda nada. Todas executadas em 2026-07-13 contra PostgreSQL real.

| # | Mutação aplicada | Onde | Teste(s) que ficaram VERMELHOS | Observação |
|---|---|---|---|---|
| **M1** | Provider passa a aceitar requisição mesmo sem sessão válida (`if (!sessao?.user?.id) return { accountId }`) — remove a exigência de sessão/expiração | `sessao-principal.provider.ts` | **TS-04** (inatividade→401) e **TS-05** (adulterada→401) | A expiração/assinatura é imposta pelo Better Auth e invocada pelo provider; a mutação que a anula vive nessa fronteira. Os testes pegam. |
| **M2** | `session.disableSessionRefresh: true` — impede o deslize | `auth.factory.ts` | **TS-03** (renovação após updateAge) | Confirma que sem o refresh a sessão ativa deixaria de renovar. |
| **M3** | `advanced.useSecureCookies: false` — remove `Secure` mesmo com baseURL https | `auth.factory.ts` | **TS-07** (cookie de produção com Secure/HttpOnly) | Confirma que o cookie de produção perde o `Secure`. |
| **M4** | `session.cookieCache: { enabled: true, maxAge: 300 }` — cache de sessão em cookie assinado | `auth.factory.ts` | **TS-06** (revogação imediata pós sign-out) | **Revelador:** após o sign-out, `getSession` **ainda retornou o usuário Iris** do cache — exatamente a janela em que uma sessão revogada continua aceita. É o motivo de `cookieCache` ficar desabilitado. |

Todas as mutações foram **revertidas** após a prova; a suíte da 1.5 voltou a **13/13 verde** e o `git diff`
de `apps/api/src/kernel/auth/` mostra apenas a config de sessão pretendida (23 linhas no `auth.factory.ts`),
sem resíduo no provider.

## Débito descoberto durante o TS-10 (registrar — pré-existente da 1.4, fora do escopo da 1.5)

**D-06 — rate limiter em banco abre uma transação por requisição de `/api/auth/*`.** Sob rajada
concorrente de requisições **diretas** a endpoints do Better Auth (ex.: 8 `get-session` simultâneos), o
`incrementOne` do rate limiter (`storage: 'database'`, configurado na 1.4) roda dentro de
`_transactionWithCallback`; com múltiplos pools de PrismaClient no processo de teste, algumas transações
não adquirem conexão a tempo e a requisição vira **500** ("Unable to start a transaction in the given
time") em vez de ser servida/limitada.

- **Impacto real:** baixo. É majoritariamente artefato da pressão de pools do harness de teste (vários
  apps + clients no mesmo processo). Em produção, um app único com pool adequado absorve rajadas típicas;
  no pior caso (flood de login), o atacante recebe 500 em vez de 429 — **não é falha de segurança** (não
  concede acesso), é robustez/observabilidade.
- **Não afeta a jornada de sessão:** a validação de sessão do app (`/organizations/current` → provider →
  `auth.api.getSession`) **não** passa pelo rate limiter HTTP, então o ciclo de vida da sessão e o TS-10
  (renovação concorrente pela rota de domínio) são verdes e estáveis.
- **Encaminhamento:** débito para o gate de staging/observabilidade (aumentar pool/`maxWait`, ou tornar o
  incremento do rate limiter não-transacional). Não é corrigido na 1.5 (mudança do rate limiter da 1.4,
  fora do escopo).
