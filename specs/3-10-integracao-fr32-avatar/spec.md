# Story 3.10 — Integração FR-32: avatar do próprio usuário (envio, substituição, remoção)

## Objetivo
Permitir ao usuário autenticado enviar, substituir e remover **o próprio avatar**, **reutilizando integralmente** a capacidade compartilhada de arquivos (3.7) — sem segundo pipeline de upload. Fallback por iniciais (1.11) quando não há avatar válido, arquivos desabilitados, ou a imagem falha ao carregar.

## Dependências
1.11 (avatar por iniciais), 3.7 (capacidade de arquivos: upload→quarentena→scan composto→promoção; download por stream; remoção lógica; feature flag `FILE_UPLOAD_ENABLED`; `FileAuthzContract`), 3.8 (dispatcher de autz por `resourceType`), AD-27/AD-28, FR-32, D6.2, NFR-32/LGPD.

## Fora de escopo
Outras alterações de Perfil; edição de dados da conta; segundo subsistema de upload; crop/editor; processamento avançado; **URL presigned**; exclusão física imediata; avatar de OUTRO usuário (roster é E8); consistência de avatar entre múltiplas Orgs do mesmo usuário (débito `DEB-3.10-AVATAR-MULTI-ORG`).

## Decisão de modelagem (material — resolvida)
`FileObject` é **org-scoped** (RLS ENABLE+FORCE + orgId), mas `Account` é **GLOBAL** (AD-10) e o runtime hoje tem **SELECT-only** nela. O avatar reconcilia assim (Modelo A):
- O binário do avatar é um `FileObject` com `resourceType='ACCOUNT'`, `resourceId=accountId`, `orgId` = **Org do contexto de upload** (RLS aplica; o usuário envia/vê no seu contexto). Reusa 100% o fluxo da 3.7.
- **`Account.avatarFileId`** (coluna GLOBAL, nullable, referência SOFT — sem FK, cruza a fronteira global↔org-scoped) aponta para o `FileObject` ativo. **É a fonte de verdade de "um avatar ativo por usuário"** (uma referência única) — sem índice parcial no FileObject compartilhado (anexos permitem N DISPONIVEL, avatar não).
- **Migration aditiva:** `ALTER TABLE "Account" ADD COLUMN "avatarFileId" UUID` + **GRANT UPDATE("avatarFileId") ON "Account" TO giraffe_app** — **column-scoped** (só essa coluna; `email`/`name`/etc. seguem sem UPDATE — provado por fase-vermelha, análogo ao UPDATE column-scoped do Card 2.11). Reversível: `DROP COLUMN` + `REVOKE`. Account segue global sem RLS.

## Autorização
`FileAuthzDispatcher` ganha `resourceType='ACCOUNT'`: `podeLer/podeEditar('ACCOUNT', accountId)` = **self-only** (`principal.accountId === accountId`); qualquer outro → false → 404/403 não-enumerante. Download reusa `FilesService.baixar` (autz `podeLer` + RLS do FileObject). Cross-tenant/outro-usuário bloqueado por construção (self + RLS).

## Ciclo de vida (contrato do dono)
- **Enviar:** `FilesService.enviar('ACCOUNT', accountId, …)` (validação/scan/promoção da 3.7 — MIME/extensão/magic-bytes/tamanho/vazio/malware; só DISPONIVEL após os gates); então UPDATE atômico `Account.avatarFileId = novoId` + evento. Se já havia avatar → marca o anterior REMOVIDO_LOGICO (substituição). Sem exclusão física.
- **Remover:** `Account.avatarFileId = null` + marca o FileObject REMOVIDO_LOGICO + evento; fallback iniciais imediato. Sem exclusão física.
- **Consultar/exibir:** resolve `Account.avatarFileId` → download pela API (stream sob sessão); ausente/indisponível/erro de carregamento → **iniciais (1.11)**, sem quebrar a UI.
- **Concorrência (#20/#21/#22):** a referência única `avatarFileId` + UPDATE atômico com guarda otimista impede dois avatares ativos / referência quebrada; uploads concorrentes → o último referenciado vence, os não referenciados viram órfãos DISPONIVEL para GC/expurgo (nunca "dois ativos"). P2002/P2028 → 409, nunca 500.

## `FILE_UPLOAD_ENABLED=false` (fail-closed, #15/#19/#20-teste)
Enviar/substituir/remover-dependente-de-arquivo → **503 honesto** (via `exigirCapacidade` da 3.7); nenhum contorno; o avatar por iniciais (1.11) permanece funcional; rollback da capacidade seguro.

## Segurança / LGPD (#16/#17/#24)
Avatar = dado pessoal. Nunca em log: binário, URL, `bucketKey`, object key, caminho, veredito bruto do ClamAV, secrets, metadados internos. Autz no download. Sem URL presigned (entrega por stream pela API). Retenção/ciclo de vida da 3.7.

## Frontend
Componente de avatar: exibe o avatar (via a rota de download da API) ou as iniciais (1.11) como fallback — em ausência, `FILE_UPLOAD_ENABLED=false`, erro de carregamento (`onError`) ou 404. Ações enviar/substituir/remover no Perfil. Sem editor de crop.

## Testes obrigatórios
30 provas (ver `tasks.md`): upload próprio; exibe no lugar das iniciais; download autorizado; sem presigned; substituição segura; um só ativo; anterior não permanece ativo; remoção; volta às iniciais; fallback on-error; não altera avatar alheio; cross-tenant; MIME/extensão/magic-bytes/tamanho/vazio/malware bloqueados; `FILE_UPLOAD_ENABLED=false` fail-closed; iniciais com arquivos off; concorrência sem 2 ativos; falha parcial sem referência inválida; eventos; logs sem PII; RLS/GRANT (fase-vermelha: UPDATE column-scoped só avatarFileId); regressão 1.11/3.7/3.8; suíte serial; CI.

## Rollback
`DROP COLUMN "Account"."avatarFileId"` + `REVOKE UPDATE`. Aditivo; compatível com dados existentes; sem perda.

## Definition of Done
ACs provados; impl + testes no MESMO PR; CI verde; 0 CRITICAL/HIGH; merge; closure posterior; `sprint-status` 3-10→done; **Épico 3 fechado (10/10)**; checkpoint durável com SHA final.
