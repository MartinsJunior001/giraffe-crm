# code-review — Story 2.1 (ciclo de vida e catálogo de Pipes)

> **Natureza deste documento: AUTO-REVISÃO.** Foi escrito por quem implementou a Story e **não substitui**
> a revisão adversarial independente — que é justamente o propósito da entrega ao revisor (pendência **P-1**
> em `specs/2-1-.../analyze.md`). Serve para dizer onde olhar primeiro, e para não esconder o que já sei
> que é discutível.

## Onde o revisor deve olhar primeiro

**1. `kernel/authz/authz.guard.ts` — a única mudança que toca contrato congelado (C3).**
O escopo do sujeito passou de `{ id: orgId }` para `{ id: orgId, orgId }`, porque sujeitos de domínio
escopam por `orgId` e `Organizacao` escopa por `id`. O caminho de `Organizacao` é idêntico e a suíte de
authz do L1 está verde — mas é uma alteração no mecanismo compartilhado, feita por uma Story que declara
"consumir sem alterar". **Se algo for rejeitado nesta entrega, aposto que é aqui.** Decisão **D-1**,
armadilha latente **R-2** (um sujeito futuro cuja condition use `id` como *id do recurso* seria sempre
negado — falha **fechada**, mas confusa).

**2. A prova de RLS, e não só a sua existência.** `pipes-rls.test.ts` usa `createMany` (sem `RETURNING`) no
teste de INSERT cruzado **de propósito**: com `RETURNING`, o erro viria da policy de SELECT e o teste
passaria mesmo com o `WITH CHECK` desligado. Esta base já foi mordida exatamente por isso. Vale conferir se
a fase vermelha foi mesmo provada.

**3. O GRANT como fronteira.** "Sem exclusão definitiva" não depende da ausência de rota: depende de o
runtime **não ter** `DELETE` (`permission denied` no SC-206). Se um revisor achar que basta não expor a
rota, discordo — e o teste existe justamente para sustentar a discordância.

## Defeito encontrado e corrigido durante esta rodada
`POST /pipes/:id/archive` e `/restore` devolviam **201 Created** (default do `@Post` do NestJS) sem criar
nada. Corrigido para **200 OK** (`@HttpCode(HttpStatus.OK)`); `POST /pipes` segue **201**, porque cria de
fato. O teste HTTP estava certo e falhou de verdade — a correção foi no **código**, não na asserção.

## O que revisei, e o que achei

### Corretude
- Ciclo `ACTIVE ⇄ ARCHIVED` fechado; sem transição para "deletado" no modelo, no serviço ou no GRANT.
- Idempotência de `arquivar`/`restaurar` implementada pelo `where` do estado de origem — não por leitura
  prévia sujeita a corrida.
- `atualizar` toca **só** os campos presentes; PATCH vazio é 400, não no-op silencioso.
- `obter` distingue corretamente "não existe" de "é de outra Org" — **não distinguindo** (404 nos dois
  casos). É o comportamento correto: distinguir seria enumerar.

### Segurança
Sem `where orgId` manual em lugar nenhum (a RLS é a única fonte de isolamento — o que não se pode
esquecer de escrever). `orgId` nunca sai no payload (`SELECT_PIPE` o exclui por construção, não por
remoção posterior). Sem mass assignment: os parsers extraem campos nomeados de `unknown`, nunca repassam o
corpo. Detalhe: `state` e `archivedAt` **não** são endereçáveis por `PATCH` — mudança de estado só pelas
rotas de transição. Ver `security-check.md`.

### Simplicidade / escopo
Sem abstração especulativa, sem paginação, sem cache, sem índice de precaução, sem stub de Card. O módulo
tem 4 arquivos e faz uma coisa. Validação manual (sem `class-validator`) segue a convenção da base — a
dependência não tem consumidor que a justifique.

## Achados menores (não bloqueantes, decisão do revisor)

**M-1 — `?arquivados=` é estritamente `'true'`.** `parseIncluirArquivados` compara com a string `'true'`;
qualquer outro valor (`1`, `TRUE`, `yes`, ou um typo) cai silenciosamente em "só ativos". É simples e
previsível, mas um cliente que mande `?arquivados=1` recebe **200 com a lista errada**, sem nenhum sinal de
que o parâmetro foi ignorado. Alternativa: aceitar um conjunto explícito e **400** para o resto — coerente
com o rigor do resto do DTO (que rejeita booleano inválido no corpo com 400). Deixei como está porque
mudar o contrato de query string sem o Spec pedir seria decisão minha, não da Story; registro para o
revisor decidir.

**M-2 — 2 a 3 round-trips nas transições.** `arquivar` faz `obter` → `updateMany` → `obter`. É deliberado
(404 × idempotência, e `updateMany` para não enumerar), e irrelevante no volume desta entidade — mas é uma
troca, não uma otimização. Ver `performance-check.md`.

**M-3 — ruído de auditoria (R-1).** Arquivar um Pipe já arquivado gera uma linha `denied` na trilha, por
`count: 0`. Falso positivo conhecido do motor de auditoria; não é falha desta Story, mas quem investigar um
incidente precisa saber. Ver `observability-check.md`.

## Regressão
API **253/253**, Web **68/68**, typecheck/lint/format limpos, `git diff --check` limpo. Nenhum teste
existente foi alterado, enfraquecido ou removido.

## Veredito (auto-revisão)

**APROVADO COM PENDÊNCIAS**, sujeito a revisão independente. Nenhum achado bloqueante. Os itens que quero
explicitamente sob outros olhos: **D-1** (guard/C3), **M-1** (query string permissiva) e a validação de que
a fase vermelha da RLS foi mesmo provada.
