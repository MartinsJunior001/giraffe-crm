# Gate T015 — Revisão adversarial CRÍTICA + gates de conclusão da Story 3.4

Data: 2026-07-16 · Branch: `story/3-4-ciclo-de-vida-do-registro-historico-write-side` (off `origin/main` @ 4e60ee4)

## Gates de qualidade (evidência real)

- **typecheck** (`tsc --noEmit`, src + test): ✅ verde.
- **lint** (`eslint .`): ✅ verde. **format** (`prettier --check`): ✅.
- **testes-alvo** (`records-rls` + `records-http`): ✅ **11/11** em PostgreSQL real.
- **regressão do reuso** (`submission` + `cards-http` + `database-forms-http/rls` + `card-lifecycle-http`): ✅
  **39/39** — o reuso de `submission.ts` não alterou o comportamento de Card (2.7/2.8) nem do Formulário de
  Database (3.3).
- **suíte serial completa** (`test:ci`): ✅ **711/711** (86 arquivos), zero falhas — inclusive o `login-http`
  (rate-limit) que costuma piscar sob carga passou neste run. Gate autoritativo = CI limpo.
- **SC-206** (deploy → rollback cirúrgico → reapply em PostgreSQL real): ✅ verde. Rollback dropa
  `RecordHistory`→`Record`→enums (ordem FK), sem tocar `Database`/`Form`/`FormVersion`; reapply íntegro;
  `db:status` up to date (19 migrations).

## Revisão adversarial CRÍTICA (4 camadas)

Segurança, Arquitetura/RLS, Edge Cases e Aceite, sobre o diff da 3.4. **Nenhum achado CRÍTICO/ALTO de código.**
Aceite = **APROVADO** (AC1–AC7 e invariantes do dono atendidos; C3 congelado confirmado por
`git diff 4e60ee4 -- apps/api/src/kernel/authz/` **vazio**).

- **Segurança:** todo sítio de mutação passa por `exigirOperarDatabase` (VIEWER→403; sem acesso→404); leitura por
  `exigirLerDatabase`. `orgId`/`databaseId` fora do payload; toda query por `withTenantContext`. `Record` GRANT
  column-scoped (só `lifecycleState`/`valores`/`updatedAt`) e **sem DELETE**; `RecordHistory` só `SELECT/INSERT`.
  RLS ENABLE+FORCE + WITH CHECK (INSERT e UPDATE). `valores` (PII) só no detalhe, nunca em log/lista. Idempotência
  P2002/P2028 → nunca 500. Database arquivado = somente-leitura (409). **Prova de fase vermelha (mutação):** uma
  coluna não concedida recebe **`42501 permission denied for table Record`** (probe com `WHERE false`, sem
  confundir com FK) — o GRANT column-scoped é genuíno; grant indevido revogado após a prova.
- **Arquitetura/RLS:** `Card ≠ Registro` — entidade/módulo/enum próprios em `databases/records/`; reusa a LÓGICA
  (`submission.ts` puro, padrão de tx/idempotência/ciclo de vida), nunca as entidades de Card. Sem ciclo de módulo
  (`submission.ts` é import puro; `database-authz` puro; Databases→Pipes unidirecional). Migration coerente com o
  padrão de Card/Database. `formVersionId`/`databaseId` sem UPDATE → "definição congelada" (AD-12) e "não
  transferível" (RN-063) garantidos pelo banco.
- **Edge Cases:** produção correta. Idempotência (mesma chave → 1 Registro; concorrência → 409/nunca 500);
  arquivar/editar-arquivado → 409; guarda otimista com no-op sem `updateMany` (sem falso `denied`); editar
  revalida contra a versão congelada do próprio Registro.
- **Aceite:** APROVADO. Ressalvas documentais (contrato) endereçadas.

### Achados endereçados nesta Story

- **DOC (contrato `records.http.md`):** a criação idempotente devolve **201** (paridade com Card 2.7), não 200; e
  Formulário de Database **não publicado** é **409** (estado), não 400. **Contrato corrigido** para refletir o
  código (que já estava certo). Sem mudança de código.

## Gates de conclusão

- **security-check:** ✅ (revisão de Segurança acima; RLS/GRANT/roteamento de autz; prova de fase vermelha).
- **observability-check:** ✅ `Record`/`RecordHistory` em `MODELOS_AUDITADOS`; auditoria manual (FR-214) só de
  metadados (nunca `valores`); `orgId` fora do payload.
- **migration-check (SC-206):** ✅ verde (acima).
- **lgpd-check:** ✅ sem exclusão física (sem GRANT DELETE em `Record`; sem UPDATE/DELETE em `RecordHistory`);
  arquivar é `state` (preserva o dado do titular); `valores` (PII) só no detalhe, nunca em log.
- **backup-check:** ✅ migration aditiva (2 tabelas novas vazias + 2 enums); sem alteração destrutiva de dado
  existente; rollback cirúrgico testado.
- **performance-check:** ✅ `@@index([orgId, databaseId])` (consulta por Database — 3.5); índice único de
  idempotência; `@@index([orgId, recordId, createdAt])` (timeline — 3.6). Toda query org-scoped; reuso puro
  (sem N+1 novo).

## Veredito

**APROVADO PARA COMMIT/PR.** Todos os gates verdes com evidência real; revisão adversarial CRÍTICA sem achado
alto; fase vermelha do GRANT column-scoped provada por mutação; achados documentais endereçados. Gate autoritativo
da suíte serial = CI limpo.
