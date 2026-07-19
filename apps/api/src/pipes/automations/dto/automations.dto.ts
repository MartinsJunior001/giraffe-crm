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
}

export function parseCriarAutomacao(body: unknown): CriarAutomacaoDto {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException({ motivo: 'CORPO_INVALIDO' });
  }
  const b = body as Record<string, unknown>;

  // Allowlist de chaves do corpo: anti-mass-assignment. `state` e `orgId` recebidos aqui são REJEITADOS
  // explicitamente, em vez de silenciosamente descartados — quem tentou precisa saber que não funcionou.
  const permitidas = new Set(['name', 'quando', 'condicoes', 'entao']);
  for (const chave of Object.keys(b)) {
    if (!permitidas.has(chave)) {
      throw new BadRequestException({ motivo: 'CAMPO_NAO_PERMITIDO', campo: chave });
    }
  }

  if (typeof b.name !== 'string') {
    throw new BadRequestException({ motivo: 'NOME_INVALIDO' });
  }
  const name = b.name.trim();
  if (name.length === 0 || name.length > LIMITE_NOME) {
    throw new BadRequestException({ motivo: 'NOME_INVALIDO' });
  }

  return { name, quando: b.quando, condicoes: b.condicoes, entao: b.entao };
}
