# Story 1.5 — Sumário de gates e débitos encaminhados

> Encerramento administrativo em 2026-07-13. Story integrada ao `main` pelo PR #5
> (merge `--no-ff` `c329cfa`), CI verde nos 4 jobs (Qualidade, Testes PostgreSQL real,
> Containers boot+smoke, Segurança). Os gates detalhados vivem nos arquivos irmãos deste
> diretório (`context7-check.md`, `pre-implementation-check.md`, `security-check.md`,
> `observability-check.md`, `mutation-evidence.md`, `review-adversarial.md`). Este arquivo
> consolida o **veredito** e cataloga os **débitos** que atravessam a fronteira desta Story.

## Gates — veredito

| Gate | Resultado | Evidência |
|---|---|---|
| context7-check | APROVADO | `gates/1-5/context7-check.md` — baseline Better Auth 1.6.23 (expiresIn/updateAge/cookieCache) conferida na doc oficial. |
| pre-implementation-check | APROVADO | `gates/1-5/pre-implementation-check.md` |
| security-check | APROVADO | `gates/1-5/security-check.md` — cookies `HttpOnly` sempre + `Secure` por esquema https do baseURL; logout revoga imediatamente (cookieCache DESABILITADO); CSRF de login no BFF fechado por checagem de mesma origem. |
| observability-check | APROVADO | `gates/1-5/observability-check.md` — sem PII/token em log; probes suprimidos. |
| mutação (M1–M4) | COMPROVADA | `gates/1-5/mutation-evidence.md` — 4 invariantes críticos provados vermelho→verde. |
| revisão adversarial (3 agentes) | 2 HIGH corrigidos, cobertos por teste | `gates/1-5/review-adversarial.md` — login CSRF no BFF e teto absoluto de 7 dias no caminho real. |
| CI (4 jobs) | VERDE | run `29269517992` no SHA `c329cfa`. |

Testes: API 207/207, Web 33/33 (locais); CI reexecutou contra PostgreSQL real e containers.

## Débitos encaminhados

| ID | Débito | Bloqueia staging? |
|----|--------|-------------------|
| D-06 | Rate limiter transacional do Better Auth pode retornar **500 sob rajada concorrente direta a `/api/auth/*`**. Falha **fechada** (nega acesso), **não** é bypass de segurança. Detalhamento completo abaixo. | **SIM** |
| D-07 | (LOW) Robustez da reconstrução do header de cookie no painel — refinamento defensivo, sem impacto funcional observado. | não |

---

## D-06 — registro formal

**Débito:** o rate limiter de banco do Better Auth abre **uma transação por requisição** a
`/api/auth/*` (`incrementOne` → `_transactionWithCallback`). Sob rajada concorrente direta a esses
endpoints, as transações competem pelo pool de conexões e podem não adquirir conexão a tempo,
resultando em **HTTP 500** em vez de **429**. O efeito é **fail-closed** (a requisição é negada, nunca
concedida indevidamente), portanto **não** é uma falha de isolamento, de autenticação nem de
autorização — é robustez/disponibilidade sob carga anômala.

| Atributo | Conteúdo |
|---|---|
| **Responsável** | Trilha A (backend/kernel de autenticação) — dono de `apps/api/src/kernel/auth/*` e da configuração do rate limiter. Acompanhamento pelo Integration Agent no gate de staging. |
| **Impacto** | Disponibilidade degradada sob rajada concorrente aos endpoints `/api/auth/*`: parte das requisições recebe **500** em vez do **429** correto. Sem vazamento de dado, sem concessão indevida de acesso (fail-closed). Não afeta o caminho de produto normal (login/logout de usuário real, um por vez); manifesta-se apenas sob concorrência artificial ou ataque de força bruta paralelo. Herdado da Story 1.4 (pré-existente; não introduzido pela 1.5). |
| **Story-alvo** | ~~**tech-2** (endurecimento operacional / rate limiting na borda)~~ **→ realocado para o L6 em 2026-07-13** (ver "realocação" abaixo). O registro histórico é preservado: à época associou-se D-06 a tech-2 por convergir com **CR-09** na decisão de proteção de borda. A decisão vigente é que **tech-2 = somente provisionamento seguro do primeiro tenant**; D-06 pertence ao **L6 — Hardening de staging**, junto de CR-09/D-01/D-02/D-05. |
| **Teste de reprodução** | `apps/api/test/sessao.test.ts::TS-10` **na sua forma original** disparava N=8 requisições concorrentes ao endpoint HTTP de auth e observava 500 intermitente (7/8). O teste foi reescrito para a rota de domínio `/organizations/current` (que **não** passa pelo rate limiter transacional) justamente para isolar o defeito — a prova de reprodução do D-06 é rodar TS-10 na variante que ataca `/api/auth/*` com N≥8 concorrentes e observar ao menos um 500. Reprodução determinística: `POST /api/auth/sign-in/email` ×8 em paralelo com pool de conexões restrito. |
| **Critério objetivo de correção** | Sob **N≥16 requisições concorrentes** a `/api/auth/*`, **zero respostas 500**; toda requisição além do limite recebe **429** (fail-closed preservado) e nenhuma requisição legítima é negada indevidamente. Correção provada por teste de carga concorrente que hoje falha (vermelho) e passa após a mitigação — via rate limiting na borda, limiter em memória/atômico sem transação por requisição, ou pool dimensionado com backpressure. |
| **Gate de staging** | **BLOQUEIA STAGING APPROVED.** O relatório de prontidão de staging **não** pode marcar `STAGING APPROVED` enquanto D-06 permanecer aberto sem: (a) mitigação implementada e provada pelo critério acima, **ou** (b) decisão arquitetural explícita e registrada que aceite o risco com compensação documentada. Integra a lista de bloqueadores de staging junto de CR-09/D-01. |

**Por que não corrigir agora:** a correção pertence à decisão de **rate limiting na borda** (CR-09,
L6) — resolvê-la dentro da 1.5 anteciparia escopo de outra Story e provavelmente seria refeita
quando a borda for endurecida. Registrado como bloqueador de staging para não ser esquecido.

---

## D-06 — realocação para o L6 (correção de titularidade, 2026-07-13)

Os dois artefatos de planejamento divergiam sobre o dono de D-06 (esta summary apontava tech-2; o
`mvp-core-triage.md` posiciona os débitos de staging no **L6**). Decisão vigente, registrada sem apagar
o histórico acima e **sem** marcar o débito como resolvido:

| Atributo | Conteúdo (vigente) |
|---|---|
| **Responsável técnico** | **Trilha A / Backend** — dono de `apps/api/src/kernel/auth/*` e da configuração do rate limiter. Acompanhamento pelo Integration Agent. |
| **Lote de implementação** | **L6 — Hardening de staging** (cross-cutting de recuperação/observabilidade/borda), junto de **CR-09, D-01, D-02, D-05**. |
| **Severidade** | **Débito operacional bloqueador.** |
| **Gate** | **Impede `STAGING APPROVED`** — o relatório de prontidão não pode aprovar staging com D-06 aberto sem mitigação provada ou decisão arquitetural registrada de aceitação de risco. |
| **Fora de tech-2** | **tech-2 = somente provisionamento seguro do primeiro tenant.** D-06 **não** entra no escopo de tech-2. |

**Critérios de aceite do D-06 no L6** (a correção só é aceita com todos comprovados):

1. **Rajadas concorrentes não produzem 500 indevido** — sob N≥16 requisições concorrentes a
   `/api/auth/*`, zero respostas 500.
2. **Nenhuma solicitação contorna o rate limiter** — todo excesso recebe **429**; não há caminho que
   escape da contagem.
3. **Contador permanece consistente** sob concorrência (sem perda/duplicação de incremento).
4. **Falhas do banco seguem fail-closed** — indisponibilidade do backing store nega acesso, nunca
   concede.
5. **Não há vazamento de PII** — respostas e logs do limiter permanecem sanitizados.
6. **Teste HTTP concorrente com PostgreSQL real** — reproduz a rajada contra `/api/auth/*` (não mock).
7. **Regressão e mutação comprovadas** — fase vermelha real (hoje falha) e prova de que a mitigação a
   fecha; mutação demonstra que o teste pega a regressão.
8. **Observabilidade distingue bloqueio legítimo de falha interna** — 429 (limite) e 500 (falha) são
   observáveis e separáveis, sem confundir defesa com defeito.

**Mantém-se visível em todos os checkpoints até a correção.**
