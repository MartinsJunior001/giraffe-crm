import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AbilityCache } from './ability.cache';
import { AuthzGuard } from './authz.guard';

/**
 * Fronteira de autorização (AD-9). `@Global` porque autorização é transversal — qualquer módulo pode
 * declarar `@Requer(...)`. **Regra de negócio não vive no kernel.**
 *
 * O `AuthzGuard` é `APP_GUARD`: vale para todas as rotas e, onde uma ação é exigida, nasce negando.
 * **Importado no `AppModule` DEPOIS do `ContextModule`**, para que rode após o `TenantContextGuard`:
 * a autorização de ação pressupõe o contexto de Organização já resolvido.
 *
 * `AbilityCache` é exportado para o Épico 8 consumir o contrato de invalidação (`invalidar`) ao mudar
 * papel/Membership — sem recriar o mecanismo de autorização.
 */
@Global()
@Module({
  providers: [AbilityCache, { provide: APP_GUARD, useClass: AuthzGuard }],
  exports: [AbilityCache],
})
export class AuthzModule {}
