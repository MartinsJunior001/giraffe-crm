import { SetMetadata } from '@nestjs/common';
import type { AcaoAutorizada, SujeitoAutorizado } from './ability';

/** Chave de metadata do requisito de autorização de um handler/controller. */
export const REQUER_AUTORIZACAO = Symbol('REQUER_AUTORIZACAO');

export interface RequisitoAutorizacao {
  readonly acao: AcaoAutorizada;
  readonly sujeito: SujeitoAutorizado;
}

/**
 * Declara que uma rota exige `acao` sobre `sujeito`. O `AuthzGuard` nega (403) deny-by-default quando
 * a ability efetiva não a concede. Ausência do decorator = rota sem exigência de AÇÃO (o contexto de
 * Organização, imposto pelo guard global, já barrou quem não deveria estar).
 *
 * O tipo fechado de `acao`/`sujeito` é intencional: não se declara autorização para um sujeito que o
 * substrato ainda não conhece — os sujeitos de domínio chegam com o Épico que os introduz.
 */
export const Requer = (
  acao: AcaoAutorizada,
  sujeito: SujeitoAutorizado,
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUER_AUTORIZACAO, { acao, sujeito } satisfies RequisitoAutorizacao);
