# Story 1.4 — Relatório consolidado dos gates

**Story:** 1.4 — Login e resolução inicial da Organização
**Branch:** `story/1-4-login-e-resolucao-inicial-da-organizacao`
**Data da consolidação:** 2026-07-13

> Este é o relatório **principal**. Os arquivos separados (`context7-check.md`,
> `pre-implementation-check.md`) existem porque precisam de reprodução detalhada; o resto está aqui,
> para não multiplicar documentos que dizem a mesma coisa.

---

## 1. Veredito dos gates

| Gate                    | Resultado | Evidência                                                       |
| ----------------------- | --------- | --------------------------------------------------------------- |
| context7-check          | ✅        | `context7-check.md` — achado que mudou o plano (ver §2)          |
| pre-implementation      | ✅        | `pre-implementation-check.md` — `READY FOR IMPLEMENT`            |
| build e testes          | ✅        | API **169/169**, Web **8/8**, exit 0                             |
| security-check          | ✅        | §4 — 4 defeitos de segurança encontrados e corrigidos            |
| lgpd-check              | ✅        | §5 — nenhum e-mail em claro, em banco ou log                     |
| observability-check     | ✅        | §6                                                               |
| migration-check         | ✅        | §7 — defeito de rollback encontrado e corrigido                  |
| backup-check            | ✅        | §8 — backup + restore com RLS e GRANTs íntegros                  |
| Docker + smoke + Trivy  | ✅        | §9 — volume novo, 3 healthy, smoke 4/4, 0 vuln Node              |
| performance-check       | N/A       | §10 — justificado                                                |

---

## 2. O que o `context7-check` mudou (antes de existir código)

Duas descobertas entraram no plano **antes** da implementação:

1. O rate limiter nativo do Better Auth chaveia por `${ip}|${path}` e conta **solicitações**, não
   falhas. Ele é **incapaz** de implementar o G1 (falhas por identificador). Daí o contador próprio.
2. O model `account` do Better Auth **colide** com o nosso `Account`. Daí a decisão D1 (`user` →
   `Account`, `account` → `AuthCredential`).

---

## 3. Testes e evidências de execução real

```
frozen-lockfile = 0    format = 0    lint = 0    typecheck = 0    build = 0
testes: API 169/169 · Web 8/8 · exit 0   (suíte executada 2× consecutivas: hermética)
```

### Testes de mutação (a defesa falha quando é removida?)

| Defesa                                  | Mutação plantada                         | Resultado          |
| --------------------------------------- | ---------------------------------------- | ------------------ |
| Resolução de IP pelo socket             | header do cliente passa direto            | **1 teste vermelho** (401 em vez de 429) |
| Sobreposição da rotação HMAC            | ignora a chave anterior                   | **3 testes vermelhos** (contagem reinicia do zero) |
| Incremento atômico do G1                | `SELECT`-depois-`UPDATE`                  | **2 testes vermelhos** (`[1,2,5,5,5]`) |

---

## 4. security-check

### Defeitos de segurança encontrados **e corrigidos** nesta Story

| # | Defeito                                                                                                    | Como apareceu             |
| - | ---------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1 | **Spoofing de IP.** `getIp()` do Better Auth resolve IP só por header e, sem `trustedProxies`, aceita um `X-Forwarded-For` de valor único. Um IP forjado por requisição fazia o **G2 nunca disparar**. Configurar `trustedProxies` não fecha: a lib nunca vê o socket, e quem alcança o contêiner direto forja igual. | teste de spoofing HTTP    |
| 2 | **`X-Retry-After` nunca era emitido.** Ia dentro do *body* do `APIError` (tipado `Record<string, any>` — o TS aceitou calado) em vez do 3º argumento. O G3 não estava cumprido. | teste HTTP                |
| 3 | **CSRF sem allowlist.** `trustedOrigins` default = `baseURL` (:3001). Como o login vem do navegador na Web (:3000), **todo login do front seria recusado** — e a proteção nunca tinha sido exercida. | container de produção     |
| 4 | **Seed com senha conhecida sem trava.** `db:seed` é manual, a um comando de distância do banco errado. | commit-check              |

**Correção estrutural do #1:** a resolução do IP saiu da biblioteca e passou para a nossa fronteira
(`kernel/auth/client-ip.ts`): o endereço do **socket** é o único dado que o cliente não pode
falsificar, e só a nossa camada HTTP o enxerga. O `X-Forwarded-For` só é lido quando o peer é um
proxy explicitamente confiável, e a cadeia é lida **da direita para a esquerda** (a ponta esquerda é
a que o atacante controla).

### Invariantes verificadas no banco real

- `giraffe_app` (runtime) **não tem** `BYPASSRLS` nem `SUPERUSER`. `giraffe_migrator` também não.
- RLS `ENABLE` **e** `FORCE` em `Organization` e `Membership`. Confirmado após restore.
- **`Account`: só `SELECT`** para o runtime. Sem `DELETE` — a cascata da FK apagaria Memberships de
  todas as Organizações (ações referenciais rodam com bypass de row security).
- **`AuthCredential`: sem `DELETE`.** O runtime não pode apagar credencial.
- `Organization`: sem `INSERT`/`DELETE` para o runtime.

### Enumeração de contas (G5)

Provado **no container de produção**: senha errada e conta inexistente devolvem **o mesmo status e o
mesmo corpo**. O 429 do G1 dispara também para conta inexistente — um limite que só valesse para
contas reais seria o mesmo oráculo de enumeração, com passos extras.

### Autocadastro

`disableSignUp: true`. Ligar `emailAndPassword` habilita `/sign-up/email` junto; esta Story entrega
**login**, e contas entram por convite do Admin (Épico 8).

---

## 5. lgpd-check

- **Nenhum e-mail em claro** na tabela de contadores: a chave é `HMAC-SHA256("login:" + e-mail
  normalizado)`. Em claro, `LoginFailure` seria um segundo cadastro de e-mails fora do `Account`, e
  um dump dela seria uma lista de usuários. **Testado** varrendo a tabela inteira.
- **Nenhum e-mail nos logs** — nem em claro, nem hasheado. A chave HMAC é identificador estável de
  uma pessoa, logo PII pseudonimizada, correlacionável entre logs. O log carrega `count` e
  `bloqueado`, que é o que o operador precisa.
- **Nenhum segredo nos logs.** Testado explicitamente contra o segredo atual e o anterior.
- Senhas: hash pelo algoritmo do próprio Better Auth (não uma reimplementação). Nunca em log, erro,
  métrica ou resposta.
- Dados de teste: domínio `.test` (RFC 2606, não roteável). Nenhum dado real.

---

## 6. observability-check

| Evento              | Nível | Conteúdo                                  |
| ------------------- | ----- | ----------------------------------------- |
| `auth.login.failed` | warn  | `count`, `countAtual`, `bloqueado`        |
| `context.resolved`  | info  | Organização resolvida                     |
| `context.denied`    | warn  | motivo da negação                         |
| `context.missing`   | error | método + path (query removida)            |
| `db.unreachable`    | warn  | `/ready` respondendo 503                  |

Redaction de `authorization`, `cookie`, `set-cookie`. Probes (`/health`, `/ready`) fora do log de
requisição. Nenhum payload expõe versão, variável, path ou segredo.

---

## 7. migration-check

**Defeito encontrado e corrigido:** o rollback derrubava as tabelas mas **não removia a linha de
`_prisma_migrations`**. O `deploy` seguinte respondia `"No pending migrations to apply"` com **exit
0**, e o banco ficava sem as tabelas enquanto a ferramenta afirmava sucesso. Um rollback do qual não
se pode voltar não é rollback — e só aparece com **duas** migrations, ou seja, descobre-se no
incidente em que se recorreu a ele.

`migrate resolve --rolled-back` não serve (`P3012`: só aceita migration em estado `FAILED`).

**Ciclo provado em banco descartável** (o de desenvolvimento não foi tocado):

| Passo         | Tabelas | Exit |
| ------------- | ------- | ---- |
| banco vazio   | 0       | —    |
| migration     | **9**   | 0    |
| rollback      | 4       | 0    |
| reaplicação   | **9**   | 0    |

Migrations continuam sendo **etapa controlada** (`db:migrate`), nunca no boot do container. Nenhum
`prisma db push`. Runtime **não possui** a credencial do migrator.

---

## 8. backup-check

`pg_dump -Fc` → **DROP DATABASE** → `pg_restore`. Depois do restore:

- dados: **3 orgs, 7 contas, 5 credenciais, 6 memberships** — exatamente o seed;
- **RLS sobreviveu**: `Organization` e `Membership` com `relrowsecurity` e `relforcerowsecurity` = `t`;
- **GRANT sobreviveu**: `Account` continua **`SELECT`** apenas para o runtime.

Um restore que devolvesse os dados mas perdesse RLS ou GRANT seria um vazamento cross-tenant
disfarçado de recuperação bem-sucedida. Por isso as três coisas são verificadas, não só as linhas.

---

## 9. Docker, smoke e Trivy

**Volume destruído (`down -v`) e recriado do zero:**

- `db`, `api`, `web` → todos `healthy`;
- `/ready` respondeu **503** enquanto o schema não existia (a sonda prova migrations aplicadas, não
  só socket aberto), e **200** depois do `db:migrate`;
- `pnpm smoke` → **4/4**.

**Prova de login contra a imagem de produção** (não o ambiente de teste):

| Cenário                                        | Resultado                                |
| ---------------------------------------------- | ---------------------------------------- |
| login válido (Origin da Web)                    | **200** + cookie de sessão               |
| `/organizations/current` com a sessão           | **200** → Organização A                  |
| `/organizations/current` sem sessão             | **401**                                  |
| senha errada                                    | **401**, corpo neutro                    |
| conta inexistente                               | **401**, **corpo idêntico** ao anterior  |
| login com `Origin` maliciosa                    | **403** `INVALID_ORIGIN`                 |
| 21ª tentativa com `X-Forwarded-For` forjado     | **429** + `X-Retry-After: 900`           |

**Trivy (HIGH/CRITICAL):** **zero vulnerabilidades em pacotes Node** nas duas imagens. O único
achado corrigível era `undici` (CVE-2026-12151), que vinha do **npm embutido na imagem base** — não é
dependência nossa. Removidos `npm`/`npx`/`corepack` das imagens finais: o runtime só executa
`node dist/main.js`, e um gerenciador de pacotes em produção é uma ferramenta de instalar código
arbitrário à disposição de quem obtiver execução no contêiner.

Restam **19 CVEs da base Debian 12** (16 HIGH, 3 CRITICAL), **nenhuma com correção publicada**
(`FixedVersion` vazio) → **débito D-03**.

---

## 10. Gates N/A (justificados)

- **performance-check — N/A.** Esta Story não introduz consulta em volume, listagem paginada, job ou
  caminho de leitura de Cards/Databases. O custo acrescentado por requisição de login é: uma
  instrução SQL atômica (G1) e uma do rate limiter (G2), ambas por chave primária/única indexada.
  Reavaliar quando existir carga real de leitura (Épico 3+).

---

## 11. Débitos registrados

| ID    | Débito                                                                                      | Bloqueia staging? |
| ----- | ------------------------------------------------------------------------------------------- | ----------------- |
| CR-09 | `/ready` precisa de **rate limiting na borda**. Não proteger com autenticação; não misturar com o login sem justificativa arquitetural. **Exige task técnica antes do staging.** | **SIM**           |
| D-01  | `TRUSTED_PROXY_IPS` está **vazio**. Os endereços do proxy do Coolify precisam ser verificados **contra o ambiente real** e, junto, provar que o origin **não é alcançável direto** (senão o `X-Forwarded-For` volta a ser forjável por quem contornar o proxy). | **SIM**           |
| D-02  | A lista de proxies aceita **IPs exatos**, não faixas CIDR. Se o proxy do Coolify tiver endereço dinâmico na rede Docker, isso precisa de decisão — e a decisão **não** é "põe `10.0.0.0/8`", que declararia confiável qualquer contêiner da rede. | avaliar no staging |
| D-03  | 19 CVEs da base Debian 12 sem correção publicada. Acompanhar atualizações da imagem base. Migrar para Alpine mudaria o engine do Prisma (musl) — é decisão arquitetural, não conserto de gate. | não               |

---

## 12. Commits desta Story

| SHA       | Commit                                                                    |
| --------- | ------------------------------------------------------------------------- |
| `c4b4eca` | `docs(story-1-4)`: prepara a Story até o gate de Segurança                 |
| `1abf165` | `docs(story-1-4)`: ratifica o gate de Segurança e o achado do context7      |
| `b815bad` | `docs(story-1-4)`: corrige o status no corpo                                |
| `63b1db2` | `docs(story-1-4)`: Spec Kit, context7-check e pre-implementation-check      |
| `c316ed2` | `feat(auth)`: identidade pela sessão, com antiabuso G1 e G2                 |
| `cd3d3b7` | `fix(auth)`: conserta login e fecha spoofing de IP no limite por origem     |
| `ece23d0` | `feat(auth)`: rotaciona o segredo HMAC sem zerar o limite, e fecha o CSRF   |
| `0dacb78` | `fix(db)`: rollback remove a migration do histórico, para poder reaplicar   |
| `bb6ab27` | `build(docker)`: remove npm e corepack das imagens de produção              |

---

## 13. A lição desta Story

Os testes de unidade do G1 estavam **verdes** enquanto o login estava **100% quebrado** (500 em toda
tentativa). Três dos quatro defeitos de segurança só apareceram quando alguém bateu na porta de
verdade — e o do CSRF só apareceu na **imagem de produção**, porque o ambiente de teste relaxa a
checagem de origem.

Teste verde não é afirmação. É evidência do que ele mede — e nada além.
