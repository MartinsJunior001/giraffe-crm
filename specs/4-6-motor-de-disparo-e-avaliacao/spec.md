# Spec — Story 4.6: Motor de disparo, avaliação, ordem e efeitos parciais

**Épico:** 4 (Automação) · **Risco:** ALTO (executa mutações reais sob o principal Automação) ·
**Deps:** 4.3, 4.4, 4.5 (done) · **FR-23 · D4.2 · NFR-6 · AD-13/18.**

## Objetivo

Consumir o outbox `DomainEvent` (4.3) após o commit da origem e, para cada Automação **ativa** inscrita no
evento, avaliar Condições (4.4) contra um snapshot congelado e **executar** as Ações (4.5) **sob o principal
Automação**, com entrega **at-least-once** e **idempotente** — sem duplicar efeitos, sem ampliar poderes, sem
acoplar à transação de origem.

## Contrato (o que o motor faz)

1. **Consome o outbox** `DomainEvent`: seleciona eventos ainda não processados por uma dada Automação ativa
   do Pipe do evento (Automações são por Pipe — RN-100); claim concorrente via `FOR UPDATE SKIP LOCKED`.
2. **Dedup de Execução** por `eventId+automationId+automationVersionId` (§1402): uma ocorrência lógica gera
   **≤1 Execução** por Automação. Captura a **versão** no momento da criação da Execução (§1404).
3. **Monta o `SnapshotAvaliacao`** sob RLS (fecha DEB-4-4-SNAPSHOT-BUILDER): Card/Registro/marcos/saúde/
   vínculos/`valoresAnteriores` — **M-1**: `recordId`/`linkedRecordIds` só de Registros vinculados a um Card
   do Pipe proprietário.
4. **Avalia Condições** (`avaliarCondicoes`, AND, fail-closed). Não satisfeita ⇒ `SKIPPED_CONDITIONS`, sem Ação.
5. **Executa Ações em ordem** (`entao`): `resolverAlvoDeterministico` + `revalidarAcao` (4.5); **só executa se
   `permitido`** (L-1). Executor reusa o núcleo puro do domínio + tx `definirContextoOrg`. **Dedup de Ação**
   por `executionId+actionIndex` (§1403).
6. **Efeitos parciais** (D4.2): Ação que falha ⇒ seguintes bloqueadas; efeitos anteriores permanecem; sem
   rollback entre Ações; Execução em `PARTIAL`. Automações distintas seguem independentes.
7. **Retries/backoff/timeout + recuperação**: falha transitória usa tentativas limitadas + backoff; esgotar ⇒
   estado final explícito; job interrompido (crash) é **retomado** por lease vencida, sem duplicar efeito.
8. **Registra a Execução** (`AutomationExecution` + `AutomationActionResult`) — a trilha que a 4.8 lerá.

## Critérios de aceite (verificados por teste de integração real — PostgreSQL)

- **CA1** — Evento committado ⇒ processamento pós-commit, via outbox, assíncrono, **só Automações ativas**.
- **CA2** — Mesma ocorrência reentregue (at-least-once/retry) ⇒ **≤1 Execução** por Automação (dedup) e Ação
  concluída **não repete** (`executionId+actionIndex`).
- **CA3** — Automação com N Ações; a K-ésima falha ⇒ K+1..N não executam (`BLOCKED_PRIOR_FAILURE`), efeitos
  1..K-1 permanecem (sem rollback), Execução = `PARTIAL`; outras Automações do mesmo evento seguem.
- **CA4** — Tentativas esgotadas ou concorrência sobre o mesmo recurso ⇒ estado final explícito + controle de
  concorrência/versão, **sem falha silenciosa**, sem promessa de ordem global.
- **CA5 (M-1)** — Alvo derivado do evento cross-Pipe / de Database não-referenciado ⇒ **recusado** (não executa).
- **CA6 (não-ampliação)** — Ação fora do escopo/capacidade do principal ⇒ **não executa** (revalidação 4.5 barra).
- **CA7 (SC-2101/2102)** — `CARD_ASSIGN_RESPONSIBLE`: membro alvo sem acesso operacional prévio ⇒ recusa; atribuir
  não amplia acesso.
- **CA8 (fail-closed)** — Condição não satisfeita ⇒ nenhuma Ação; Ação recusada/confirmação humana ⇒ efeitos
  parciais conforme contrato, **sem 500**.
- **CA9 (isolamento)** — toda leitura/escrita cross-tenant é negada pelo banco; auditoria sanitizada (sem `valores`).

## Invariantes (não erodir)

- Toda query por `withTenantContext()`/tx com `definirContextoOrg`; **nenhum** `where orgId` como única defesa;
  o motor **nunca** aceita `orgId` do cliente (vem do evento/config, sob RLS).
- Execução da Ação sob o **principal Automação** (escopo restrito), nunca sob o criador nem o ator do evento.
- Tabelas novas: RLS ENABLE+FORCE + WITH CHECK (INSERT e UPDATE), FK composta tenant-safe, `MODELOS_AUDITADOS`,
  **sem DELETE** de runtime, GRANT mínimo (Execução: UPDATE column-scoped; Result: só SELECT/INSERT). Fase
  vermelha do GRANT/policy provada.
- Idempotência: colisão P2002/P2028 ⇒ idempotente/409, **nunca 500**.

## Fora do escopo (AD-11)

Encadeamento/prevenção de ciclos (4.7); trilha read-side / aba "Execuções" (4.8 — o motor **produz** as linhas);
loop contínuo multi-réplica robusto + dead-letter administrativo (4.7/deployment); continuação de confirmação
humana por fluxo separado (contrato futuro).
