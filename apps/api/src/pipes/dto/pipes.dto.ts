import { BadRequestException } from '@nestjs/common';

/**
 * Validação de entrada MANUAL e explícita — o projeto não adota `class-validator` (dependência não
 * justificada por um consumidor real ainda; Constitution II). Cada parser aceita `unknown` (o corpo
 * HTTP não é confiável), valida, e devolve o valor no tipo estreito — ou lança `BadRequestException`
 * SANITIZADA (sem ecoar o valor recebido, que poderia conter conteúdo hostil).
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

function validarBooleano(valor: unknown, campo: string): boolean {
  if (typeof valor !== 'boolean') throw new BadRequestException(`${campo} deve ser booleano`);
  return valor;
}

/** Garante que `:id` é um UUID antes de tocar o banco (a coluna é UUID; lixo geraria erro cru). */
export function validarIdPipe(id: string): string {
  if (!UUID_RE.test(id)) throw new BadRequestException('id inválido');
  return id;
}

/** Corpo de `POST /pipes`. Só `name` é aceito — estado/marcadores têm defaults no banco. */
export function parseCriarPipe(body: unknown): { name: string } {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('corpo inválido');
  }
  return { name: validarNome((body as Record<string, unknown>).name) };
}

/**
 * Corpo de `PATCH /pipes/:id`. Parcial, mas NÃO vazio: um PATCH sem nenhum campo conhecido é erro do
 * cliente, não um no-op silencioso. `state`/`archivedAt` não são aceitos aqui — mudança de estado é
 * pelas rotas `archive`/`restore`, não por atribuição direta.
 */
export function parseAtualizarPipe(body: unknown): {
  name?: string;
  locked?: boolean;
  starred?: boolean;
} {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('corpo inválido');
  }
  const dados = body as Record<string, unknown>;
  const alteracao: { name?: string; locked?: boolean; starred?: boolean } = {};
  if (dados.name !== undefined) alteracao.name = validarNome(dados.name);
  if (dados.locked !== undefined) alteracao.locked = validarBooleano(dados.locked, 'locked');
  if (dados.starred !== undefined) alteracao.starred = validarBooleano(dados.starred, 'starred');
  if (Object.keys(alteracao).length === 0) {
    throw new BadRequestException('informe ao menos um campo: name, locked ou starred');
  }
  return alteracao;
}

/** `?arquivados=true` inclui os arquivados no catálogo; qualquer outro valor (ou ausência) = só ativos. */
export function parseIncluirArquivados(valor: unknown): boolean {
  return valor === 'true';
}
