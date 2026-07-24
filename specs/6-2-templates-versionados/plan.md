# Plano — Story 6.2

## Migration `20260805120000_email_templates`

1. `schema.prisma`: enum `EmailTemplateState { ACTIVE, ARCHIVED }`; `EmailTemplate` (id, orgId, name,
   state, activeVersion Int default 0, createdByMembershipId, timestamps; `@@unique([orgId, id])`;
   `@@index([orgId, state])`); `EmailTemplateVersion` (id, orgId, templateId, version, subject, body,
   variables Json, authorMembershipId, createdAt; `@@unique([orgId, templateId, version])`; FK composta
   `(orgId, templateId)`). Back-refs em Organization.
2. `migration.sql`: tabelas + enum + FKs; RLS ENABLE+FORCE + 4 policies com WITH CHECK (INSERT/UPDATE)
   em ambas; GRANT: `EmailTemplate` SELECT/INSERT + UPDATE("name","state","activeVersion","updatedAt");
   `EmailTemplateVersion` **só SELECT/INSERT**. Rollback `.down.sql` (DROP 2 tabelas + enum).
3. `tenant-context.ts`: +`EmailTemplate`, +`EmailTemplateVersion`.

## Núcleo puro `emails/templates/template-definition.core.ts`

- `CATALOGO_VARIAVEIS` (D-62.1): `org.name` / `card.title` / `user.name` — `{ nome, tipo: 'TEXT',
  origem }`.
- `validarDefinicao(input: unknown)` → lista `{ nome, obrigatoria }` (allowlist de chaves; nome do
  catálogo; sem duplicata; ≤ 20) — fail-closed `DefinicaoInvalidaError`.
- `validarConteudoTemplate(name, subject, body, definicao)`: tetos D-62.3 + controle (reusa contrato da
  6.1) + **toda `{{ref}}` extraída de subject/body precisa estar declarada** (regex `\{\{\s*([\w.]+)\s*\}\}`,
  fail-closed em malformada tipo `{{` sem fechamento? — sintaxe estrita: só o padrão casa; chave aberta
  vira texto literal e NÃO é referência — documentar).
- `podeEditarTemplate(state)` (ACTIVE) e transições arquivar/restaurar idempotentes (espelho 6.1).

## Serviço/API `emails/templates/`

- `email-templates.service.ts`: `criar` (tx interativa raiz `definirContextoOrg`: INSERT template +
  INSERT v1 + ponteiro=1; P2002/P2028 → 409); `novaVersao` (releitura sob RLS → ARCHIVED 409 → tx:
  INSERT versão `activeVersion+1` + `updateMany` ponteiro com guarda otimista `where activeVersion =
  <lido>` → 409); `arquivar`/`restaurar` (idempotente, no-op sem updateMany); `listar`/`obter`
  (consulta ADMIN/MEMBER; detalhe inclui a versão ativa; versões anteriores por `GET .../versions`).
  Autz fina: `exigirAdminOrg` (papel ADMIN → 403) / `exigirConsultar` (GUEST 403). Auditoria manual
  FR-214 nas tx raiz.
- `email-templates.controller.ts` + dto (parse manual, allowlist): `POST /email-templates` 201 ·
  `GET /email-templates` · `GET /email-templates/:id` · `GET /email-templates/:id/versions` ·
  `POST /email-templates/:id/versions` 201 · `POST /email-templates/:id/archive|restore` 200. Guard
  grosso `@Requer('ler','Organizacao')`.
- Registrar controller/serviço no `EmailsModule` (mesmo domínio E-mail).

## Testes

- `template-definition.core.test.ts`: catálogo/definição (desconhecida, duplicata, >20, chaves extras),
  extração de `{{ref}}` (declarada ok; não declarada 400; malformada = literal), tetos/controle,
  transições.
- `email-templates-http.test.ts`: ciclo Admin (criar v1 → editar v2 → arquivar → editar 409 → restaurar
  → editar v3), MEMBER consulta/não administra, GUEST 403, 404 não-enumerante, concorrência de edição
  (2 `novaVersao` no MESMO estado lido → um 201, outro 409 — determinístico via pré-leitura), sem rota
  DELETE (404/405).
- `email-templates-rls.test.ts`: cross-tenant invisível; WITH CHECK INSERT via `createMany`;
  `EmailTemplateVersion` UPDATE/DELETE → permission denied (imutável — prova do AC-2); `EmailTemplate`
  DELETE negado + column-scope (autoria/orgId); FK composta rejeita `templateId` alheio.

## Gates e ordem

context7-check: primitivos já provados na base (tx interativa 2.6, UNIQUE parcial não é preciso; Prisma
6.19.3/Nest 11 sem API nova) — fonte: lockfile + padrões internos. Ordem: migration → generate → drill
DOWN→UP → núcleo+testes → serviço/HTTP/RLS → typecheck/lint/format → suíte cheia serial → commit-check →
PR → CI → 3 revisões no SHA final → fixes → merge → closure.
