# Story 8.2 — Criar, reenviar, expirar e cancelar Convite (+ write-side da Auditoria)

> **Épico 8 — Administração da Organização.** Segunda Story; primeira do fluxo de Membros.
> **Rastreabilidade oficial (`epics.md` §623):** FR-33 · D5.1 · NFR-38/39/40/42 · AD-9, AD-25, AD-30 · INV-AUDIT-01.
> **Dependências:** 8.1 (`done`) + **porta de e-mail transacional da Plataforma**.
> **Base:** `origin/main` = `c1e3039` (inclui 8.1 e TECH-S1).
> **Status:** `G2_RESOLVED` · `G1_ARCHITECTURE_RESOLVED` · `BLOCKED_EXTERNAL_EMAIL_CREDENTIALS`
> (só o **smoke de envio real** aguarda credencial; todo o resto é implementável agora — §3).

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

## 3. GATES — RESOLVIDOS PELA DECISÃO MATERIAL DO DONO

Os gates que antes bloqueavam a Story foram decididos. Registrados aqui como contrato vinculante.

### G2 — Parâmetros de Produto e Segurança → **RESOLVIDO**

**Validade:** 7 dias corridos desde a emissão. Reenvio **rotaciona o token**, invalida o anterior no
ato e **reinicia** os 7 dias.

**Unicidade:** no máximo **um** Convite `PENDING` por `(organizationId, normalizedEmail)`. Nova emissão
com pendente existente → **409 conflito explícito**, sem criar registro; renovar é via **reenvio**.

**Rate limits** (emissão/reenvio salvo indicação):
| Escopo | Limite |
|---|---|
| por Admin | 10 / hora |
| por Organização | 100 / dia |
| por destinatário na Org | 5 / dia |
| cooldown entre reenvios do mesmo Convite | 60 s |
| aceitação — por IP | 20 / 15 min |
| aceitação — por Convite | 5 / 15 min |

**Respostas:** limite → **429 com `Retry-After`**; token inválido/expirado/revogado/usado **não revela**
se o e-mail tem conta; conflitos de associação seguem o contrato (§5), **nunca** sobrescrevem Membership
em silêncio.

**Auditoria:** registra emissão, reenvio, aceitação, revogação, expiração observada, conflito e
rate-limit; **nunca** token bruto; e-mail **mascarado/minimizado** em log técnico; identificação
completa só onde o modelo de auditoria autorizado exigir.

### G1 — Arquitetura do provedor → **RESOLVIDO** (credencial ainda externa)

**Provedor MVP:** **Resend**, obrigatoriamente atrás de **`TransactionalEmailPort`** — nenhuma regra de
domínio depende do SDK. Adapters: `ResendTransactionalEmailAdapter` (produção) e
`FakeTransactionalEmailAdapter` (testes).

**Config (secrets fora do repo):** `RESEND_API_KEY` (obrigatório fora de `test`), `EMAIL_FROM`
(identidade remetente), `APP_PUBLIC_URL` (origem do link). **Fail-fast** no bootstrap quando envio real
estiver habilitado sem config. Timeout, erro tipado e observabilidade **sem segredo/token**.

**Identidade recomendada (configuração externa, não hardcoded):** nome `Giraffe360`, remetente sugerido
`convites@mail.giraffemarketing.com.br` — domínio a verificar no provedor **antes** do smoke real.

> **Único gate remanescente:** `BLOCKED_EXTERNAL_EMAIL_CREDENTIALS` — `RESEND_API_KEY` +
> `VERIFIED_SENDER_DOMAIN`. Bloqueia **apenas** o smoke de entrega real em staging; não bloqueia código,
> testes (adapter fake) nem CI.

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
