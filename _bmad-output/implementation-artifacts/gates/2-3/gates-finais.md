# Gates finais — Story 2.3 (Gerenciamento de Fases)

## context7-check
Prisma 6.19.3 `Decimal` → Postgres `numeric` com `@db.Decimal(p,s)`; `new Prisma.Decimal(...)` com aritmética
(`.plus`/`.div`) para o ponto médio; `orderBy` em `Decimal` suportado. Confirmado via MCP Context7
(`/prisma/web`). Nenhuma assinatura inventada.

## security-check
- **Isolamento (invariante-mãe):** `Phase` com RLS ENABLE+FORCE, 4 policies por `current_org_id()`, WITH CHECK
  no INSERT e UPDATE; runtime sem DELETE. Provado em `phases-rls.test.ts` (fase vermelha inclusa).
- **Deny-by-default + autorização por recurso:** guarda grossa `@Requer('ler','Pipe')`; a guarda fina
  (Admin da Org **ou** Admin do Pipe gerencia; MEMBER/VIEWER só leem; sem acesso → 404) vive no
  `PhasesService`. **Não** se usou `@Requer('administrar','Pipe')` em gerenciar Fases (barraria o Admin do
  Pipe). Guard/`ability.ts` (C3) **não tocados** — confirmado por `git diff`.
- **Ativação de `role` com reconferência de `Membership.state`:** `resolverPoder` lê `PipeGrant.role` e exige
  `Membership.state = ACTIVE` (fecha DBT-2.2-ROLE-DORMENTE e, para esta superfície, DBT-2.2-MEMBERSHIP-ADVISORY).
- **Não-enumeração:** 404 uniforme para Pipe/Fase de outra Org ou sem concessão (indistinguível de "não
  existe"). Provado em `phases-http.test.ts` e `phases-authz.test.ts`.
- **Sem `orgId` do cliente; payload sem `orgId`/`position`** (chave interna não vaza). Sem mass assignment
  (parsers manuais aceitam só `name`/ids/`afterPhaseId`).
- **RN-030:** nenhuma rota altera `pipeId`; `Phase` não migra entre Pipes.

## observability-check
Mutações de `Phase` (criar/renomear/mover/arquivar/restaurar) entram na trilha de auditoria (`Phase` em
`MODELOS_AUDITADOS`), inclusive a tentativa negada. Caminhos idempotentes (arquivar/restaurar já no estado)
retornam SEM emitir `updateMany` → não sujam a trilha com falso `denied` (mesma correção da 2.1). Logs
sanitizados (sem `orgId`, sem PII); `name` de Fase é rótulo de processo.

## lgpd-check
`Phase.name` é **rótulo de processo, não PII** (como `Pipe.name`). Nenhum dado pessoal novo é coletado,
gravado ou logado. Sem base legal nova exigida.

## Débitos gerados (seis campos)

### DBT-2.3-POSITION-RENORM
- *Descrição:* a ordenação usa chave fracionária (`position` `numeric(38,18)`); inserções fracionárias
  repetidas no **mesmo** intervalo poderiam, em teoria, esgotar a escala decimal.
- *Impacto:* apenas sob uso patológico (reordenações concentradas no mesmo ponto, muitas vezes); para Fases
  (poucas por Pipe, reordenação rara) é praticamente inatingível. Sem risco de isolamento/correção.
- *Justificativa para não corrigir agora:* renormalizar posições é operação multi-row, que `withTenantContext`
  não faz atômica; implementar sem consumidor real seria antecipação (Constitution II).
- *Responsável:* Escritor 2.3. *Lote-alvo:* hardening / Story 1.3 (transações com contexto). *Critério:*
  rotina administrativa de renormalização acionável quando o gap mínimo cair abaixo de um limiar; teste.
  *Gate:* revisão de código + teste da renormalização.

### DBT-2.3-ULTIMA-FASE-TOCTOU
- *Descrição:* o invariante "≥1 Fase ativa" é enforçado no serviço (conta ACTIVE antes de arquivar); dois
  `arquivar` concorrentes poderiam ambos ver count==2 e zerar.
- *Impacto:* janela concorrente rara; **recuperável** por `restaurar`. Não é falha de isolamento.
- *Justificativa:* mesma classe do DBT-2.2-MEMBERSHIP-ADVISORY; `withTenantContext` recusa `$transaction`
  (escopo da 1.3).
- *Responsável:* Escritor 2.3. *Lote-alvo:* hardening / Story 1.3. *Critério:* reconferência atômica do
  count ao arquivar quando houver transação com contexto. *Gate:* teste concorrente.

### Herdado — DBT-2.2-FK-COMPOSTA
FKs de `Phase` referenciam `Pipe(id)`/`Organization(id)`, não `(orgId,id)` — mesma defesa-em-profundidade
ausente das FKs de `PipeGrant`; isolamento vivo intacto por app+RLS. Sem mudança de responsável/critério/gate.

## Estado dos gates
`context7-check` · `format:check` · `lint` (escopado ao código novo; o ruído de `.claude/worktrees/` é
efêmero e fora do commit) · `typecheck` · `test` **293/293** (PostgreSQL real) · `migration-check` (deploy/
rollback/reaplicação com evidência real) — todos verdes. Falta: **revisão independente read-only** e
`commit-check` (a seguir).
