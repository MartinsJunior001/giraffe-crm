# observability-check — Story 1.7 (casca e design system)

## O que esta Story emite
Nada de novo no backend além do campo `papel` no payload de `/organizations/current` — que **não** é
segredo nem PII e já é logado de forma sanitizada (o payload de resposta não é registrado; a redação
global de `authorization`/`cookie`/`set-cookie` do Pino permanece).

## Verificações
- **Sem novo log sensível.** A Story é frontend; não adiciona eventos de log no backend. O `papel` no
  payload não é registrado em log de requisição (o `res` só loga status/headers, com redação ativa).
- **Estado do cliente sanitizado.** A casca e o Dashboard consomem o estado honesto de `lib/auth.ts` —
  falha nunca vaza URL interna, stack ou segredo ao HTML (contrato da 1.5 preservado).
- **Sem PII no frontend.** A topbar mostra o **nome da Organização** (não é PII de pessoa) e adapta a UI
  pelo `papel`. Nenhum dado pessoal desnecessário é exibido.
- **Probes e redação inalterados.** Nada nesta Story mexe na supressão de `/health`/`/ready` nem na
  redação do Pino.

## Veredito
**APROVADO** — sem novo log sensível, estado do cliente sanitizado, sem PII desnecessária, redação e
probes preservados.
