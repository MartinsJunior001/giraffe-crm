# Checklist — Story 2.10

Estado: **planejamento** (backlog). Itens `[ ]` = a cumprir na implementação, **após** as decisões em aberto.

## Bloqueantes (precedem a implementação)
- [ ] **D-OA1** resolvida e registrada — mecanismo da concessão de Card (`CardGrant` vs. alternativas) + conjunto de
      capacidades concedíveis (`read`/`operar`/`moverCard`).
- [ ] **D-OA2** resolvida e registrada — Responsável: coluna em `Card` + **UPDATE escopado** vs. tabela
      `CardResponsavel`; chave por `membershipId`.
- [ ] **D-OA3** resolvida e registrada — materializar só a função-contrato de Membership (E8) agora vs. adiar; e se
      existe na Fase 1 "Card que exige Responsável ativo" (senão preflight vacuamente verdadeiro).
- [ ] Autorização adjacente confirmada — quem atribui Responsável (`operar`) e quem concede/revoga acesso
      (`gerenciar`), contra a matriz (OQ-1).

## Acesso e autorização (fina, no serviço — C3 congelado)
- [ ] Resolução de **acesso no nível do Card** compõe papel-de-Pipe + concessão direta + "restrito ao próprio" +
      Responsável atual; deny-by-default; sem acesso → **404 não-enumerante**.
- [ ] `pipe-authz` estendido (`resolverAcessoNoCard`/`exigirLerCard`/`exigirOperarCard`); guard/`ability.ts`/CASL
      **intocados** (`git diff` vazio em `kernel/authz/`).
- [ ] `creator` e histórico anterior de responsabilidade **nunca** entram na resolução de acesso (SC-2105).

## Responsável
- [ ] Atribuir Responsável exige **acesso operacional prévio** do alvo; tentar sobre quem não tem → **bloqueado**
      (SC-2101), com **fase vermelha** provada.
- [ ] Atribuição **não** concede acesso a outros Cards nem amplia papel (SC-2102).
- [ ] Chave do Responsável é `membershipId` (elegibilidade por Membership); histórico via `CardHistory`.

## Concessões de Card
- [ ] Observador: **só leitura**; não edita/move; não altera acesso/Responsável (SC-2103).
- [ ] Concessão operacional direta: **só aquele Card**; sem lista/config/métricas do Pipe; `Mover Card` só se
      concedido explicitamente (SC-2104) — `moverCard` é **dado**, não operação (2.14 fora).
- [ ] "Restrito ao próprio" (flag no `PipeGrant`): limita ao Responsável atual / concessão direta válida; `creator`
      e histórico **não** contam (SC-2105).

## Contrato de Membership (E8) — função-contrato
- [ ] Preflight de encerramento informa **bloqueio até reatribuição** quando um Card exige Responsável ativo
      (vacuamente verdadeiro se a regra não existir na Fase 1) (SC-2106).
- [ ] Pós-alteração (suspensa/encerrada): concessões diretas **revogadas**, Responsável **removido** + Card
      **sinalizado**, `creator` **preservado** (SC-2107).
- [ ] Reativação/novo aceite **não** restauram automaticamente (SC-2108).

## Isolamento e fronteira (invariante-mãe)
- [ ] Tabelas novas: RLS ENABLE+FORCE, 4 policies por `current_org_id()`, WITH CHECK em INSERT/UPDATE (SC-2109).
- [ ] **GRANT como fronteira:** sem DELETE (revogar/remover = `state`); se D-OA2=A, **GRANT UPDATE de `Card`
      restrito a `responsavelMembershipId`** — teste provando que `phaseId`/outros permanecem negados.
- [ ] Toda query por `withTenantContext`; nenhuma rota aceita `orgId` do cliente; tabelas em `MODELOS_AUDITADOS`.

## Sem antecipar (AD-11)
- [ ] Sem movimentação/`Mover Card` (2.14), sem estado de Card (2.11), sem Comentador, sem Notificação ao Observador
      (E5), sem ciclo de Membership (E8). Nada materializado sem consumidor concreto.

## Gates
- [ ] typecheck/format/lint/build verdes; suíte contra PostgreSQL real; **fase vermelha** de cada portão provada;
      pre-implementation-check + security-check + (RLS) migration-check; commit-check antes do commit.
