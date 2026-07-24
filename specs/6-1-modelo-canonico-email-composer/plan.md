# Plano de implementação — Story 6.1

## Migration (necessária — slot da fila confirmado livre)

1. `apps/api/prisma/schema.prisma`:
   - enum `EmailState { DRAFT, SUBMITTED, DISCARDED }`;
   - model `EmailMessage`: `id` uuid PK · `orgId` uuid · `cardId` uuid? · `state` (default DRAFT) ·
     `recipients Json` (default `[]`) · `subject String` (default `""`) · `body String` (default `""`) ·
     `createdByMembershipId` uuid · `submittedAt DateTime?` · `createdAt/updatedAt` ·
     `@@index([orgId, cardId])`;
   - FK **composta** `(orgId, cardId) → Card(orgId, id)` (D-61.5; requer/reusa a unique `(orgId, id)` de
     `Card` — conferir se já existe da 4.1; se não, criá-la na mesma migration, aditiva).
2. `apps/api/prisma/migrations/<ts>_email_message/migration.sql`:
   - tabela + enum + FKs; **RLS ENABLE + FORCE**; policies `select/insert/update/delete` por
     `orgId = current_org_id()` com **WITH CHECK** no INSERT **e** UPDATE;
   - **GRANT** ao runtime: `SELECT, INSERT, UPDATE` — **sem DELETE**;
   - rollback drill DOWN→UP provado no banco do worktree.
3. `apps/api/src/kernel/db/tenant-context.ts` — `EmailMessage` em `MODELOS_AUDITADOS`.

## Núcleo puro

4. `apps/api/src/emails/email-compose.core.ts`:
   - `normalizarDestinatarios(input: unknown)` → lista normalizada (trim/lowercase), validação
     sintática (regex conservadora), dedup, **1..20** (D-61.2); fail-closed → erro tipado (400);
   - `validarConteudo(subject, body)` → texto plano (rejeita controle exceto `\n`/`\t`), tetos 200/20k;
   - `planejarTransicao(estadoAtual, acao)` → `submeter`/`descartar` só de `DRAFT` (espelho de
     `card-lifecycle.transitions.ts`); idempotência: descartar DISCARDED / submeter SUBMITTED → no-op
     explícito (sem `updateMany`, sem falso denied).

## Serviço + API

5. `apps/api/src/emails/emails.service.ts` — toda query por `withTenantContext`; autorização fina
   (D-61.3): com `cardId` → `exigirOperarCard`; sem Card → papel ADMIN/MEMBER da Org (GUEST 403);
   leitura → autor ou Admin da Org, senão **404**. Edição/submissão com **guarda otimista**
   `updateMany({ where: { id, state: 'DRAFT' } })` → `count 0` → reconsulta → no-op idempotente ou
   **409** (imutabilidade pós-SUBMITTED; defesa em profundidade além do núcleo puro). Auditoria manual
   FR-214 nos caminhos de tx raiz, se houver (a 6.1 não precisa de tx interativa: mutações de 1 escrita,
   sem evento de domínio — D-61.6).
6. `apps/api/src/emails/emails.controller.ts` + `emails.dto.ts` — rotas:
   - `POST /emails` (201, cria DRAFT; body: `cardId?`, `recipients?`, `subject?`, `body?`);
   - `GET /emails/:id` (detalhe; 404 não-enumerante);
   - `PATCH /emails/:id` (edita DRAFT; 409 fora de DRAFT);
   - `POST /emails/:id/discard` · `POST /emails/:id/submit` (200; idempotentes; submit exige
     destinatários válidos + conteúdo válido — revalida no servidor).
   Guard grosso: `@Requer('ler', <subject existente adequado>)` — **sem** subject CASL novo se possível;
   se necessário, abrir `ler`/`operar` mínimo em CASL **sem tocar o guard** (padrão 3.2). DTO allowlist
   anti-mass-assignment (`orgId`/`state`/`submittedAt` nunca do cliente).
7. `apps/api/src/emails/emails.module.ts` — módulo próprio; `AppModule` importa. Sem dependência de
   `PipesModule` além do helper de authz (importar `exigirOperarCard` de `pipe-authz` — mesmo padrão dos
   demais consumidores).

## Testes (`apps/api/test/`)

8. `email-compose.core.test.ts` — núcleo puro: normalização/dedup/limite (0, 1, 20, 21, duplicado com
   caixa diferente), sintaxe inválida, conteúdo com `<script>`/HTML/controle/NUL, tetos, transições.
9. `emails-http.test.ts` — integração HTTP real (porta efêmera, PG): fluxo compor→editar→submeter→409 na
   edição; descartar idempotente; GUEST 403 sem Card; VIEWER do Pipe não opera Card → 403/404 conforme
   acesso; autor lê, terceiro não (404); Card de outra Org no `cardId` → 404/400 (RLS + FK composta).
10. `emails-rls.test.ts` — RLS/GRANT com **fase vermelha**: cross-tenant invisível; INSERT com `orgId`
    alheio barrado pelo WITH CHECK (via `createMany`, sem RETURNING); DELETE → `permission denied`;
    UPDATE movendo `orgId` barrado; FK composta rejeita `cardId` de outra Org (prova D-61.5).
    Org C + contas `randomUUID` (TEST-ISO-01); faxina escopada aos ids criados.

## Gates

- `pre-implementation-check` (este plan + spec = insumo) · `context7-check` (Prisma 6.19.3 — FK composta
  opcional/`onDelete`; NestJS 11 — nada novo de API além do padrão) · `security-check` ·
  `observability-check` (logs sem PII de e-mail) · `lgpd-check` (dado do titular: destinatários/corpo —
  sem DELETE físico; minimização em logs) · `migration-check` (drill) · suíte cheia serial antes do PR.

## Ordem de execução

migration → typecheck/generate → núcleo puro + testes puros → serviço/controller + testes HTTP/RLS →
gates → commit-check → PR → CI → QA cruzado → merge → closure.
