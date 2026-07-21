# Story 8.3 — Aceite de Convite e ativação da Membership

> **Épico 8 — Administração da Organização.** Terceira Story; consome o Convite emitido na 8.2.
> **Fase do Spec Kit:** **SPECIFY** (primeiro artefato). Próximas: Clarify → Plan → Checklist → Tasks
> → Analyze. **Implement só depois do Analyze.**
> **Rastreabilidade oficial (`epics.md` §Story 8.3):** FR-33 · D5.1 · NFR-38 · AD-7, AD-9, AD-30 ·
> INV-AUDIT-01. **Contrato consumido:** Notificações (5.6).
> **Dependências:** **8.2** (`CODE MERGED`, PR #132) · **1.4** (auth, `done`) · **1.9** (seletor de
> Organização, `done`) · **contrato de Notificações 5.6**.
> **Base:** `origin/main` = `458e4c3` (inclui a 8.2).
> **Writer/worktree:** Terminal B · `E:\curso.js\wt-8-3` · branch
> `story/8-3-aceite-de-convite-e-ativacao-da-membership`.
> **Status:** `SPECIFY_DRAFT` · questões abertas para o **Clarify** listadas na §5.

## 1. Objetivo

> Como convidado, quero aceitar um Convite verificado de forma **idempotente**, para participar da
> Organização com o papel definido, com segurança — sem cadastro público fora do Convite e sem trocar
> Account/Organização ativa silenciosamente.

## 2. Escopo (do que a Story trata)

- **Aceite transacional e idempotente** de um Convite `PENDING` (emitido pela 8.2). Antes de ativar,
  validar em ordem fail-closed: **token atual** (hash/uso único) → **estado pendente** → **prazo**
  (não expirado) → **Organização** (contexto) → **e-mail normalizado** → **inexistência de Membership
  efetiva** para a Account → **impedir aceite concorrente duplicado**.
- **Account existente:** exige autenticação **com a Account do e-mail convidado** (verificado). Sessão
  de outra Account **não** aceita silenciosamente; **não** troca Account/Organização ativa sem ação
  explícita; **preserva** a Organização ativa atual até escolha do usuário (reusa o seletor da 1.9).
- **Usuário novo:** o Convite conduz à criação/autenticação da Account; a **posse válida do Convite**
  pode participar da verificação do e-mail conforme **contrato de E1**; a Membership só é criada após
  concluir as validações de identidade; **sem cadastro público independente do Convite**.
- **Resultado do aceite (átomo único):** cria **uma única Membership ativa** com o papel do Convite;
  marca o Convite como `ACCEPTED`; **invalida o token**; emite **Evento canônico pós-commit** (ator =
  usuário); **não restaura** concessões/responsabilidades antigas; **sem "Membership pendente"**.
- **Notificação "convite aceito" (contrato E5/5.6):** o aceite **registra o tipo `convite aceito` no
  catálogo de E5 pela fonte única** — E8 **não** cria Notificação própria; destinatários/preferências
  ficam em 5.6; **sem** token/e-mail completo/dados sensíveis; idempotente por Convite + destinatário.
  Consumido como **contrato**, sem dependência circular de implementação.

## 3. Reúso explícito de componentes da 8.2 (sem duplicar regra)

O núcleo puro e o token da 8.2 já foram escritos **antecipando o aceite**. A 8.3 **reusa**, não recria:

- **`invites/invite-token.ts`** — `hashToken(bruto)` + **`tokenConfere(bruto, hash)`** (comparação em
  tempo constante). O lookup de aceite resolve o Convite **pelo hash** do token recebido; nunca compara
  o token bruto fora de `tokenConfere`, nunca loga o bruto.
- **`invites/invite-core.ts`** — **`validarParaAceite`**, `estaExpirado`, `normalizarEmail`,
  `EstadoConvite`. Os limites de **aceite** já vivem em **`RATE_LIMITS`**:
  `aceitacaoPorIpPor15min = 20` e `aceitacaoPorConvitePor15min = 5` (G2 da 8.2, ainda **dormentes** —
  a 8.3 é o consumidor concreto). A política de cobrança espelhará `InviteRateLimit` (mesmo primitivo
  atômico `RateLimiter.contar`), com chaves de aceite (`inv:acc:ip:` / `inv:acc:conv:`).
- **Entidade `Invite`** (schema/RLS/GRANT da 8.2): a 8.3 **lê** e faz a transição `PENDING → ACCEPTED`.
  O GRANT de `Invite` já é `SELECT/INSERT/UPDATE` **sem DELETE** — o UPDATE de estado do aceite **cabe
  no GRANT existente**; a 8.3 **não** deve precisar de migration em `Invite` (a confirmar no Plan).

## 4. Invariantes e fronteiras (não erodir)

- **`Usuário ≠ Organização`** · **Identidade = Account global + Membership por Organização.** O aceite
  materializa **exatamente uma** Membership `ACTIVE` na Org do Convite; reaceite/token reusado **não**
  cria uma segunda (idempotência imposta pelo banco — índice único de Membership ativa por
  `(orgId, accountId)`, a confirmar no Plan).
- **Isolamento pelo banco** (invariante-mãe): a Org vem do **contexto**; toda escrita por
  `withTenantContext`; `Membership` já é RLS ENABLE+FORCE. **Nenhum** `orgId`/`accountId`/`inviteId`
  vindo do cliente é confiado — o Convite é resolvido pelo **hash do token** e a Account pela **sessão**.
- **Atomicidade (AD-13, padrão 2.7/2.8):** criar Membership + marcar Convite `ACCEPTED` + invalidar
  token ocorrem na **mesma transação** interativa no client raiz (`definirContextoOrg`); a Notificação
  e o Evento canônico pós-commit seguem o contrato de 5.6/E-eventos. Conflito de corrida reconhece
  **P2002 e P2028** → idempotente/409, **nunca 500**.
- **Auditoria (INV-AUDIT-01):** o aceite entra na trilha (`Membership`/`Invite` já em
  `MODELOS_AUDITADOS`), sem token/e-mail completo/PII.
- **Autz:** o aceite **não** é uma ação de Admin — a autoridade é a **posse do token válido + a
  identidade autenticada correta**, não `@Requer('administrar','Organizacao')`. A guarda grossa e a
  superfície da rota são questão de **Clarify/Plan** (§5).

## 5. Questões abertas para o CLARIFY (bloqueiam o Plan, não a Specify)

1. **Contrato de Notificações 5.6 — existe hoje?** O epics manda "registrar o tipo `convite aceito`
   pela fonte única de E5", mas o **Épico 5 ainda não foi implementado**. Se não há infra/porta de
   Notificação na base, a emissão vira um **ponto de contrato deferido** (análogo à decisão de
   auditoria da 8.2: contrato, não tabela nova) — **a confirmar com o dono**. Não inventar a infra de
   E5 nesta Story.
2. **Contrato de verificação de e-mail de E1 (usuário novo):** qual é exatamente o ponto de entrada de
   criação/verificação de Account que o Convite alimenta? A 1.4 (better-auth) já existe; precisa-se do
   contrato de "posse do Convite participa da verificação" **sem** abrir cadastro público.
3. **Superfície da rota de aceite:** autenticada pela sessão da Account do e-mail convidado (não Admin).
   Endpoint provável `POST /invites/accept` recebendo **só o token** (Org e Account **não** do cliente).
   Definir guarda grossa (sessão exigida) vs. fluxo do usuário novo (pré-autenticação).
4. **Step-up para aceitar Convite de papel ADMIN?** A 8.2 fez fail-closed no **convite** de ADMIN
   (`STEP_UP_REQUIRED`). Confirmar se o **aceite** de um Convite ADMIN (caso algum exista) exige
   step-up — provavelmente herda o mesmo gate.
5. **Membership `SUSPENDED`/`REMOVED` pré-existente:** o aceite reativa? A 8.2 já **bloqueia** convidar
   e-mail de Membership ATIVA/SUSPENSA na emissão; confirmar a semântica no aceite (o epics diz "não
   restaura concessões/responsabilidades antigas").

## 6. Fora do escopo (contrato futuro)

- Alteração de papel da Membership (**8.4**); suspensão/reativação (**8.5**); remoção/saída voluntária
  (**8.6**); roster (**8.7**); read-side da auditoria administrativa (**8.8**).
- O **mecanismo** de Notificação (Épico 5) — a 8.3 só registra o tipo pela fonte única (contrato).

### 6.1 `DEB-8-3-NEWUSER-ONBOARDING` — deferral do fluxo "usuário novo" (débito rastreável)

A 8.3 aceita Convite **somente para Account já existente**. A fronteira, deliberada e rastreável:

- **exige sessão autenticada** (401 sem sessão) — a rota resolve o principal explicitamente, sob
  `@SemContextoOrganizacional` (autenticado, sem contexto de Org — o convidado ainda não é membro);
- **exige `emailVerified=true`** na Account da sessão (senão **403 `EMAIL_NAO_VERIFICADO`**);
- **exige `normalizarEmail(account.email) === invite.normalizedEmail`** (senão **403
  `IDENTIDADE_INCOMPATIVEL`**);
- a **criação/cadastro de Account por posse do Convite** (conduzir o link a criar/verificar a Account do
  convidado) pertence ao **contrato de E1** (autenticação/onboarding), **não** à 8.3;
- a 8.3 **não** implementa cadastro público nem onboarding de usuário novo, e **não** antecipa E1.

**Débito:** quando E1 expuser o contrato de "posse do Convite participa da verificação/criação da
Account", ligar esse fluxo ao aceite (o endpoint de aceite já é o consumidor). Até lá, o convidado sem
Account precisa primeiro ter/verificar a Account (via E1/1.4) e então aceitar. Documentado de forma
coerente em `invite-accept.service.ts`, `invite-accept.controller.ts` e aqui (§6.1).

## 7. Demonstração vertical

Sim: um Convite `PENDING` (8.2) → aceite autenticado → **uma** Membership `ACTIVE` com o papel do
Convite → Convite `ACCEPTED` + token invalidado → reaceite idempotente não cria segunda Membership →
Convite expirado/cancelado/consumido → aceite recusado sem criar Membership e sem trocar Org ativa.
