# Story 2.10: Acesso, Responsável e concessões de Card

Status: backlog — story context BMAD preparada (artefatos de planejamento). **NÃO implementada.**
Precede a implementação: **3 decisões de dono/Arquitetura em aberto** (ver "⛔ Decisões em aberto"), sem as quais
a implementação NÃO deve prosseguir. Sequenciamento sensível: depende de 2.9 (em implementação paralela) e de um
**contrato de Membership do Épico 8 ainda inexistente**.

## Story

As a usuário autorizado,
I want atribuir Responsável e conceder acesso a Cards específicos,
so that eu organize a operação sem ampliar acesso indevidamente.

## Contexto e princípios herdados

- **Modelo autoritativo:** PRD D1.5 (Modelo de Permissões Efetivas — Acesso, atribuições e concessões de Card,
  §867-876) + epics.md Story 2.10 (§902-921). O modelo é **normalizado, sem novos papéis de Card** (epics §908):
  Responsável e Observador/concessão direta são **atribuição** e **concessão**, não papéis novos.
- **Autorização fina no serviço (DBT-AUTHZ-01):** reusar o padrão de `pipes/pipe-authz.ts`
  (`resolverPoderNoPipe`/`exigirGerenciarPipe`/`exigirOperarPipe`), **sem** tocar o guard/`ability.ts`/CASL
  (C3 congelado), como fizeram 2.3–2.8. 2.10 é a primeira Story a resolver poder **no nível do Card** (não só do
  Pipe) — a resolução de "acesso ao Card" compõe: papel de Pipe (2.2) + concessão direta de Card + modificador
  "restrito ao próprio" + Responsável atual.
- **Isolamento pelo banco (invariante-mãe):** toda tabela organizacional nova replica ENABLE+FORCE RLS, 4 policies
  por `orgId = current_org_id()`, WITH CHECK em INSERT **e** UPDATE, e **GRANT como fronteira** (sem DELETE onde a
  operação preserva o dado). Queries só por `withTenantContext`. Auditoria em `MODELOS_AUDITADOS`.
- **Sem antecipar escopo (AD-11):** 2.10 é **acesso/Responsável/concessões**. NÃO implementa movimentação (2.14),
  nem o ciclo de vida/estado do Card (2.11), nem o papel Comentador (condicional). Nada de trava materializada sem
  consumidor concreto.
- **CardHistory (2.7) é reusado, não recriado:** 2.10 abre a **taxonomia** de eventos além de `CREATED`
  (atribuição/alteração/remoção de Responsável; concessão/revogação direta de acesso — PRD §928). Append-only e
  imutável (GRANT SELECT+INSERT), como já estabelecido.

## Acceptance Criteria

Derivados de epics.md §916-921 e PRD §867-876. Prefixo **SC-210x** (epic 2, story 10, critério x).

1. **SC-2101 — Responsável exige acesso operacional prévio.** Tentar tornar Responsável um usuário **sem acesso
   operacional** ao Card é **bloqueado** — Responsável só entre quem já opera o Card (papel de Pipe operante,
   concessão operacional direta, ou Admin). [epics §917; PRD §869]
2. **SC-2102 — Responsável é atribuição operacional, não papel de permissão.** Atribuir Responsável **não** concede,
   por si, acesso a outros Cards, nem amplia o papel; as permissões de editar/mover/concluir continuam vindo do
   acesso efetivo ao Pipe/Card. [epics §909; PRD §869]
3. **SC-2103 — Observador = concessão direta de leitura.** O Observador **visualiza** o Card; **não** edita, **não**
   move, **não** altera acesso nem Responsável; e (nesta Story) **não** recebe Notificações automaticamente
   (distribuição depende de E5/OQ-33 — fora daqui). [epics §910; PRD §870]
4. **SC-2104 — Concessão operacional direta limitada ao Card.** Uma concessão operacional direta dá acesso **apenas
   àquele Card**, mesmo sem papel no Pipe: **não** libera a lista de outros Cards, **nem** configuração, métricas ou
   administração do Pipe (mostra só nome do Pipe, Fase atual e contexto mínimo de navegação). `Mover Card` **só
   existe quando concedido explicitamente**. [epics §911, §918; PRD §873]
5. **SC-2105 — "Restrito ao próprio" (modificador do Membro do Pipe).** Quando aplicado a um Membro do Pipe, limita
   o acesso operacional aos Cards em que ele é **Responsável atual** ou possui **concessão operacional direta
   válida**. **`creator` não concede acesso**; **histórico anterior de responsabilidade não concede acesso**.
   [epics §912, §920; PRD §872, §914]
6. **SC-2106 — Contrato de Membership: preflight de encerramento.** Quando se consulta o preflight de encerramento
   de uma Membership que é Responsável de um Card que **exige Responsável ativo**, o preflight **informa bloqueio
   até reatribuição**. (2.10 **define e materializa o contrato**; o **acionamento** pelo fluxo de Membership é do
   Épico 8 — ver Decisão em aberto 3.) [epics §913, §919; PRD §1053]
7. **SC-2107 — Contrato de Membership: evento pós-alteração.** Ao ser a Membership **suspensa/encerrada**: as
   **concessões diretas são revogadas**; o **Responsável é removido quando aplicável** e o **Card é sinalizado para
   reatribuição**; **`creator` é preservado** (metadado de proveniência). [epics §913, §919; PRD §1053]
8. **SC-2108 — Sem restauração automática.** Reativação/novo aceite da Membership **não restauram automaticamente**
   Responsável nem concessões diretas; permanecem revogados até nova ação explícita. [epics §913, §920]
9. **SC-2109 — Isolamento e fronteira.** Toda tabela organizacional nova de 2.10 replica RLS ENABLE+FORCE + 4
   policies + WITH CHECK; **GRANT como fronteira** (sem DELETE onde revogar/remover é mudança de estado); queries
   só por `withTenantContext`; auditoria em `MODELOS_AUDITADOS`; C3/`ability.ts`/guard **intocados** (autorização
   fina no serviço via `pipe-authz`). [CLAUDE.md invariante-mãe; DBT-AUTHZ-01; AD-6/9/10]

## Não-objetivos (fora de escopo — não antecipar)

- **Movimentação do Card e a ação `Mover Card` em si** (2.14): 2.10 apenas **modela** a capacidade `moverCard` numa
  concessão direta (dado de autorização); **quem move e como** é 2.14. Não conceder GRANT nem rota de movimentação.
- **Ciclo de vida/estado do Card** (`ativo`/`finalizado`/`arquivado` — 2.11): "exige Responsável ativo" e "Card
  ativo" referenciam um estado que **ainda não existe** — ver Decisão em aberto 3 sobre como expressar isso sem
  antecipar 2.11.
- **Papel Comentador** — condicional à aprovação da funcionalidade de comentários (PRD §871, §884); **não
  oficializado**. Fora.
- **Distribuição de Notificações ao Observador** — depende de E5/OQ-33 (epics §914). O Observador é concedido, mas
  **não** há entrega de Notificação nesta Story.
- **Implementação do ciclo de vida de Membership** (convite/suspensão/encerramento/reativação — Épico 8/D5.1):
  2.10 **consome um contrato**, não implementa E8.
- **Matriz completa de capacidades por módulo** (OQ-1/6/11/12): fora; usar apenas as capacidades que os ACs exigem.

## ⛔ Decisões em aberto — ESCALADAS ao dono/Arquitetura (precedem a implementação)

> As três decisões abaixo determinam o modelo de dados e a fronteira de segurança. Os artefatos as **registram com
> opções e trade-offs, sem decidir** (mesma postura do gate antiabuso da 2.8). A implementação **não deve
> prosseguir** sem elas.

### D-OA1 — Mecanismo da "concessão de card" (Observador + concessão operacional direta)
O epics diz "modelo **normalizado**, **sem novos papéis de Card**" (§908), mas não fixa a estrutura. Opções:
- **(A) Nova tabela `CardGrant` org-scoped** (análoga a `PipeGrant`): `(orgId, cardId, membershipId, capacidades…,
  state)`. "Normalizado" favorece tabela; RLS+FORCE+WITH CHECK, GRANT sem DELETE (revogar = `state`/`revokedAt`).
  Capacidades explícitas por concessão (ex.: `read` para Observador; `operar`+`moverCard` para operacional direta).
  *Trade-off:* nova tabela + migração + testes de RLS; mais claro e consultável; casa com "capacidades
  explicitamente concedidas conforme a matriz".
- **(B) Reuso de `PipeGrant`** com escopo de Card — **descartável de saída**: `PipeGrant` é por Pipe; forçar Card
  nele quebra a semântica e o índice parcial "um papel ativo por (pipe, pessoa)". Registrado como rejeitado.
- **(C) Capacidade/JSON em `Card`** — viola "normalizado" e AD-11 (dado de acesso embutido no recurso). Rejeitado.
**Recomendação a validar:** (A). **Decisão do dono/Arquitetura necessária** — inclui o **conjunto de capacidades**
concedíveis (a matriz — OQ-1 permanece aberta; usar só `read`, `operar`, `moverCard` que os ACs exigem).

### D-OA2 — Onde vive o "Responsável" e o custo de GRANT em `Card`
Responsável é **atribuição única atual** por Card (PRD §869) com **histórico** (PRD §928; "histórico anterior de
responsabilidade não concede acesso" — SC-2105). Hoje `Card` tem GRANT **só SELECT/INSERT** (append-only até 2.14).
Atribuir Responsável é uma mutação. Opções:
- **(A) Coluna `responsavelMembershipId` (nullable) em `Card` + GRANT UPDATE escopado**, com o histórico nos eventos
  `CardHistory`. *Trade-off:* introduz o **primeiro GRANT de UPDATE em `Card`** — a CLAUDE.md hoje diz que UPDATE de
  Card "fica para 2.14"; 2.10 seria o primeiro consumidor de um UPDATE **restrito a `responsavelMembershipId`**
  (não a `phaseId`, que é 2.14). Exige teste que prove o escopo do GRANT (não abrir UPDATE de Fase).
- **(B) Tabela dedicada `CardResponsavel`** (atribuição corrente + trilha), mantendo `Card` append-only. *Trade-off:*
  mais tabelas; preserva a fronteira "Card não sofre UPDATE até 2.14"; alinha com "modelo normalizado".
`creator` **não precisa de coluna nova**: é o `actorId` do evento `CREATED` (2.7), já preservado e imutável; 2.10
só garante **não consultá-lo para acesso** (SC-2105). **Nota de dado:** `CardHistory.actorId` guarda **accountId**
(2.7), mas Responsável/elegibilidade é por **Membership** (PRD §1065) — a chave do Responsável deve ser
`membershipId`. **Decisão do dono/Arquitetura necessária** entre (A) e (B), pelo impacto no GRANT/fronteira de `Card`.

### D-OA3 — Materialização do contrato de Membership (E8) e a noção de "Card que exige Responsável ativo"
epics §914 gatilha: "mecanismo do preflight/evento de Membership = **Arquitetura**". Dois pontos:
- **Sequência:** o Épico 8 (Membership: suspender/encerrar/reativar) **não existe** — não há chamador do preflight
  nem emissor do evento pós-alteração. AD-11 proíbe materializar relação/trava **só para preparar o futuro**. Logo:
  2.10 **define o contrato** (assinatura pura + testes), mas **quem o materializa/aciona** precisa de decisão:
  **(A)** 2.10 entrega só a **função-contrato** (pura, testável, sem chamador) e a documentação para E8 consumir —
  coerente com AD-11 e com como 2.7 deixou "travas de arquivamento como contrato futuro"; **(B)** adiar 2.10 até E8
  existir (reordenar sprint). **Recomendação a validar:** (A).
- **"Exige Responsável ativo":** qual Card **exige** Responsável? O PRD §1053 fala em "quando uma regra exigir
  responsável ativo". Essa **regra** não está definida na Fase 1 para Card (existe para Tarefa/Solicitação, D5.2).
  Escalar: **existe um Card que exige Responsável na Fase 1?** Se **não**, o preflight de 2.10 é um contrato
  **vacuamente verdadeiro** hoje (nunca bloqueia), a ser ativado quando a regra existir — registrar como tal, sem
  inventar a regra. **Decisão do dono necessária.**

Ponto de autorização adjacente (design, não bloqueia mas registrar em `plan`): **quem** atribui Responsável e
**quem** concede/revoga acesso direto ao Card? Proposta de reuso: **gerenciar o Pipe** (`exigirGerenciarPipe`) para
conceder/revogar acesso direto; **operar o Pipe** (`exigirOperarPipe`) para atribuir Responsável entre quem já tem
acesso — a confirmar contra a matriz (OQ-1).

## Tasks / Subtasks (após as decisões em aberto)

- [ ] **D-OA1/D-OA2/D-OA3 resolvidas e registradas** (dono/Arquitetura) — modelo de `CardGrant`/Responsável e
      materialização do contrato de Membership. *Bloqueante.*
- [ ] Modelo de dados conforme D-OA1/D-OA2 (`CardGrant` e/ou `CardResponsavel`/coluna em `Card`); flag
      `restritoAoProprio` no `PipeGrant` (modificador do Membro — D-OA análogo a `reviewPublicSubmissions`).
- [ ] Migration `..._card_access`: RLS ENABLE+FORCE + 4 policies + WITH CHECK nas tabelas novas; GRANT mínimo (sem
      DELETE — revogar/remover é `state`); FKs org/card/membership CASCADE; novas tabelas em `MODELOS_AUDITADOS`;
      se D-OA2=(A), GRANT UPDATE em `Card` **restrito** (teste provando que não abre outros campos).
- [ ] `pipe-authz` (estender, C3 congelado): resolução de **acesso ao Card** (compõe papel de Pipe + concessão
      direta + "restrito ao próprio" + Responsável atual). Novos helpers finos: `resolverAcessoNoCard`,
      `exigirOperarCard`/`exigirLerCard` — irmãos de `exigirOperarPipe`. Deny-by-default; 404 não-enumerante.
- [ ] Serviço de Responsável: atribuir/alterar/remover, exigindo acesso operacional prévio do alvo (SC-2101);
      eventos `CardHistory` (taxonomia nova); atribuição não amplia acesso (SC-2102).
- [ ] Serviço de concessão de Card: conceder Observador (leitura) e concessão operacional direta (capacidades
      explícitas, `moverCard` opt-in); revogar (state). Limites do escopo (SC-2103/2104).
- [ ] Contrato de Membership (D-OA3): função-contrato de **preflight** (bloqueia encerramento se Card exige
      Responsável ativo) + **handler pós-alteração** (revoga concessões diretas, remove Responsável/sinaliza,
      preserva `creator`; sem restauração automática) — puros/testáveis, consumo por E8.
- [ ] Testes reais (PostgreSQL): authz de Card (`resolver…-authz`), Responsável (exige acesso prévio; não amplia),
      concessão direta (só o Card; sem lista/config; `moverCard` opt-in), "restrito ao próprio" (Responsável/direta
      sim; creator/histórico não), contrato de Membership (preflight bloqueia; pós-alteração revoga/remove/preserva;
      sem restauração), RLS (isolamento, WITH CHECK, sem DELETE), e — se D-OA2=(A) — **escopo do GRANT UPDATE de
      Card**. Provar a **fase vermelha** de cada portão.

## Dev Notes

- **Reuso, não novo sistema:** a autorização fina segue `pipe-authz` (DBT-AUTHZ-01). 2.10 **estende** a resolução do
  poder do nível do Pipe para o nível do Card, sem tocar CASL/guard (C3 congelado) — exatamente como 2.8 adicionou
  uma **capacidade** (`reviewPublicSubmissions`) sem criar papel.
- **`creator` = actor do `CREATED`** (2.7), não coluna nova; imutável e preservado por construção. 2.10 só precisa
  **não** consultá-lo para acesso (SC-2105).
- **Nunca antecipar 2.14/2.11:** `moverCard` é **dado de autorização** (uma capacidade concedível), não a operação;
  "Card ativo/exige Responsável" depende do estado que só 2.11 materializa — ver D-OA3.
- **LGPD/auditoria:** concessão/revogação e (des)atribuição de Responsável entram na trilha (`CardHistory` de
  negócio + `MODELOS_AUDITADOS` para as tabelas de acesso). Sem PII desnecessária em log.

### Project Structure Notes

- Provável novo subdomínio `apps/api/src/pipes/cards/access/` (ou `pipes/card-access/`), coerente com `grants/`,
  `phases/`, `forms/`, `cards/`, `public-submissions/`. Helpers de authz de Card em `pipe-authz.ts` (mesmo arquivo,
  para não duplicar a resolução) ou um `card-authz.ts` irmão — decidir em `plan`.
- Autorização fina no serviço; **nenhuma** rota aceita `orgId` do cliente; toda query por `withTenantContext`.

### References

- [Source: epics.md#Story 2.10 §902-921]
- [Source: prd.md#D1.5 Modelo de Permissões Efetivas §865-884; #D5.1 Membership §1043-1057; #D2.6 Histórico §926-932]
- [Source: ARCHITECTURE-SPINE.md#AD-6 (RLS sem bypass), AD-9 (CASL+tenancy), AD-10 (org-owned), AD-11 (sem
  materialização especulativa), AD-13 (mutação por eventos), INV-ADMIN-01]
- [Source: apps/api/src/pipes/pipe-authz.ts — resolução fina reusável; grants/ (PipeGrant); cards/ (Card 2.7)]
- [Source: implementation-artifacts/2-8-…md — padrão de capacidade em grant + gate escalado ao dono]

## Dev Agent Record

### Agent Model Used
claude-opus-4-8

### Completion Notes List
- Story context + sequência Spec Kit criadas (planejamento). **Modelo de dados e fronteira dependem de 3 decisões
  em aberto** (D-OA1 mecanismo de concessão; D-OA2 Responsável/GRANT de Card; D-OA3 contrato de Membership E8 +
  regra "exige Responsável ativo") — **escaladas ao dono/Arquitetura, não inventadas**.
- **Divergências registradas** (ver `analyze.md`): (1) `Card` UPDATE — a CLAUDE.md diz "fica para 2.14", mas
  atribuir Responsável (D-OA2=A) exigiria um UPDATE **escopado** já em 2.10; (2) dependência para frente em E8
  (inexistente) e possível preflight vacuamente verdadeiro por ausência da regra "Card exige Responsável" na Fase 1;
  (3) `CardHistory.actorId` = accountId, mas Responsável é por Membership.

### File List (planejamento — nenhum código)
- `_bmad-output/implementation-artifacts/2-10-acesso-responsavel-e-concessoes-de-card.md` (este arquivo)
- `specs/2-10-acesso-responsavel-e-concessoes-de-card/{spec,plan,clarify,checklist,tasks,analyze}.md`
