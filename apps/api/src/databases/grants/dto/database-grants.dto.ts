import { BadRequestException } from '@nestjs/common';
import { DatabaseRole } from '../../../../generated/prisma';

/**
 * Validação de entrada MANUAL das rotas de concessão de papel por Database (Story 3.2), no mesmo estilo do
 * DTO de `PipeGrant` (2.2): aceita `unknown`, valida, devolve o tipo estreito — ou lança
 * `BadRequestException` SANITIZADA (sem ecoar o valor recebido). O projeto NÃO adota `class-validator`
 * (Constitution II). Distinto do DTO de Pipe (RN-061): sem `reviewPublicSubmissions`/`restritoAoProprio`
 * (capacidades de Pipe — 2.8/2.10), que não existem no domínio Database.
 */

// Formato UUID (8-4-4-4-12 hex) — o que a coluna `@db.Uuid` do PostgreSQL aceita. Deliberadamente NÃO
// exige os nibbles de versão/variante: `membershipId` é um id EXISTENTE escolhido pelo Admin (pode ser um
// id sintético de fixture/seed). Pré-filtro para devolver 400 em vez de 500 diante de lixo — a fronteira
// real de existência/escopo é a RLS + a validação no serviço, não este regex.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Papéis de Database aceitos — exatamente o enum `DatabaseRole` (D3.4). Qualquer outro valor é 400. */
const PAPEIS_VALIDOS = new Set<string>(Object.values(DatabaseRole));

/** Garante que um `:id` de rota (database ou grant) é UUID antes de tocar o banco. */
export function validarIdRota(id: string, campo: string): string {
  if (!UUID_RE.test(id)) throw new BadRequestException(`${campo} inválido`);
  return id;
}

function validarPapel(valor: unknown): DatabaseRole {
  if (typeof valor !== 'string' || !PAPEIS_VALIDOS.has(valor)) {
    throw new BadRequestException(
      'role deve ser um papel de Database válido (ADMIN, MEMBER ou VIEWER)',
    );
  }
  return valor as DatabaseRole;
}

/**
 * Corpo de `POST /databases/:databaseId/grants`. Concede `role` a uma `membershipId` (o alvo da concessão).
 */
export function parseConcederPapel(body: unknown): {
  membershipId: string;
  role: DatabaseRole;
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
  };
}

/**
 * Corpo de `PATCH /databases/:databaseId/grants/:grantId`. Altera o `role` (o alvo não muda).
 */
export function parseAlterarPapel(body: unknown): {
  role: DatabaseRole;
} {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('corpo inválido');
  }
  const dados = body as Record<string, unknown>;
  return {
    role: validarPapel(dados.role),
  };
}
