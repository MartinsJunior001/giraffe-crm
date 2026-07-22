# Decisão — Teto de PipeGrant do CONVIDADO (DEB-PIPEGRANT-GUEST-CEILING)

**Status:** APROVADA pelo dono em 22/07/2026. Fonte autoritativa desta decisão de Produto.
**Contexto do débito:** `DEB-PIPEGRANT-GUEST-CEILING` — o modelo de `PipeGrant` (Story 2.2) concede papéis por Pipe (`ADMIN`/`MEMBER`/`VIEWER`) a uma `Membership`, mas **não impunha teto por papel de Organização**. Um Account com Membership de papel **CONVIDADO** (GUEST) podia, em tese, receber um `PipeGrant` `ADMIN`/`MEMBER`, obtendo administração/operação plena de um Pipe — elevação indireta que contradiz o papel de participante externo. O `prd.md` explicita o teto de Convidado para Database (§970) mas não para Pipe (§865); a Story 4.2 (que empilha autorização de Automação sobre o substrato de Pipe) não pode herdar esse buraco. Esta decisão fecha a lacuna **antes** da 4.2.

> Relação com o AD-9: o AD-9 (teto da Org) já é materializado para `DatabaseGrant` (Story 3.2 — Convidado só recebe `VIEWER`). Esta decisão é o **espelho** para `PipeGrant`, com a granularidade adicional dos modos condicionais de Pipe.

## Decisão — menor privilégio para o CONVIDADO

1. Um Account com **Membership de Organização no papel CONVIDADO** **nunca** pode receber `PipeGrant` **administrativo ou operacional pleno**.
2. O **teto máximo** de `PipeGrant` do CONVIDADO é **SOMENTE_LEITURA** (o papel `VIEWER`/"Somente leitura" de 2.2).
3. Também são permitidos os níveis **mais restritivos** já previstos pelo produto, quando aplicáveis como modificadores sobre a concessão de leitura (epics.md §785 — "modos condicionais, não papéis"):
   - **VISÃO_RESTRITA** (`restritoAoProprio`);
   - **APENAS_FORMULÁRIO_INICIAL**.
4. **Recusados** para CONVIDADO (→ erro de domínio, `400`/`422` sanitizado, deny-by-default):
   - **ADMIN_DO_PIPE** (`role=ADMIN`);
   - **MEMBRO_DO_PIPE** (`role=MEMBER`);
   - qualquer grant que permita **administrar** Pipe, Fases, Campos, Automações, membros ou permissões;
   - qualquer **elevação indireta equivalente**.
5. **Validação no write-side**, **dentro da transação** da concessão ou alteração do grant (não só na UI, não só no read-side).
6. **Read-side e autorização efetiva permanecem fail-closed** mesmo diante de dados **legados/inconsistentes**: um `PipeGrant` incompatível preexistente (ex.: GUEST com `ADMIN` legado) **não** concede o poder — a resolução de poder rebaixa ao teto do papel de Org (o banco/serviço nega, não a aplicação confia no dado).
7. **Alteração do Membership para CONVIDADO** reconcilia grants acima do teto de forma **segura**:
   - **preferencialmente recusa** a alteração enquanto existirem grants incompatíveis;
   - retorna **erro de domínio claro e sanitizado**;
   - exige que os grants sejam **reduzidos/removidos antes** da mudança;
   - **não rebaixa silenciosamente** permissões.
8. **Alteração de CONVIDADO para MEMBRO** **não** promove `PipeGrant`s automaticamente — as concessões seguem explícitas.
9. Concessões continuam **explícitas** e **limitadas** à Organização/Pipe correspondente.
10. **Não** ampliar o escopo do MVP com permissões personalizadas adicionais.

## Justificativa
Menor privilégio; mantém o CONVIDADO como participante externo; evita administração/edição operacional ampla; preserva SOMENTE_LEITURA para colaboração controlada; permite VISÃO_RESTRITA e APENAS_FORMULÁRIO_INICIAL; evita elevação indireta; mantém o modelo simples, previsível e auditável.

## Registro (formato canônico)
```
AUTONOMOUS_DECISION
CONTEXT: DEB-PIPEGRANT-GUEST-CEILING
SELECTED: CONVIDADO limitado a SOMENTE_LEITURA ou níveis mais restritivos
RATIONALE: menor privilégio e separação entre participante externo e membro operacional
SCOPE_IMPACT: NONE
REVERSIBILITY: MEDIUM
PRODUCTION_IMPACT: NONE
NEXT_ACTION: fechar o teto no write-side do PipeGrant (unidade tech), depois executar a Story 4.2
```

## Consumo
- Implementada como fechamento do débito no write-side do `PipeGrant` (serviço de concessão/alteração de grant + reconciliação na mudança de Membership para CONVIDADO), com testes adversariais que provam a recusa de ADMIN/MEMBER, a permissão de VIEWER/VISÃO_RESTRITA/APENAS_FORMULÁRIO_INICIAL, e a não-elevação por alteração de grant ou de Membership.
- **Desbloqueia a Story 4.2** (ciclo de vida e gestão da Automação), cuja autorização repousa sobre o substrato de Pipe (dep 2.2). A 4.2 não deve reabrir esta guarda — consome o teto já imposto.
- Espelha o teto de `DatabaseGrant` (AD-9 / Story 3.2). Não altera o guard/`ability.ts` (C3 congelado) — a guarda fina vive no serviço (`pipe-authz.ts`/serviço de grants), padrão DBT-AUTHZ-01.
