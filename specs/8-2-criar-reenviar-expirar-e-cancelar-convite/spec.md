# Story 8.2 — Criar, reenviar, expirar e cancelar Convite (+ write-side da Auditoria)

> **Épico 8 — Administração da Organização.** Segunda Story; primeira do fluxo de Membros.
> **Rastreabilidade oficial (`epics.md` §623):** FR-33 · D5.1 · NFR-38/39/40/42 · AD-9, AD-25, AD-30 · INV-AUDIT-01.
> **Dependências:** 8.1 (`done`) + **porta de e-mail transacional da Plataforma**.
> **Base:** `origin/main` = `c1e3039` (inclui 8.1 e TECH-S1).
> **Status:** `structuring` — **estruturável agora; NÃO implementável** até os gates materiais (§3).

## 1. Objetivo

> Como Administrador, quero criar e gerir Convites seguros com validação de conflito, para trazer
> pessoas à Organização de forma coerente e auditável.

## 2. Escopo (do que a Story trata)

- **Entidade `Convite`** org-scoped: e-mail normalizado + papel inicial ∈ {ADMIN, MEMBER, GUEST}.
- **Ciclo** `pendente / aceito / expirado / cancelado` (§585): estados terminais não voltam a pendente;
  **no máximo um Convite pendente efetivo** por (e-mail normalizado, Organização).
- **Token:** alta entropia; **armazenar só o hash**; uso único; comparação segura; invalidação em
  reenvio/cancelamento/aceite; **nunca** em logs/Auditoria/URL persistida/resposta administrativa.
- **Criação/conflitos idempotente e protegida contra concorrência:** ativa → bloquear (já é membro);
  suspensa → bloquear e orientar reativação; pendente → reenviar/cancelar; encerrada → permitir novo;
  outra Organização → permitir.
- **Separação de estados (D5.1):** estado do **Convite** ≠ estado da **entrega transacional**
  (`enfileirada / enviada ao provedor / falhou`). Falha de entrega **não** cria outro Convite, preserva
  o pendente, permite reenvio controlado, é auditável.
- **Write-side da Auditoria** (INV-AUDIT-01): eventos tipados/versionados append-only de
  criar/reenviar/expirar/cancelar. Contrato reusado por 8.3–8.7 e consumidores E4/E2/E3; o **read-side**
  é a 8.8.
- **`convidar como Admin exige step-up`** (autenticação reforçada).

## 3. GATES MATERIAIS — por que a Story é estruturável mas não implementável agora

Esta seção é a razão de o status ser `structuring`. **Confirmado nas fontes, não presumido** (a
instrução do dono foi explícita: não presumir dependência de e-mail antes de ler):

### G1 — Porta de e-mail transacional da Plataforma (Arquitetura)
- `epics.md` §623: **Dependências:** "8.1 + **porta de e-mail transacional da Plataforma**"; **Gates:**
  "provedor transacional; identidade remetente da Plataforma; **cofre de credenciais**; … (todos antes
  da implementação)".
- **Evidência de que não existe:** nenhum provider de e-mail em `apps/api/package.json` (grep:
  nodemailer/resend/ses/sendgrid/postmark/mailgun/smtp → zero); nenhum módulo de e-mail/convite na API;
  Story **1.10** (recuperação de senha, mesma dependência de porta transacional) segue `backlog`, nunca
  implementada, e sua entrada de épico declara "BLOQUEADA para implementação até … disponibilidade da
  porta de e-mail transacional".
- **Natureza:** decisão de Arquitetura + **credencial ausente** (condição de parada #2). Inventar
  provider/identidade/segredo violaria "não inventar".

### G2 — Parâmetros numéricos (Produto + Segurança)
- `epics.md` §623 Gates: "**prazo numérico**; **rate limits**; **antiabuso**; retry e idempotência
  (todos antes da implementação)".
- PRD §1078: "cálculo de **prazo** … = Arquitetura" (diferido); §1044 diz "expira por prazo" sem número.
- **Nenhum valor** de expiração do Convite, de rate limit de emissão/reenvio/validação, ou de limiar
  antiabuso está definido nas fontes.
- **Natureza:** **decisão material de produto/segurança** (condição de parada #5). O ciclo "expira por
  prazo" e o "rate limit de emissão" **não são codificáveis** sem esses números — inventá-los seria
  fixar política de produto por conta própria.

> **Precedente:** a Story 1.10 tem a mesma forma — *"Estruturável agora; não implementável antes desses
> parâmetros."* A 8.2 herda esse padrão.

## 4. O que É estruturável agora (esta spec + planejamento)

- Modelo de dados do `Convite` (tabela org-scoped, RLS ENABLE+FORCE, WITH CHECK, GRANT sem DELETE —
  cancelar/expirar é `state`, espelhando o padrão da base); o **hash** do token, nunca o token.
- Núcleo puro do ciclo de estados (transições válidas, terminalidade, "1 pendente efetivo") — testável
  sem e-mail e sem os números (a expiração vira parâmetro injetado, não hard-coded).
- Contrato write-side de Auditoria (forma do evento tipado/versionado).
- As **regras de conflito** (ativa/suspensa/pendente/encerrada/outra-org) — lógica pura.
- A **fronteira de entrega** como porta abstrata (`enfileirada`), com o envio real fail-closed até G1.

O que **não** é estruturável sem os gates: o valor de expiração, os rate limits, o envio real, a
identidade remetente. Estes entram quando G1/G2 forem decididos.

## 5. Autorização
Criar/reenviar/cancelar Convite = **Admin da Org** (a guarda de 8.1, `@Requer('administrar','Organizacao')`,
mais step-up para convidar como Admin). MEMBER/GUEST não acessam. Deny-by-default no servidor.

## 6. Definition of Done (bloqueada em G1/G2)
- [ ] **G1 resolvido:** provedor transacional + identidade remetente + credenciais no cofre (Arquitetura).
- [ ] **G2 resolvido:** prazo de expiração, rate limits e limiares antiabuso (Produto+Segurança).
- [ ] Entidade `Convite` + migration + RLS/GRANT; token só-hash; ciclo com "1 pendente efetivo".
- [ ] Regras de conflito idempotentes e protegidas contra concorrência.
- [ ] Separação Convite × entrega; envio real; auditoria write-side.
- [ ] Testes (núcleo puro + RLS + HTTP + auditoria sem PII/token); gates verdes; CI 5/5.

## 7. Nota de processo
Ownership da 8.2 assumido pelo Terminal B (worktree `wt-8-2`). Esta spec é a entrega **estruturável**;
a **implementação está bloqueada** em G1 (credencial/Arquitetura) e G2 (decisão de produto/segurança) —
condições de parada materiais #2 e #5, confirmadas nas fontes e não presumidas.
