# Decisão de Arquitetura — Tempo real (Socket.IO) — Story 5.5 (AD-21/AD-23)

Gate de Arquitetura da 5.5 (epics §1621: "canais/handshake/cursor/backpressure/reconexão =
Arquitetura, AD-21"). Esta é a **primeira dependência de infra nova** do Épico 5 (5.1-5.4 foram
zero-dependência). Documento consumido pela Lane 0 em Architecture + Security.

## 1. Dependências novas (versões FIXADAS — nunca `latest`)

Baseline: NestJS **11.1.28** instalado (`@nestjs/core`/`@nestjs/common` = 11.1.28 no lockfile).

| Pacote | Faixa (package.json) | Resolvido (lockfile) | Papel |
| --- | --- | --- | --- |
| `@nestjs/websockets` | `^11.0.0` | 11.1.28 | Substrato de Gateway do Nest |
| `@nestjs/platform-socket.io` | `^11.0.0` | 11.1.28 | Adapter Socket.IO do Nest (peer: websockets `^11.0.0`) |
| `socket.io` | `^4.8.3` | 4.8.3 | Servidor Socket.IO (declarado direto p/ tipos `Server`/`Socket`) |
| `socket.io-client` (dev) | `^4.8.3` | 4.8.3 | Cliente do **teste de integração** |

- `@nestjs/platform-socket.io@11.1.28` depende de `socket.io@4.8.3` (pin exato transitivo) — a versão
  direta `^4.8.3` alinha e não diverge.
- Peer deps conferidas: `@nestjs/websockets@11.1.28` exige `@nestjs/common ^11.0.0`, `@nestjs/core
  ^11.0.0`, `@nestjs/platform-socket.io ^11.0.0`, `rxjs ^7.1.0`, `reflect-metadata ^0.1.12 || ^0.2.0`
  — **todos satisfeitos** pelo baseline.
- `socket.io 4.8.x` é a linha corrente (sem CVE conhecido aberto no momento; o job Segurança/Trivy do
  CI escaneia o lockfile — se surgir CVE, fixar a versão corrigida).

### Fontes Context7 (gate documental `context7-check`)

- Socket.IO (servidor): `/websites/socket_io_v4` — `io.use((socket,next)=>…)` para middleware de
  handshake; `socket.handshake.auth`/`socket.handshake.headers`/`socket.request` para credenciais;
  `socket.join(room)` / `io.to(room).emit(...)`; `io.in(room).disconnectSockets(true)` para revogação.
- NestJS WebSockets: `/nestjs/docs.nestjs.com` — `@WebSocketGateway()`, lifecycle hooks
  `OnGatewayInit`/`OnGatewayConnection`/`OnGatewayDisconnect` (`afterInit`/`handleConnection`/
  `handleDisconnect`), `@WebSocketServer()` para o `Server` nativo, gateway registrado em `providers`.

## 2. Anexação ao servidor HTTP (deploy)

`@WebSocketGateway()` **sem porta** → o Socket.IO anexa ao **mesmo servidor HTTP** do Nest (path
`/socket.io/`). Uma só porta para HTTP + WS. **Deploy (Coolify/Traefik):** basta o proxy repassar o
upgrade WebSocket no mesmo host/porta — nenhuma porta/rota extra. Não há bloqueio de infra para a
entrega/teste da Story (o gateway + o teste de integração não dependem do deploy). Débito de deploy
`DEB-5.5-WS-UPGRADE-STAGING`: validar o upgrade WS atrás do proxy no smoke de staging.

## 3. Autenticação/autorização no handshake (e reconexão)

**Reusa a MESMA sessão** — sem token paralelo. No `handleConnection(socket)`:

1. `principal = await PRINCIPAL_PROVIDER.resolver(socket.request)` — `socket.request` é o
   `IncomingMessage` original do handshake, com `headers.cookie`. Em produção resolve pela sessão
   better-auth; em teste resolve pelo mesmo port sobreposto (`x-test-account`). Sem sessão → recusa.
2. Org pedida: `socket.handshake.auth.orgId` **ou** header `x-org-id` (equivalente ao HTTP), conferida
   por `OrgContextResolver.resolver(accountId, {orgId, origem:'header'})`; ausente → preferência da
   sessão → única Membership ativa → recusa (mesma precedência do `TenantContextGuard`).
3. `socket.join(sala(orgId, userId))` e guarda de metadados no `socket.data`.

A **reconexão** é uma nova conexão física → passa pelo **mesmo** `handleConnection` → re-autentica e
re-autoriza do zero. Não há estado de sessão confiado no cliente.

**Por que não um WsGuard/`ability.ts`:** C3 (`ability.ts`/guard HTTP) é congelado; a autorização de
canal é resolvida no `handleConnection` reusando os providers server-side já existentes (mesmo padrão
DBT-AUTHZ-01 de resolver autoridade no serviço, não no guard). O socket **não** autoriza acesso a
recurso — só ao próprio canal `(userId,orgId)`; o acesso a recurso é revalidado pela 5.4 na leitura.

## 4. Sala (room) e isolamento

Chave de sala: `u:{userId}:o:{orgId}` (função pura `salaDe`). Um socket entra **exatamente** na sua
sala. Emissão sempre via `io.to(sala).emit(...)`. Nenhum broadcast global; nenhum evento cruza
usuário/Org. `orgId`/`userId` derivam da Membership resolvida no servidor.

## 5. Payload do sinal (nada sensível)

Evento `notifications:invalidate`, payload mínimo e **sanitizado**:

```
{ id: <notificationId>, at: <occurredAt ISO> }
```

- `id` = identificador para **dedup** no cliente.
- `at` = instante para ordenação/heurística de "após o cursor".
- **Sem** `type`/`params`/`resourceId`/`actorId`/conteúdo — nada de PII, token ou dado de recurso. O
  conteúdo real (e a **revalidação de acesso**) vêm da 5.4. Assim, mesmo que um sinal chegue a um
  socket que perdeu acesso (janela de corrida), ele não vaza nada e a 5.4 nega a leitura.

## 6. Cursor / dedup / reconexão

- **Dedup:** cliente guarda os `id` já vistos e ignora repetidos (o coalescing do servidor já reduz
  duplicatas).
- **Reconexão:** ao (re)conectar, o cliente chama a leitura 5.4 (cursor `[createdAt,id]`, já existente)
  para buscar tudo após o último cursor conhecido. O socket **não** re-entrega mensagens perdidas — a
  fonte é o banco (perda de mensagem ⇏ perda de Notificação). Opcionalmente, o servidor emite
  `notifications:sync` na conexão como dica de "faça o fetch inicial".
- **Tempo real não marca lido:** o socket nunca escreve estado; marcar lido é a 5.4 (HTTP idempotente).

## 7. Backpressure / tempestade de eventos

- **Coalescing por sala:** `SignalThrottle` (testável com clock injetado) — no máximo um sinal por sala
  a cada `REALTIME_THROTTLE_MS` (default 250ms). Rajada de N notificações para o mesmo destinatário →
  1 sinal (o cliente refaz um único fetch que traz todas). Fecha o "storm".
- **Teto de conexões por usuário:** `REALTIME_MAX_SOCKETS_PER_USER` (default 8) — conexão excedente é
  recusada no handshake. Limita fan-in por conta.
- **maxHttpBufferSize** reduzido (o cliente não envia payloads — só recebe): tamanho mínimo defensivo.

## 8. Revogação (encerrar inscrições)

`revogarCanal(orgId, userId)` → `io.in(sala(orgId,userId)).disconnectSockets(true)`. Chamado
**best-effort pós-commit** por:

- **8.5 suspensão / 8.6 remoção** de Membership — no ponto exato onde já se invalida a ability em
  cache (`AbilityCache.invalidar(alvoAccountId, orgId)`), acrescenta-se `realtime?.revogarCanal(orgId,
  alvoAccountId)`. Injeção `@Optional()` do port (degradação).
- **1.9 troca de Organização ativa** — ao persistir a nova Org, revoga o canal da Org **anterior** do
  usuário (as inscrições anteriores são encerradas).

**Backstop de segurança (defense-in-depth):** ainda que a revogação in-process não alcance um socket
em outra réplica (multi-nó — débito), o socket só recebe um **sinal opaco**; a leitura 5.4 revalida o
acesso (Membership ATIVA + acesso ao recurso) e nega. O canal nunca é a fronteira de acesso a dado.

## 9. Degradação graciosa

A emissão do sinal em `registrarNotificacao` roda **após o commit** da transação e é **fault-isolated**
(try/catch que só loga): falha do canal **não** afeta a escrita da Notificação. A app funciona 100% sem
socket (a 5.4 responde por HTTP normalmente). Sem feature flag de P0: o tempo real é otimização de
latência sobre a fonte canônica, não requisito — não esconde P0.

## 10. CORS / credenciais (browser cross-origin)

O web (3000) conecta na API (3001) — cross-origin com cookie. Socket.IO tem CORS próprio (não usa o
`cors` do Express). Configurado por um `RealtimeIoAdapter` (subclasse de `IoAdapter`) instalado em
`main.ts` (`app.useWebSocketAdapter`), lendo `CORS_ALLOWED_ORIGINS` no **bootstrap** (não no
import — preserva a decisão de não validar env no load de `AppModule`). `credentials: true`, origem
explícita (sem wildcard, coerente com o `env.ts`). Nos testes, o cliente conecta same-origin
(`app.getUrl()`), então o adapter default basta (sem CORS).

## 11. Variáveis de ambiente novas (todas com default seguro; opcionais)

| Var | Default | Papel |
| --- | --- | --- |
| `REALTIME_THROTTLE_MS` | 250 | janela de coalescing por sala |
| `REALTIME_MAX_SOCKETS_PER_USER` | 8 | teto de conexões por conta |

Sem segredo novo. Ausência ⇒ default (não altera o boot; nenhum `superRefine` novo obrigatório).

## Débitos registrados

- `DEB-5.5-REALTIME-MULTINODE` — broadcast/revogação entre réplicas exige um adapter (Redis). MVP é
  single-instance; o backstop da 5.4 cobre a segurança. Reavaliar ao escalar horizontalmente.
- `DEB-5.5-WS-UPGRADE-STAGING` — validar o upgrade WebSocket atrás do proxy (Coolify/Traefik) no smoke
  de staging (não bloqueia a entrega/teste server-side da Story).
