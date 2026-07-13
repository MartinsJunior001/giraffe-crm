# lgpd-check — Story 1.3

2026-07-12 · Status: **APROVADO**

## Dado pessoal tratado nesta Story

**Nenhum novo.** A Story não cria tabela, coluna nem campo. Ela lê `Membership` (`accountId`,
`orgId`, `state`) — identificadores opacos, sem conteúdo pessoal.

| Verificação | Resultado |
| ----------- | --------- |
| Novo dado pessoal coletado | ❌ Nenhum |
| PII em log | ❌ Só UUIDs. `Account.email` e `Account.name` **não** são lidos nem registrados no caminho de contexto. |
| PII em payload | ❌ `GET /organizations/current` devolve `{id, name, slug}` da **Organização** — dado da empresa, não da pessoa. |
| PII em mensagem de erro | ❌ 401/403 sanitizados, sem motivo no corpo. |
| Minimização | ✅ O resolvedor faz `select: { orgId: true }` — não traz a linha inteira da Membership, só o que precisa para decidir. |

## Fixture de desenvolvimento

`prisma/seed.sql` ganhou a conta **Eva** (`eva@exemplo.test`), ACTIVE nas Orgs A e B — necessária
porque nenhuma conta do seed tinha **duas** Memberships ativas, e esse é justamente o caso que
obriga a escolha explícita de contexto.

É dado **fictício**, em domínio de teste (`.test`, reservado pela RFC 2606 e não roteável). Nenhum
dado real de pessoa existe no repositório.

## Efeito colateral favorável

A Story **reduz** o alcance do tratamento de dados: antes dela, qualquer código que chamasse
`withTenantContext` com um `orgId` arbitrário acessaria os dados de outra Organização. Depois dela,
o escopo de leitura de qualquer requisição está limitado à Organização em que o titular tem vínculo
ativo — que é a expressão técnica da finalidade e da minimização.
