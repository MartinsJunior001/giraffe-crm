import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { isConflitoDePublicacao } from '../src/pipes/forms/publication.service';

/**
 * Mapeamento determinístico erro→409 da publicação (Story 2.6). O backstop do BANCO (INSERT duplicado de
 * `(orgId, formId, version)` → P2002) é provado contra PostgreSQL real em `publication-rls.test.ts`; aqui
 * provamos, de forma determinística, o elo seguinte: o serviço reconhece P2002 (violação de número) E P2028
 * (timeout da transação sob contenção no mesmo Formulário) como CONFLITO → `ConflictException` (409). Sem esta
 * classificação, um conflito viraria 500 e o cliente não saberia que basta recarregar e repetir.
 */

function erroPrisma(code: string): { code: string } {
  return { code };
}

describe('isConflitoDePublicacao (SC-263) — classifica conflito de concorrência', () => {
  it('P2002 (número de versão duplicado) é conflito', () => {
    expect(isConflitoDePublicacao(erroPrisma('P2002'))).toBe(true);
  });

  it('P2028 (timeout da transação sob contenção) é conflito', () => {
    expect(isConflitoDePublicacao(erroPrisma('P2028'))).toBe(true);
  });

  it('outros erros NÃO são conflito (não viram 409 espúrio)', () => {
    expect(isConflitoDePublicacao(erroPrisma('P2025'))).toBe(false); // registro não encontrado
    expect(isConflitoDePublicacao(new Error('qualquer'))).toBe(false);
    expect(isConflitoDePublicacao(null)).toBe(false);
    expect(isConflitoDePublicacao(undefined)).toBe(false);
  });
});
