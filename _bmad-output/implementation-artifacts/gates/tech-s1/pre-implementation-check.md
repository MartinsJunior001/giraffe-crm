# Pre-Implementation Check Report

## Identificacao da tarefa

TECH-S1 — Hardening de cabeçalhos de borda. Tech story derivada do finding **S1** do
`docs/04-operacao/veredito-staging-provisorio.md` (Revisor 1 — Segurança), listado no veredito
consolidado como **bloqueador de PRODUÇÃO**. Base `origin/main` `3032702`.
Spec: `specs/tech-s1-hardening-cabecalhos-borda/spec.md`.

## Fase e etapa atual

Fase 1. Não antecipa Fase 2: não introduz recurso de produto, entidade, integração externa nem
superfície nova — endurece a borda de uma superfície que já existe e já está em staging.
Liberada pela Lane 0 (distribuição de 19/07/2026, Terminal 4 = Writer B).

## Objetivo

Emitir na Web os cabeçalhos de segurança exigidos pelo veredito, com **CSP enforcing** e nonce por
requisição, sem quebrar casca, login, BFF e probes.

## Escopo incluido

- `apps/web/next.config.ts` — cabeçalhos estáticos + `poweredByHeader: false`.
- `apps/web/lib/cabecalhos-seguranca.ts` (novo) — núcleo **puro** da política.
- `apps/web/proxy.ts` — CSP com nonce e HSTS condicional ao esquema; `matcher` ampliado.
- `apps/web/test/cabecalhos-seguranca.test.ts` (novo) — unidade + proxy real.
- `scripts/smoke.mjs` — afirmação dos cabeçalhos na **aplicação servida**.

## Fora do escopo

Traefik/Coolify; `apps/api` (lane da Writer A); coletor de violações de CSP; Docker, PostgreSQL,
volumes (proibidos nesta lane — a limpeza do banco descartável da 4.1 é do Terminal 2).

## Documentacao consultada

- `docs/04-operacao/veredito-staging-provisorio.md` (origem do finding, classificação de bloqueio).
- `CLAUDE.md` (convenções, fronteira `apps/web`, política de testes).
- **Gate documental (`context7-check`) executado** — Context7 MCP, `/vercel/next.js/v16.0.3`
  (baseline real: `next: ^16.0.0` no `apps/web/package.json`):
  - padrão canônico de **CSP com nonce em middleware/proxy** (nonce no header de **requisição**
    `Content-Security-Policy` para o Next aplicá-lo aos próprios scripts; e no header de
    **resposta** para o browser);
  - `'unsafe-eval'` no exemplo oficial é **condicionado a `NODE_ENV !== 'production'`**;
  - `headers()` do `next.config` para cabeçalhos estáticos;
  - forma documentada do `Strict-Transport-Security`.
  - Confirmado no código, não presumido: Next 16 usa a convenção **`proxy.ts`** (sucede
    `middleware.ts`) — o arquivo já existe no repositório com essa assinatura.

## Story e criterios de aceite

Não há Story de Épico (é tech story). Especificação equivalente aprovada: a spec da seção 6,
com 8 critérios de aceite verificáveis, mais os 8 critérios do complemento da Lane 0
(gate CSP/HSTS), incorporados como D-S1-1 a D-S1-6.

## Regras de negocio afetadas

**Nenhuma.** Não toca Pipe/Card/Database/Registro, autorização, isolamento por Organização nem
qualquer invariante conceitual. `Pipe ≠ Database`, `Card ≠ Registro` e a fronteira
Super Admin × Admin da Organização permanecem intocados.

## Permissoes afetadas

**Nenhuma.** Nenhuma decisão de autorização é criada, lida ou alterada; `ability.ts`/`ability.factory.ts`
(CASL) **não** são tocados — inclusive porque são arquivos reservados por outra lane.
A proteção de rota do `proxy.ts` (UX; a negação real é do backend) é **preservada sem alteração**.

## Dados e entidades afetados

**Nenhum.** Sem migration, sem `schema.prisma`, sem GRANT, sem tabela, sem coluna, sem dado
persistido. Impacto multi-tenant: **nulo** — nenhum caminho de dado é tocado.
LGPD: nulo, exceto **positivo** — `Referrer-Policy` reduz vazamento de path para terceiros.

## Arquitetura e modulos afetados

Só `apps/web` (borda pública) e `scripts/smoke.mjs`. `apps/api` intocada. Nenhum contrato de API
interna alterado. Nenhuma dependência nova (`package.json` inalterado).

## Dependencias tecnicas

Next.js 16 (`^16.0.0`), React 19, Tailwind 4 — todas já instaladas; nenhuma adicionada.

## Skills obrigatorias para esta tarefa

- **security-check** — obrigatória (a Story É segurança; e a cláusula de `unsafe-inline` do gate
  exige revisão de segurança se ele for necessário em `style-src`).
- **observability-check** — obrigatória (leve: confirmar que nada novo é logado; nonce não é PII,
  mas não deve ir para log).
- **commit-check** — obrigatória antes do commit.
- **migration-check** — **não aplicável** (sem migration).
- **lgpd-check** — não aplicável (sem dado pessoal novo).
- **backup-check** — não aplicável (sem estado persistido).
- **performance-check** — não aplicável formalmente; registrar que o `matcher` ampliado faz o
  `proxy` rodar em mais rotas (custo: um `getRandomValues` de 16 bytes por requisição).

## Riscos identificados

1. **CSP enforcing quebrar a UI** (Tailwind 4 / `next/font` injetam `<style>` inline) — risco
   principal. Mitigação: verificação empírica **na aplicação servida** antes de abrir o PR.
2. **Ampliar o `matcher`** alterar o comportamento de sessão da 1.5. Mitigação: o deslize do cookie
   permanece condicionado à rota protegida + regressão da suíte da Web.
3. **HSTS de alcance excessivo** — evitado por decisão (D-S1-4): sem `includeSubDomains`, sem
   `preload`.
4. **Falso verde**: um teste que só importa `next.config.ts` não prova emissão. Mitigação: prova na
   aplicação servida (smoke, job `containers`, imagem de produção).

## Plano minimo de implementacao

1. `lib/cabecalhos-seguranca.ts` — núcleo puro (política, nonce, decisão de esquema).
2. `next.config.ts` — estáticos + `poweredByHeader: false`.
3. `proxy.ts` — CSP/HSTS + `matcher` ampliado, preservando proteção e deslize.
4. `test/cabecalhos-seguranca.test.ts` — unidade + proxy real.
5. `scripts/smoke.mjs` — verificação na aplicação servida.
6. Build de produção local + `next start` + inspeção real da resposta e do render.

**Não alterar:** `apps/api/**`, `prisma/**`, `docker-compose*.yml`, `.env*`, `sprint-status.yaml`,
`epics.md`, PRD/UX/Architecture Spine, `ability.ts`, `pipes.module.ts`.

## Estrategia de testes

Três camadas (spec §7): puro → `proxy()` com `NextRequest` real → **aplicação servida** (smoke no
job `containers`, imagem de produção). Regressão obrigatória: suíte inteira de `apps/web`.

## Estrategia de rollback

`git revert` do commit. Sem migration, sem estado. Único resíduo possível: `max-age` de HSTS já
entregue a browsers — deliberadamente limitado (sem `includeSubDomains`/`preload`) para que o
rollback seja de alcance conhecido.

## Decisoes pendentes

- **`DEB-S1-HSTS-SUBDOMAINS`** — `includeSubDomains`/`preload` exigem inventário confirmado de
  domínios e subdomínios (Infra/Ops). Não bloqueia esta entrega.
- **Cabeçalhos na borda de infra (Traefik)** — decisão de Ops; esta Story resolve no origin.
- **`DEB-S1-CSP-STYLE-NONCE`** — abre **somente se** a verificação empírica provar que o nonce não
  alcança o estilo injetado.

## Status final

**APROVADO**
