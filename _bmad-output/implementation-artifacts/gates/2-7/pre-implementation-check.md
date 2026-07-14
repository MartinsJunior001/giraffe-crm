# Pre-Implementation Check — Story 2.7

**Veredito: APROVADO.**

## Sequência e artefatos
- BMAD → Spec Kit → implementação respeitada. O modelo (Card/CardHistory + valores em JSONB por `Field.id`,
  idempotência estrutural, atomicidade pela tx interativa) decorre do PRD D3.3 + AD-11/12/13; nenhuma decisão de
  Produto nova inventada.

## context7-check
- **Prisma 6.19.3** (instalado): transação interativa (`$transaction(async tx => ...)`) e P2002 (violação de
  unicidade) confirmados; JSONB via coluna `Json`. O `set_config(..., true)` transaction-local dentro da tx
  interativa é o mesmo primitivo já validado em `withTenantContext` (1.2/1.3) e na publicação (2.6).
- **NestJS 11**: controllers/rotas convencionais; nenhum recurso novo de framework.

## Escopo (Constitution II)
- Sem antecipar Fase 2: só submissão interna do Formulário inicial → cria Card + evento `CREATED`. NÃO
  materializa Formulário de Fase, submissão pública (2.8), movimentação entre Fases (2.10), ciclo de vida/estado
  do Card (2.11), taxonomia de eventos além de `CREATED`, obrigatoriedade de Campo (inexistente) nem upload real
  de Arquivo (gated — AD-28).

## Segurança/isolamento
- `Card`/`CardHistory` org-scoped: RLS ENABLE+FORCE, policies por `current_org_id()`, WITH CHECK. `Card` sem
  GRANT DELETE; `CardHistory` sem UPDATE/DELETE (append-only imutável). Autorização "operar o Pipe" reusa
  `pipe-authz`. Nenhum caminho de bypass de RLS (AD-6). Anti-mass-assignment na allowlist da submissão;
  `orgId`/`actorId` do contexto, nunca do cliente.

## Migration
- Versionada (`20260714140000_cards`), aplicada por etapa controlada (`db:migrate`), não no boot. Rollback =
  revert do código + drop das tabelas; só adição, nenhuma alteração destrutiva de dados existentes.

## Riscos
- Atomicidade cross-tabela (Card + CardHistory): resolvida por transação interativa com contexto no client raiz
  (mesmo consumidor concreto da 2.6), sem bypass de RLS. Idempotência pelo `UNIQUE` (P2002 → Card existente).
  Provada por testes reais e por mutação.
