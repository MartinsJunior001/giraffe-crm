# Contrato — Preflight de transição (`transition-preflight.ts`)

> Núcleo **PURO** (sem I/O, sem Prisma, sem Nest). Decide se uma transição de Fase é permitida. É o **contrato que a
> 2.14 produz** para 2.15/E4/E5 (epics §762/§977/§984). Consumido pelo serviço `card-movement.service.ts`.

## Tipos

```ts
/** Contexto imutável de uma tentativa de transição (montado pelo serviço a partir de dados lidos sob RLS). */
export interface ContextoDeTransicao {
  card: { id: string; lifecycleState: 'ATIVO' | 'FINALIZADO' | 'ARQUIVADO'; phaseId: string };
  faseOrigem: { id: string; pipeId: string; archivedAt: Date | null };
  faseDestino: { id: string; pipeId: string; archivedAt: Date | null };
  confirmado: boolean;
}

/** Motivo tipado de bloqueio — estável (2.15/E4/E5 e a camada HTTP mapeiam a partir dele). */
export type MotivoBloqueio =
  | 'CICLO_NAO_ABERTO'      // card.lifecycleState ≠ ATIVO
  | 'FASE_DESTINO_ARQUIVADA'
  | 'FASE_DESTINO_OUTRO_PIPE'
  | 'FASE_DESTINO_IGUAL_ORIGEM'  // ver D4 — o serviço trata como no-op idempotente (200), não erro
  | 'CONFIRMACAO_AUSENTE';

export type ResultadoPreflight =
  | { ok: true }
  | { ok: false; motivo: MotivoBloqueio };

/** Um validador é uma função PURA. Ordenado e componível. */
export type ValidadorDeTransicao = (ctx: ContextoDeTransicao) => ResultadoPreflight;
```

## Validadores built-in (2.14 — os consumidores concretos)

| Validador | Regra | Motivo em falha |
|-----------|-------|-----------------|
| `validarCicloAberto` | `card.lifecycleState === 'ATIVO'` | `CICLO_NAO_ABERTO` |
| `validarFaseDestinoAtiva` | `faseDestino.archivedAt === null` | `FASE_DESTINO_ARQUIVADA` |
| `validarMesmoPipe` | `faseDestino.pipeId === faseOrigem.pipeId` | `FASE_DESTINO_OUTRO_PIPE` |
| `validarDestinoDiferente` | `faseDestino.id !== faseOrigem.id` | `FASE_DESTINO_IGUAL_ORIGEM` |
| `validarConfirmacao` | `confirmado === true` | `CONFIRMACAO_AUSENTE` |

## Composição

```ts
/** Aplica os validadores EM ORDEM; devolve o PRIMEIRO bloqueio, ou { ok: true }. Curto-circuito. */
export function executarPreflight(
  ctx: ContextoDeTransicao,
  validadores: readonly ValidadorDeTransicao[] = VALIDADORES_PADRAO,
): ResultadoPreflight;

/** Lista padrão da 2.14, na ordem de avaliação. 2.15/E4/E5 estendem compondo uma nova lista — SEM reescrever isto. */
export const VALIDADORES_PADRAO: readonly ValidadorDeTransicao[];
```

## Ponto de extensão (2.15 / E4 / E5)

- 2.15 (Formulário de Fase) e E4/E5 **acrescentam** validadores compondo `[...VALIDADORES_PADRAO, novoValidador]` e
  passando a lista a `executarPreflight`. **Não** existe registry/DI (D1): a extensão é por **composição de lista**.
- Um validador que precise de I/O (ex.: checar submissão de Formulário de Fase) resolve o I/O **antes**, no serviço,
  e injeta o resultado já materializado no `ContextoDeTransicao` (mantendo o núcleo puro). Se a 2.15 exigir ampliar o
  `ContextoDeTransicao`, o faz **aditivamente** (campos opcionais), sem quebrar os built-ins.

## Garantias

- **Puro:** determinístico, sem efeitos colaterais, sem dependência de Prisma/Nest — testável isoladamente.
- **Fail-closed:** qualquer bloqueio ⇒ `{ ok: false }` ⇒ o serviço **não** persiste nada.
- **Autorização fica fora** (depende de I/O) — é pré-condição do serviço, não validador puro.
