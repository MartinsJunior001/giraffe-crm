# context7-check — Story 1.4

2026-07-13 · Status: **APROVADO COM ACHADOS** · Fonte: MCP do Context7 (`/better-auth/better-auth`)

Baseline: **better-auth 1.6.23**, a versão efetivamente instalada (`apps/api/package.json`,
`pnpm-lock.yaml`). NestJS 11, Prisma 6.19.3, Node 24. Nada assumido de memória.

## Achado 1 — o rate limiter nativo NÃO cobre o G1 (muda a implementação)

**Pergunta:** ele conta *solicitações* ou apenas *falhas*? Consegue chavear por identificador?

**Na fonte** (`packages/core/src/utils/ip.ts` e o schema de `rateLimit`):

```ts
export function createRateLimitKey(ip: string, path: string): string {
  return `${ip}|${path}`;      // chave = IP + rota. Nenhum identificador.
}
```

e o campo é `count: "Number of requests made in the current window"`.

| Regra | Quem implementa |
| ----- | --------------- |
| **G2** — 20 **solicitações** por **IP**/15 min | ✅ nativo (`rateLimit.customRules`) |
| **G1** — 5 **falhas** por **identificador**/15 min | ❌ **impossível no nativo**. Contador próprio. |

Se tivéssemos presumido que o `rateLimit` cobria o gate inteiro, o G1 **não existiria** — e a
proteção contra força bruta dirigida a uma conta específica seria uma linha de configuração que não
faz nada. Segurança de fachada passa em code review porque *parece* configurada.

## Achado 2 — colisão de model: o Better Auth declara um `Account`

O schema Prisma gerado pelo Better Auth declara **`model Account`** (tabela `account`) para guardar
hash de senha e vínculos de provedor. Nós já temos `Account` — a identidade global do AD-10, à qual
`Membership` se liga. **Nome de model em Prisma é único: a colisão é concreta.**

Decisão em `plan.md` D1: o `user` do Better Auth **é** o nosso `Account`
(`user: { modelName: 'Account' }`), e o `account` dele vira `AuthCredential` — nome que diz a verdade
sobre o que a tabela guarda. Uma identidade, uma tabela. A alternativa (duas tabelas de pessoas
sincronizadas para sempre) é a dívida que termina em "o usuário X viu os dados do usuário Y".

## Achado 3 — `trustedProxies` existe nativamente (D5)

```ts
advanced: {
  ipAddress: {
    trustedProxies: ['192.0.2.10', '10.0.0.0/24'],  // endereços DOS PROXIES
    ipAddressHeaders: ['x-real-ip'],
  }
}
```

A própria documentação adverte: *"your proxies' addresses, **not a broad private range that also
covers clients**"* — que é exatamente a armadilha do D5. Sem proxy confiável configurado, o IP vem do
socket; `X-Forwarded-For` do cliente nunca é fonte de verdade.

## Achado 4 — `storage: 'memory'` é o padrão, e é teatro em produção

Memória (a) **não sobrevive a restart** — o atacante zera a contagem esperando o container reciclar —
e (b) **não é compartilhada entre instâncias**: com 3 réplicas, o limite efetivo **triplica**.
⇒ `storage: 'database'`, tabela `rateLimit`, **migration versionada**. `migration-check` e
`backup-check` entram no escopo.

## Divergências entre documentação e plano

Nenhuma. As quatro descobertas **entraram** no plano antes de qualquer linha de código.
