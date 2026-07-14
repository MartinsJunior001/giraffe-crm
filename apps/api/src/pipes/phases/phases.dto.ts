import { BadRequestException } from '@nestjs/common';

/**
 * Validação de entrada MANUAL das rotas de Fase (Story 2.3), no mesmo estilo dos DTOs de Pipe/concessão:
 * aceita `unknown`, valida, devolve o tipo estreito — ou lança `BadRequestException` SANITIZADA (sem ecoar
 * o valor recebido). O projeto não adota `class-validator` (Constitution II).
 */

/** Limite defensivo de tamanho de nome (igual ao de Pipe). */
const NOME_MAX = 200;

// Formato UUID (8-4-4-4-12 hex) — o que a coluna `@db.Uuid` aceita. NÃO exige nibbles de versão/variante:
// ids podem ser sintéticos (fixture/seed). É só um pré-filtro para devolver 400 em vez de 500; a fronteira
// real de existência/escopo é a RLS + a validação no serviço.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Garante que um `:id` de rota (pipe ou phase) é UUID antes de tocar o banco. */
export function validarIdRota(id: string, campo: string): string {
  if (!UUID_RE.test(id)) throw new BadRequestException(`${campo} inválido`);
  return id;
}

function validarNome(valor: unknown): string {
  if (typeof valor !== 'string') throw new BadRequestException('name deve ser uma string');
  const nome = valor.trim();
  if (nome.length === 0) throw new BadRequestException('name não pode ser vazio');
  if (nome.length > NOME_MAX) throw new BadRequestException('name excede o tamanho máximo');
  return nome;
}

/** Corpo de `POST /pipes/:pipeId/phases`. Só `name` — estado/posição são do servidor. */
export function parseCriarFase(body: unknown): { name: string } {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  return { name: validarNome((body as Record<string, unknown>).name) };
}

/** Corpo de `PATCH /pipes/:pipeId/phases/:phaseId`. Só `name` é alterável (estado é pelas rotas próprias). */
export function parseRenomearFase(body: unknown): { name: string } {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  return { name: validarNome((body as Record<string, unknown>).name) };
}

/**
 * Corpo de `POST /pipes/:pipeId/phases/reorder` (mover-um): `phaseId` é a Fase a mover; `afterPhaseId` é a
 * Fase irmã após a qual posicioná-la — `null` (ou ausente) move para o **início**. Não recebe `position`
 * (chave interna). Ordem completa não é aceita: reescrever N posições não seria atômico (ver serviço/plan).
 */
export function parseReordenarFase(body: unknown): {
  phaseId: string;
  afterPhaseId: string | null;
} {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const dados = body as Record<string, unknown>;
  if (typeof dados.phaseId !== 'string' || !UUID_RE.test(dados.phaseId)) {
    throw new BadRequestException('phaseId inválido');
  }
  const after = dados.afterPhaseId;
  if (after === undefined || after === null) {
    return { phaseId: dados.phaseId, afterPhaseId: null };
  }
  if (typeof after !== 'string' || !UUID_RE.test(after)) {
    throw new BadRequestException('afterPhaseId inválido');
  }
  return { phaseId: dados.phaseId, afterPhaseId: after };
}

/** `?arquivadas=true` inclui as arquivadas; qualquer outro valor (ou ausência) = só ativas. */
export function parseIncluirArquivadas(valor: unknown): boolean {
  return valor === 'true';
}
