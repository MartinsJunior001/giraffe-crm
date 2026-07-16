# Analyze — Story 3.2: Papéis e acesso por Database (pré-implementação)

> Análise **não destrutiva** de consistência cruzada do **pacote de planejamento** da 3.2: épico × PRD (D3.4) ×
> AD-9 × Story × spec × plan × research × data-model × contratos × tasks × contratos congelados × débitos
> herdados. A implementação ainda não começou — o objetivo é aprovar (ou não) o pacote para codificar.
>
> Data: 2026-07-16 · Branch: `story/3-2-papeis-e-acesso-por-database` (off `origin/main` @ 29cf323; 3.1 `done`)

## Resultado

**APROVADO PARA IMPLEMENTAÇÃO — com 3 gates de verificação e 1 reconciliação documental registrada.**

O escopo é coerente com o épico e com a decisão de Produto **já resolvida** (D3.4); não há `[NEEDS CLARIFICATION]`
pendente; Q1–Q5 foram resolvidas por fonte autoritativa (PRD/epics/AD-9), com o único detalhe de implementação
(código HTTP do teto da Org) fixado por default coerente com a 2.2. Restam três verificações a fazer **durante** a
implementação (não bloqueiam o início) e uma reconciliação documental já registrada.

## Cobertura: requisito → onde será provado

| Origem | Requisito | Plano | Prova prevista |
|---|---|---|---|
| AC1 / CA1 | sem papel → sem acesso, sem revelar | `databases.service` filtra por concessão; 404 | `database-grants-http`/`databases-authz` |
| AC2 / CA2 | autoridade hierárquica (Admin do DB só MEMBER/VIEWER; só Admin da Org toca ADMIN) | `exigirConcederPapel` em `database-authz.ts` | `database-grants-http` |
| AC3 / CA3 | Convidado só Somente leitura (teto da Org) | serviço carrega `Membership.role` do alvo → 400 | `database-grants-http` |
| AC4 / CA4 | revogar corta acesso; autoria/histórico preservados | soft-delete + resolução lê só ACTIVE | `database-grants-http`/`-rls` |
| AC5 / CA5 | 1 papel efetivo por (DB, pessoa) | índice único parcial `WHERE state='ACTIVE'` | `database-grants-rls`/`-http` |
| AC6 / CA6 | isolamento (RLS) | RLS FORCE + WITH CHECK | `database-grants-rls` |
| migration / SC-206 | deploy+rollback+reaplicação | migration + `.down.sql` | SC próprio (banco descartável) |

## Consistência épico × PRD × AD × spec

- **PRD D3.4 §966-977** fixa exatamente os três papéis (Admin do Database / Membro / Somente leitura), o modelo de
  concessão explícita por Database, "ausência de papel = sem acesso", "no máximo um papel efetivo", "papel de
  Database nunca supera o da Organização", "Convidado só recebe Somente leitura", e — §969 — "Admin do Database
  configura/administra estrutura; **não controla ciclo de vida nem Memberships e não concede poderes fora do
  Database**". A spec e a Story refletem isso **sem desvio**.
- **epics §1086 (ajuste 2)** detalha a autoridade: Admin do Database concede só Membro/Somente-leitura a
  Memberships ativas da mesma Org; **somente Admin da Org concede/remove Admin do Database**. Coerente com a spec
  (D2/D3) e o contrato (`exigirConcederPapel`).
- **AD-9** ("papel da Org é o teto") — materializado no teto da Org (GUEST só VIEWER) e já refletido na
  `ability.factory` existente. Coerente.
- O épico manda "Fora: estrutura do Formulário (3.3); permissões por Campo (fora da Fase 1)" — respeitado; nenhum
  aparece no pacote.

## Requisitos não cobertos
**Nenhum** dos AC do épico ficou sem tarefa e critério de sucesso.

## Escopo antecipado (Constitution II)
**Nenhum.** Sem Registro, sem schema/`Form.databaseId`, sem poder diferencial MEMBER vs VIEWER sobre Registros
(role dormente — D8), sem permissões por Campo, sem gestão de Memberships da Org (Épico 8), sem ampliação do ciclo
de vida do Database ao Admin do Database.

## Decisões assumidas (registradas)

- **D-3.2-1 — `DatabaseGrant` liga a `Membership`, não `Account`** (twin de D-2.2-1). *Fundamentada; confirmável no code-review.*
- **D-3.2-2 — revogação é soft-delete** (`state=REVOKED`), sem DELETE (GRANT sem DELETE). Preserva a trilha (LGPD).
- **D-3.2-3 — um papel efetivo por (Database, pessoa) via índice único parcial** `WHERE state='ACTIVE'`. 2ª
  concessão ativa **recusada** (409). A unicidade é do **banco**.
- **D-3.2-4 — autoridade hierárquica** (Admin da Org → qualquer; Admin do Database → só MEMBER/VIEWER; só Admin da
  Org toca ADMIN) — a diferença real frente à 2.2; fonte explícita (PRD D3.4 §969 + epics §1086).
- **D-3.2-5 — abrir `ler Database` grosseiro; guarda fina no serviço; guard não tocado** (DBT-AUTHZ-01, twin de 2.2).
- **D-3.2-6 — teto da Org por 400** (Q2) — default coerente com `exigirMembershipAtivaDaOrg` da 2.2.

## Reconciliação documental (registrada)

- **RD-1 — "Convidado não acessa Database" (PRD §297) × "Convidado só recebe Somente leitura" (§970).** Prevalece
  **§970** (decisão **resolvida** D3.4). §297 cita `permissoes-fase-1.md`, que o próprio PRD (§412) marca
  `PENDENTE DE DECISÃO`; a matriz pendente **não** derruba decisão resolvida. **Default** (sem concessão) =
  "Convidado não acessa"; **com** concessão, só `VIEWER`. **Não** é conflito autoritativo (não requer escalada) —
  é um documento pendente vs uma decisão resolvida, e a resolvida vence. Registrado aqui e na spec (Q5).

## Riscos residuais (a vigiar na implementação)

- **RV-1 (gate) — não-enumeração na leitura fina do catálogo.** Ao filtrar Databases por concessão para
  MEMBER/GUEST (T013), a query **não pode** revelar Databases não concedidos: `obter` direto → 404, e a lista
  **não** os inclui. Mesma disciplina da 2.2/SC-227. **Verificar na implementação.**
- **RV-2 (gate) — autoridade fina no lugar certo (DBT-AUTHZ-01).** `exigirConcederPapel` e o teto da Org **devem**
  ficar no serviço, com o recurso/alvo carregado, **não** como condition do guard. Um teste deve provar que o
  serviço nega (403 ao Admin do DB concedendo ADMIN) mesmo quando o guard grosso concede o tipo `ler Database`.
  **Verificar na implementação.**
- **RV-3 (gate) — regressão da 3.1.** Abrir `ler Database` grosseiro e a leitura fina do catálogo **não** podem
  quebrar a 3.1: o Admin da Org **continua** vendo todos os Databases sem concessão, e o ciclo de vida
  (criar/renomear/arquivar/restaurar) **permanece** `administrar Database` (Admin-only). A suíte da 3.1 deve
  seguir verde. **Verificar na implementação.**

## Contratos C1–C8

- **C3 (authz)** — consumido pela extensão de regras por recurso (abre `ler Database` grosseiro; guarda fina no
  serviço); **o mecanismo não muda** e o `authz.guard.ts` **não** é tocado (herda `{ id, orgId }` da 2.1). Sem
  novo desvio de contrato. Se a implementação constatar necessidade de tocar o guard, declarar desvio e escalar.
- **C4 (RLS)** — consumido: `DatabaseGrant` replica o padrão de `PipeGrant`/`Membership`.
- C1/C2/C5/C6/C7/C8 — não tocados.

## Débitos herdados

- **DBT-AUTHZ-01** — é **consumido** por esta Story (autorização por recurso sobre Database é o seu tema); a guarda
  fina no serviço (`database-authz.ts`) é o lugar previsto.
- **SC-222=B / "role dormente"** — reaplicado: `DatabaseRole` armazenado e resolvido, poder diferencial MEMBER vs
  VIEWER inerte até 3.3/3.4 (consumidores concretos futuros — AD-11).
- Débitos de staging/L6 (D-05 etc.) — **não** tocados; seguem na trilha da sessão de staging.

## Veredito

**APROVADO PARA IMPLEMENTAÇÃO.** Iniciar pela Phase 1 (`pre-implementation-check` + `context7-check`), depois
Phase 2 (schema/migration/índice parcial/RLS/GRANT + CASL + resolução fina). RV-1/RV-2/RV-3 são gates de
verificação durante a codificação (não bloqueiam o início). Nenhum conflito autoritativo; a reconciliação RD-1
está resolvida a favor da decisão resolvida (D3.4 §970). A branch está off `origin/main` (3.1 `done`) — sem
dependência de merge pendente.
