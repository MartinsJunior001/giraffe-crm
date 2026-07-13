# Spec — Story 1.6: Substrato de autorização efetiva

> Compacto (risco CRITICAL, superfície pequena e transversal). Fonte de intenção:
> `_bmad-output/implementation-artifacts/1-6-substrato-de-autorizacao-efetiva.md`.
> Governado por `.specify/memory/constitution.md`.

## Contexto

O kernel já isola **dados** por Organização (RLS, Story 1.2), propaga o **contexto de Organização** por
transação (Story 1.3) e resolve **identidade real** por sessão (Story 1.4/1.5). O `MembershipRole` e o
`MembershipState` existem no schema desde a 1.2 mas **não governam acesso nenhum**. Esta Story introduz a
camada de **autorização** (`AuthZ`) do kernel com **CASL**, tornando o papel efetivo da Membership o
limite do que cada principal pode fazer **dentro da Organização resolvida** — deny-by-default. Não há
migration: o dado (papel/estado) já existe; o que falta é o **mecanismo** que o aplica.

## Requisitos funcionais

- **FR-601** — O kernel expõe um contrato de autorização (`action + subject + conditions`) construído
  com CASL, cuja checagem é **deny-by-default**: subject sem regra explícita ⇒ **negado**. (AC1)
- **FR-602** — A ability é construída **para a Organização resolvida** (contexto da 1.3, transaction-local);
  um principal com Membership em várias Organizações recebe abilities **só** da Organização ativa, **sem
  herança** de outra. (AC2)
- **FR-603** — Membership **não-ativa** (`SUSPENDED`/`REMOVED`) produz ability **vazia** na Organização:
  nega tudo. (AC2, deny-by-default)
- **FR-604** — O papel de **Plataforma (Super Admin) não concede, por si só, nenhuma ability** dentro de
  uma Organização: não existe caminho onde papel de Plataforma injete abilities de Organização
  (INV-ADMIN-01(c)). (AC3)
- **FR-605** — Um **ponto de aplicação** (guard/decorator NestJS) exige ability para a ação e responde
  **403** quando não há regra correspondente; a checagem ocorre **sempre** dentro de contexto de
  Organização resolvido (herda a garantia da 1.3). (AC1, AC2)
- **FR-606** — Permissão **nunca** é embutida em cookie/token de sessão; é sempre **derivada** do
  Membership no momento da checagem (sem permissão duradoura — AD-9). (AC4)
- **FR-607** — Existe um **mecanismo de invalidação de abilities em cache** por `(accountId, orgId)`,
  exposto como **contrato** para o Épico 8 disparar ao mudar papel/Membership; após invalidação, a
  próxima checagem reflete o novo papel **imediatamente**, sem janela de cache obsoleto. (AC4)
- **FR-608** — A **negação** é observável (log estruturado) mas **sanitizada**: não revela o recurso
  (INV-REPORT-01) nem PII. (transversal)

## Critérios de sucesso (verificáveis)

- **SC-601** — Teste prova que um subject sem regra explícita é **negado**; a **fase vermelha** é
  comprovada (quebrar o deny-by-default e ver o teste falhar). (FR-601 / AC1)
- **SC-602** — Teste (PostgreSQL real) prova que papel na **Org C** não alcança recurso da **Org A**
  (sem herança cross-tenant). (FR-602 / AC2)
- **SC-603** — Teste prova que Membership `SUSPENDED`/`REMOVED` → ability vazia (nega). (FR-603)
- **SC-604** — Teste prova que principal de Plataforma (ou sem Membership ativa) **não** recebe acesso
  automático a dados de Organização. (FR-604 / AC3)
- **SC-605** — Teste de integração prova **403** em ação sem ability e **permissão** em ação com ability,
  ambos dentro de contexto de Org. (FR-605)
- **SC-606** — Teste prova que, após invalidação, a próxima checagem reflete o novo papel sem janela
  obsoleta; **mutação** desligando a invalidação deixa o teste **vermelho**. (FR-607 / AC4)
- **SC-607** — Teste prova que nenhuma permissão viaja no cookie/token de sessão (permissão derivada do
  banco). (FR-606)
- **SC-608** — Log de negação não contém identificador do recurso nem PII. (FR-608)

## Fora de escopo (Constitution II)

Matrizes de permissão por módulo; papéis de Pipe/Card/Database; gestão de membros e mudança de papel real
(Épico 8 — aqui só o **contrato de invalidação**); step-up por ação (Produto+Segurança); qualquer acesso
do Super Admin da Plataforma a dados de Organização (decisão separada e pendente). Nenhuma migration.

## Invariantes que esta Story materializa

`deny-by-default` · `PERMISSÃO = AÇÃO + ESCOPO` · isolamento por Organização (AD-6) estendido de dados
para **ações** · `Super Admin (Plataforma) ≠ Admin da Organização` (INV-ADMIN-01) · sem permissão
duradoura em token (AD-9).
