import { createHash } from 'node:crypto';

/**
 * Núcleo PURO da alteração de papel da Membership (Story 8.4). Sem framework, sem banco: recebe o estado
 * corrente como DADO e devolve a DECISÃO. Ser puro é o que permite provar em unidade — sem PostgreSQL —
 * cada invariante (step-up exigido, proteção do último Admin, teto AD-9, no-op) e manter o serviço livre
 * de regra dispersa. A decisão AUTORITATIVA do último Admin é reavaliada DENTRO da transação com
 * `SELECT … FOR UPDATE` (D-2); este núcleo é reusado lá e no pré-cheque, com a MESMA função.
 */

/** Papel da Membership na Organização (espelha `MembershipRole` do Prisma). */
export type MembershipRole = 'ADMIN' | 'MEMBER' | 'GUEST';
/** Estado do vínculo (espelha `MembershipState`). Só `ACTIVE` muda de papel. */
export type MembershipState = 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
/** Papel por Database (espelha `DatabaseRole`) — usado no teto AD-9 do Convidado. */
export type DatabaseRole = 'ADMIN' | 'MEMBER' | 'VIEWER';

export const PAPEIS_VALIDOS: readonly MembershipRole[] = ['ADMIN', 'MEMBER', 'GUEST'] as const;

export function ehPapelValido(v: unknown): v is MembershipRole {
  return typeof v === 'string' && (PAPEIS_VALIDOS as readonly string[]).includes(v);
}

/**
 * Uma alteração REDUZ a quantidade de Admins ativos? (rebaixar um Admin). É o gatilho da proteção do
 * último Admin (D-2). Promover para Admin AUMENTA; trocar entre não-Admins não mexe na contagem.
 */
export function reduzQuantidadeDeAdmin(de: MembershipRole, para: MembershipRole): boolean {
  return de === 'ADMIN' && para !== 'ADMIN';
}

/**
 * A alteração exige step-up recente? (D-1). Duas operações sensíveis:
 *  - **promover para Admin** (`para === ADMIN` e ainda não era) e
 *  - **rebaixar um Admin** (`de === ADMIN` e deixa de ser).
 * Trocas entre não-Admins (MEMBER↔GUEST) NÃO exigem step-up — o gate é escopado, não blanket.
 */
export function exigeStepUp(de: MembershipRole, para: MembershipRole): boolean {
  const promoveParaAdmin = para === 'ADMIN' && de !== 'ADMIN';
  const rebaixaAdmin = de === 'ADMIN' && para !== 'ADMIN';
  return promoveParaAdmin || rebaixaAdmin;
}

/** Estado corrente lido antes/durante a alteração — a ENTRADA da decisão. */
export interface EntradaDecisao {
  readonly papelAtual: MembershipRole;
  readonly novoPapel: MembershipRole;
  readonly estadoAlvo: MembershipState;
  /** Admins ATIVOS na Organização, INCLUINDO o alvo se ele for Admin. */
  readonly adminsAtivos: number;
  /** Há step-up recente válido para a sessão do ator? */
  readonly stepUpValido: boolean;
}

/**
 * A decisão. `APLICAR` autoriza a escrita; os demais são recusas tipadas que o serviço traduz em HTTP:
 *  - `INATIVA`   → 409 (só Membership ativa muda de papel);
 *  - `NOOP`      → 200 idempotente, SEM escrita/evento (não emite `updateMany` → sem falso `denied`);
 *  - `STEP_UP`   → 403 STEP_UP_REQUIRED;
 *  - `ULTIMO_ADMIN` → 409 LAST_ADMIN_PROTECTED.
 */
export type Decisao =
  | { tipo: 'APLICAR' }
  | { tipo: 'INATIVA' }
  | { tipo: 'NOOP' }
  | { tipo: 'STEP_UP' }
  | { tipo: 'ULTIMO_ADMIN' };

/**
 * Decide a alteração, FAIL-CLOSED e em ordem determinística:
 *  1. alvo não-ativo → `INATIVA` (não se altera papel de suspensa/encerrada);
 *  2. papel já é o desejado → `NOOP` (idempotência sem escrita);
 *  3. exige step-up e não há janela válida → `STEP_UP` (auth é pré-condição);
 *  4. rebaixa o ÚLTIMO Admin ativo (`adminsAtivos <= 1`) → `ULTIMO_ADMIN` (invariante INV-ADMIN-01);
 *  5. `APLICAR`.
 *
 * O passo 4 é reavaliado DENTRO da transação com a contagem relida sob `FOR UPDATE` — aqui e lá é esta
 * mesma função: contagem otimista isolada NÃO basta (D-2), mas a REGRA é única.
 */
export function planejarAlteracaoPapel(e: EntradaDecisao): Decisao {
  if (e.estadoAlvo !== 'ACTIVE') return { tipo: 'INATIVA' };
  if (e.novoPapel === e.papelAtual) return { tipo: 'NOOP' };
  if (exigeStepUp(e.papelAtual, e.novoPapel) && !e.stepUpValido) return { tipo: 'STEP_UP' };
  if (reduzQuantidadeDeAdmin(e.papelAtual, e.novoPapel) && e.adminsAtivos <= 1) {
    return { tipo: 'ULTIMO_ADMIN' };
  }
  return { tipo: 'APLICAR' };
}

/** Concessão de papel por Database, para o cálculo do teto AD-9 do Convidado. */
export interface GrantDatabaseAtivo {
  readonly id: string;
  readonly role: DatabaseRole;
}

/**
 * Concessões INCOMPATÍVEIS com o novo papel, a revogar ATOMICAMENTE (AC: "revoga atomicamente
 * concessões incompatíveis; não restaura em promoção futura").
 *
 * Na Fase 1 a ÚNICA incompatibilidade materializada é o **teto AD-9**: um Convidado só pode `VIEWER`
 * num Database (Story 3.2). Rebaixar para `GUEST` revoga as concessões `DatabaseGrant` ativas que
 * excedem o teto (papel ≠ VIEWER). PipeGrant/CardGrant NÃO têm teto por papel de Organização na Fase 1
 * (débito aberto `DEB-PIPEGRANT-GUEST-CEILING`) — não são tocados aqui, para NÃO inventar regra.
 *
 * Revogação (não rebaixamento): a concessão vira `REVOKED` e "não é restaurada em promoção futura" —
 * re-conceder é ato explícito do Admin, nunca ressurreição silenciosa.
 */
export function planejarRevogacaoIncompativel(
  novoPapel: MembershipRole,
  grantsDatabase: readonly GrantDatabaseAtivo[],
): readonly string[] {
  if (novoPapel !== 'GUEST') return [];
  return grantsDatabase.filter((g) => g.role !== 'VIEWER').map((g) => g.id);
}

/**
 * Namespace UUID (fixo) do evento canônico de Membership, para o uuidv5. Congelado por contrato —
 * trocá-lo mudaria TODOS os `eventId` derivados.
 */
export const NS_MEMBERSHIP_EVENT = '2b7c9d1e-3f4a-5b6c-8d9e-0a1b2c3d4e5f';

/**
 * `eventId` DETERMINÍSTICO da operação: uuidv5(NS, orgId + membershipId + correlationId). A mesma
 * operação (mesmo `correlationId`, gerado server-side) reproduz o mesmo id → o `@@unique([orgId,
 * eventId])` impede duplicata lógica (outbox idempotente — como `MovementEvent`).
 */
export function derivarEventId(orgId: string, membershipId: string, correlationId: string): string {
  return uuidV5(NS_MEMBERSHIP_EVENT, `${orgId}:${membershipId}:${correlationId}`);
}

/**
 * UUID v5 (RFC 4122) determinístico a partir de (namespace UUID, name), via SHA-1 do `node:crypto` —
 * sem dependência nova. Não é uso criptográfico; é identidade estável derivada (idempotência).
 */
export function uuidV5(namespace: string, name: string): string {
  const nsHex = namespace.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(nsHex)) throw new Error('UUID de namespace inválido');
  const nsBytes = Buffer.from(nsHex, 'hex');
  const hash = createHash('sha1')
    .update(Buffer.concat([nsBytes, Buffer.from(name, 'utf8')]))
    .digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // versão 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variante RFC 4122
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
