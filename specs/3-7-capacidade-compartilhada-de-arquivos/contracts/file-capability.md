# Contratos — Capacidade compartilhada de arquivos

## Porta de autorização (injetável) — `FileAuthzContract`

A 3.7 **não** conhece Card/Registro/Conta. Resolve poder por recurso através de uma porta que o consumidor implementa.

```
interface FileAuthzContract {
  // resolve, para o principal atual (via contexto de requisição) e um recurso,
  // se ele pode LER (ver/baixar) e/ou EDITAR (enviar/substituir/remover) arquivos desse recurso.
  podeLer(resourceType: string, resourceId: string): Promise<boolean>;
  podeEditar(resourceType: string, resourceId: string): Promise<boolean>;
}
```

- Sem acesso → o serviço responde **404 não-enumerante** (não confirma existência do arquivo/recurso).
- A 3.7 fornece um **binding de teste** (recurso fictício) para provar a capacidade isolada; 3.8/3.10 ligam recursos reais.

## Rotas (todas sob sessão autenticada; gate `FILE_UPLOAD_ENABLED`)

| Método/Rota (indicativo) | Autorização | Resposta |
|---|---|---|
| `POST` upload (multipart) | `podeEditar` do recurso | 201 com id + estado `QUARENTENA`; validação server-side; 400 se tipo/tamanho/contagem violam |
| `GET` download | `podeLer` do recurso | **stream** sob sessão (nunca redirect a bucket); só se estado `DISPONIVEL`; 404 não-enumerante sem acesso |
| `POST/PUT` substituir (arquivo único) | `podeEditar` | transição de estado; não apaga silenciosamente o anterior (evento é do consumidor) |
| `POST` remover (lógico) | `podeEditar` | 200; estado `REMOVIDO_LOGICO`; expurgo elegível |

- **Invariantes**: chave nunca é autorização; sem link público permanente; capacidade desabilitada → indisponibilidade honesta (sem 500/vazamento); erro/timeout da verificação → bloqueio.
- **Veredito de promoção (composto)**: magic bytes + tamanho + 2×SHA + ClamAV CLEAN + CopyObject if-match. Qualquer falha → `BLOCKED`.
