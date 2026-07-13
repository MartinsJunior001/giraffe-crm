---
story_key: 1-4-login-e-resolucao-inicial-da-organizacao
epic: 1
status: done
gate_seguranca: RATIFICADO em 2026-07-13 (G1–G6)
---

# Story 1.4 — Login e resolução inicial da Organização

**As a** usuário,
**I want** autenticar-me e ser colocado numa Organização válida (ou num estado honesto sem Organização),
**So that** eu opere somente num contexto válido, sem troca silenciosa.

**Status: done** (encerrada em 2026-07-13). O gate de Segurança (G1–G6) foi **ratificado em
2026-07-13**; a implementação passou por duas rodadas de Code Review e por re-revisão com três
agentes adversariais, e foi integrada à `main` pelo **PR #3** (merge commit `2fd7185`, `--no-ff`),
com o **CI da `main` verde** (Qualidade, Testes contra PostgreSQL real, Containers, Segurança). Débitos
que seguem para o gate de staging estão registrados em `gates/1-4/summary.md` (CR-09, D-01, D-02,
D-03, D-05). O parágrafo abaixo preserva o registro histórico do porquê o documento parou na fronteira
até o gate ser ratificado.

O épico exigia que *"limite de tentativas e política de rate limit"* fossem **definidos por Segurança
antes da implementação**. Até a ratificação o documento parou na fronteira, de propósito: escolher os
números por conta própria seria decidir política de segurança em nome de quem tem a autoridade — e
alterar requisito em silêncio.

---

## Acceptance Criteria (do épico, sem alteração)

- **AC1** — Credenciais válidas + Membership ativa ⇒ entra na Organização permitida e chega ao Dashboard (RN-011).
- **AC2** — Credenciais inválidas ⇒ rejeitado **sem revelar se a conta existe**.
- **AC3** — Sem Membership ativa ⇒ estado autenticado **sem Organização**, não o Dashboard.
- **AC4** — Múltiplas Memberships e nenhum contexto válido ⇒ **seleção explícita**, nunca escolha silenciosa.
- **AC5** — `activeOrganizationId` inválido/suspenso/inacessível ⇒ **limpa o contexto** e exige nova seleção.

Rastreabilidade: FR-1; RN-011; NFR-1/2/3/4; AD-7, AD-9; UX (Login / Estados de sessão).
Dependências: 1.2 (RLS) e 1.3 (contexto). Fora do escopo: logout e proteção de rotas (1.5), troca
posterior de Organização (1.9), recuperação de senha (1.10).

---

## O que a Story 1.3 já deixou pronto para esta

Esta Story é, em boa medida, **preencher um buraco que já foi deixado com a forma certa**:

- `PrincipalProvider` (`kernel/context/principal.provider.ts`) é um **port**. Hoje a única
  implementação é `SemSessaoPrincipalProvider`, que devolve `null` — e é por isso que toda rota de
  domínio responde 401. A Story 1.4 substitui **essa classe**, e mais nada: o guard e o resolvedor
  não mudam uma linha.
- `OrgContextResolver` **já implementa AC3, AC4 e AC5** no servidor: sem Membership ativa ⇒ nega;
  múltiplas sem indicação ⇒ nega (não adivinha); `orgId` que não casa com Membership ativa ⇒ 403.
  O que falta é a **superfície de UX** correspondente (o "estado autenticado sem Organização" e a
  tela de seleção), não a regra.

Isso foi deliberado: a Story 1.3 nasceu antes do login por decisão do épico, e a inversão de
dependência existia justamente para que este momento fosse uma substituição, não uma cirurgia.

---

## GATE DE SEGURANÇA — RATIFICADO (2026-07-13)

| # | Política ratificada |
| - | ------------------- |
| G1 | Máximo de **5 falhas** por **identificador de conta** em 15 min. |
| G2 | Máximo de **20 solicitações** de login por **IP** em 15 min. |
| G3 | Ao exceder: **429** com `X-Retry-After`, mensagem **neutra**, **sem bloqueio permanente da conta**. |
| G4 | Login bem-sucedido limpa **somente** o contador de **falhas do identificador** — **não** limpa o antiabuso do IP. |
| G5 | Respostas, status **e logs** não podem revelar se a conta existe. |
| G6 | Escopo **desta** Story: apenas os endpoints de autenticação efetivamente introduzidos por ela. Recuperação de senha e verificação recebem regras próprias **nas Stories responsáveis** — sem antecipar escopo (Constitution II). |

Duas razões que mudam o desenho, e por isso ficam escritas:

- **G3 — bloquear a conta seria um autogol.** Bloqueio permanente transforma o rate limit numa arma
  de negação de serviço **contra o usuário legítimo**: basta o atacante errar a senha 5× no e-mail da
  vítima para deixá-la de fora.
- **G1 e G2 são separados de propósito.** Um atacante com uma lista de e-mails, testando uma senha
  comum em cada um, **nunca estoura o limite por conta** — só o limite por IP o pega. E o G4 existe
  porque, se o sucesso limpasse o contador de IP, bastaria ao atacante intercalar um login válido
  próprio a cada N tentativas para zerar o antiabuso.

---

## `context7-check` — o achado que muda a implementação

**Pergunta feita antes de escrever código:** o rate limiter nativo do Better Auth conta *solicitações*
ou apenas *falhas*? E ele consegue chavear por identificador de conta?

**Resposta, na fonte** (`packages/core/src/utils/ip.ts` e o schema da tabela `rateLimit`):

```ts
export function createRateLimitKey(ip: string, path: string): string {
  return `${ip}|${path}`;   // ← a chave é IP + rota. Nada de identificador.
}
```

e o campo do schema é `count: "Number of requests made in the current window"`.

Portanto, **o nativo conta SOLICITAÇÕES e chaveia por IP + rota**. Consequência direta:

| Regra | Quem implementa |
| ----- | --------------- |
| **G2** (solicitações por IP) | ✅ O rate limiter **nativo**, com `customRules` na rota de login. |
| **G1** (**falhas** por **identificador**) | ❌ O nativo **não faz e não tem como fazer**. Exige **contador próprio**. |

Se tivéssemos presumido que o `rateLimit` do Better Auth cobria o gate inteiro, G1 simplesmente **não
existiria** — e a proteção contra força bruta dirigida a uma conta específica seria uma linha de
configuração que não faz nada. É exatamente o tipo de segurança de fachada que passa em code review
porque *parece* configurada.

### Decisões técnicas obrigatórias (todas ratificadas)

1. **`storage: "database"`** no Better Auth. O padrão é `"memory"`, e memória (a) **não sobrevive a
   restart** — o atacante zera a contagem esperando o container reciclar — e (b) **não é compartilhada
   entre instâncias**: com 3 réplicas, o limite efetivo triplica. Implica **tabela nova** (`rateLimit`)
   e **migration Prisma versionada** ⇒ `migration-check` **e** `backup-check` entram no escopo.
2. **Contador de falhas por identificador (G1), próprio**, chaveado por **HMAC** do identificador
   **normalizado** — nunca o e-mail bruto. O e-mail é PII: guardá-lo em claro numa tabela de
   contadores cria um segundo cadastro de e-mails, fora do controle do `Account`, e transforma um
   dump dessa tabela numa lista de usuários. O segredo do HMAC vem do ambiente/cofre.
3. **Nunca registrar** e-mail, senha ou a chave do contador em log.
4. **Resolução de IP pelo proxy confiável do Coolify.** Não confiar em `X-Forwarded-For` enviado
   direto pelo cliente — se confiarmos, o atacante forja o header e **cada requisição vem de um IP
   novo**, e o G2 vira decoração. **Teste de spoofing obrigatório.**
5. **Manter o antiabuso nativo por IP separado do contador de falhas por identificador** — são dois
   mecanismos com propósitos distintos (G1/G2), e fundi-los reintroduz o furo que a separação fecha.

### Testes exigidos pelo gate (nenhum deles é opcional)

- spoofing de `X-Forwarded-For` **não** contorna o G2;
- **múltiplas instâncias** compartilhando o mesmo storage respeitam o limite;
- **reinício** da aplicação **não zera** os limites;
- conta **inexistente** não permite enumeração (resposta, status **e** tempo);
- um atacante **não consegue bloquear permanentemente** a conta de outro (G3);
- **concorrência** na atualização dos contadores (duas falhas simultâneas não "perdem" contagem).

---

## Riscos já identificados (para o `pre-implementation-check`)

- **AC2 vs. timing attack:** responder "credenciais inválidas" de forma idêntica não basta se o
  caminho da conta inexistente for mensuravelmente mais rápido (sem hash de senha para verificar).
  O Better Auth trata isso, mas **precisa ser confirmado na versão fixada** e coberto por teste.
- **AC5 e a fronteira com a 1.3:** o `activeOrganizationId` é o `x-org-id` de hoje, agora persistido
  na sessão. Ele continua sendo **pedido, não autoridade** — o `OrgContextResolver` segue sendo quem
  decide. Um `activeOrganizationId` de sessão que fosse tratado como autoridade reabriria
  exatamente o buraco que a 1.3 fechou.
- **Migração de `MembershipState`:** a 1.3 fez `SUSPENDED` deixar de conceder contexto. A 1.4
  precisa garantir que uma **sessão já emitida** não sobreviva à suspensão (isto é AC da 1.5, mas a
  decisão de desenho é aqui).

---

## Próximo passo

1. ~~Ratificar G1–G6~~ — **feito** (2026-07-13).
2. ~~`context7-check` do Better Auth~~ — **feito**: o nativo não cobre G1.
3. `pre-implementation-check` → Spec Kit (`specify → clarify → plan → checklist → tasks → analyze`).

### Antigo (superado)

1. Ratificar G1–G6 (ou substituí-los).
2. `context7-check` da versão fixada do Better Auth.
3. `pre-implementation-check` → só então `speckit-specify`.
