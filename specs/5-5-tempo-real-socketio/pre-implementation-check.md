# pre-implementation-check — Story 5.5

Gate obrigatório (dependência nova + infra + auth do socket). Status: **APROVADO**.

## Dependência nova
- Socket.IO + NestJS WebSockets. Versões fixadas e alinhadas ao NestJS 11.1.28 (ver decisão
  `socketio-architecture.md`). `context7-check` executado (Context7 MCP: `/websites/socket_io_v4`,
  `/nestjs/docs.nestjs.com`). Nada de `latest`; lockfile atualizado.

## Migration / GRANT / RLS
- **Nenhuma migration. Nenhum GRANT novo.** O socket só emite sinais em memória e lê pela 5.4 (que já
  usa `SELECT` existente sob RLS). `MODELOS_AUDITADOS` intocado. C3 (`ability.ts`/guard) congelado.

## Segurança / isolamento
- Handshake reusa a sessão better-auth (sem token paralelo). Deny-by-default (recusa sem sessão/sem
  Membership ativa). Sala por `(userId,orgId)` — isolamento por Org **e** por usuário. Payload sem PII
  (só `id`+`at`). Revalidação de acesso a recurso permanece na 5.4 (o socket não decide acesso).
- Revogação por suspensão/remoção/troca-de-Org. Backstop: a 5.4 nega leitura de quem perdeu acesso.

## Arquitetura / escopo
- `@WebSocketGateway()` no mesmo servidor HTTP (deploy-friendly). Sem antecipar catálogo/distribuição
  (5.6/5.7), e-mail/push (E6), UI rica (E7) nem adapter multi-nó (débito registrado).
- Consumidor concreto: `registrarNotificacao` (5.3). Sem módulo vazio/abstração especulativa.

## Observabilidade / degradação
- Emissão best-effort pós-commit (fault-isolated). Logs sanitizados (sem PII/cookie/token). App
  funciona sem socket.

## Riscos
- Deploy do upgrade WS atrás do proxy — débito `DEB-5.5-WS-UPGRADE-STAGING` (não bloqueia server-side).
- Multi-nó — débito `DEB-5.5-REALTIME-MULTINODE` (backstop 5.4 cobre segurança).
