# Pre-Implementation Check — Story 3.8 (Campo Arquivo funcional e anexo geral)

## Identificação
Story 3.8, Épico 3, risco ALTO. Branch `story/3-8-campo-arquivo-funcional-e-anexo-geral` (base `main` = `53e29ac`, com a 3.7 mergeada). Governada pela ADR-001 (AC-2 "[3.8, não 3.7]"). Primeiro **consumidor concreto** da capacidade de arquivos da 3.7.

## Fase e etapa
Fase 1, Épico 3. Story **aberta** (`sprint-status` 3-8 → `ready-for-dev` pelo workflow, commit `8f97093`). Pré-requisito 3.7 **mergeado e done**. Spec Kit reconciliado com a 3.7 real (`reconciliation-3-7.md`), delta-analyze **0 CRITICAL / 0 HIGH bloqueante**.

## Objetivo
Ativar o Campo `FILE` (catálogo 2.4) nos três Formulários e criar o anexo geral por recurso (Card/Registro), **consumindo** a 3.7 (sem reimplementar storage/scan/quarentena/veredito/antiabuso).

## Escopo incluído
(1) binding do `FileAuthzContract` da 3.7 a `pipe-authz`/`database-authz` (dispatcher por `resourceType`, sem ciclo — AD-5); (2) valor do Campo `FILE` = referência a `FileObject` `DISPONIVEL` (substitui texto em `submission.ts`, propaga a 2.7/2.8/3.4); (3) gate de consumo 409 `CAPACIDADE_ARQUIVO_INDISPONIVEL`; (4) anexo geral (rotas de Card/Registro); (5) canal público com limites; (6) eventos `FILE_ATTACHED/REPLACED/REMOVED`; (7) coluna FILE exibível na tabela (3.5); (8) **DEB-3.7-SMOKE-STORAGE**: reintroduzir MinIO/ClamAV no CI + smoke real do caminho SigV4/`node:net`.

## Fora de escopo
Anexo em Tarefa/Solicitação (E5), e-mail (E6), avatar (3.10); cota por bytes (DEB-1); read-side/mascaramento do Histórico (2.17/3.6); reimplementar a máquina de segurança da 3.7.

## Documentação consultada
ADR-001; `epics.md` 3.8; a implementação real da 3.7 no `main` (FileObject/FileScan/ScanSlot, `file-authz.contract.ts`, `files.service.ts`, `submission.ts`, `file-gate.ts`, `file-validation.core.ts`); `review-and-debts.md` da 3.7; Spec Kit da 3.8 + `reconciliation-3-7.md`.

## context7-check (T001) — registrado
- **Prisma 6.19.3:** validação/consulta de `FileObject` por `(resourceType, resourceId, state=DISPONIVEL)` e valor JSONB por `Field.id` — **mesmos padrões já usados** (submission 2.7/3.4, RLS via `withTenantContext`). Sem feature nova.
- **NestJS 11 (DI):** `useFactory` + `inject` para o dispatcher do `FileAuthzContract` (injeta `RequestContext`/`Prisma`/logger, roteia por `resourceType` para as funções PURAS `pipe-authz`/`database-authz`); token **Symbol** já existente + `@Inject`. A ligação vive **fora de `files/`** (consumidor/AppModule ou módulo de wiring) — a 3.7 já exporta `FILE_AUTHZ_CONTRACT` com default deny-all; a 3.8 fornece o dispatcher real. Confirmado na doc NestJS (custom providers/tokens não-classe/override).
- **Storage/ClamAV:** a 3.7 é **zero-dependência** (SigV4 sobre `node:http`, clamd via `node:net`) — nenhum SDK novo a checar. O smoke real usa `docker-compose.dev-files.yml` já entregue.

## Regras de negócio / permissões afetadas
Herança de permissão do recurso (ver/baixar=leitura; enviar/substituir/remover=edição) via porta; 404 não-enumerante sem acesso; 403 ler-sem-operar. Cross-recurso: `fileId` só referenciável se pertencer a ESTE recurso e estiver `DISPONIVEL`. `PERMISSÃO=AÇÃO+ESCOPO`, deny-by-default. Guard C3 congelado (`@Requer` grosso + fina no serviço).

## Dados/entidades
Reusa `FileObject`/`FileScan` da 3.7 (**meta: sem migration, sem GRANT novo** — Opção A: anexo geral = linha não referenciada em `valores`; `resourceType` texto validado por allowlist). Eventos em `CardHistory`/`RecordHistory` (append-only, existentes). Migration aditiva **só** se a Opção A falhar (fase vermelha obrigatória). Novos **envs** do canal público (Zod, faixa, fail-closed).

## Arquitetura/módulos
ALTERA: `pipes/cards/*` e `databases/records/*` (bindings + rotas de anexo + eventos), `pipes/cards/submission.ts` (valor referencial), `pipes/public-submissions/*` (canal público), `databases/records/record-query.core.ts`+`records-read.service` (coluna FILE), `kernel/config/env.ts` (envs do canal), `.github/workflows/ci.yml` + `docker-compose.dev-files.yml` (smoke real). NÃO altera `files/` (só é consumido). AD-4/AD-5 preservados.

## Skills obrigatórias
`context7-check` (feito), `pre-implementation-check` (este), `security-check`, `lgpd-check`, `observability-check`, `migration-check` (se houver migration), `commit-check`. Revisão adversarial (4 frentes) antes do merge. Testes de integração REAIS + mutação (ADR AC-28).

## Riscos
- **R1 (regressão E2/E3):** `submission.ts` é usado por 2.7/2.8/3.4 — mudar `FILE` de texto→referência exige regressão verde dos três + publicação/leitura. **MITIGAÇÃO:** testes direcionados por caminho + suíte serial no diff final.
- **R2 (cross-recurso = contorno de autz):** provar `fileId ∈ este recurso` e `DISPONIVEL`, não só "existe na Org". Teste com autz de aplicação neutralizada.
- **R3 (DI sem ciclo):** dispatcher fora de `files/`; `pipe-authz`/`database-authz` são puros. **Provar** que `files/` não importa domínio.
- **R4 (DEB-3.7-SMOKE):** o caminho SigV4/MinIO real nunca rodou; o smoke da 3.8 é o 1º. Se falhar, é bug da 3.7 a corrigir (com regressão) antes das ACs de storage real.

## Estratégia de testes
Integração real (PostgreSQL + **MinIO + ClamAV** reintroduzidos no CI). `*-rls` com fase vermelha por tabela/coluna nova. Mutação obrigatória: gate de consumo (deletar gate→vermelho), cross-recurso, cross-tenant, indisponível-até-verificar, público sem download. Nunca reusar contas do seed em membership persistente.

## Estratégia de rollback
Meta sem migration (Opção A) → rollback trivial (reverter código). Se houver coluna (Opção B), migration reversível + `.down.sql` (lição da 3.7). Gate `FILE_UPLOAD_ENABLED` default `false` = kill-switch.

## Decisões pendentes
Não bloqueantes: valores dos limites do canal público (Q4 → envs com defaults conservadores na implementação); confirmação dos defaults Q1/Q5/Q6/Q7/Q8 do planner (fail-closed, baixo risco de retrabalho). H2/M1/R6 já **RESOLVIDOS** (reconciliação).

## Status final
**APROVADO.** Sem CRITICAL/HIGH bloqueante; reconciliação com a 3.7 completa; context7 registrado; escopo, riscos, dados, permissões e arquitetura definidos. Ordem de implementação: **T001b (smoke/CI) → Fase 2 (binding + valor referencial + gate) → US1 (MVP) → US2/US3/US4 → testes/gates → revisão → merge → closure**.

## Checklist
[x] fase confirmada · [x] no escopo atual · [x] story/spec localizada · [x] ACs definidos · [x] regras de negócio · [x] permissões · [x] entidades/relacionamentos · [x] fonte de verdade · [x] impacto multi-tenant · [x] documentação técnica validada (context7)
