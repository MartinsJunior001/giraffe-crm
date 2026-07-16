# Checklist de requisitos — Story 3.4

## Cobertura dos ACs (do épico)

- [ ] AC1 — criação ≤1 Registro contra `FormVersion` publicada; valida snapshot; não publicado → recusa. (RF-1)
- [ ] AC2 — idempotência real (mesma chave → 1 Registro; concorrência → nunca 500). (RF-1)
- [ ] AC3 — arquivar reversível, sai das consultas ativas, não bloqueado por vínculos, idempotente. (RF-3)
- [ ] AC4 — restaurar preserva identidade/valores/arquivos/Histórico/vínculos; volta a ATIVO. (RF-3)
- [ ] AC5 — write-side: evento por operação, na mesma transação, append-only imutável. (RF-1/2/3)
- [ ] AC6 — sem exclusão física; isolamento por Org/Database; cross-tenant/cross-database → 404. (NFR)
- [ ] AC7 — operar = gerenciar/operar Database (MEMBER acordado); VIEWER → 403; sem acesso → 404; não transferível.

## Invariantes do dono

- [ ] `Card ≠ Registro` / `Database ≠ Pipe` — entidade distinta, reusa lógica não entidades.
- [ ] Isolamento pelo banco: RLS ENABLE+FORCE + WITH CHECK (INSERT e UPDATE) em `Record` e `RecordHistory`.
- [ ] Sem exclusão física: GRANT sem DELETE; `RecordHistory` sem UPDATE/DELETE.
- [ ] Definição congelada (AD-12): `formVersionId` imutável; editar revalida contra ela.
- [ ] Não transferível (RN-063): `databaseId` fora do GRANT de UPDATE (permission denied provado).
- [ ] Idempotência: `@@unique([orgId, databaseId, idempotencyKey])`; P2002/P2028 tratados.
- [ ] Guard C3 congelado (`git diff -- kernel/authz/` vazio).
- [ ] Sem antecipar 3.5+ (sem listagem/tabela/filtro; sem read-side; sem arquivo; sem vínculo; sem Automação).

## Gates de execução

- [ ] context7-check registrado (Prisma 6.19.x / P2002 — reuso de padrões verdes).
- [ ] pre-implementation-check APROVADO.
- [ ] Fase vermelha provada (WITH CHECK desligado → teste falha; GRANT DELETE → teste falha).
- [ ] SC-206 (deploy → rollback → reapply) verde.
- [ ] Regressão de Card (2.7/2.8) e Formulário de Database (3.3) verde.
- [ ] security/observability/lgpd/migration/backup/performance-check.
