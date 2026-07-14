# Analyze — Story 2.1: Ciclo de vida e catálogo de Pipes

> Análise **não destrutiva** de consistência cruzada: Spec × Plan × Tasks × Story BMAD × implementação ×
> migration × testes × documentação × contratos C1–C8. Nada de arquitetura foi reaberto e nada foi
> refatorado por preferência estética.
>
> Data: 2026-07-13 · Baseline: `c1baef7` · Branch: `story/2-1-ciclo-de-vida-e-catalogo-de-pipes`

## Resultado

**APROVADO COM PENDÊNCIAS.**

Nenhuma divergência **funcional** entre o que o Spec/Plan/Story pedem e o que o código faz. Os quatro
critérios de aceite têm evidência de execução real, e os seis critérios de sucesso (SC-201…SC-206) foram
exercitados contra PostgreSQL de verdade. As pendências são de **processo e de risco residual**, listadas
abaixo — nenhuma delas bloqueia a entrega ao revisor, e uma delas (P-1) é por definição irrealizável por
quem implementou.

## Cobertura: requisito → evidência

| Origem | Requisito | Implementação | Evidência executada |
|---|---|---|---|
| AC1 / SC-201 | catálogo org-scoped, consistente | `pipes.service.ts`, `pipes.controller.ts` | `pipes-http.test.ts`, `pipes-rls.test.ts` |
| AC2 / SC-202 | arquivamento reversível, dados preservados | `arquivar`/`restaurar` (estado, nunca DELETE) | `pipes-http.test.ts` (ciclo completo) |
| AC3 / SC-203 | não-Admin negado | `ability.factory.ts` (só ADMIN) | `pipes-authz.test.ts`, `pipes-http.test.ts` |
| AC3 / SC-205 | sem exclusão definitiva | GRANT sem DELETE + ausência de rota | `pipes-rls.test.ts`, SC-206 |
| AC4 / SC-204 | isolamento provado pelo banco | RLS ENABLE+FORCE, 4 policies | `pipes-rls.test.ts`, SC-206 |
| migration-check / SC-206 | deploy + rollback | `..._pipes/migration.sql` + `.down.sql` | **SC-206**, 13 passos, banco descartável |

Execuções (2026-07-13): API **253/253** · Web **68/68** · typecheck, lint, `format:check` limpos ·
`git diff --check` limpo · SC-206 verde em PostgreSQL descartável (evidência em
`gates/2-1/migration-check.md`).

## Requisitos não implementados

**Nenhum.** Todos os itens do Spec têm implementação e evidência.

## Implementação fora do escopo

**Nenhuma.** Verificado item a item contra os não-objetivos: não há papel por Pipe (2.2), Fase (2.3),
Formulário, Card, exclusão definitiva, duplicação, reordenação global, nem semântica de bloqueio para
`locked`. Nenhuma tabela ou coluna foi materializada "para o futuro" (AD-11).

## Defeito encontrado e corrigido

`POST /pipes/:id/archive` e `POST /pipes/:id/restore` respondiam **201 Created** — o default do NestJS
para `@Post` — quando não criam recurso algum: são transições de estado de um Pipe existente. O teste
`pipes-http.test.ts` estava correto ao exigir **200 OK** e **falhou de verdade** (fase vermelha
observada); o defeito era do controller.

Correção: `@HttpCode(HttpStatus.OK)` nas duas rotas. `POST /pipes` **permanece 201**, porque de fato cria.
A suíte, que estava vermelha (1/253), ficou verde. Vale registrar o que isso diz do processo: o defeito não
foi encontrado por revisão de código, e sim por um teste que afirmava o contrato de protocolo — é o mesmo
padrão da lição da Story 1.4 (unidade verde escondendo comportamento quebrado).

## Decisões assumidas (registradas, não silenciosas)

**D-1 — o `AuthzGuard` passou a popular `{ id, orgId }` no escopo do sujeito.**
Antes: `subject(requisito.sujeito, { id: orgId })`. Agora: `{ id: orgId, orgId }`. A razão é que os
sujeitos de **domínio** (o primeiro é `Pipe`) escopam por `orgId`, enquanto `Organizacao` escopa por `id`.
O caminho de `Organizacao` é **bit a bit o mesmo** (a condition continua casando `{ id }`), e a suíte de
authz do L1 segue verde — mas isto é uma alteração no **arquivo do guard**, que pertence ao contrato
congelado **C3**. A Story afirma "consome C3 sem alterá-lo"; a afirmação vale para o *mecanismo*
(deny-by-default, ponto de aplicação, cache), **não** para o arquivo. **É o ponto que mais merece o olhar
do revisor.** Alternativa descartada: dar ao `Pipe` uma condition por `id` — seria mentir sobre o
significado do campo (o `id` de um Pipe não é o da Organização) e quebraria o isolamento assim que a
checagem fina fosse por recurso.

**D-2 — `arquivar`/`restaurar` são idempotentes.** Arquivar um Pipe já arquivado é **200**, não erro. O
Spec pede idempotência explicitamente para `archive`; estendê-la a `restore` é simétrico e evita um erro
inútil numa operação sem efeito colateral.

**D-3 — SC-206 é um procedimento reproduzível executado, não um teste do `pnpm test`.** Criar um cluster
PostgreSQL descartável dentro do Vitest exigiria orquestração de Docker dentro da suíte — infraestrutura
nova que ninguém especificou (Constitution II). A evidência foi capturada em `gates/2-1/migration-check.md`,
com os comandos exatos. Ver risco residual **R-3**.

**D-4 — `updateMany` no lugar de `update`.** `atualizar`, `arquivar` e `restaurar` usam `updateMany` para
que a filtragem da RLS produza `{ count: 0 }` (traduzido em 404) em vez de um erro distinto que revelaria
a existência de um Pipe de outra Organização. É a mesma escolha de não-enumeração já feita no `obter`.

## Riscos residuais

**R-1 — falso positivo na trilha de auditoria (baixo, não bloqueante).**
`Pipe` entrou em `MODELOS_AUDITADOS`, e a auditoria classifica mutação em lote com `count: 0` como
`denied` — mecanismo deliberado, para que vandalismo cross-tenant filtrado pela RLS não passe como
`allowed`. Consequência: **arquivar um Pipe já arquivado** (operação legítima e idempotente) gera uma
linha `denied` na trilha. É ruído de auditoria, não falha de segurança nem de função — o troco aceito e
documentado no próprio `tenant-context.ts` ("o falso positivo custa uma linha de log; o falso negativo
custa uma tentativa de acesso cruzado invisível"). Registrado para que ninguém, ao investigar um
incidente, leia essa linha como ataque.

**R-2 — armadilha latente no escopo do guard (baixo, fecha-fechado).**
Como o guard injeta `{ id: orgId, orgId }`, um sujeito futuro cuja condition use `id` com o sentido de
*id do recurso* (ex.: `can('ler', 'Card', { id: cardId })`) compararia o `id` do recurso com o `orgId` e
**negaria sempre**. Falha **fechada** (nega, não libera), portanto não é vulnerabilidade — mas é o tipo de
comportamento que consome uma tarde de depuração. A checagem do guard é **grossa** por desenho (o papel
pode a ação sobre o *tipo*, nesta Org); a checagem fina de *qual recurso* é da RLS. Está comentado no
código.

**R-3 — o rollback não é exercitado pelo CI (médio).**
O `deploy` das migrations roda no CI; o **rollback** não. O SC-206 provou que ele funciona hoje, mas uma
migration futura que quebre o `.down.sql` só seria descoberta quando alguém precisasse dele — isto é,
durante um incidente. Não corrigi isto aqui porque criar um job de CI é mudança de infraestrutura fora do
escopo congelado da 2.1. **Recomendação:** tarefa técnica própria, ou anexar ao débito de operação já
registrado no **L6** (que permanece aberto — nada aqui o resolve).

**R-4 — rollback de schema não preserva dados de Pipe (esperado, precisa estar dito).**
O `.down.sql` faz `DROP TABLE`: reverter a migration **apaga todos os Pipes**. Confirmado no SC-206 (a
tabela reaplicada volta vazia). Isto é próprio de rollback de schema, não um defeito — mas em produção o
rollback desta migration é uma operação **com perda de dados**, e exige backup verificado antes. Ver
`gates/2-1/backup-check.md`.

## Tarefas sem evidência

**Nenhuma** entre T001–T012 / T1–T6: cada tarefa marcada aponta para código, migration, teste executado
ou gate. As tarefas de revisão independente e `commit-check` permanecem **desmarcadas** por não serem
auto-atestáveis (ver pendências).

## Inconsistências encontradas (todas resolvidas ou registradas)

1. **Rastreio desatualizado** — os checkboxes de T1–T6 e T001–T012 estavam **todos desmarcados** apesar do
   código existir, e os gates finais não haviam sido escritos. Reconciliado nesta rodada, com referência a
   evidência em cada item.
2. **Spec Kit incompleto** — faltavam `checklist.md` e `analyze.md` (a sequência oficial é
   `specify → clarify → plan → checklist → tasks → analyze`). Criados agora, a partir dos artefatos e do
   código já existentes; nenhuma decisão de arquitetura foi reaberta.
3. **`CLAUDE.md` factualmente obsoleto** — o bloco de estado ainda descrevia a Story 1.2 ("não existem
   Pipes/Cards"), o que deixou de ser verdade. Atualizado para o estado real da 2.1, sem antecipar 2.2/2.3.
4. **Divergência menor Plan × implementação** — o Plan previa `test/pipes.test.ts` "ou" a divisão em
   arquivos; a implementação usou **três** (`-rls`, `-http`, `-authz`). Sem impacto: é a divisão que o
   próprio Plan admite, e ela separa as fronteiras (banco / protocolo / autorização).
5. **Contrato de status HTTP** — o Spec fixava `201` para `POST /pipes` mas não dizia o status de
   `archive`/`restore`. O código respondia 201 nas três; corrigido para 200 nas duas transições (ver
   "Defeito"). O Spec permanece válido: nada nele foi contrariado.

## Compatibilidade com C1–C8

- **C3 (autorização)** — consumido pela adição do sujeito `Pipe`, que é a extensão prevista pelo próprio
  substrato. **Com a ressalva D-1** (o arquivo do guard foi tocado, com comportamento preservado).
- **C4 (RLS/isolamento)** — consumido: `Pipe` replica o padrão de `Membership` (ENABLE+FORCE, policies por
  `current_org_id()`, GRANT mínimo). Nenhum caminho de bypass introduzido (AD-6).
- **C6 (casca)** — intocado (2.1 não tem superfície de frontend).
- **C1, C2, C5, C7, C8** — não tocados. Suítes completas de API e Web verdes ⇒ sem regressão detectada.

## Itens fora do escopo da Story presentes no working tree

Classificados e **mantidos fora do commit** (nenhum arquivo apagado):

| Item | Classificação | Tratamento |
|---|---|---|
| `.claude/skills/bmad-*`, `.claude/skills/speckit-*` | **local** (packs de skills instalados; hoje só `commit-check` é versionado) | `.git/info/exclude` |
| `.agent/`, `.agents/` | **local** (espelhos das mesmas skills para outros runtimes de agente) | `.git/info/exclude` |
| `_bmad-output/.../tooling/closure-automation-proposal.md` | **compartilhável, fora do escopo da 2.1** | permanece untracked; entra por mudança própria |
| `.python-version` (3.13.14) | **possivelmente oficial** — o repositório versiona `_bmad/scripts/*.py`, então Python é real aqui; mas não há `.tool-versions`/`uv`, e o Node é fixado por `.nvmrc` | **escalado**: padronizar runtime Python é decisão de equipe, não da Story 2.1. Não commitado, não excluído — deixado visível de propósito |
| `.claude/skills/commit/` | **possivelmente oficial** — o `CLAUDE.md` manda executar a skill `commit`, e a irmã `commit-check` **já é versionada**; a assimetria sugere um esquecimento, não uma decisão | **escalado** pelo mesmo motivo do `.python-version`: versioná-la é decisão de equipe. Deixada visível, fora do commit da 2.1 |

O `.gitignore` versionado **não** foi alterado: ignorar tooling de agente afeta toda a equipe e merece
decisão própria.

## Pendências (resolvidas nesta rodada de revisão)

- **P-1 — revisão adversarial independente.** ✅ **APPROVED** — 11 vetores de ataque refutados por
  execução, 3 achados LOW aceitos e rastreados. Ver `gates/2-1/aceites-independentes.md` §1.
- **P-1b — security-check independente.** ✅ **APPROVED** — isolamento provado nas 4 frentes com evidência
  real. §2.
- **P-1c — decisão de Arquitetura D-1/C3.** ✅ **`C3 COMPATIBLE — APPROVED`** — extensão de catálogo
  prevista pelo AD-9; comportamento de `Organizacao` preservado; sem reabrir o C3. §3.
- **P-2 — `commit-check`.** ✅ **APPROVED FOR COMMIT**; commit `c91e321`.
- **P-3 — débitos gerados.** R-3 → **DBT-ROLLBACK-CI** (L6); D-1 → **DBT-AUTHZ-01** (Story 2.2) e
  **GOV-C3-NOTA** (governança). Rastreados em `gates/2-1/debitos-gerados.md`. `.python-version` e
  `.claude/skills/commit/` seguem escalados (decisão de equipe), fora do commit da 2.1.

Nenhum achado CRITICAL/HIGH/MEDIUM em aberto. As condições de qualidade para o merge do PR #17 estão
satisfeitas.
