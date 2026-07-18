# Quickstart — validar a Story 3.8

Pré (na abertura, 3.7 mergeada): PostgreSQL + **MinIO** + **ClamAV** no ar (override dev/CI — nunca no host do
Chatwoot, AD-32); `FILE_UPLOAD_ENABLED=true`; migrations aplicadas; um Pipe com Formulário inicial publicado
**com Campo Arquivo** e um Database com Formulário publicado com Campo Arquivo (3.3/3.4).

```bash
# testes-alvo (PostgreSQL + MinIO + ClamAV REAIS — mock não prova fail-closed, ADR AC-28)
pnpm --filter @giraffe/api exec vitest run test/card-files-http.test.ts test/record-files-http.test.ts \
  test/card-files-rls.test.ts test/public-file-submission-http.test.ts test/file-gate-consumo.test.ts

# regressão E2/E3 (submissão/publicação/leitura)
pnpm --filter @giraffe/api exec vitest run test/submission-*.test.ts test/records-*.test.ts test/public-submissions-*.test.ts

# suíte serial (gate autoritativo = CI limpo)
pnpm --filter @giraffe/api test:ci
```

## Fluxos funcionais (HTTP, contexto de Org)

1. **Campo Arquivo funcional (AC1):** publicar Formulário com Campo Arquivo (capacidade ligada) → OK; submeter
   referenciando um `fileId` `AVAILABLE` → Card/Registro criado com a referência no `valores`.
2. **Gate de consumo (AC2):** `FILE_UPLOAD_ENABLED=false` + `FormVersion` publicada com Campo Arquivo → submeter →
   **409 `CAPACIDADE_ARQUIVO_INDISPONIVEL`**. (Mutação: deletar o gate → o teste fica vermelho.)
3. **Valor referencial (AC3):** submeter com `fileId` de outro recurso ou `QUARANTINED` → **rejeitado** (400/409);
   string livre num Campo `FILE` → rejeitada. Regressão de submissão textual (outros tipos) verde.
4. **Anexo geral (AC4):** com edição do Card/Registro, `POST` anexo → associado ao recurso; `GET`/download com
   leitura → OK; sem acesso ao recurso (mesma Org, outro recurso) → **404** mesmo com o `fileId` conhecido.
5. **Substituição (AC5):** substituir Campo Arquivo único → o anterior só some após o novo `AVAILABLE`; evento
   `FILE_REPLACED` no Histórico.
6. **Canal público (AC6):** `POST /public/forms/:publicId/submit` com arquivo via Campo Arquivo publicado →
   aplica limites (por arquivo/Campo/submissão), rate limit, magic-bytes; arquivo `QUARANTINED` não converte; sem
   anexo geral público; submitter não baixa.
7. **Read-only sob arquivamento (AC7):** Card/Registro (ou pai) arquivado → ver/baixar OK; upload/substituir/
   remover → **409**.
8. **Isolamento (AC8):** cross-tenant invisível (RLS, autz neutralizada); cross-recurso intra-tenant → 404.
9. **Eventos sem PII (AC9):** `FILE_ATTACHED`/`FILE_REPLACED`/`FILE_REMOVED` sem `nomeOriginal` cru.
