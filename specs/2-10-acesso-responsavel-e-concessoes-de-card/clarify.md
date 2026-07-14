# Clarify — Story 2.10

Dúvidas resolvidas pela hierarquia de artefatos (PRD D1.5/D5.1/D2.6, epics.md Story 2.10, AD-6/9/10/11/13). As que
**não** têm resposta autoritativa estão escaladas ao dono/Arquitetura como **D-OA1/2/3** — **não inventadas**.

## Resolvidas pelos artefatos

1. **Responsável é papel?** Não. É **atribuição operacional** do Card (PRD §869). As permissões de
   editar/mover/concluir seguem vindo do acesso efetivo ao Pipe/Card. Só pode recair sobre quem **já tem acesso
   operacional** ao Card (SC-2101).
2. **Atribuir Responsável concede acesso?** Não a outros Cards, e não amplia papel (SC-2102). Dá, no máximo, o
   acesso operacional ao **próprio** Card no contexto de "restrito ao próprio" (PRD §914) — nunca acesso implícito a
   outros recursos.
3. **Observador?** Concessão **direta de leitura** de um Card: visualiza; não edita/move; não altera acesso nem
   Responsável (PRD §870; SC-2103). Notificação ao Observador **não** entra aqui (E5/OQ-33).
4. **Concessão operacional direta — o que libera?** **Apenas aquele Card** (mesmo sem papel no Pipe): não abre a
   lista de outros Cards, nem config/métricas/administração do Pipe; mostra só nome do Pipe, Fase atual e navegação
   mínima (PRD §873; SC-2104). Capacidades são **explícitas**; `Mover Card` **só** quando concedido.
5. **"Restrito ao próprio"?** Modificador do **Membro do Pipe** (não papel de Card): limita aos Cards em que é
   **Responsável atual** ou tem **concessão direta válida**. **`creator` não** conta; **histórico anterior de
   responsabilidade não** conta (PRD §872/§914; SC-2105).
6. **`creator` precisa de coluna?** Não. É o **actor do evento `CREATED`** (2.7), já preservado e imutável. 2.10 só
   garante **não** usá-lo como fonte de acesso (SC-2105). Sobrevive a remoção de Membership por construção.
7. **Taxonomia de eventos?** 2.10 abre o `CardHistory` além de `CREATED` (PRD §928): atribuição/alteração/remoção de
   Responsável; concessão/revogação direta de acesso. Append-only, imutável (GRANT SELECT+INSERT — como 2.7).
8. **C3/CASL mudam?** Não. Autorização fina no serviço via `pipe-authz` (DBT-AUTHZ-01), como 2.3–2.8. 2.10 apenas
   **estende** a resolução ao nível do Card. Guarda grossa `@Requer('ler','Pipe')` intocada.
9. **Reativação restaura acesso/Responsável?** Não — sem restauração automática; permanecem revogados até nova ação
   explícita (SC-2108; PRD §1053).

## Escaladas ao dono/Arquitetura (SEM inventar resposta)

10. **D-OA1 — como a "concessão de card" é armazenada?** "Modelo normalizado, sem novos papéis de Card" (epics §908)
    aponta para **tabela** (`CardGrant`), mas não a fixa. Opções e trade-offs em `plan.md §D-OA1`. Inclui **qual
    conjunto de capacidades** é concedível (a matriz OQ-1 segue aberta; usar só `read`/`operar`/`moverCard`).
11. **D-OA2 — onde vive o Responsável e a que custo de GRANT?** Atribuir Responsável é mutação; `Card` hoje é
    SELECT/INSERT (append-only). Coluna + **UPDATE escopado** vs. tabela `CardResponsavel`. Ver `plan.md §D-OA2` e a
    **divergência** com a CLAUDE.md ("UPDATE de Card fica para 2.14") em `analyze.md`.
12. **D-OA3 — o contrato de Membership (E8) e "Card que exige Responsável ativo".** (a) E8 **não existe**: 2.10
    materializa só a função-contrato (AD-11) ou adia? (b) **Existe** na Fase 1 uma regra "Card exige Responsável
    ativo"? Se não, o preflight é hoje **vacuamente verdadeiro** (nunca bloqueia) — registrar sem inventar a regra.
    Ver `plan.md §D-OA3`.
13. **Quem atribui Responsável e quem concede/revoga acesso direto?** Não fixado explicitamente no PRD. **Proposta a
    validar:** conceder/revogar acesso direto = **gerenciar o Pipe** (`exigirGerenciarPipe`); atribuir Responsável
    entre quem já tem acesso = **operar o Pipe** (`exigirOperarPipe`). Confirmar contra a matriz (OQ-1).
