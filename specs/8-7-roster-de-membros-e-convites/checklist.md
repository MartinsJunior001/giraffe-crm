# Checklist — Story 8.7

## Autorização
- [x] `members` guard `ler Organizacao`; autoridade fina (Admin/Membro/Convidado) no serviço.
- [x] `invites` guard `administrar Organizacao`; serviço reforça Admin-only.
- [x] Convidado → 403 em membros; MEMBER/GUEST → 403 em Convites; sem sessão → 401.
- [x] `ability.ts`/`ability.factory.ts` intocados (C3 congelado).

## Multi-tenant
- [x] Toda query por `withTenantContext`; nenhum `where orgId` manual como defesa única.
- [x] Nenhuma rota aceita `orgId` do cliente.
- [x] `Account` (global) lido por `id in [...]` filtrado pelas Memberships escopadas.
- [x] Teste cross-tenant (membros + Convites) prova não-vazamento.

## Projeção / LGPD
- [x] `orgId` fora de toda resposta.
- [x] Token/hash de Convite jamais projetado (`tokenHash`/`normalizedEmail` ausentes).
- [x] E-mail só na visão do Admin; Membro reduzido sem e-mail/capacidades/estados não-ativos.

## Paginação / robustez
- [x] Offset `skip`/`take` com teto 100 e default 50.
- [x] Ordem determinística `[createdAt desc, id asc]`.
- [x] Query allowlist fail-closed (chave desconhecida → 400).

## Regra sensível
- [x] Proteção do último Admin reflete nas capacidades (núcleo puro, testado).

## Sem escopo extra
- [x] Sem migration, sem GRANT, sem mudança de RLS.
- [x] Write-side de `invites/` intocado.
- [x] Sem exportação de membros.
