import { BadRequestException } from '@nestjs/common';

/**
 * Validação MANUAL de entrada das rotas de acesso de Card (Story 2.10), no estilo das demais (2.4–2.7): aceita
 * `unknown`, valida, devolve o tipo estreito — ou lança `BadRequestException` sanitizada. Sem `class-validator`
 * (Constitution II). A autorização e as regras de domínio ficam no serviço; aqui só a forma do envelope.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Garante que um `:id` de rota é UUID antes de tocar o banco. */
export function validarIdRota(id: string, campo: string): string {
  if (!UUID_RE.test(id)) throw new BadRequestException(`${campo} inválido`);
  return id;
}

/** Corpo de atribuição de Responsável: apenas o alvo, por `membershipId` (elegibilidade é por Membership). */
export interface AtribuirResponsavelDTO {
  membershipId: string;
}

export function parseAtribuirResponsavel(body: unknown): AtribuirResponsavelDTO {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const dados = body as Record<string, unknown>;
  const membershipId = dados.membershipId;
  if (typeof membershipId !== 'string' || !UUID_RE.test(membershipId)) {
    throw new BadRequestException('membershipId inválido');
  }
  return { membershipId };
}

/**
 * Capacidades de uma concessão direta de acesso (o `membershipId` alvo vem do path). Envelope explícito,
 * deny-by-default: `podeOperar` e `podeMover` opt-in; ler é sempre concedido (uma concessão sempre deixa ver o
 * Card). `podeMover` exige `podeOperar` (mover é operação — não faz sentido mover sem poder operar).
 */
export interface CapacidadesDTO {
  podeOperar: boolean;
  podeMover: boolean;
}

export function parseCapacidades(body: unknown): CapacidadesDTO {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const dados = body as Record<string, unknown>;

  const podeOperar = lerBooleano(dados.podeOperar, 'podeOperar');
  const podeMover = lerBooleano(dados.podeMover, 'podeMover');
  if (podeMover && !podeOperar) {
    throw new BadRequestException('podeMover exige podeOperar');
  }

  return { podeOperar, podeMover };
}

/** Booleano opcional: ausente/`undefined` vira `false` (deny-by-default); qualquer outra coisa que não boolean → 400. */
function lerBooleano(valor: unknown, campo: string): boolean {
  if (valor === undefined) return false;
  if (typeof valor !== 'boolean') throw new BadRequestException(`${campo} deve ser booleano`);
  return valor;
}
