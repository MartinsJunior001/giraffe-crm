# security-check — Story 2.1 (ciclo de vida e catálogo de Pipes)

## Superfície
Primeira entidade de domínio do Épico 2: **nova tabela** organizacional (`Pipe`) com RLS, **nova migration**,
**novo sujeito CASL** e **novo módulo HTTP** (6 rotas). Toca o **invariante-mãe** (isolamento por
Organização). Risco **CRÍTICO** — é a superfície de segurança mais exposta desde a Story 1.2.
Nenhuma dependência nova (ver `context7-check.md`).

## Verificações

### Acesso cross-tenant (o invariante-mãe)
- Quem isola é o **banco**: `Pipe` tem `ENABLE` **e** `FORCE ROW LEVEL SECURITY`, 4 policies por
  `orgId = current_org_id()`, com `WITH CHECK` no INSERT **e** no UPDATE. Verificado no banco real
  (`pipes-rls.test.ts` e SC-206 — `migration-check.md`).
- O serviço **não tem um único `where orgId` manual**: toda query passa por `withTenantContext`. Isso
  importa porque um `where` manual é algo que se **esquece** em uma query futura; a policy, não.
- O `orgId` vem **sempre** do contexto resolvido no servidor (Story 1.3), **nunca** do corpo ou da query
  string. Nenhuma rota de Pipe aceita `orgId` do cliente.
- Provado nos dois sentidos: outro tenant não **lê** o Pipe; e não consegue **escrever** na Org alheia —
  o teste de INSERT cruzado usa `createMany` (**sem RETURNING**) de propósito, porque com RETURNING o erro
  viria da policy de SELECT e o teste passaria pelo motivo errado (armadilha já vivida nesta base).
- UPDATE não consegue **mover** um Pipe para outra Organização (`WITH CHECK` do update).

### Contexto de tenant ausente
- `requestContext.obter()` **lança** sem contexto — o serviço não tem caminho que rode sem Org.
- Defesa em profundidade no banco: sem `set_config`, `current_org_id()` devolve NULL, `orgId = NULL` nunca
  é TRUE ⇒ SELECT vê zero linhas e INSERT é **negado**. Provado (fase vermelha) em `pipes-rls.test.ts` e no
  SC-206. **Falha fechada.**

### Bypass de RLS
- Nenhum caminho de bypass alcançável em runtime (AD-6): não existe `bypass_rls_policy`; `giraffe_app` é
  `NOBYPASSRLS`; a tabela **não** pertence ao runtime (dono = `giraffe_migrator`, verificado por `relowner`,
  não só pela flag). `FORCE` fecha o buraco que sobraria pelo dono.
- A credencial do migrator não é entregue ao processo que atende requisição.

### Bypass de CASL
- Toda rota de Pipe carrega `@Requer` — não há rota sem requisito declarado. O `AuthzGuard` é global e
  nega por ausência de regra (deny-by-default): esquecer uma permissão **nega**, não libera.
- Não há flag de "pular autorização" no guard.
- ADMIN de uma Organização **não** recebe ability sobre Pipe de outra: a condition é amarrada ao `orgId`
  resolvido (`pipes-authz.test.ts`). Sem herança cross-tenant — simétrico à RLS.
- MEMBER/GUEST não têm **nenhuma** regra de Pipe em 2.1 ⇒ 403 em `ler` e em `administrar`.
- **Ponto de atenção para o revisor:** o guard passou a popular o escopo com `{ id: orgId, orgId }` (antes
  só `{ id: orgId }`), porque sujeitos de domínio escopam por `orgId`. O caminho de `Organizacao` é
  idêntico e a suíte de authz do L1 segue verde. Ver **D-1** e **R-2** em `specs/2-1-.../analyze.md`.

### Grants excessivos / ausência de DELETE
- GRANT do runtime em `Pipe`: **`SELECT, INSERT, UPDATE`** — e nada mais. Sem DDL, sem ownership, **sem
  DELETE**.
- "Sem exclusão definitiva" (AC3) é garantido **no banco**, não pela mera ausência de rota: mesmo que uma
  rota de DELETE fosse adicionada por engano amanhã, o PostgreSQL recusa (`permission denied for table
  "Pipe"`). Provado em `pipes-rls.test.ts` e no SC-206.
- A policy `pipe_delete` existe por simetria/defesa em profundidade, mas é **inalcançável** pelo runtime
  por falta de GRANT — o privilégio é checado antes da policy.

### Enumeração de IDs
- `GET /pipes/:id` de um Pipe de outra Organização devolve **404 sanitizado**, indistinguível de "não
  existe" (a RLS filtra e o `findUnique` devolve `null`). Não se revela a existência de recurso alheio.
- `PATCH`/`archive`/`restore` usam `updateMany` justamente para que a filtragem da RLS vire `{ count: 0 }`
  → 404, em vez de um erro distinto que vazaria a existência do recurso.
- `id` é UUID v4 (não sequencial): não há espaço de busca enumerável.

### Mass assignment
- O corpo nunca é repassado ao Prisma. `parseCriarPipe` extrai **só** `name`; `parseAtualizarPipe` extrai
  **só** `name`/`locked`/`starred`. Campos desconhecidos são **ignorados**, e um PATCH sem nenhum campo
  conhecido é **400** — não um no-op silencioso.
- `orgId`, `id`, `state`, `archivedAt`, `createdAt` **não** são endereçáveis pelo cliente: `state`/`archivedAt`
  só mudam pelas rotas de transição; `orgId` vem do contexto.

### Transições de estado inválidas
- Só existem `ACTIVE ⇄ ARCHIVED`. Não há transição para "deletado" (nem no modelo, nem no GRANT).
- `arquivar`/`restaurar` exigem o estado de origem no `where`; repetir é **idempotente** (200), não corrompe
  `archivedAt`.
- Não há transição alcançável que apague dado: arquivar **preserva** tudo.

### Mensagens de erro
- 404 e 403 padrão, **sem motivo**, sem id de recurso alheio, sem detalhe interno. Entrada inválida →
  **400 sanitizado** (provado: sem `name`, id malformado e PATCH vazio; id malformado é 400, **não 500** —
  um 500 aqui vazaria stack).
- Nenhum payload de Pipe expõe `orgId` (`SELECT_PIPE` o mantém fora **por construção**, não por remoção
  posterior). É fronteira interna, não dado de apresentação.

### Uso de transações
- `withTenantContext` **recusa** `$transaction` (erro de compilação e de runtime): uma transação externa
  rodaria em outra conexão, **sem** o contexto — e a RLS falharia aberta ou fechada de forma imprevisível.
- Todas as operações da 2.1 são single-statement; nenhuma precisa — nem tenta — transação multi-statement.
- O contexto é definido **por transação** (`set_config(..., true)`); com `false` ele grudaria na conexão e
  vazaria pelo pool.

## Evidência
`pipes-rls.test.ts`, `pipes-authz.test.ts`, `pipes-http.test.ts` (PostgreSQL real, AppModule em porta
efêmera) — **253/253** na suíte da API. SC-206 em banco descartável (`migration-check.md`).
Nenhum teste foi enfraquecido; a suíte **encontrou** um defeito real (201 → 200 em archive/restore).

## Veredito

**APROVADO.** Nenhuma vulnerabilidade identificada. Riscos residuais **R-1** (ruído de auditoria) e **R-2**
(armadilha latente no escopo do guard — falha **fechada**) estão registrados no `analyze.md` e não são
exploráveis. A decisão **D-1** (alteração no arquivo do guard, contrato C3) é o item que exige revisão
independente.
