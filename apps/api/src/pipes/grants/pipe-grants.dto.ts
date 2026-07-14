import { BadRequestException } from '@nestjs/common';
import { PipeRole } from '../../../generated/prisma';

/**
 * Validação de entrada MANUAL das rotas de concessão de papel por Pipe (Story 2.2), no mesmo estilo do
 * DTO de Pipe (2.1): aceita `unknown`, valida, devolve o tipo estreito — ou lança `BadRequestException`
 * SANITIZADA (sem ecoar o valor recebido). O projeto não adota `class-validator` (Constitution II).
 */

// Formato UUID (8-4-4-4-12 hex) — o que a coluna `@db.Uuid` do PostgreSQL aceita. Deliberadamente NÃO
// exige os nibbles de versão/variante: `membershipId` é um id EXISTENTE escolhido pelo Admin (pode ser
// um id sintético de fixture/seed, não só um v4 gerado). Esta checagem é só um pré-filtro para devolver
// 400 em vez de 500 diante de lixo — a fronteira real de existência/escopo é a RLS + a validação no
// serviço, não este regex.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Papéis de Pipe aceitos — exatamente o enum `PipeRole` (D1.4). Qualquer outro valor é 400. */
const PAPEIS_VALIDOS = new Set<string>(Object.values(PipeRole));

/** Garante que um `:id` de rota (pipe ou grant) é UUID antes de tocar o banco. */
export function validarIdRota(id: string, campo: string): string {
  if (!UUID_RE.test(id)) throw new BadRequestException(`${campo} inválido`);
  return id;
}

function validarPapel(valor: unknown): PipeRole {
  if (typeof valor !== 'string' || !PAPEIS_VALIDOS.has(valor)) {
    throw new BadRequestException(
      'role deve ser um papel de Pipe válido (ADMIN, MEMBER ou VIEWER)',
    );
  }
  return valor as PipeRole;
}

/** Lê um booleano opcional; ausência → `undefined`, valor não-booleano → 400. */
function validarBoolOpcional(valor: unknown, campo: string): boolean | undefined {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'boolean') throw new BadRequestException(`${campo} deve ser booleano`);
  return valor;
}

/**
 * Corpo de `POST /pipes/:pipeId/grants`. Concede `role` a uma `membershipId` (o alvo da concessão) e,
 * opcionalmente, a capacidade "Revisar submissões públicas" (Story 2.8; default falso — deny-by-default).
 */
export function parseConcederPapel(body: unknown): {
  membershipId: string;
  role: PipeRole;
  reviewPublicSubmissions: boolean;
} {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('corpo inválido');
  }
  const dados = body as Record<string, unknown>;
  if (typeof dados.membershipId !== 'string' || !UUID_RE.test(dados.membershipId)) {
    throw new BadRequestException('membershipId inválido');
  }
  return {
    membershipId: dados.membershipId,
    role: validarPapel(dados.role),
    reviewPublicSubmissions:
      validarBoolOpcional(dados.reviewPublicSubmissions, 'reviewPublicSubmissions') ?? false,
  };
}

/**
 * Corpo de `PATCH /pipes/:pipeId/grants/:grantId`. Altera o `role` e/ou a capacidade "Revisar submissões
 * públicas" (o alvo não muda).
 */
export function parseAlterarPapel(body: unknown): {
  role: PipeRole;
  reviewPublicSubmissions: boolean | undefined;
} {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('corpo inválido');
  }
  const dados = body as Record<string, unknown>;
  return {
    role: validarPapel(dados.role),
    reviewPublicSubmissions: validarBoolOpcional(
      dados.reviewPublicSubmissions,
      'reviewPublicSubmissions',
    ),
  };
}
