# migration-check — Story 1.3

2026-07-12 · Status: **N/A — justificado**

## Não há migration nesta Story

Nenhuma alteração de schema: sem tabela nova, sem coluna, sem índice, sem policy. O diretório
`prisma/migrations/` está **inalterado** desde a Story 1.2.

Isso é uma escolha, não um esquecimento. A Story 1.3 é inteiramente de **aplicação**: ela decide, no
servidor, qual Organização entra no contexto. O modelo que ela consulta (`Membership.state`) já
existia — e existia sem efeito nenhum sobre acesso, que era exatamente a dívida registrada pela
Story 1.2 e paga aqui, em código, sem tocar no banco.

## O que mudou em `prisma/`

| Arquivo | Mudança | Natureza |
| ------- | ------- | -------- |
| `prisma/seed.sql` | Conta **Eva** + 2 Memberships ACTIVE (Orgs A e B) | Fixture de **desenvolvimento**. Não roda em produção. |

O seed é idempotente (`ON CONFLICT DO NOTHING`) e foi reaplicado sobre a base existente e sobre uma
base **recriada do zero** — mesmo estado final nos dois casos.

## Por que a fixture era necessária

Nenhuma conta do seed tinha **duas** Memberships ativas. Bruno chega perto (Org A + Org B), mas o
vínculo dele na Org B está `SUSPENDED` — e essa é precisamente a razão de ele *não* servir: ele é a
fixture que prova que vínculo suspenso **não** concede contexto.

Sem uma conta com duas Organizações ativas, o caso "múltiplas Organizações e nenhuma indicada ⇒
rejeita" ficaria sem teste — e é um dos que mais importam, porque a alternativa (adivinhar) coloca
dados de outro tenant na tela em silêncio.

Eva é fixture de **leitura**: nenhum teste a modifica, então ela não introduz corrida entre arquivos
de teste que rodam em paralelo. As contagens que a suíte da 1.2 afirma (Bruno tem exatamente 2
Memberships) permanecem verdadeiras — verificado antes de alterar o seed, e confirmado pelos 62
testes da 1.2 continuarem verdes.

## Rollback

Não se aplica: não há migration. O seed é recriável a partir do arquivo, e foi exercitado em volume
novo (`docker compose down -v` → `up` → `db:migrate` → `db:seed` → 95/95 testes verdes).
