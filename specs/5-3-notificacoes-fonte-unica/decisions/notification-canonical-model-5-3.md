# Decisão — Modelo canônico de Notificações (Story 5.3)

## Contexto
INV-NOTIF-01 exige **uma única verdade** para toda Notificação. §1570 exige **separar** evento/conteúdo
(append-only) do estado de leitura por destinatário (mutável, auditável). A idempotência (§1569) é por
*Org + Evento de origem + tipo + destinatário*.

## Decisões

### D1 — Duas entidades, não uma
`Notification` (conteúdo/evento canônico, imutável) + `NotificationRecipient` (1 por destinatário, mutável).
Espelha o par **append-only + estado mutável** (`MembershipEvent`/`CardHistory` para o append-only;
`Task`/`Solicitacao` ledger para o mutável). Sem `NotificationHistory` — a própria `NotificationRecipient`
(readAt/availabilityState) É a trilha do estado; o epics não pede terceira tabela (Constitution: sem
antecipar).

### D2 — Idempotência por `dedupeKey` determinística (não por composto de FKs)
`NotificationRecipient.dedupeKey = "{sourceEventId}|{type}|{recipientMembershipId}"`, com
`@@unique([orgId, dedupeKey])`. Encoda **exatamente** *Org + Evento de origem + tipo + destinatário* (§1569)
num único índice, **independente do uuid da Notification** (estável no reprocesso). O conteúdo tem a sua
própria idempotência `@@unique([orgId, sourceEventId, type])` (1 conteúdo por Evento+tipo). "Múltiplos papéis
→ mesma pessoa" colapsa porque `recipientMembershipId` é a identidade da pessoa **na Org** (Membership única
por Account×Org) — os papéis (Pipe/Card/Responsável) todos resolvem para a mesma Membership.

### D3 — `skipDuplicates` (ON CONFLICT DO NOTHING), não upsert por-linha
A escrita usa `createMany({ skipDuplicates: true })` para conteúdo e destinatários. Evita o `P2002`
abortando a transação interativa (o Postgres aborta a tx inteira num unique violation; um catch-and-reselect
na MESMA tx falharia com "current transaction is aborted"). Reprocesso e concorrência viram no-op idempotente.
O conteúdo congelado **não** é sobrescrito (imutabilidade por construção — padrão `FormVersion`).

### D4 — `sourceEventId` obrigatório; referência-por-id sem FK
Todo evento notificável **deve** carregar uma identidade de Evento de origem — sem ela não há idempotência
(fail-closed: o serviço exige `sourceEventId` UUID). Sem FK: os produtores (5.6/5.7/E8) têm origens
heterogêneas; um FK a uma tabela concreta acoplaria o modelo e criaria cascata destrutiva. O mesmo vale para
`resourceId`/`actorId`/`recipientMembershipId`/`recipientUserId` — todos referência-por-id (a Notificação
**nunca concede acesso**; perder o recurso/pessoa **não** apaga a trilha).

### D5 — `readAt` persistido; estado lido **derivado**
Persiste-se o instante `readAt` (nulo/preenchido); o booleano `lido` é **derivado** por `estaLida(readAt)` e
**nunca** persistido (precedente: `atrasada` da 5.1, `card-health.core`). "Marcar como lida" é idempotente
(guarda otimista sobre `readAt=null`).

### D6 — Recorte write-side vs. 5.4/5.6 (ver spec §2)
5.3 = modelo + serviço de escrita + `marcarComoLida` **de serviço** + núcleo de sanitização. **Sem** rota
HTTP (criação = produtor de sistema; leitura/marcar-lida-HTTP/contagem/revalidação = 5.4; catálogo/produtores
= 5.6/5.7/E8). O **consumidor concreto** anti-"modelo vazio" é o **teste ponta-a-ponta do serviço** — não se
cria tipo/produtor concreto.

### D7 — Sanitização fail-closed no write (anti-XSS + allowlist estrutural)
`params` passa por allowlist estrutural (chaves `^[a-zA-Z][a-zA-Z0-9_]*$`, escalares, HTML-escapado, tetos).
Não há catálogo de tipos em 5.3 (é 5.6), então a allowlist é **estrutural** (como `codigoSanitizado` da 4.8),
não semântica por-tipo. Prototype-pollution barrada (chaves com `_`/`__proto__` rejeitadas). `<script>` →
`&lt;script&gt;` (provado por teste de injeção).

## Débitos técnicos menores

### DEB-5-3-SANITIZE-TETO-ORDEM (LOW — sem ação nesta Story)
Em `notification-content.core.ts`, `sanitizarValorRenderizavel` aplica o teto de 500 chars **após** o
`escaparHtml`. Num valor no limite, isso pode truncar uma entidade HTML no meio (ex.: `&amp;` → `&am`). O QA
confirmou **sem risco de XSS** — truncar uma entidade não reintroduz marcação ativa (o resultado continua
texto inerte; um `&am` renderiza como literal, não como tag). O Security aprovou a superfície fail-closed.
**Não se mexe** no núcleo nesta Story (mudar a ordem reabriria a revisão de segurança de uma superfície já
aprovada, sem ganho de risco). Se um dia importar a fidelidade visual do texto truncado, a correção é
truncar **antes** do escape (ou por code point com reserva para a entidade) — decisão de UX, não de
segurança. Registrado para 5.4/5.6 (superfícies de renderização).

## Consequências
- 5.4 lê `NotificationRecipient` por `recipientMembershipId` (índice pronto), revalida a autz por
  `resourceType`/`resourceId`, aplica `availabilityState`, conta no servidor, e expõe as 3 superfícies.
- 5.6/5.7/E8 chamam `registrarNotificacao` com `type`/`sourceEventId`/`recipients` concretos.
- Débitos de contrato-futuro: revalidação-na-leitura, contagem, "marcar todas" (cursor), preferências por
  tipo, tempo-real, catálogo/distribuição/produtores.
