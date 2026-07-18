# Decisão do dono — Opção 1 (2026-07-18)

Resolve o fork material levantado na abertura da implementação: **como o valor de um Campo Arquivo é
populado dado que `Card.valores` é append-only (sem GRANT de UPDATE) e o arquivo precisa se vincular a um
`resourceId` existente**. O dono escolheu a **Opção 1** (mínima, preserva invariantes; era a recomendada).

## Invariantes adotados

### 1. Card (canal autenticado, 2.7)
- Arquivos autenticados são `FileObject` com `resourceType=CARD` e `resourceId=cardId`.
- Aparecem como **anexos gerais** do Card (linhas `FileObject` próprias, **fora** de `valores`).
- **NÃO** atualizar `Card.valores`; **NÃO** conceder `GRANT UPDATE("valores")` em `Card`.
- Preservar integralmente o modelo **append-only** de `Card`.
- Consequência: o Campo Arquivo como **valor de Campo** não é setado no fluxo autenticado do Card
  (o Card ganha anexos, não valor de Campo Arquivo).

### 2. Registro (3.4)
- Campo Arquivo persiste **referência tipada** ao `FileObject` nos `valores` do Registro (`Record.valores`
  é editável — 3.4). Fluxo: criar Registro → upload vinculado a `(RECORD, recordId)` → editar valores
  (`valores[fieldId] = fileId`), evento `VALUES_UPDATED`/`FILE_ATTACHED`.
- `resourceType=RECORD`, `resourceId=recordId`.
- Autorização, RLS, limites e não-enumeração **herdados da 3.7** (via `FileAuthzContract` → `database-authz`).

### 3. Formulário público (2.8)
- Aceitar **multipart inline** na submissão.
- O servidor **gera/reserva** os IDs necessários e orquestra **Card + FileObject** (o `cardId` é gerado
  primeiro; os `FileObject` vinculam a esse `cardId`; o Card é **INSERT**ado já com os `valores` referenciando
  os `fileId` — INSERT preserva append-only, pois não há UPDATE de `valores`).
- **Nenhuma referência a `resourceId` inexistente.**
- Falha de validação, scan, persistência ou promoção ⇒ **bloqueio/compensação fail-closed**:
  - sem Card parcialmente criado; sem objeto órfão `DISPONIVEL`.
- Manter **idempotência** e **proteção contra repetição** (a idempotência da 2.8 já existe; a orquestração
  de arquivos entra na MESMA fronteira transacional / compensatória).

### 4. Escopo (não antecipar)
- **NÃO** implementar upload inline uniforme para todos os canais nesta Story.
- Registrar a **uniformização** (inline em 2.7/3.4 create) como **evolução futura** — ver `DEB-3.8-INLINE-UNIFORME`.
- **NÃO** alterar GRANT, RLS ou o contrato append-only de `Card.valores`.

## Testes obrigatórios (exigidos pelo dono)
- Anexo no Card **sem** `UPDATE` em `valores`.
- Campo Arquivo **persistido** no Registro (referência tipada em `Record.valores`).
- Submissão pública **multipart** bem-sucedida (Card + FileObject orquestrados).
- Falha entre criação, scan e vínculo **sem estado parcial** (sem Card parcial; sem objeto órfão disponível).
- Cross-tenant → **404**.
- Remoção do GRANT continua **provada** (fase vermelha).
- Mutação tentando `UPDATE Card.valores` deve permanecer **vermelha** (`permission denied`).

## Débito registrado
- **DEB-3.8-INLINE-UNIFORME:** unificar o upload inline de arquivos na submissão para os canais autenticados
  (2.7 Card create, 3.4 Record create), hoje resolvidos por "anexo geral / editar valores". Evolução futura;
  fora do escopo desta Story por decisão do dono.
- **DEB-3.8-SOFT-DELETE-ANTERIOR (a confirmar com o dono):** na substituição do valor de um Campo Arquivo do
  Registro (`editarValores`, A→B), o `FileObject` anterior (A) **permanece `DISPONIVEL`** como anexo geral do
  Registro — sob a Opção 1, arquivo é anexo e a troca é só da *referência* no valor (evento `FILE_REPLACED`
  emitido, sem perda silenciosa). A spec (RF-5/INV-3.8-06) sugere soft-delete do anterior após o novo virar
  DISPONIVEL; isso é uma decisão de produto (manter A como anexo vs. removê-lo logicamente). Mantido o
  comportamento "A segue anexo" por coerência com a Opção 1; revisitar com o dono se o desejado for o soft-delete.
