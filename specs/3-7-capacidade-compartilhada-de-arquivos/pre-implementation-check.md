# Pre-Implementation Check Report

## Identificacao da tarefa
Story 3.7 — Capacidade compartilhada de arquivos (Épico 3). Branch `story/3-7-capacidade-compartilhada-de-arquivos` (base `7ca3c57`, já com `kernel/antiabuso/` do PR #98). Governada pela ADR-001 ratificada.

## Fase e etapa atual
Fase 1, Épico 3 (Databases/Registros/Vínculos/Arquivos). A 3.7 está **liberada** (`sprint-status`: `ready-for-dev`, movida pelo `bmad-create-story` oficial). Não antecipa Fase 2. Pré-requisito (extração antiabuso) **já mergeado**.

## Objetivo
Estabelecer, uma única vez, uma capacidade fail-closed de arquivos (upload/quarentena/verificação/entrega sob sessão/remoção/expurgo), desacoplada de Card e Registro, reutilizável por E5/E6/avatar.

## Escopo incluido
Storage privado (client S3), verificação composta (magic bytes + tamanho + 2×SHA + ClamAV CLEAN + CopyObject if-match), quarentena, entrega por stream sob sessão, remoção lógica + expurgo, validação server-side, limites (10/recurso), semáforo `ScanSlot` sobre `kernel/antiabuso/`, gate `FILE_UPLOAD_ENABLED`, override compose dev/CI (MinIO+ClamAV isolados), porta `FileAuthzContract`.

## Fora do escopo
Campo Arquivo funcional e anexo geral por recurso (3.8); avatar (3.10); limites por Org/Formulário; provisionamento de storage/antivírus de produção (operação).

## Documentacao consultada
ADR-001 (§1-13, threat model, ACs); `epics.md` Story 3.7 (com emenda DIV-2); `sprint-change-proposal-2026-07-17.md`; ARCHITECTURE-SPINE (AD-27/28/24/32/4/5/6/10); Spec Kit da 3.7 (spec/plan/data-model/contracts/tasks/analysis); `env.ts:169` (`FILE_UPLOAD_ENABLED`); `pipes/public-submissions` + `kernel/antiabuso` (padrão reusado).

## Story e criterios de aceite
Story formal + Spec Kit completos. ACs 1-5 (quarentena fail-closed; entrega sob sessão; sem acesso cruzado; remoção→expurgo; validação) mapeados a FR-001..019 e SC-001..006. Cobertura 19/19 (analysis.md).

## Regras de negocio afetadas
Fail-closed AD-28; permissão herda do recurso (ver/baixar=leitura, enviar/substituir/remover=edição); sem acesso cruzado mesmo com a chave; sem exclusão física (LGPD); `Card ≠ Registro`/desacoplamento preservados.

## Permissoes afetadas
`PERMISSÃO = AÇÃO + ESCOPO`, deny-by-default. A 3.7 **não** inventa papéis: injeta `FileAuthzContract` (leitura/edição por recurso), implementado pelos consumidores (3.8/3.10). Sem acesso → 404 não-enumerante; ler-sem-editar → 403. Guard C3 congelado.

## Dados e entidades afetados
NOVAS: `FileObject` (org-scoped, mutável), `FileScan` (org-scoped, append-only), `ScanSlot` (global). Isolamento pelo banco (RLS ENABLE+FORCE + WITH CHECK nas org-scoped); `orgId` nunca do cliente; `MODELOS_AUDITADOS` += FileObject/FileScan. Retenção/expurgo/anonimização conforme LGPD. Migration + rollback drill planejados (T005/T007).

## Arquitetura e modulos afetados
NOVOS: `kernel/storage/` (client S3), `files/` (domínio). ALTERA: `kernel/config/env.ts` (envs), `app.module`/módulos (wiring), `docker-compose` (override dev/CI), `.github/workflows/ci.yml` (provisiona MinIO/ClamAV). `kernel/antiabuso/` já existe (#98). AD-4/AD-5 respeitados (kernel técnico; política em `files/`). Sem tocar `pipes/`.

## Dependencias tecnicas
A adicionar (T002): SDK S3 (client MinIO-compatível) e client ClamAV — **versões a fixar com `context7-check` antes de adicionar** (não inventar assinaturas). Serviços externos: MinIO + ClamAV **só dev/CI** (AD-32 — nunca no host do Chatwoot).

## Skills obrigatorias para esta tarefa
`context7-check` (S3 SDK/ClamAV — **pendente**, obrigatório em T002), `security-check`, `migration-check`, `lgpd-check`, `backup-check`, `observability-check`, `performance-check` (leitura/stream). `commit-check` por seção.

## Riscos identificados
- **R1 (segurança/fail-closed):** ClamAV "cego" ou timeout — mitigado por AlertExceedsMax/EICAR/DB max age + veredito BLOCKED (T013/T017, testes de mutação).
- **R2 (cross-tenant):** chave adivinhada — mitigado por chave opaca + guarda por segmento + 404 não-enumerante (T020/T021).
- **R3 (ambiente):** MinIO/ClamAV não provisionados localmente — mitigado pelo override compose dev/CI (T003); CI é o gate.
- **R4 (troca de bytes):** 2×SHA ingest/releitura (T012/T017).
- **R5 (Windows git):** worktree/rebase estoura timeout — operar com cautela (remover lock, rebase --quit).

## Plano minimo de implementacao
Ordem: T002 (context7 + deps) → T003 (compose/CI) → T004 (env) → T005/T006/T007 (migration+GRANT+rollback) → T008/T009 (storage+semáforo) → **US1 MVP** (T010-T017) → US2 (T018-19) → US3 (T020-21) → US4 (T022-23) → US5 (T024-25) → polish/gates (T026-28). Núcleos puros primeiro; integração real com MinIO/ClamAV.

## Estrategia de testes
Integração real (PostgreSQL + MinIO + ClamAV), suíte serial no CI. `*-rls` com **fase vermelha provada** para cada tabela. Testes de **mutação** obrigatórios: EICAR, zip bomb, base velha, timeout, extensão mentida, troca de bytes, chave cross-tenant, download sem sessão, gate off. Nunca reusar Ana/Bruno/Carla/Eva em `membership.create` persistente.

## Estrategia de rollback
Migration reversível com rollback drill documentado (`db:rollback` limpo). Gate `FILE_UPLOAD_ENABLED` default `false` = kill-switch honesto (capacidade desligável sem reverter schema). Sem DELETE em runtime (dados preservados).

## Decisoes pendentes
Nenhuma bloqueante. C1-C4 resolvidos no clarify (porta authz, substituir=transição, janela de expurgo config, teto do semáforo config). Valores numéricos de limites = config (10/recurso fixado).

## Status final
**APROVADO COM RESSALVAS** — ressalva única: o `context7-check` do SDK S3 e do client ClamAV é **obrigatório em T002, antes de adicionar as dependências** (mitigação já no plano; não afeta regra de negócio, design de segurança, dados, permissões ou arquitetura — todos resolvidos pela ADR-001). A implementação pode iniciar pelos itens que não dependem dessas libs (migration, núcleos puros, env) enquanto T002 valida as APIs.

## Checklist
[x] fase atual confirmada · [x] tarefa no escopo atual · [x] story/spec localizada · [x] critérios de aceite definidos · [x] regras de negócio identificadas · [x] permissões identificadas · [x] entidades/relacionamentos identificados · [x] fonte de verdade definida · [x] impacto multi-tenant avaliado · [~] documentação técnica validada (context7 das libs pendente — T002)
