# Story 2.18: Integração FR-32 — Pipes relacionados no Perfil

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário,
I want ver no meu Perfil os Pipes da Organização atual a que estou relacionado,
so that eu me situe, sem que isso conceda acesso.

## Acceptance Criteria

1. **CA1 — Pipes relacionados reais.** Dado um usuário com papéis em Pipes da Org atual, quando consulta os Pipes relacionados, então vê os Pipes reais (nome/estado/**papel/nível efetivo**), em **leitura**.
2. **CA2 — Só o que tem acesso.** Dado um Pipe ao qual o usuário **não** tem acesso, quando a lista é montada, então esse Pipe **não** é listado nem revelado (não-enumeração).
3. **CA3 — Exibir não concede.** Dada a exibição, quando o usuário interage, então **nenhum acesso adicional é concedido** — listar é leitura pura; um Pipe fora do acesso segue 404 em `obter`.
4. **CA4 — Ausência honesta.** Enquanto o usuário não tiver Pipes relacionados, mantém-se o estado honesto de ausência (lista vazia), **sem dado fictício**.

## Tasks / Subtasks

- [ ] T0 Gate `pre-implementation-check` (read-side; reusa PipesService/PipeGrant; sem migration/GRANT).
- [ ] Task 1 — `PipesService.listarRelacionados()` (AC: 1, 2, 4)
  - [ ] Admin da Org (`contexto.papel === 'ADMIN'`) → **todos** os Pipes da Org, poder `gerenciar`.
  - [ ] Não-Admin → Pipes com `PipeGrant` ACTIVE para a Membership atual; **papel efetivo** do grant (`ADMIN→gerenciar`, `MEMBER→operar`, `VIEWER→ler`). Sem grants → lista vazia (CA4).
  - [ ] Projeção `{ id, name, state, poder }` — `orgId` fora da fronteira; leitura pura (não concede — CA3).
- [ ] Task 2 — Rota `GET /pipes/related` (AC: 1) — `@Requer('ler','Pipe')` (guarda grossa; membros têm), declarada **antes** de `@Get(':id')` para não colidir com o param. Reusa a mesma resolução do catálogo (2.1/2.2).
- [ ] Task 3 — Testes (PostgreSQL real): Admin vê todos; VIEWER-concedido vê só o seu com poder `ler`; sem grant → vazio; Pipe sem acesso não aparece e segue 404 em `obter` (CA3); `orgId` não vaza.
- [ ] Task 4 — Polish: typecheck/lint/format; `test:ci` serial (CI é o gate autoritativo); gates de conclusão (security/observability).

## Dev Notes

- **Rastreabilidade:** FR-32 (suporte; proprietário principal = Épico 1); D6.2; NFR-31; AD-9. **Dep.:** 2.2 (PipeGrant), 1.11 (Perfil — Épico 1). **Fora:** edição de Perfil/conta (E1); administração de terceiros; consumo visual no Perfil (Web, Épico 1).
- **Sem migration, sem GRANT novo:** reusa `Pipe`/`PipeGrant`/`Membership` (2.1/2.2) e a MESMA resolução de acesso do catálogo (`PipesService.listar`). A 2.18 só adiciona o **papel/nível efetivo** por Pipe.
- **Autorização = a do catálogo (2.1/2.2):** Admin da Org vê todos os Pipes; não-Admin vê só os com `PipeGrant` ACTIVE (guarda FINA no serviço, não no guard). Listar **não concede** acesso (SC-221/224/227): um Pipe fora do acesso não aparece e segue 404 em `obter`.
- **Papel/nível efetivo:** deriva o `Poder` do `PipeGrant.role` (`ADMIN→gerenciar`, `MEMBER→operar`, `VIEWER→ler`), como `resolverPoderNoPipe`. Não é uma 2ª verdade — é a mesma regra, projetada para o Perfil.
- **Substitui o estado honesto de indisponibilidade** que o Perfil (1.11) exibia antes de existirem Pipes; enquanto não houver Pipes relacionados, lista vazia (CA4).
- **CORE = endpoint de leitura.** O consumo visual no Perfil é do Épico 1 (a casca Web atual não tem página de Perfil montada); esta Story entrega a superfície de dados testável do domínio.

### Project Structure Notes

- `apps/api/src/pipes/pipes.service.ts` (novo método `listarRelacionados` + `PipeRelacionadoVisao`) e `pipes.controller.ts` (`GET /pipes/related` antes de `:id`). Reusa `Poder` de `pipe-authz`.
- Teste `apps/api/test/pipes-related-http.test.ts`. PostgreSQL real, Org C/A + fixtures de grant.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.18 (L1034-1047)]
- [Source: apps/api/src/pipes/pipes.service.ts#listar (mesma resolução Admin/PipeGrant)]
- [Source: apps/api/src/pipes/pipe-authz.ts#resolverPoderNoPipe (mapeamento role→poder)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

### File List
