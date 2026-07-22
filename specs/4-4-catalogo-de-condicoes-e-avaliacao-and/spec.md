# Spec — Story 4.4: Catálogo de Condições + avaliação AND

> Fonte autoritativa: `_bmad-output/planning-artifacts/epics.md` §"### Story 4.4 — Catálogo de Condições + avaliação AND".
> FR-23 · RN-103 · D4.2 · NFR-4/6. Deps: 4.3 (done). Risco: **ALTO** (avaliação fail-closed + multi-tenant + gate de Arquitetura).

## 1. Objetivo

Entregar o **catálogo oficial fixo** de tipos de Condição sobre os cinco domínios (Card; Campo e valor; prazo e
marco; relacionamento; Fase), o **avaliador AND puro e determinístico** sobre o **snapshot pós-Evento**, e o
**contrato do snapshot** que o motor (4.6) consumirá. **Não** implementa o motor de disparo (4.6), o catálogo de
Ações (4.5), encadeamento (4.7) nem trilha de Execuções (4.8) — AD-11: o consumidor concreto do avaliador é a 4.6.

## 2. Fronteira (o que ESTÁ e o que NÃO está)

**Entrega:**
- Catálogo puro (`conditions/condition-catalog.ts`): 7 tipos cobrindo os 5 domínios + enforcement fail-closed de
  configuração (`exigirCondicoesNoCatalogo`), análogo a `event-catalog.ts` (4.3).
- Contrato do snapshot puro (`conditions/condition-snapshot.ts`): `SnapshotAvaliacao` — a fotografia congelada do
  estado do recurso no instante do Evento, montada pelo motor (4.6) sob RLS.
- Avaliador puro (`conditions/condition-eval.core.ts`): `avaliarCondicoes(condicoes, snapshot)` — AND
  determinístico, fail-closed, reusando a semântica de comparação de `record-query.core.ts` (3.5).
- Reuso da semântica por tipo de Campo: `categoriaDeCampo` **exportada** de `record-query.core.ts` (aditivo, sem
  mudança de comportamento) — fonte única do mapeamento tipo→categoria ("sem segundo catálogo de operadores").
- Enforcement do catálogo de Condições nos DOIS serviços de Automação (criar 4.1; editar/duplicar/ativar 4.2):
  Condição de tipo/operador/valor fora do catálogo → **400 `CONDICAO_FORA_DO_CATALOGO`**.

**NÃO entrega (contrato/AD-11 — sem consumidor concreto agora):**
- Motor/fila/consumidor que MONTA o snapshot e CHAMA o avaliador (4.6). Sem ele, a 4.4 não lê estado do banco.
- Catálogo de Ações (4.5), encadeamento/ciclos (4.7), trilha de Execuções (4.8).
- Persistência do snapshot ou do resultado da avaliação (a 4.6/4.8 decidem — sem consumidor concreto agora).
- Grupos `OU/OR`, aninhamento, filtros salvos (fora da Fase 1 — Story §1356).

## 3. Catálogo — tipos de Condição (fixo/completo, 5 domínios)

| tipo | domínio | operadores | ref exigida | valor |
|---|---|---|---|---|
| `CARD_LIFECYCLE_STATE` | Card | `igual`/`diferente` | — | ATIVO/FINALIZADO/ARQUIVADO |
| `CARD_HEALTH` | Card | `igual`/`diferente` | — | ok/atrasado/vencido/expirado |
| `CARD_PHASE` | Fase | `igual`/`diferente` | PHASE (1) | — (a Fase é a ref) |
| `CARD_FIELD_VALUE` | Campo | por tipo do Campo (3.5) + `preenchido`/`vazio`/`mudou` | FIELD (1) | conforme o tipo |
| `RECORD_FIELD_VALUE` | Campo | idem | FIELD (1) | conforme o tipo |
| `CARD_MILESTONE` | prazo/marco | `atingido`/`nao_atingido` | — | esperado/vencimento/expiracao |
| `CARD_HAS_RECORD_LINK` | relacionamento | `existe`/`nao_existe` | RECORD (0..1) | — |

**Operadores de Campo** = os de `record-query.core` (3.5) — `igual`/`contem`/`maior`/`menor`/`intervalo`/
`contemOpcao` — mais `diferente`/`preenchido`/`vazio`/`mudou` (Story §1357/§1360: nulo/vazio/ausente explícitos;
mudança consulta valor anterior e posterior). A compatibilidade FINA operador↔tipo é fail-closed na AVALIAÇÃO.

## 4. Contrato do snapshot pós-Evento (§1357–1359)

`SnapshotAvaliacao`: `orgId`, `avaliadoEm` (=`occurredAt` do Evento — instante absoluto UTC, o **fuso oficial**),
`camposPorId` (Campos ATIVOS — allowlist), `card` (`lifecycleState`/`saude`/`phaseId`/`marcos`/`valores`/
`valoresAnteriores`/`linkedRecordIds`), `record` (`lifecycleState`/`valores`/`valoresAnteriores`). Montado pelo
motor (4.6) **sob `withTenantContext`**: referência cross-tenant simplesmente NÃO entra no snapshot (a policy
responde "não existe") ⇒ o avaliador a trata como **falso** (fail-closed). O avaliador **nunca** toca banco.

## 5. Regras de avaliação (Story §1355–1363)

1. **AND**: todas verdadeiras ⇒ aprovado; qualquer falsa ⇒ reprovado. **Vazio ⇒ aprovado direto**.
2. **Snapshot pós-Evento**: avalia contra o estado congelado; execução tardia na fila NÃO muda o veredito.
3. **Fail-closed**: tipo/operador/valor desconhecido, malformado, tipo incompatível ou não-avaliável ⇒ **falso**;
   erro de avaliação vira `false`, nunca exceção que escape (nunca "verdadeiro por omissão").
4. **Sem coerção implícita** entre tipos incompatíveis; nulo/vazio/Campo ausente têm comportamento explícito.
5. **Datas/prazos** comparam por instante absoluto UTC (fuso oficial, 2.12/DIV-1).
6. **Determinismo**: única fonte de tempo = `snapshot.avaliadoEm`; sem `Date.now()`/aleatório na comparação.
7. **Referência inválida** (Campo/Fase/recurso removido/arquivado/cross-tenant): impede ativação
   (`revalidarReferencias`, 4.1/4.2) OU é fail-closed na avaliação (Campo ausente do snapshot ⇒ falso).
8. **Sem efeitos colaterais nem novos Eventos**; avaliação é função pura.

## 6. Gate de Arquitetura — fuso oficial + semântica de comparação (DERIVADO, não inventado)

Consolidado por derivação dos precedentes (ver `decisions/condition-evaluation-4-4.md`):
- **Semântica de comparação por tipo** = `record-query.core.ts` (3.5): categoria por `FieldType` (fonte única
  via `categoriaDeCampo`), data por instante absoluto, número validado, allowlist de operadores, fail-closed,
  sem concatenação (aqui não há SQL — comparação em memória de valor literal).
- **Fuso oficial** = a decisão de marcos por Fase (2.12): instantes em `@db.Timestamptz` (absoluto UTC, DIV-1). A
  comparação de prazo/data é sobre instantes absolutos; `avaliadoEm` (=`occurredAt`) é a referência temporal.
- **Nenhuma escolha arquitetural nova não-derivável** — nenhum `EXTERNAL_BLOCKER`.

## 7. Isolamento multi-tenant (invariante-mãe)

A 4.4 é **núcleo puro** — não lê estado. O isolamento vive em quem MONTA o snapshot (4.6, sob RLS) e nas
referências (`revalidarReferencias`, sob RLS, já existente 4.1/4.2). Provado no avaliador: referência ausente do
snapshot ⇒ falso (nunca avalia contra dado alheio). `orgId` no snapshot é só carimbo; o avaliador não autoriza
por ele. Nenhuma entrada aceita `orgId` do cliente.

## 8. Migration

**Não há.** As Condições já vivem em `Automation.condicoes` (JSON, desde 4.1); a avaliação é núcleo puro e o
snapshot é montado em memória pelo motor (4.6). Sem tabela nova, sem GRANT novo, sem mudança de RLS.

## 9. Critérios de aceite (mapeados aos testes)

- **CA1** (catálogo/config): Condição de tipo/operador/valor fora do catálogo → 400. Ausência de Condição é
  legítima. → `condition-catalog.core.test.ts`, `automations-http` (bloco CONDICAO_FORA_DO_CATALOGO).
- **CA2** (AND): todas verdadeiras ⇒ aprovado; qualquer falsa ⇒ reprovado; vazio ⇒ aprovado direto. → `(b)`.
- **CA3** (fail-closed): desconhecido/malformado/tipo incompatível/não-avaliável ⇒ falso; nunca exceção. → `(c)`.
- **CA4** (nulo/vazio/ausente/sem coerção; fuso oficial): comportamento explícito; data por instante UTC. →
  `(a)`/`(d)`.
- **CA5** (determinismo): mesmo snapshot ⇒ mesmo resultado; tempo só de `avaliadoEm`. → `(e)`.
- **CA6** (isolamento): referência ausente do snapshot ⇒ falso, nunca avalia dado alheio. → `(f)`.
- **CA7** (snapshot congelado): avalia contra o estado do Evento; mudança usa o "antes" do snapshot. → `(g)`.
