# Story 5.5 — Tempo real como invalidação (Socket.IO)

> Épico 5 · Story 5.5 · Writer exclusivo · branch `story/5-5-tempo-real-socketio`.
> Fonte: `_bmad-output/planning-artifacts/epics.md` §1603-1622 · FR-29 · AD-21/23 · NFR-3/19/20/21 · INV-NOTIF-01.

## Objetivo

Atualizar as superfícies de Notificação (badge/popover/página — 5.4) **em tempo real** sem que o
canal de tempo real vire fonte de verdade. O Socket.IO **apenas comunica** que houve mudança (um
**sinal de invalidação**); a **fonte de verdade continua sendo a 5.3** (banco) e a **leitura
autorizada/revalidada continua sendo a 5.4**. Perda de mensagem **não perde Notificação**.

## Invariante-mãe da Story

`Tempo real ≠ fonte de verdade.` O evento entregue ao cliente carrega, no máximo, um sinal opaco
("revalide") + um identificador para deduplicação. **Nunca** o conteúdo sensível da Notificação, nem
PII, nem qualquer dado de recurso. Ao receber o sinal, o cliente busca via a leitura 5.4 (autorizada,
revalidada por acesso atual). O socket **não decide acesso a recurso** — quem decide é a 5.4.

## Escopo (o que esta Story entrega)

- **Gateway Socket.IO server-side** (`NotificationsGateway`) anexado ao **mesmo servidor HTTP** da API
  (sem porta separada — deploy-friendly: o proxy só precisa liberar o upgrade WebSocket no mesmo
  host/porta, path `/socket.io/`).
- **Autenticação e autorização no handshake E na reconexão**, reusando a **mesma sessão** (cookie
  better-auth) via o `PRINCIPAL_PROVIDER` já existente + `OrgContextResolver` (a autoridade é a
  Membership ATIVA, conferida no servidor — nunca o cliente). Deny-by-default: handshake sem sessão
  válida/sem Membership ativa → conexão **recusada**.
- **Canal (sala) escopado por `(userId, organizationId)`.** Um socket só recebe eventos do próprio
  usuário na própria Organização. `orgId`/`userId` vêm da sessão/Membership, nunca do payload do
  cliente.
- **Consumidor concreto (anti-módulo-vazio):** o sinal de invalidação é emitido no ponto de criação de
  Notificação — `NotificationsService.registrarNotificacao` (5.3) — para o canal `(destinatário, org)`
  de cada destinatário efetivamente materializado.
- **Revogação do canal:** suspensão/remoção de Membership (8.5/8.6) e **troca de Organização ativa**
  (1.9) **encerram** as inscrições anteriores (desconectam os sockets da sala afetada).
- **Cursor/dedup/reconexão:** cada sinal carrega um **identificador** (o `notificationId`) para o
  cliente **deduplicar**; a **reconexão busca alterações após o último cursor** via a leitura 5.4
  (cursor `[createdAt,id]` já existente) — o socket não replay-a mensagens perdidas.
- **Backpressure / proteção contra tempestade:** coalescing por sala (no máximo um sinal por sala a
  cada janela de throttle) e **teto de conexões por usuário**; excedente é recusado/coalescido.
- **Degradação graciosa:** a app funciona **100% sem o socket** — o socket é otimização de latência. A
  emissão do sinal é **best-effort pós-commit**: uma falha no canal **nunca** derruba a escrita da
  Notificação (a fonte é o banco).

## Fora de escopo (recorte anti-especulação)

- Catálogo de tipos, distribuição e produtores concretos de Notificação (Responsável, movimentação,
  convite aceito) — 5.6/5.7/E8. O consumidor aqui é o `registrarNotificacao` **genérico** da 5.3.
- E-mail/push externo — E6/Non-Goal.
- UI cliente rica (badge/popover reativos no front) — E7/futuro. Entrega-se o **server-side** + o
  contrato + o teste com `socket.io-client`. O web do projeto é fino; nenhum componente de UI é
  adicionado nesta Story.
- Adapter multi-nó (Redis) para broadcast entre réplicas — débito `DEB-5.5-REALTIME-MULTINODE`
  (ver decisão). O staging é single-instance; a revogação in-process cobre o caso, e o **backstop de
  segurança é a revalidação de acesso da 5.4** (um socket que sobrevivesse numa outra réplica só
  receberia um sinal opaco e, ao revalidar, seria negado pela 5.4).

## Critérios de aceite (epics §1614-1617)

- **AC1 — sinal ao canal autorizado.** Dado uma nova Notificação, quando gerada (via
  `registrarNotificacao`), então o Socket.IO comunica a mudança **apenas** ao canal
  `(userId+organizationId)` do(s) destinatário(s), refletindo as superfícies **sem virar fonte de
  verdade** (o payload é só sinal + identificador; o conteúdo vem da 5.4).
- **AC2 — revogação.** Dado troca de Organização ativa OU suspensão/remoção de Membership, quando
  ocorre, então as inscrições anteriores são encerradas e o canal revogado (sockets da sala afetada
  desconectados).
- **AC3 — reconexão/dedup.** Dado reconexão após queda, quando o cliente volta, então re-autentica o
  handshake e busca alterações após o último cursor (via 5.4) e deduplica pelo identificador do sinal;
  perda de mensagem não perde Notificação; o tempo real **não marca item como lido**.
- **AC4 — degradação/isolamento/backpressure.** Falha do canal degrada para consulta da fonte
  canônica; **nada de outro usuário/Org é transmitido**; há backpressure/limites (coalescing por sala,
  teto de conexões).

## Autorização e isolamento (inegociáveis)

- Handshake reusa a sessão existente (cookie better-auth) via `PRINCIPAL_PROVIDER` — **sem token
  paralelo**. Sessão inválida/expirada → recusa (equivalente ao 401 do guard HTTP).
- Org resolvida pela **Membership ATIVA** (`OrgContextResolver`): pedido do cliente (`auth.orgId` /
  header `x-org-id`) é conferido, nunca é autoridade; sem Membership ativa → recusa.
- Sala escopada por `(userId, orgId)`; nenhum socket recebe evento de outra Org/usuário.
- Nada sensível no payload do socket: só sinal + `notificationId` (identificador) + `occurredAt`
  (para ordenação/dedup). A revalidação de acesso real acontece na 5.4.
- Guard/`ability.ts` (C3) **congelado**. Nenhuma migration, nenhum GRANT novo (o socket só lê pela
  5.4 já existente e emite sinais em memória).
