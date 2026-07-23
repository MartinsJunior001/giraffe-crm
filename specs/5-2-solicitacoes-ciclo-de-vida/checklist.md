# Checklist — Story 5.2

## Isolamento (invariante-mãe)
- [x] `Solicitacao`/`SolicitacaoHistory` com RLS ENABLE+FORCE.
- [x] WITH CHECK no INSERT e no UPDATE.
- [x] Toda query por `withTenantContext` (nenhum `where orgId` manual).
- [x] `orgId` fora do payload/resposta; nunca aceito do cliente.
- [x] Ambas em `MODELOS_AUDITADOS`.
- [x] Fase vermelha provada (WITH CHECK/GRANT quebrados → teste falha).

## GRANT (fronteira)
- [x] `Solicitacao`: SELECT/INSERT + UPDATE column-scoped; sem `orgId`/`pipeId`/`creatorMembershipId`.
- [x] `Solicitacao`: sem DELETE (arquivar/resolver = state).
- [x] `SolicitacaoHistory`: só SELECT/INSERT (append-only).
- [x] Teste prova cada escopo de GRANT.

## FK tenant-safe
- [x] `(orgId,pipeId)→Pipe`, `(orgId,cardId)→Card`, `(orgId,solicitacaoId)→Solicitacao` compostas.
- [x] Responsável/creator = referência-por-id revalidada sob RLS (sem FK a Membership).

## Autorização (deny-by-default; C3 congelado)
- [x] Mutar = `exigirOperarPipe`; ler = `resolverPoderNoPipe`.
- [x] 404 não-enumerante sem acesso; 403 ao mutar como Viewer.
- [x] Vínculo com Card não amplia permissão.
- [x] `ability.ts`/guard não tocados.

## Ciclo de vida
- [x] `ABERTA`/`RESOLVIDA` + `ATIVA`/`ARQUIVADA` (eixos independentes).
- [x] Transições idempotentes; no-op não emite `updateMany`.
- [x] Guarda otimista → 409; P2002/P2028 → 409, nunca 500.
- [x] Arquivada bloqueia escrita (409 `SOLICITACAO_ARQUIVADA`); leitura preservada.
- [x] Cada mutação escreve evento no Histórico na mesma tx.

## Responsável
- [x] 0..1 opcional; assign só Membership ACTIVE (decisão registrada).
- [x] Reatribuição E8 esvazia na mesma tx; testes E8 existentes verdes.
- [x] `responsavelValido` recomputado na leitura.

## Anexos (não deferidos — lição da 5.1)
- [x] Branch `SOLICITACAO` no `file-authz.dispatcher`.
- [x] Branch `SOLICITACAO` no `file-event.dispatcher` (→ SolicitacaoHistory).
- [x] Rota `solicitacoes/:id/files`.
- [x] Read-only sob arquivamento (409); gate AD-28 (503).

## Sem antecipar escopo
- [x] Sem Notificações (5.3+); sem registro no motor (5.7); sem mecanismo temporal.
