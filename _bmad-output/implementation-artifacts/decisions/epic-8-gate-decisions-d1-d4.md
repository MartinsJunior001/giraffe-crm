# Épico 8 — Decisões de gate D-1 a D-4 (APROVADAS)

> **Status:** APROVADAS pelo dono em 2026-07-21. **Autoritativas** para a implementação de 1.12 e 8.4–8.8.
> **Natureza:** decisões de gate (Produto/Segurança/Arquitetura/Governança) que a Arquitetura delega
> explicitamente — AD-7 ("operações sensíveis exigem step-up; quais = Produto+Segurança") e a Rule de
> retenção ("valores/políticas = Produto/Negócio/Jurídico, antes da produção"). Este registro **não**
> altera a Architecture Spine (artefato controlado); instancia parâmetros que ela deixa em aberto.
> D-4 é **baseline de Produto**, sujeita a validação Jurídica/Governança **antes da produção**.

## D-1 — Step-up e política de senha (Produto+Segurança)
**Mecanismo:** reutilizar Better Auth; revalidar a senha atual do próprio usuário; registrar step-up
recente ligado a Account+sessão+autenticação atual; **sem** segundo sistema de autenticação; **sem**
nova sessão de login; estado/token de step-up **só server-side**, nunca em logs.
**Janela:** step-up válido por **10 minutos**; fora dela, a operação sensível → **403 STEP_UP_REQUIRED**;
senha incorreta → resposta **não-enumerante**; rate limit reutiliza o mecanismo canônico; se não houver,
**≤ 5 falhas por Account+IP em 15 min → 429**.
**Operações que exigem step-up:** trocar a própria senha; promover membro para Admin; rebaixar Admin;
suspender membro; reativar membro; remover membro; sair voluntariamente da Organização.
**Política de senha (nova/alterada):** mínimo **15**, máximo **128** caracteres; **sem** exigência de
mistura de classes; permitir frases-senha e espaços (suporte canônico da stack); rejeitar senha
comum/comprometida por mecanismo **local/canônico** (sem dependência runtime de serviço externo);
**sem** troca periódica; **não** invalidar senhas existentes por esta mudança; validador **centralizado**
nos fluxos de definição/alteração, sem duplicar.

## D-2 — Proteção atômica do último Admin (Segurança/Arquitetura)
**Invariante:** toda Organização mantém ≥ 1 Membership com `state=ACTIVE` **e** `role=ADMIN`.
**Toda operação que possa reduzir essa quantidade:** abre transação; **bloqueia a linha canônica da
`Organization` com `SELECT … FOR UPDATE`** (ou mecanismo equivalente já comprovado no repositório); relê
as Memberships Admin ativas dentro da transação; valida o invariante; executa a alteração; grava o
evento/outbox e a auditoria **na mesma transação**; confirma somente com o invariante preservado.
**Contagem otimista isolada NÃO é proteção suficiente** contra duas alterações concorrentes.
**Resposta ao remover o último Admin:** **409 LAST_ADMIN_PROTECTED**.
**Alternativa aceitável só se já for padrão comprovado na base:** transação SERIALIZABLE com retry
limitado + teste concorrente demonstrando que **nunca restam zero Admins ativos**.
**Aplica a:** rebaixamento, suspensão, remoção e saída voluntária de Admin.

## D-3 — Sessões, contexto e abilities (Arquitetura)
Suspensão/remoção/alteração relevante de papel: alteram a Membership **atomicamente**; **incrementam a
versão de autorização** (se o modelo existente suportar); invalidam caches de abilities e canais de
tempo real **da Org afetada**; produzem evento canônico + auditoria **na mesma transação**.
A resolução de contexto **relê e exige Membership ACTIVE em cada requisição**. Pós-commit: novas
requisições na Org afetada → **deny-by-default**; canais WebSocket e abilities em cache revogados;
**sessões/acessos em outras Organizações permanecem intactos** — **não** revogar globalmente a Account
no Better Auth. Mutações protegidas **revalidam a Membership na sua fronteira transacional** (anti-TOCTOU).
Reativação: **não** restaura concessões antigas incompatíveis; **não** promove papel automaticamente;
gera novo evento + auditoria; **exige step-up** do ator administrativo.

## D-4 — Auditoria, retenção e LGPD (baseline de Produto; validação Jurídica antes da PRODUÇÃO)
**Retenção padrão:** **24 meses** a partir de `occurredAt`; configuração **global** da plataforma no MVP
(sem config por-Organização nesta Story). *24 meses é decisão de produto, não afirmação de obrigação legal.*
**Read-side:** só **Admin ativo**; isolamento por Organização; filtros + paginação; ordenação
determinística; **sem** edição/exclusão manual; correção por **novo evento**; registra **`AUDIT_LOG_VIEWED`**
sanitizado (sem copiar resultados).
**Minimização — proibido registrar:** senha/hash; token bruto; chave de API; cookie/identificador
secreto de sessão; corpo HTTP completo; conteúdo desnecessário de e-mail; dados pessoais sem finalidade.
**O evento conserva apenas:** `auditEventId`, `schemaVersion`, `orgId`, categoria, operação, resultado,
`occurredAt`, `correlationId`, referência mínima e **pseudonimizável** do ator, referência mínima do
recurso, metadados sanitizados autorizados pelo contrato.
**Descarte:** nenhum endpoint de aplicação apaga auditoria; expiração **só** pelo processo controlado de
retenção (idempotente, observável, auditado); **legal hold** suspende a expiração sem alterar eventos.
**Exclusão/anonimização de Account:** remover dados exibíveis desnecessários do ator; manter referência
pseudonimizada suficiente para a integridade do fato; preservar Organização, operação, tempo e recurso;
**não reescrever** o fato histórico.
**Backups:** seguem a política de ciclo de vida já aprovada; **não prometer exclusão seletiva** em backup
imutável; restaurações reaplicam o manifesto de expiração/anonimização antes de disponibilizar;
documentar o período residual máximo conforme a política real de backup.
**Gate restante:** implementar write-side e read-side técnico **agora**; validar 24 meses, legal hold,
anonimização e ciclo dos backups com Governança/Jurídico **antes da produção** — **não bloqueia**
implementação/testes da 8.8; bloqueia **somente** o gate final de produção.

## Ordem executável aprovada
1. QA + integração + closure da **8.3**. 2. **1.12** (step-up) após D-1. 3. **8.4** → **8.5** → **8.6** →
**8.7**. 4. **8.8** não depende de 8.7 (paralelizável com Writer livre; com 1 Writer, priorizar a cadeia
crítica 1.12→8.7). 5. Smoke da **8.2** quando Resend/Coolify estiver configurado. 6. Fechar o Épico 8
**só** com todas as Stories integradas, CI do main verde, smoke da 8.2 aprovado, auditoria integrada
aprovada, gates de staging verdes e nenhum gate obrigatório pendente.

**Sem nova aprovação humana** para iniciar 1.12/8.4/8.5/8.6/8.7. D-4 exige validação consolidada
**antes da produção**, não antes da implementação da 8.8.
