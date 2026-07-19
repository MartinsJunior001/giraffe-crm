# Story 4.1 — Modelo, escopo e referências da Automação

> **Épico 4 — Automações internas (Evento → Condição → Ação).** Primeira Story do Épico; abre o domínio.
> **Rastreabilidade oficial (`epics.md` §1295):** FR-21 · RN-100/101 · D4.1 · NFR-3 · AD-9/11.
> **Dependências:** 2.1 (Pipe), 1.6 (autorização CASL) — ambas `done`.
> **Status:** `ready-for-dev`.

## 1. Objetivo

Dar forma a uma Automação **declarativa** presa a **exatamente um Pipe**, com referências
**determinísticas e tenant-safe**, sem construir o motor.

Como Administrador, quero modelar uma Automação como **Quando → Condições → Então** ligada a exatamente
um Pipe, para automatizar reações internas daquele processo **sem atravessar fronteiras**.

## 2. Escopo

- Entidade **`Automation`** org-scoped, pertencente a **exatamente um Pipe** (RN-100).
- Estrutura declarativa persistida: **`quando`** (Evento) → **`condicoes`** (AND) → **`entao`** (Ações).
- **Identidade estável** (UUID de PK, imutável — nunca reciclada, nunca reatribuída).
- **Validação estrutural fail-closed** da configuração (núcleo puro), com **allowlist** de chaves.
- **Referências por ID estável e tenant-safe**, declaradas num envelope explícito; referência inválida
  ou malformada torna a configuração **inválida** (400), nunca "silenciosamente ignorada".
- Rotas de **criar**, **obter** e **listar** por Pipe.
- Autorização fina reusando `pipe-authz.ts` (DBT-AUTHZ-01), sem tocar o guard/`ability.ts` (C3 congelado).

## 3. Fora de escopo (explícito)

| Não faz | Dono |
|---|---|
| Ciclo de vida: ativar/desativar/arquivar/restaurar/duplicar; versões/snapshot | **4.2** |
| Catálogo de Eventos e emissão | **4.3** |
| Catálogo de Condições e avaliação AND | **4.4** |
| Catálogo de Ações internas | **4.5** |
| Motor, fila, outbox, at-least-once, dedup | **4.6** |
| Encadeamento, `executionChainId`, prevenção de ciclos | **4.7** |
| Trilha de Execuções | **4.8** |
| Contrato tipado de handlers, Ação↔Template, IA como Ação | **4.9** |
| HTTP externo, Webhook, API externa, MCP | **Fase 2** (RN-102/103/104) |
| Tarefa, Notificação, E-mail, IA | **E5 / E6** |

**A 4.1 não dispara nada.** Não há motor, não há fila, não há emissão de Evento. A Automação criada aqui é
**inerte por construção** (§6).

## 4. Decisões de arquitetura desta Story

### D-4.1-A — Configuração em JSONB, não em tabelas por parte

`quando`/`condicoes`/`entao` são **JSONB**, validados por núcleo **puro**. Segue o precedente já consolidado
da base: opções de Seleção em `typeConfig` (DBT-2.4-OPCOES-JSON) e o snapshot integral de `FormVersion`.
O versionamento por snapshot que a 4.2/4.6 exigem é **natural sobre JSON** e artificial sobre tabelas
normalizadas — congelar uma configuração inteira é copiar um documento, não replicar N linhas.

### D-4.1-B — Estado nasce `INACTIVE` e é **inerte**, mas as transições são da 4.2

A coluna `state` existe com **default `INACTIVE`** porque esse é o **default seguro** (D4.3: "nova Automação
nasce inativa"; "só a ativa dispara"). É o que torna a 4.1 segura de entregar **antes** do motor: nada do que
esta Story cria pode disparar, por construção — e não por ausência de código.

As **transições** (ativar/desativar/arquivar/restaurar/duplicar) são da **4.2** e **não** existem aqui — o que
é imposto pelo banco, não pela ausência de rota (§5.4).

### D-4.1-C — **F-A1: FK COMPOSTA tenant-safe** (decisão do dono, HIGH)

> A relação `Automation → Pipe` garante **no banco** que os dois recursos pertencem à mesma Organização.
> Não se confia apenas na releitura do Pipe pelo serviço.

**Por que uma FK simples é insuficiente — e este é o ponto da Story.** Com `Automation.pipeId → Pipe.id`:

1. a RLS de `Automation` valida `orgId = current_org_id()` no `WITH CHECK` — passa, o `orgId` é o meu;
2. a FK valida que `pipeId` **existe** em `Pipe` — e **ações referenciais rodam com bypass de row
   security** (a mesma propriedade que o CLAUDE.md já invoca para negar `DELETE` em `Account`);
3. logo, um `pipeId` de **outra Organização** seria **aceito pelo banco**.

Restaria só a releitura no serviço. Isso é uma checagem de aplicação guardando o invariante-mãe — exatamente
o que esta base recusa ("quem isola é o banco, não a aplicação"; "um `where` se esquece e a policy não").

**Materialização:**

```sql
ALTER TABLE "Pipe"   ADD CONSTRAINT "Pipe_orgId_id_key" UNIQUE ("orgId", "id");
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_orgId_pipeId_fkey"
  FOREIGN KEY ("orgId", "pipeId") REFERENCES "Pipe"("orgId", "id") ON DELETE RESTRICT;
```

O par `(orgId, pipeId)` só existe se o Pipe **for daquela Organização**. O vazamento cross-tenant deixa de
depender de código: vira **violação de chave estrangeira**. A releitura no serviço **permanece** — não como
a garantia, mas como a fonte da resposta **404 não-enumerante** (um 500 de FK vazaria a existência do Pipe).

**Consequência registrada — `ON DELETE RESTRICT` × cascata de `Organization`.** `Pipe.orgId` e
`Automation.orgId` são `ON DELETE CASCADE` para `Organization`. Apagar uma Organização dispara as duas
cascatas, e `RESTRICT` é verificado **imediatamente** no PostgreSQL (ao contrário de `NO ACTION`, verificado
no fim da instrução) — a ordem entre elas não é contratual. **Sem impacto em runtime:** o runtime não tem
`DELETE` em `Organization` nem em `Pipe` (CLAUDE.md), então nenhuma dessas cascatas é alcançável em produção.
Verificado no drill de migration (§9). Se algum dia um fluxo de migrator precisar apagar Organizações,
`NO ACTION` preserva a mesma proteção contra órfãos com verificação diferida — registrado, não alterado.

> **`DEB-TENANT-COMPOSITE-FK-RETROFIT` — débito registrado (aprovado pelo dono; FORA do escopo da 4.1).**
>
> Esse padrão **não existia em nenhuma tabela desta base** — verificado: `grep 'FOREIGN KEY ("x", "y")'`
> nas migrations não retorna nada antes de `20260720120000_automations`, e `Pipe_orgId_id_key` é criado
> só pela 4.1. `Card.pipeId`, `Phase.pipeId`, `Form.pipeId`, `Record.databaseId` e similares usam FK
> simples e têm a **mesma exposição teórica** descrita acima.
>
> A 4.1 é a primeira a fechá-la, e o retrofit de E2/E3 é **tech story própria**: fazê-lo aqui misturaria
> ~15 tabelas num PR de Story nova, cada uma exigindo o seu `@@unique([orgId, id])`, a sua migração e o
> seu teste de fase vermelha. **Não fazer retrofit na 4.1** é decisão do dono.

### D-4.1-E — Reversa em `prisma/rollback/`, não junto da migration (F-A2)

O arquivo é `apps/api/prisma/rollback/20260720120000_automations.down.sql` — **nome-base idêntico** ao da
migration. Primeira reversa desta base; a convenção nasce aqui.

É **inverso semântico ponto-a-ponto**, na ordem ditada pelas dependências: policies (`DROP POLICY IF
EXISTS`, explícitas e idempotentes) → FK composta → FK de Organização → índice → tabela → enum → o
`UNIQUE` de `Pipe`. **Nenhum objeto preexistente é removido**: o único toque em tabela anterior é
`Pipe_orgId_id_key`, criada por esta Story (verificado — nenhuma migration anterior a cria) e removível
justamente por isso. `Pipe`, suas colunas, índices e policies ficam intactos, e nenhum dado preexistente
se perde (a tabela é nova; o `UNIQUE` é aditivo).

### D-4.1-F — Versão do schema da configuração (F-A4)

Um JSON persistido sem versão não é migrável: quando 4.3/4.4/4.5 evoluírem a forma, não haveria como
distinguir "config antiga válida" de "config corrompida". Daí `Automation.configSchemaVersion` —
**coluna**, não chave dentro do JSON, para ser **consultável** ("quais linhas ainda estão na v1?").
Carimbada pelo servidor, **nunca aceita do cliente** (o DTO rejeita a chave).

**Guarda otimista:** *não se aplica* nesta Story. Guarda otimista protege **read-modify-write**, e a 4.1
não tem nenhum — não há `UPDATE` no GRANT. Quando a 4.2 abrir edição, ela nasce com a sua guarda.

### D-4.1-D — Referências: envelope explícito, não varredura de JSON

Os catálogos (4.3/4.4/4.5) não existem. Em vez de adivinhar onde uma referência aparecerá, a configuração
declara suas referências num **envelope explícito** `refs: [{ tipo, id }]`, validado agora:

- `id` deve ser **UUID** (ID estável — nunca rótulo, espelhando "opção por `id`, nunca rótulo" da 2.7);
- `tipo` deve estar numa **allowlist** fechada (`switch` com `never` — tipo novo sem tratamento **quebra
  o build**, em vez de passar a aceitar referência não validada);
- desconhecido ou malformado → **400** (fail-closed), nunca ignorado.

**Toda referência é RELIDA sob RLS antes de persistir** (`revalidarReferencias`). A FK composta cobre o
Pipe proprietário, mas as referências vivem **dentro do JSON, onde não há FK alguma** — sem a releitura,
um `Field.id` ou `Record.id` de outra Organização seria gravado tal e qual, e só falharia (ou pior,
resolveria) quando o motor da 4.6 o executasse. Quem responde "não existe" para ID alheio é a **policy**,
não um `where orgId` manual. **Nenhum ID cross-tenant é persistido.**

Resolução sempre por **alvo determinístico** — `id` exato, jamais varredura ou filtro amplo ("não é
permitido pesquisar e atualizar indiscriminadamente vários Registros"). `PHASE` precisa ser do Pipe
proprietário; `PIPE` só pode ser o próprio.

É o **contrato de extensão** que 4.3/4.5 preencherão — sem inventar catálogo executável (AD-11).

## 5. Modelo de dados

Ver `data-model.md`. Resumo do que o **banco** impõe:

### 5.1 Tabela `Automation`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | UUID PK | identidade estável |
| `orgId` | UUID | FK → `Organization` (Cascade) |
| `pipeId` | UUID | **FK composta** `(orgId,pipeId)` → `Pipe(orgId,id)` RESTRICT — D-4.1-C |
| `name` | String | rótulo editável |
| `state` | `AutomationState` | default **`INACTIVE`** — D-4.1-B |
| `quando` | Jsonb | Evento (estrutura; catálogo = 4.3) |
| `condicoes` | Jsonb | array AND (estrutura; catálogo = 4.4) |
| `entao` | Jsonb | array de Ações, **não vazio** (estrutura; catálogo = 4.5) |
| `createdAt`/`updatedAt` | Timestamp | |

Índice: `@@index([orgId, pipeId, state])` — a consulta do motor (4.6) é "Automações **ativas** de um Pipe",
e a listagem desta Story é "Automações de um Pipe".

### 5.2 RLS

`ENABLE` **e** `FORCE ROW LEVEL SECURITY`; policies `select/insert/update/delete` por
`orgId = current_org_id()`, com **`WITH CHECK` no INSERT e no UPDATE** — o padrão integral da base. Sem o
`WITH CHECK` de UPDATE, uma linha poderia ser **movida** para outra Organização.

### 5.3 GRANT — **`SELECT, INSERT`. Sem UPDATE. Sem DELETE.**

Esta é a fronteira que prova o escopo da Story:

- **sem `DELETE`** — "não há exclusão definitiva" (D4.3) é garantido pelo **banco**;
- **sem `UPDATE`** — a 4.1 **cria e lê**. Editar e transicionar estado são da **4.2**, que abrirá o `UPDATE`
  (column-scoped) junto do consumidor e do teste que provam o escopo dele.

Segue exatamente o precedente de `Card`: `SELECT/INSERT` na 2.7, e o **1º** `UPDATE` só na 2.11, quando o
ciclo de vida chegou. Uma rota de edição acrescentada por engano bate em `permission denied`.

### 5.4 Auditoria

`Automation` entra em `MODELOS_AUDITADOS` (`tenant-context.ts`) — inclusive a **tentativa negada**.

## 6. Por que é seguro entregar o modelo antes do motor

Três travas independentes, e nenhuma delas é "ainda não escrevemos o código":

1. **Nasce `INACTIVE`** e "só a ativa dispara" (D4.3);
2. **não há `UPDATE`** no GRANT — o runtime **não consegue** levar uma Automação a `ACTIVE`;
3. **não há motor, fila ou emissão de Evento** — nada consulta a tabela para executar.

## 7. Autorização (AD-9, deny-by-default)

Fonte: **D4.3** — "administram todo o ciclo de vida: Administrador da Organização e Admin do Pipe
correspondente"; "Membro do Pipe: acesso somente leitura à configuração"; "Convidado sem acesso".

| Operação | Regra | Sem acesso |
|---|---|---|
| criar | `exigirGerenciarPipe` → Admin da Org **ou** Admin do Pipe | **404** não-enumerante |
| obter / listar | `resolverPoderNoPipe` → qualquer poder (ler ≠ administrar) | **404** não-enumerante |

- **Membro do Pipe** (`operar`) → lê, mas **403** ao criar.
- **Convidado** → sem `PipeGrant` ⇒ **404** (não revela que o Pipe existe).
- Guard grosso: novo sujeito CASL `Automacao` (extensão do catálogo, **não** do mecanismo — C3 congelado).

## 8. Gate de estado: Pipe arquivado

Criar Automação em Pipe `ARCHIVED` → **409** `{ motivo: 'PIPE_ARQUIVADO' }`.

Autorização resolve **poder**, não **estado** — lição registrada da 3.9. Todo caminho de escrita novo precisa
do **próprio** gate, com **fase vermelha** provada.

## 9. Migration

- Forward: `20260720120000_automations/migration.sql`.
- **Reversa: `migration.down.sql` no mesmo PR** (primeira desta base — convenção introduzida aqui).
- **Drill `up → down → up`** executado e evidenciado.
- Aditiva: nenhum dado existente é alterado. O único toque em tabela existente é o `UNIQUE` **aditivo** em
  `Pipe` (§D-4.1-C), com regressão de Pipe provada verde.

## 10. Observabilidade, segurança e LGPD

- Logs Pino estruturados: `automationId`, `pipeId`, `state`. **Nunca** `quando`/`condicoes`/`entao` — a
  configuração pode conter valores de Campo (possível PII), pelo mesmo critério que mantém `valores` fora
  da lista do Kanban (NFR-1/8/16).
- `orgId` **fora** da fronteira de resposta; nunca aceito do cliente.
- Erros sanitizados: 404 não-enumerante; nunca stack, SQL ou nome de constraint na resposta.
- LGPD: sem exclusão física (sem `DELETE`).

## 11. Critérios de aceite

| # | Critério | Origem |
|---|---|---|
| AC-1 | Admin cria Automação → nasce ligada a **exatamente aquele Pipe**, com Quando→Condições→Então e identidade estável | epics AC-1 |
| AC-2 | `entao` vazio, `condicoes` não-array, `quando` sem tipo, ou chave fora da allowlist → **400** fail-closed | epics AC-3/AC-4 |
| AC-3 | Referência com `id` não-UUID ou `tipo` fora da allowlist → **400** (configuração inválida) | epics AC-4 |
| AC-4 | `pipeId` de outra Organização → **404**; e no banco, INSERT direto do par cross-tenant → **violação de FK** | epics AC-4 · NFR-3 · F-A1 |
| AC-5 | `pipeId` inexistente → **404** não-enumerante | §7 |
| AC-6 | Membro do Pipe cria → **403**; lê → **200**. Convidado → **404** | D4.3 |
| AC-7 | Pipe `ARCHIVED` → **409** `PIPE_ARQUIVADO` | §8 |
| AC-8 | Automação nasce **`INACTIVE`**; runtime **não tem** `UPDATE` nem `DELETE` (provado por `permission denied`) | D4.3 · §5.3 |
| AC-9 | RLS: leitura cross-tenant devolve vazio; INSERT cross-tenant barrado com `WITH CHECK` | AD-6 |
| AC-10 | Migration `up → down → up` limpa; regressão de Pipe verde | §9 |

## 12. Testes obrigatórios

`automations.core.test.ts` (puro), `automations-http.test.ts` (integração real), `automations-rls.test.ts`
(PostgreSQL real, incluindo a **fase vermelha** de cada gate).

Cobrem: criação válida · vínculo obrigatório · mesma Organização · Pipe inexistente · cross-tenant (serviço
**e** banco) · sem permissão · Pipe arquivado · integridade referencial · RLS direto · GRANT (sem
UPDATE/DELETE) · default seguro · estrutura Quando→Condições→Então · payload inválido · migration ·
rollback · regressão de Pipe · logs sem PII.

**Fixtures:** conta descartável (`randomUUID`) na **Org C**. Nunca reusar Ana/Bruno/Carla/Eva num
`membership.create` persistente (TEST-ISO-01).

## 13. Rollback

`migration.down.sql`: `DROP TABLE "Automation"` + `DROP TYPE "AutomationState"` + `DROP CONSTRAINT
"Pipe_orgId_id_key"`. Sem perda de dado pré-existente — a tabela é nova e o `UNIQUE` em `Pipe` é aditivo.

## 14. Definition of Done

- [ ] Migration forward + `.down.sql` + drill `up → down → up` evidenciado
- [ ] RLS ENABLE+FORCE, 4 policies, WITH CHECK em INSERT e UPDATE
- [ ] GRANT `SELECT, INSERT` — ausência de UPDATE/DELETE **provada** por teste
- [ ] FK composta tenant-safe (F-A1) com fase vermelha provada
- [ ] Núcleo puro fail-closed + allowlist
- [ ] Autorização D4.3 (403 Membro / 404 Convidado / 404 não-enumerante)
- [ ] Gate de Pipe arquivado (409) com fase vermelha
- [ ] `Automation` em `MODELOS_AUDITADOS`
- [ ] Suíte completa verde (`pnpm test:ci`), lint, format, typecheck, build
- [ ] Revisão adversarial sem CRITICAL/HIGH aberto
- [ ] CI verde no PR
