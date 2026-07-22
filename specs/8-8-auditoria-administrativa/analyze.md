# Analyze — Story 8.8 (consistência cross-artefato)

## Cobertura AC → RF → tasks → testes
| AC épico | RF | Task | Teste |
|---|---|---|---|
| AC1 (consulta/filtros/paginação/ordem, Org atual) | RF-1/2/3 | T2/T3/T4 | audit-http (ordem, filtros, paginação) |
| AC2 (não vaza outra Org; sem segredo/token/payload) | Isolamento + RF-4 | T1/T3 | audit-http (cross-tenant, allowlist) + core |
| AC3 (só Admin ativo; append-only) | RF-1/6 | T3/T4 | audit-http (403/401/200) |
| AC4 (write-side fail-closed) | fora do read-side | — (débito) | — (produtor 8.2–8.6) |
| projeção AD-30 / minimização | RF-4 | T1 | core (allowlist, fail-closed) |
| AUDIT_LOG_VIEWED | RF-5 | T3 | core (montarLogAuditoria) |

## Consistência
- **Sem duplicação de contrato:** projeta sobre `MembershipEvent` (8.4/8.5/8.6); não recria o registro
  (épico §617/§723: "8.8 entrega o read-side; não recria o mecanismo").
- **Separação de trilhas (AD-15):** Auditoria administrativa ≠ Histórico de Card ≠ Histórico de Registro ≠
  logs técnicos. O read-side lê só `MembershipEvent` (trilha administrativa), não `CardHistory`/`RecordHistory`.
- **INV-AUDIT-01 / AD-30:** append-only garantido pelo write-side (GRANT sem UPDATE/DELETE); o read-side só lê.
- **C3 congelado:** `administrar Organizacao` reusado (1.6); guard/ability intocados.
- **Padrões reusados:** projeção allowlist + cursor determinístico do Histórico do Registro (3.6); defesa em
  profundidade de papel do `MembershipStateService` (8.5); DTO manual sem class-validator (Constitution II).

## Riscos residuais / débitos
- **DEB-8-8-AUDIT-SUBSTRATE-AMPLO** — substrato canônico unificado (Pipe/Database/Card/Form/Template/
  Automação) quando houver produtor concreto (AD-11).
- **DEB-8-8-WRITE-SIDE-RESULTADO** — `resultado` BLOQUEADA/FALHA + fail-closed/outbox no write-side (AC4).
- **DEB-8-8-AUDIT-INDEX** — `@@index([orgId, occurredAt, id])` para listagem org-wide em escala.
- **DEB-8-8-AUDIT-LOG-VIEWED-PERSIST** — persistir acessos se um requisito de consulta surgir.
- **GATE DE PRODUÇÃO (LGPD/Governança)** — retenção 24 meses / anonimização / descarte / legal hold /
  backups. Ver `gates/8-8/lgpd-check.md`. Não bloqueia a impl.

## Veredito
Consistente. Nenhuma contradição entre spec, plan, tasks e código. Pronto para implementação/verificação.
