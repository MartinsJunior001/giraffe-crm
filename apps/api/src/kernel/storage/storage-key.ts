import { randomUUID } from 'node:crypto';

/**
 * Chave OPACA do objeto no storage e a guarda de tenant por SEGMENTO (Story 3.7). Puro — sem SDK, sem I/O.
 *
 * A chave é `<orgId>/<uuidv4>`. Ela NUNCA é autorização (a autorização vem do recurso via `FileAuthzContract`);
 * o prefixo por Org é defesa em profundidade + organização do bucket, não controle de acesso. Conhecer a chave
 * não concede nada — os buckets são privados e a RLS/porta decidem.
 */

/** Monta uma chave opaca nova (FINAL) para um objeto da Organização `orgId`: `<orgId>/<uuidv4>`. */
export function montarChave(orgId: string): string {
  return `${orgId}/${randomUUID()}`;
}

/**
 * Deriva a chave de QUARENTENA a partir da chave final: `<orgId>/q/<uuid>`.
 *
 * O binário é aceito primeiro na quarentena e, só após o veredito CLEAN, **copiado** para a chave final com
 * `CopyObject` **if-match** (ADR §5) — o que prova que o objeto promovido é byte-a-byte o que foi verificado,
 * sem violar a imutabilidade de `bucketKey` (a coluna final nunca muda; a quarentena é um objeto físico à parte).
 * O `orgId` continua sendo o PRIMEIRO segmento, então a guarda de tenant por segmento vale igual para as duas.
 */
export function chaveQuarentena(bucketKey: string): string {
  const [orgId, uuid] = bucketKey.split('/');
  return `${orgId}/q/${uuid}`;
}

/**
 * A chave pertence à Organização `orgId`? Comparação por **SEGMENTO**, nunca por `startsWith`.
 *
 * `startsWith` seria um furo: `orgId = "abc"` casaria com a chave `"abcd/..."` de OUTRA Organização (`abcd`).
 * Dividindo por `/` e comparando o PRIMEIRO segmento por igualdade, `"abc"` só casa com `"abc/..."`. Este é o
 * teste que a US3 (cross-tenant) prova: `orgAlvo` não é prefixo de `orgAlvo-malicioso`.
 */
export function pertenceAoTenant(bucketKey: string, orgId: string): boolean {
  const primeiroSegmento = bucketKey.split('/')[0];
  return primeiroSegmento === orgId && orgId.length > 0;
}
