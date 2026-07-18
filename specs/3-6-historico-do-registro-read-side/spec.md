# Spec — Story 3.6 — Histórico do Registro (read-side)

## Contexto

Read-side puro da trilha própria do Registro (`RecordHistory`, escrito pelo write-side 3.4: `CREATED`,
`VALUES_UPDATED`, `ARCHIVED`, `RESTORED`). Espelho exato do **Histórico do Card (2.17)** no domínio DISTINTO de
Registro (`Card ≠ Registro`). Distinto da Auditoria administrativa (E8). Baseline: `f738220`.

## Requisitos funcionais

- **RF-1 (timeline):** dado um Registro que o principal pode ler, devolver seus eventos em ordem cronológica
  (`[createdAt, id]`), paginados por cursor (teto 100), com `id/type/summary/actorId/data-hora`.
- **RF-2 (projeção segura):** a resposta expõe **apenas** a allowlist. `orgId`/`recordId` fora da fronteira;
  nunca binários, chaves de objeto de storage ou URLs temporárias.
- **RF-3 (autorização por acesso atual):** consultar exige poder de **ler o Database dono** do Registro
  (`exigirLerDatabase`, 3.2). Sem acesso → 404 não-enumerante. O histórico **não** concede acesso.
- **RF-4 (correção append-only):** a leitura reflete a imutabilidade — correção é novo evento; o original persiste.

## Requisitos não-funcionais

- **NFR-3/4 (paginação):** cursor determinístico, teto rígido 100; nunca a trilha inteira.
- **Isolamento (invariante-mãe):** RLS por Organização em `RecordHistory`/`Record`; toda query por
  `withTenantContext`; nada de `where orgId` manual; `orgId`/`databaseId`/`recordId` do cliente nunca confiados.
- **AD-15/AD-30:** projeção controlada; sem trilha de integração/payload; sem material sensível de arquivo.

## Fronteiras

- **Sem** migration, GRANT ou alteração de `MODELOS_AUDITADOS` (leitura pura sobre tabela já append-only).
- **Guard C3 congelado:** `@Requer('ler','Database')` grosso + guarda fina no serviço (DBT-AUTHZ-01).

## Critérios de aceite

Ver AC1–AC7 na story `_bmad-output/implementation-artifacts/3-6-historico-do-registro-read-side.md`.

## Fora de escopo

Auditoria administrativa (E8); write-side/captura (3.4); eventos de arquivo (3.8) e vínculo/`correlationId` (3.9);
diff antes/depois e origem como campos ricos (exigem evolução do write-side).
