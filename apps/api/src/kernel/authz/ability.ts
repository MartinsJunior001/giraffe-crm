import type { MongoAbility } from '@casl/ability';
import type { MembershipRole } from '../../../generated/prisma';

/**
 * Substrato de autorização (AD-9). CASL com `action + subject + conditions`, deny-by-default.
 *
 * **Regra de negócio não vive aqui.** Este arquivo declara apenas o *contrato* de tipos do mecanismo.
 * As matrizes de permissão por módulo (o que cada papel pode em Pipe/Card/Database) pertencem aos
 * Épicos de domínio — antecipá-las aqui seria escopo de Fase 2 sem consumidor (Constitution II).
 */

/** Papel efetivo do principal na Organização resolvida. É a Membership, não um claim de token (AD-9). */
export type PapelEfetivo = MembershipRole;

/**
 * Ações e sujeitos MÍNIMOS deste substrato — o suficiente para o mecanismo ser real e provável.
 *
 * `Organizacao` é uma entidade real (Story 1.2); `administrar` a própria Organização é a capacidade
 * foundational do Admin (RN-150/INV-ADMIN-01). Ler a própria Organização é o piso de qualquer
 * Membership ativa. Nenhum sujeito de domínio (Pipe/Card/...) é inventado aqui: eles chegam com regra
 * própria nos Épicos que os introduzirem.
 */
export type AcaoAutorizada = 'ler' | 'administrar';

/**
 * Nome do sujeito — o que o decorator `@Requer(...)` e a metadata carregam.
 *
 * `Pipe` (Story 2.1) é o primeiro sujeito de DOMÍNIO. Adicionar um sujeito é a forma esperada de um
 * Épico consumir este substrato (o próprio arquivo prevê "eles chegam com regra própria nos Épicos") —
 * NÃO é uma alteração do mecanismo (C3 permanece congelado), é extensão do catálogo.
 */
export type SujeitoAutorizado = 'Organizacao' | 'Pipe' | 'Database';

/**
 * Forma do sujeito `Organizacao` para as `conditions` (escopo por `id`). O CASL tipa as conditions e
 * o helper `subject()` a partir da FORMA do sujeito, não só do nome — daí o par `nome | forma` no
 * `AppAbility`, exatamente o padrão da documentação do CASL para subjects com atributos.
 */
export interface Organizacao {
  readonly id: string;
}

/**
 * Forma do sujeito `Pipe` para as `conditions`. O escopo é por `orgId` (o Pipe pertence à Organização),
 * simétrico ao isolamento da RLS — um principal recebe abilities de Pipe SÓ na Organização ativa.
 */
export interface Pipe {
  readonly orgId: string;
}

/**
 * Forma do sujeito `Database` para as `conditions` (Story 3.1). Escopo por `orgId`, simétrico à RLS —
 * como `Pipe`, mas sujeito DISTINTO (Database ≠ Pipe — RN-061). Em 3.1 só o ADMIN da Org recebe
 * abilities de Database (ler/administrar); MEMBER/GUEST nada (papéis por Database são a 3.2).
 */
export interface Database {
  readonly orgId: string;
}

/** A ação × (nome | forma) do sujeito, com `conditions` tipo-Mongo (`{ id }` para Org, `{ orgId }` para Pipe/Database). */
export type AppAbility = MongoAbility<
  [AcaoAutorizada, SujeitoAutorizado | Organizacao | Pipe | Database]
>;
