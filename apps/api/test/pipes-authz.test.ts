import { subject } from '@casl/ability';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it } from 'vitest';
import { construirAbility } from '../src/kernel/authz/ability.factory';
import { AbilityCache } from '../src/kernel/authz/ability.cache';
import { AuthzGuard } from '../src/kernel/authz/authz.guard';
import { Requer } from '../src/kernel/authz/requer.decorator';
import { RequestContext } from '../src/kernel/context/request-context';

/**
 * Autorização do sujeito de domínio `Pipe`, no nível do MECANISMO — factory + cache + guard REAIS,
 * determinístico e sem banco. A partir da Story 2.2 (incremento 2), qualquer Membership ativa pode o
 * TIPO `ler Pipe` (guarda grossa — QUAL Pipe é decidido no serviço pela concessão); `administrar` (ciclo
 * de vida) segue SÓ do Admin da Org. Espelha `authz.test.ts` para o sujeito `Organizacao`, e como toda
 * prova de segurança desta base, exercita a FASE VERMELHA.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONTA = '11111111-1111-1111-1111-111111111111';

/** Rota de teste com a metadata real de `@Requer` para o sujeito Pipe (o guard lê via Reflector). */
class RotaPipe {
  @Requer('administrar', 'Pipe') administrar(): void {}
  @Requer('ler', 'Pipe') ler(): void {}
}

function criarGuard(): { guard: AuthzGuard; ctx: RequestContext } {
  const logger = { warn: () => {}, info: () => {}, debug: () => {} } as unknown as PinoLogger;
  const ctx = new RequestContext();
  const guard = new AuthzGuard(new Reflector(), ctx, new AbilityCache(), logger);
  return { guard, ctx };
}

function execFor(handler: () => void): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => RotaPipe,
    switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}), getNext: () => ({}) }),
  } as unknown as ExecutionContext;
}

/** Roda a checagem do guard DENTRO do escopo (onde o contexto existe) e devolve o resultado ou o erro. */
function checar(papel: 'ADMIN' | 'MEMBER' | 'GUEST', handler: () => void): true | unknown {
  const { guard, ctx } = criarGuard();
  return ctx.executarNoEscopo((): true | unknown => {
    ctx.definir({ orgId: ORG_A, accountId: CONTA, papel });
    try {
      return guard.canActivate(execFor(handler));
    } catch (e) {
      return e;
    }
  });
}

describe('ability de Pipe: `ler` para toda Membership ativa, `administrar` só ADMIN, escopada ao orgId (SC-203 / AC3)', () => {
  it('ADMIN lê e administra Pipe na PRÓPRIA Organização', () => {
    const admin = construirAbility('ADMIN', ORG_A);
    expect(admin.can('ler', subject('Pipe', { orgId: ORG_A }))).toBe(true);
    expect(admin.can('administrar', subject('Pipe', { orgId: ORG_A }))).toBe(true);
  });

  it('ADMIN NÃO alcança Pipe de outra Organização — sem herança cross-tenant (AC4 simétrico)', () => {
    const adminC = construirAbility('ADMIN', ORG_C);
    expect(adminC.can('ler', subject('Pipe', { orgId: ORG_A }))).toBe(false);
    expect(adminC.can('administrar', subject('Pipe', { orgId: ORG_A }))).toBe(false);
  });

  it('MEMBER e GUEST podem `ler` o TIPO Pipe (guarda grossa), mas NÃO `administrar` (ciclo de vida é do Admin da Org)', () => {
    // Incremento 2: MEMBER/GUEST passam a poder o tipo `ler` (para acessar os Pipes concedidos; QUAL
    // Pipe é a guarda fina, no serviço). Fase vermelha do CICLO DE VIDA: se o factory concedesse
    // `administrar` a MEMBER/GUEST por engano, abriria criar/arquivar/restaurar a não-Admin e a segunda
    // asserção falharia.
    for (const papel of ['MEMBER', 'GUEST'] as const) {
      const ability = construirAbility(papel, ORG_A);
      expect(ability.can('ler', subject('Pipe', { orgId: ORG_A }))).toBe(true);
      expect(ability.can('administrar', subject('Pipe', { orgId: ORG_A }))).toBe(false);
    }
  });
});

describe('ponto de aplicação: o guard concede/nega Pipe corretamente (SC-203)', () => {
  it('ADMIN passa em @Requer(administrar, Pipe) e @Requer(ler, Pipe)', () => {
    // FASE VERMELHA DA CORREÇÃO DO GUARD: o `AuthzGuard` monta o sujeito com o escopo da Org. A
    // condition de Pipe é `{ orgId }`, a de Organizacao é `{ id }`. Antes da correção o guard passava
    // só `{ id: orgId }`, e ADMIN levava 403 em Pipe (a condition `{ orgId }` não casava). Estas duas
    // asserções ficam VERMELHAS se o guard voltar a montar o sujeito sem o `orgId`.
    expect(checar('ADMIN', RotaPipe.prototype.administrar)).toBe(true);
    expect(checar('ADMIN', RotaPipe.prototype.ler)).toBe(true);
  });

  it('MEMBER passa na guarda grossa de `ler` Pipe, mas recebe 403 em `administrar`', () => {
    // Passar em `ler` é a guarda GROSSA; o serviço ainda filtra QUAL Pipe pela concessão (404 se nenhuma).
    expect(checar('MEMBER', RotaPipe.prototype.ler)).toBe(true);
    expect(checar('MEMBER', RotaPipe.prototype.administrar)).toBeInstanceOf(ForbiddenException);
  });

  it('GUEST passa na guarda grossa de `ler` Pipe, mas recebe 403 em `administrar`', () => {
    expect(checar('GUEST', RotaPipe.prototype.ler)).toBe(true);
    expect(checar('GUEST', RotaPipe.prototype.administrar)).toBeInstanceOf(ForbiddenException);
  });
});
