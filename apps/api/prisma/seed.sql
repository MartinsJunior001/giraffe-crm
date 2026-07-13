-- Seed de DESENVOLVIMENTO — fixture dos testes de isolamento (Story 1.2).
-- Duas Organizações distintas. Nenhum dado real de produção (LGPD).
--
-- Note que até este seed, rodando como DONO das tabelas, precisa definir o contexto
-- antes de inserir: `FORCE ROW LEVEL SECURITY` sujeita o proprietário às policies.
-- Se o `WITH CHECK` estivesse errado, este arquivo falharia — ele é a primeira prova
-- de que as policies estão de pé.

BEGIN;

-- Contas: identidade GLOBAL, sem RLS, sem contexto (AD-10).
--
-- Os arquivos de teste rodam em PARALELO contra o MESMO banco. Isso divide as contas em dois
-- papéis, e misturá-los produz flake — não flake qualquer: flake em teste de isolamento, que é o
-- que ensina a equipe a re-rodar até ficar verde.
--
--   LEITURA (nenhum teste as modifica): Ana, Bruno, Carla, Eva. As asserções sobre elas — "Carla
--   tem exatamente uma Organização ativa", "Dani não tem nenhuma" — só valem se ninguém criar
--   vínculo para elas no meio do caminho.
--
--   ESCRITA (uma conta por arquivo que escreve, para não colidir na única (accountId, orgId)):
--     · Fabio  → rls.test.ts
--     · Gil    → rls-observability.test.ts
--     · Heitor → org-context.test.ts (cria/apaga um vínculo REMOVED na Org C — SC-414)
--     · Iris   → sessao.test.ts (Story 1.5 — sessão real: loga, envelhece/loga-out a própria sessão
--                e cria/altera o próprio vínculo na Org C: ACTIVE→SUSPENDED→REMOVED). Precisa de
--                CREDENCIAL (ver seed-credentials.mjs), diferente de Fabio/Gil/Heitor, que só o
--                resolvedor usa e nunca fazem login.
--
--   Dani é o caso "conta SEM Membership nenhuma" e por isso NÃO pode ser usada para criar
--   vínculos: bastaria um arquivo paralelo criar um para ela e o teste de "conta sem vínculo"
--   passaria a resolver contexto.
-- Eva pertence ATIVAMENTE a DUAS Organizações — o caso que obriga o contexto a ser escolhido
-- explicitamente (Story 1.3). Bruno não serve para isso: o vínculo dele na Org B está
-- SUSPENDED, e vínculo suspenso não concede contexto — é justamente o que ele passa a provar.
INSERT INTO "Account" ("id", "email", "name", "createdAt", "updatedAt") VALUES
  ('11111111-1111-1111-1111-111111111111', 'ana@exemplo.test',   'Ana',   now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'bruno@exemplo.test', 'Bruno', now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'carla@exemplo.test', 'Carla', now(), now()),
  ('44444444-4444-4444-4444-444444444444', 'dani@exemplo.test',  'Dani',  now(), now()),
  ('55555555-5555-5555-5555-555555555555', 'eva@exemplo.test',   'Eva',   now(), now()),
  ('66666666-6666-6666-6666-666666666666', 'fabio@exemplo.test',  'Fabio',  now(), now()),
  ('77777777-7777-7777-7777-777777777777', 'gil@exemplo.test',    'Gil',    now(), now()),
  ('88888888-8888-8888-8888-888888888888', 'heitor@exemplo.test', 'Heitor', now(), now()),
  ('99999999-9999-9999-9999-999999999999', 'iris@exemplo.test',   'Iris',   now(), now())
ON CONFLICT ("id") DO NOTHING;

-- ── Organização A ──
SELECT set_config('app.current_org_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

INSERT INTO "Organization" ("id", "name", "slug", "createdAt", "updatedAt") VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Organização A', 'org-a', now(), now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Membership" ("id", "accountId", "orgId", "role", "state", "createdAt", "updatedAt") VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ADMIN',  'ACTIVE', now(), now()),
  ('a1a1a1a1-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'MEMBER', 'ACTIVE', now(), now()),
  ('a1a1a1a1-0000-0000-0000-000000000003', '55555555-5555-5555-5555-555555555555',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'MEMBER', 'ACTIVE', now(), now())
ON CONFLICT ("id") DO NOTHING;

-- ── Organização B ──
SELECT set_config('app.current_org_id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

INSERT INTO "Organization" ("id", "name", "slug", "createdAt", "updatedAt") VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Organização B', 'org-b', now(), now())
ON CONFLICT ("id") DO NOTHING;

-- Carla pertence só à Org B. Bruno pertence às DUAS (é o caso que prova que a
-- descoberta das próprias Memberships não pode vazar as dos outros).
INSERT INTO "Membership" ("id", "accountId", "orgId", "role", "state", "createdAt", "updatedAt") VALUES
  ('b1b1b1b1-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ADMIN', 'ACTIVE',    now(), now()),
  ('b1b1b1b1-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'GUEST', 'SUSPENDED', now(), now()),
  ('b1b1b1b1-0000-0000-0000-000000000003', '55555555-5555-5555-5555-555555555555',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'MEMBER', 'ACTIVE', now(), now())
ON CONFLICT ("id") DO NOTHING;

-- ── Organização C — VAZIA, e é para continuar vazia ──
-- Existe só para os testes que precisam CRIAR e APAGAR vínculos. Os arquivos de teste rodam
-- em PARALELO: enquanto um deles criasse uma Membership na Org A, o outro — que afirma
-- "a Org A tem exatamente 2 vínculos" — falharia por contagem, sem nada a ver com RLS.
-- Um teste de isolamento que quebra de forma intermitente por motivo alheio ao isolamento
-- ensina a equipe a re-rodar até ficar verde, que é o pior hábito possível aqui.
-- Org A e Org B são fixture de LEITURA; Org C é a área de escrita.
SELECT set_config('app.current_org_id', 'cccccccc-cccc-cccc-cccc-cccccccccccc', true);

INSERT INTO "Organization" ("id", "name", "slug", "createdAt", "updatedAt") VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Organização C', 'org-c', now(), now())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
