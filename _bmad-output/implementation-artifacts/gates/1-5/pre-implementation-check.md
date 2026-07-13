# Pre-Implementation Check Report

> Story 1.5 — Continuidade de sessão, logout e proteção de rotas. Gate obrigatório (CLAUDE.md /
> Constitution) antes de implementar. Executado em 2026-07-13.

## Identificacao da tarefa

Story **1.5** (CORE, Lote 1, risco **CRITICAL-FOCUSED**). Conectar a sessão do Better Auth (já emitida
no login da 1.4) à **continuidade de sessão**, ao **logout da sessão corrente** (RN-012) e à **proteção
de rota** (Web), tornando **explícitos** os parâmetros de ciclo de vida da sessão e as flags de cookie.

## Fase e etapa atual

Fase 1, Épico 1 (Fundação e Conta), Lote 1. 1.4 = `done`; 1.5 = `ready-for-dev` e é a próxima na ordem
sequencial de L1 (tech-2 → 1.5 → 1.6 → 1.7 → 1.8, com a 1.5 escolhida como primeira implementação de L1
por ser a continuação direta da sessão da 1.4). **Não antecipa Fase 2.** Sem dependência de recurso de
Fase 2. Decisão de baseline (7d/1d, inatividade) **ratificada** pelo gate arquitetural + context7.

## Objetivo

Sessão persistente vinculada ao contexto permitido; logout imediato **só** da sessão corrente; rota
protegida sem sessão → Login; sessão expirada por inatividade → nova autenticação; sessão ativa **renova
indefinidamente**. **Sem** reinventar identidade/autorização (a autoridade continua na Membership ativa).

## Escopo incluido

- Config **explícita** de sessão no `auth.factory.ts` (`expiresIn=7d`, `updateAge=1d`,
  `cookieCache:{enabled:false}`; `httpOnly` default, `secure` automático em produção, `sameSite=lax`).
- Logout backend via endpoint nativo `POST /api/auth/sign-out` (sessão corrente, revogação imediata).
- Testes de integração real: ciclo de vida da sessão (11 testes TS-01..TS-11) + teste de Membership (AC2).
- Web: `/login` mínimo, `middleware.ts` (proteção de rota como UX), controle de logout.
- Mutação M1–M4 dos invariantes críticos.

## Fora do escopo

- Revogações **globais** (revoke all/others) — 1.10/1.12/1.13. Troca de Organização — 1.9. Autorização
  granular por Pipe/Card — WAVE 2. Casca rica / design system — 1.7. Recuperação de senha — 1.10.
- **Fixar `sameSite=none`/`domain`/`crossSubDomainCookies`** — depende da topologia real de produção
  (débito de staging D-01/CR-09); a baseline segura (same-origin via proxy, `lax`) não exige essa decisão
  para implementar.

## Documentacao consultada

- Épico 1 (Story 1.5), PRD/UX (Login / Estados de sessão), Architecture Spine (AD-7, AD-9), CLAUDE.md.
- **context7** `/better-auth/better-auth` (v1.6.23) — `gates/1-5/context7-check.md` (expiresIn/updateAge,
  cookieCache default off, signOut da sessão corrente, cookies httpOnly/secure).
- Código real: `auth.factory.ts`, `auth.controller.ts`, `sessao-principal.provider.ts`,
  `context/org-context.resolver.ts`, `context/tenant-context.guard.ts`, Web (`app/`, `lib/`).
- Relatório do Integration Agent (topologia de cookie/staging).

## Story e criterios de aceite

AC1 (persistência), AC2 (Membership suspensa/encerrada → 403), AC3 (logout só da sessão corrente),
AC4 (rota protegida sem sessão → Login + 401), AC5 (expirada por inatividade → nova auth; ativa renova).
Todos com teste mapeado (ver a bateria de 11 testes na Story). Fase vermelha provada por mutação.

## Regras de negocio afetadas

RN-012 (logout invalida somente a sessão corrente). Invariante-mãe (isolamento por Organização) pela via
da sessão (TS-09). Deny-by-default preservado. FR-2; NFR-1/3/4.

## Permissoes afetadas

`PERMISSÃO = AÇÃO + ESCOPO`, deny-by-default. **Sessão é identidade, não autorização** — a autoridade
permanece na Membership **ativa**, revalidada **por requisição** pelo `OrgContextResolver`. Membership
suspensa/removida → sem contexto → 403 (já estrutural; a 1.5 prova, não muda). Super Admin da Plataforma
≠ Admin da Organização — não tocado aqui. Convidado/sem sessão → 401.

## Dados e entidades afetados

`AuthSession` (fonte de verdade da sessão, `storage: 'database'`, RLS conforme 1.2/1.4). `Account`
(identidade global, sem RLS). `Membership` (autoridade, `state=ACTIVE`). **Nenhuma migration nova** — a
1.5 **não** altera schema (só config de runtime + testes + UI). Isolamento multi-tenant preservado.
Rollback trivial (mudança de config revertível; sem DDL).

## Arquitetura e modulos afetados

- **API:** `apps/api/src/kernel/auth/auth.factory.ts` (config de sessão — única mudança de código de
  runtime). Testes em `apps/api/test/`.
- **Web:** `apps/web/app/login/`, `apps/web/middleware.ts`, controle de logout, `lib/` (fetch com
  `credentials:'include'`). Testes em `apps/web/test/`.
- **Não alterar:** `sessao-principal.provider.ts`, `org-context.resolver.ts`, `tenant-context.guard.ts`
  (o caminho de identidade/autorização já está certo — a 1.5 o prova, não o reescreve). Schema Prisma.
  Regras do G1/G2 da 1.4.

## Dependencias tecnicas

Better Auth 1.6.23 (versão fixada; API confirmada no context7). Prisma/PostgreSQL. Next.js 16
(middleware). Nenhuma **dependência nova**.

## Skills obrigatorias para esta tarefa

- **security-check** — OBRIGATÓRIA (altera ciclo de sessão e cookies de auth; superfície crítica).
- **observability-check** — OBRIGATÓRIA (garantir que nenhum token/cookie vaze em log — TS-11).
- **technical-docs-check / context7-check** — FEITA (gate registrado).
- **lgpd-check** — aplicável de forma leve (token de sessão e ausência de PII em log); coberto por
  security/observability. Sem novo tratamento de PII.
- **migration-check / backup-check** — **NÃO aplicáveis** (sem migration/DDL nesta Story).
- **performance-check** — leve: `updateAge` evita UPDATE por requisição (TS-02); confirmar.
- **commit-check** — no fechamento, antes de commit.
- ai-guardrails/cost-monitoring — não aplicáveis.

## Riscos identificados

1. **Cookie cross-origin em produção** (topologia D-01/CR-09) — MITIGADO: baseline same-origin via proxy
   + `lax`; **não** fixar `sameSite=none` sem decisão. Provar no container de produção. Não bloqueia a
   implementação; bloqueia o **deploy** (registrado no gate de staging).
2. **Teste verde pelo motivo errado** (lição da 1.4) — MITIGADO: mutação M1–M4 prova a fase vermelha;
   envelhecer a sessão no banco (não esperar relógio); banco real, não mock.
3. **Default silencioso divergente** — MITIGADO: valores explícitos no `auth.factory.ts`.
4. **`cookieCache` aceitando sessão revogada** — MITIGADO: desabilitado explicitamente + TS-06.
5. **Concorrência na renovação** — coberto por TS-10.

## Plano minimo de implementacao

1. **T2** — config explícita de sessão em `auth.factory.ts` (expiresIn/updateAge/cookieCache).
2. **T3/T4/T5** — testes de backend (logout imediato + duas sessões; Membership AC2; ciclo de vida
   TS-01..05/09/10). Red→green; envelhecer sessão no banco.
3. **T6/T7/T8** — Web: `/login`, `middleware.ts`, logout. Testes Web.
4. **T9** — flags de cookie (TS-07/08) + log (TS-11); provar no container de produção.
5. **T10** — mutação M1–M4 (fase vermelha), reverter.
6. **T11** — gates completos + revisão adversarial (3 agentes, escritor único) + CI no fechamento do lote.

**Itens que NÃO devem ser alterados:** provider/resolver/guard de contexto, schema Prisma, regras
G1/G2, artefatos autoritativos (PRD/UX/Spine/epics), sprint-status fora do fluxo BMAD.

## Estrategia de testes

Integração real contra PostgreSQL (AppModule em porta efêmera); envelhecer/adulterar a sessão **no
banco**; escrever na **Org C** com conta de escrita própria; provar fase vermelha por mutação. Web:
testes de `/login` (estados honestos), middleware (redirect sem sessão), logout. Container de produção
para as flags reais de cookie e a checagem de origem.

## Estrategia de rollback

Mudança de runtime + testes + UI, **sem DDL**. Rollback = reverter o commit. Nenhum dado migrado, nenhum
estado irreversível. `AuthSession` já existe desde a 1.4.

## Decisoes pendentes

- Topologia de cookie de produção (subdomínio vs. same-origin via proxy) + TLS + `BETTER_AUTH_URL`
  pública — **decisão humana/segredo**, pertence ao **gate de staging**, não à implementação. A baseline
  não a exige para codar. Registrada nos débitos D-01/CR-09.

## Status final

**APROVADO.**

Baseline confirmada por documentação oficial (context7) e ratificada pelo gate arquitetural; sem
migration, sem dependência nova, sem antecipação de Fase 2; invariantes fixos e testes/mutação definidos;
único ponto que exige decisão humana (topologia de cookie em produção) é do gate de **staging/deploy**, e
não bloqueia a implementação com a baseline segura. Prosseguir para Spec Kit compacto e implementação,
com `security-check` e `observability-check` como gates obrigatórios antes de concluir a Story.

---

### Checklist obrigatorio

[x] fase atual confirmada
[x] tarefa pertence ao escopo atual
[x] story ou especificacao localizada
[x] criterios de aceite definidos
[x] regras de negocio identificadas
[x] permissoes identificadas
[x] entidades e relacionamentos identificados
[x] fonte de verdade definida (AuthSession / Membership ativa)
[x] impacto multi-tenant avaliado (TS-09; RLS de AuthSession)
[x] documentacao tecnica validada (context7-check)
[x] migration avaliada (NÃO aplicável — sem DDL)
[x] seguranca avaliada (security-check obrigatória no fechamento)
[x] LGPD avaliada (sem novo tratamento de PII; token fora de log)
[x] observabilidade avaliada (TS-11 — nenhum token/cookie em log)
[x] backup e rollback avaliados (rollback = reverter commit; sem DDL)
[x] testes planejados (11 testes + Membership + mutação)
[x] dependencias entre skills identificadas
[x] itens fora do escopo registrados
[x] decisoes pendentes registradas (topologia de cookie → gate de staging)
