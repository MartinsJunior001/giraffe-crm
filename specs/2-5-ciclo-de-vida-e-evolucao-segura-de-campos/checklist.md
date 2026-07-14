# Checklist — Story 2.5: Ciclo de vida e evolução segura de Campos

> Marcado só com **evidência de execução real** (Constitution X): PostgreSQL real, sem mock. Risco ALTO.

## Editar (AC1 / SC-251-252)
- [ ] Editar persiste `label`/`help`/`defaultValue`; a ordem (`position`) é preservada.
- [ ] `type` **não** é editável (rejeitado 400); `options`/`typeConfig` cru **não** são aceitos no editar.
- [ ] Identidade estável: `id` do Campo e `id` das opções **não mudam** ao editar/renomear (AD-12).

## Arquivar/restaurar (AC2 / SC-253)
- [ ] `ACTIVE→ARCHIVED` marca `archivedAt`, sai da ordem ativa, preserva dados.
- [ ] `ARCHIVED→ACTIVE` zera `archivedAt`, volta ao final da ordem ativa.
- [ ] Idempotente **sem falso `denied`** (arquivar já arquivado / restaurar já ativo → 200, sem `updateMany`).
- [ ] **Sem** invariante "≥1 Campo ativo" — Formulário pode ficar vazio.

## Ciclo de opções (AC4 / SC-255-256)
- [ ] add/rename/reorder/archive/remove mantêm **`id` estável** por opção; renomear não muda `id`.
- [ ] `id` duplicado recusado; `label` vazio/inválido recusado; limite de opções/label/payload aplicado.
- [ ] `typeConfig` malformado/propriedade desconhecida **falha fechada** (recusa, não conserta).
- [ ] ordem determinística; opção arquivada preserva o rótulo; remover é **UPDATE** (não DELETE de linha).
- [ ] operações de opção só em `SELECT_SINGLE`/`SELECT_MULTI` (senão 400); opção inexistente → 404.

## Contrato futuro (AC3 / SC-254)
- [ ] travas "obrigatório em publicado/requisito/marco" e "mudança de tipo por valores" **não** consultam
      tabela alguma; nada é falsamente bloqueado nem materializado (AD-11); `type` imutável.

## Autorização (AC5 / SC-257-258)
- [ ] Admin da Org evolui Campos de qualquer Pipe; Admin do Pipe (ADMIN ACTIVE + Membership ACTIVE) evolui os
      do seu Pipe, **inclusive Campo de Fase** (poder por `phase.pipeId`).
- [ ] MEMBER/VIEWER concedidos → **403** ao evoluir (mas **leem**); Membership SUSPENDED + ADMIN → negado.
- [ ] Sem acesso ao Pipe → **404** em todas as rotas de evolução (não-enumeração).

## Isolamento / "sem exclusão" (AC6 / SC-259)
- [ ] Outra Organização não vê nem edita Campos; UPDATE sem contexto (ou de outra Org) **negado pelo banco**.
- [ ] Runtime **sem GRANT DELETE**; remover opção é UPDATE do `typeConfig`; **nenhuma tabela nova**.
- [ ] INV-FORM-01 sob **evolução**: editar/arquivar Campo de um contexto não afeta o outro (RN-054).

## Segurança / observabilidade / LGPD
- [ ] Sem bypass de RLS; sem `where orgId` manual (tudo por `withTenantContext`).
- [ ] Sem PII/segredo em log; payload sem `orgId` e sem `position` do Campo; mutação de config auditada.
- [ ] `label` como conteúdo não confiável — sem HTML na resposta; a Web escapa.

## Fase vermelha + mutação
- [ ] Vermelho real provado nas unidades de `option-config`.
- [ ] Mutações revertem o verde: id duplicado aceito · label no lugar do id · validação removida · chave extra aceita.

## Gates / escopo
- [ ] context7-check · security-check · observability-check · lgpd-check · performance-check.
- [ ] **migration-check N/A** (sem DDL) — registrado. Regressão de 2.1/2.2/2.3/2.4 proibida (suítes re-executadas).
- [ ] Suíte cheia verde · commit-check aprovado · PR contra `main` · CI verde · merge · closure.
