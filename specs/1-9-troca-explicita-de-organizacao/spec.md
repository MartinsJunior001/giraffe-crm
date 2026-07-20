# Story 1.9 — Troca explícita de Organização

> **Épico 1 — Fundação.** Fecha a lacuna deixada explicitamente aberta pela 1.3.
> **Rastreabilidade oficial (`epics.md` §493):** UX-DR5 · AD-7, AD-8, AD-23 · NFR-3 · (contrato para AD-21).
> **Dependências:** 1.2, 1.3, 1.6, 1.7 — todas `done`.
> **Status:** `ready-for-dev`.

## 1. Objetivo

> Como usuário com mais de uma Membership ativa, quero trocar de Organização **explicitamente**, para
> operar sempre no contexto certo, **sem vazamento**.

## 2. O estado real do código — a lacuna que esta Story fecha

Não é uma funcionalidade nova sobre terreno vazio; é o fechamento de uma fronteira que a 1.3 deixou
declarada. Verificado no código:

| Peça | Hoje |
|---|---|
| `OrgContextResolver` | **já é a autoridade** — confere o pedido contra a Membership ATIVA a cada requisição. O comentário no próprio arquivo diz: *"A escolha explícita é da Story 1.9."* |
| `x-org-id` | pedido por requisição, validado pelo guard (rejeita repetido/ambíguo, normaliza caixa) |
| `Session.activeOrganizationId` | **existe no schema do Better Auth e NUNCA é lido** — `grep` confirma zero consumidores fora da declaração |
| >1 Membership ativa sem `x-org-id` | **403** — `'múltiplas Organizações e nenhuma indicada'` |
| Topbar (1.7) | exibe `Organização: <nome>` como **texto**, não controle |

**Consequência atual:** um usuário multi-org só usa o produto se o cliente reenviar `x-org-id` em toda
requisição. Não há escolha persistida, logo não há "depois do refresh".

**A Story 1.9 liga as pontas que já existem** — não introduz mecanismo novo de contexto.

## 3. Decisões de arquitetura

### D-1.9-A — A sessão guarda a PREFERÊNCIA; a Membership continua sendo a AUTORIDADE

`activeOrganizationId` passa a ser **lido** pelo guard como o pedido *default* quando não há `x-org-id`.
Ele **não** vira autoridade: o `OrgContextResolver` segue revalidando contra a Membership ATIVA em toda
requisição, sem exceção. É o que o comentário do `auth.factory.ts` já exige — *"Se a sessão fosse
autoridade, suspender uma Membership não tiraria o acesso de ninguém."*

Consequência desejada: revogar/suspender a Membership derruba o acesso **na requisição seguinte**, mesmo
com a preferência ainda gravada na sessão. A preferência obsoleta é tratada como qualquer pedido inválido.

**Precedência do pedido:** `x-org-id` explícito › `activeOrganizationId` da sessão › (única Membership
ativa) › 403. O header continua vencendo — um pedido explícito nunca é sobrescrito por preferência.

### D-1.9-B — Trocar é uma operação do SERVIDOR sobre a sessão, não um estado de cliente

`POST /session/organizacao` com `{ orgId }`. O servidor revalida a Membership e **só então** persiste.
Não existe caminho em que o cliente escreva a Organização ativa diretamente — `input: false` no campo
do Better Auth já impede isso, e a rota é o único ponto de escrita.

### D-1.9-C — Sem migration

`Session.activeOrganizationId` **já existe**. A Story só passa a **ler e escrever** o que a 1.4 declarou.
Nenhuma alteração em `schema.prisma`, nenhuma coluna, nenhum contrato persistente novo.

### D-1.9-D — AD-23/AD-21 são CONTRATO documentado, não implementação

Não há Redis nem Socket.IO no projeto. O AC oficial pede *"um contrato documentado de reinscrição em
tempo real, **sem implementá-la aqui**"*. Entregue como `contrato-tempo-real.md` + ponto de extensão
nomeado no serviço. Implementar cache ou reinscrição sem consumidor seria abstração especulativa
(Constitution II).

## 4. Escopo

- `GET /session/organizacoes` — Organizações **elegíveis** (Memberships ATIVAS da própria conta).
- `POST /session/organizacao` — troca explícita, revalidada no servidor.
- Guard passa a consumir `activeOrganizationId` como pedido default.
- Seletor na Topbar, **só com >1 Membership ativa** (UX-DR5, Forma B).
- Contrato documentado de reinscrição em tempo real (AD-21) e de invalidação de cache (AD-23).

## 5. Fora de escopo

Convite/criação de Membership, alteração de papel, administração de Org (E8) · perfil/avatar (1.11/3.10)
· recuperação de senha (1.10) · step-up · Socket.IO e Redis reais · busca multi-org (OQ-49/Fase 2) ·
TECH-S1 (`next.config.ts`, CSP/HSTS — Terminal 4) · `DEB-PIPEGRANT-GUEST-CEILING`.

## 6. Contrato HTTP

### `GET /session/organizacoes`

Autenticada; **sem contexto organizacional** (`@SemContextoOrganizacional`) — é a lista que permite
*escolher* o contexto, então não pode exigir um. Lê as próprias Memberships por `withAccountContext`,
o único caminho de leitura que existe antes de haver Org ativa (policy da 1.2).

```json
{ "atual": "<uuid|null>", "organizacoes": [ { "id": "<uuid>", "nome": "…", "papel": "ADMIN|MEMBER|GUEST" } ] }
```

Só Memberships **ACTIVE**. Nunca enumera Organização sem vínculo. Lista vazia → `403` (nenhuma Membership
ativa), coerente com o resolvedor.

### `POST /session/organizacao`

```json
{ "orgId": "<uuid>" }
```

| Caso | Resposta |
|---|---|
| Membership ativa na Org pedida | **200** `{ orgId, nome, papel }` |
| Já é a Organização atual | **200** — idempotente, sem escrita redundante |
| Org inexistente **ou** sem Membership **ou** Membership inativa/revogada | **404** uniforme |
| `orgId` malformado | **400** |
| Sem sessão | **401** |

**Não-enumeração:** os três casos negados colapsam num **404 idêntico**. Distinguir "não existe" de "existe
mas você não pertence" entregaria um oráculo de existência de Organizações — e a diferença entre 403 e 404
já vazaria isso sozinha.

## 7. Segurança

- **TOCTOU:** validação e escrita da preferência ocorrem na **mesma transação**; e, independentemente
  disso, a preferência **não é autoridade** — a requisição seguinte revalida. Uma Membership revogada
  entre a validação e a escrita não concede acesso: apenas deixa uma preferência morta, que vira 403.
- **Troca não concede permissão:** o papel vem da Membership da Org destino, resolvido pelo mesmo
  `OrgContextResolver`. A ability é reconstruída por requisição (`construirAbility`), então o recálculo
  no novo contexto é automático — não há cache de ability a invalidar.
- **Contexto anterior:** nada da Org anterior sobrevive, porque nada é derivado de sessão — todo dado
  passa por `withTenantContext(orgId resolvido)` sob RLS. A limpeza no cliente é de **cache de UI**
  (`router.refresh()`), não de autorização.
- **Falha não deixa estado parcial:** escrita única e atômica na sessão; erro ⇒ preferência anterior
  intacta.
- **Logs:** `event`, `accountId`, `orgId`. Nunca cookie, token, e-mail ou nome de Organização.

## 8. Critérios de aceite

| # | Critério | Origem |
|---|---|---|
| AC-1 | Única Membership ativa → **nenhum seletor**; Org atual visível | epics AC1 · UX-DR5 |
| AC-2 | >1 Membership ativa → seletor na topbar; troca explícita | UX-DR5 |
| AC-3 | Pós-troca, navegação/dados/abilities refletem **só** a nova Org; contexto anterior limpo | epics AC2 · NFR-3 |
| AC-4 | Toda troca é **revalidada no servidor** e nunca silenciosa | epics AC3 |
| AC-5 | Requisição **seguinte** já usa a nova Org, sem `x-org-id` explícito | §2 |
| AC-6 | **Refresh** preserva a Organização escolhida | §2 |
| AC-7 | Membership inativa/revogada/inexistente/alheia → **404 uniforme** | §6 |
| AC-8 | Preferência obsoleta (Membership revogada depois da troca) **não** concede acesso | D-1.9-A |
| AC-9 | Troca para a Org **já ativa** é idempotente (200, sem escrita redundante) | §6 |
| AC-10 | Existe **contrato documentado** de reinscrição em tempo real, sem implementá-la | epics AC4 · AD-21 |

## 9. Testes

**Fase vermelha obrigatória** (remover a guarda → provar vermelho → restaurar → provar verde), em três
pontos: (a) Membership **inativa**; (b) Organização **alheia**; (c) **contexto obsoleto** após troca.

API/sessão: troca válida · já ativa (idempotente) · inexistente · sem Membership · inativa · revogada ·
cross-tenant · não autenticado · contexto na requisição seguinte · sem estado parcial após falha ·
concorrência · cookie/sessão atualizada · refresh · logout não preserva contexto · logs sem PII.

Web: seletor só com >1 · Org atual identificada · troca · loading/sucesso/erro · refresh · navegação
posterior no novo contexto · nada da Org anterior visível · acessibilidade do seletor · regressão de
login/logout/painel.

Contas descartáveis (`randomUUID`) com 2 Memberships ativas — **nunca** reusar Ana/Bruno/Carla/Eva num
`membership.create` persistente (TEST-ISO-01).

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Preferência de sessão virar autoridade por descuido futuro | Revalidação por requisição no resolvedor + teste AC-8 com fase vermelha |
| Guard passar a aceitar preferência inválida em vez de negar | Precedência explícita e teste de preferência obsoleta |
| Escopo escorregar para E8 (convite) ou tempo real | Fora de escopo explícito; AD-21/AD-23 entregues como contrato |
| Regressão no login (1.4/1.5) | Regressão dedicada de login/logout/sessão |

## 11. Definition of Done

- [ ] `GET /session/organizacoes` e `POST /session/organizacao` com 404 uniforme
- [ ] Guard consome `activeOrganizationId` com precedência documentada
- [ ] Seletor UX-DR5 (só com >1), com loading/sucesso/erro e acessibilidade
- [ ] Contrato AD-21/AD-23 documentado, sem implementação
- [ ] Fase vermelha provada nos três pontos
- [ ] **Sem migration**, sem alteração de `schema.prisma`
- [ ] typecheck · lint · format · build · testes direcionados · regressão de sessão
- [ ] Revisão adversarial sem CRITICAL/HIGH aberto · CI verde
