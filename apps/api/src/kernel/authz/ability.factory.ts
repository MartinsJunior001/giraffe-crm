import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import type { AppAbility, PapelEfetivo } from './ability';

/**
 * Traduz `(papel efetivo, orgId)` em abilities. **Papel da Organização é o teto** (AD-9).
 *
 * Duas garantias estruturais:
 * 1. **Deny-by-default** é do próprio CASL: ação/sujeito sem `can(...)` correspondente ⇒ negado.
 *    Este factory nunca escreve um `can('manage', 'all')` — esquecer uma permissão **nega**, não
 *    libera. É o oposto do modo de falha perigoso, e o teste prova a fase vermelha quebrando isto.
 * 2. **Escopo amarrado ao `orgId` resolvido**: toda `condition` fixa `{ id: orgId }`. Um principal
 *    com Membership em várias Organizações recebe abilities **só** da Organização ativa — sem
 *    herança cross-tenant (AC2), simétrico ao isolamento de dados da RLS (AD-6).
 *
 * O papel chega de uma Membership **ativa** (o `OrgContextResolver` já nega SUSPENDED/REMOVED antes de
 * qualquer contexto existir). Defesa em profundidade: uma Membership não-ativa jamais alcança este
 * factory, e se alcançasse por regressão, o papel isolado ainda não concederia nada fora do escopo.
 *
 * **Plataforma não entra aqui:** `PapelEfetivo` é `MembershipRole` (ADMIN/MEMBER/GUEST). Não existe
 * ramo onde um papel de Plataforma injete abilities de Organização (INV-ADMIN-01(c)).
 */
export function construirAbility(papel: PapelEfetivo, orgId: string): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  // Piso: qualquer Membership ativa lê a PRÓPRIA Organização (escopo fixado ao orgId resolvido).
  can('ler', 'Organizacao', { id: orgId });

  // Teto: só o Admin administra a PRÓPRIA Organização (RN-150/INV-ADMIN-01). MEMBER/GUEST não —
  // ausência de regra basta para negar (deny-by-default), sem `cannot` explícito.
  if (papel === 'ADMIN') {
    can('administrar', 'Organizacao', { id: orgId });
  }

  // Pipe (Story 2.2): qualquer Membership ativa pode o TIPO `ler Pipe` — a guarda GROSSA só confirma
  // que o papel pode ler *algum* Pipe na Org. QUAL Pipe cada não-Admin enxerga é a guarda FINA, decidida
  // no `PipesService` pela concessão `PipeGrant` ACTIVE da própria Membership, com não-enumeração (404
  // para Pipe não concedido). Isto NÃO é condition do guard (o guard não carrega o recurso — DBT-AUTHZ-01).
  //
  // `administrar Pipe` (ciclo de vida: criar/arquivar/restaurar e, por ora, renomear) segue SÓ do Admin
  // da Organização (AC3/SC-224). O poder de EDIÇÃO/CONFIG por papel de Pipe (Membro/Admin do Pipe) é o
  // próximo passo do incremento e será enforçado no serviço com a concessão carregada, não aqui.
  can('ler', 'Pipe', { orgId });
  if (papel === 'ADMIN') {
    can('administrar', 'Pipe', { orgId });
  }

  // Database (Story 3.2): entidade DISTINTA de Pipe (RN-061). Como `ler Pipe` (2.2), `ler Database` é
  // GROSSEIRA — qualquer Membership ativa pode o TIPO `ler Database`. Isto apenas confirma que o papel
  // pode ler *algum* Database na Org; QUAL Database cada não-Admin enxerga é a guarda FINA, decidida no
  // `DatabasesService`/`DatabaseGrantsService` pela concessão `DatabaseGrant` ACTIVE, com não-enumeração
  // (404 para Database não concedido). Isto NÃO é condition do guard (o guard não carrega o recurso —
  // DBT-AUTHZ-01). Em 3.1 `ler Database` era Admin-only (não havia concessão); a 3.2 a abre.
  //
  // `administrar Database` (ciclo de vida: criar/renomear/arquivar/restaurar — Story 3.1; e conceder
  // `Admin do Database` — Story 3.2) segue SÓ do Admin da Organização. O poder do Admin do Database
  // (config: conceder MEMBER/VIEWER, schema em 3.3) é enforçado no serviço com a concessão carregada,
  // não aqui — por isso ele passa só pela `ler Database` grosseira + a guarda fina, e NÃO alcança o
  // ciclo de vida (que exige `administrar`).
  can('ler', 'Database', { orgId });
  if (papel === 'ADMIN') {
    can('administrar', 'Database', { orgId });
  }

  return build();
}
