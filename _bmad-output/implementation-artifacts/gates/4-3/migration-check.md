# migration-check — Story 4.3

**Migration:** `20260727120000_domain_events` — SIM (materializa o outbox `DomainEvent`).

## Natureza
- **Aditiva** — nova tabela, sem alterar/dropar colunas/tabelas existentes. Sem backfill (tabela nova).
- **Não-destrutiva** (AD-17): nenhum dado existente é tocado. Compatível durante deploy (a coluna/tabela nova
  não é lida por versões anteriores).

## Isolamento (replica o padrão canônico)
- RLS ENABLE+FORCE; policies select/insert/update/delete por `orgId = current_org_id()`; WITH CHECK no INSERT
  e no UPDATE. GRANT SÓ `SELECT, INSERT` a `giraffe_app` (append-only). Owner = `giraffe_migrator`.
- FK composta tenant-safe `(orgId, pipeId) → Pipe(orgId, id)` ON DELETE CASCADE (como `MovementEvent`: o evento
  é fato derivado do Pipe; a tenant-safety vem do PAR no INSERT, não do modo de DELETE). `orgId` FK CASCADE.

## Rollback (drill EXECUTADO — banco descartável porta 5447)
- **`.down.sql` versionado:** `apps/api/prisma/rollback/20260727120000_domain_events.down.sql` = `DROP TABLE IF
  EXISTS "DomainEvent";` (tabela isolada; policies/índices/FKs/GRANTs caem junto no DROP). Segue a convenção
  exata do repo (`prisma/rollback/*.down.sql`, consumida por `scripts/db-migrate.mjs`); sem ele o runner
  RECUSA o rollback (guarda fail-closed do topo da pilha).
- **Drill executado e verificado:** `db:migrate` (aplica) → `to_regclass` = `"DomainEvent"`, GRANT `INSERT,
  SELECT`, `relforcerowsecurity=t` → `db:rollback` → `to_regclass` = vazio (tabela removida) → `db:migrate`
  (reaplica) → `to_regclass` = `"DomainEvent"`, GRANT `INSERT,SELECT`, FORCE RLS `t`. Roll-forward e
  roll-back comprovados idempotentes.

## Fase vermelha (drill manual, banco descartável)
- Afrouxar o WITH CHECK e remover a FK composta, observar a gravação cross-tenant, restaurar e reconfirmar —
  MANUAL, registrado no PR (não versionado, como em `automations-rls`). Os testes versionados exercitam a
  proteção PRESENTE (append-only, cross-tenant, FK).

## Veredito
APROVADO — aditiva, reversível, isolamento simétrico ao precedente. Aplicar por `db:migrate` (etapa controlada,
nunca no boot).
