# Checklist de prontidão de staging — Trilha Coolify (Giraffe CRM)

> Artefato de **planejamento/prontidão de release** (não normativo). **Não** altera PRD/UX/Architecture
> Spine/`epics.md`/`sprint-status.yaml` nem status de Story. Não marca nenhum débito como resolvido.
> Não contém segredos, senhas, tokens nem DSNs — só **nomes** de variáveis.
>
> Fontes: `l6-hardening-staging-dossie.md` (§4 Coolify-dependente; CR-09/D-01/D-02), `gates/1-4/summary.md`
> §11 (origem de CR-09/D-01/D-02/D-05), memória do projeto ("Bloqueadores de staging Fase 1"), e o código:
> `apps/api/src/kernel/auth/client-ip.ts`, `apps/api/src/kernel/config/env.ts`,
> `apps/api/src/health/health.controller.ts`, `apps/api/Dockerfile`, `apps/web/Dockerfile`,
> `apps/web/next.config.ts`, `docker-compose.yml`.
>
> Data: 2026-07-14 · Autor: Planejador da Trilha Coolify (worktree isolado).

## Legenda de classificação (uma por item)

- **[CÓDIGO]** — resolvido por código, já pronto no repo.
- **[DEPOIS]** — configurável depois; não bloqueia, ajuste operacional.
- **[COOLIFY]** — exige acesso ao ambiente Coolify (entrar no painel/ambiente).
- **[INFRA/OPS]** — exige decisão real de Infra/Ops (ex.: topologia de rede do D-02; não pode ser `10.0.0.0/8`).

Débitos abertos referenciados: **CR-09** (`/ready` na borda), **D-01** (IPs do proxy), **D-02** (CIDR/IP dinâmico).
Todos **BLOQUEIAM `STAGING APPROVED`** enquanto abertos.

---

## 1. Topologia recomendada (pelos artefatos)

| # | Item | Classificação | Observação |
|---|---|---|---|
| 1.1 | **Web** (Next.js 16, `output: standalone`, porta 3000) é o **único serviço público** — recebe o tráfego do usuário via proxy do Coolify + TLS. | **[COOLIFY]** | `next.config.ts` já em `standalone`; container non-root, `/healthz` local. Publicar só a Web no Coolify. |
| 1.2 | **API** (NestJS 11, porta 3001) é **interna** — alcançada apenas pela Web pela rede do Coolify (`API_BASE_URL` server-side, sem `NEXT_PUBLIC_`). **Não** deve ter domínio público próprio, salvo decisão explícita. | **[INFRA/OPS]** | Se a API precisar de domínio (não é o caso hoje: "frontend consome apenas a API interna"), passa a valer D-01/D-02 na borda dela também. Recomendação: manter API sem exposição pública. |
| 1.3 | **Banco** (PostgreSQL 16) é **estritamente interno** — nunca publicado. No Compose local é `127.0.0.1:5434`; em staging não deve ter porta publicada. | **[INFRA/OPS]** | O runtime usa papel `giraffe_app` (sem BYPASSRLS, DML mínima); o migrator é separado. Banco exposto quebra o invariante-mãe. |
| 1.4 | Migrations e bootstrap de papéis rodam como **etapa controlada** fora do boot (ver §5), não como serviço público. | **[INFRA/OPS]** | — |

**Resumo da topologia:** público = **só a Web** (via proxy Coolify + TLS). Interno = **API + Banco**
(rede privada do Coolify). O origin da Web também **não** deve ser alcançável direto (só via proxy) — ver §2.

---

## 2. Proxy do Coolify, trusted proxy IPs e prova de origin não-direto

| # | Item | Classificação | Observação |
|---|---|---|---|
| 2.1 | O código já resolve o IP do cliente pelo **socket** e ignora `X-Forwarded-For` de quem **não** é proxy confiável (`client-ip.ts`); percorre a cadeia da direita p/ esquerda pulando proxies conhecidos. | **[CÓDIGO]** | Default seguro: `TRUSTED_PROXY_IPS` vazio ⇒ nenhum XFF honrado. |
| 2.2 | `TRUSTED_PROXY_IPS` aceita **apenas IPs exatos** — `*` e **CIDR (`/`)** são recusados no boot (`env.ts` superRefine); entrada não-IP falha fail-fast. | **[CÓDIGO]** | **D-02:** o suporte a CIDR **não existe** de propósito. Se o proxy tiver IP dinâmico na rede Docker/Coolify, IPs exatos não bastam — exige decisão de rede (item 2.4). |
| 2.3 | **Descobrir os IPs reais do proxy do Coolify** e popular `TRUSTED_PROXY_IPS` com eles (exatos), verificados no ambiente real. **D-01.** | **[COOLIFY]** | Obter no painel do Coolify (ver §8). Não supor; validar por teste de spoofing (§6). |
| 2.4 | **Dar ao proxy um endereço estável** (IP fixo, rede dedicada ou mecanismo equivalente) que case com a lista de IPs exatos — **sem** confiar na rede inteira (`10.0.0.0/8` proibido). **D-02.** | **[INFRA/OPS]** | Exige **decisão de arquitetura de rede registrada (AD)**. É o item que não fecha só com Coolify nem só com código. |
| 2.5 | **Provar que o origin (Web/API) não é alcançável direto**, só via proxy — senão quem contornar o proxy volta a forjar o header. | **[INFRA/OPS]** | Regra de rede/firewall do Coolify + verificação. Parte de D-01. |
| 2.6 | `ALLOW_DIRECT_EXPOSURE` **não** deve ser `true` em produção real atrás de proxy (é opt-in de exposição direta, sem proxy). | **[INFRA/OPS]** | Em produção, `TRUSTED_PROXY_IPS` vazio **falha o boot** salvo `ALLOW_DIRECT_EXPOSURE=true` — o opt-in existe para não subir com o G2 colapsado por esquecimento. |

---

## 3. Rate limiting de borda para `/ready` (CR-09)

| # | Item | Classificação | Observação |
|---|---|---|---|
| 3.1 | `GET /ready` consulta o banco a cada chamada (lê tabela do schema, `LIMIT 0`). Sem limite de borda, vira vetor de pressão sobre o banco. | **[CÓDIGO]** (fato) | Comportamento correto e desejado; o custo é o que exige proteção. |
| 3.2 | Configurar **rate limiting na borda** (proxy Coolify) cobrindo `/ready`, **sem autenticação** e **sem acoplar ao login**. **Política já ratificada pelo usuário: borda, sem auth.** | **[COOLIFY]** | Contrato/limite: Trilha A/Backend define; regra: Infra/Ops no Coolify. |
| 3.3 | O excesso é barrado **antes** de alcançar a aplicação/banco; a **sonda legítima do orquestrador não** é bloqueada. | **[COOLIFY]** | Verificar contra o ambiente real (§6). |
| 3.4 | Registrar a regra como **task técnica** (BMAD/Spec Kit) — pré-condição explícita do gate. | **[INFRA/OPS]** | Lacuna de governança (dossiê §5.3): CR-09 ainda não tem task registrada. |

---

## 4. TLS, health/readiness e regras de rede

| # | Item | Classificação | Observação |
|---|---|---|---|
| 4.1 | **TLS** terminado na borda do Coolify para o domínio de staging da Web (certificado gerenciado). | **[COOLIFY]** | Definir domínio (ver §8). |
| 4.2 | `GET /health` = **liveness** da API (não toca o banco). | **[CÓDIGO]** | `health.controller.ts`. |
| 4.3 | `GET /ready` = **readiness** da API (toca o banco; **503** quando inapto). Já é o probe do `HEALTHCHECK` da imagem da API (`--timeout=6s` > deadline interno 5s). | **[CÓDIGO]** | Apontar o healthcheck de container/orquestrador do Coolify para `/ready` na API. |
| 4.4 | `GET /healthz` = **liveness** da Web (rota local, sem I/O; **não** consulta a API). Já é o `HEALTHCHECK` da imagem da Web. | **[CÓDIGO]** | Saúde do container Web não depende da API. |
| 4.5 | Regras de rede: só a Web recebe ingress público; API/Banco sem ingress externo; egress da Web→API e API→Banco na rede interna. | **[INFRA/OPS]** | Coincide com §1 e §2.5. |
| 4.6 | Payloads de health/ready **não expõem** versão, variáveis, paths, stack ou segredos. | **[CÓDIGO]** | `health.payload.ts`; erro do driver nunca vai ao corpo. |

---

## 5. Migrations como etapa controlada e variáveis de ambiente exigidas

| # | Item | Classificação | Observação |
|---|---|---|---|
| 5.1 | Migrations **não** rodam no boot: o `CMD` da imagem da API é só `node dist/main.js`. Aplicar via **etapa controlada** (`pnpm --filter @giraffe/api db:migrate`, papel `giraffe_migrator`) antes de liberar tráfego. | **[CÓDIGO]** + **[COOLIFY]** | O código já garante que o boot não migra; **executar** a etapa no Coolify (job/comando pré-deploy) é ação de ambiente. |
| 5.2 | Bootstrap de **papéis** (`apps/api/prisma/bootstrap/00-roles.sql`) é idempotente, roda com papel administrativo e **precede** as migrations. | **[COOLIFY]** | Uma única definição de provisionamento; não recriar no Coolify. |
| 5.3 | Conexão do runtime é **preguiçosa** — a API sobe com o banco fora e responde 503 em `/ready` até o banco/migrations estarem prontos. | **[CÓDIGO]** | Ordem de subida tolerante. |

**Variáveis de ambiente exigidas (apenas NOMES — nunca valores; segredos vêm do cofre/Coolify):**

- **API (runtime):** `NODE_ENV`, `API_PORT`, `CORS_ALLOWED_ORIGINS` (sem curinga), `DATABASE_URL` (papel `giraffe_app`),
  `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `LOGIN_HMAC_SECRET`, `LOGIN_HMAC_KEY_VERSION`, `LOG_LEVEL`,
  `TRUSTED_PROXY_IPS`, `ALLOW_DIRECT_EXPOSURE`.
  - Opcionais só na **rotação** do HMAC: `LOGIN_HMAC_PREVIOUS_SECRET`, `LOGIN_HMAC_PREVIOUS_KEY_VERSION` (definir **juntas** ou nenhuma).
- **Web:** `NODE_ENV`, `API_BASE_URL` (server-side, **sem** `NEXT_PUBLIC_`), `PORT`, `HOSTNAME`.
- **Banco / bootstrap (etapa controlada, não no runtime da app):** `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
  `MIGRATOR_PASSWORD`, `APP_PASSWORD` — e a `DATABASE_URL` do **migrator** (nunca entregue ao runtime).

> Classificação das variáveis: presença/formato **[CÓDIGO]** (fail-fast valida nomes e formato no boot); valores em
> staging **[COOLIFY]** (definidos no painel/cofre). `TRUSTED_PROXY_IPS`/`ALLOW_DIRECT_EXPOSURE` dependem de D-01/D-02 (**[INFRA/OPS]**).

---

## 6. Critérios de validação no ambiente real

| # | Item | Classificação | Observação |
|---|---|---|---|
| 6.1 | **Teste de spoofing de `X-Forwarded-For`:** um cliente que fala **direto** com o origin (fora do proxy) tem o XFF forjado **descartado** — o IP usado é o do socket. Sem essa prova, D-01 é fé, não evidência. | **[COOLIFY]** | Exige alcançar o ambiente real; se o origin **não** for alcançável direto (§2.5), o próprio teste confirma isso. |
| 6.2 | Requisição **via proxy** resolve o IP real do cliente (não o do proxy) — rate limiting por IP (G2) volta a funcionar. | **[COOLIFY]** | Depende de `TRUSTED_PROXY_IPS` correto (D-01). |
| 6.3 | **CR-09:** martelar `/ready` é barrado **na borda** antes de alcançar a app/banco; a sonda legítima passa. | **[COOLIFY]** | — |
| 6.4 | Boot **fail-fast** preservado: em produção, sem `TRUSTED_PROXY_IPS` e sem `ALLOW_DIRECT_EXPOSURE`, a API **não sobe**. | **[CÓDIGO]** | Verificar que o ambiente real não ligou `ALLOW_DIRECT_EXPOSURE=true` por engano. |
| 6.5 | `/health`, `/ready`, `/healthz` respondem conforme o contrato no ambiente real (200/503); `pnpm smoke` verde contra staging já no ar. | **[COOLIFY]** | `pnpm smoke` aceita `API_URL`/`WEB_URL`. |
| 6.6 | Origin (Web/API) comprovadamente **não** alcançável direto — só via proxy + TLS. | **[COOLIFY]** + **[INFRA/OPS]** | Fecha D-01 junto com 6.1. |

---

## 7. Rollback da configuração

| # | Item | Classificação | Observação |
|---|---|---|---|
| 7.1 | **`TRUSTED_PROXY_IPS`:** reverter para **vazio** (default seguro) desfaz confiança no proxy — o IP volta a vir do socket, XFF ignorado. Rollback sem risco de vazamento. | **[CÓDIGO]** | Em produção, vazio exige `ALLOW_DIRECT_EXPOSURE` coerente — o rollback do proxy pode exigir também rever o modo de exposição. |
| 7.2 | **Rate limiting de borda (CR-09):** removível pela config do proxy Coolify; sem acoplamento ao app. | **[COOLIFY]** | Reverter a regra no painel. |
| 7.3 | **Deploy da aplicação:** rollback pela imagem anterior no Coolify. **Migrations não** revertem por rollback de imagem — reversão de schema é etapa controlada (`db:rollback`, destrutiva) e deve ser evitada; preferir migration corretiva para frente. | **[INFRA/OPS]** | Registrar o par imagem↔migration para não reverter app deixando schema à frente. |
| 7.4 | **Variáveis/segredos:** rollback pelo cofre/Coolify; valores nunca versionados. | **[COOLIFY]** | — |
| 7.5 | **Decisão de rede (D-02):** rollback de topologia (IP fixo/rede dedicada) exige rollback da AD correspondente. | **[INFRA/OPS]** | — |

---

## 8. Dados NÃO-secretos necessários do usuário (e onde obter no Coolify)

> **Nenhum segredo, senha, token ou DSN é pedido.** Só metadados de topologia/rede e confirmações.

| Dado (não-secreto) | Para quê | Onde obter no Coolify |
|---|---|---|
| **IP(s) exato(s) do proxy do Coolify** (D-01) | Popular `TRUSTED_PROXY_IPS` (IPs exatos) | Painel do servidor → rede/containers do proxy (Traefik/proxy do Coolify); IP do container/serviço de proxy na rede interna |
| **O proxy tem IP fixo ou dinâmico?** (D-02) | Decidir se IPs exatos bastam ou se exige topologia estável | Configuração de rede do projeto/serviço; definição da rede Docker do Coolify |
| **Domínio de staging da Web** | TLS + `CORS_ALLOWED_ORIGINS` + `BETTER_AUTH_URL` | Aba Domains do recurso da Web |
| **Confirmação de que o origin (Web/API) não é público/direto** | Fechar prova de §2.5/6.1 | Regras de exposição/rede do recurso; portas publicadas (a API/Banco não devem ter domínio nem porta pública) |
| **Como/onde roda a etapa de migrations** (job pré-deploy, comando manual) | Executar `db:migrate`/bootstrap fora do boot | Aba de comandos/pré-deploy do recurso da API |
| **Faixa/rede interna entre Web↔API↔Banco** | Confirmar isolamento do banco e egress interno | Configuração de rede do projeto no Coolify |

---

## 9. Resumo de bloqueio para `STAGING APPROVED`

- **Exigem acesso ao Coolify [COOLIFY]:** descobrir e popular os IPs do proxy (D-01, item 2.3); configurar rate
  limiting de borda de `/ready` (CR-09, 3.2/3.3); TLS + domínio (4.1); executar migrations como etapa controlada
  (5.1/5.2); e **todas** as validações no ambiente real (§6 — spoofing de XFF, CR-09, origin não-direto, smoke).
- **Exigem decisão real de Infra/Ops [INFRA/OPS]:** topologia que dá ao proxy endereço **estável** sem confiar na
  rede inteira (D-02, 2.4 — **AD de rede**, jamais `10.0.0.0/8`); manter API/Banco internos (1.2/1.3/4.5); prova de
  origin não alcançável direto (2.5); política de rollback imagem↔migration (7.3); registrar a task técnica de CR-09 (3.4).
- **Já resolvido por código [CÓDIGO]:** resolução de IP por socket + XFF só de proxy confiável; recusa de CIDR/`*`/IP
  inválido no boot; fail-fast de produção sem proxy/opt-in; boot não migra; conexão preguiçosa; contrato
  `/health`·`/ready`·`/healthz`; payloads sanitizados; Web `standalone`.

Enquanto **CR-09, D-01 e D-02** seguirem abertos sem verificação no ambiente real (ou decisão de aceitação de risco
registrada), o relatório de prontidão **não pode** marcar `STAGING APPROVED`. (D-05 rate-limiter/agendador e D-06 são
code-advanceable e ficam fora deste checklist de borda — ver o dossiê L6.)
