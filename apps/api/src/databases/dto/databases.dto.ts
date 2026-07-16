import { BadRequestException } from '@nestjs/common';

/**
 * Validação de entrada MANUAL e explícita — o projeto não adota `class-validator` (Constitution II).
 * Cada parser aceita `unknown` (o corpo HTTP não é confiável), valida, e devolve o valor no tipo
 * estreito — ou lança `BadRequestException` SANITIZADA (sem ecoar o valor recebido, que poderia
 * conter conteúdo hostil). Espelha `pipes/dto/pipes.dto.ts` (2.1), entidade distinta.
 */

/** Limite defensivo de tamanho de nome — evita gravar texto arbitrariamente grande. */
const NOME_MAX = 200;

/** UUID v1–v5 canônico. `:id` malformado é erro do cliente (400), não uma sonda de enumeração. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validarNome(valor: unknown): string {
  if (typeof valor !== 'string') throw new BadRequestException('name deve ser uma string');
  const nome = valor.trim();
  if (nome.length === 0) throw new BadRequestException('name não pode ser vazio');
  if (nome.length > NOME_MAX) throw new BadRequestException('name excede o tamanho máximo');
  return nome;
}

/** Garante que `:id` é um UUID antes de tocar o banco (a coluna é UUID; lixo geraria erro cru). */
export function validarIdDatabase(id: string): string {
  if (!UUID_RE.test(id)) throw new BadRequestException('id inválido');
  return id;
}

/** Corpo de `POST /databases`. Só `name` é aceito — estado tem default no banco; sem `orgId`. */
export function parseCriarDatabase(body: unknown): { name: string } {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('corpo inválido');
  }
  return { name: validarNome((body as Record<string, unknown>).name) };
}

/**
 * Corpo de `PATCH /databases/:id` (renomear). Só `name` — não há `locked`/`starred` (não existem em
 * Database) nem `state`/`archivedAt` (mudança de estado é pelas rotas `archive`/`restore`, não por
 * atribuição direta).
 */
export function parseRenomearDatabase(body: unknown): { name: string } {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('corpo inválido');
  }
  return { name: validarNome((body as Record<string, unknown>).name) };
}

/** `?arquivados=true` inclui os arquivados no catálogo; qualquer outro valor (ou ausência) = só ativos. */
export function parseIncluirArquivados(valor: unknown): boolean {
  return valor === 'true';
}
