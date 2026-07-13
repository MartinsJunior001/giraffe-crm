# L1 — Contratos congelados e liberação de lotes

> Artefato de **planejamento/governança de release** (não normativo; não altera PRD/UX/Architecture
> Spine/epics). Registra o fechamento do **Lote 1 (L1)** do Épico 1 e o que ele destrava.
> Data: 2026-07-13. Base: `main` após o encerramento da tech-2 (L1 completo).

## Estado
**L1 completo e `done`:** 1.5 (sessão/logout/proteção de rota) → 1.6 (autorização efetiva) →
1.7 (casca + design system) → 1.8 (estados honestos + a11y) → tech-2 (provisionamento do 1º tenant).
Base já `done` (L0): 1.1, 1.2 (RLS), 1.3 (contexto), 1.4 (login).

---

## 1. Contratos congelados do L1

Estes contratos são a **fundação estável** sobre a qual os lotes seguintes constroem. **Mudança em
qualquer um exige decisão de arquitetura registrada** (não se altera por conveniência de uma Story de
domínio). Congelar = os consumidores (L2+) podem depender destas superfícies como estão.

### C1 — Identidade e sessão (1.4/1.5)
- `Account` é a identidade **global** (Better Auth `user: { modelName: 'Account' }`); **não** há segunda
  tabela de pessoas. Sessão por **cookie assinado** (`AuthSession`); rotas `/api/auth/*`.
- **Autocadastro desligado** (`disableSignUp: true`) — entrada de contas por convite (E8) ou
  provisionamento (tech-2). Proteção de rota e logout estabelecidos. Sessão **não dispensa** revalidar a
  Membership a cada request.

### C2 — Contexto de Organização (1.3)
- `ContextoOrganizacional { orgId, accountId, papel }`; `withTenantContext`/`withAccountContext`
  (`kernel/db/tenant-context.ts`); contexto por **transação** (`set_config(..., true)`), nunca no pool.
- `TenantContextGuard` resolve o contexto **no servidor** a partir da Membership ativa — nunca do token.

### C3 — Autorização efetiva (1.6)
- CASL `AppAbility`; decorator `@Requer(acao, sujeito)`; **deny-by-default**. `AuthzGuard` é o **2º**
  guard global (após o de contexto). Papel efetivo vem do **banco** (AD-9), nunca do token.
- `AbilityCache` chaveado por **(accountId, orgId)** com `invalidar()` (contrato para o Épico 8). Super
  Admin da Plataforma ≠ Admin da Organização (INV-ADMIN-01).

### C4 — Isolamento multi-tenant / RLS (1.2)
- `Organization`/`Membership` com **FORCE ROW LEVEL SECURITY**; `Account` global **sem** RLS (AD-10).
- **Dois papéis** de banco: `giraffe_app` (runtime, sem BYPASSRLS, não-dono) e `giraffe_migrator`
  (dono do schema, migrations). **Nenhum caminho de bypass de RLS** alcançável em runtime (AD-6).
- GRANTs mínimos são fronteira de segurança: o runtime **não** cria/apaga `Organization`.

### C5 — API interna
- `GET /organizations/current` → `{ id, name, slug, papel }` (papel do contexto, 1.6).
- `GET /health` (liveness, nunca toca o banco) e `GET /ready` (readiness; consulta o banco, 503 quando
  inapto). Payloads **sem** versão/variáveis/paths/segredos.

### C6 — Casca e design system (1.7)
- Casca do segmento autenticado: `app/painel/layout.tsx` + `Navegacao` (prop `orientacao`) + `Topbar`.
- Design system: tokens Tailwind 4 CSS-first (`globals.css`, `@theme`), `Botao` (cva), `cn`
  (`lib/utils`), `lib/navegacao` (`itensVisiveis`/`ehAtivo`), `lib/contexto` (`obterContexto`),
  `lib/auth` (`EstadoOrg`). Nav filtrada por papel é **UX**, não segurança. Sistema UI: shadcn/ui + Radix
  (adiado até haver primitiva) + Tailwind.

### C7 — Estados honestos e acessibilidade (1.8)
- `components/ui/estado.tsx`: `Estado` + `EstadoVazio`/`EstadoErro`/`SemPermissao`/`Carregando` — cor
  semântica + texto + ícone (nunca só cor); zero legítimo (`status`) ≠ falha (`alert`); "sem permissão"
  não-revelador. `lib/contraste` (razão WCAG). **Piso WCAG 2.2 AA** transversal.

### C8 — Provisionamento do 1º tenant (tech-2)
- `db:provision-tenant` (`prisma/provision-tenant.mjs`): cria Organization + Account + Membership ADMIN
  ACTIVE + AuthCredential, **idempotente**, **fail-closed**, papel **migrator**, **com contexto de RLS**
  (sem bypass). Hash via Better Auth; credencial nunca sobrescrita; sem senha padrão.

---

## 2. Lotes liberados (execução paralela permitida)

Com o L1 congelado, ficam **liberados** para execução — em trilhas independentes onde não houver
conflito de schema/autenticação/migrations ativas:

| Lote / trilha | Conteúdo | Depende de | Paralelizável? |
|---|---|---|---|
| **L2 — Pipes e Fases** | 2.1 (ciclo de vida de Pipes), 2.3 (Fases) | E1 (done) | **Próximo CORE vertical.** Novas tabelas + RLS. |
| **Épico 8.1** | Casca do painel administrativo + guarda de acesso | 1.6/1.7/1.8 (done) | **Sim, em paralelo com L2** — superfície distinta (admin), consome C3/C6. 8.2+ *gated* em e-mail. |
| **L6 (antecipação)** | Débitos de staging + recuperação/observabilidade | — | **Trilha independente**, **se** não conflitar com schema/auth/migrations ativas (ver §4). |

A cadeia CORE **L2 → L3 → L4 → L5** é sequencial (cada lote depende do anterior). O paralelismo real está
entre **trilhas** (CORE vertical × Épico 8 administrativo × L6 de hardening), não dentro da cadeia CORE.

---

## 3. L6 — fila obrigatória antes de `STAGING APPROVED`

O **L6 (Hardening de staging + recuperação/observabilidade)** permanece **obrigatório antes do
`STAGING APPROVED`**. Débitos, cada um com responsável e critérios próprios:

| Débito | Descrição | Responsável | Bloqueia staging |
|---|---|---|---|
| **D-06** | Rate limiter transacional pode 500 sob rajada a `/api/auth/*` | Trilha A / Backend | **SIM** |
| **CR-09** | `/ready` precisa de rate limiting na borda | Trilha A / Backend | **SIM** |
| **D-01** | IPs exatos do proxy Coolify | Infra / Ops | **SIM** |
| **D-02** | CIDR do proxy | Infra / Ops | **SIM** |
| **D-05** | Agendador do `db:cleanup` | Trilha A / Backend | **SIM** |

Critérios de aceite de D-06 estão em `gates/1-5/summary.md` (seção de realocação). Nenhum débito é
marcado como resolvido aqui; todos seguem **visíveis em todos os checkpoints** até a correção provada.

---

## 4. Antecipação do L6 em trilha independente

Permitida **desde que não conflite** com schema, autenticação ou migrations **ativas**:

- **D-01/D-02 (IPs/CIDR do proxy):** configuração de borda — **sem** conflito de schema/auth. Antecipável.
- **CR-09 (`/ready` na borda):** infra/borda — **sem** conflito de schema. Antecipável.
- **D-05 (agendador do `db:cleanup`):** ops/agendamento — **sem** conflito de schema/auth. Antecipável.
- **D-06 (rate limiter):** toca **autenticação** (`/api/auth/*`) e pode introduzir um store de limiter.
  Antecipar **somente** quando não houver trabalho ativo de autenticação/migration em conflito; hoje
  não há, mas coordenar com qualquer trilha que altere auth. **Fica na fila obrigatória de qualquer forma.**

Regra: uma trilha de L6 que exija **migration** deve serializar com outras migrations ativas (uma única
verdade de provisionamento; migrations são etapa controlada, nunca no boot).

---

## 5. Próximo passo do pipeline
**L2 — Story 2.1 (ciclo de vida e catálogo de Pipes)** como próximo CORE vertical, com a Épico 8.1 e a
antecipação de L6 disponíveis como trilhas paralelas. Contratos do L1 (C1–C8) são a base congelada.
