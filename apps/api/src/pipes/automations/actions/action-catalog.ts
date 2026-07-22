import type { Acao } from '../automation-config';

/**
 * Catálogo canônico de tipos de AÇÃO interna (Story 4.5 — FR-21/23, RN-101, D4.1). Fonte ÚNICA e FIXA do
 * vocabulário de Ações da Fase 1 sobre os dois domínios de alvo determinístico — **Card** e **Registro**.
 * Puro, sem framework/banco — testável sem PostgreSQL, como `condition-catalog.ts` (4.4), `event-catalog.ts`
 * (4.3) e `automation-config.ts` (4.1).
 *
 * **Por que FECHADO (fail-closed):** uma Ação de tipo aberto deixaria o Admin configurar um "Então" que o motor
 * (4.6) nunca sabe executar — e uma Ação não-executável não é uma falha honesta em tempo de configuração, é uma
 * Automação que o usuário acredita ter montado e que silenciosamente não age. Rejeitar na configuração (400
 * `ACAO_FORA_DO_CATALOGO`) é honesto; aceitar e falhar depois, não. O enforcement vive no serviço de Automação
 * (como o dos catálogos de Evento 4.3 e Condição 4.4), NÃO no núcleo estrutural da 4.1 — a 4.1 valida FORMA
 * (`entao` é um array de objetos com `tipo`/`parametros`/`refs`), a 4.5 valida VOCABULÁRIO e ALVO DETERMINÍSTICO.
 *
 * **Alvo determinístico (RN-101, Story §1381):** cada Ação atua sobre um alvo INEQUÍVOCO — o Card de contexto do
 * Evento, um Registro resolvido por regra única, ou um recurso explicitamente configurado por referência. NUNCA
 * "buscar e atualizar" indiscriminadamente. Este catálogo garante, em tempo de CONFIGURAÇÃO, que o alvo é
 * determinístico (ex.: `RECORD_EDIT` no modo explícito exige EXATAMENTE uma referência de Registro; nos modos
 * derivados do Evento, ZERO). A RESOLUÇÃO do alvo concreto e a REVALIDAÇÃO sob o principal Automação são puras e
 * vivem em `action-revalidation.core.ts` — consumidas pelo motor (4.6, AD-11). Aqui só valida-se o CONTRATO.
 *
 * **Confirmação humana (Story §1383):** Ações sensíveis — mover, finalizar, arquivar e alterar valor de Campo —
 * carregam `exigeConfirmacaoHumana: true`. Não é falha técnica: o motor (4.6) usa esse dado para entrar em
 * `aguardando confirmação`, sem contornar a confirmação. A 4.5 REGISTRA o requisito no contrato; a máquina de
 * estados da confirmação é da 4.6.
 *
 * **NÃO reimplementa a mutação.** Mover Card é 2.14 (+preflight 2.15); atribuir Responsável é 2.10; alterar valor
 * de Campo é o Form Builder; ciclo de vida do Card é 2.11; criar/editar Registro é 3.4. A 4.5 DESCREVE a Ação e
 * revalida; a execução real (que reusa esses serviços de domínio) é da 4.6.
 */

/** Os dois domínios de alvo das Ações internas da Fase 1 (Story §1380). */
export type AcaoDominio = 'CARD' | 'RECORD';

/** Tipos de referência que uma Ação pode exigir — subconjunto de `TipoDeReferencia` da 4.1. */
type TipoRefAcao = 'PHASE' | 'FIELD' | 'DATABASE' | 'RECORD';

/** Modos de resolução do alvo determinístico de `RECORD_EDIT` (Story §1381). */
export const MODOS_ALVO_REGISTRO = ['EVENTO', 'VINCULO', 'EXPLICITO'] as const;
export type ModoAlvoRegistro = (typeof MODOS_ALVO_REGISTRO)[number];

/** Metadados (contrato) de um tipo de Ação do catálogo. */
export interface AcaoCatalogo {
  readonly tipo: string;
  readonly dominio: AcaoDominio;
  /**
   * A Ação é sensível e NÃO pode contornar confirmação humana (Story §1383)? Mover/finalizar/arquivar e alterar
   * valor de Campo protegido ⇒ `true`. O motor (4.6) consome este dado para entrar em `aguardando confirmação`.
   */
  readonly exigeConfirmacaoHumana: boolean;
  /**
   * Estados de ciclo de vida do ALVO em que a Ação é admissível (pré-checagem fail-closed da revalidação, 4.6).
   * `null` = sem gate de estado nesta camada (a autoridade final do estado é o serviço de domínio na execução —
   * defesa em profundidade). O invariante universal "recurso ARQUIVADO é somente-leitura" é codificado aqui.
   */
  readonly estadosAlvoValidos: ReadonlySet<string> | null;
  /** Valida refs + parâmetros desta Ação (fail-closed). Lança `AcaoForaDoCatalogoError` no 1º problema. */
  readonly validar: (a: Acao, onde: string) => void;
}

/** Erro de Ação fora do catálogo. O serviço o traduz em 400 sanitizado, sem eco do payload. */
export class AcaoForaDoCatalogoError extends Error {
  constructor(readonly motivo: string) {
    super(motivo);
    this.name = 'AcaoForaDoCatalogoError';
  }
}

// ── Helpers de validação (fail-closed) ────────────────────────────────────────────────────────────────

function contarRefs(a: Acao, tipo: TipoRefAcao): number {
  return a.refs.filter((r) => r.tipo === tipo).length;
}

/** Exige EXATAMENTE uma referência do tipo dado e NENHUMA de outro tipo — alvo/parâmetro inequívoco. */
function exigirRefUnica(a: Acao, tipo: TipoRefAcao, onde: string): void {
  if (contarRefs(a, tipo) !== 1 || a.refs.length !== 1) {
    throw new AcaoForaDoCatalogoError(`${onde}: exige exatamente uma referência do tipo esperado`);
  }
}

/** Exige NENHUMA referência (alvo é o Card/Registro de contexto do Evento, não uma referência configurada). */
function exigirSemRefs(a: Acao, onde: string): void {
  if (a.refs.length !== 0) {
    throw new AcaoForaDoCatalogoError(`${onde}: não aceita referências`);
  }
}

/** Rejeita qualquer chave de parâmetro fora da allowlist — anti-mass-assignment (como a 2.7). */
function exigirSomenteParametros(a: Acao, permitidas: ReadonlySet<string>, onde: string): void {
  for (const chave of Object.keys(a.parametros)) {
    if (!permitidas.has(chave)) {
      throw new AcaoForaDoCatalogoError(`${onde}.parametros: chave não permitida`);
    }
  }
}

/** Exige que os parâmetros sejam vazios (Ação sem configuração além do alvo de contexto). */
function exigirSemParametros(a: Acao, onde: string): void {
  if (Object.keys(a.parametros).length !== 0) {
    throw new AcaoForaDoCatalogoError(`${onde}.parametros: não aceita parâmetros`);
  }
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Exige um parâmetro UUID presente — referência estável e tenant-safe (como a 4.1 exige de `Referencia.id`). */
function exigirParametroUuid(a: Acao, chave: string, onde: string): void {
  const v = a.parametros[chave];
  if (typeof v !== 'string' || !RE_UUID.test(v)) {
    throw new AcaoForaDoCatalogoError(`${onde}.parametros.${chave}: deve ser um ID estável (UUID)`);
  }
}

/** Exige que a chave de parâmetro ESTEJA presente (o `valor` pode ser `null` para limpar o Campo). */
function exigirParametroPresente(a: Acao, chave: string, onde: string): void {
  if (!(chave in a.parametros)) {
    throw new AcaoForaDoCatalogoError(`${onde}.parametros.${chave}: obrigatório`);
  }
}

/** Se `valores` estiver presente, deve ser objeto simples (por `Field.id` — validado fino contra o snapshot em 4.6). */
function validarValoresOpcional(a: Acao, onde: string): void {
  if (!('valores' in a.parametros)) return;
  const v = a.parametros.valores;
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new AcaoForaDoCatalogoError(`${onde}.parametros.valores: esperado objeto`);
  }
}

/** Valida o seletor de alvo determinístico de `RECORD_EDIT` (Story §1381) contra os refs da Ação. */
function validarAlvoRegistro(a: Acao, onde: string): void {
  const alvo = a.parametros.alvo;
  if (typeof alvo !== 'object' || alvo === null || Array.isArray(alvo)) {
    throw new AcaoForaDoCatalogoError(`${onde}.parametros.alvo: esperado objeto`);
  }
  const registros = alvo as Record<string, unknown>;
  for (const chave of Object.keys(registros)) {
    if (chave !== 'modo') {
      throw new AcaoForaDoCatalogoError(`${onde}.parametros.alvo: chave não permitida`);
    }
  }
  const modo = registros.modo;
  if (typeof modo !== 'string' || !(MODOS_ALVO_REGISTRO as readonly string[]).includes(modo)) {
    throw new AcaoForaDoCatalogoError(`${onde}.parametros.alvo.modo: modo de alvo desconhecido`);
  }
  // Alvo determinístico: modo EXPLÍCITO exige exatamente 1 referência de Registro; os modos derivados do
  // Evento (o Registro que o originou, ou o único Registro vinculado ao Card) NÃO carregam referência — o
  // alvo é resolvido do contexto do Evento (fail-closed se ambíguo) em `resolverAlvoDeterministico` (4.6).
  if (modo === 'EXPLICITO') {
    exigirRefUnica(a, 'RECORD', onde);
  } else if (a.refs.length !== 0) {
    throw new AcaoForaDoCatalogoError(
      `${onde}: modo derivado do Evento não aceita referência de Registro`,
    );
  }
}

// ── Estados admissíveis do alvo (invariante "ARQUIVADO = somente-leitura") ────────────────────────────

/** Card não-arquivado (ATIVO ou FINALIZADO). Arquivar é a única mutação de Card válida sobre um arquivado. */
const CARD_NAO_ARQUIVADO: ReadonlySet<string> = new Set(['ATIVO', 'FINALIZADO']);
/** Registro ATIVO — editar sob Registro arquivado é bloqueado (3.4). */
const REGISTRO_ATIVO: ReadonlySet<string> = new Set(['ATIVO']);
/** Database ACTIVE — criar Registro sob Database arquivado é bloqueado (D1, 3.1). */
const DATABASE_ATIVO: ReadonlySet<string> = new Set(['ACTIVE']);

// ── O catálogo FIXO ───────────────────────────────────────────────────────────────────────────────────

/**
 * O catálogo completo da Fase 1 — 8 Ações cobrindo Card e Registro (Story §1380). Fechado: o que não está aqui
 * é rejeitado. As extensões (E5: Tarefa/Solicitação/Notificação; E6: E-mail/IA) ficam FORA desta Story (§1382).
 */
export const ACOES_CATALOGO = [
  // ── Card ──────────────────────────────────────────────────────────────────────────────────────────
  {
    // Mover Card (2.14 + preflight 2.15). Alvo = Card de contexto; destino = uma Fase (do Pipe proprietário,
    // conferido em `revalidarReferencias`). Sensível: não contorna confirmação humana (§1383).
    tipo: 'CARD_MOVE',
    dominio: 'CARD',
    exigeConfirmacaoHumana: true,
    estadosAlvoValidos: CARD_NAO_ARQUIVADO,
    validar: (a: Acao, onde: string) => {
      exigirRefUnica(a, 'PHASE', onde);
      exigirSemParametros(a, onde);
    },
  },
  {
    // Atribuir/alterar Responsável (2.10). Alvo = Card de contexto; Responsável = uma Membership determinística
    // (por `membershipId`). A existência/alcance da Membership e o "alvo já tem acesso operacional" (SC-2101) são
    // revalidados na EXECUÇÃO (4.6/2.10) sob RLS — o catálogo garante só o alvo inequívoco.
    tipo: 'CARD_ASSIGN_RESPONSIBLE',
    dominio: 'CARD',
    exigeConfirmacaoHumana: false,
    estadosAlvoValidos: CARD_NAO_ARQUIVADO,
    validar: (a: Acao, onde: string) => {
      exigirSemRefs(a, onde);
      exigirSomenteParametros(a, new Set(['membershipId']), onde);
      exigirParametroUuid(a, 'membershipId', onde);
    },
  },
  {
    // Alterar valor de Campo do Card (Form Builder). Alvo = Card de contexto; Campo = referência única; `valor`
    // presente (pode ser `null` para limpar). A validação FINA valor↔tipo-do-Campo é contra o snapshot em 4.6.
    // Sensível: altera dados protegidos (§1383).
    tipo: 'CARD_SET_FIELD_VALUE',
    dominio: 'CARD',
    exigeConfirmacaoHumana: true,
    estadosAlvoValidos: CARD_NAO_ARQUIVADO,
    validar: (a: Acao, onde: string) => {
      exigirRefUnica(a, 'FIELD', onde);
      exigirSomenteParametros(a, new Set(['valor']), onde);
      exigirParametroPresente(a, 'valor', onde);
    },
  },
  {
    // Finalizar Card (2.11). Alvo = Card de contexto. Sensível (§1383).
    tipo: 'CARD_FINALIZE',
    dominio: 'CARD',
    exigeConfirmacaoHumana: true,
    estadosAlvoValidos: CARD_NAO_ARQUIVADO,
    validar: (a: Acao, onde: string) => {
      exigirSemRefs(a, onde);
      exigirSemParametros(a, onde);
    },
  },
  {
    // Arquivar Card (2.11). Alvo = Card de contexto. Sensível (§1383). Sem gate de estado: arquivar é idempotente
    // (o serviço de domínio trata o já-arquivado); o alvo pode estar em qualquer estado.
    tipo: 'CARD_ARCHIVE',
    dominio: 'CARD',
    exigeConfirmacaoHumana: true,
    estadosAlvoValidos: null,
    validar: (a: Acao, onde: string) => {
      exigirSemRefs(a, onde);
      exigirSemParametros(a, onde);
    },
  },
  // ── Registro ──────────────────────────────────────────────────────────────────────────────────────
  {
    // Criar Registro (3.4). Alvo = novo Registro num Database configurado (referência única; tenant-safe via
    // `revalidarReferencias`). `valores` opcional — validados contra o snapshot da FormVersion publicada em 4.6.
    tipo: 'RECORD_CREATE',
    dominio: 'RECORD',
    exigeConfirmacaoHumana: false,
    estadosAlvoValidos: DATABASE_ATIVO,
    validar: (a: Acao, onde: string) => {
      exigirRefUnica(a, 'DATABASE', onde);
      exigirSomenteParametros(a, new Set(['valores']), onde);
      validarValoresOpcional(a, onde);
    },
  },
  {
    // Criar Registro RELACIONADO ao Card de contexto (3.4 + vínculo 3.9). Cria ≤1 Registro no Database
    // configurado e o vínculo ao Card de contexto, de forma idempotente (§1387 — a idempotência é da execução
    // 4.6). Exige um Card de contexto no Evento (fail-closed na resolução do alvo se ausente).
    tipo: 'RECORD_CREATE_RELATED',
    dominio: 'RECORD',
    exigeConfirmacaoHumana: false,
    estadosAlvoValidos: DATABASE_ATIVO,
    validar: (a: Acao, onde: string) => {
      exigirRefUnica(a, 'DATABASE', onde);
      exigirSomenteParametros(a, new Set(['valores']), onde);
      validarValoresOpcional(a, onde);
    },
  },
  {
    // Editar Registro (3.4) com ALVO DETERMINÍSTICO (§1381): o Registro que originou o Evento (`EVENTO`), o
    // único Registro vinculado ao Card de contexto (`VINCULO` — ambíguo ⇒ fail-closed na resolução), ou um
    // Registro explicitamente configurado (`EXPLICITO`, referência única). Sensível: altera dados (§1383).
    tipo: 'RECORD_EDIT',
    dominio: 'RECORD',
    exigeConfirmacaoHumana: true,
    estadosAlvoValidos: REGISTRO_ATIVO,
    validar: (a: Acao, onde: string) => {
      exigirSomenteParametros(a, new Set(['alvo', 'valores']), onde);
      exigirParametroPresente(a, 'alvo', onde);
      validarAlvoRegistro(a, onde);
      validarValoresOpcional(a, onde);
    },
  },
] as const satisfies readonly AcaoCatalogo[];

/** Índice por tipo para lookup O(1). */
const POR_TIPO: ReadonlyMap<string, AcaoCatalogo> = new Map(
  ACOES_CATALOGO.map((a): [string, AcaoCatalogo] => [a.tipo, a]),
);

/** Conjunto dos tipos de Ação válidos na Fase 1. */
export const TIPOS_ACAO: ReadonlySet<string> = new Set(ACOES_CATALOGO.map((a) => a.tipo));

export type AcaoTipo = (typeof ACOES_CATALOGO)[number]['tipo'];

/** Metadados de um tipo de Ação, ou `undefined` se desconhecido. */
export function obterAcaoCatalogo(tipo: string): AcaoCatalogo | undefined {
  return POR_TIPO.get(tipo);
}

/** A Ação exige confirmação humana (Story §1383)? `false` para tipo desconhecido (fail-closed é da revalidação). */
export function exigeConfirmacaoHumana(tipo: string): boolean {
  return POR_TIPO.get(tipo)?.exigeConfirmacaoHumana ?? false;
}

/**
 * Valida UMA Ação contra o catálogo (fail-closed): `tipo` conhecido; refs e parâmetros conforme o contrato do
 * tipo; alvo determinístico. NÃO valida a compatibilidade fina valor↔tipo-de-Campo nem que a referência é
 * ALCANÇÁVEL (isso é `revalidarReferencias`, sob RLS) nem a existência/estado do alvo (isso é `revalidarAcao`,
 * contra o snapshot montado pelo motor 4.6). Lança `AcaoForaDoCatalogoError` no 1º problema.
 */
function validarAcao(a: Acao, onde: string): void {
  const meta = POR_TIPO.get(a.tipo);
  if (!meta) throw new AcaoForaDoCatalogoError(`${onde}: tipo de Ação desconhecido`);
  meta.validar(a, onde);
}

/**
 * Enforcement fail-closed do catálogo de Ações — chamado pelo serviço de Automação DEPOIS da validação estrutural
 * da 4.1 e dos catálogos de Evento (4.3) e Condição (4.4). O `entao` NÃO pode ser vazio (a 4.1 já exige ≥1 Ação);
 * cada Ação é validada contra o catálogo. É o CA de configuração da 4.5.
 */
export function exigirAcoesNoCatalogo(acoes: readonly Acao[]): void {
  acoes.forEach((a, i) => validarAcao(a, `entao[${i}]`));
}
