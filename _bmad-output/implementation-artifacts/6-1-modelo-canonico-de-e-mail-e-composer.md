# Story 6.1: Modelo canônico de e-mail e Composer

Status: ready-for-dev

## Story

Como usuário com capacidade de compor e-mail,
quero redigir um e-mail associável a um Card,
para comunicar-me com o cliente a partir do processo, sem inbox.

## Acceptance Criteria

1. **Given** um usuário com capacidade de compor **When** redige um e-mail **Then** cria um e-mail canônico da Organização (identidade estável), associável a 0..1 Card **da mesma Organização**, sem inbox e sem conceder/revelar acesso indevido (a associação não concede acesso ao Card; acesso ao Card não concede acesso automático ao e-mail; visualizar exige acesso efetivo + capacidade de histórico de e-mail).
2. **Given** destinatários **When** informados **Then** são normalizados/validados/deduplicados **no servidor**, respeitam o limite máximo (definido pré-implementação — ver Dev Notes) e não permitem disparo em massa/campanha.
3. **Given** assunto/corpo **When** compostos **Then** são sanitizados (sem HTML/script/conteúdo ativo arbitrário) e tornam-se **imutáveis após o envio** (na 6.1: imutáveis ao entrar no fluxo de envio — o envio real é 6.4, gated AD-28).
4. **And** cada capacidade (compor / enviar / consultar histórico / acessar o Card opcional) é **deny-by-default** e revalidada no servidor (escopo user+Org, NFR-3).
5. Rascunho técnico (se persistido): privado aos autorizados; **não** aparece no histórico de enviados; **não** dispara Evento; não é interpretável como enviado; descartar não exclui enviados; deixa de ser editável ao entrar no fluxo de envio. **Sem** módulo de caixa de rascunhos.

## Tasks / Subtasks

- [ ] Spec Kit completo (specify → clarify (só ambiguidade material) → plan → checklist → tasks → analyze) antes de código (AC: todos)
- [ ] Migration: entidade canônica de e-mail org-scoped, RLS ENABLE+FORCE + WITH CHECK (INSERT e UPDATE), GRANT mínimo **sem DELETE**, FK composta tenant-safe `(orgId, cardId)` para o Card opcional (AC: 1)
- [ ] Núcleo puro de validação: destinatários (normalização/validação/dedup/limite) e sanitização de assunto/corpo, fail-closed (AC: 2, 3)
- [ ] Serviço + controller do Composer (iniciar/editar/descartar/solicitar envio como transição de estado local — sem envio real) com autorização fina deny-by-default no serviço (AC: 1, 4, 5)
- [ ] Imutabilidade pós-fluxo-de-envio garantida pelo banco (GRANT column-scoped/estado) e por guarda otimista (AC: 3)
- [ ] Testes: integração PG real (RLS cross-tenant, GRANT com fase vermelha, capacidades 403/404 não-enumerantes), núcleo puro (validação/sanitização com vetores maliciosos), regressão E2 intocada (AC: todos)
- [ ] Gates: pre-implementation-check, context7-check (Prisma/Nest nas versões do lockfile), security-check, observability-check, lgpd-check, migration-check (drill DOWN→UP)

## Dev Notes

### Recorte e gates
- **Envio real NÃO é desta Story** (6.4, gate AD-28/AD-25/OQ-28 — provedor/identidade; fail-closed). A 6.1 entrega o **modelo canônico + Composer** (compor/associar); "solicitar envio" apenas congela o conteúdo e o coloca num estado terminal local (ex.: `SUBMITTED`/fila lógica) **sem** porta de provedor. Nenhuma env/flag de provedor entra aqui.
- **Sem inbox / recebimento / campanhas / CC-BCC**: PRD FR-24 (D6.5) confirma outbound-only na Fase 1; CC/BCC não têm âncora no PRD/UX → **não introduzir** (só destinatários principais).
- **Limite de destinatários**: o epics exige defini-lo **pré-implementação**. Decisão interna (registrar AUTONOMOUS_DECISION no plan): teto baixo e conservador (ex.: 20), suficiente para apoio operacional a um Card e hostil a disparo em massa; validado no núcleo puro + DTO.
- **Templates** (6.2/6.3) e **anexos** (6.5) ficam fora; o Composer só precisa não fechar as portas para eles (campos/fluxo extensíveis sem migration destrutiva).

### Modelo (twin dos padrões da casa)
- Entidade org-scoped nova (ex.: `EmailMessage`) — **1 Org exata; 0..1 Card da MESMA Org**: usar **FK composta `(orgId, cardId)`** (lição da 4.1 — RLS+FK simples deixam passar id alheio, pois ações referenciais bypassam row security).
- **Vários e-mails por Card**; associação **não transfere acesso** em nenhum sentido (análogo ao vínculo Card↔Registro 3.9: o vínculo NUNCA concede acesso).
- Identidade estável (`id` UUID); destinatários em JSONB **validados no núcleo puro** (allowlist de chaves, anti-mass-assignment — padrão `submission.ts`); `orgId` fora da fronteira da API (nunca do cliente).
- Estados mínimos da 6.1: `DRAFT` → (`DISCARDED` | `SUBMITTED`); `SUBMITTED` é imutável (o pipeline real de envio/estados honestos é 6.4). Descartar é mudança de estado — **sem DELETE** (GRANT sem DELETE; LGPD).
- **MODELOS_AUDITADOS**: incluir a entidade nova em `tenant-context.ts` (auditoria de tentativa negada), como toda tabela organizacional.

### Autorização
- Guard C3 **congelado** (`ability.ts`/guard intocados). Capacidades finas **no serviço**, padrão DBT-AUTHZ-01 (`pipe-authz.ts`/`database-authz.ts` como referência). Acesso ao Card opcional revalida por `resolverAcessoNoCard`/`exigirLerCard` (2.10) — associar exige acesso ao Card; ler o e-mail exige capacidade própria de histórico (não deriva do Card).
- Sem acesso → **404 não-enumerante**; ler-sem-poder-operar → 403.

### Sanitização
- Assunto/corpo texto plano (ou formato seguro) com **sanitização server-side fail-closed**; nenhum HTML/script arbitrário persiste. Padrão de referência: sanitização das Notificações 5.3 (`DEB-5-3-SANITIZE-TETO-ORDEM` documenta a ordem escape→teto — não repetir o cosmético).
- Logs Pino sem corpo/assunto/destinatários (PII — NFR; corpo de e-mail é dado do titular).

### Testes (risco ALTO)
- Integração PG real: RLS cross-tenant (com **fase vermelha** — quebrar a policy e ver o teste falhar), GRANT sem DELETE/imutabilidade pós-SUBMITTED (`permission denied` provado), FK composta rejeitando `cardId` alheio, 404 não-enumerante, dedup/limite de destinatários, sanitização com vetores (script/HTML/esquemas `javascript:`).
- Org C com contas descartáveis (`randomUUID`) — nunca Ana/Bruno/Carla/Eva (TEST-ISO-01); faxina **escopada aos ids criados** (lição do review 5.7).
- Banco de teste dedicado do worktree `wt-6-1` (porta própria — não reusar 5434/5438/5439 de outras lanes).

### Débitos herdados a respeitar (não expandir silenciosamente)
- `DEB-4-9-TEMPLATE-VERSION-RATIFY` — pertence à 6.6/6.2 (referência Ação↔Template); a 6.1 não o toca.
- `DEB-5-7-OVERDUE-CHAIN` e demais defers da 5.7 — fora do escopo desta Story.
- `DEB-TENANT-COMPOSITE-FK-RETROFIT` — a 6.1 **nasce** com FK composta (não gera retrofit novo).

### Project Structure Notes
- Novo domínio em `apps/api/src/emails/` (twin estrutural: módulo próprio, serviço com `withTenantContext` em toda query, núcleo puro em arquivo `*.core.ts`, controller com `@Requer` grosso + guarda fina no serviço). Não reusar entidades de Card/Registro.
- Migrations em `apps/api/prisma/migrations/` (fila de migrations é da Lane 0 — slot livre confirmado); testes em `apps/api/test/`.

### References
- [Source: _bmad-output/planning-artifacts/epics.md — Épico 6, Story 6.1 (escopo/ACs/gates/fora-do-escopo)]
- [Source: _bmad-output/planning-artifacts/prds/prd-giraffe-crm-2026-07-11/prd.md §4.9 FR-24, RN-110/RN-114, D6.5/D3.6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-giraffe-crm-2026-07-11/ARCHITECTURE-SPINE.md — AD-24, AD-25, AD-28 (gate), AD-11]
- [Source: CLAUDE.md — isolamento multi-tenant, GRANT como fronteira, MODELOS_AUDITADOS, testes]

## Dev Agent Record

- 2026-07-24 — Story criada (bmad-create-story) a partir de `origin/main = ca31cd5`; Épico 6 aberto (`epic-6: in-progress`). Writer único: sessão atual, worktree `E:/curso.js/wt-6-1`, branch `story/6-1-modelo-canonico-email-composer`. Risco ALTO (migration + RLS + authz + sanitização). Gates externos: Resend/8.2 e M2 **não bloqueiam** esta Story (envio real = 6.4).
