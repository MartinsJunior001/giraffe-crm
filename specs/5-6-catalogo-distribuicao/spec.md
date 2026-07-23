# Spec — Story 5.6: Catálogo e distribuição de Notificações in-app

- **Épico:** 5 (Tarefas, Solicitações, Notificações) · **Story:** 5.6 · **Risco:** ALTO
- **Rastreabilidade:** FR-30; D6.3; RN-080..085; NFR-19/20/22; INV-NOTIF-01. **Consome:** eventos de Card (2.16),
  papéis de Card (2.10), contrato de Membership, preferências (5.4), fonte única (5.3), acesso (5.4).
- **Gate:** OQ-33 fechado — ver `decision-oq-33.md`.

## Objetivo

Definir o **catálogo aprovado** de tipos de Notificação (código, sem tabela) e a **distribuição** por evento,
usando a **fonte única** (5.3) — sem mecanismo paralelo. Avisar as pessoas certas por evento, com acesso e
preferências ATUAIS, deduplicando por pessoa, com resultado sempre explícito.

## Requisitos (epics §1624-1637)

1. **Catálogo canônico** de tipos, na mesma fonte de 5.3. Cada tipo declara: estratégia de destinatários; regra
   do ator; padrão de preferência + obrigatoriedade (fecha DEB-5.4-TIPO-OBRIGATORIO).
2. **Tipos implementados por E5:** designação/alteração de Responsável (Tarefa/Solicitação/Card); Tarefa atrasada;
   movimentação de Card causada por Automação (capacidade; trigger de motor deferido — ver decisão).
3. **Slots registrados por outros Épicos:** E6 (IA aguardando aprovação); E8 (convite aceito) — sem implementar.
4. **Distribuição:** só Memberships **ATIVAS**; destinatário precisa de **acesso ATUAL** ao recurso (reusa 5.4);
   mesma pessoa por múltiplos papéis → **UMA** Notificação (idempotente, `dedupeKey` da 5.3);
   origem/tipo/destinatário/referência rastreáveis; **preferências aplicadas ANTES da entrega**; ausência de
   destinatário → **resultado explícito** (não falha silenciosa); ator excluído/incluído por regra do tipo;
   ninguém fora da Organização recebe.

## Critérios de aceite

- **AC1 (§1634):** evento do catálogo dispara Notificação → usa a fonte 5.3, resolve só Memberships ativas com
  acesso atual, aplica preferências antes da entrega, entrega **uma** Notificação por pessoa (idempotente) mesmo
  com múltiplos papéis.
- **AC2 (§1635):** E6/E8 registram seus tipos no **mesmo** catálogo/fonte, sem mecanismo paralelo (slots).
- **AC3 (§1636):** ausência de destinatário válido → **resultado explícito** (não falha silenciosa); ninguém fora
  da Organização recebe.
- **AC4 (§1637):** lido/não-lido é por destinatário (5.3) e coerente nas superfícies (5.4).

## Fora do escopo

- Implementação dos tipos de E6/E8 (registrados por eles). Ações de Automação (5.7). Trigger de motor do
  `CARD_MOVED_BY_AUTOMATION` (5.7 — integração com E4).

## Não-funcionais

- Sem migration/GRANT novo (catálogo é código; escrita pela fonte 5.3). C3 congelado. Isolamento por RLS
  (`withTenantContext`); `orgId` nunca do cliente. Distribuição best-effort pós-commit (não derruba a mutação).
</content>
