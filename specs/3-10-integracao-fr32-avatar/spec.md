# Story 3.10 — Integração FR-32: avatar do próprio usuário (envio, substituição, remoção)

## Objetivo
Permitir ao usuário autenticado enviar, substituir e remover **o próprio avatar**, **reutilizando integralmente** a capacidade compartilhada de arquivos (3.7) — sem segundo pipeline de upload. Fallback por iniciais (1.11) quando não há avatar válido, arquivos desabilitados, ou a imagem falha ao carregar.

## Dependências
1.11 (avatar por iniciais), 3.7 (capacidade de arquivos: upload→quarentena→scan composto→promoção; download por stream; remoção lógica; feature flag `FILE_UPLOAD_ENABLED`; `FileAuthzContract`), 3.8 (dispatcher de autz por `resourceType`), AD-10, AD-27/AD-28, FR-32, D6.2, NFR-32/LGPD.

## Fora de escopo
Outras alterações de Perfil; edição de dados da conta; segundo subsistema de upload; crop/editor; processamento avançado; **URL presigned**; exclusão física imediata; avatar de OUTRO usuário (roster/leitura de avatar alheio é E8); **avatar global consistente entre Organizações** (decisão explícita abaixo — não é débito de implementação, é o modelo do MVP).

## Decisão de modelagem (material — RESOLVIDA, emenda de 2026-07-19)

> **Emenda que substitui o desenho anterior.** A versão anterior desta spec propunha `Account.avatarFileId` + `GRANT UPDATE("avatarFileId") ON "Account"` column-scoped. **Esse desenho foi rejeitado pelo dono** e não deve ser implementado.
>
> **Motivo (achado de segurança).** `Account` é GLOBAL e **sem RLS** por AD-10. Um GRANT column-scoped restringe *qual coluna*, **não** *qual linha*: o runtime poderia alterar o `avatarFileId` de **qualquer conta, em qualquer Organização**, e o único freio seria a checagem na aplicação. O gate "RLS impede alterar avatar de outro usuário" **não era satisfazível** — não há RLS em `Account` para impedir nada.
>
> As duas alternativas consideradas e descartadas:
> - **Ligar RLS de UPDATE em `Account`** (self-only por `current_account_id()`): daria backstop de linha, mas exige conceder UPDATE ao runtime na tabela de identidade global — **rejeitado**, AD-10 permanece integral.
> - **Função/procedure `SECURITY DEFINER`**: a identidade viria de `current_account_id()`, que lê o GUC `app.current_account_id` setado pelo **próprio runtime** via `set_config`. Qualquer role pode setar GUCs customizados, logo o contexto é **falsificável pela role runtime** — a função não seria mais forte que a checagem na aplicação, e ainda executaria com privilégios do owner do schema. **Rejeitada.** (Derivar a identidade de `AuthSession` não salva: o runtime tem `SELECT` nessa tabela.)

### Modelo aprovado — avatar **org-scoped**

`Account` **não é tocada**: segue GLOBAL e **SELECT-only** para o runtime. AD-10 integral.

O avatar vive inteiramente no domínio protegido por Organização/RLS:

- **Binário:** um `FileObject` com `resourceType='ACCOUNT'`, `resourceId=accountId`, `orgId` = Org do contexto do upload. Reusa 100% o fluxo da 3.7 (validação → quarentena → scan composto → promoção).
- **Slot ativo:** a tabela **`AccountAvatar(orgId, accountId, fileId, state)`**, org-scoped, com **`@@unique([orgId, accountId])`**.

**Por que uma associação e não `FileObject` sozinho** (investigado na ordem pedida pelo dono):
1. `FileObject.state` é o ciclo de **verificação** (`QUARENTENA`→`DISPONIVEL` pelo antivírus), não o do slot. Um índice único parcial `WHERE state='DISPONIVEL'` só seria imposto no instante da **promoção assíncrona pós-scan** — dois uploads passariam a quarentena e o segundo colidiria dentro do caminho do antivírus, não no do usuário. O slot ativo não pode depender de quando o veredito chega.
2. Um índice condicionado a `resourceType='ACCOUNT'` **acoplaria** a tabela genérica da 3.7 a um consumidor concreto — contra a agnosticidade que o schema declara explicitamente (`resourceType` é texto "para não acoplar a 3.7 a Card/Registro").
3. `REMOVIDO_LOGICO` colidiria semanticamente: "saiu do slot" e "arquivo removido logicamente" viram o mesmo estado, e não dá para distinguir.

**Unicidade simples, não parcial.** `@@unique([orgId, accountId])` significa **uma linha por par** — "um avatar ativo por Account em cada Organização" cai **por construção**, sem índice parcial. Substituir é `UPDATE` de `fileId` numa linha só (atômico por definição); remover é `state='REMOVED'`; reenviar volta a `ACTIVE`. A leitura considera apenas `ACTIVE`.

### Semântica do MVP (decisão explícita, substitui `DEB-3.10-AVATAR-MULTI-ORG`)

O avatar é **por Organização** — não é um débito, é a decisão que **preserva o isolamento**:
- o avatar pertence ao usuário **no contexto da Organização**;
- o mesmo usuário pode ter avatar diferente em Organizações diferentes;
- sem avatar na Org ativa → **iniciais** (1.11);
- fora de uma Organização válida → **iniciais**;
- **nenhuma referência global aponta para arquivo org-scoped** — era exatamente o vazamento de fronteira do desenho anterior.

Débito pós-MVP (`DEB-3.10-AVATAR-GLOBAL`): avatar global consistente entre Organizações exigiria armazenamento global do binário, fora do escopo org-scoped da 3.7. **Não autoriza vazamento cross-tenant em hipótese alguma.**

## Isolamento (o banco nega)
`AccountAvatar` replica o padrão organizacional: **RLS ENABLE + FORCE**, `WITH CHECK` no INSERT **e** no UPDATE, e **`GRANT SELECT/INSERT/UPDATE` — sem DELETE** (remover é `state`, não exclusão).

As policies são **self-only no banco**, não só na aplicação:
- `SELECT`: `orgId = current_org_id() AND accountId = current_account_id()`
- `INSERT` (`WITH CHECK`) e `UPDATE` (`USING` + `WITH CHECK`): idem.

Leitura self-only é o **contrato mínimo necessário**: exibir avatar de outro membro é roster (**E8**), fora de escopo — sem consumidor concreto, não se abre a policy (AD-11). Quando o E8 chegar, amplia-se o `SELECT` com teste próprio.

Isso põe os gates **no banco**: criar/alterar associação de outra Account é barrado pelo `WITH CHECK` (não pela aplicação); arquivo de outra Organização é invisível sob `withTenantContext` (RLS do `FileObject`); dois ativos são impossíveis pelo `UNIQUE`.

## Autorização
`FileAuthzDispatcher` ganha `resourceType='ACCOUNT'`: `podeLer/podeEditar('ACCOUNT', accountId)` = **self-only** (`contexto.accountId === accountId`); qualquer outro → `false` → 404/403 não-enumerante. Download reusa `FilesService.baixar` (autz `podeLer` + RLS do `FileObject`). Cross-tenant e outro-usuário bloqueados por construção (self + RLS).

Diferente de Card/Registro, **não há gate de arquivamento**: a Conta não tem ciclo de vida arquivável nesta Fase.

## Ciclo de vida
- **Enviar:** duas guardas **antes** do ponteiro mudar, nesta ordem:
  1. **Avatar tem de ser IMAGEM** (achado da revisão): a allowlist da 3.7 é a de **anexo geral** e inclui `application/pdf` — um PDF passaria todos os gates dela e viraria "avatar" que a UI não renderiza. O serviço valida por **magic bytes** (o mesmo núcleo puro `detectarTipo` da 3.7, nunca extensão nem `Content-Type` do cliente) e exige `image/*` → senão **400**, antes de gastar slot de scan.
  2. `FilesService.enviar('ACCOUNT', accountId, …)` (gates da 3.7 — magic-bytes/tamanho/vazio/malware). **A 3.7 não lança em veredito adverso**: ela persiste o arquivo como `BLOCKED` e devolve 200 (achado da revisão). Por isso o serviço exige `state === 'DISPONIVEL'` → senão **400**, e o slot **não é tocado** — sem isso, um envio com malware apontaria o slot para um arquivo bloqueado **e aposentaria o avatar legítimo anterior** no caminho.

  Só então o slot é apontado, numa **transação** com contexto (`definirContextoOrg`) que faz as **duas** escritas juntas: aponta o novo `fileId` **e** marca o `FileObject` anterior como **`REMOVIDO_LOGICO`**. São atômicas de propósito — em transações separadas, uma falha entre elas deixaria o arquivo antigo `DISPONIVEL` para sempre, uma imagem pessoal órfã sem coletor. Sem exclusão física.
- **Substituir:** é o mesmo caminho de enviar (a linha única é atualizada). Atômico.
- **Remover:** associação → `state='REMOVED'` + `FileObject` → `REMOVIDO_LOGICO`, na mesma transação; iniciais imediatas. Sem exclusão física.
- **Consultar/exibir:** resolve a associação `ACTIVE` da Org do contexto → download pela API (stream sob sessão); ausente/indisponível/erro de carregamento → **iniciais** (1.11), sem quebrar a UI.
- **Concorrência:** dois envios simultâneos → o `UNIQUE(orgId, accountId)` e a guarda otimista (`updateMany where fileId = <lido>`) garantem **um só vencedor**; o **perdedor** tem seu `FileObject` marcado **`REMOVIDO_LOGICO`** na mesma transação — não fica órfão `DISPONIVEL` esperando um coletor que ainda não existe (retenção é débito aberto da 3.7). P2002/P2028 → **409, nunca 500**.

## Eventos e auditoria
Não existe trilha de domínio para Conta (`AccountHistory` não existe e **não será inventada** — AD-11). O `FILE_EVENT_SINK` roteia `ACCOUNT` para **no-op** de domínio; a trilha é o **evento estruturado de auditoria** (FR-214) que a extensão do Prisma já emite — `AccountAvatar` entra em `MODELOS_AUDITADOS`.

## `FILE_UPLOAD_ENABLED=false` (fail-closed)
- **enviar** → **503** honesto (via `exigirCapacidade` da 3.7);
- **substituir** → **503**;
- **remover o próprio avatar** → **permitido** (limpar o ponteiro é escrita de domínio, não do subsistema de arquivos; trancar o titular fora de retirar a própria imagem — justamente quando arquivos foram desligados por incidente — seria erro de LGPD). O `FileObject` é marcado `REMOVIDO_LOGICO` best-effort; a associação é limpa de todo modo, sem deixar referência quebrada;
- **iniciais** (1.11) seguem funcionando; rollback da capacidade é seguro.

## Segurança / LGPD
Avatar = dado pessoal. Nunca em log: binário, URL, `bucketKey`, object key, caminho, veredito bruto do ClamAV, secrets, metadados internos. Autz no download. **Sem URL presigned** (entrega por stream pela API). Retenção/ciclo de vida da 3.7.

## Frontend

**Restrição de escopo descoberta na implementação:** a Story **1.11 está em `backlog`** — o avatar por iniciais **não existe** e a Topbar declara, no próprio código, que o espaço de Perfil "só ganha controle funcional na Story 1.11".

A 3.10 entrega, portanto, apenas o componente `Avatar` (`apps/web/components/ui/avatar.tsx`): imagem servida pela **rota da API** (`/me/avatar/download`, sob sessão — nunca presigned) com **fallback por iniciais** cobrindo todos os caminhos de ausência: sem avatar na Org ativa, fora de Organização válida, `FILE_UPLOAD_ENABLED=false`, arquivo removido/bloqueado e falha de carregamento (`onError`). A derivação de iniciais é função **pura** (`iniciaisDe`), testada isoladamente.

**Não** se torna a Topbar funcional nem se constrói a tela de Perfil: isso é escopo declarado da 1.11, e antecipá-lo colidiria com ela. As ações enviar/substituir/remover existem na **API**; a UI que as aciona é da 1.11, que consumirá este componente. Sem editor de crop.

## Fase vermelha obrigatória (prova ANTES da implementação)
1. runtime continua **sem** UPDATE em `Account`;
2. `UPDATE "Account" SET email=…` → negado;
3. `UPDATE "Account" SET name=…` → negado;
4. não existe avatar em `Account` — a coluna **não existe** (o desenho anterior foi rejeitado);
5. usuário **não** cria associação para outra Account (`WITH CHECK` do INSERT);
6. usuário **não** altera associação de outra Account (`USING`/`WITH CHECK` do UPDATE);
7. usuário **não** usa arquivo de outra Organização;
8. **não** pode existir mais de um avatar ativo por Org+Account (`UNIQUE`);
9. tentativa concorrente **não** deixa dois ativos;
10. `AccountAvatar` sem GRANT de DELETE.

## Migration e rollback
Aditiva e reversível: **não altera `Account`**; cria só `AccountAvatar` + enum + RLS/FORCE + policies + GRANT mínimo + `UNIQUE`/índices. `.down.sql` versionado no mesmo conjunto de mudanças (remove **apenas** os objetos da 3.10; preserva migrations anteriores). Drill `up → down → up` em banco descartável.

## Definition of Done
ACs provados; impl + testes no MESMO PR; CI verde; 0 CRITICAL/HIGH; merge; closure posterior; `sprint-status` 3-10→done; **Épico 3 fechado (10/10)**; checkpoint durável com SHA final.
