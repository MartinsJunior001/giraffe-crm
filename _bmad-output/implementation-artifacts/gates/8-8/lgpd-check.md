# lgpd-check — Story 8.8

**Status: APROVADO (read-side técnico).** Retenção/anonimização/descarte/backups = **GATE DE PRODUÇÃO**
(Governança/Jurídico), documentado abaixo — **não bloqueia** esta implementação/testes (decisão D-4).

## Minimização e finalidade (read-side)
- A projeção expõe SÓ referências mínimas + metadados (`audit-projection.ts`, allowlist AD-30):
  `auditEventId`, `schemaVersion`, `categoria`, `operacao`, `resultado`, `ocorridoEm`, `correlationId`, ref
  do ator (`accountId` pseudonimizável), ref do recurso (`{tipo:'Membership', id}`), `alteracao`
  (`fromRole`/`toRole`/`fromState`/`toState`). **Nunca** nome/e-mail/senha/token/sessão/cookie/id de
  sessão/corpo HTTP/PII sem finalidade — não existem na tabela; a allowlist blinda o `payload`.
- Finalidade legítima: o Administrador acompanhar mudanças de acesso/configuração da própria Organização.

## Acesso autorizado
- Só Admin ATIVO da Org atual (guard + defesa em profundidade). Isolamento por Org (RLS). Refs restritas não
  revelam conteúdo inacessível de outra Organização.

## Pseudonimização do ator
- O ator é referenciado por `accountId` (id opaco), não por nome/e-mail. Uma anonimização/exclusão de
  Account (futura, E1/8.x) pode remover os dados EXIBÍVEIS do ator preservando a **referência
  pseudonimizada** — o `MembershipEvent` guarda só o `actorId`, compatível com esse tratamento.

## Não-exclusão / imutabilidade
- Read-side; nenhuma exclusão/edição de auditoria pelo fluxo comum (INV-AUDIT-01/AD-30). O runtime não tem
  UPDATE/DELETE em `MembershipEvent`. Correção = novo Evento.

## Acesso auditado
- `AUDIT_LOG_VIEWED` registra QUEM consultou a auditoria, com filtros/paginação/contagem (sem o conteúdo) —
  rastreabilidade do próprio acesso a dado sensível.

---

## GATE DE PRODUÇÃO — pendente de Governança/Jurídico (NÃO bloqueia esta Story)

Baseline de PRODUTO (não é afirmação jurídica); valores/decisões finais são de Governança/Jurídico
(AD-34/OQ-40/41). A validar ANTES da liberação em produção:

1. **Retenção — 24 meses** (config GLOBAL da Plataforma, não por-Org nesta Story) por **processo de
   retenção controlado**: idempotente, observável, auditado, **fora do caminho de app** (job/rotina
   administrativa; nunca no boot do container). Expira eventos além da janela.
2. **Legal hold** — suspende a expiração de eventos sob obrigação legal de preservação; exceção registrada e
   auditável.
3. **Anonimização / exclusão de Account** — remove dados exibíveis do ator preservando a referência
   pseudonimizada (o `actorId` já é opaco; o processo de E1 define o mapeamento).
4. **Descarte** — remoção lógica seguida de expurgo físico conforme a política; exceções controladas.
5. **Backups** — seguem a política de ciclo de vida (expiração natural, sem retenção indefinida); restauração
   não reintroduz dado além da política.
6. **Proteção contra alteração** — já garantida pelo banco (append-only) no write-side; a política formaliza
   o controle organizacional.

Responsável: Governança/Jurídico + Arquitetura. Condição de desbloqueio de PRODUÇÃO: valores aprovados +
processo de retenção implementado e testado. **Débito: DEB-8-8-RETENCAO-PRODUCAO.**
