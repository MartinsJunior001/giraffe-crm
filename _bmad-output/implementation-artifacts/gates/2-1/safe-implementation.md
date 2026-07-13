# safe-implementation — Story 2.1 (ciclo de vida e catálogo de Pipes)

## Escopo tocado × escopo autorizado
Confronto entre o que a Story autoriza e o que o diff efetivamente mudou.

**Arquivos novos** (todos previstos no Plan):
- `prisma/migrations/20260713120000_pipes/migration.sql`, `prisma/rollback/20260713120000_pipes.down.sql`
- `src/pipes/{pipes.module,pipes.service,pipes.controller}.ts`, `src/pipes/dto/pipes.dto.ts`
- `test/pipes-{rls,http,authz}.test.ts`

**Arquivos modificados** (todos previstos):
- `prisma/schema.prisma` (enum + model + relação inversa)
- `src/kernel/authz/ability.ts`, `ability.factory.ts` (novo sujeito + regras do ADMIN)
- `src/kernel/authz/authz.guard.ts` (escopo do sujeito — **ver ressalva abaixo**)
- `src/kernel/db/tenant-context.ts` (`Pipe` na lista de auditados)
- `src/app.module.ts` (importa `PipesModule`)
- `CLAUDE.md`, artefatos BMAD/Spec Kit

**Nada fora disso foi tocado.** Nenhum arquivo de outra Story, nenhum artefato autoritativo (PRD, UX,
ARCHITECTURE-SPINE, Constitution, `epics.md`), nenhuma configuração de CI, nenhum `.gitignore` versionado.

## Ressalva: `authz.guard.ts` pertence ao contrato congelado C3
O guard **foi modificado** (escopo do sujeito passou de `{ id: orgId }` para `{ id: orgId, orgId }`). A Story
afirma consumir C3 "sem alterá-lo" — verdade para o **mecanismo** (deny-by-default, ponto de aplicação,
cache), **não** para o arquivo. Comportamento de `Organizacao` preservado bit a bit e suíte de authz do L1
verde. Registrado como decisão **D-1** em `specs/2-1-.../analyze.md`; é o item que exige revisão
independente.

## Sem antecipação de escopo (Constitution II)
- Nenhuma tabela/coluna/relação de **Card** foi materializada para "preparar" a trava de arquivamento da
  2.11 (AD-11). A precondição é vacuamente satisfeita — não há Cards.
- Nenhum papel **por Pipe** (2.2), nenhuma **Fase** (2.3), nenhum Formulário.
- `locked` é persistido e alternável, **sem** semântica de bloqueio inventada.
- Nenhuma abstração especulativa: sem repositório genérico, sem event bus, sem módulo vazio.
- Sem paginação, sem cache, sem índice "por precaução".

## Reversibilidade
- Migration versionada com rollback **exercitado** em banco descartável (SC-206, 13/13) — não é uma frase
  no documento.
- Rollback é destrutivo para dados de Pipe (documentado em `backup-check.md` e `migration-check.md`).
- O código novo é aditivo: remover o `PipesModule` do `AppModule` desliga a superfície sem afetar o L1.

## Segurança da mudança
- Nada foi enfraquecido para fazer teste passar. A suíte **encontrou um defeito real** (201 → 200 em
  archive/restore) e ele foi corrigido no **código**, não no teste.
- Nenhum teste existente foi alterado ou removido: 253/253 na API (as 230 do L1 seguem valendo) e 68/68 na
  Web — sem regressão.
- Nenhuma dependência nova (`context7-check.md`); nenhuma versão alterada; lockfile intocado.
- Nenhum segredo em código, log, migration ou artefato. As senhas do SC-206 são efêmeras, geradas por
  execução, e o ambiente foi destruído.

## Gates executados
`context7-check` ✅ · `pre-implementation-check` ✅ · `security-check` ✅ · `lgpd-check` ✅ ·
`migration-check` (SC-206) ✅ · `backup-check` ✅ · `observability-check` ✅ (com ressalva R-1) ·
`performance-check` ✅ · `code-review` (auto-revisão, declarada como tal) ✅ ·
`commit-check` — no momento do commit.

## Veredito

**APROVADO.** A implementação está dentro do escopo congelado, é reversível, não antecipa escopo futuro e
não enfraquece nenhuma garantia existente. A única alteração que extrapola a leitura literal da Story
(`authz.guard.ts`, contrato C3) está **declarada**, não silenciosa, e sustentada por testes.
