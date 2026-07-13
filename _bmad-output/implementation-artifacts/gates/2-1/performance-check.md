# performance-check — Story 2.1 (ciclo de vida e catálogo de Pipes)

## Aplicabilidade
**Aplicável, escopo pequeno.** A Story introduz uma tabela e seis rotas de leitura/escrita. Não há job em
lote, agregação, relatório, upload nem caminho de alto volume. O que merece análise é o **acesso ao banco**.

## Índice e padrão de acesso
- Índice `(orgId, state)` — e não `(orgId)` sozinho. É o índice certo porque **todo** acesso começa pela
  Organização (a policy de RLS injeta `orgId = current_org_id()` em toda query) e o catálogo filtra por
  estado: `GET /pipes` (só `ACTIVE`) usa as **duas** colunas.
- `GET /pipes?arquivados=true` usa o prefixo `orgId` do mesmo índice.
- `GET /pipes/:id`, `PATCH`, `archive`, `restore` acessam pela **PK** (`id`, UUID), com a RLS aplicando o
  predicado de Org por cima.

## Volume esperado
Catálogo de processos por Organização: **dezenas** de linhas por tenant, não milhares. A listagem não é
paginada — e não deve ser, em 2.1: paginar um catálogo dessa ordem seria complexidade especulativa
(Constitution II). Se o volume por tenant crescer de forma inesperada, paginação é decisão de outra Story,
com dado real em mãos.

## N+1 e round-trips
- Nenhuma consulta aninhada, nenhum `include` de relação, nenhum laço com query dentro. Cada rota é
  **uma** operação de banco — com uma exceção deliberada e barata, abaixo.
- `atualizar`, `arquivar` e `restaurar` fazem `updateMany` seguido de um `obter` (2 round-trips) para
  devolver o recurso atualizado. É consciente: o `updateMany` (em vez de `update`) é o que permite que a
  filtragem da RLS vire 404 em vez de vazar a existência de um Pipe alheio — **trocamos um round-trip por
  não-enumeração**, e o custo é irrelevante nesta ordem de grandeza. `arquivar`/`restaurar` fazem um
  `obter` a mais para distinguir "não existe" de "já estava no estado" (404 × idempotência).

## Overhead do contexto de tenant
Cada operação abre transação e emite dois `set_config` (org e conta). Custo já existente e medido nas
Stories 1.2/1.3 — a 2.1 não muda o mecanismo. Não há `$transaction` multi-statement (o
`withTenantContext` a recusa).

## Índice sobrando?
Não. O único índice além da PK é o `(orgId, state)`, que serve o caminho mais quente (a listagem do
catálogo). Não foi criado índice "por precaução" em `name`, `locked` ou `starred` — não há consulta que os
filtre, e índice sem consumidor é custo de escrita sem benefício.

## Evidência
Suíte da API (253 testes, PostgreSQL real) roda em ~27 s no total, sem regressão de tempo perceptível após
a inclusão das 23 asserções de Pipe. Nenhum teste de carga foi executado — e nenhum era exigido: não há
requisito de performance (NFR) endereçado a esta Story.

## Veredito

**APROVADO.** Padrão de acesso alinhado ao índice; sem N+1; sem otimização prematura; sem índice
especulativo. Os 2 round-trips das transições são uma troca **declarada** por não-enumeração.
