# Checklist — Story 2.11

## Modelo / migration
- [x] Enum `CardLifecycleState` + colunas `lifecycleState`(default ATIVO)/`previousLifecycleState` em `Card`.
- [x] Migration aditiva, reversível; default ATIVO (backfill trivial).
- [x] **GRANT UPDATE column-scoped** (só estado + updatedAt); `phaseId`/`valores` sem UPDATE.

## Domínio
- [x] Núcleo puro `planejarTransicao` (matriz completa; válida/idempotente/inválida; preserva `previous`).
- [x] Serviço: transação interativa atômica (estado + evento `CardHistory`), guarda otimista, P2002/P2028→409.
- [x] Autorização OPERAR o Card; 404 sem acesso, 403 só-lê; C3/CASL intocado.
- [x] Controller: 4 rotas POST → 200; `validarIdRota`.
- [x] Detalhe do Card expõe `lifecycleState`.

## Testes (PostgreSQL real)
- [x] Unidade da matriz de transições.
- [x] HTTP: transições, idempotência, inválidas→409, autz 403/404, eventos, detalhe.
- [x] RLS: column-scope (estado sim / phaseId,valores permission denied) + isolamento.

## Gates
- [x] typecheck, lint, prettier, build verdes.
- [x] Suíte cheia (só os 2 vermelhos ambientais pré-existentes).
- [x] migration-check / security-check / observability-check (ver gates/2-11).
