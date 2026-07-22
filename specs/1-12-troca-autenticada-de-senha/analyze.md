# Analyze — consistência cruzada (spec ↔ plan ↔ tasks ↔ código)

## Cobertura de requisitos
| Req | Onde vive | Teste |
|-----|-----------|-------|
| FR-1 step-up | `step-up.service.ts` (`verifyPassword`, `selarJanela`) | reautenticação correta → 204 |
| FR-2 gate | `password-change.service.ts` (`janelaValida`) | ausente/expirado/uso único → 403 |
| FR-3 não-enum | controller 401 neutro | senha incorreta → 401 sem revelar |
| FR-4 antiabuso | `RateLimiter.contar`, chave `stepup:*` | 6ª falha → 429 |
| FR-5 política | `password-policy.ts` | 14/15/128/129 + comum + frase + sem-classes |
| FR-6 troca | `password-change.service.ts` (transação atômica) | preserva/revoga, recuperação, notificação, auditoria |

## Divergências detectadas e resolvidas
- **Return shape de `verifyPassword`**: doc pública sugeria `{ valid }`; a FONTE (1.6.23) devolve
  `{ status }` e lança no erro. Ajustado após o teste vermelho revelar 401 no caminho positivo.
- **Recuperação (1.10) não fiada**: sem `sendResetPassword`, não há tokens hoje. Implementada a
  invalidação com a convenção REAL (`reset-password:<token>`, `value=userId`) — reconciliada e testada
  com linha semeada; reportada à Lane 0 como contrato parcial.

## Riscos residuais
- Notificação/auditoria são de LOG (mecanismo vigente); substituições por E5/8.8 são aditivas.
- Sem migration → superfície de rollback mínima.

## Constitution
- II (sem antecipar escopo): sem migration, sem 2FA, sem UI, reuso de primitivos. OK.
- VI (segredos): nenhuma senha/token em log/resposta (provado). OK.
- X (evidência real): gates reais (Postgres+Better Auth), não mocks. OK.
