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

  // Pipe (Story 2.1): em 2.1, SÓ o Admin da Organização lê/administra Pipes (criar/renomear/arquivar/
  // restaurar), no escopo da Org ativa. MEMBER/GUEST não têm acesso a Pipe — deny-by-default. Papéis
  // POR Pipe (Admin do Pipe / Membro do Pipe / Somente leitura) são da Story 2.2, e concederão acesso
  // granular a MEMBER/GUEST então; antecipá-los aqui seria escopo de outra Story (Constitution II).
  if (papel === 'ADMIN') {
    can('ler', 'Pipe', { orgId });
    can('administrar', 'Pipe', { orgId });
  }

  return build();
}
