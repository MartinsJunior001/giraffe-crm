/**
 * Núcleo PURO do **teto de PipeGrant do CONVIDADO** (fecha o débito DEB-PIPEGRANT-GUEST-CEILING).
 *
 * Decisão de Produto autoritativa (APROVADA 22/07/2026,
 * `_bmad-output/implementation-artifacts/decisions/pipegrant-guest-ceiling.md`): um Account com
 * Membership de Organização no papel **CONVIDADO** (GUEST) **nunca** recebe `PipeGrant` administrativo
 * ou operacional pleno. O teto é **SOMENTE_LEITURA** (`VIEWER`), admitindo apenas os modificadores
 * **mais restritivos** já previstos (VISÃO_RESTRITA = `restritoAoProprio`). É o **espelho** do teto de
 * `DatabaseGrant` (AD-9 / Story 3.2) para o substrato de Pipe, fechado ANTES da Story 4.2.
 *
 * Sem framework, sem banco: recebe o papel de Organização do alvo e as capacidades da concessão como
 * DADO e devolve a DECISÃO. Ser puro é o que permite provar cada invariante em unidade — e manter a
 * regra fina fora do guard/`ability.ts` (C3 congelado, padrão DBT-AUTHZ-01).
 */

/** Papel da Membership na Organização (espelha `MembershipRole` do Prisma). */
export type PapelOrg = 'ADMIN' | 'MEMBER' | 'GUEST';
/** Papel por Pipe (espelha `PipeRole`). */
export type PapelPipe = 'ADMIN' | 'MEMBER' | 'VIEWER';
/** Poder efetivo por recurso (espelha `Poder` de `pipe-authz`). */
export type PoderEfetivo = 'gerenciar' | 'operar' | 'ler';

/**
 * Capacidades da concessão relevantes ao teto. `restritoAoProprio` **não** entra na checagem: é um
 * modificador RESTRITIVO (VISÃO_RESTRITA), expressamente permitido ao Convidado pela decisão, então
 * nunca constitui elevação. `reviewPublicSubmissions` é EXPANSIVA (aprovar submissão pública cria Card
 * — operação), logo é vedada ao Convidado ("elevação indireta equivalente" da decisão, item 4).
 */
export interface CapacidadesGrant {
  readonly role: PapelPipe;
  readonly reviewPublicSubmissions?: boolean;
}

/**
 * Verifica o teto do CONVIDADO ao **conceder/alterar** um `PipeGrant`. Devolve a mensagem de erro
 * SANITIZADA (sem ecoar valores do cliente) quando a concessão viola o teto, ou `null` quando é
 * permitida. Papéis de Org `ADMIN`/`MEMBER` **não** têm teto reduzido — a decisão é só do Convidado.
 *
 * Para GUEST:
 *  - `role` deve ser exatamente `VIEWER` (SOMENTE_LEITURA) — `ADMIN`/`MEMBER` → violação;
 *  - `reviewPublicSubmissions = true` → violação (capacidade operacional, não é nível restritivo);
 *  - `restritoAoProprio` (VISÃO_RESTRITA) é permitido em qualquer valor (modificador restritivo).
 */
export function violacaoTetoConvidado(papelOrg: PapelOrg, cap: CapacidadesGrant): string | null {
  if (papelOrg !== 'GUEST') return null;
  if (cap.role !== 'VIEWER') {
    return 'um Convidado só pode receber Somente leitura (VIEWER) em Pipe';
  }
  if (cap.reviewPublicSubmissions === true) {
    return 'um Convidado não pode revisar submissões públicas (capacidade operacional além do teto)';
  }
  return null;
}

/**
 * Teto do **poder efetivo** por papel de Organização (read-side, FAIL-CLOSED — decisão item 6). Um
 * Convidado nunca supera **leitura**, mesmo diante de um `PipeGrant` legado/inconsistente (ex.: GUEST
 * com `ADMIN`/`MEMBER` preexistente): a resolução de poder rebaixa ao teto do papel de Org, sem confiar
 * no grant incompatível. Papéis `ADMIN`/`MEMBER` de Org preservam o poder derivado do grant.
 */
export function tetoPoderPorPapelOrg(papelOrg: PapelOrg, poder: PoderEfetivo): PoderEfetivo {
  if (papelOrg === 'GUEST') return 'ler';
  return poder;
}

/**
 * O Convidado pode reter a capacidade "Revisar submissões públicas"? Nunca (é operacional). Read-side
 * fail-closed: um grant legado com `reviewPublicSubmissions = true` num GUEST **não** concede a
 * capacidade. Espelha `violacaoTetoConvidado` no eixo de leitura.
 */
export function convidadoPodeRevisarSubmissoes(papelOrg: PapelOrg): boolean {
  return papelOrg !== 'GUEST';
}

/**
 * Ao rebaixar uma Membership para **CONVIDADO**, quais `PipeGrant`s ativos são INCOMPATÍVEIS com o teto
 * (papel ≠ `VIEWER`)? Devolve os ids (vazio = pode prosseguir). A decisão (item 7) manda **RECUSAR** a
 * alteração enquanto existirem incompatíveis — o serviço traduz "lista não-vazia" em erro de domínio
 * sanitizado, exigindo redução/remoção prévia. **NÃO** rebaixa em silêncio (difere do auto-revogar de
 * `DatabaseGrant` da Story 8.4, por decisão de Produto distinta e explícita). Só se aplica a `GUEST`.
 */
export function pipeGrantsIncompativeisConvidado(
  novoPapel: PapelOrg,
  grantsPipeAtivos: readonly { readonly id: string; readonly role: PapelPipe }[],
): readonly string[] {
  if (novoPapel !== 'GUEST') return [];
  return grantsPipeAtivos.filter((g) => g.role !== 'VIEWER').map((g) => g.id);
}
