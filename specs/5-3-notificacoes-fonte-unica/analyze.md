# Analyze — Story 5.3 (consistência cross-artefato)

## Cobertura AC (§1572–1575)
| AC | Cobertura | Teste |
|----|-----------|-------|
| AC1 grava conteúdo 1x (imutável) + 1 recipient/destinatário, readAt derivado, idempotência lógica | `registrarNotificacao` + `@@unique` | `notifications-write`, `notification-content.core` |
| AC2 reprocesso / multi-papel → sem duplicidade | `dedupeKey` + `skipDuplicates` | `notifications-write` |
| AC3 perda de acesso oculta/sanitiza/não conta; nunca concede/revela | referência-por-id + `availabilityState` (modelo); revalidação = 5.4 | `notifications-write` (modelo) + decisão |
| AC4 sem payload/token/segredo/URL; renderizável sanitizado | núcleo de sanitização | `notification-content.core`, `notifications-write` |

## Consistência
- **Rastreabilidade:** FR-29 (fonte única), RN-080..085, AD-22/30, NFR-3/8/19/20/22, INV-NOTIF-01 — todos
  endereçados pelo modelo + sanitização + isolamento.
- **Twin declarado:** append-only (`MembershipEvent`/`CardHistory`) + ledger mutável (`Task`/`Solicitacao`).
  GRANT/RLS/FORCE/WITH CHECK simétricos à base.
- **Sem conflito com CLAUDE.md:** sem DELETE de runtime; `MODELOS_AUDITADOS` atualizado; C3 congelado; sem
  `where orgId` manual.

## Riscos / mitigação
- **Idempotência em tx interativa:** `skipDuplicates` (`ON CONFLICT DO NOTHING`) evita abort por P2002; P2002/
  P2028 residual → idempotente. Mitigado + testado.
- **Prototype pollution via `params`:** allowlist de chave rejeita `__proto__`/`constructor`; build em objeto
  fresco. Testado.
- **Anti-especulação:** availabilityState existe mas sua transição (supressão) é 5.4; documentado como
  contrato-futuro; nenhuma rota/produtor concreto inventado.

## Ambiguidade resolvida
"Marcar como lida" aparece em 5.3 (`readAt` no destinatário) e 5.4 (operação HTTP + contagem). Resolvido:
5.3 = método de serviço; 5.4 = rota + contagem + "todas". Ver decisão D6.

**Sem inconsistências bloqueantes. Prossegue.**
