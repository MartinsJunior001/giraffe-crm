# Story 6.2: Administração e versionamento de Templates de E-mail

Status: ready-for-dev

## Story

Como Admin da Organização,
quero administrar Templates versionados com variáveis tipadas,
para reaproveitar comunicações com consistência e integridade.

## Acceptance Criteria

1. **Given** o Admin da Org **When** cria/edita/arquiva/restaura um Template **Then** o ciclo é criar/editar/arquivar/restaurar (sem exclusão definitiva); cada edição gera **nova versão imutável** (`templateVersionId`) com `templateId` estável.
2. **Given** uma edição futura **When** aplicada **Then** e-mails enviados e Execuções iniciadas não mudam (imutabilidade da versão — padrão `FormVersion`).
3. **Given** uma variável obrigatória ausente **When** aplicar/enviar **Then** bloqueia; nenhuma variável não resolvida segue silenciosamente; pré-visualização indica ausentes. *(Na 6.2 entrega-se a DEFINIÇÃO tipada + validação; a aplicação/preview real é 6.3 — o contrato nasce aqui.)*
4. **And** variáveis usam só fontes permitidas/tenant-safe (catálogo canônico de plataforma), tipadas, escapadas conforme o local de uso, validadas no servidor; sem scripts/expressões/consultas arbitrárias.

## Dev Notes

- **Twin do Form Builder no rigor de versionamento:** `EmailTemplate` (identidade estável, mutável: nome/estado/ponteiro) + `EmailTemplateVersion` (imutável: assunto/corpo/definição de variáveis/autor/data — GRANT só `SELECT/INSERT`, como `FormVersion`). Editar = publicar nova versão numerada `@@unique([orgId, templateId, version])`; arquivar/restaurar = `state` (sem DELETE).
- **Autorização:** administrar = **Admin da Org** (CASL `administrar`? — verificar se abre subject novo ou reusa `Organizacao`; C3 congelado, fina no serviço); consultar = qualquer Membership ativa autorizada (GUEST? deny-by-default — decidir no spec, padrão: ADMIN/MEMBER consultam; Admin do Pipe NÃO administra).
- **Catálogo de variáveis:** enum/const de plataforma (não user-defined nesta fase) com tipo/origem (ex.: `card.title`, `org.name`) + flag obrigatória; validação fail-closed da definição no núcleo puro (allowlist de chaves; corpo referencia só variáveis declaradas — `{{var}}` sintaxe a definir no spec). Sem execução/interpolação nesta Story além de validar — resolver é 6.3.
- **Gate OQ-26 (semântica Ação↔versão):** a referência da Automação será por `templateVersionId` explícito (já decidido no epics 6.6/4.9 — `DEB-4-9-TEMPLATE-VERSION-RATIFY` ratifica na 6.6); a 6.2 só precisa garantir versão imutável endereçável.
- **Padrões da casa:** RLS ENABLE+FORCE + WITH CHECK; `withTenantContext`; MODELOS_AUDITADOS (+2); FK composta se referenciar entidade org-scoped; migration na fila (slot livre); testes com fases vermelhas; Org C/randomUUID; lane `wt-6-1` (banco 5440; `.env` pronto — `INTERNAL_HMAC_SECRET` VAZIO).
- **Fora do escopo:** aplicação no Composer (6.3), Ação de Automação (6.6), envio (6.4), variáveis custom do usuário.

### References
- [epics.md §Story 6.2 · PRD FR-25/RN-111/D6.5 · Spine AD-25/AD-11 · padrão FormVersion (2.6)]

## Dev Agent Record
- 2026-07-24 — Story criada após CLOSURE_DONE da 6.1 (`main 1c7d51b`). Writer único: sessão atual, branch `story/6-2-templates-versionados` no `wt-6-1`. Risco ALTO (migration + imutabilidade + catálogo de variáveis). Sem gate externo (dep 1.6 ✓; Resend só na 6.4).
