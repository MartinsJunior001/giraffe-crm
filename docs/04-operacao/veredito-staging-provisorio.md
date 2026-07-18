# Veredito — Staging Provisório (Giraffe CRM, lote L6)

> Registro operacional do encerramento da Fase B do staging provisório no Coolify (project
> `enl623bli2h2ub5kmu4ygktd`, ambiente `staging-temporario`). Consolida os quatro revisores read-only,
> as ressalvas e o veredito. **Não** é artefato BMAD autoritativo — é registro de operação (L6).

## Evidências dos gates (staging real, salvo indicado)

| Gate | Evidência | Resultado |
|------|-----------|-----------|
| Banco / RLS / migrations | `validate-schema-rls.sh` | `VALIDATE_SCHEMA_RLS_OK` (19 migrations, 0 pendentes, RLS FORCE em todas organizacionais, GRANT como fronteira, 1 Org/1 Admin) |
| Backup pós-migration + restore | `restore-verify.sh` | `RESTORE_OK` (28 tabelas, 19 migrations, 20 RLS FORCE, 80 policies) |
| Borda de rede | `curl` externo + `gates-borda-interna.sh` | portas 3001/5432/5434 fechadas; API 404 pelo domínio; `GATES_BORDA_OK` (health/ready/casca/BFF) |
| Aplicação autenticada | `gates-autenticados.sh` | `GATES_AUTH_OK` (login, sessão, cross-tenant 403 não-enumerante, CSRF Origin forjada 403, G1→429, XFF ignorado, logout revoga) |
| D-01 hop Web→API | `gates-autenticados.sh` pós-redeploy | XFF forjado → **403** (hop ativo); `GATES_AUTH_OK` |
| D-05 coleta antiabuso (execução manual) | `gate-d05-cleanup.sh` | `D05_CLEANUP_OK` (código 0 + idempotência; válidos preservados) |
| Smoke pós-redeploy (com D-01 ativo) | `gates-borda-interna.sh` | `GATES_BORDA_OK` (health/ready/casca/BFF íntegros) |
| D-05 agendamento (Scheduled Task Coolify) | `db-cleanup-antiabuso`, `*/15 * * * *`, container `api`, `node /repo/scripts/db-cleanup.mjs` | **ATIVADO** — execução manual `Success` (1s), log `[cleanup] LoginFailure: 0 · RateLimit: 0 (expirados)`, sem PII/segredo |

Todos os PRs do ciclo (#104, #106, #107, #108, #110) fecharam com **CI verde** (Qualidade, Testes em
PostgreSQL real, Containers boot+smoke, Trivy).

## Revisor 1 — Segurança

- **Isolamento multi-tenant:** RLS `ENABLE`+`FORCE` em todas as tabelas organizacionais, policies por
  `orgId = current_org_id()` com `WITH CHECK` no INSERT **e** no UPDATE; GRANT como fronteira
  (`giraffe_app` sem `BYPASSRLS`, `Account` só `SELECT`, `Card`/`Record` UPDATE column-scoped, sem
  DELETE em append-only). Provado no staging (`VALIDATE_SCHEMA_RLS_OK`). **OK.**
- **AuthN/AuthZ:** sessão vira identidade; cross-tenant deny-by-default (403 não-enumerante); CSRF por
  `trustedOrigins`; rate limit G1 (identificador) + G2 (IP). Provados (`GATES_AUTH_OK`). **OK.**
- **D-01 hop:** HMAC fail-closed, replay/expiração/falsificação/rotação cobertos; XFF forjado → 403 no
  staging. Revisão dedicada corrigiu 1 finding (redação do `x-internal-hop` em log). **OK.**
- **Segredos:** fora de log (redação Pino), só ambiente, não versionados. **OK.**
- **Findings:** **(S1)** hardening de borda ausente — `X-Powered-By: Next.js` exposto e sem
  `Strict-Transport-Security` / `X-Content-Type-Options` / `X-Frame-Options` / CSP. **(S2)** warning do
  Prisma sobre detecção de OpenSSL na imagem (ruído de log; não afeta função).
- **Veredito:** **APROVADO para staging provisório.** S1 é **bloqueador de produção**.

## Revisor 2 — Rede / Proxy

- **Topologia nativa do Coolify** (sem rede customizada — decisão do dono 2026-07-17): db/api privados
  por **ausência de superfície** (sem domínio, porta ou label Traefik). Provado: 3001/5432/5434 fechadas
  de fora; API não roteável pelo domínio. HTTPS estável, HTTP→HTTPS 302. **OK.**
- **Resolução de IP:** o D-01 substitui a confiança por IP estático (inviável com IP de container
  dinâmico) por prova assinada por requisição. **OK.**
- **Findings:** **(R1)** risco residual **aceito e documentado** — `coolify-proxy` tem conectividade de
  rede (L3) até db/api, sem rota pública; isolamento L3 exigiria multi-rede, rejeitada pelo custo de
  HTTPS intermitente. Multi-rede/segmentação L3 é **bloqueador de produção** a reavaliar.
- **Veredito:** **APROVADO para staging provisório.**

## Revisor 3 — Migration / Backup

- **Migrations:** 19 finalizadas, 0 pendentes; histórico de recovery legítimo (rolled_back reaplicado)
  distinguido de falha pendente. Cadeia de recuperação (P1000/P3018/P3009/P2021) diagnosticada e
  corrigida com *cluster identity gate*. Aplicação como etapa controlada (one-shot, nunca no boot);
  bootstrap de papéis idempotente. **OK.**
- **Backup:** pré-migration + restore-verify e pós-migration + restore, ambos `RESTORE_OK` com contagem
  de schema conferida. **OK.**
- **Findings:** **(M1)** agendamento/retenção de **backup periódico** e do **Scheduled Task do D-05**
  seguem pendentes (Infra/Ops) — débito operacional, não do staging provisório.
- **Veredito:** **APROVADO.**

## Revisor 4 — Aceite

- Todos os gates funcionais verdes no staging real (D-05 a confirmar); CI verde em todo o ciclo;
  ressalvas classificadas e rastreáveis. **OK.**
- **Pendências para PRODUÇÃO (não bloqueiam o staging provisório):** S1 (hardening de borda), M1
  (Scheduled Task D-05 + backup periódico), R1 (segmentação L3), e a **revisão formal por humano** de
  Segurança+Rede do D-01 (a automática/adversarial foi conduzida).
- **Veredito:** **STAGING PROVISÓRIO APROVADO** (definitivo). Todos os gates finais confirmados no
  staging real (`D05_CLEANUP_OK`, `GATES_BORDA_OK`, `GATES_AUTH_OK`, D-01 ativo, backup/restore
  aprovado, schema/RLS/migrations aprovados, health/ready/Web/BFF íntegros) **e o D-05 agendado**
  (Scheduled Task ativo, execução manual `Success`, log sanitizado).

## Veredito consolidado

**STAGING PROVISÓRIO APROVADO (DEFINITIVO) — com ressalvas que são bloqueadores de PRODUÇÃO, não do
staging.** Todos os gates funcionais fecharam verdes no staging real (banco/RLS, borda, autenticação,
D-01 hop ativo, D-05 execução manual **e agendamento ativo**). As ressalvas abaixo estão documentadas
e nenhuma compromete o isolamento, a autenticação ou a integridade dos dados no uso provisório; a
promoção a **produção** exige tratá-las explicitamente:

- **S1** — hardening de cabeçalhos de borda (HSTS, `X-Content-Type-Options`, `X-Frame-Options`, CSP;
  remover `X-Powered-By`).
- **R1** — segmentação de rede L3 (o proxy alcança db/api sem rota pública — risco residual aceito).
- **Backup periódico** agendado + retenção (o backup pós-migration e o restore foram provados pontualmente).
- **Revisão humana formal** de Segurança + Rede do D-01 (a adversarial/automática foi conduzida).

O **agendamento do D-05** foi **ativado e comprovado** no Coolify (Scheduled Task `db-cleanup-antiabuso`,
`*/15 * * * *`, container `api`) — último passo operacional deste ciclo, agora **fechado**. A lane L6
está **encerrada**.
