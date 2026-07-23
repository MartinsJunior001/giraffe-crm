# Analyze — Story 5.2 (consistência cross-artefato)

## Cobertura AC → tarefa → teste
| AC (§) | Escopo | Teste |
|---|---|---|
| AC1 abrir (§1551) | Solicitacao model + service.criar; Responsável 0..1 (decisão) | `solicitacoes-http` |
| AC2 ciclo (§1552) | transitions puro + service.resolver/reabrir/arquivar/restaurar | `solicitacao-lifecycle-transitions`, `solicitacoes-http`, `solicitacoes-rls` |
| AC3 Responsável/E8 (§1553) | assign + contrato E8 (state/removal) | `solicitacoes-http`, `membership-*-http` |
| AC4 anexos/authz/Histórico (§1554) | dispatchers + files controller | `solicitacoes-files-http`, `solicitacoes-rls` |

## Consistência com invariantes
- `Card ≠ Registro`, `Solicitacao ≠ Task` — entidade DISTINTA; reusa padrões/autz, não entidades. OK.
- Deny-by-default, 404 não-enumerante, GRANT como fronteira. OK.
- Sem exclusão física (LGPD): sem DELETE; arquivar/resolver = state. OK.

## Divergências resolvidas
- **Responsável 0..1 vs "tem" (§1551):** resolvido para 0..1 opcional (`decisions/responsavel-0-1-5-2.md`).
- **Sem eixo temporal:** a 5.2 não tem prazo/atrasada/scheduler/overdue — o AC2/AC3 da 5.2 não os citam.

## Riscos residuais
- Toques aditivos em `membership-contract`/`membership-state`/`membership-removal` e nos dois dispatchers de
  arquivo: risco de regressão E8/5.1. Mitigação: campos opcionais (default vazio) + suíte E8 e 5.1 na régua.
- Nenhuma dependência externa (sem EXTERNAL_GATE).

## Gate documental (context7)
Stack inalterada (Prisma 6.19.3, NestJS 11) — mesmos primitivos já validados na 5.1 (índice único, RLS raw
SQL, tx interativa no client raiz). Sem API nova de biblioteca; nada a reconferir além do já usado na 5.1.
