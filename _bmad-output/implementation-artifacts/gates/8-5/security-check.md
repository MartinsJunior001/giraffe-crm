# Gate — security-check — Story 8.5

**Status: APROVADO**

## Superfície e ameaças

Rotas novas: `POST /organizations/members/:id/suspend` e `.../reactivate`. Ambas
`@Requer('administrar','Organizacao')` (Admin da Org — CASL 1.6, C3 congelado). Sem corpo; nenhum
`orgId`/`accountId` do cliente.

| Ameaça | Defesa |
| --- | --- |
| Escalada por não-Admin | guard grosso (403) + defesa em profundidade no serviço (`papel !== ADMIN` → 403) |
| Enumeração cross-tenant | alvo sob RLS → `null` → **404 não-enumerante** |
| Bypass de step-up | sessão/janela sempre do servidor (`StepUpService`, 1.12); fora da janela → 403; nada em log/resposta |
| Autossuspensão (fuga do controle do Admin) | vedada (403 `AUTOSSUSPENSAO_PROIBIDA`), verificada antes do step-up |
| Zerar Admins (last-admin) | `SELECT … FOR UPDATE` na Organização + recontagem in-tx + guarda otimista; concorrência prova nunca 0 |
| Sessão viva após suspensão | `AbilityCache.invalidar` + `activeOrganizationId` limpo + releitura de Membership ACTIVE por requisição (deny-by-default) |
| Revogação global indevida | NÃO revoga a Account; só a Org afetada; outras Orgs intactas (teste prova) |
| Restauração silenciosa de acesso | reativação NÃO restaura CardGrant/CardResponsavel (contrato 2.10; teste prova) |
| Lost update / 500 sob concorrência | guarda otimista `updateMany where state=<lido>`; P2002/P2028 → 409, nunca 500 |
| Mass-assignment | rota sem corpo; só `membershipId` (validado como UUID → 400) |

## Isolamento (invariante-mãe)

Toda query por `withTenantContext`/tx com `definirContextoOrg`; nenhum `where orgId` como única
defesa; `MembershipEvent` append-only (RLS+FORCE+WITH CHECK, GRANT SELECT/INSERT — 8.4, imutável).
`AuthSession` (global, sem RLS) tocada só por `userId + activeOrganizationId` (limpeza de ponteiro,
não exclusão de sessão).

## GRANT como fronteira

Nenhum GRANT novo. `Membership` (UPDATE de `state`), `CardGrant`/`CardResponsavel` (UPDATE de
`state`), `AuthSession` (UPDATE) já existentes. `MembershipEvent` segue SELECT/INSERT (imutável).

## Red-phase: ver `red-phase.md` (FOR UPDATE removido → invariante violado; guarda otimista).
