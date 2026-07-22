# observability-check — Story 4.4

**Status:** APROVADO
**Risco:** ALTO.

## O que a 4.4 observa
Núcleo puro — sem I/O, sem logging próprio. A observabilidade da avaliação (registrar resultado por Condição,
estado da avaliação) é da **trilha de Execuções (4.8)**, que consumirá o `ResultadoAvaliacao` do avaliador.

## Saída estruturada para a trilha futura
- O avaliador devolve `ResultadoAvaliacao { aprovado, resultados[] }`; cada `ResultadoCondicao` traz
  `indice`/`tipo`/`operador`/`resultado`/`motivo` (SANITIZADO — `FAIL_CLOSED` quando falso). **Nunca** o valor
  comparado (possível PII) — coerente com o log sanitizado da 4.1 e com NFR-1/8/16.
- Essa forma já distingue "não satisfeita" (resultado false) do erro (`motivo: 'FAIL_CLOSED'`), base honesta para
  os estados distintos da 4.8 (UX-DR6).

## Log do enforcement de configuração
- O 400 `CONDICAO_FORA_DO_CATALOGO` reusa o caminho de erro dos serviços 4.1/4.2 — motivo estrutural, sem eco do
  payload. A auditoria de criação/edição de Automação (FR-214) já existe (4.1/4.2) e não muda.

## Health/readiness
- Sem impacto: nenhuma dependência nova, nenhuma query nova, nenhum provider novo.

## Veredito
APROVADO — a 4.4 entrega a saída observável (resultado por Condição, sanitizado); a persistência/exibição é da
4.8 (AD-11, sem consumidor concreto agora).
