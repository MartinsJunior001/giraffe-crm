import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  type LinhaEventoAuditoria,
  montarLogAuditoria,
  projetarEvento,
} from '../src/organizations/audit/audit-projection';

/**
 * Núcleo PURO da Auditoria (Story 8.8): projeção allowlist (AD-30) e log sanitizado (`AUDIT_LOG_VIEWED`).
 * Sem banco — prova o CONTRATO que blinda a fronteira: nenhuma chave inesperada do `payload` vaza, e o log
 * de acesso registra só metadados + contagem, JAMAIS o conteúdo listado.
 */

function linha(over: Partial<LinhaEventoAuditoria> = {}): LinhaEventoAuditoria {
  return {
    id: randomUUID(),
    eventId: randomUUID(),
    version: 1,
    type: 'ROLE_CHANGED',
    actorId: randomUUID(),
    membershipId: randomUUID(),
    occurredAt: new Date('2026-07-20T10:00:00.000Z'),
    correlationId: randomUUID(),
    fromRole: 'MEMBER',
    toRole: 'ADMIN',
    payload: {},
    ...over,
  };
}

describe('projetarEvento — projeção allowlist (AD-30)', () => {
  it('expõe SÓ as chaves contratadas; `id` (PK) e `orgId` ficam fora da visão', () => {
    const v = projetarEvento(linha());
    expect(Object.keys(v).sort()).toEqual([
      'alteracao',
      'ator',
      'auditEventId',
      'categoria',
      'correlationId',
      'ocorridoEm',
      'operacao',
      'recurso',
      'resultado',
      'schemaVersion',
    ]);
    // Não expõe o `id` da linha (cursor interno) nem `orgId`.
    expect(v).not.toHaveProperty('id');
    expect(v).not.toHaveProperty('orgId');
  });

  it('mapeia eventId→auditEventId, type→operacao, version→schemaVersion; resultado é sempre SUCESSO', () => {
    const l = linha({ type: 'SUSPENDED', version: 3 });
    const v = projetarEvento(l);
    expect(v.auditEventId).toBe(l.eventId);
    expect(v.operacao).toBe('SUSPENDED');
    expect(v.schemaVersion).toBe(3);
    expect(v.resultado).toBe('SUCESSO');
    expect(v.categoria).toBe('MEMBERSHIP');
    expect(v.recurso).toEqual({ tipo: 'Membership', id: l.membershipId });
    expect(v.ator).toEqual({ accountId: l.actorId });
  });

  it('do payload projeta SÓ fromState/toState; qualquer outra chave é descartada (fail-closed)', () => {
    const v = projetarEvento(
      linha({
        type: 'SUSPENDED',
        payload: {
          fromState: 'ACTIVE',
          toState: 'SUSPENDED',
          revokedCardGrants: ['g1', 'g2'],
          segredoQualquer: 'NAO_DEVE_VAZAR',
        },
      }),
    );
    expect(v.alteracao).toEqual({
      fromRole: 'MEMBER',
      toRole: 'ADMIN',
      fromState: 'ACTIVE',
      toState: 'SUSPENDED',
    });
    const texto = JSON.stringify(v);
    expect(texto).not.toContain('revokedCardGrants');
    expect(texto).not.toContain('NAO_DEVE_VAZAR');
    expect(texto).not.toContain('segredoQualquer');
  });

  it('payload malformado (não-objeto/null) não quebra a projeção', () => {
    expect(projetarEvento(linha({ payload: null })).alteracao).toEqual({
      fromRole: 'MEMBER',
      toRole: 'ADMIN',
    });
    expect(projetarEvento(linha({ payload: 'texto' })).alteracao).toEqual({
      fromRole: 'MEMBER',
      toRole: 'ADMIN',
    });
  });
});

describe('montarLogAuditoria — AUDIT_LOG_VIEWED sanitizado, sem copiar resultados', () => {
  it('registra ator/Org/filtros/paginação/contagem — e NADA do conteúdo listado', () => {
    const actorId = randomUUID();
    const orgId = randomUUID();
    const alvo = randomUUID();
    const log = montarLogAuditoria({
      actorId,
      orgId,
      filtros: {
        categoria: 'MEMBERSHIP',
        operacao: 'ROLE_CHANGED',
        resultado: 'SUCESSO',
        ator: null,
        tipoAlvo: 'Membership',
        alvo,
        de: null,
        ate: null,
      },
      paginacao: { cursor: null, limite: 50 },
      resultados: 7,
    });

    expect(log.event).toBe('audit');
    expect(log.action).toBe('AUDIT_LOG_VIEWED');
    expect(log.actor).toBe(actorId);
    expect(log.orgId).toBe(orgId);
    expect(log.resultados).toBe(7); // só a CONTAGEM (metadado), não as linhas
    expect(log.result).toBe('allowed');
    // Nunca copia o conteúdo: não há coleção de eventos nem valores/PII de resultado.
    expect(log).not.toHaveProperty('eventos');
    expect(log).not.toHaveProperty('linhas');
    expect(log).not.toHaveProperty('valores');
  });
});
