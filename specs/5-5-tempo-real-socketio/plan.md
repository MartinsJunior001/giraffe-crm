# Plano de implementação — Story 5.5

Risco: **ALTO** (dependência de infra nova + autenticação/sessão + tempo real + isolamento). Gates:
context7-check (feito), integração real (banco + socket real), regressão de segurança/isolamento,
typecheck/lint/build, sem migration (nada de drill), QA cruzada, CI no SHA exato.

## Componentes (todos em `apps/api/src/notifications/realtime/`)

1. **`notification-realtime.port.ts`** — token `NOTIFICATION_REALTIME` + interface
   `NotificationRealtimePort` (`notificarDestinatarios(orgId, userIds, sinal)`, `revogarCanal(orgId,
   userId)`). Desacopla o write-side/membership do Socket.IO (testável, degradável).
2. **`realtime-signal.core.ts`** (PURO) — `salaDe(orgId,userId)`, `construirSinal(id,at)`, e
   `SignalThrottle` (coalescing por sala, clock injetado — unit-testável sem timers reais).
3. **`realtime.config.ts`** — lê `REALTIME_THROTTLE_MS`/`REALTIME_MAX_SOCKETS_PER_USER` (defaults).
4. **`notifications.gateway.ts`** — `@WebSocketGateway()`; implementa a port; `handleConnection`
   (auth/authz + join + teto por usuário), `handleDisconnect` (limpeza de contagem), emissão
   coalescida, `revogarCanal`.
5. **`realtime-io.adapter.ts`** — `RealtimeIoAdapter extends IoAdapter` (CORS+credentials), instalado
   em `main.ts`.
6. **`realtime.module.ts`** — `@Global()`; provê o gateway + bind do token; exporta ambos.

## Ligações (consumidores concretos)

- `notifications.service.ts` — injeta `@Optional() @Inject(NOTIFICATION_REALTIME)`; após o commit de
  `registrarNotificacao`, se `destinatariosCriados > 0`, emite o sinal aos `userId` materializados
  (best-effort, try/catch).
- `membership-state.service.ts` / `membership-removal.service.ts` — injetam a port `@Optional()`; no
  `finalizar` (ramo `OK`, junto ao `abilityCache.invalidar`), chamam `revogarCanal(orgId,
  alvoAccountId)`.
- `organizacao-ativa.service.ts` — ao `trocar`, revoga o canal da Org anterior do usuário.
- `main.ts` — `app.useWebSocketAdapter(new RealtimeIoAdapter(app, corsOrigins))`.
- `app.module.ts` — importa `RealtimeModule`.

## Backward-compat (não quebrar testes existentes)

- Novo param de construtor sempre `@Optional()` + opcional (`?`) — os `new NotificationsService(a,b,c)`
  dos testes 5.3/5.4 (markall/read/write) seguem válidos (param omitido ⇒ no-op).

## Teste de integração (`test/notifications-realtime.test.ts`)

AppModule real em porta efêmera + `socket.io-client` + banco real, override do `PRINCIPAL_PROVIDER`
por `x-test-account` (como a 5.4). Cobre:

- AC1: BRUNO conecta autenticado → `registrarNotificacao` p/ BRUNO → recebe `notifications:invalidate`
  com `id`. Sinal **não** contém `params`/`type`/`resourceId` (payload sanitizado).
- Isolamento: ANA conectada **não** recebe o sinal de BRUNO (sala por `(userId,orgId)`).
- Handshake sem sessão → `connect_error` (recusado).
- AC2: suspensão da Membership de BRUNO (via HTTP 8.5) desconecta o socket de BRUNO.
- AC2: troca de Org ativa encerra a inscrição anterior.
- AC3: dedup/reconexão — reconectar re-autentica; a 5.4 traz o backlog; o socket não marca lido.
- AC4: degradação — a Notificação é persistida mesmo se nenhum socket estiver conectado (a 5.4 lê
  normalmente); backpressure — rajada de N notificações coalescem em ≤ poucos sinais.

## Gates finais

`prettier --check` + `lint` + `typecheck` + `build`; `pnpm --filter @giraffe/api test` (regressão 5.3/
5.4 + a nova suíte); lockfile com as deps novas; CI verde.
