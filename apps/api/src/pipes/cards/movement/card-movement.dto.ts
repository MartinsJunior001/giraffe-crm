import { BadRequestException } from '@nestjs/common';

/**
 * Validação de entrada MANUAL da movimentação (Story 2.14), no mesmo estilo da 2.7 (`cards.dto.ts`): aceita
 * `unknown`, valida a FORMA do envelope, devolve o tipo estreito — ou lança `BadRequestException` sanitizada. Sem
 * `class-validator` (Constitution II). A validação de DOMÍNIO da transição (ciclo/Fase/Pipe/confirmação) é do núcleo
 * puro `transition-preflight.ts`; aqui só garantimos o envelope.
 *
 * NUNCA se aceita `orgId`/`pipeId`/`phaseId` de origem do cliente — a origem é lida do próprio Card sob contexto; o
 * `destinoPhaseId` é validado sob RLS (mesmo Pipe/Org) no serviço.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MovimentacaoDTO {
  destinoPhaseId: string;
  confirmado: boolean;
}

/**
 * Valida o corpo da movimentação. `destinoPhaseId` é obrigatório e UUID (a existência/mesmo-Pipe é verificada sob
 * contexto no serviço). `confirmado` é obrigatório e booleano — mas a REGRA (precisa ser `true`) é do preflight, não
 * do parser: um `confirmado: false` bem-formado deve chegar ao serviço para virar um bloqueio `CONFIRMACAO_AUSENTE`
 * (409), não um 400 de forma.
 *
 * **Sem `idempotencyKey`** (diferente da submissão da 2.7): a movimentação é idempotente por CONSTRUÇÃO — a guarda
 * otimista por `phaseId` + o no-op quando destino == Fase atual (D4) tornam um retry ao mesmo destino um 200 sem
 * novo evento. Uma chave de dedup seria não só desnecessária como ERRADA: suprimiria uma re-movimentação legítima
 * (A→B→A→B são eventos `MOVED` distintos). Não se carrega superfície inerte (Constitution).
 */
export function parseMovimentacao(body: unknown): MovimentacaoDTO {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const dados = body as Record<string, unknown>;

  const destino = dados.destinoPhaseId;
  if (typeof destino !== 'string' || !UUID_RE.test(destino)) {
    throw new BadRequestException('destinoPhaseId inválido');
  }

  const confirmado = dados.confirmado;
  if (typeof confirmado !== 'boolean') {
    throw new BadRequestException('confirmado deve ser booleano');
  }

  return { destinoPhaseId: destino, confirmado };
}
