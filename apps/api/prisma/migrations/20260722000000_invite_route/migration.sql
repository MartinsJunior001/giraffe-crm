-- Story 8.3 — InviteRoute: resolvedor GLOBAL de tenant do aceite de Convite (gêmeo de PublicFormRoute).
--
-- Aditiva e REVERSÍVEL (ver `prisma/rollback/20260722000000_invite_route.down.sql`, mesmo PR). NÃO
-- altera a Story 8.2: a tabela é mantida por TRIGGER em `Invite`, não por código de aplicação.
--
-- POR QUE GLOBAL E SEM RLS: o aceite chega sem contexto de Organização (o convidado ainda não é
-- membro) e `Invite` é RLS FORCE — achar o Convite pelo hash do token exige saber o `orgId` antes.
-- Esta tabela mapeia `tokenHash` -> `orgId` para a resolução pré-contexto (como `Account`/
-- `PublicFormRoute`, AD-10). É só uma DICA: o serviço entra em `withTenantContext(orgId)` e RELÊ o
-- `Invite` sob RLS, que é a AUTORIDADE (rota apontando para org errada não concede nada — o relê não
-- acha o Convite -> 404). `tokenHash` é irreversível (SHA-256) e `orgId` não é segredo: expor é inócuo.

-- CreateTable (GLOBAL — sem coluna de tenant governada por RLS)
CREATE TABLE "InviteRoute" (
    "tokenHash" TEXT NOT NULL,
    "orgId" UUID NOT NULL,
    CONSTRAINT "InviteRoute_pkey" PRIMARY KEY ("tokenHash")
);

-- Limpeza/inspeção por Organização (defesa; fora do caminho quente, que é por PK).
CREATE INDEX "InviteRoute_orgId_idx" ON "InviteRoute"("orgId");

-- SEM `ENABLE ROW LEVEL SECURITY`: por definição a resolução de tenant não pode depender do
-- `current_org_id()` que ainda não existe. A tabela não pertence a nenhum tenant.

-- Função que MANTÉM a rota a partir de `Invite`. Sem SECURITY DEFINER: roda como INVOKER
-- (`giraffe_app`), que recebe GRANT INSERT/DELETE abaixo — portanto NÃO é caminho de bypass de RLS
-- (AD-6). Só toca a tabela global `InviteRoute`.
CREATE OR REPLACE FUNCTION giraffe_sync_invite_route() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO "InviteRoute" ("tokenHash", "orgId")
      VALUES (NEW."tokenHash", NEW."orgId")
      ON CONFLICT ("tokenHash") DO NOTHING;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Reenvio (2.8/8.2) ROTACIONA o token: some o hash antigo, entra o novo.
    IF (NEW."tokenHash" IS DISTINCT FROM OLD."tokenHash") THEN
      DELETE FROM "InviteRoute" WHERE "tokenHash" = OLD."tokenHash";
      INSERT INTO "InviteRoute" ("tokenHash", "orgId")
        VALUES (NEW."tokenHash", NEW."orgId")
        ON CONFLICT ("tokenHash") DO NOTHING;
    END IF;
  END IF;
  RETURN NULL; -- AFTER trigger: o valor de retorno é ignorado.
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invite_route_sync_ins"
  AFTER INSERT ON "Invite"
  FOR EACH ROW EXECUTE FUNCTION giraffe_sync_invite_route();

CREATE TRIGGER "invite_route_sync_upd"
  AFTER UPDATE OF "tokenHash" ON "Invite"
  FOR EACH ROW EXECUTE FUNCTION giraffe_sync_invite_route();

-- Backfill idempotente dos Convites JÁ existentes (a 8.2 já está no main). Incluir todos os hashes
-- correntes é inócuo — quem decide a validade é o estado relido sob RLS no aceite.
INSERT INTO "InviteRoute" ("tokenHash", "orgId")
SELECT "tokenHash", "orgId" FROM "Invite"
ON CONFLICT ("tokenHash") DO NOTHING;

-- GRANT: o runtime LÊ (caminho quente do aceite) e o TRIGGER (invoker `giraffe_app`) ESCREVE.
-- Sem UPDATE direto: a manutenção é só via trigger (INSERT/DELETE). EXECUTE explícito caso o bootstrap
-- revogue o default de PUBLIC.
GRANT SELECT, INSERT, DELETE ON "InviteRoute" TO giraffe_app;
GRANT EXECUTE ON FUNCTION giraffe_sync_invite_route() TO giraffe_app;
