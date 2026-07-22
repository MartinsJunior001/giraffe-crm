# Story 4.2 — Ciclo de vida e gestão da Automação

> FR-22 · RN-102 · D4.3 · NFR-4 · AD-9/11/30. **Consome:** write-side da Auditoria (E8/8.2).
> **Deps:** 4.1, 2.2, 1.6, 8.2. **Risco: ALTO** (autz multi-tenant + ciclo de vida + snapshot).

## 1. Recorte executável

Gestão do ciclo de vida da Automação, por Pipe, **estendendo** o modelo `Automation` da 4.1 (não o reescreve):

- **editar** a configuração (rótulo/`quando`/`condicoes`/`entao`), revalidando referências fail-closed;
- **ativar / desativar / arquivar / restaurar** — estados **`INACTIVE`/`ACTIVE`/`ARCHIVED`** (nomenclatura do enum `AutomationState` da 4.1; a spec de Épico fala "ativa/inativa/arquivada");
- **duplicar** — nova identidade, nome editável, **copia só a configuração** (sem versões, sem estado ativo), nasce `INACTIVE`, revalida referências/permissões/recursos;
- **snapshot/versão** (`AutomationVersion`) quando a Automação **ativa** é editada e quando é **ativada** — congela a config vigente, análogo a `FormVersion` (2.6) e ao `configSnapshot` de Fase (2.12).

Transições **atômicas, idempotentes e auditadas** (padrão 2.11/3.4). **Fora do escopo:** motor de disparo (4.6), catálogos de gatilho/condição/ação (4.3/4.4/4.5), encadeamento (4.7), trilha de Execuções (4.8).

## 2. Critérios de aceite → prova

| AC | Regra | Onde é provado |
|----|-------|----------------|
| AC-1 | Cria nasce `INACTIVE`; só as ativas são avaliadas | 4.1 (mantido); RLS: engine filtra `state=ACTIVE` |
| AC-2 | Ativa → arquivar desativa automaticamente; restaurar → `INACTIVE`; execuções iniciadas não canceladas | `automation-lifecycle.transitions` + http/rls |
| AC-3 | Duplicar: nova identidade + nome editável, só config (sem versões), nasce `INACTIVE`, revalida | `duplicar` + http |
| AC-4 | Editar ativa: cria nova versão/snapshot; novas avaliações usam a nova; sem mistura de versões (`activeVersion`) | `editar` + versions + rls |
| AC-5 | Membro só lê (sanitizado); Convidado não acessa; toda operação gera evento na Auditoria administrativa | http (403/404) + log |

## 3. Decisões de arquitetura

### D-4.2-A — `AutomationVersion` é o snapshot imutável (twin de `FormVersion`)

Uma tabela append-only org-scoped (RLS ENABLE+FORCE, `WITH CHECK` no INSERT e no UPDATE, GRANT **só `SELECT/INSERT`** — sem UPDATE/DELETE, imutável pelo banco). Numerada por `@@unique([orgId, automationId, version])`. Guarda `snapshot` (JSONB integral de `quando/condicoes/entao/configSchemaVersion`) + `revision` (hash sha256 determinístico) + `actorId`. FK **composta tenant-safe** `(orgId, automationId) → Automation(orgId, id)` (mesmo racional de F-A1). É o que dá ao motor (4.6) um `automationVersionId` estável para capturar.

### D-4.2-B — `Automation.activeVersion` é o ponteiro da versão em vigor (twin de `Form.publishedVersion`)

Coluna `Int?`. **Invariante:** `state = ACTIVE ⟹ activeVersion != null`. É definido em **ativar** (snapshot do rascunho → nova versão) e em **editar-enquanto-ativa** (snapshot do novo rascunho → nova versão, ponteiro avança). Desativar/arquivar **não** o zeram (histórico inerte; o motor gateia por `state`). O motor só avalia `ACTIVE`, então o rascunho e a versão nunca se misturam numa Execução.

### D-4.2-C — 1º GRANT de UPDATE em `Automation`, **column-scoped** (padrão 2.11)

`GRANT UPDATE ("name","state","activeVersion","quando","condicoes","entao","configSchemaVersion","updatedAt")`. **`orgId`/`pipeId`/`id`/`createdAt`/`idempotencyKey` seguem SEM UPDATE** — "não transferível" e identidade imutável garantidos pelo banco (tentativa → `permission denied`, provado no rls). Reconcilia "evoluir estado/config sim, mover de Org/Pipe não", exatamente como a migration da 4.1 antecipou.

### D-4.2-D — Editar/duplicar reutilizam a validação da 4.1

`validarConfiguracao` (núcleo puro `automation-config.ts`) e a revalidação de referências sob RLS (`automation-references.ts`, extraída de `AutomationsService`) são reusadas — sem segundo validador. **Ativar** revalida referências fail-closed (AC-4 da 4.1: referência inacessível na ativação → config inválida/bloqueada → 400).

### D-4.2-E — Somente-leitura sob arquivamento (defesa em profundidade)

Editar/ativar/desativar uma Automação `ARCHIVED` → **409** (`AUTOMACAO_ARQUIVADA`); o fluxo é restaurar → editar → ativar (espelha o D1 de Database 3.1). `restaurar` sempre leva a `INACTIVE` (a spec: "restaurar sempre retorna inativa"), então **não** há `previousLifecycleState` (diverge do Card, que preserva o anterior).

### D-4.2-F — Idempotência de criação/duplicação por `idempotencyKey` opcional

Coluna `idempotencyKey String?` + `@@unique([orgId, pipeId, idempotencyKey])`. NULLs são distintos no Postgres, logo criações sem chave nunca colidem (retrocompatível com a `criar` da 4.1). Com chave, retry devolve o existente (**P2002/P2028 → idempotente/409, nunca 500**).

### D-4.2-G — Auditoria administrativa = trilha estruturada (Pino), sem tabela nova

`Automation` já está em `MODELOS_AUDITADOS` (4.1); acrescenta-se `AutomationVersion`. Transições no client raiz (tx interativa) auditam à mão (`this.auditar`, FR-214), como `card-lifecycle`. **Não** se cria `AutomationEvent`/`AutomationHistory`: a trilha de Execuções é 4.8 (sem consumidor concreto agora — AD-11). A config (possível PII) nunca entra no log.

## 4. Autorização (consome o substrato de Pipe — não reabre)

- **Gerenciar Automação = "config do Pipe"**: `exigirGerenciarPipe` (Admin da Org / Admin do Pipe). Editar, transicionar, duplicar exigem gerenciar.
- **Ler** (obter/listar/versões) = `resolverPoderNoPipe` (qualquer poder — Membro lê).
- **Convidado**: teto do PipeGrant já imposto (`tech/pipegrant-guest-ceiling`, no main) — GUEST não gerencia Pipe → 403 ao mutar; sem acesso → **404 não-enumerante**; deny-by-default.
- Guard/`ability.ts` **intocados** (C3 congelado, DBT-AUTHZ-01).

## 5. Migration

Aditiva e reversível (`20260726120000_automation_lifecycle`): colunas `activeVersion`/`idempotencyKey` em `Automation`; UNIQUE `(orgId,id)` (alvo da FK composta) + UNIQUE `(orgId,pipeId,idempotencyKey)`; tabela `AutomationVersion` (RLS+FORCE, 4 policies, GRANT SELECT/INSERT); `GRANT UPDATE` column-scoped em `Automation`. Rollback drill em banco descartável.

## 6. Testes adversariais (integração real PostgreSQL)

(a) cada transição idempotente/atômica, estado inválido → 409; (b) snapshot ao editar ativa congela e não corrompe versões anteriores; (c) duplicar cria identidade nova sem herdar histórico/ativo; (d) autz Admin/Admin-Pipe gerenciam, GUEST/leitor → 403, sem acesso → 404; (e) isolamento cross-tenant; (f) evento de ciclo na mesma tx, `AutomationVersion` append-only (fase vermelha do GRANT); (g) idempotência de criação/duplicação (P2002/P2028); (h) auditoria sanitizada (sem config/PII).
