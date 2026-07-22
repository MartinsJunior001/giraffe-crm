import type { SaudeTemporal } from '../../cards/health/card-health.core';
import type { Marcos } from '../../phases/milestones/phase-milestones.core';

/**
 * Contrato do SNAPSHOT pós-Evento (Story 4.4 — FR-23, D4.2). É a fotografia CONGELADA do estado do recurso
 * NO INSTANTE do Evento gatilho (4.3), contra a qual as Condições são avaliadas de forma **determinística**.
 *
 * **Por que um snapshot, e não uma releitura:** a avaliação pode acontecer tardiamente na fila (4.6). Se ela
 * relesse o estado "agora", uma Automação decidiria com base num mundo diferente daquele que a disparou —
 * "execução tardia na fila não altera retroativamente o resultado das Condições" (Story §1358). Congelar o
 * estado no Evento torna o resultado uma função pura do snapshot: mesmo snapshot ⇒ mesmo veredito.
 *
 * **Quem MONTA o snapshot é o motor (4.6), não a 4.4.** Este módulo entrega só o TIPO (o contrato) e o
 * avaliador puro (`condition-eval.core.ts`) que o consome. O motor lê o estado do Card/Registro/Fase/vínculo
 * **sob `withTenantContext`** (RLS) e preenche este objeto — nenhuma leitura cross-tenant chega aqui: uma
 * referência a recurso de outra Organização simplesmente NÃO existe no snapshot (a policy responde "não
 * existe"), e o avaliador, ao não encontrá-la, devolve **falso** (fail-closed). O avaliador nunca toca banco.
 *
 * **`orgId`** viaja no snapshot apenas como carimbo de origem (defesa em profundidade / auditoria do motor);
 * o avaliador **não** o usa para autorizar nada — a autorização e o isolamento já aconteceram na montagem.
 */

/** Definição mínima de um Campo ATIVO que o avaliador precisa para escolher a semântica de comparação. */
export interface CampoSnapshotDef {
  /** `FieldType` (catálogo do Form Builder 2.4). Decide a categoria de comparação (via `categoriaDeCampo`). */
  readonly type: string;
}

/** Estado congelado de um Card no instante do Evento. `null` no snapshot quando o Evento não é de Card. */
export interface CardSnapshot {
  /** Eixo de ciclo de vida (2.11). */
  readonly lifecycleState: 'ATIVO' | 'FINALIZADO' | 'ARQUIVADO';
  /** Eixo de saúde temporal (2.13) — DERIVADO pelo motor via `derivarSaude` no instante do Evento. */
  readonly saude: SaudeTemporal;
  /** Fase ATUAL do Card (2.14). */
  readonly phaseId: string;
  /** Marcos temporais como instantes absolutos (2.12) — base das Condições de prazo/marco. */
  readonly marcos: Marcos;
  /** `valores` pós-Evento, por `Field.id` (JSONB). Possível PII — nunca vai a log nem ao envelope (AD-30). */
  readonly valores: Readonly<Record<string, unknown>>;
  /**
   * `valores` ANTERIORES ao Evento, por `Field.id`, quando o Evento os carrega (ex.: `*_FIELD_VALUE_CHANGED`).
   * `null` quando o Evento não tem "antes" (ex.: `CARD_CREATED`) — operador de mudança fica fail-closed.
   */
  readonly valoresAnteriores: Readonly<Record<string, unknown>> | null;
  /** IDs dos Registros com vínculo ATIVO ao Card no instante do Evento (3.9). Vazio = sem vínculo. */
  readonly linkedRecordIds: readonly string[];
}

/** Estado congelado de um Registro no instante do Evento. `null` quando o Evento não é de Registro. */
export interface RecordSnapshot {
  /** Ciclo de vida do Registro (3.4) — 2 estados, sem `FINALIZADO`. */
  readonly lifecycleState: 'ATIVO' | 'ARQUIVADO';
  readonly valores: Readonly<Record<string, unknown>>;
  readonly valoresAnteriores: Readonly<Record<string, unknown>> | null;
}

/**
 * O snapshot inteiro contra o qual `avaliarCondicoes` decide. Montado pelo motor (4.6) sob RLS; consumido
 * puro. `card` e `record` são mutuamente coerentes com o tipo do Evento — um dos dois (ou ambos, num Evento
 * de vínculo) estará presente; o que faltar deixa suas Condições fail-closed em **falso**.
 */
export interface SnapshotAvaliacao {
  /** Carimbo de origem (defesa em profundidade). O avaliador não autoriza por ele — ver o cabeçalho. */
  readonly orgId: string;
  /**
   * Instante de referência da avaliação = `occurredAt` do Evento (instante absoluto UTC — "fuso oficial",
   * 2.12/DIV-1). É a ÚNICA fonte de "tempo" do avaliador: nada de `Date.now()` dentro da comparação, para
   * que o veredito seja determinístico e a fila não o mude retroativamente.
   */
  readonly avaliadoEm: Date;
  /** Definição dos Campos ATIVOS por `Field.id` — allowlist. Campo ausente ⇒ referência inválida ⇒ falso. */
  readonly camposPorId: Readonly<Record<string, CampoSnapshotDef>>;
  readonly card: CardSnapshot | null;
  readonly record: RecordSnapshot | null;
}
