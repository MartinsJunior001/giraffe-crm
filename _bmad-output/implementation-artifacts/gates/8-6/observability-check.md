# observability-check — Story 8.6

**Status: APROVADO.**

## Trilha de auditoria (FR-214)
- Cada encerramento emite auditoria manual (a tx raiz não passa pela extensão): `update Membership`,
  `create MembershipEvent`, e, quando houve impacto, `update CardGrant` / `update CardResponsavel` — todos
  `result: 'allowed'`, com `actor`/`orgId`/`at`. Sem PII.
- O **evento canônico** `MembershipEvent(type=REMOVED)` é o registro durável e append-only do fato, na
  mesma transação — não há encerramento sem evento (AD-13). `saidaVoluntaria` + `actorId` tornam a
  distinção remoção×saída consultável.
- Caminho idempotente (já REMOVED) **não** emite `updateMany` nem evento → **sem falso `denied`** na
  trilha (mesmo cuidado de 8.4/8.5/3.1).

## Sanitização
- Payload do evento e linhas de auditoria carregam só metadados (estados, ids de concessão, papel). Nunca
  senha/token/cookie/id de sessão/corpo HTTP/PII (D-4).

## Falha alta e visível (reforço da 8.6)
- O `REVOKE DELETE` transforma o antigo ponto cego (`deleteMany` cruzado voltando `{count:0}` silencioso)
  numa **exceção** `permission denied` — falha ALTA, não sucesso mudo. `rls-observability` foi atualizado
  para provar isso e que **nada** é registrado como `allowed`.

## Logs de erro
- P2002/P2028 → 409 (nunca 500); demais erros propagam sem vazar contexto/URL/segredo.
