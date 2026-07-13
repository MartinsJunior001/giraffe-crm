---
story_key: 1-4-login-e-resolucao-inicial-da-organizacao
epic: 1
status: blocked-por-gate
gate_bloqueador: 'Segurança: limite de tentativas e política de rate limit (epics.md, Story 1.4)'
---

# Story 1.4 — Login e resolução inicial da Organização

**As a** usuário,
**I want** autenticar-me e ser colocado numa Organização válida (ou num estado honesto sem Organização),
**So that** eu opere somente num contexto válido, sem troca silenciosa.

**Status: BLOQUEADA POR GATE.** O épico é explícito: *"limite de tentativas e política de rate limit
definidos por Segurança **antes da implementação**"*. Este documento vai até a fronteira desse gate e
para. Escolher os números por conta própria seria decidir política de segurança em nome de quem tem
a autoridade para isso — e alterar requisito em silêncio.

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

## GATE BLOQUEADOR — decisão de Segurança pendente

O épico exige a política **antes** da implementação. Abaixo está uma **proposta** para ratificação,
não uma decisão tomada. Nada será implementado com estes números até que sejam confirmados.

### O que precisa ser decidido

| # | Decisão | Proposta (a ratificar) | Por que importa |
| - | ------- | ---------------------- | --------------- |
| G1 | Limite de tentativas de login por **identificador** (e-mail) | 5 tentativas / 15 min | Protege uma conta específica de força bruta dirigida. |
| G2 | Limite por **IP** | 20 tentativas / 15 min | Protege contra varredura de muitas contas a partir de uma origem. Separado de G1 de propósito: um atacante com uma lista de e-mails nunca estoura o limite *por conta*. |
| G3 | Ação ao estourar | **429 + atraso**, sem bloqueio permanente de conta | Bloquear a conta transforma o rate limit numa **ferramenta de negação de serviço contra o usuário legítimo**: basta o atacante errar a senha 5× no e-mail da vítima. |
| G4 | Janela e reset | Janela deslizante; reset em login bem-sucedido | — |
| G5 | O 429 revela se a conta existe? | **Não** — resposta idêntica para conta existente e inexistente | AC2. Um rate limit que só dispara para contas reais é um **oráculo de enumeração**. |
| G6 | Escopo do rate limit | Login, recuperação de senha e reenvio de verificação | Todas as rotas que aceitam um identificador não autenticado. |

### Decisão técnica que acompanha o gate (verificada no Context7)

O Better Auth traz rate limiting nativo (`rateLimit`, com `customRules` por rota). **Mas o `storage`
padrão é `"memory"`** — e memória:

1. **não sobrevive a restart** (um atacante reinicia a contagem batendo até o container reciclar);
2. **não é compartilhada entre instâncias** (com 3 réplicas, o limite efetivo triplica).

Para um limite que signifique alguma coisa em produção, o `storage` precisa ser `"database"` (ou
Redis, quando existir). Isso implica **uma tabela nova** (`rateLimit`) e, portanto, **uma migration**
— o que traz `migration-check` para dentro do escopo desta Story.

Registro isso agora porque é o tipo de detalhe que, descoberto durante a implementação, vira "ah,
mas funciona local" — e vai para produção sendo teatro.

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

1. Ratificar G1–G6 (ou substituí-los).
2. `context7-check` da versão fixada do Better Auth.
3. `pre-implementation-check` → só então `speckit-specify`.
