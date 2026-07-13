# pre-implementation-check — Story 1.4

2026-07-13 · Veredito: **APROVADO COM RESSALVAS** → `STORY 1.4 — READY FOR IMPLEMENT`

## Pré-requisitos

| Item | Estado |
| ---- | ------ |
| Gate de Segurança (limite de tentativas / rate limit) | ✅ **RATIFICADO** (G1–G6, 2026-07-13) |
| Dependências (Stories 1.2 e 1.3) | ✅ `done` e integradas no `main` |
| `context7-check` | ✅ executado — 4 achados, todos incorporados ao plano |
| Spec Kit | ✅ `spec.md`, `plan.md`, `tasks.md` |
| Artefatos autoritativos | ✅ intocados |

## Riscos identificados, e como o plano os endereça

| # | Risco | Endereçamento |
| - | ----- | ------------- |
| R1 | **Duas tabelas de identidade.** O Better Auth traria seu próprio `user`, e passaríamos a ter `user` (dona da sessão) e `Account` (dona da Membership) sincronizados para sempre. Divergência entre elas é bug de identidade — a classe que termina em "o usuário X viu os dados do usuário Y". | **D1:** `user → Account`. Uma identidade, uma tabela. |
| R2 | **G1 inexistente por presunção.** O rate limiter nativo chaveia por IP e conta solicitações; se presumíssemos que cobre o gate, a proteção por conta seria configuração que não faz nada. | **D3:** G1 é contador próprio; G2 é nativo. Não se fundem. |
| R3 | **G2 contornável.** Confiar em `X-Forwarded-For` cru ⇒ o atacante forja o header e cada requisição vem de um IP novo. | **D5:** `trustedProxies` explícito por ambiente, vazio por padrão; sem proxy confiável ⇒ IP do socket. Teste de spoofing **obrigatório**. |
| R4 | **PII na tabela de contadores.** E-mail em claro cria um segundo cadastro de e-mails fora do `Account`; um dump vira lista de usuários. | **D4:** chave = HMAC do identificador normalizado, com prefixo de finalidade e segredo de ambiente. |
| R5 | ***Lost update*** **sob concorrência** — que é justamente o regime de um ataque de força bruta. | **D4:** `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, instrução única. Proibido `SELECT`-depois-`UPDATE`. |
| R6 | **Rotação do HMAC zerando contadores em silêncio** — um atacante em curso teria o contador zerado, e ninguém perceberia. | **D6:** segredo versionado; contadores antigos expiram com a janela (custo máximo: 15 min); rotação emite `auth.hmac.rotated`. |
| R7 | **Enumeração por timing** — a mesma mensagem não basta se o caminho "conta não existe" for mais barato. | **D7:** confirmar na versão fixada **e cobrir com teste** (corpo, status, formato e ordem de grandeza do tempo). |
| R8 | **Privilégio excessivo nas tabelas novas.** Onde a RLS não alcança, quem nega é o GRANT (lição reproduzida na 1.2). | **D2:** GRANT mínimo; `DELETE` em `Account` **continua proibido** (a cascata da FK atravessa row security). Teste que prova o escopo de cada privilégio novo. |

## Ressalvas (condições de aprovação)

1. **Nenhuma faixa de IP do Coolify será inventada agora.** A validação contra o proxy real fica
   registrada como **gate de staging** (T016). Configurar hoje uma faixa "provável" seria pior que não
   configurar: daria a aparência de proteção.
2. **CR-09 permanece aberto** e **não** é resolvido aqui (D8). `/ready` precisa de rate limiting **na
   borda** — camada e propósito diferentes do login. **Bloqueia o `STAGING APPROVED`.**
3. **Escopo do G6 respeitado:** apenas os endpoints de autenticação **introduzidos por esta Story**.
   Recuperação de senha e verificação de e-mail recebem regras próprias nas Stories responsáveis —
   antecipá-las violaria a Constitution II.

## Veredito

**APROVADO COM RESSALVAS.** As três ressalvas são registros, não bloqueios: nenhuma delas impede a
implementação, e todas estão rastreadas em `tasks.md`.

`STORY 1.4 — READY FOR IMPLEMENT`
