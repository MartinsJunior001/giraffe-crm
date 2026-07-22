# analyze — Story 8.6 (consistência cross-artefato)

Análise não-destrutiva entre spec ↔ plan ↔ tasks ↔ epics ↔ código.

## Cobertura dos ACs (epics.md §695–698)
- AC1 (preflight bloqueia → não conclui, sem alteração parcial, auditável) — coberto: `PREFLIGHT_BLOQUEADO`
  409 dentro da tx; hoje vacuamente verdadeiro (DIV-3), forma do contrato preservada.
- AC2 (Admin remove com step-up → acesso encerrado, histórico preservado, concessões revogadas
  atomicamente, evento com Admin como ator, Account não excluída) — coberto: `remover` +
  `aoAlterarMembership` + evento `REMOVED` (`saidaVoluntaria=false`, `actorId=admin`) + REVOKE DELETE.
- AC3 (saída voluntária com step-up/mesmo preflight → só a Membership escolhida encerrada,
  `activeOrganizationId` limpo, demais preservadas, evento com o próprio como ator) — coberto: `sair` +
  limpeza de sessão + isolamento de outras Orgs + evento `saidaVoluntaria=true`.
- AC4 (último Admin protegido nos dois fluxos; reingresso não restaura papéis/concessões/atribuições;
  evento pós-alteração) — coberto: `planejarRemocao`/lock+recount (409) + não-restauração por construção
  (contrato + `state=REMOVED` terminal, reingresso via 8.3).

## Consistência de invariantes
- `Super Admin ≠ Admin da Org`, `Usuário ≠ Organização`, deny-by-default, isolamento por Org — preservados.
- `Fase ≠ Status` etc. não aplicáveis (domínio de Membership).

## Divergências registradas (não bloqueiam)
- **DIV-3** (preflight vacuamente verdadeiro): a regra "Card exige Responsável ativo" não existe na Fase 1;
  não inventada. Forma do contrato mantida.
- **DEB-8-5-PIPE-DB-GRANT-REVOKE**: prosa do épico menciona "revoga concessões/acessos"; o contrato
  materializado revoga só `CardGrant`/`CardResponsavel`. Deny-by-default cobre o resto. Herdado da 8.5,
  não reaberto.
- **DEB-MEMBERSHIP-EVENT-CASCADE**: endereçado nesta Story (REVOKE DELETE + prova).

## Débitos novos
- **DEB-8-6-REASSIGN-ORPHANS** (planejamento): `aoAlterarMembership` sinaliza `reatribuir` (Cards órfãos de
  Responsável), mas a reatribuição efetiva é de E2/E5 (fora do escopo, epics.md explícito). Sinalização
  presente no payload do evento; consumidor futuro.

## Lacunas de gate
- Nenhuma material. Execução real (lint/typecheck/test/build) anexada ao PR (risco ALTO).
