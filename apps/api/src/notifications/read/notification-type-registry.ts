/**
 * Núcleo PURO dos METADADOS de preferência por tipo de Notificação (Story 5.4, R6) — SEM banco e SEM Nest.
 *
 * O CATÁLOGO CANÔNICO e completo de tipos foi fechado na Story 5.6 (`notification-catalog.ts`); o `type` é
 * `String` estrutural desde a 5.3. A 5.4 precisa apenas, por tipo, de três metadados para as preferências:
 * **valor padrão** (entregue por omissão?), **se pode ser desativado** e **se é obrigatório** (aviso que a
 * preferência nunca silencia). Este módulo **deriva** esses metadados do catálogo — fonte ÚNICA — e mantém um
 * **fallback seguro** para tipos ainda não catalogados. Fecha **DEB-5.4-TIPO-OBRIGATORIO**: a obrigatoriedade/
 * padrão deixaram de ser um registro vazio e passaram a ser declaradas por tipo no catálogo canônico.
 *
 * **Nenhum tipo é declarado obrigatório** (§1586: um tipo só é obrigatório por decisão explícita de Produto,
 * que ainda não existe). O conjunto obrigatório nasce VAZIO no catálogo — o mecanismo é implementado e
 * testável, mas não se inventa obrigatoriedade (Constitution). Espelha o "preflight vacuamente verdadeiro" 2.10.
 */

import {
  CATALOGO_NOTIFICACOES,
  formatoTipoValido,
  obterTipoNotificacao,
} from '../notification-catalog';

/** Formato estrutural de um TIPO de Notificação (enum estrutural — nunca texto livre). Espelha a 5.3. */
const TIPO_RE = /^[A-Z][A-Z0-9_]*$/;

/** Metadados de preferência de um tipo (§1586). */
export interface MetadadosTipo {
  /** Entregue/exibido por omissão quando o usuário não tem override? */
  padraoHabilitado: boolean;
  /** O usuário pode silenciar este tipo? (`false` ⇒ tentativa de desativar → 400). */
  podeDesativar: boolean;
  /** Aviso OBRIGATÓRIO — a preferência NUNCA o silencia (sempre habilitado, mesmo com override `false`). */
  obrigatorio: boolean;
}

/** Fallback seguro para tipo não catalogado: habilitado, desativável, não-obrigatório. */
const FALLBACK: MetadadosTipo = Object.freeze({
  padraoHabilitado: true,
  podeDesativar: true,
  obrigatorio: false,
});

/** Metadados de um tipo — do catálogo canônico (5.6) ou do fallback seguro. Fonte única da política por tipo. */
export function metadadosDoTipo(type: string): MetadadosTipo {
  const meta = formatoTipoValido(type) ? obterTipoNotificacao(type) : undefined;
  if (!meta) return FALLBACK;
  return {
    padraoHabilitado: meta.padraoHabilitado,
    podeDesativar: meta.podeDesativar,
    obrigatorio: meta.obrigatorio,
  };
}

/**
 * Preferência EFETIVA de um tipo para um usuário. Precedência (§1586): tipo **obrigatório** → sempre `true`
 * (a preferência não silencia aviso obrigatório); senão o **override** do usuário se existir; senão o
 * **padrão** do registro. Fonte única da derivação (consumida por superfícies e contagem).
 */
export function resolverPreferenciaEfetiva(type: string, override?: boolean): boolean {
  const meta = metadadosDoTipo(type);
  if (meta.obrigatorio) return true;
  if (override !== undefined) return override;
  return meta.padraoHabilitado;
}

/**
 * Valida um pedido de SET de preferência (fail-closed). `type` fora do formato estrutural → erro; silenciar
 * (`enabled=false`) um tipo **obrigatório** ou **não-desativável** → erro. Devolve `null` quando válido, ou uma
 * mensagem sanitizada de erro (o serviço a converte em `BadRequestException`).
 */
export function validarSetPreferencia(type: string, enabled: boolean): string | null {
  if (typeof type !== 'string' || !TIPO_RE.test(type)) return 'tipo de Notificação inválido';
  if (typeof enabled !== 'boolean') return 'enabled deve ser booleano';
  if (enabled) return null; // habilitar é sempre permitido
  const meta = metadadosDoTipo(type);
  if (meta.obrigatorio) return 'este tipo é obrigatório e não pode ser silenciado';
  if (!meta.podeDesativar) return 'este tipo não pode ser silenciado';
  return null;
}

/**
 * Conjunto de tipos SILENCIADOS de um usuário, derivado do catálogo + overrides — consumido como filtro
 * `type NOT IN (...)` nas superfícies/contagem. Um tipo entra se sua preferência efetiva é `false`. Tipos
 * **obrigatórios** NUNCA entram (a preferência não os silencia). Só considera os tipos com override explícito
 * e os tipos do catálogo com `padraoHabilitado=false` — tipos que caem no fallback (habilitado por padrão) e
 * sem override não são silenciados, então não precisam ser enumerados.
 */
export function tiposSilenciadosPara(overrides: ReadonlyMap<string, boolean>): string[] {
  const silenciados = new Set<string>();
  // Overrides explícitos do usuário.
  for (const [type, enabled] of overrides) {
    if (!resolverPreferenciaEfetiva(type, enabled)) silenciados.add(type);
  }
  // Tipos do catálogo silenciados por padrão (sem override que os reabilite).
  for (const meta of CATALOGO_NOTIFICACOES) {
    if (overrides.has(meta.tipo)) continue;
    if (!resolverPreferenciaEfetiva(meta.tipo)) silenciados.add(meta.tipo);
  }
  return [...silenciados];
}
