# Spec — Story 1.5: Continuidade de sessão, logout e proteção de rotas

> Compacto (risco CRITICAL-FOCUSED, superfície de implementação pequena). Fonte de intenção:
> `_bmad-output/implementation-artifacts/1-5-continuidade-de-sessao-logout-e-protecao-de-rotas.md`.

## Contexto

A Story 1.4 entregou o login e a sessão do Better Auth, com `SessaoPrincipalProvider` já validando o
cookie (assinatura + expiração) via `getSession`, e o `OrgContextResolver` já revalidando Membership
**ativa** por requisição. Esta Story **não reescreve** esse caminho: ela (1) torna **explícitos** os
parâmetros do ciclo de vida da sessão e das flags de cookie, (2) entrega o **logout** da sessão corrente,
(3) entrega a **proteção de rota** na Web (UX), e (4) **prova** por teste os invariantes que já são
estruturais (revalidação de Membership, expiração, isolamento). Nenhuma migration.

## Requisitos funcionais

### Ciclo de vida da sessão

- **FR-501** — A sessão persiste em banco (`AuthSession`) e é validada a cada requisição; requisições
  subsequentes não exigem novo login enquanto a sessão for válida.
- **FR-502** — Expiração por **inatividade**: `expiresIn=7 dias`, `updateAge=1 dia` (deslize por
  atividade). **Sem teto absoluto** — uma sessão ativa renova indefinidamente.
- **FR-503** — Uso **antes** de `updateAge` **não** reescreve a expiração (evita UPDATE por requisição);
  uso **depois** de `updateAge` renova por `expiresIn`.
- **FR-504** — Sessão expirada/adulterada ⇒ **falha fechada** (getSession → null → 401), nunca 200
  degradado.

### Logout e revogação

- **FR-505** — Logout via `POST /api/auth/sign-out` invalida **somente a sessão corrente** (RN-012) e
  limpa o cookie; outras sessões da mesma Account permanecem.
- **FR-506** — Revogação é **imediata**: `cookieCache` desabilitado, sem janela de cache assinado
  aceitando sessão revogada.

### Cookie

- **FR-507** — Cookie de sessão `HttpOnly` (sempre) e `Secure` (produção); dev (http) permanece usável
  **sem** afrouxar produção. `SameSite` compatível com a topologia (`lax` na baseline same-origin/dev).
- **FR-508** — Nenhum token de sessão / cookie aparece em log, erro ou resposta (redaction efetiva).

### Autorização (invariante, não novo código)

- **FR-509** — Sessão é **identidade, não autorização**. Membership suspensa/encerrada ⇒ **403** ao
  acessar a Organização (revalidação por requisição pelo `OrgContextResolver`). Sessão não dispensa a
  revalidação, nem cacheia a decisão entre requisições.
- **FR-510** — Isolamento-mãe pela via da sessão: uma sessão válida de uma Organização não obtém contexto
  nem dados de outra.

### Proteção de rota (Web)

- **FR-511** — Rota protegida sem sessão ⇒ redireciona ao `/login` (middleware, **UX**); a página
  protegida confirma no **servidor** (via API) e a negação real é do backend (401/403).
- **FR-512** — Login mínimo (`/login`) posta à API interna com `credentials:'include'`, trata estados
  honestos (credencial inválida → mensagem neutra; 429 → aviso de limite). Controle de logout que chama
  o sign-out e volta ao `/login`.

## Critérios de sucesso (mapeados aos testes TS-01..TS-11 da Story)

- **SC-501** (FR-501) → TS-01 · **SC-502** (FR-503, não-renovação) → TS-02 · **SC-503** (FR-502/503,
  renovação) → TS-03 · **SC-504** (FR-502, inatividade) → TS-04 · **SC-505** (FR-504, falha fechada) →
  TS-05 · **SC-506** (FR-505/506, logout imediato) → TS-06 · **SC-507** (FR-507, cookie prod) → TS-07 ·
  **SC-508** (FR-507, cookie dev) → TS-08 · **SC-509** (FR-510, cross-tenant) → TS-09 · **SC-510**
  (concorrência) → TS-10 · **SC-511** (FR-508, log) → TS-11 · **SC-512** (FR-509, Membership) → teste de
  Membership (suspenso/REMOVED → 403; ACTIVE → 200).

## Edge cases

- Duas sessões da mesma Account: logout numa **não** derruba a outra (FR-505).
- Sessão válida + Membership suspensa entre requisições: 200 vira 403 sem novo login (FR-509).
- Renovação concorrente: uma sessão, um `expiresAt` coerente (SC-510).
- Cookie cross-origin dev vs. produção: mesma config, `Secure` só em produção (FR-507).

## Fora do escopo

Revogação global (1.10/1.12/1.13); troca de Organização (1.9); casca rica (1.7); recuperação de senha
(1.10). Fixar `sameSite=none`/domínio cross-subdomínio — depende da topologia real de produção (débito de
staging D-01/CR-09), não é decidido aqui.

Rastreabilidade: FR-2; RN-012; NFR-1/3/4; AD-7, AD-9.
