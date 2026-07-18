# Quickstart — validação fim-a-fim (dev)

**Pré-requisitos:** PostgreSQL (127.0.0.1:5434), **MinIO** e **ClamAV** pelo override de compose de dev/CI, migrations aplicadas, `FILE_UPLOAD_ENABLED=true` no `.env` local, envs de storage/ClamAV/limites definidos.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev-files.yml up -d db minio clamav
pnpm --filter @giraffe/api db:migrate
pnpm --filter @giraffe/api exec vitest run --no-file-parallelism test/files-*.test.ts
```

## Cenários que provam os ACs (referência: spec.md US1..US5)

1. **US1/quarentena+fail-closed** — enviar arquivo benigno → estado `QUARENTENA` → após scan `CLEAN` → `DISPONIVEL`. Enviar **EICAR** → `BLOCKED`, nunca baixável. Derrubar o ClamAV / forçar timeout → veredito `BLOCKED` (não disponibilidade). Zip bomb → `BLOCKED` (AlertExceedsMax). Base de assinatura velha → recusa (canário/DB max age).
2. **US2/download sob sessão** — usuário com leitura baixa por **stream**; inspecionar resposta: sem URL de bucket, sem chave, sem link permanente; sem sessão → negado.
3. **US3/sem acesso cruzado** — usuário da Org B com a chave de um arquivo da Org A → **404 não-enumerante**; provar guarda por segmento (`orgA` não é prefixo de `orgA-x`).
4. **US4/remoção→expurgo** — remover logicamente → indisponível imediatamente → binário expurgado conforme retenção; linha de metadados preservada (sem DELETE físico).
5. **US5/validação** — executável renomeado `.png` → rejeitado pelo conteúdo; acima do tamanho → rejeitado; 11º arquivo no recurso (limite 10) → rejeitado; limites conhecíveis antes do envio.

## Gate desabilitado
Com `FILE_UPLOAD_ENABLED` ausente → toda a superfície responde indisponibilidade honesta (sem 500, sem vazamento). Provar que nenhum arquivo é aceito nem servido.
