-- Story 1.4 — autenticação (Better Auth) e antiabuso (G1/G2).
--
-- Roda com o papel `giraffe_migrator` (dono do schema). O runtime (`giraffe_app`) NUNCA tem
-- esta credencial em mãos.
--
-- Nenhuma tabela desta migration é organizacional: sessão, credencial e contadores pertencem à
-- PESSOA ou ao IP, não a uma Organização (AD-10). Por isso não levam `orgId` e não levam RLS.
-- Mas "sem RLS" não é "sem fronteira": onde a policy não alcança, quem nega é o GRANT — e essa
-- lição foi paga caro na Story 1.2, com um vazamento cross-tenant reproduzido em psql.

-- ── `Account` passa a ser o `user` do Better Auth (plan.md, D1) ────────────────────────────
-- Uma identidade, uma tabela. A alternativa seria duas tabelas de pessoas — `user` (dona da
-- sessão) e `Account` (dona da Membership) — sincronizadas para sempre.
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "image" TEXT;

-- ── Sessão ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE "AuthSession" (
  "id"                   TEXT PRIMARY KEY,
  "token"                TEXT NOT NULL,
  "expiresAt"            TIMESTAMP(3) NOT NULL,
  "ipAddress"            TEXT,
  "userAgent"            TEXT,
  -- PEDIDO persistido, jamais autoridade: quem decide se ele vale é o OrgContextResolver (1.3),
  -- conferindo contra a Membership ATIVA. Se a sessão fosse autoridade, suspender uma Membership
  -- não tiraria o acesso de ninguém — e o botão de suspender voltaria a não fazer nada.
  "activeOrganizationId" UUID,
  "userId"               UUID NOT NULL,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AuthSession_token_key" ON "AuthSession"("token");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- ── Credencial (o `account` do Better Auth, renomeado para dizer a verdade) ────────────────
-- Guarda HASH DE SENHA. Não guarda "contas".
CREATE TABLE "AuthCredential" (
  "id"                    TEXT PRIMARY KEY,
  "accountId"             TEXT NOT NULL,
  "providerId"            TEXT NOT NULL,
  "userId"                UUID NOT NULL,
  "password"              TEXT,
  "accessToken"           TEXT,
  "refreshToken"          TEXT,
  "idToken"               TEXT,
  "accessTokenExpiresAt"  TIMESTAMP(3),
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "scope"                 TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthCredential_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AuthCredential_userId_idx" ON "AuthCredential"("userId");

-- ── Verificação ───────────────────────────────────────────────────────────────────────────
CREATE TABLE "AuthVerification" (
  "id"         TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value"      TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AuthVerification_identifier_idx" ON "AuthVerification"("identifier");

-- ── G2: rate limit nativo do Better Auth (chave = `${ip}|${path}`) ─────────────────────────
-- No BANCO, não em memória: memória não sobrevive a restart e não é compartilhada entre
-- réplicas — com 3 instâncias, o limite efetivo triplica.
CREATE TABLE "RateLimit" (
  "id"          TEXT PRIMARY KEY,
  "key"         TEXT NOT NULL,
  "count"       INTEGER NOT NULL,
  "lastRequest" BIGINT NOT NULL
);
CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");

-- ── G1: contador de FALHAS por identificador (nosso) ───────────────────────────────────────
-- A chave é HMAC do e-mail normalizado, com prefixo de finalidade. NUNCA o e-mail em claro:
-- ele é PII, e em claro aqui viraria um segundo cadastro de e-mails fora do `Account` — um
-- dump desta tabela seria uma lista de usuários.
--
-- `key` é PRIMARY KEY porque o incremento é um `INSERT ... ON CONFLICT (key) DO UPDATE`, em
-- instrução única. Um `SELECT` seguido de `UPDATE` perderia contagens exatamente sob
-- concorrência — que é o regime em que um ataque de força bruta acontece.
CREATE TABLE "LoginFailure" (
  "key"         TEXT PRIMARY KEY,
  "keyVersion"  INTEGER NOT NULL,
  "count"       INTEGER NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL
);
-- Varredura de contadores expirados (limpeza), sem escanear a tabela inteira.
CREATE INDEX "LoginFailure_windowStart_idx" ON "LoginFailure"("windowStart");

-- ── GRANTs: a fronteira que a RLS não cobre ───────────────────────────────────────────────
-- Cada privilégio abaixo é o MÍNIMO que o caminho de produção exige, e nada além.

-- `Account`: **NENHUM privilégio novo.** Continua com `SELECT` apenas, como na Story 1.2.
--
-- A primeira versão desta migration concedia `UPDATE` "porque o Better Auth talvez precise
-- escrever emailVerified/image". O teste da Story 1.2 — "o runtime NÃO pode criar nem alterar
-- uma Account" — ficou vermelho e estava CERTO: nenhum caminho desta Story escreve em `Account`.
-- Login lê a credencial e cria sessão. Cadastro é da 1.9; verificação de e-mail, da 1.10.
--
-- Conceder privilégio por antecipação é exatamente o hábito que a 1.2 puniu. Quando houver
-- cadastro, o `UPDATE`/`INSERT` chega junto com o teste que prova o escopo dele.
--
-- E `DELETE` permanece proibido por uma razão material, reproduzida em psql na 1.2: a cascata da
-- FK de `Membership` apagaria vínculos de TODAS as Organizações, porque ações referenciais rodam
-- com bypass de row security. A RLS não protege contra isso; o GRANT protege.

-- Sessão: o runtime cria (login), lê (toda requisição) e apaga (logout — Story 1.5).
GRANT SELECT, INSERT, UPDATE, DELETE ON "AuthSession" TO giraffe_app;

-- Credencial: ler para verificar a senha; escrever para criar/trocar. `DELETE` NÃO é
-- concedido: nenhum caminho desta Story apaga credencial, e privilégio sem uso é privilégio
-- que só serve para o dia em que alguém errar.
GRANT SELECT, INSERT, UPDATE ON "AuthCredential" TO giraffe_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON "AuthVerification" TO giraffe_app;

-- Contadores: o antiabuso precisa criar, incrementar e limpar.
GRANT SELECT, INSERT, UPDATE, DELETE ON "RateLimit" TO giraffe_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "LoginFailure" TO giraffe_app;
