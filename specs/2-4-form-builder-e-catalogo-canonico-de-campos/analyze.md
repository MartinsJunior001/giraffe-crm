# Analyze — Story 2.4: Form Builder e catálogo canônico de Campos (pré-implementação)

> Análise **não destrutiva** de consistência cruzada do **pacote de planejamento** da 2.4: épico × PRD
> (D3.1/D3.2) × RN-050..054 × AD-11/12/27/28 × Story × spec × plan × tasks × contratos congelados × débitos
> herdados. A implementação ainda não começou — o objetivo é aprovar (ou não) o pacote para codificar.
>
> Data: 2026-07-14 · Branch: `story/2-4-form-builder-e-catalogo-canonico-de-campos` (empilhada sobre a 2.3)

## Resultado

**APROVADO PARA IMPLEMENTAÇÃO — com 3 gates de verificação e 1 dependência de ordem.**

O escopo é coerente com o épico e com as decisões de Produto já aprovadas (D3.1/D3.2); as 8 Clarifications do
spec foram **fechadas** no plan por decisão fundamentada; não há `[NEEDS CLARIFICATION]` pendente. Restam três
verificações a fazer **durante** a implementação e uma regra de ordem (a 2.3 precede na `main` — já mergeada,
PR #22).

## Cobertura: requisito → onde será provado

| Origem | Requisito | Plano | Prova prevista |
|---|---|---|---|
| AC1 / SC-241,242 | catálogo canônico (12 tipos) + identidade estável | enum `FieldType`; `Field.id` uuid; opções JSON com UUID | `forms-http` |
| AC2 / SC-243 | INV-FORM-01 (não-contaminação) + contexto visível | `Form` por contexto = linha distinta + RLS | `forms-http` (teste dedicado RN-054) |
| AC3 / SC-244 | gate Campo Arquivo fail-closed | flag `FILE_UPLOAD_ENABLED` + função pura | `forms-file-gate` |
| AC4 / SC-245 | contrato reutilizável pelo E3, sem 2º builder | enum `FormContext.DATABASE` como contrato; catálogo/estrutura | análise (sem rota Database em 2.4) |
| AC5 / SC-246,247 | autorização de config (reusa 2.3) + 404 não-enum | helper extraído `resolverPoder`; guarda fina no serviço | `forms-authz` |
| AC6 / SC-248,249 | isolamento RLS + sem exclusão + migration | ENABLE+FORCE + GRANT sem DELETE + rollback | `forms-rls`, migration-check |

## Consistência épico × PRD × spec

- **D3.1** fixa o catálogo oficial (12 tipos), a estrutura conceitual do Campo (identidade estável, rótulo,
  tipo, ajuda, config, valor padrão, posição, ativo/arquivado; opções com identidade estável) e "catálogo
  comum aos três contextos, instâncias independentes". Spec/plan refletem **sem desvio**. O catálogo como
  **enum global** (não dado por Org) é leitura correta de "conjunto fechado, o mesmo para toda Organização".
- **D3.2** dá o ciclo (rascunho→publicar→despublicar = **2.6**) e quem configura/publica: inicial e Fase →
  **Admin da Org / Admin do Pipe**. A 2.4 entrega **só a montagem** (config) e **reusa** a resolução da 2.3 —
  publicação fica **fora** (2.6). Coerente.
- **RN-050..054** — independência dos três Formulários; **RN-054 crítica** e `NÃO CONFIRMADO` na doc-fonte →
  o pacote a trata como **requisito comportamental com teste dedicado** (não como decisão de produto em
  aberto). Correto.
- O épico manda "Fora: evolução de Campos (2.5), publicação (2.6)" — respeitado. Card/Submissão/Database owner
  **não** aparecem no pacote (AD-11).

## Requisitos não cobertos
**Nenhum** dos AC do épico ficou sem tarefa e critério de sucesso.

## Escopo antecipado (Constitution II)
**Nenhum.** Pontos onde a antecipação foi **conscientemente evitada**:
- **Sem tabela `FieldOption`** (D4): opções em JSON com UUID estável; a tabela só se materializa na 2.5/2.7 se
  a integridade referencial de valores submetidos (inexistentes hoje) exigir — débito **DBT-2.4-OPCOES-JSON**.
- **Sem coluna `databaseId`** em `Form` (D2): o valor `DATABASE` do enum é **contrato**; o owner chega no E3.
- **Sem rota de publicar** (o gate do Arquivo é função verificável, consumida pela 2.6) nem de editar/arquivar
  Campo (2.5). **Sem** storage/upload. **Nada** de Card/Submissão materializado.

## Decisões assumidas (registradas no plan)

- **D2 — `Form` tabela única + CHECK contexto↔owner + UNIQUE parciais.** Um Form por owner+contexto garantido
  pelo **banco** (índice único parcial), não pela app — evita corrida de duplo-getOrCreate.
- **D4 — opções de Seleção em JSON (diverge da reco do planejador, que era tabela).** Justificativa dupla:
  **atomicidade** sob a recusa de `$transaction` (criar Campo de Seleção = um único `create`) e
  **Constitution II** (não materializar 3ª superfície RLS cujo ciclo de vida é da 2.5). *Fundamentada;
  revisitável na 2.5 com consumidor concreto.*
- **D6 — extrair o helper de poder** (compartilhado por Fases e Formulários) em vez de replicar a guarda fina.
  Refactor **comportamentalmente neutro** do `PhasesService` (suíte 2.3 deve seguir verde).
- **D7 — módulo em `src/pipes/forms/`** (não módulo `forms` desacoplado): o desacoplamento "para o E3" seria
  abstração especulativa; o **contrato** reutilizável é o catálogo/estrutura, independente do local do módulo.

## Riscos residuais (a vigiar na implementação)

- **RV-1 (gate) — INV-FORM-01 provado por comportamento, não por construção.** Não basta "linhas distintas":
  **SC-243** exige um teste que **altere** um contexto e prove que o outro **não** mudou (RN-054). Não marcar
  o AC sem esse teste dedicado verde.
- **RV-2 (gate) — atomicidade de criar Campo de Seleção.** Confirmar em teste que adicionar um Campo
  `SELECT_*` com opções é **um** `field.create` (opções no `typeConfig`), sem multi-statement — coerente com
  a recusa de `$transaction`. Se a implementação tender a inserir opções separadamente, **parar** e revisar
  D4.
- **RV-3 (gate) — regressão da 2.3 pela extração do helper (T005).** A extração de `resolverPoder` é neutra
  **por definição**; a prova é `phases-authz.test.ts` verde **sem alteração de expectativa**. Rodar a suíte da
  2.3 antes e depois da extração.
- **RV-4 (ordem) — dependência da 2.3.** Empilha sobre a 2.3 (PR #22, já na `main`). A base está mergeada;
  ainda assim, rebasear sobre a `main` corrente antes do PR e revalidar migration/CASL/RLS/testes. Correções
  pendentes da 2.1/2.2/2.3 têm prioridade.

## Contratos C1–C8
- **C3 (authz)** — **consumido sem alteração**: a guarda fina por recurso vive no serviço (helper extraído);
  `ability.ts`/`authz.guard.ts` **intocados**. Sem novo desvio de contrato.
- **C4 (RLS)** — consumido: `Form`/`Field` replicam o padrão de `Pipe`/`Phase` (ENABLE+FORCE, 4 policies, WITH
  CHECK, GRANT sem DELETE).
- **C1/C2/C5/C6/C7/C8** — não tocados.

## Débitos herdados / abertos
- **DBT-AUTHZ-01** — **consumido** (guarda fina no serviço; agora via helper compartilhado).
- **DBT-2.2-FK-COMPOSTA** — herdado (FK não-composta; coerência de Org por app+RLS). Não reintroduzido.
- **DBT-2.2-ROLE-DORMENTE** — a metade "config" já foi fechada na 2.3; a 2.4 **reusa** a mesma resolução. A
  metade "Membro do Pipe opera cards" segue deferida a 2.7/2.10.
- **L6 / staging** (CR-09/D-01/D-02/D-05/D-06) — **não** tocados; seguem abertos. **D-06 continua bloqueando
  `STAGING APPROVED`.**

## Novos débitos abertos pelo pacote
- **DBT-2.4-OPCOES-JSON** (D4) e **DBT-2.4-FILE-GATE-CONSUMO** (D8) — registrados no plan.

## Veredito
**APROVADO PARA IMPLEMENTAÇÃO.** Iniciar pela Phase 1 (schema/migration/RLS) após `context7-check` (Json já
verificado no plan; confirmar `Decimal`/enum/NestJS validation) e `pre-implementation-check`. RV-1/RV-2/RV-3
são gates de verificação durante a codificação; RV-4 é regra de ordem (rebasear sobre a `main` antes do PR).
