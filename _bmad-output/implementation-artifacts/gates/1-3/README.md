# Gates — Story 1.3 (propagação segura do contexto de Organização)

Data: 2026-07-12 · Branch: `story/1-3-propagacao-segura-do-contexto-de-organizacao`

Cada relatório registra **o que foi executado, com que comando, e o que se observou**. Onde algo
não foi executado, está escrito que não foi — e por quê (Constitution X).

---

## Resumo

| Gate                  | Status            | Evidência                                            |
| --------------------- | ----------------- | ---------------------------------------------------- |
| `context7-check`      | APROVADO          | [context7-check.md](./context7-check.md)             |
| `security-check`      | APROVADO          | [security-check.md](./security-check.md)             |
| `observability-check` | APROVADO          | [observability-check.md](./observability-check.md)   |
| `lgpd-check`          | APROVADO          | [lgpd-check.md](./lgpd-check.md)                     |
| `migration-check`     | N/A — justificado | [migration-check.md](./migration-check.md)           |
| Gates de build/teste  | VERDE             | [build-e-testes.md](./build-e-testes.md)             |
| Quebras de linha (EOL)| CORRIGIDO         | [eol-gitattributes.md](./eol-gitattributes.md)       |

## O que esta Story fecha

A Story 1.2 provou que o **banco** isola Organizações, e registrou em comentário a fronteira que
deixava aberta: `withTenantContext` **confia** no `orgId` que recebe. A RLS impõe o isolamento
_entre_ Organizações; ela não decide _a qual_ o requisitante pertence. Um handler que fizesse
`withTenantContext(prisma, { orgId: req.header('x-org-id') })` teria acesso integral a um tenant
alheio — e a RLS funcionaria perfeitamente o tempo todo, porque faria exatamente o que lhe pediram.

Esta Story fecha isso: a **Membership ATIVA** passa a ser a única autoridade sobre o contexto, e o
`orgId` do cliente é, no máximo, um pedido.

Ela também paga a dívida que a 1.2 registrou: `MembershipState` existia e **não tinha efeito nenhum
sobre acesso**. Suspender alguém sem lhe tirar o acesso é um botão que não faz nada.

## Achado fora do escopo previsto

O gate de formatação estava **vermelho em 47 arquivos** por quebras de linha, e a investigação levou
a um defeito bem mais sério: `docker/db/init/01-roles.sh` em CRLF **mata o container do banco no
boot**. Reproduzido, corrigido e documentado em [eol-gitattributes.md](./eol-gitattributes.md).

## Como reproduzir

```bash
cp .env.example .env                       # e preencha as senhas
docker compose up -d db
pnpm --filter @giraffe/api db:migrate
pnpm --filter @giraffe/api db:seed
pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose up -d && pnpm smoke && docker compose down
```
