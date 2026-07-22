import { BadRequestException } from '@nestjs/common';

/**
 * Fronteira de entrada das rotas de step-up e troca de senha (Story 1.12). Parsing explícito e
 * fail-closed, com allowlist anti-mass-assignment — o mesmo padrão de `invites.dto.ts`.
 *
 * A senha NÃO é validada aqui contra a política (comprimento/comum): isso é responsabilidade do
 * validador central (`validarPoliticaSenha`), chamado no serviço. Aqui só se garante a FORMA (uma
 * string presente, sob a chave permitida) — para não vazar, pela mensagem de erro do parser, um
 * detalhe da política que o validador central deve ser o único a decidir.
 */

function corpoObjeto(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException({ erro: 'CORPO_INVALIDO' });
  }
  return body as Record<string, unknown>;
}

function exigirChaveUnica(b: Record<string, unknown>, permitida: string): void {
  for (const chave of Object.keys(b)) {
    if (chave !== permitida) {
      throw new BadRequestException({ erro: 'CAMPO_NAO_PERMITIDO', campo: chave });
    }
  }
}

export interface StepUpDto {
  senhaAtual: string;
}

export function parseStepUp(body: unknown): StepUpDto {
  const b = corpoObjeto(body);
  exigirChaveUnica(b, 'senhaAtual');
  if (typeof b.senhaAtual !== 'string' || b.senhaAtual.length === 0) {
    throw new BadRequestException({ erro: 'SENHA_ATUAL_INVALIDA' });
  }
  return { senhaAtual: b.senhaAtual };
}

export interface TrocaSenhaDto {
  novaSenha: string;
}

export function parseTrocaSenha(body: unknown): TrocaSenhaDto {
  const b = corpoObjeto(body);
  exigirChaveUnica(b, 'novaSenha');
  if (typeof b.novaSenha !== 'string' || b.novaSenha.length === 0) {
    throw new BadRequestException({ erro: 'NOVA_SENHA_INVALIDA' });
  }
  return { novaSenha: b.novaSenha };
}
