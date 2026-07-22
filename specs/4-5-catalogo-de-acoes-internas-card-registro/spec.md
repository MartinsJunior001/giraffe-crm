# Spec — Story 4.5: Catálogo de Ações internas (Card/Registro)

> Fonte autoritativa: `_bmad-output/planning-artifacts/epics.md` §"### Story 4.5 — Catálogo de Ações internas (Card/Registro)".
> FR-21/23 · RN-101 · D4.1/D4.2 · AD-9/13/18. Deps: 4.4, 2.14, 2.15, 2.16, 2.17, 3.4, 3.6, 3.9 (todas done).
> Risco: **ALTO** (modelo de autorização do principal Automação + multi-tenant + gate de Arquitetura/Segurança).

## 1. Objetivo

Entregar o **catálogo oficial fixo** de tipos de Ação interna sobre **Card** e **Registro** (alvo determinístico), o
**contrato do principal Automação** (tipo + escopo restrito + distinção ator/iniciador/principal) e a **revalidação
pura** de escopo/estado/existência sob esse principal — tudo que o motor (4.6) consumirá. **Não** implementa o motor
de disparo/execução (4.6), o encadeamento (4.7) nem a trilha de Execuções (4.8) — AD-11: o consumidor concreto é a 4.6.

## 2. Fronteira (o que ESTÁ e o que NÃO está)

**Entrega:**
- Catálogo puro (`actions/action-catalog.ts`): 8 Ações (5 de Card, 3 de Registro) + enforcement fail-closed de
  configuração (`exigirAcoesNoCatalogo`), análogo a `condition-catalog.ts` (4.4) e `event-catalog.ts` (4.3). Inclui o
  requisito de **confirmação humana** por Ação (§1383) e a garantia de **alvo determinístico** em tempo de config.
- Contrato do **principal Automação** puro (`actions/automation-principal.ts`): `PrincipalAutomacao` (Org + Pipe +
  recursos configurados + capacidades explícitas, deny-by-default) e a **distinção dos três papéis da trilha**
  (`TrilhaAtoria`: ator / iniciador / principal), com as funções de escopo/capacidade.
- Revalidação pura (`actions/action-revalidation.core.ts`): `resolverAlvoDeterministico` (§1381) +
  `revalidarAcao(acao, alvo, snapshot, principal)` — fail-closed sobre existência/Org/escopo/estado/capacidade.
- Enforcement do catálogo de Ações nos DOIS serviços de Automação (criar 4.1; editar/duplicar/ativar 4.2): Ação de
  tipo/refs/parâmetros/alvo fora do catálogo → **400 `ACAO_FORA_DO_CATALOGO`**.

**NÃO entrega (contrato/AD-11 — sem consumidor concreto agora):**
- Motor/fila que MONTA o snapshot do alvo, CONSTRÓI o `PrincipalAutomacao` concreto e EXECUTA a Ação (4.6). Sem ele, a
  4.5 não lê estado do banco nem muta recurso algum.
- A máquina de estados de **confirmação humana** (`aguardando confirmação`/fluxo separado — §1388) é da 4.6; a 4.5 só
  REGISTRA o requisito no contrato.
- Encadeamento/ciclos (4.7), trilha de Execuções (4.8), extensões E5/E6 (4.9).
- Reimplementação da mutação de domínio (mover 2.14, Responsável 2.10, ciclo de vida 2.11, valores 3.4) — a 4.5
  DESCREVE e revalida; a execução reusa esses serviços na 4.6.

## 3. Catálogo — tipos de Ação (fixo/completo, 2 domínios)

| tipo | domínio | alvo | ref exigida | parâmetros | confirmação humana |
|---|---|---|---|---|---|
| `CARD_MOVE` | Card | Card de contexto | PHASE (1) = destino | — | **sim** |
| `CARD_ASSIGN_RESPONSIBLE` | Card | Card de contexto | — | `membershipId` (UUID) | não |
| `CARD_SET_FIELD_VALUE` | Card | Card de contexto | FIELD (1) | `valor` (presente; `null` limpa) | **sim** |
| `CARD_FINALIZE` | Card | Card de contexto | — | — | **sim** |
| `CARD_ARCHIVE` | Card | Card de contexto | — | — | **sim** |
| `RECORD_CREATE` | Registro | novo Registro | DATABASE (1) | `valores?` | não |
| `RECORD_CREATE_RELATED` | Registro | novo Registro + vínculo ao Card | DATABASE (1) | `valores?` | não |
| `RECORD_EDIT` | Registro | determinístico (`alvo.modo`) | RECORD (1) só no modo `EXPLICITO` | `alvo{modo}` + `valores?` | **sim** |

**Alvo determinístico de `RECORD_EDIT`** (§1381): `EVENTO` = o Registro que originou o Evento; `VINCULO` = o ÚNICO
Registro vinculado ao Card de contexto (0 ou >1 ⇒ ambíguo ⇒ fail-closed); `EXPLICITO` = referência de Registro
configurada. **Sem busca aberta, sem atualização em massa.** As refs (PHASE/FIELD/DATABASE/RECORD) já são do
vocabulário da 4.1 e revalidadas por `revalidarReferencias` (sob RLS) no serviço — nenhuma mudança no núcleo da 4.1.

## 4. Principal Automação (RISCO ALTO — DERIVADO de AD-9/AD-18, não inventado)

`PrincipalAutomacao` = principal INTERNO próprio (AD-9 lista Automação como principal distinto), com:
`orgId` + `pipeId` (RN-100) + `automationId` + `automationVersionId` (AD-18: execução registra a versão) +
`recursosAutorizados` (allowlist derivada das referências configuradas + Pipe; deny-by-default) + `capacidades`
(allowlist dos tipos de Ação do `entao`; deny-by-default — AD-18 "capacidades explícitas; não herda as permissões do
criador"). **O escopo é do principal, não do criador** — é o que impede a ampliação de poder (§1389).

**Três papéis na trilha (§1384):** `ator` = o principal Automação (quem executa agora); `iniciador` = quem iniciou a
mudança original que emitiu o Evento (preservado — humano/automação/sistema); `principal` = a definição versionada que
agiu (`automationId`+`automationVersionId`). Materializados em `TrilhaAtoria`; nenhum é fundido com outro.

## 5. Revalidação (§1389) — pura, fail-closed

`revalidarAcao` na ordem: (1) tipo conhecido; (2) **capacidade explícita** (deny-by-default — não-ampliação);
(3) existência do alvo (não encontrado sob RLS ⇒ recusa); (4) **mesma Organização** (cross-tenant ⇒ recusa);
(5) **escopo restrito** (Card ⇒ Pipe do principal; Registro/Database ⇒ allowlist de recursos); (6) **estado** admissível
(invariante "ARQUIVADO = somente-leitura"; defesa em profundidade — o serviço de domínio é a autoridade final na 4.6).
Alvo indeterminado ⇒ recusa. Motivos SANITIZADOS (enum, nunca id/valor). Confirmação humana viaja no veredito para a 4.6.

## 6. Gate de Arquitetura/Segurança — principal Automação + confirmação (DERIVADO, não inventado)

Consolidado por derivação (ver `decisions/automation-principal-4-5.md`):
- **AD-9** — principais carregam Organização, ator/origem e permissões; deny-by-default; Automação é principal distinto.
- **AD-18** — capacidades explícitas deny-by-default; não herda indefinidamente as permissões do criador; definição
  versionada; a execução revalida Org/ativa/versão/permissões/existência (não confia no payload).
- **AD-13/AD-16** — evento/trilha carregam Organização + ator/origem + correlação; a mudança original preserva quem a
  iniciou. **Nenhuma escolha arquitetural nova não-derivável** — nenhum `EXTERNAL_BLOCKER`.

## 7. Isolamento multi-tenant (invariante-mãe)

A 4.5 é **núcleo puro** — não lê estado nem muta. O isolamento vive em quem MONTA o snapshot/principal (4.6, sob RLS) e
nas referências (`revalidarReferencias`, sob RLS, 4.1/4.2, já existente). Provado no núcleo: alvo de outra Org ⇒
`FORA_DA_ORG`; recurso fora do escopo ⇒ `FORA_DO_ESCOPO`; alvo ausente ⇒ recusa — nunca alcança dado alheio. `orgId`
nunca é aceito do cliente (a config reusa `validarConfiguracao` da 4.1).

## 8. Migration

**Não há.** As Ações já vivem em `Automation.entao` (JSON, desde 4.1); catálogo/principal/revalidação são núcleo puro;
o snapshot e o principal concreto são montados em memória pelo motor (4.6). Sem tabela nova, sem GRANT, sem RLS nova.

## 9. Critérios de aceite (mapeados aos testes)

- **(a)** cada Ação do catálogo tem contrato válido; Ação fora do catálogo → 400 `ACAO_FORA_DO_CATALOGO`. →
  `action-catalog.core.test.ts`, `automations-http` (bloco ACAO_FORA_DO_CATALOGO).
- **(b)** revalidação sob o principal: alvo inexistente/estado inválido/fora do escopo → recusa. →
  `action-revalidation.core.test.ts`.
- **(c)** não-ampliação: recurso/capacidade fora do escopo restrito → recusa (mesmo que o criador pudesse). →
  `action-revalidation.core.test.ts`, `automation-principal.core.test.ts`.
- **(d)** isolamento cross-tenant: alvo de outra Org → recusa. → `action-revalidation.core.test.ts`.
- **(e)** alvo determinístico: mesmo Evento/config → mesmo alvo, sem ambiguidade. → ambos os core tests.
- **(f)** a trilha distingue ator/iniciador/principal. → `automation-principal.core.test.ts`.
- **(g)** confirmação humana registrada onde exigido. → `action-catalog.core.test.ts`, `action-revalidation.core.test.ts`.
