# Story 8.1 — Casca do Painel Administrativo e guarda de acesso

> **Épico 8 — Administração da Organização.** Primeira Story; abre o Épico.
> **Rastreabilidade oficial (`epics.md` §600):** FR-33 · RN-150/151/152/153 · NFR-36/37 · INV-ADMIN-01/02 · D5.3.
> **Dependências oficiais:** 1.6 (autorização CASL), 1.7 (casca), 1.8 — todas `done`.
> **Base:** `origin/main` = `ef746f3` (inclui a 1.9, mergeada no PR #127).
> **Status:** `ready-for-dev`.

## 1. Objetivo

> Como Administrador da Organização, quero uma área administrativa **restrita à minha Organização**,
> para gerenciar apenas o que é meu, com segurança.

## 2. Divergência registrada — RN-153 × INV-ADMIN-02

**RN-153** (`regras-negocio-fase-1.md` §796) diz: *"Financeiro, Estatísticas e Auditoria podem ser
ilustrativos"* — `CONFIRMADO (se documentados assim)`, com evidência no **protótipo HTML legado**.

O escopo oficial da 8.1 diz o contrário: *"ausência de Financeiro, do módulo Estatísticas e de
API/Tokens/Webhooks na navegação; **sem dados fictícios/persistência simulada** (INV-ADMIN-02)"*.

**Prevalece a Story + INV-ADMIN-02**, e não por hierarquia de documento: o `.memlog` do PRD registra
que a **INV-ADMIN-02 foi criada na Rodada 12 exatamente para refinar este ponto** — *"seções não
operacionais não podem simular dado real/persistência; em produção usam dado real ou ficam
ocultas/desabilitadas"*. A RN-153 descreve o **protótipo**, que o CLAUDE.md classifica como referência
visual, **não** modelo de produto. A decisão posterior venceu a observação anterior.

**Consequência prática:** a 8.1 não renderiza seção ilustrativa alguma. Sem Financeiro, sem
Estatísticas, sem API/Tokens/Webhooks — nem desabilitados, nem "em breve".

## 3. Escopo

- Rota e **casca** do Painel Administrativo, dentro do painel existente (1.7).
- **Guarda de acesso** revalidada no **servidor**, deny-by-default.
- Item de navegação visível **só** ao Admin.
- Estado **não autorizado** honesto, sem revelar conteúdo administrativo.
- Isolamento por Organização e ausência de enumeração.
- Base para 8.2+ (convites, membros, papéis, auditoria).

## 4. Fora de escopo

Convites/membros (8.2–8.7) · Auditoria (8.8) · Super Admin (FR-34) · Relatórios/Estatísticas (E7) ·
Financeiro · API/Tokens/Webhooks (Fase 2) · break-glass/suporte emergencial (fora da Fase 1) ·
Story 4.2 · TECH-S1 (`next.config.ts`, cabeçalhos — Terminal 4).

## 5. Decisões de arquitetura

### D-8.1-A — A guarda é da **API**, não do componente

A casca web **não decide** quem entra: ela pergunta ao servidor. Nasce a rota
**`GET /organizations/admin-scope`** com **`@Requer('administrar', 'Organizacao')`** — a ability que
a 1.6 já concede **apenas ao `ADMIN`** (`ability.factory.ts`).

Por que não confiar no `papel` que a web já tem (`obterContexto`): ele é dado de **apresentação**,
serve para adaptar a navegação. Usá-lo como fronteira faria a segurança do Painel depender de um
campo transportado até o cliente. A rota nova torna a negação **do servidor**, e o `AuthzGuard`
(APP_GUARD, deny-by-default) é quem a impõe.

**Nenhuma consulta recebe `orgId`.** A Organização vem do contexto resolvido no servidor — como em
`/organizations/current`, não há parâmetro de rota, query ou corpo por onde influenciá-la.

### D-8.1-B — Membership suspensa/encerrada não acessa: cai por construção

O `OrgContextResolver` (1.3) só resolve contexto com Membership **ACTIVE**. Sem contexto, o
`TenantContextGuard` nega antes de qualquer handler. Não há código novo para isso na 8.1 — há
**teste** que prova que continua valendo pela porta do Painel.

### D-8.1-C — Trocar de Organização recarrega o escopo integralmente

Cai por construção sobre a 1.9: o layout é `force-dynamic` e a busca usa `cache: 'no-store'`, então o
`router.refresh()` do seletor reexecuta o Server Component com o **contexto novo**. Não há cache
administrativo próprio a invalidar — e não se cria um, porque criar cache para depois invalidá-lo
seria inventar o problema e a solução na mesma Story.

### D-8.1-D — Super Admin sem acesso implícito: por ausência, não por exceção

`PapelEfetivo` é `MembershipRole` (`ADMIN`/`MEMBER`/`GUEST`) — **não existe papel de Plataforma** no
substrato de autorização. Não há ramo a bloquear: um papel que não entra no `construirAbility` não
concede nada. O teste afirma a **ausência do caminho**, que é o que INV-ADMIN-01 pede.

### D-8.1-E — Sem seção ilustrativa (INV-ADMIN-02)

A casca entrega **estrutura navegável e vazia**, com o que a 8.2+ preencherá. Um card "Membros — em
breve" com número inventado é exatamente o que a INV-ADMIN-02 proíbe, e é pior que ausência: ensina
o usuário a confiar num dado que não existe.

## 6. Contrato

### `GET /organizations/admin-scope`

`@Requer('administrar', 'Organizacao')`.

| Situação | Resposta |
|---|---|
| Admin ativo da Org atual | **200** `{ id, name, slug }` |
| MEMBER / GUEST | **403** (guard, deny-by-default) |
| Membership suspensa/removida | **403** (sem contexto — 1.3) |
| Sem sessão | **401** |

**Não enumera:** o payload traz só a **própria** Organização do contexto. Nenhuma rota do Painel
aceita identificador de Organização, então não há superfície para descobrir outra.

### Web — `/painel/administracao`

Server Component. Chama `admin-scope`; **403 ⇒ estado não autorizado**, sem nenhum conteúdo
administrativo no HTML (não é `hidden` por CSS — o conteúdo **não é renderizado**). Item de navegação
com `papeis: ['ADMIN']` (fora do DOM para os demais).

## 7. Critérios de aceite

| # | Critério | Origem |
|---|---|---|
| AC-1 | Não-Admin (ou Membership suspensa/encerrada) → acesso negado, **sem revelar conteúdo** | epics AC1 |
| AC-2 | Admin ativo vê **apenas** dados da Organização atual (INV-ADMIN-01) | epics AC2 · NFR-36 |
| AC-3 | Trocar de Organização **recarrega** todo o escopo administrativo | epics AC2 |
| AC-4 | **Sem** Financeiro, Estatísticas próprio ou API/Tokens/Webhooks; **sem dado fictício** (INV-ADMIN-02) | epics AC3 |
| AC-5 | Super Admin **não** obtém acesso operacional; ID do cliente **não** amplia escopo | epics AC4 · INV-ADMIN-01 |
| AC-6 | Deny-by-default **revalidado no servidor**, não na UI | epics AC1 · NFR-37 |

## 8. Testes

API: Admin → 200 · MEMBER → 403 · GUEST → 403 · sem sessão → 401 · Membership SUSPENDED → 403 ·
REMOVED → 403 · payload só da Org do contexto · nenhuma rota aceita `orgId` · logs sem PII/segredo.

Web: item de nav só para Admin · página renderiza para Admin · não-Admin recebe estado não autorizado
**sem conteúdo administrativo no DOM** · nada de Financeiro/Estatísticas/API · acessibilidade
(cabeçalho, foco, rótulo) · regressão da casca (1.7) e do seletor (1.9).

Contas do seed (fixtures de **LEITURA**): Ana `ADMIN`@A · Bruno `MEMBER`@A · Eva multi-org.
Estados suspensa/removida usam conta **descartável** (`randomUUID`) na Org C — TEST-ISO-01.

## 9. Segurança, observabilidade, LGPD

Deny-by-default pelo `AuthzGuard`; negação é evento de segurança logado (`accountId`, `orgId`, ação),
**sem** cookie, token, e-mail ou nome. Resposta 403 sem motivo no corpo. **Sem migration**, sem tabela
nova, sem GRANT novo — a Story é casca e guarda.

## 10. Definition of Done

- [ ] Rota `admin-scope` com `@Requer('administrar','Organizacao')` e 401/403/200 provados
- [ ] Casca web com estado não autorizado sem conteúdo no DOM
- [ ] Item de nav restrito a `ADMIN`
- [ ] Sem seção ilustrativa e sem dado fictício
- [ ] Testes de API e web verdes; regressão de 1.7 e 1.9
- [ ] typecheck · lint · format:check · build · CI 5/5
