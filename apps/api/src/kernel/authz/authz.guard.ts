import { subject } from '@casl/ability';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { RequestContext } from '../context/request-context';
import { AbilityCache } from './ability.cache';
import { REQUER_AUTORIZACAO, type RequisitoAutorizacao } from './requer.decorator';

/**
 * Guard GLOBAL de autorização de AÇÃO. Roda **depois** do `TenantContextGuard` (que resolve
 * identidade + Organização e preenche o `RequestContext`). Deny-by-default: onde uma ação é exigida
 * e a ability não a concede, responde **403**.
 *
 * Ele **assume** contexto de Organização resolvido — nunca o dispensa nem o resolve de novo. Quem não
 * deveria estar na Organização já foi barrado antes; aqui decide-se apenas se o papel efetivo pode
 * **a ação** sobre **o sujeito** declarados no handler.
 */
@Injectable()
export class AuthzGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContext,
    private readonly abilities: AbilityCache,
    private readonly logger: PinoLogger,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requisito = this.reflector.getAllAndOverride<RequisitoAutorizacao | undefined>(
      REQUER_AUTORIZACAO,
      [context.getHandler(), context.getClass()],
    );

    // Sem @Requer: nada a autorizar NESTA camada. Rotas de infra (health/auth) e rotas que só
    // dependem do contexto de Org caem aqui e seguem — sem tocar o contexto (que pode nem existir
    // numa rota @SemContextoOrganizacional).
    if (!requisito) return true;

    // Contexto resolvido é pré-condição estrutural (guard global rodou). `obter()` LANÇA se faltar —
    // e isso é defeito de fiação (500 honesto pelo filtro de contexto), não "acesso negado".
    const { accountId, orgId, papel } = this.requestContext.obter();
    const ability = this.abilities.obter(accountId, orgId, papel);

    // `subject(...)` fixa o tipo do sujeito e carrega o ESCOPO da Organização do contexto. As
    // conditions dos sujeitos usam `id` (Organizacao) OU `orgId` (sujeitos de domínio, como Pipe na
    // Story 2.1); por isso o escopo popula os DOIS com o `orgId` resolvido — o caminho de `Organizacao`
    // permanece idêntico (casa `{ id }`), e sujeitos org-scoped passam a casar `{ orgId }`. Esta é a
    // guarda GROSSA (o papel pode a ação sobre o TIPO, nesta Org); a checagem fina de QUAL recurso é da
    // RLS (o serviço só toca linhas da Org do contexto). Sem regra que case ⇒ negado (deny-by-default).
    if (ability.can(requisito.acao, subject(requisito.sujeito, { id: orgId, orgId }))) {
      return true;
    }

    // Negação observável e SANITIZADA: papel/ação/sujeito e escopo, sem id de recurso concreto além
    // do `orgId` (que o principal já conhece) e sem PII — não revela a existência de recurso alheio
    // (INV-REPORT-01).
    this.logger.warn(
      {
        event: 'authz.denied',
        acao: requisito.acao,
        sujeito: requisito.sujeito,
        orgId,
        accountId,
        papel,
      },
      'ação não autorizada',
    );
    throw new ForbiddenException();
  }
}
