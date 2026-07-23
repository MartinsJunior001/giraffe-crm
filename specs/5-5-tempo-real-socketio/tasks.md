# Tasks — Story 5.5

Ordem por dependência. `[x]` = feito nesta entrega.

## Infra / dependência (gate AD-21)
- [x] T01 context7-check (Socket.IO `/websites/socket_io_v4`; NestJS WS `/nestjs/docs.nestjs.com`).
- [x] T02 Fixar versões alinhadas ao NestJS 11.1.28: `@nestjs/websockets`/`@nestjs/platform-socket.io`
  `^11.0.0`, `socket.io` `^4.8.3`, `socket.io-client` `^4.8.3` (dev). Atualizar lockfile.

## Núcleo puro
- [x] T03 `realtime-signal.core.ts` — `salaDe`, `construirSinal`, `SignalThrottle`, `ContadorConexoes`,
  `EVENTO_INVALIDACAO`/`EVENTO_SYNC`.
- [x] T04 Unit test `realtime-signal-core.test.ts` (isolamento de sala, payload sanitizado, coalescing,
  teto).

## Port + gateway + adapter + módulo
- [x] T05 `notification-realtime.port.ts` — token `NOTIFICATION_REALTIME` + interface.
- [x] T06 `notifications.gateway.ts` — handshake auth (`io.use` reusando `PRINCIPAL_PROVIDER` +
  `OrgContextResolver`), join por sala, teto/coalescing, `notificarDestinatarios`/`revogarCanal`.
- [x] T07 `realtime-io.adapter.ts` — CORS+credentials; instalado em `main.ts`.
- [x] T08 `realtime.module.ts` (`@Global`) + import em `app.module.ts`; env novas em `env.ts`.

## Consumidores concretos (ligações)
- [x] T09 `notifications.service.ts` — emite o sinal pós-commit em `registrarNotificacao` (`@Optional`).
- [x] T10 `membership-state.service.ts` — revoga canal ao SUSPENDER (`finalizar` OK, `@Optional`).
- [x] T11 `membership-removal.service.ts` — revoga canal ao REMOVER (`finalizar` OK, `@Optional`).
- [x] T12 `organizacao-ativa.service.ts` — revoga o canal da Org anterior na troca (`@Optional`).

## Teste de integração (real)
- [x] T13 `notifications-realtime.test.ts` — AC1 (sinal + payload sanitizado), isolamento (A não recebe
  B; sem sessão → recusado), AC2 (revogação desconecta), AC3 (não marca lido), AC4 (coalescing +
  degradação).

## Gates
- [ ] T14 `prettier --check` + `lint` + `typecheck` + `build`.
- [ ] T15 `pnpm --filter @giraffe/api test` (nova suíte + regressão 5.3/5.4 + membership).
- [ ] T16 `commit-check` → `commit` → push → PR → CI verde.
