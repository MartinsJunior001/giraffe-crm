# performance-check — Story 1.2

**Status: N/A — justificado**

## Por que N/A

Não existe consumidor de domínio: nenhuma rota, nenhuma query de negócio, nenhuma carga. Medir
latência de um sistema sem tráfego produziria um número sem significado, e um número sem
significado num relatório é pior que a ausência dele — ele vira baseline por acidente.

## O custo que foi introduzido (registrado, não medido)

Cada operação de modelo passou a ser uma **transação explícita**:

```
BEGIN
  SELECT set_config('app.current_org_id', $1, true)
  SELECT set_config('app.current_account_id', $2, true)
  <query>
COMMIT
```

Um `findUnique` que era 1 round-trip agora são 3 statements numa transação, com a conexão
retida do pool durante ela. `withAccountContext` usa 2.

É o preço do isolamento transaction-local, e é a decisão certa: a alternativa (`set_config`
com escopo de conexão) vazaria contexto pelo pool — silenciosamente. Mas é um custo real, e
está escrito aqui em vez de ser omitido.

## O que a próxima Story com carga precisa medir

1. Latência p50/p95 de uma query de domínio **com** e **sem** a extensão de contexto.
2. Dimensionamento do pool do Prisma (hoje no default: `num_cpus * 2 + 1`), que passou a ser
   mais sensível — transações seguram conexão por mais tempo que queries soltas.
3. Custo das funções `current_org_id()`/`current_account_id()` nas policies, que são avaliadas
   por linha em varreduras. São `STABLE`, o que permite ao planejador cacheá-las por statement.
4. Se a sonda de `/ready` compete por conexão com o tráfego sob carga (pool exausto ⇒ a sonda
   falha ⇒ 503 ⇒ a instância sai de rotação **por excesso de tráfego**, não por banco fora).
   É um modo de falha em cascata conhecido, e hoje não há como observá-lo.

## Medição pontual que existe

Única medida tomada, e por necessidade (um deadline de sonda dependia dela): a **primeira**
query de um client Prisma custa ~**2.038 ms** (subida do engine + conexão); as seguintes, ~0 ms.
Foi o que definiu o deadline de readiness em 5 s e o `--timeout=6s` do HEALTHCHECK.
