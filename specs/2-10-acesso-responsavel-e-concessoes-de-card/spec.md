# Spec — Story 2.10 (acesso, Responsável e concessões de Card)

> Rastreabilidade: FR-9/FR-11 (superfície de acesso); PRD D1.5 (Modelo de Permissões Efetivas §865-884), D5.1
> (Membership §1043-1057), D2.6 (Histórico §926-932); NFR-4; INV-ADMIN-01. AD-6/9/10/11/13. epics.md Story 2.10
> (§902-921). Dep.: 2.2 (PipeGrant), 2.9 (Kanban — em implementação paralela), **contrato de Membership do E8
> (inexistente)**.

## Objetivo
Permitir organizar a operação de Cards **sem ampliar acesso indevidamente**: atribuir um **Responsável** (atribuição
operacional, não papel) a quem já tem acesso operacional; conceder acesso **direto** a um Card específico
(**Observador** = leitura; **concessão operacional direta** = capacidades explícitas, limitada àquele Card); e
suportar o modificador **"restrito ao próprio"** do Membro do Pipe. Além disso, **definir o contrato** que o ciclo
de vida de Membership (Épico 8) consumirá (preflight de encerramento + evento pós-alteração), **sem** implementar E8.

## Escopo
- **Responsável:** atribuir/alterar/remover; exige acesso operacional prévio do alvo; não é papel; não concede acesso
  a outros Cards. Eventos no `CardHistory` (taxonomia nova além de `CREATED`).
- **Observador:** concessão direta de **leitura** de um Card; não edita, não move, não altera acesso/Responsável.
- **Concessão operacional direta:** limitada ao Card indicado; **capacidades explícitas**; sem lista/config/métricas
  do Pipe; `Mover Card` **só se concedido explicitamente** (dado de autorização — a operação é 2.14).
- **"Restrito ao próprio":** modificador de escopo do Membro do Pipe (não papel de Card): limita aos Cards onde é
  Responsável atual ou tem concessão direta válida; `creator` e histórico anterior **não** concedem acesso.
- **Resolução de acesso no nível do Card:** estender `pipe-authz` (DBT-AUTHZ-01, C3 congelado) para compor
  papel-de-Pipe + concessão-direta + "restrito ao próprio" + Responsável-atual, deny-by-default, 404 não-enumerante.
- **Contrato de Membership (E8):** preflight (bloquear encerramento quando um Card exige Responsável ativo) e handler
  pós-alteração (revogar concessões diretas; remover Responsável e sinalizar reatribuição; preservar `creator`; sem
  restauração automática). **Função-contrato pura e testável**, consumida por E8 depois.
- Isolamento pelo banco replicado nas tabelas novas (RLS ENABLE+FORCE, WITH CHECK, GRANT sem DELETE), auditoria.

## Fora de escopo
Movimentação e a operação `Mover Card` (2.14 — aqui só o **dado** da capacidade); ciclo de vida/estado do Card
(`ativo`/`finalizado`/`arquivado` — 2.11); papel **Comentador** (condicional, não oficializado); **distribuição de
Notificações** ao Observador (E5/OQ-33); **implementação** do ciclo de Membership (E8/D5.1); matriz completa de
capacidades por módulo (OQ-1/6/11/12) — usar só as capacidades que os ACs exigem.

## Decisões de modelo — EM ABERTO (escaladas, não decididas)
Três decisões precedem a implementação (detalhe e trade-offs em `plan.md`/`clarify.md`); os artefatos **registram
opções, sem decidir** (postura idêntica ao gate antiabuso da 2.8):
- **D-OA1 — mecanismo da concessão de Card:** nova tabela `CardGrant` org-scoped (recomendada, "normalizado")
  vs. reuso de `PipeGrant` (rejeitado) vs. JSON em `Card` (rejeitado). Inclui o **conjunto de capacidades** concedíveis.
- **D-OA2 — Responsável e GRANT de `Card`:** coluna `responsavelMembershipId` + **UPDATE escopado** em `Card`
  (primeiro UPDATE de Card, hoje "reservado à 2.14" na CLAUDE.md) vs. tabela `CardResponsavel` (mantém `Card`
  append-only). `creator` = actor do `CREATED` (2.7), sem coluna nova.
- **D-OA3 — contrato de Membership (E8):** materializar só a **função-contrato** agora (AD-11, recomendada) vs.
  adiar 2.10 até E8; **e** definir se existe na Fase 1 um "Card que exige Responsável ativo" (senão o preflight é
  vacuamente verdadeiro hoje).

## Invariantes preservados
`Card ≠ Registro`; **Responsável ≠ papel**; concessão direta **nunca** concede administração do Pipe nem acesso a
outros Cards (PRD §876); deny-by-default; `PERMISSÃO = AÇÃO + ESCOPO`; isolamento por Organização pelo banco;
C3/`ability.ts`/guard **congelados** (autorização fina no serviço); AD-11 (nada materializado só para o futuro).
