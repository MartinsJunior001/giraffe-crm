# Story 2.8: Submissão pública controlada e triagem

Status: done — implementada, revisada (4 lentes, risco ALTO) e mergeada (PR #38). GATE de antiabuso resolvido (decisão do dono, 2026-07-14): baseline.

## Story

As a Organização,
I want um Formulário inicial público controlado com triagem,
so that eu receba entradas externas sem expor dados internos nem conceder acesso.

## Acceptance Criteria

1. **Público opt-in, só o inicial (SC-281).** O acesso público é habilitado por Formulário e SÓ para o Formulário inicial (Fase e Database nunca). Só a **versão publicada** recebe submissões. Despublicar/revogar bloqueia novas submissões; as anteriores são preservadas. [PRD D3.2 §951-952; epics.md §877]
2. **Submissão pública não concede acesso (SC-282).** O ator externo não recebe Membership/papel/acesso ao CRM; a submissão não concede acesso a Pipe/Card/dados internos; ele vê **apenas confirmação**. Nenhum dado interno (nem a existência de outros registros) aparece na resposta pública. [PRD D3.2 §952-953; epics.md §882]
3. **Modo triagem (padrão) vs. criação direta (explícito) (SC-283).** Por Formulário: **revisão antes da criação (padrão)** ou **criação direta (explícita)**. Em triagem, a submissão **não cria Card** até ser aprovada; em criação direta, a submissão válida cria exatamente 1 Card (reusa a criação atômica da 2.7). [PRD D3.3 §957-959; epics.md §877, §885]
4. **Triagem é ciclo da Submissão pública, não estado do Card (SC-284).** A `SubmissaoPublica` tem ciclo próprio: **pendente / aprovada / rejeitada / convertida**. `Fase ≠ Status do Card` permanece: a triagem nunca é um estado do Card. [PRD D3.3 §959; epics.md §877]
5. **Aprovar cria 1 Card; rejeitar preserva (SC-285).** Um revisor com a capacidade aprova → **exatamente 1 Card** criado, com **origem registrada** (submissão pública) e evento no Histórico (AD-13, reusa 2.7); rejeita → nenhum Card, submissão **preservada** conforme Governança/LGPD. [PRD D3.3 §959; epics.md §883]
6. **Idempotência de aprovação/conversão (SC-286).** Ações concorrentes de aprovação/conversão são idempotentes: uma submissão **convertida não pode ser aprovada de novo** e não se criam dois Cards. Em criação direta, reprocessamento não duplica. [epics.md §884-885]
7. **Autorização "Revisar submissões públicas" deny-by-default (SC-287).** Capacidade explícita, **negada por padrão**: Admin da Org e Admin do Pipe a possuem; Membro do Pipe só revisa quando **receber explicitamente** essa capacidade; o papel isolado não concede revisão automática. [PRD D3.3 §959; epics.md §878]
8. **Guardrails obrigatórios (SC-288).** Aviso de privacidade; consentimento quando aplicável; identificação da Organização; **limites de envio**; tratamento seguro de Campo Arquivo; mensagens sem dados internos. [PRD D3.2 §953; epics.md §877]
9. **Isolamento e contexto ausente (SC-289).** `SubmissaoPublica` e a conversão em Card respeitam RLS (org-scoped); nenhum caminho de bypass; contexto ausente falha fechado. O endpoint público resolve a Organização a partir do Formulário público alvo (nunca do cliente).

## ⛔ GATE OBRIGATÓRIO — Segurança/Arquitetura do antiabuso (precede a implementação)

O épico (epics.md §879) e o PRD (D3.2 §953) impõem, **antes da implementação e sem inventar mecanismo específico**, a decisão de Segurança/Arquitetura sobre a **proteção contra abuso/automação** do endpoint público não autenticado:

- **rate limit** da submissão pública (por IP/Formulário?) — o projeto já tem rate limit nativo do Better Auth (DB-backed, atômico — ver `d-06-resolvido-e-isolamento-rate-limit-paralelo`), mas ele chaveia por `${ip}|${path}` para AUTH; reusá-lo para a submissão pública é uma decisão a validar;
- **CAPTCHA / desafio anti-automação** — é dependência externa (AD-24: dependências externas atrás de portas por capacidade), com custo e escopo próprios; incluir no MVP é decisão de Produto/Segurança;
- **análise de Arquivo** — o Campo `FILE` já é **gated fail-closed** (AD-28, `FILE_UPLOAD_ENABLED` default falso). A postura mais segura para o MVP público é **manter o upload de Arquivo desabilitado no canal público** (nenhum arquivo aceito), o que dispensa análise de arquivo no MVP — a validar.

**Este gate é um dos "gates críticos" que a diretiva proíbe reduzir.** A implementação do canal público NÃO deve prosseguir nem ser mergeada sem esta decisão registrada.

**✅ DECISÃO REGISTRADA (dono da decisão, 2026-07-14) — baseline:**
- **Rate limit por IP+Formulário**, reusando a infraestrutura de rate limit já existente (DB-backed, atômica — Better Auth nativo). A chave passa a ser por `IP` + identidade do Formulário público (não `ip|path` de auth). Fail-closed.
- **Campo Arquivo permanece gated no canal público** (AD-28): **sem upload de Arquivo na submissão pública** no MVP — dispensa análise de arquivo. Um `FILE` no Formulário público publicado é tratado conforme o gate (não aceita valor de arquivo pelo canal público).
- **CAPTCHA deferido** para pós-MVP (não é dependência externa nova agora).
- Guardrails mantidos: aviso de privacidade, consentimento quando aplicável, identificação da Org, limites de envio, mensagens sem dados internos.

Nenhum mecanismo inventado além do que o projeto já possui; CAPTCHA e análise de arquivo ficam explicitamente fora do MVP por decisão registrada.

## Tasks / Subtasks (após o gate)

- [x] **Gate de Segurança/Arquitetura resolvido e registrado** (antiabuso) — baseline: rate limit IP+Formulário (infra existente), Arquivo gated no canal público (sem upload), CAPTCHA deferido.
- [ ] Modelo `SubmissaoPublica` (org-scoped): ciclo `pendente/aprovada/rejeitada/convertida`; referência a `Form`+`FormVersion`; `valores` capturados (JSONB por `Field.id`, validados contra o snapshot como na 2.7); origem/marca de canal público; idempotência da conversão (UNIQUE / ponteiro para o Card criado). (AC: 3,4,5,6,9)
- [ ] Migration `..._public_submissions`: RLS ENABLE+FORCE, 4 policies por `current_org_id()`, WITH CHECK; GRANT mínimo (a submissão pública **cria** e a triagem **atualiza estado**; sem DELETE — preservar conforme LGPD). FKs CASCADE. `SubmissaoPublica` em `MODELOS_AUDITADOS`. (AC: 5,9)
- [ ] Endpoint **público** (sem autenticação) de submissão: resolve a Org pelo Formulário público alvo; valida contra o snapshot; em criação direta cria Card (reusa `CardSubmissionService`/atômico da 2.7), em triagem cria `SubmissaoPublica` pendente; resposta **só confirmação** (sem dado interno). Antiabuso conforme o gate. (AC: 1,2,3,8,9)
- [ ] Capacidade **"Revisar submissões públicas"** (deny-by-default): estender a resolução de autorização (matriz — Admin da Org/Admin do Pipe têm; Membro só com concessão explícita). **NÃO** tocar o guard/`ability.ts` (C3 congelado) — decidir se é nova ação CASL ou concessão fina em `pipe-authz` (registrar em Spec Kit `plan`). (AC: 7)
- [ ] Triagem: aprovar (→ 1 Card atômico, origem registrada, evento; idempotente) e rejeitar (→ sem Card, preserva). Ler fila de pendentes (autorizado). (AC: 5,6)
- [ ] Opt-in público por Formulário + bloqueio ao despublicar/revogar. (AC: 1)
- [ ] Testes reais (PostgreSQL): HTTP público (confirmação sem vazamento; triagem não cria Card; criação direta cria 1), triagem-authz (capacidade deny-by-default; Membro sem concessão não revisa), idempotência de aprovação/conversão (concorrência → 1 Card), RLS (isolamento, sem DELETE, WITH CHECK), guardrails (resposta sem dado interno). Mutações: aprovar convertida duplica (deve falhar), vazamento de dado interno na resposta pública. (AC: todos)

## Dev Notes

- **Reuso da 2.7:** a conversão aprovação→Card e a criação direta reusam a criação atômica de `CardSubmissionService` (Card + `CardHistory` CREATED na mesma transação interativa com contexto no client raiz — AD-13) e a validação `submission.ts` contra o snapshot da `FormVersion`. A `origem` do Card (interna vs. pública aprovada) deve ser registrada — decidir se é coluna em `Card` (migration) ou metadado no evento `CardHistory` (registrar em `plan`; preferir o mínimo com consumidor concreto — AD-11).
- **`SubmissaoPublica` ≠ `Card`:** entidade distinta com ciclo próprio (não reusar estado de Card, que não existe até 2.11). Preservar submissões (sem DELETE) por Governança/LGPD (NFR-8): finalidade, minimização, retenção definida.
- **Isolamento:** replica o padrão de toda tabela organizacional (RLS ENABLE+FORCE, WITH CHECK, GRANT como fronteira). O endpoint público é a novidade sensível: resolve a Org **pelo recurso público**, nunca por parâmetro do cliente; define o contexto de Org no servidor antes de qualquer escrita.
- **LGPD (NFR-8):** dados pessoais de ator externo; aviso de privacidade e consentimento são guardrails de Produto; retenção da submissão preservada definida; nunca logar `valores`.
- **Não inventar mecanismo antiabuso** — ver o GATE acima.

### Project Structure Notes

- Novo subdomínio provável: `apps/api/src/pipes/public-submissions/` (ou `forms/public/`), coerente com `cards/`, `forms/`, `phases/`, `grants/`. Endpoint público montado fora do `AuthzGuard` padrão (é não autenticado) — decidir o ponto de montagem com cuidado (não pode cair no deny-by-default de sessão). Registrar em `plan`.
- Autorização da triagem: fina, no serviço (reusa/estende `pipe-authz.ts`), sem tocar C3.

### References

- [Source: epics.md#Story 2.8 §871-886]
- [Source: prds/.../prd.md#D3.2 acesso público §951-954; #D3.3 submissão §956-959; #NFR-8 §818]
- [Source: architecture/.../ARCHITECTURE-SPINE.md#AD-6 (RLS), AD-10 (org-owned), AD-11 (sem materialização especulativa), AD-13 (evento na mesma transação), AD-24 (deps externas atrás de portas), AD-27/28 (storage/gated fail-closed), AD-31 (segurança transversal)]
- [Source: implementation-artifacts/2-7-submissao-interna-e-card.md — criação atômica de Card, validação contra snapshot, idempotência]

## Dev Agent Record

### Agent Model Used
claude-opus-4-8

### Completion Notes List
- Story context criada por create-story (BMAD). Modelo de Produto determinado pelos artefatos; **mecanismo antiabuso deferido a Segurança/Arquitetura** (gate obrigatório, não inventado). Escalado ao dono da decisão antes da implementação.
- **Implementação concluída e revisada.** Gate antiabuso resolvido pelo dono: capacidade `reviewPublicSubmissions` na `PipeGrant` (deny-by-default); `PublicFormRoute` global (sem RLS, AD-10) para resolução de tenant pré-contexto pelo `publicId` opaco; `SubmissaoPublica` org-scoped com ciclo próprio; rate limit atômico por IP+`publicId`; Arquivo bloqueado no público (AD-28).
- **Revisão adversarial de 4 lentes (risco ALTO)** — Security/Architecture/Edge/Acceptance: todos APROVA COM RESSALVAS. 1 HIGH (conversão concorrente P2002/P2028 → 500, classe Edge-H1 da 2.7) + 3 MEDIUM (auditoria ausente na tx raiz do converter; logger no-op no serviço público; P2028 no dedup) **corrigidos com regressão**. Ressalvas aceitas e reconhecidas: AC8 guardrails de apresentação são de Produto/UI (sem superfície de API); estado `APPROVED` colapsado em `CONVERTED` (aprovação = conversão atômica, AD-11); DIRECT sem `idempotencyKey` do cliente não deduplica (decisão de produto, mitigado pelo rate limit). Detalhe em `gates/2-8/review.md`.
- **Gates:** typecheck/format/lint/build verdes; suíte cheia **449 testes** (2.8: http 11, authz 4, rls 6 = 21), série contra PostgreSQL real. Fase vermelha do portão de capacidade provada. Evidência em `gates/2-8/gates.md`.

### File List
- **schema/migration:** `apps/api/prisma/schema.prisma` (enums `PublicFormMode`/`CardOrigin`/`SubmissaoPublicaState`; `SubmissaoPublica`; `PublicFormRoute`; colunas em `Form`/`Card`/`PipeGrant`); `apps/api/prisma/migrations/20260714150000_public_submissions/migration.sql`.
- **kernel:** `apps/api/src/kernel/db/tenant-context.ts` (`MODELOS_AUDITADOS` += `SubmissaoPublica`, `PublicFormRoute`).
- **domínio pipes:** `apps/api/src/pipes/pipe-authz.ts` (`exigirRevisarSubmissoesPublicas`); `apps/api/src/pipes/grants/{pipe-grants.service,pipe-grants.dto,pipe-grants.controller}.ts` (capacidade `reviewPublicSubmissions`); `apps/api/src/pipes/pipes.module.ts` (registro); `apps/api/src/pipes/public-submissions/` (novo subdomínio: `converter-submissao`, `public-route.resolver`, `public-rate-limit`, `public-submissions.dto`, `public-submission.service`, `public-submission.controller`, `triage.service`, `triage.controller`, `public-config.service`, `public-config.controller`).
- **testes:** `apps/api/test/{public-submissions-http,triage-authz,public-submissions-rls}.test.ts`.
- **governança:** `specs/2-8-submissao-publica-e-triagem/`; `_bmad-output/implementation-artifacts/gates/2-8/{pre-implementation-check,gates,review}.md`.
