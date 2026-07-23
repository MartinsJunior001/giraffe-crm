# Checklist de risco — Story 5.1 (RISCO ALTO: migration + entidade + RLS + autz + mecanismo temporal + E8)

## Isolamento multi-tenant (invariante-mãe)
- [x] RLS ENABLE **e** FORCE nas 3 tabelas (Task/TaskHistory/TaskOverdueOccurrence).
- [x] WITH CHECK no INSERT **e** no UPDATE (impede inserir/mover para Org alheia). Provado (fase vermelha) em `tasks-rls`.
- [x] Toda query por `withTenantContext`/`definirContextoOrg`; nenhum `where orgId` manual no domínio Task.
- [x] `orgId` fora do payload/resposta; nunca aceito do cliente (DTO não o expõe; testes conferem ausência de ORG_A).
- [x] FK COMPOSTA tenant-safe `(orgId,pipeId)→Pipe` e `(orgId,cardId)→Card` (pipeId/cardId alheio → violação de FK, provado).

## GRANT como fronteira de segurança
- [x] `Task`: SELECT/INSERT + UPDATE column-scoped (sem `orgId`/`pipeId`/`creatorMembershipId`), **sem DELETE**. Provado.
- [x] `TaskHistory`/`TaskOverdueOccurrence`: só SELECT/INSERT (append-only). UPDATE/DELETE → permission denied. Provado.
- [x] Teste que prova o escopo de cada GRANT escrito (`tasks-rls`).

## Autorização (deny-by-default, matriz canônica 1.6, C3 congelado)
- [x] Mutar exige `exigirOperarPipe`; ler exige `resolverPoderNoPipe`. Sem acesso → 404 não-enumerante; Viewer → 403.
- [x] Não toca `ability.ts`/guard (C3 congelado); guarda grossa `@Requer('ler','Pipe')`.
- [x] Vínculo com Card NÃO amplia (Card do mesmo Pipe; leitura não expõe `valores` do Card).
- [x] Cross-tenant (Carla/Org B) → 404. Provado.

## Estado derivado / sem exclusão / append-only
- [x] `atrasada` DERIVADO na leitura, nunca persistido (núcleo puro; espelha 2.13).
- [x] Sem exclusão: arquivar/concluir = state; sem rota nem GRANT de DELETE.
- [x] Histórico append-only; evento na mesma tx de cada mutação (AD-13).

## Mecanismo temporal (gate §1535)
- [x] Ocorrência canônica idempotente por `(orgId,taskId,dueVersion)`; retry/atraso não duplica (P2002/ON CONFLICT).
- [x] Alterar prazo bumpa `dueVersion` (nova ocorrência possível); concluir/arquivar antes impede. Provado.
- [x] Não persiste `atrasada`; não registra no motor E4 (5.7) nem cria Notificação (5.3+).
- [x] Zero-dependência (padrão Postgres 4.6); driver contínuo deferido (`DEB-5-1-OVERDUE-DRIVER`).
- [x] Timezone determinístico (`@db.Timestamptz`, instante absoluto).

## Responsável / reatribuição E8
- [x] Só Membership ACTIVE (assign-time, sob RLS); read-time expõe `responsavelValido`; nunca `Account` global.
- [x] Suspensão/remoção esvazia `responsavelMembershipId` na mesma tx (contrato E8). Provado (`membership-removal-http`).
- [x] Autoria (`creatorMembershipId`) preservada (fora do GRANT de UPDATE).

## Migration
- [x] Versionada; aplicada por `db:migrate`; rollback `.down.sql` presente e drill verde (down + re-apply).
- [x] Índice único aditivo em Card (redundante, zero mudança de dado).

## Gates de qualidade
- [x] prettier --check, eslint, typecheck (src+test), build — verdes.
- [x] `pnpm test` (PG real) das áreas afetadas — verdes (82/82 no sweep focado).
- [ ] Suíte completa serial (regressão) — em execução; anexar evidência ao PR.
