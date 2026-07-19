-- Story 3.10 — AccountAvatar: o SLOT de avatar de uma Conta DENTRO de uma Organização (FR-32).
--
-- Encadeia DEPOIS de `..._files_capability` (FileObject). Aditiva e REVERSÍVEL (rollback = DROP TABLE +
-- DROP TYPE). Nenhum dado existente é tocado.
--
-- ⚠️ O QUE ESTA MIGRATION DELIBERADAMENTE **NÃO** FAZ: tocar em "Account".
--
-- Um desenho anterior desta Story propunha `Account.avatarFileId` + `GRANT UPDATE("avatarFileId")`
-- column-scoped. Foi REJEITADO. "Account" é GLOBAL e **sem RLS** (AD-10), e um GRANT de coluna restringe
-- *qual coluna*, **não** *qual linha* — o runtime poderia trocar o avatar de QUALQUER conta, em QUALQUER
-- Organização, e o único freio seria uma checagem de aplicação. Ligar RLS de UPDATE em "Account" daria o
-- backstop de linha, mas exigiria conceder UPDATE ao runtime na tabela de identidade global; e uma função
-- `SECURITY DEFINER` não ajudaria, porque a identidade viria de `current_account_id()` — que lê um GUC
-- setado pelo PRÓPRIO runtime via `set_config`, e portanto falsificável pela role runtime.
--
-- A saída é não precisar de nada disso: o slot de avatar vive do lado ORG-SCOPED, protegido por RLS, onde o
-- self-only é imposto pelo BANCO. "Account" segue GLOBAL e SELECT-only para o runtime — AD-10 integral.

-- CreateEnum
CREATE TYPE "AccountAvatarState" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateTable
CREATE TABLE "AccountAvatar" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "state" "AccountAvatarState" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "AccountAvatar_pkey" PRIMARY KEY ("id")
);

-- ÍNDICE ÚNICO SIMPLES (não parcial): UMA linha por (Organização, Conta).
--
-- "Um avatar ativo por Conta em cada Organização" cai por CONSTRUÇÃO — não é uma regra de aplicação com
-- corrida, é a chave. Substituir o avatar é UPDATE do "fileId" numa linha só (atômico por definição);
-- remover é `state='REMOVED'` (a linha é PRESERVADA e reaproveitada no próximo envio, por isso a unicidade
-- NÃO é parcial: um slot REMOVED continua ocupando o par, e reenviar reativa a MESMA linha).
CREATE UNIQUE INDEX "AccountAvatar_orgId_accountId_key" ON "AccountAvatar"("orgId", "accountId");

-- CreateIndex
CREATE INDEX "AccountAvatar_orgId_fileId_idx" ON "AccountAvatar"("orgId", "fileId");

-- AddForeignKey
ALTER TABLE "AccountAvatar" ADD CONSTRAINT "AccountAvatar_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAvatar" ADD CONSTRAINT "AccountAvatar_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FK do arquivo com ON DELETE **RESTRICT** (não CASCADE): o binário nunca é apagado fisicamente de imediato
-- (LGPD/3.7 — remoção é lógica), e o runtime não tem DELETE em "FileObject" de todo modo. RESTRICT torna
-- explícito que apagar um arquivo referenciado por um slot é um erro, não uma cascata silenciosa.
ALTER TABLE "AccountAvatar" ADD CONSTRAINT "AccountAvatar_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO (AD-6) + SELF-ONLY — e aqui está a diferença frente às demais tabelas org-scoped.
--
-- As outras tabelas do domínio filtram só por `orgId = current_org_id()`: qualquer membro da Organização
-- alcança a linha, e quem restringe mais fino é o serviço. Para o avatar isso não basta — o gate do dono é
-- que ninguém altere o avatar de OUTRA conta. Por isso as policies também exigem
-- `accountId = current_account_id()`: o self-only é do BANCO, não da aplicação.
--
-- `current_org_id()`/`current_account_id()` devolvem NULL sem contexto, e comparação com NULL nunca é TRUE
-- ⇒ negado por padrão (deny-by-default). ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO (o migrator).
-- ============================================================================
ALTER TABLE "AccountAvatar" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountAvatar" FORCE ROW LEVEL SECURITY;

-- LEITURA: só o PRÓPRIO avatar, na Organização do contexto.
--
-- Por que não `orgId = current_org_id()` sozinho (o que deixaria membros verem o avatar uns dos outros):
-- exibir avatar de outro membro é ROSTER, escopo do E8 — não há consumidor concreto nesta Story, e não se
-- abre policy sem consumidor (AD-11). Quando o E8 chegar, esta policy é ampliada com o seu próprio teste.
CREATE POLICY account_avatar_select ON "AccountAvatar"
  FOR SELECT USING ("orgId" = current_org_id() AND "accountId" = current_account_id());

-- ESCRITA (novo slot): a linha DEVE ser da Organização do contexto E da PRÓPRIA conta. Sem este WITH CHECK,
-- um INSERT com `accountId` alheio seria aceito — é exatamente o gate "não cria associação para outra
-- Account", e quem o impõe é o banco.
CREATE POLICY account_avatar_insert ON "AccountAvatar"
  FOR INSERT WITH CHECK ("orgId" = current_org_id() AND "accountId" = current_account_id());

-- ATUALIZAÇÃO (substituir o arquivo; remover = state→REMOVED): só a própria linha, e ela não pode ser
-- "movida" para outra Organização nem para outra Conta (a mesma condição no USING e no WITH CHECK).
CREATE POLICY account_avatar_update ON "AccountAvatar"
  FOR UPDATE USING ("orgId" = current_org_id() AND "accountId" = current_account_id())
         WITH CHECK ("orgId" = current_org_id() AND "accountId" = current_account_id());

-- EXCLUSÃO: policy por simetria/defesa em profundidade, mas o runtime NÃO recebe GRANT de DELETE — remover
-- o avatar é `state = REMOVED`, não exclusão. Quem impede o runtime é o GRANT abaixo.
CREATE POLICY account_avatar_delete ON "AccountAvatar"
  FOR DELETE USING ("orgId" = current_org_id() AND "accountId" = current_account_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação: DML MÍNIMA. Sem DDL, sem ownership, SEM DELETE.
-- `SELECT, INSERT, UPDATE` cobrem enviar, substituir, consultar e remover (state→REMOVED).
--
-- Note o que NÃO está aqui: nenhum privilégio novo em "Account". O runtime continua SELECT-only nela.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON "AccountAvatar" TO giraffe_app;
