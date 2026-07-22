# Analyze — Story 8.7 (consistência cross-artefato)

## Cobertura AC → implementação/teste
| AC | Onde | Teste |
|---|---|---|
| AC-1 (Admin vê por estado + filtros + paginação; ações conforme permissão) | `listarMembrosAdmin`/`listarConvites` | `roster-http` visão do Admin; paginação |
| AC-2 (proteção do último Admin não oferece ação) | `roster.core.capacidadesDoMembro` | `roster-core` + `roster-http` (linha do Admin único) |
| AC-3 (Membro reduzido; Convidado não acessa) | `listarMembrosReduzido` + guarda GUEST | `roster-http` visão reduzida / 403 |
| AC-4 (sem dado de outra Org; sem token; sem exportação) | RLS + `SELECT_CONVITE` sem token | `roster-http` cross-tenant + projeção |
| AC-5 (deny-by-default server-side; sem `orgId` do cliente) | guardas + `withTenantContext` | `roster-http` 401/403 |

## Consistência
- **Twin de padrão:** espelha `records-read`(3.5)/`kanban-read`(2.9) — projeção controlada, teto de
  página, autz por leitura, `orgId` fora da fronteira. Sem divergência de estilo.
- **Invariantes:** `Super Admin ≠ Admin da Org` preservado (nenhum ramo de Plataforma). Isolamento por
  Organização mantido pela RLS. `ability.ts` congelado.
- **Sem antecipação de escopo:** nenhuma abstração especulativa; capacidades têm consumidor concreto (a
  UI do roster + o contrato de ações das Stories 8.4/8.5/8.6).

## Divergências / débitos
- `DEB-8-7-AVATAR-ROSTER-CROSS-MEMBER`: `AccountAvatar` é *self-only* (3.10); exibir avatar de outro
  membro exigiria ampliar a policy (migration HIGH) — deferido, com fallback por iniciais. Registrado
  também na migration 3.10 (§74) como consumidor futuro previsto.
- Sem migration nesta Story (confirmado). `migration-check` N/A.

## Risco residual
Baixo. Superfície de leitura, sem escrita, sem novo privilégio de banco. O único dado sensível (e-mail)
é escopado ao Admin e é a finalidade legítima do roster.
