import { createHash } from 'node:crypto';
import type { ConfiguracaoValidada } from './automation-config';

/**
 * Núcleo PURO do SNAPSHOT de configuração da Automação (Story 4.2) — congelar a config vigente numa
 * `AutomationVersion` imutável. Espelho de `forms/snapshot.ts` (2.6): montar o documento e calcular uma
 * REVISÃO determinística (hash), independente da ordem de inserção das chaves.
 *
 * Sem I/O, sem Prisma, sem Nest — o mesmo desenho de `automation-config.ts`: o invariante é testável sem
 * banco, e o serviço só o aplica. Congelar uma configuração inteira é copiar um documento (D-4.1-A), não
 * replicar N linhas.
 */

/** O documento imutável gravado em `AutomationVersion.snapshot`. É a config VALIDADA, sem mais nada. */
export interface AutomationSnapshot {
  readonly schemaVersion: number;
  readonly quando: ConfiguracaoValidada['quando'];
  readonly condicoes: ConfiguracaoValidada['condicoes'];
  readonly entao: ConfiguracaoValidada['entao'];
}

/** Monta o snapshot a partir da config já validada pelo núcleo puro `validarConfiguracao`. */
export function montarSnapshotAutomacao(config: ConfiguracaoValidada): AutomationSnapshot {
  return {
    schemaVersion: config.schemaVersion,
    quando: config.quando,
    condicoes: config.condicoes,
    entao: config.entao,
  };
}

/**
 * Revisão determinística do snapshot (sha256 do JSON canônico). Identifica a versão e detecta divergência;
 * é estável frente à ordem das chaves. Idêntica em espírito a `forms/snapshot.ts#calcularRevisao`.
 */
export function calcularRevisaoAutomacao(snapshot: AutomationSnapshot): string {
  return createHash('sha256').update(canonicalizar(snapshot)).digest('hex');
}

/** JSON com chaves ordenadas recursivamente — torna o hash independente da ordem de inserção das chaves. */
function canonicalizar(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor) ?? 'null';
  if (Array.isArray(valor)) return `[${valor.map(canonicalizar).join(',')}]`;
  const obj = valor as Record<string, unknown>;
  const chaves = Object.keys(obj).sort();
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${canonicalizar(obj[k])}`).join(',')}}`;
}
