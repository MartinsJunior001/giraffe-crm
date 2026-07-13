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

/** Nome do sujeito — o que o decorator `@Requer(...)` e a metadata carregam. */
export type SujeitoAutorizado = 'Organizacao';

/**
 * Forma do sujeito `Organizacao` para as `conditions` (escopo por `id`). O CASL tipa as conditions e
 * o helper `subject()` a partir da FORMA do sujeito, não só do nome — daí o par `nome | forma` no
 * `AppAbility`, exatamente o padrão da documentação do CASL para subjects com atributos.
 */
export interface Organizacao {
  readonly id: string;
}

/** A ability do app: ação × (nome | forma) do sujeito, com `conditions` tipo-Mongo (`{ id: orgId }`). */
export type AppAbility = MongoAbility<[AcaoAutorizada, SujeitoAutorizado | Organizacao]>;
