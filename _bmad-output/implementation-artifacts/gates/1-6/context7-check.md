# context7-check — Story 1.6 (CASL)

## Tecnologia e versão (baseline do projeto)
`@casl/ability` **7.0.1** — fixada em `apps/api/package.json` (`^7.0.1`) e no `pnpm-lock.yaml` por este
`pnpm --filter @giraffe/api add`. Baseline = versão efetivamente instalada (não de memória).

## Fonte consultada
Context7 MCP — `resolve-library-id` → `/stalniy/casl` (539 snippets; a biblioteca canônica do CASL) →
`query-docs`. Documentação oficial do repositório `stalniy/casl` (guias `define-rules`,
`subject-type-detection`, `debugging-testing`).

## API confirmada (o que será usado)
```ts
import { AbilityBuilder, createMongoAbility, subject } from '@casl/ability';

// Fábrica recomendada pela doc oficial para permissões custom (nosso caso: (papel, orgId) → ability):
const { can, cannot, build } = new AbilityBuilder(createMongoAbility);
can('read', 'Recurso', { orgId });      // conditions tipo-Mongo casam com o escopo de Organização
const ability = build();

// deny-by-default é NATIVO: sem rule que case, ability.can(...) === false. NÃO reimplementar.
ability.can('read', subject('Recurso', dto)); // subject() resolve o tipo para objetos simples (DTOs)
```

## Verificações
- **deny-by-default**: confirmado como comportamento nativo — a ausência de rule casável faz `can()`
  retornar `false`. É exatamente o modo de falha exigido pela AC1; não há código próprio de "negar por
  padrão" a escrever (só a prova por teste, incluindo a fase vermelha).
- **`createMongoAbility` vs `PureAbility`**: usamos `createMongoAbility` porque as `conditions` usam
  sintaxe tipo-Mongo (`{ orgId }`), casamento natural com o escopo de Organização (AC2). Confirmado na
  doc (`AbilityBuilder(createMongoAbility)`).
- **`subject()` helper**: confirmado para detecção de tipo de subject em objetos simples — necessário
  porque os DTOs do domínio não carregam a classe/tipo automaticamente.
- **Tipagem**: `MongoAbility<[Action, Subject]>` como tipo do contrato (`AppAbility`). Compatível com
  TypeScript estrito (`strict` + `noUncheckedIndexedAccess`) do projeto.

## Divergências com o plano
Nenhuma. A API atual do CASL 7 corresponde ao desenho do `plan.md` (P1–P5). Nenhuma assinatura foi
assumida de memória; nenhuma opção inventada.

## Peer dependencies
`@casl/ability` 7.0.1 não introduz conflito de peer novo relevante. O WARN de `zod@^4` vem de
`better-call` (transitiva do Better Auth, pré-existente à Story 1.4) e não é afetado por esta adição.

## Veredito
**APROVADO** — documentação oficial verificada para a versão instalada (7.0.1); API confirmada; sem
divergência com a arquitetura. Liberado para implementação.
