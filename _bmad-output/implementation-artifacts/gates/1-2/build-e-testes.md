# Gates de build e teste — Story 1.2

**Status: VERDE** — executados nesta rodada, após as correções do Code Review.

| Gate                          | Comando                              | Resultado |
| ----------------------------- | ------------------------------------ | --------- |
| Instalação imutável           | `pnpm install --frozen-lockfile`     | exit 0 |
| Formatação                    | `pnpm format:check`                  | "All matched files use Prettier code style!" |
| Lint                          | `pnpm lint`                          | 0 erros, 0 warnings |
| Typecheck (cobre `src` e `test`) | `pnpm typecheck`                  | api: Done · web: Done |
| Testes — API                  | `pnpm --filter @giraffe/api test`    | **62/62** (eram 50 antes do review) |
| Testes — Web                  | `pnpm --filter @giraffe/web test`    | **8/8** |
| Estabilidade da suíte         | 3 execuções consecutivas             | 62/62 · 62/62 · 62/62 |
| Build                         | `pnpm build`                         | api e web OK |
| Ciclo Docker                  | `docker compose build && up -d`      | db · api · web — **todos healthy** |
| Smoke                         | `pnpm smoke`                         | **4/4** (`/health`, `/ready`, `/healthz`, `/`) |
| Teardown                      | `docker compose down`                | OK |

## Reprodutibilidade do zero

`docker compose down -v` (volume destruído) → `up -d db` (bootstrap de papéis a partir do SQL
versionado) → `db:migrate` → `db:seed` → suíte **62/62**. Executado.

## Degradação e recuperação (container real)

Com o banco parado:

| Verificação            | Resultado |
| ---------------------- | --------- |
| `GET /health`          | **200** — o processo está vivo |
| `GET /ready`           | **503** — `{"message":"Service Unavailable","statusCode":503}`, sem host/porta/usuário/stack |
| Container da API       | `running`, **RestartCount = 0** |
| Religando o banco      | `/ready` volta a **200** sozinho, ainda com `RestartCount = 0` |

Um `$connect()` ansioso no boot mataria o processo antes de abrir a porta — sem `/health`, sem
`/ready`, sem 503. A conexão do Prisma é preguiçosa por decisão, e há teste de regressão que
sobe o `AppModule` **real** apontando para um banco inexistente.

## Nota sobre a suíte

Os testes de RLS rodam contra um **PostgreSQL real** e ficam **vermelhos** — não pulados — se
o banco estiver fora. Um mock não provaria isolamento: quem nega o acesso é o banco.

Os arquivos de teste rodam em **paralelo**. Orgs A e B são fixture de **leitura**; a Org C
(vazia) é a área de escrita. Antes desta rodada, dois arquivos escreviam na Org A enquanto um
deles afirmava a contagem dela — falha intermitente sem relação alguma com isolamento, que é o
tipo de coisa que ensina a equipe a re-rodar até ficar verde.
