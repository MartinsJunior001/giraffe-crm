# Gates — Story 1.2 (modelo multi-tenant e isolamento por RLS)

Data: 2026-07-12 · Branch: `story/1-2-modelo-multi-tenant-e-isolamento-por-rls`

Estes relatórios existem porque a Constitution X é explícita: **um gate só pode ser declarado
executado quando houver execução real**. Na primeira passagem da Story, seis gates estavam
marcados `[x]` no `tasks.md` sem que nenhum relatório existisse no repositório — o Code Review
adversarial (finding do Acceptance Auditor) apontou isso, e este diretório é a correção.

Cada seção abaixo registra **o que foi executado, com que comando, e o que se observou**.
Onde algo não foi executado, está escrito que não foi — e por quê.

---

## Resumo

| Gate                       | Status                    | Evidência |
| -------------------------- | ------------------------- | --------- |
| `context7-check`           | APROVADO                  | [context7-check.md](./context7-check.md) |
| `security-check`           | APROVADO                  | [security-check.md](./security-check.md) |
| `lgpd-check`               | APROVADO COM RESSALVAS    | [lgpd-check.md](./lgpd-check.md) |
| `observability-check`      | APROVADO                  | [observability-check.md](./observability-check.md) |
| `migration-check`          | APROVADO                  | [migration-check.md](./migration-check.md) |
| `backup-check`             | APROVADO                  | [backup-check.md](./backup-check.md) |
| `performance-check`        | N/A — justificado         | [performance-check.md](./performance-check.md) |
| Gates de build/teste       | VERDE                     | [build-e-testes.md](./build-e-testes.md) |

---

## Como reproduzir

```bash
cp .env.example .env                       # e preencha as senhas
docker compose up -d db
pnpm --filter @giraffe/api db:migrate
pnpm --filter @giraffe/api db:seed
pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose build && docker compose up -d && pnpm smoke && docker compose down
```
