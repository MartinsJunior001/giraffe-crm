# Checklist — Story 4.8: Trilha de Execuções

Gate de RISCO ALTO (autz/isolamento/sanitização). Marcado ao fim da implementação.

## Autorização (deny-by-default)
- [x] Admin da Org → vê TODAS as Execuções do Pipe (`execution-trail-http` AC3).
- [x] Admin do Pipe → vê TODAS.
- [x] Membro NÃO restrito → vê TODAS (acessa todos os Cards do Pipe).
- [x] Membro `restritoAoProprio` → vê SÓ as Execuções dos recursos que acessa.
- [x] Somente-leitura (Viewer) → 403.
- [x] Convidado → 403 ("Convidado não acessa").
- [x] Sem concessão → 404 não-enumerante.
- [x] **Fase vermelha:** piso rebaixado a `ler` ⇒ Viewer/Convidado passam a 200 (falha comprovada).

## Isolamento
- [x] Cross-tenant (RLS): principal de outra Org → 404 (Pipe não revelado).
- [x] `withTenantContext` em toda query; nenhum `where orgId` manual.
- [x] `orgId` fora da fronteira de resposta.

## Não-enumeração
- [x] Execução inexistente/outro Pipe → 404.
- [x] Restrito: Execução de recurso inacessível → 404 (detalhe).

## Sanitização (AD-30)
- [x] Projeção allowlist (`execution-view`), unit provada.
- [x] Asserção NEGATIVA: `orgId`/`leaseOwner`/`nextAttemptAt`/`configSnapshot`/`payload`/`valores`/`token`/`secret` ausentes do JSON.
- [x] `targetResourceId` mascarado (restrito e cross-domínio); `referenciaRestrita` marca sem vazar.
- [x] `motivoLegivel` fail-closed no eco (só enum estrutural).
- [x] **Fase vermelha:** defesa do eco removida ⇒ teste de sanitização falha (comprovado).

## Filtros e paginação
- [x] Filtro por estado (allowlist), por Evento (`eventType`), por período (`de`/`ate`).
- [x] Fail-closed → 400 (estado/eventType/data inválidos, `de>ate`, cursor/limite inválidos).
- [x] Cursor determinístico `[createdAt, id]`, teto 100, percorre sem repetir.

## Estados e cadeia
- [x] 8 estados distintos + `avaliacaoCondicoes` agregado (SATISFEITA/NAO_SATISFEITA/PENDENTE/NAO_AVALIADA).
- [x] `executionChainId`/`chainDepth` + causa de interrupção (`HALTED_BY_LIMIT` + código + motivo).

## Regressão e gates mecânicos
- [x] `prisma generate` sem diff (read-side, sem migration).
- [x] typecheck limpo (src + test).
- [x] prettier `--check` (formatado).
- [x] eslint limpo.
- [x] Regressão 4.1/4.2/4.6/4.7 verde (serial, como o CI).
- [x] `pnpm build` (ver gate final).
- [ ] CI verde no PR (após push).
