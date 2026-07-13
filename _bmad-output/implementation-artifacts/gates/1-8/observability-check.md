# observability-check — Story 1.8 (estados honestos e acessibilidade)

## Superfície
Frontend puro. **Nenhum código de backend, nenhum log novo, nenhum probe alterado.**

## Verificações
- **Sem novo log/telemetria.** A Story não adiciona nenhuma emissão de log — não há o que sanitizar além
  do que a casca já garante.
- **Estados sanitizados no cliente:** a falha ("indisponível") mostra mensagem neutra, sem URL interna,
  stack ou segredo (contrato herdado de `lib/api.ts`/`lib/auth.ts`, Stories 1.5/1.7).
- **Sondas inalteradas:** `/health`, `/ready`, `/healthz` não são tocados.

## Veredito
**N/A / APROVADO** — sem superfície de observabilidade nova; estados do cliente permanecem sanitizados.
