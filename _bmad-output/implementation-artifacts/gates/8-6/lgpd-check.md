# lgpd-check — Story 8.6

**Status: APROVADO.**

## Minimização (D-4)
- `MembershipEvent(REMOVED)` e as linhas de auditoria carregam só metadados: `membershipId`, `actorId`,
  papéis (`fromRole=toRole`, preservados), estados (`fromState`/`toState`), `saidaVoluntaria`, ids de
  concessões revogadas. **Nunca** senha/hash/token/cookie/id de sessão/e-mail/corpo HTTP.

## Preservação do dado do titular (sem exclusão física)
- Encerrar é **soft-delete** (`state=REMOVED`): a Account **não** é excluída; autoria/Histórico/eventos
  preservados (`creator` mantido como proveniência). O `REVOKE DELETE` reforça isso no banco — não há
  caminho de runtime que apague fisicamente a Membership ou, por cascata, seus eventos.
- Concessões (`CardGrant`/`CardResponsavel`) são revogadas por **estado** (REVOKED/REMOVED), não apagadas.

## Direito de saída (titular)
- A saída voluntária dá ao próprio titular o encerramento do seu vínculo (com step-up), sem excluir a
  Account nem afetar outras Organizações — coerente com o princípio de que o titular controla o próprio
  acesso.

## Escopo por Organização
- Invalidação/limpeza de sessão só na Org afetada; a Account e as demais Memberships permanecem intactas
  — sem efeito colateral cross-tenant sobre dados pessoais.
