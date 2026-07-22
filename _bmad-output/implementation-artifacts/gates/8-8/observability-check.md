# observability-check — Story 8.8

**Status: APROVADO.**

## Evento de acesso (`AUDIT_LOG_VIEWED`)
- Emitido em toda consulta bem-sucedida (Pino, `event:'audit'`, `action:'AUDIT_LOG_VIEWED'`,
  `result:'allowed'`). Campos: `actor`, `orgId`, `filtros` (metadados sanitizados), `paginacao`,
  `resultados` (CONTAGEM), `at`. **Nunca** copia o conteúdo listado — provado no teste puro
  (`montarLogAuditoria` não tem `eventos`/`linhas`/`valores`).

## Sanitização
- Logs estruturados, sempre sanitizados; redaction global de `authorization`/`cookie`/`set-cookie` no
  AppModule. O payload do `AUDIT_LOG_VIEWED` não contém PII de terceiros, segredo, token nem corpo de evento.

## Diagnóstico
- `correlationId` do próprio evento auditado é projetado na resposta (permite correlacionar com a mutação
  que o gerou e com as revogações da mesma operação). Filtros por `ator`/`alvo`/período/operacao habilitam
  investigação de incidente por parte do Admin.

## Health / probes
- Sem impacto em `/health`/`/ready`/`/healthz`. Read-side puro; nenhuma dependência externa nova.

## Erros
- Entrada inválida → 400 sanitizado (mensagem sem eco de segredo). Sem acesso → 403/401. Nenhum stack trace
  ou detalhe interno vaza.

## Veredito
Observabilidade adequada ao risco (acesso à auditoria é ele próprio auditado). Aprovado.
