/**
 * Núcleo PURO dos marcos por Fase (Story 2.12). Sem I/O, sem Nest, sem Prisma — só as regras:
 *  - **validação** da config (`esperado ≤ vencimento ≤ expiração`, durações não-negativas, inteiras);
 *  - **snapshot** da config (a forma congelada na entrada — D-OA1=A);
 *  - **cálculo da base** dos marcos (instantes absolutos), aplicando a **precedência** valor-do-Card (override
 *    absoluto) › duração-relativa-da-Fase › ausência (marco não se aplica).
 *
 * A DERIVAÇÃO do veredito de saúde (ok/atrasado/vencido/expirado) NÃO é aqui — é 2.13. Aqui só se estabelece a
 * base (instante de entrada + duração/override). Testável isoladamente (fase vermelha por mutação).
 */

/** Configuração de marcos de uma Fase. Durações em MINUTOS relativos à entrada; `null` = marco não configurado. */
export interface ConfigMarcos {
  expectedDurationMin: number | null;
  dueDurationMin: number | null;
  expirationDurationMin: number | null;
  /** `Field.id` (DATE/DATETIME) cujo valor no Card sobrepõe a duração do prazo esperado (override absoluto). */
  expectedFieldId: string | null;
  dueFieldId: string | null;
  expirationFieldId: string | null;
}

/** Marcos calculados como instantes ABSOLUTOS (a base que 2.13 consome). `null` = marco não se aplica. */
export interface Marcos {
  esperado: Date | null;
  vencimento: Date | null;
  expiracao: Date | null;
}

/** Erro de configuração inválida (→ 400 no serviço). Mensagem sanitizada, sem vazar internos. */
export class ConfigMarcosInvalidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigMarcosInvalidaError';
  }
}

const MINUTO_MS = 60_000;

/** Uma duração válida é inteira e não-negativa (ou ausente). Rejeita fração, NaN, negativo, não-número. */
function duracaoValida(v: number | null): boolean {
  return v === null || (Number.isInteger(v) && v >= 0);
}

/**
 * Valida a config de marcos. Lança `ConfigMarcosInvalidaError` se: alguma duração é fracionária/negativa/não-inteira;
 * ou a cadeia `esperado ≤ vencimento ≤ expiração` é violada (comparando apenas os pares AMBOS presentes — um marco
 * ausente não impõe ordem). Mesma cadeia do CHECK da migration (defesa em profundidade).
 */
export function validarConfigMarcos(c: ConfigMarcos): void {
  if (!duracaoValida(c.expectedDurationMin))
    throw new ConfigMarcosInvalidaError('prazo esperado deve ser inteiro não-negativo (minutos)');
  if (!duracaoValida(c.dueDurationMin))
    throw new ConfigMarcosInvalidaError('vencimento deve ser inteiro não-negativo (minutos)');
  if (!duracaoValida(c.expirationDurationMin))
    throw new ConfigMarcosInvalidaError('expiração deve ser inteiro não-negativo (minutos)');

  const { expectedDurationMin: esp, dueDurationMin: ven, expirationDurationMin: exp } = c;
  if (esp !== null && ven !== null && esp > ven)
    throw new ConfigMarcosInvalidaError('prazo esperado não pode exceder o vencimento');
  if (ven !== null && exp !== null && ven > exp)
    throw new ConfigMarcosInvalidaError('vencimento não pode exceder a expiração');
  if (esp !== null && exp !== null && esp > exp)
    throw new ConfigMarcosInvalidaError('prazo esperado não pode exceder a expiração');
}

/** Forma canônica/congelada da config (o `configSnapshot` da entrada). Normaliza `undefined` → `null`. */
export function montarSnapshotConfig(c: Partial<ConfigMarcos> | null | undefined): ConfigMarcos {
  return {
    expectedDurationMin: c?.expectedDurationMin ?? null,
    dueDurationMin: c?.dueDurationMin ?? null,
    expirationDurationMin: c?.expirationDurationMin ?? null,
    expectedFieldId: c?.expectedFieldId ?? null,
    dueFieldId: c?.dueFieldId ?? null,
    expirationFieldId: c?.expirationFieldId ?? null,
  };
}

/** Lê um `configSnapshot` JSON (unknown) de volta para `ConfigMarcos`, fail-closed (campo malformado → null). */
export function lerSnapshotConfig(snapshot: unknown): ConfigMarcos {
  const s =
    typeof snapshot === 'object' && snapshot !== null ? (snapshot as Record<string, unknown>) : {};
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  return {
    expectedDurationMin: num(s.expectedDurationMin),
    dueDurationMin: num(s.dueDurationMin),
    expirationDurationMin: num(s.expirationDurationMin),
    expectedFieldId: str(s.expectedFieldId),
    dueFieldId: str(s.dueFieldId),
    expirationFieldId: str(s.expirationFieldId),
  };
}

/**
 * Interpreta um valor do Card como instante ABSOLUTO (override). Aceita string (DATE `YYYY-MM-DD` ou DATETIME ISO).
 * Fail-closed: valor ausente/vazio/malformado → `null` (o chamador cai para a duração). Nunca lança.
 */
function parseInstanteAbsoluto(raw: unknown): Date | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Resolve UM marco aplicando a precedência (epics §949): se a config designa um Campo de override e o Card tem
 * valor VÁLIDO nele → esse instante absoluto prevalece; senão, se há duração → `entrada + duração`; senão → `null`
 * (marco não se aplica). Valor ausente do Campo é IGNORADO (cai para a duração) — não zera o marco.
 */
function resolverMarco(
  enteredAt: Date,
  durationMin: number | null,
  fieldId: string | null,
  valores: Record<string, unknown>,
): Date | null {
  if (fieldId !== null) {
    const override = parseInstanteAbsoluto(valores[fieldId]);
    if (override !== null) return override;
    // ausência/malformado → ignora o override e cai para a duração (fail-closed)
  }
  if (durationMin !== null) return new Date(enteredAt.getTime() + durationMin * MINUTO_MS);
  return null;
}

/**
 * Calcula a base dos três marcos a partir do instante de entrada, do snapshot congelado e dos `valores` do Card
 * (chaveados por `Field.id` — AD-12, nunca rótulo). Função pura: é o cálculo SOB DEMANDA na leitura (decisão de
 * Arquitetura — sem agendador). 2.13 deriva o veredito de saúde comparando estes instantes com "agora".
 */
export function calcularMarcos(
  enteredAt: Date,
  snapshot: ConfigMarcos,
  valores: Record<string, unknown>,
): Marcos {
  return {
    esperado: resolverMarco(
      enteredAt,
      snapshot.expectedDurationMin,
      snapshot.expectedFieldId,
      valores,
    ),
    vencimento: resolverMarco(enteredAt, snapshot.dueDurationMin, snapshot.dueFieldId, valores),
    expiracao: resolverMarco(
      enteredAt,
      snapshot.expirationDurationMin,
      snapshot.expirationFieldId,
      valores,
    ),
  };
}
