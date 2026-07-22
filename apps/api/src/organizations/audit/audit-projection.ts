/**
 * Núcleo PURO da projeção da Auditoria administrativa (Story 8.8) — sem I/O, sem Nest.
 *
 * A Auditoria é um **read-side** que PROJETA sobre o evento canônico já materializado `MembershipEvent`
 * (8.4/8.5/8.6). Não há substrato de eventos novo (AD-11: sem abstração especulativa — o único produtor
 * de eventos administrativos com tabela própria hoje é o ciclo de Membership). Este módulo concentra
 * DUAS coisas puras e testáveis:
 *
 *   1. `projetarEvento` — a **projeção allowlist (AD-30)**: mapeia a linha do `MembershipEvent` para a
 *      visão que sai pela API, expondo SÓ referências mínimas pseudonimizáveis + metadados. `orgId` e
 *      qualquer chave interna ficam FORA da fronteira; nada de senha/token/sessão/e-mail/corpo HTTP
 *      (não existem na tabela — a allowlist blinda por construção o que um produtor futuro colocar no
 *      `payload`). Fail-closed: só as chaves conhecidas do `payload` são projetadas.
 *   2. `montarLogAuditoria` — o payload SANITIZADO do log `AUDIT_LOG_VIEWED`: registra QUE alguém
 *      consultou (ator, Org, filtros, paginação, contagem), **nunca o conteúdo listado** (nenhuma linha
 *      de evento, nenhum `actorId`/`membershipId` de resultado). Ver a decisão D-4 no `plan.md`.
 */

import type { MembershipEventType, MembershipRole } from '../../../generated/prisma';

/** Categoria da Auditoria. Só `MEMBERSHIP` é materializada hoje (produtores 8.4/8.5/8.6). */
export type CategoriaAuditoria = 'MEMBERSHIP';

/** Resultado da operação auditada. Eventos PERSISTIDOS só existem em SUCESSO (escritos na mesma tx da
 * mutação bem-sucedida). `BLOQUEADA`/`FALHA` são contrato do write-side fail-closed — gate futuro. */
export type ResultadoAuditoria = 'SUCESSO' | 'BLOQUEADA' | 'FALHA';

/** Tipo do recurso alvo. Só `Membership` é alvo hoje. */
export type TipoAlvoAuditoria = 'Membership';

/**
 * Projeção allowlist que SAI pela API. SÓ estes campos — `orgId` e chaves internas nunca cruzam a
 * fronteira. `auditEventId` é o id LÓGICO estável (determinístico por operação), pseudonimizável.
 */
export interface AuditoriaEventoVisao {
  /** Identidade lógica estável do evento (`MembershipEvent.eventId`, uuidv5 determinístico). */
  auditEventId: string;
  /** Versão do contrato do envelope (`MembershipEvent.version`). */
  schemaVersion: number;
  categoria: CategoriaAuditoria;
  /** Operação auditada (`ROLE_CHANGED`/`SUSPENDED`/`REACTIVATED`/`REMOVED` — taxonomia real do schema). */
  operacao: MembershipEventType;
  resultado: ResultadoAuditoria;
  ocorridoEm: Date;
  /** Correlação da operação (linka evento ↔ mutação ↔ revogações). */
  correlationId: string;
  /** Referência MÍNIMA e pseudonimizável do ator (a Account que executou). Nunca nome/e-mail. */
  ator: { accountId: string | null };
  /** Referência MÍNIMA do recurso alvo. `tipo` + `id`; nunca o conteúdo do recurso. */
  recurso: { tipo: TipoAlvoAuditoria; id: string };
  /** Antes/depois MINIMIZADOS: papéis e estados (não são PII). Chaves de `payload` fora da allowlist são
   * descartadas por construção (fail-closed). */
  alteracao: {
    fromRole: MembershipRole;
    toRole: MembershipRole;
    fromState?: string;
    toState?: string;
  };
}

/**
 * Projeção allowlist do Prisma `select`: SÓ estas colunas do `MembershipEvent` são LIDAS. `orgId` fica de
 * fora (a leitura já é escopada pela RLS; o valor não precisa cruzar a camada). `id` (PK da linha) é lido
 * apenas para o **cursor** de paginação — não é exposto por-linha.
 */
export const SELECT_EVENTO_AUDITORIA = {
  id: true,
  eventId: true,
  version: true,
  type: true,
  actorId: true,
  membershipId: true,
  occurredAt: true,
  correlationId: true,
  fromRole: true,
  toRole: true,
  payload: true,
} as const;

/** A forma da linha lida (o subconjunto do `MembershipEvent` que a projeção consome). */
export interface LinhaEventoAuditoria {
  id: string;
  eventId: string;
  version: number;
  type: MembershipEventType;
  actorId: string | null;
  membershipId: string;
  occurredAt: Date;
  correlationId: string;
  fromRole: MembershipRole;
  toRole: MembershipRole;
  payload: unknown;
}

/** Chaves do `payload` que a projeção admite (fail-closed: o resto é descartado). Estados são metadados,
 * não PII. Concessões revogadas / atribuições removidas são detalhe OPERACIONAL (vivem no CardHistory) e
 * NÃO entram na projeção de Auditoria — minimização (D-4). */
function extrairEstados(payload: unknown): { fromState?: string; toState?: string } {
  if (typeof payload !== 'object' || payload === null) return {};
  const p = payload as Record<string, unknown>;
  const out: { fromState?: string; toState?: string } = {};
  if (typeof p.fromState === 'string') out.fromState = p.fromState;
  if (typeof p.toState === 'string') out.toState = p.toState;
  return out;
}

/**
 * Mapeia UMA linha do `MembershipEvent` para a visão de Auditoria. Puro e total: nunca lança, nunca lê
 * mais do que a allowlist. `resultado` é sempre `SUCESSO` — o evento só é escrito no sucesso da mutação
 * (write-side 8.4/8.5/8.6, na mesma transação).
 */
export function projetarEvento(linha: LinhaEventoAuditoria): AuditoriaEventoVisao {
  return {
    auditEventId: linha.eventId,
    schemaVersion: linha.version,
    categoria: 'MEMBERSHIP',
    operacao: linha.type,
    resultado: 'SUCESSO',
    ocorridoEm: linha.occurredAt,
    correlationId: linha.correlationId,
    ator: { accountId: linha.actorId },
    recurso: { tipo: 'Membership', id: linha.membershipId },
    alteracao: {
      fromRole: linha.fromRole,
      toRole: linha.toRole,
      ...extrairEstados(linha.payload),
    },
  };
}

/** Os filtros SANITIZADOS que descrevem a consulta (metadados; não são conteúdo). */
export interface FiltrosAuditoriaLog {
  categoria: CategoriaAuditoria | null;
  operacao: MembershipEventType | null;
  resultado: ResultadoAuditoria | null;
  ator: string | null;
  tipoAlvo: TipoAlvoAuditoria | null;
  alvo: string | null;
  de: string | null;
  ate: string | null;
}

/**
 * Monta o payload SANITIZADO do log `AUDIT_LOG_VIEWED` (acesso à Auditoria é auditado). Registra QUE o
 * ator consultou, COM quais filtros/paginação e QUANTOS resultados — **jamais o conteúdo** (nenhuma linha
 * de evento é copiada). `resultados` é só a CONTAGEM da página (metadado). Nada aqui pode conter PII de
 * terceiros ou o corpo dos eventos listados.
 */
export function montarLogAuditoria(entrada: {
  actorId: string;
  orgId: string;
  filtros: FiltrosAuditoriaLog;
  paginacao: { cursor: string | null; limite: number };
  resultados: number;
}): Record<string, unknown> {
  return {
    event: 'audit',
    action: 'AUDIT_LOG_VIEWED',
    actor: entrada.actorId,
    orgId: entrada.orgId,
    filtros: entrada.filtros,
    paginacao: entrada.paginacao,
    resultados: entrada.resultados,
    result: 'allowed',
    at: new Date().toISOString(),
  };
}
