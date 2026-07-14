# L6 — Dossiê de hardening de staging (débitos bloqueadores de `STAGING APPROVED`)

> Artefato de **planejamento/governança de release** (não normativo). **Não** altera PRD/UX/Architecture
> Spine/`epics.md`/`sprint-status.yaml` nem status de Story. Consolida, num só lugar, os cinco débitos
> do **L6 — Recuperação e Observabilidade** que, hoje, impedem declarar `STAGING APPROVED` — pré-condição
> do objetivo terminal **"GIRAFFE CRM CORE MVP — READY FOR DEPLOY"**.
>
> Fontes autoritativas consolidadas aqui (sem substituí-las): `gates/1-4/summary.md` §11 (origem de
> CR-09/D-01/D-02/D-05), `gates/1-5/summary.md` (registro formal e realocação de D-06),
> `mvp-core-triage.md` (L6 cross-cutting P0), `l1-contratos-congelados.md` §3–§4 (fila obrigatória e regra
> de antecipação), `gates/2-1/debitos-gerados.md` (confirmação de que a 2.1 não toca nenhum deles).
>
> Data: 2026-07-13 · Autor: Planejador L6 (worktree isolado). Este dossiê **não** marca nenhum débito
> como resolvido; todos seguem visíveis em todos os checkpoints até correção provada.

---

## 1. Panorama — dois grupos, uma fila

Todos os cinco débitos **bloqueiam `STAGING APPROVED`**. Eles se separam por **como** podem ser fechados:

- **Code-advanceable agora** — avançam por **código + Spec Kit** (BMAD → `specify → clarify → plan →
  checklist → tasks → analyze` → implementação sob gates), **sem** depender de configuração de
  infraestrutura externa. São: **D-06** (rate limiter de autenticação) e **D-05** (agendador do
  `db:cleanup`).
- **Coolify-dependente** — bloqueados por **configuração de proxy/IPs do Coolify** e por **verificação
  contra o ambiente real de staging**. Nenhum fecha só com código: exigem uma decisão/ação de Infra/Ops
  no ambiente. São: **CR-09** (`/ready` na borda), **D-01** (IPs do proxy) e **D-02** (CIDR/IP dinâmico).

> Nuance registrada (não apagada): **CR-09** tem um componente de código possível (um rate limiter de
> aplicação para `/ready`), mas a **decisão ratificada pelo usuário** é que a proteção seja **na borda** e
> **não** por autenticação — logo, o critério de aceite depende da borda (Coolify), e por isso CR-09 é
> classificado como Coolify-dependente. Ver §4.

---

## 2. Tabela-mestra dos 5 débitos (seis campos do padrão do projeto)

Campos: **impacto · justificativa · responsável · lote-alvo · critério de correção · gate**.

### D-06 — rate limiter transacional de autenticação pode retornar 500 sob rajada a `/api/auth/*`  · CODE-ADVANCEABLE

| Campo | Conteúdo |
|---|---|
| **Impacto** | Disponibilidade degradada sob rajada **concorrente** a `/api/auth/*`: o rate limiter do Better Auth (`storage: 'database'`, `apps/api/src/kernel/auth/auth.factory.ts` §119) abre **uma transação por requisição** (`incrementOne` → `_transactionWithCallback`); as transações competem pelo pool e parte das requisições recebe **HTTP 500** em vez do **429** correto. **Fail-closed** — nega acesso, nunca concede; **não** é falha de isolamento, autenticação ou autorização. Herdado da 1.4 (pré-existente; não introduzido pela 1.5). Não afeta o login/logout normal (um por vez). |
| **Justificativa** | Registrado como bloqueador para não ser esquecido. Não foi corrigido na 1.4/1.5 porque a correção pertence à decisão de rate limiting de borda/hardening (L6) e, feita dentro daquelas Stories, anteciparia escopo e provavelmente seria refeita. |
| **Responsável** | **Trilha A / Backend** — dono de `apps/api/src/kernel/auth/*` e da configuração do rate limiter. Acompanhamento pelo Integration Agent no gate de staging. |
| **Lote-alvo** | **L6 — Hardening de staging** (realocado de tech-2 em 2026-07-13; `gates/1-5/summary.md`). **tech-2 = só provisionamento do 1º tenant** — D-06 está fora dele. |
| **Critério de correção** | Os **8 critérios formais** de `gates/1-5/summary.md` (seção de realocação), resumidos: (1) sob **N≥16** concorrentes a `/api/auth/*`, **zero 500** indevido; (2) todo excesso recebe **429**, sem caminho que escape da contagem; (3) contador consistente sob concorrência (sem perda/duplicação); (4) falha do backing store segue **fail-closed**; (5) sem vazamento de PII em resposta/log; (6) **teste HTTP concorrente com PostgreSQL real** (não mock); (7) **fase vermelha real** provada + mutação; (8) observabilidade separa **429 (limite)** de **500 (falha)**. |
| **Gate** | **BLOQUEIA `STAGING APPROVED`.** Só liberado com (a) mitigação implementada e provada pelos 8 critérios, **ou** (b) decisão arquitetural explícita e registrada que aceite o risco com compensação documentada. |

### D-05 — falta o agendador da coleta de lixo (`db:cleanup`)  · CODE-ADVANCEABLE

| Campo | Conteúdo |
|---|---|
| **Impacto** | A **rotina** existe, é idempotente e testada (`limparExpirados()` / `pnpm --filter @giraffe/api db:cleanup`; `login-failure.service.ts` §245), mas **falta o agendador** que a dispara periodicamente. Sem *spray* de larga escala não é urgente — as linhas de `LoginFailure`/`RateLimit` expiram **logicamente** na janela e a coleta só recupera **espaço** físico. Risco: crescimento de tabela sob volume de produção sem uma varredura periódica. |
| **Justificativa** | A coleta segura (só apaga contadores fora da janela; nunca toca um contador ainda válido — ataque em curso) já foi separada da decisão de **quando** rodá-la. O agendamento é operacional e não deve ser embutido no boot do container (mesma regra das migrations — etapa controlada, não no boot). |
| **Responsável** | **Trilha A / Backend** (dono do comando e do modelo de anti-abuso), com definição do mecanismo de agendamento junto de Infra/Ops. |
| **Lote-alvo** | **L6 — Hardening de staging.** |
| **Critério de correção** | (1) Existe um agendador **versionado** que dispara `db:cleanup` periodicamente (cron/scheduler operacional; **não** no boot do container, **não** DDL concorrente); (2) uma única definição de agendamento (sem segunda verdade); (3) execução observável (log estruturado sanitizado do evento `auth.antiabuse.cleanup` já emitido pela rotina) e falha não silenciosa; (4) idempotência preservada (2ª passada não ressuscita nem apaga contador válido) — já coberta por teste; (5) documentado o intervalo e o dono operacional. |
| **Gate** | **BLOQUEIA `STAGING APPROVED`** (item do L6). Baixa urgência funcional, mas exigido antes de volume de produção. |

### CR-09 — `/ready` precisa de rate limiting **na borda**  · COOLIFY-DEPENDENTE

| Campo | Conteúdo |
|---|---|
| **Impacto** | `GET /ready` consulta o banco (lê uma tabela do schema, `LIMIT 0`) a cada chamada. Sem rate limiting **na borda**, um atacante pode martelar `/ready` e transformar a sonda de readiness num vetor de pressão sobre o banco. |
| **Justificativa** | Restrições **ratificadas pelo usuário**: **não** proteger `/ready` com autenticação (é sonda de infra, tem de responder sem credencial) e **não** misturar essa correção com o login sem justificativa arquitetural. A proteção correta é de **borda** (proxy), não de aplicação — por isso depende do Coolify. |
| **Responsável** | **Trilha A / Backend** define o contrato/limite esperado; **Infra / Ops** configura a regra na borda do Coolify. Decisão de "onde protege" já é do usuário (borda, sem auth). |
| **Lote-alvo** | **L6 — Hardening de staging** (antecipável em trilha independente — não conflita com schema/auth; `l1-contratos-congelados.md` §4). |
| **Critério de correção** | (1) `/ready` fica atrás de rate limiting **na borda** (proxy Coolify), **sem** autenticação e **sem** acoplar ao login; (2) excesso é barrado **antes** de alcançar a aplicação/banco; (3) a sonda legítima do orquestrador **não** é bloqueada; (4) verificado **contra o ambiente real** de staging; (5) task técnica registrada (BMAD/Spec Kit) documentando a regra. |
| **Gate** | **BLOQUEIA `STAGING APPROVED`.** Exige task técnica registrada **antes** do staging. |

### D-01 — IPs confiáveis do proxy do Coolify (`TRUSTED_PROXY_IPS` vazio)  · COOLIFY-DEPENDENTE

| Campo | Conteúdo |
|---|---|
| **Impacto** | Hoje `TRUSTED_PROXY_IPS` está **vazio** (default seguro: o IP vem do socket e o `X-Forwarded-For` é ignorado — `client-ip.ts`). Em produção atrás do proxy do Coolify, sem configurar os IPs confiáveis o IP real do cliente não é resolvido corretamente — o que degrada o rate limiting por IP (G2) e qualquer decisão baseada em origem. Configurar errado é pior: reabre a forja de `X-Forwarded-For`. |
| **Justificativa** | Não é conserto de código pontual: exige **descobrir** os IPs reais do proxy do Coolify e **verificá-los contra o ambiente real**, além de **provar que o origin não é alcançável direto** — senão quem contornar o proxy volta a forjar o header. Em produção, `TRUSTED_PROXY_IPS` vazio **falha o boot** (fail-fast), salvo `ALLOW_DIRECT_EXPOSURE=true` explícito. |
| **Responsável** | **Infra / Ops** (descoberta/configuração dos IPs e topologia de rede do Coolify), com validação de segurança da Trilha A / Backend (teste de spoofing). |
| **Lote-alvo** | **L6 — Hardening de staging** (antecipável — configuração de borda, sem conflito de schema/auth). |
| **Critério de correção** | (1) `TRUSTED_PROXY_IPS` populado com os **IPs exatos** do proxy do Coolify, verificados **no ambiente real**; (2) provado que o origin **não é alcançável direto** (só via proxy); (3) **teste de spoofing no ambiente real**: `X-Forwarded-For` forjado por cliente direto é **descartado**; (4) boot fail-fast preservado (sem `ALLOW_DIRECT_EXPOSURE` em produção real). |
| **Gate** | **BLOQUEIA `STAGING APPROVED`.** |

### D-02 — IPs exatos vs. CIDR (proxy com endereço dinâmico na rede Docker)  · COOLIFY-DEPENDENTE

| Campo | Conteúdo |
|---|---|
| **Impacto** | A lista de proxies aceita **IPs exatos**, **não** faixas CIDR (curingas/CIDR são recusados; cada entrada validada por `isIP`). Se o proxy do Coolify tiver **IP dinâmico** na rede Docker, D-01 não fecha de forma estável — o IP muda e a confiança quebra. |
| **Justificativa** | Exige **decisão de arquitetura de rede**, não conveniência. A decisão **não pode** ser `10.0.0.0/8` (declararia confiável **qualquer** contêiner da rede — reabriria a forja do header por vizinho de rede). |
| **Responsável** | **Infra / Ops** propõe a topologia (IP fixo para o proxy, rede dedicada, ou mecanismo equivalente); **decisão arquitetural registrada** com validação da Trilha A / Backend. |
| **Lote-alvo** | **L6 — Hardening de staging** (antecipável — configuração de borda). |
| **Critério de correção** | (1) O proxy do Coolify tem **endereço estável e confiável** (IP fixo ou equivalente) que casa com a lista de IPs exatos; (2) **nenhuma** faixa ampla (`10.0.0.0/8` ou similar) que confie na rede inteira; (3) decisão de rede **registrada** como AD/decisão de arquitetura; (4) validado contra o ambiente real junto de D-01. |
| **Gate** | **BLOQUEIA `STAGING APPROVED`** (originalmente "avaliar no staging"; consolidado como bloqueador junto de D-01 por ser a mesma fronteira de confiança do proxy). |

---

## 3. Bloco code-advanceable — o que dá para mover agora

| Débito | Pode avançar sem infra externa? | Caminho |
|---|---|---|
| **D-06** | **Sim.** A mitigação é escolha de implementação do limiter (borda **ou** store atômico em app **ou** pool com backpressure). As opções que **não** exigem Coolify: `customStorage.consume` atômico (Better Auth 1.6 expõe `consume?` na interface de storage — ver spec), migração para `secondary-storage` (Redis), ou pool/backpressure. | BMAD → Spec Kit (`specs/d-06-rate-limiter-autenticacao/`) → implementação sob gates. **Pre-implementation-check já rodado** (§ deste dossiê / `gates/d-06/pre-implementation-check.md`) e **spec rascunho** criado. |
| **D-05** | **Sim** (o código da rotina já existe; falta o agendador versionado). Depende de escolher o mecanismo de agendamento — pode ser um scheduler in-app versionado ou um cron operacional; a decisão do mecanismo toca Ops, mas o débito **não** está bloqueado por descoberta de IP/proxy. | BMAD → Spec Kit → implementação (agendador) sob gates. |

> **Observação de coordenação (de `l1-contratos-congelados.md` §4):** D-06 toca **autenticação** e pode
> introduzir um store de limiter (possível migration se for tabela/Redis). Antecipar **somente** quando
> não houver trabalho ativo de autenticação/migration em conflito. Hoje não há. Se a mitigação exigir
> migration, **serializar** com outras migrations ativas (uma única verdade de provisionamento).

---

## 4. Bloco Coolify-dependente — o que exatamente falta e quem decide

| Débito | O que exatamente falta | Quem decide / age | Verificação obrigatória |
|---|---|---|---|
| **CR-09** | Regra de rate limiting na **borda** do proxy Coolify cobrindo `/ready`, sem auth e sem acoplar ao login. | Contrato/limite: Trilha A/Backend. Configuração: **Infra/Ops no Coolify**. Política ("borda, sem auth"): **já decidida pelo usuário**. | Testar no ambiente real que o excesso é barrado antes da app e a sonda legítima passa. |
| **D-01** | Descobrir os **IPs reais** do proxy Coolify e popular `TRUSTED_PROXY_IPS`; garantir que o origin **não** é alcançável direto. | **Infra/Ops** (acesso ao ambiente Coolify). | **Teste de spoofing no ambiente real** — sem ele, é fé, não evidência. |
| **D-02** | Decidir a **topologia de rede** que dá ao proxy um endereço **estável** (o suporte a IPs exatos não cobre IP dinâmico) — **sem** confiar na rede Docker inteira. | **Infra/Ops** propõe; **decisão de arquitetura registrada**. | Validar contra o ambiente real junto de D-01. |

**Dependência do usuário/Coolify (o que trava hoje):** os três acima precisam de **acesso ao ambiente
Coolify de staging** e de **decisões de Infra/Ops** (IPs do proxy, topologia de rede, regra de borda).
Nenhum fecha só com código neste repositório. É o principal bloqueio externo para `STAGING APPROVED`.

---

## 5. Lacuna de governança

**O que já tem dono e critério formal:** os cinco débitos têm responsável e gate registrados em
`l1-contratos-congelados.md` §3 e (para D-06) os 8 critérios em `gates/1-5/summary.md`. D-05, CR-09, D-01,
D-02 têm critério de aceite na origem (`gates/1-4/summary.md` §11), aqui consolidado e refinado nos seis
campos.

**Lacunas remanescentes:**

1. **Nenhum dos cinco está inscrito por workflow BMAD como item de sprint/Story do L6.** Eles vivem só em
   artefatos de planejamento/gates. Para virarem trabalho executável e rastreável, precisam entrar pelo
   **workflow BMAD apropriado** (sprint-planning / create-story do L6) — este dossiê **não** faz essa
   inscrição (a implementação/planejador não edita `sprint-status.yaml` nem `epics.md`).
2. **D-02 nasceu como "avaliar no staging"** e só foi consolidado como bloqueador em
   `l1-contratos-congelados.md`. Falta a **decisão de arquitetura de rede** formal (AD) que fixe a
   topologia do proxy — hoje é uma pendência sem AD.
3. **CR-09 não tem task técnica registrada** ainda, embora seja pré-condição explícita ("exige task
   técnica antes do staging"). Falta o item BMAD/Spec Kit correspondente.
4. **D-01/D-02 dependem de acesso a um ambiente Coolify que ainda não foi confirmado como disponível**
   nos artefatos — falta registrar quem, quando e com que credenciais fará a verificação no ambiente real.
5. **O relatório de prontidão de staging (`STAGING APPROVED`) em si** não existe como artefato preenchido;
   existe a **regra** de que ele não pode aprovar com débito aberto. Falta o dono do relatório de
   prontidão (Integration Agent) abrir o documento e listar os cinco como bloqueadores vivos.

**O que impede `STAGING APPROVED` hoje (resumo):** os **cinco** débitos estão **ABERTOS**. Dois
(D-06, D-05) podem ser fechados por código+Spec Kit sem infra externa; três (CR-09, D-01, D-02) estão
**bloqueados por decisão/configuração de Infra/Ops no Coolify e verificação no ambiente real**. Enquanto
qualquer um seguir aberto sem mitigação provada ou decisão de aceitação de risco registrada, o relatório
de prontidão **não pode** marcar `STAGING APPROVED`.

---

## 6. Próximo passo recomendado (não executado por este dossiê)

1. Inscrever os cinco débitos como itens do L6 pelo **workflow BMAD** (sprint-planning do L6).
2. **D-06:** seguir do `pre-implementation-check` (já rodado) e do `spec` rascunho para
   `clarify → plan → checklist → tasks → analyze` e implementação sob gates.
3. **D-05:** abrir Spec Kit do agendador.
4. **CR-09/D-01/D-02:** escalar para Infra/Ops a obtenção de acesso ao Coolify de staging e as decisões de
   borda/IP/rede; registrar a decisão de rede (D-02) como AD.
