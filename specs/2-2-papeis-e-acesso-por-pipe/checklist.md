# Checklist — Story 2.2: Papéis e acesso por Pipe

> **Pré-implementação.** Esta Story ainda **não** foi implementada — o checklist fixa o que a implementação
> terá de provar, e valida a qualidade do **Spec Kit** (spec/plan/tasks) antes de codificar. Itens de
> implementação ficam desmarcados até haver evidência de execução real (Constitution X).

## Qualidade do Spec (pré-código)

- [x] Escopo claramente delimitado: só papéis/acesso por Pipe; Card (2.10) e modos condicionais fora.
- [x] Fonte autoritativa citada: épico 2.2 + PRD §D1.4 (OQ-2), §D1.3 (OQ-1) — decisões de Produto
      **aprovadas**, não bloqueiam.
- [x] AC testáveis e sem ambiguidade (AC1–AC4 → SC-221…SC-228).
- [x] Critérios de sucesso mensuráveis e verificáveis contra PostgreSQL real.
- [x] Dependências e ordem explícitas (empilha sobre 2.1/PR #17; não abrir PR antes do merge).
- [x] Clarifications resolvidas por decisão fundamentada (membership vs account; soft-delete; unicidade;
      quem concede), sem `[NEEDS CLARIFICATION]` pendente.
- [x] Sem antecipação de escopo (Constitution II): sem Card, sem modos condicionais, sem gestão de membros.

## Critérios de aceite (a provar na implementação)

- [ ] **AC1** — sem papel, sem acesso; recurso não revelado (404 não-enumeração). [SC-221, SC-227]
- [ ] **AC2** — concessão dá exatamente o poder do papel; no máximo um por Pipe por pessoa. [SC-222, SC-223]
- [ ] **AC3** — Admin da Org acessa qualquer Pipe sem concessão (2.1 preservada). [SC-224]
- [ ] **AC4** — isolamento (RLS) e revogação provados pelo banco. [SC-225, SC-226]

## Modelo de dados

- [ ] `PipeGrant` liga a `Membership` (não `Account`); `orgId`, `pipeId`, `membershipId`, `role`, `state`.
- [ ] Enums `PipeRole` (ADMIN/MEMBER/VIEWER) e `PipeGrantState` (ACTIVE/REVOKED).
- [ ] **Índice único parcial** `(pipeId, membershipId) WHERE state='ACTIVE'` — um papel efetivo por Pipe.
- [ ] Índices `(orgId, pipeId)` e `(orgId, membershipId)`.
- [ ] Revogação é soft-delete (`state=REVOKED`, `revokedAt`), não DELETE.

## Autorização (por recurso — DBT-AUTHZ-01)

- [ ] A checagem fina "este principal pode sobre ESTE Pipe" é no **serviço**, com Pipe+concessão carregados.
- [ ] `authz.guard.ts` **não** é alterado (contrato C3; decisão D-1 já fechada na 2.1).
- [ ] `ability.factory` constrói abilities de Pipe para MEMBER/GUEST **a partir da concessão**, nunca no vácuo.
- [ ] Admin da Org mantém acesso total sem concessão.
- [ ] Ausência de concessão ⇒ negado (deny-by-default), e **sem revelar** o recurso (404).

## Isolamento / RLS

- [ ] `PipeGrant` com `ENABLE` **e** `FORCE ROW LEVEL SECURITY`; 4 policies por `current_org_id()`.
- [ ] Dono da tabela ≠ runtime (verificar `relowner`); runtime `NOBYPASSRLS`.
- [ ] GRANT do runtime = `SELECT, INSERT, UPDATE` (sem DELETE — revogação é UPDATE).
- [ ] Toda query por `withTenantContext`; nenhum `where orgId` manual.
- [ ] Filtro por concessão na listagem de Pipes **não** vaza existência de Pipe não concedido (404, não 403).

## Testes (PostgreSQL real)

- [ ] RLS/isolamento de `PipeGrant` (outra Org não vê; sem contexto nega; fase vermelha).
- [ ] Autorização por recurso (sem concessão 404; cada papel com seu poder; serviço nega mesmo com guard
      concedendo o tipo).
- [ ] Unicidade imposta pelo **banco** (2ª concessão ativa recusada; re-conceder após revogar funciona).
- [ ] Revogação corta acesso (volta a 404).
- [ ] Isolamento entre Pipes (papel no X não vê o Y).
- [ ] Regressão da 2.1 verde (Admin da Org sem concessão).
- [ ] Migration deploy + rollback (sem tocar Pipe/Membership) + reaplicação (descartável).
- [ ] Escrita de teste na Org C; nenhum teste enfraquecido; fase vermelha provada nos testes de segurança.

## Observabilidade / LGPD

- [ ] `PipeGrant` em `MODELOS_AUDITADOS`; conceder e revogar auditados (mudança de papel — AD-31/D1.6).
- [ ] Payload usa identificadores internos; **não** vaza e-mail/PII da pessoa concedida.
- [ ] Logs sanitizados; sem segredo.

## Migration / compatibilidade

- [ ] Migration encadeia **depois** da `_pipes` (ts posterior); não concorrente; não altera a 2.1.
- [ ] Rollback remove só os objetos da 2.2.
- [ ] C3 (mecanismo) e C4 (RLS) preservados; consumo, não alteração.

## Prontidão para code-review

- [ ] Suíte completa verde; typecheck/lint/format limpos; `git diff --check` limpo.
- [ ] Após merge da 2.1: rebaseado sobre `main`, diff/migration/testes revalidados.
- [ ] **Revisão adversarial independente** (não subagente do implementador) — obrigatória (lição do PR #17).
- [ ] `commit-check` aprovado.
