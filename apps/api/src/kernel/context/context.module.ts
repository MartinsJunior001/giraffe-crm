import { Global, MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ContextoIndisponivelFilter } from './contexto-indisponivel.filter';
import { OrgContextResolver } from './org-context.resolver';
import { PRINCIPAL_PROVIDER, SemSessaoPrincipalProvider } from './principal.provider';
import { RequestContext } from './request-context';
import { RequestContextMiddleware } from './request-context.middleware';
import { TenantContextGuard } from './tenant-context.guard';

/**
 * Fronteira de contexto organizacional (AD-8).
 *
 * `@Global` porque o contexto é transversal por natureza — qualquer camada pode precisar saber em
 * qual Organização está. Regra de negócio continua **não** vivendo no kernel.
 *
 * O guard é registrado como `APP_GUARD`: ele vale para **todas** as rotas, e uma rota nova nasce
 * protegida. Sair da proteção exige o decorator `@SemContextoOrganizacional()` — um ato
 * deliberado, visível no diff.
 */
@Global()
@Module({
  providers: [
    RequestContext,
    OrgContextResolver,
    { provide: PRINCIPAL_PROVIDER, useClass: SemSessaoPrincipalProvider },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    // Sem este filtro, "um handler rodou sem contexto organizacional" — a falha estrutural mais
    // perigosa desta arquitetura — vira um 500 anônimo, indistinguível de um erro de banco.
    { provide: APP_FILTER, useClass: ContextoIndisponivelFilter },
  ],
  exports: [RequestContext, OrgContextResolver],
})
export class ContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // O escopo precisa envolver a requisição inteira, inclusive os guards. Daí `'*'` e não uma
    // lista de rotas: uma rota esquecida aqui seria uma rota cujo guard não teria onde escrever.
    consumer.apply(RequestContextMiddleware).forRoutes('{*splat}');
  }
}
