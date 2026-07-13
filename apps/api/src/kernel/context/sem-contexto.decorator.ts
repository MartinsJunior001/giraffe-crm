import { SetMetadata } from '@nestjs/common';

export const SEM_CONTEXTO_ORGANIZACIONAL = 'sem-contexto-organizacional';

/**
 * Marca uma rota como **dispensada** de contexto organizacional.
 *
 * A allowlist é EXPLÍCITA por decisão: o guard é global e o default é **exigir** contexto. Uma
 * rota nova nasce protegida, e para deixar de ser é preciso escrever isto — um ato deliberado,
 * visível no diff e no code review.
 *
 * O inverso (proteger por decorator, expor por omissão) inverte o custo do erro: quem esquece o
 * decorator publica dado organizacional sem contexto, e o esquecimento é invisível.
 *
 * Hoje só `/health` e `/ready` usam. Eles são infraestrutura: um probe não tem Organização, e
 * exigir contexto deles quebraria o healthcheck do orquestrador.
 */
export const SemContextoOrganizacional = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SEM_CONTEXTO_ORGANIZACIONAL, true);
