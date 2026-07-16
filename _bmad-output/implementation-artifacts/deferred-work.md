# Deferred Work

Itens reais mas não-bloqueantes, adiados durante gates/revisões. Cada entrada aponta a origem e o follow-up sugerido.

## Deferred from: code review of story-3.1 (2026-07-16)

- **Teste de autorização dedicado ausente** (`apps/api/test/`): a spec nomeia `databases-authz.test.ts` como artefato próprio, mas a cobertura de autorização vive dobrada em `databases-http.test.ts` (MEMBER→403 nas 6 rotas; cross-tenant→404). Follow-up: extrair a suíte de autorização para o arquivo dedicado. Baixo impacto (comportamento provado).
- **Caso GUEST não exercitado** (`apps/api/test/databases-http.test.ts`): só MEMBER é testado na negação. Comportamento correto por deny-by-default (a `ability.factory` só concede a ADMIN). Follow-up: adicionar caso explícito para GUEST. Baixo impacto.
- **Coerção de query param repetido** (`apps/api/src/databases/dto/databases.dto.ts:51`): `parseIncluirArquivados` faz `valor === 'true'`; um `?arquivados=true&arquivados=true` chega como array e cai para só-ativos (fail-safe, sem vazamento). Follow-up: tratar o array pegando o último valor. Baixo impacto (entrada malformada).
