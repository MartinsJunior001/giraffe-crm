import { BadRequestException } from '@nestjs/common';
import { LIMITE_NOME } from '../automation-config';

/**
 * Fronteira de entrada das rotas de Automação (Story 4.1). Parsing explícito e fail-closed — nada de
 * confiar na forma do corpo. O que a Story de fato garante:
 *
 *   · `orgId` **nunca** é aceito do cliente (a Organização vem do contexto resolvido no servidor);
 *   · `state` **nunca** é aceito do cliente (nasce `INACTIVE` pelo default da coluna — D4.3);
 *   · `pipeId` vem da ROTA, não do corpo — o vínculo é do caminho, não de um campo forjável.
 *
 * A validação da CONFIGURAÇÃO (`quando`/`condicoes`/`entao`) não acontece aqui: é do núcleo puro
 * `automation-config.ts`, para ser testável sem HTTP e reusável pelos consumidores de 4.2+.
 */

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Valida um identificador de rota. Formato inválido é 400 — nunca chega a virar query. */
export function validarUuidDeRota(valor: string, campo: string): string {
  if (typeof valor !== 'string' || !RE_UUID.test(valor)) {
    throw new BadRequestException({ motivo: 'ID_INVALIDO', campo });
  }
  return valor;
}

export interface CriarAutomacaoDto {
  name: string;
  quando: unknown;
  condicoes?: unknown;
  entao: unknown;
  idempotencyKey?: string;
}

export function parseCriarAutomacao(body: unknown): CriarAutomacaoDto {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException({ motivo: 'CORPO_INVALIDO' });
  }
  const b = body as Record<string, unknown>;

  // Allowlist de chaves do corpo: anti-mass-assignment. `state` e `orgId` recebidos aqui são REJEITADOS
  // explicitamente, em vez de silenciosamente descartados — quem tentou precisa saber que não funcionou.
  const permitidas = new Set(['name', 'quando', 'condicoes', 'entao', 'idempotencyKey']);
  for (const chave of Object.keys(b)) {
    if (!permitidas.has(chave)) {
      throw new BadRequestException({ motivo: 'CAMPO_NAO_PERMITIDO', campo: chave });
    }
  }

  const name = validarNome(b.name);
  return {
    name,
    quando: b.quando,
    condicoes: b.condicoes,
    entao: b.entao,
    idempotencyKey: validarIdempotencyKey(b.idempotencyKey),
  };
}

export interface EditarAutomacaoDto {
  name?: string;
  quando?: unknown;
  condicoes?: unknown;
  entao?: unknown;
}

/**
 * Edição (Story 4.2): todos os campos são OPCIONAIS — o presente sobrescreve, o omitido preserva. Ao menos
 * um campo material é exigido (um PATCH vazio não é uma edição). `state`/`orgId`/`activeVersion` são
 * rejeitados (o estado muda por rotas próprias; a versão é do servidor).
 */
export function parseEditarAutomacao(body: unknown): EditarAutomacaoDto {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException({ motivo: 'CORPO_INVALIDO' });
  }
  const b = body as Record<string, unknown>;

  const permitidas = new Set(['name', 'quando', 'condicoes', 'entao']);
  for (const chave of Object.keys(b)) {
    if (!permitidas.has(chave)) {
      throw new BadRequestException({ motivo: 'CAMPO_NAO_PERMITIDO', campo: chave });
    }
  }
  if (Object.keys(b).length === 0) {
    throw new BadRequestException({ motivo: 'NADA_A_EDITAR' });
  }

  const dto: EditarAutomacaoDto = {};
  if ('name' in b) dto.name = validarNome(b.name);
  if ('quando' in b) dto.quando = b.quando;
  if ('condicoes' in b) dto.condicoes = b.condicoes;
  if ('entao' in b) dto.entao = b.entao;
  return dto;
}

export interface DuplicarAutomacaoDto {
  name?: string;
  idempotencyKey?: string;
}

/** Duplicação (Story 4.2): nome opcional (default no serviço = "Cópia de …") e idempotencyKey opcional. */
export function parseDuplicarAutomacao(body: unknown): DuplicarAutomacaoDto {
  // Corpo ausente/vazio é válido: duplicar sem argumentos usa o nome default e não é idempotente.
  if (body === undefined || body === null) return {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException({ motivo: 'CORPO_INVALIDO' });
  }
  const b = body as Record<string, unknown>;

  const permitidas = new Set(['name', 'idempotencyKey']);
  for (const chave of Object.keys(b)) {
    if (!permitidas.has(chave)) {
      throw new BadRequestException({ motivo: 'CAMPO_NAO_PERMITIDO', campo: chave });
    }
  }
  const dto: DuplicarAutomacaoDto = {};
  if ('name' in b) dto.name = validarNome(b.name);
  dto.idempotencyKey = validarIdempotencyKey(b.idempotencyKey);
  return dto;
}

/** Rótulo obrigatório, não-vazio e dentro do limite do catálogo. */
function validarNome(valor: unknown): string {
  if (typeof valor !== 'string') throw new BadRequestException({ motivo: 'NOME_INVALIDO' });
  const name = valor.trim();
  if (name.length === 0 || name.length > LIMITE_NOME) {
    throw new BadRequestException({ motivo: 'NOME_INVALIDO' });
  }
  return name;
}

/** Chave de idempotência opcional — quando presente, precisa ser texto não-vazio e limitado. */
function validarIdempotencyKey(valor: unknown): string | undefined {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'string' || valor.trim().length === 0 || valor.length > 200) {
    throw new BadRequestException({ motivo: 'IDEMPOTENCY_KEY_INVALIDA' });
  }
  return valor;
}

/** Valida o número de versão vindo da rota (inteiro positivo). */
export function validarVersaoDeRota(valor: string): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestException({ motivo: 'VERSAO_INVALIDA' });
  }
  return n;
}
