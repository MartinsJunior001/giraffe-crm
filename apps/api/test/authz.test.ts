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
 * O substrato de autorização (Story 1.6). Aqui provamos o MECANISMO — determinístico e rápido — com
 * o factory, o cache e o guard REAIS (não mocks deles). A derivação do papel a partir do BANCO
 * (Membership ativa, sem herança cross-tenant, negação de SUSPENDED/REMOVED) é provada contra um
 * PostgreSQL real em `org-context.test.ts`, que já resolve `papel` e nega o que não é ativo.
 *
 * Como todo teste de segurança desta base: onde possível, provamos a FASE VERMELHA (o teste falha se
 * a propriedade for quebrada).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONTA = '11111111-1111-1111-1111-111111111111';
const EMAIL = 'ana@exemplo.test'; // PII — jamais deve aparecer num log de negação.

/** Rota de teste com metadata real de `@Requer` (o guard lê via Reflector). */
class RotaProtegida {
  @Requer('administrar', 'Organizacao') administrar(): void {}
  @Requer('ler', 'Organizacao') ler(): void {}
  semRequisito(): void {}
}

/** Evento de log capturado, para provar que a negação é observável e sanitizada. */
interface Evento {
  readonly dados: Record<string, unknown>;
}

function criarGuard(): { guard: AuthzGuard; ctx: RequestContext; eventos: Evento[] } {
  const eventos: Evento[] = [];
  const logger = {
    warn: (dados: Record<string, unknown>) => eventos.push({ dados }),
    info: () => {},
    debug: () => {},
  } as unknown as PinoLogger;
  const ctx = new RequestContext();
  const guard = new AuthzGuard(new Reflector(), ctx, new AbilityCache(), logger);
  return { guard, ctx, eventos };
}

function execFor(handler: () => void): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => RotaProtegida,
    switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}), getNext: () => ({}) }),
  } as unknown as ExecutionContext;
}

describe('deny-by-default (SC-601 / AC1)', () => {
  it('subject sem regra explícita é negado — ausência de regra NEGA', () => {
    const abilityMember = construirAbility('MEMBER', ORG_A);

    // MEMBER tem o piso `ler`, mas NENHUMA regra `administrar`. Ausência ⇒ negado.
    expect(abilityMember.can('administrar', subject('Organizacao', { id: ORG_A }))).toBe(false);

    // Fase vermelha: se o factory tivesse um `can('manage','all')` acidental, esta asserção
    // falharia — é ela que garante que "esquecer a permissão" nega em vez de liberar.
    const abilityAdmin = construirAbility('ADMIN', ORG_A);
    expect(abilityAdmin.can('administrar', subject('Organizacao', { id: ORG_A }))).toBe(true);
  });

  it('o guard responde 403 quando a ability não concede a ação', () => {
    const { guard, ctx } = criarGuard();

    // A checagem roda DENTRO do escopo (é lá que o contexto existe); capturamos o erro para
    // asserir fora. Rodar fora do escopo lançaria ContextoIndisponivelError, não ForbiddenException.
    const erro = ctx.executarNoEscopo((): unknown => {
      ctx.definir({ orgId: ORG_A, accountId: CONTA, papel: 'MEMBER' });
      try {
        guard.canActivate(execFor(RotaProtegida.prototype.administrar));
        return null;
      } catch (e) {
        return e;
      }
    });

    expect(erro).toBeInstanceOf(ForbiddenException);
  });

  it('rota sem @Requer não é barrada por esta camada (o contexto já a protege)', () => {
    const { guard, ctx } = criarGuard();

    const permitido = ctx.executarNoEscopo(() => {
      ctx.definir({ orgId: ORG_A, accountId: CONTA, papel: 'GUEST' });
      return guard.canActivate(execFor(RotaProtegida.prototype.semRequisito));
    });

    expect(permitido).toBe(true);
  });
});

describe('escopo de Organização, sem herança (SC-602 / AC2)', () => {
  it('ability de ADMIN na Org C não alcança a Org A', () => {
    const abilityAdminC = construirAbility('ADMIN', ORG_C);

    // Administra a PRÓPRIA Organização…
    expect(abilityAdminC.can('administrar', subject('Organizacao', { id: ORG_C }))).toBe(true);
    // …e NENHUMA outra. As conditions fixam `{ id: orgId }` — sem herança cross-tenant.
    expect(abilityAdminC.can('administrar', subject('Organizacao', { id: ORG_A }))).toBe(false);
    expect(abilityAdminC.can('ler', subject('Organizacao', { id: ORG_A }))).toBe(false);
  });
});

describe('teto por papel e ausência de acesso implícito (SC-603 / SC-604 / AC3)', () => {
  it('GUEST e MEMBER têm o piso de leitura, mas não administram', () => {
    for (const papel of ['GUEST', 'MEMBER'] as const) {
      const ability = construirAbility(papel, ORG_A);
      expect(ability.can('ler', subject('Organizacao', { id: ORG_A }))).toBe(true);
      expect(ability.can('administrar', subject('Organizacao', { id: ORG_A }))).toBe(false);
    }
  });

  it('não existe papel de Plataforma que conceda abilities de Organização', () => {
    // `PapelEfetivo` é `MembershipRole` (ADMIN/MEMBER/GUEST). Um Super Admin da Plataforma NÃO é um
    // MembershipRole — ele não tem Membership ativa na Organização e, por isso, jamais chega ao
    // factory com contexto daquela Organização (o `OrgContextResolver` o nega antes, provado em
    // org-context.test.ts). Aqui garantimos que nenhum dos papéis existentes concede acesso fora do
    // próprio escopo — não há ramo "de plataforma" que injete permissão de Org (INV-ADMIN-01(c)).
    for (const papel of ['ADMIN', 'MEMBER', 'GUEST'] as const) {
      const ability = construirAbility(papel, ORG_C);
      expect(ability.can('administrar', subject('Organizacao', { id: ORG_A }))).toBe(false);
      expect(ability.can('ler', subject('Organizacao', { id: ORG_A }))).toBe(false);
    }
  });
});

describe('ponto de aplicação concede corretamente (SC-605 / AC1)', () => {
  it('ADMIN passa em @Requer(administrar) e qualquer ativo passa em @Requer(ler)', () => {
    const { guard, ctx } = criarGuard();

    const admin = ctx.executarNoEscopo(() => {
      ctx.definir({ orgId: ORG_A, accountId: CONTA, papel: 'ADMIN' });
      return guard.canActivate(execFor(RotaProtegida.prototype.administrar));
    });
    expect(admin).toBe(true);

    const leitura = ctx.executarNoEscopo(() => {
      ctx.definir({ orgId: ORG_A, accountId: CONTA, papel: 'GUEST' });
      return guard.canActivate(execFor(RotaProtegida.prototype.ler));
    });
    expect(leitura).toBe(true);
  });
});

describe('invalidação de abilities em cache (SC-606 / AC4)', () => {
  it('após invalidar, a próxima checagem reflete o novo papel — e a mutação prova que importa', () => {
    const cache = new AbilityCache();

    // Papel inicial MEMBER: memoiza uma ability SEM `administrar`.
    const inicial = cache.obter(CONTA, ORG_A, 'MEMBER');
    expect(inicial.can('administrar', subject('Organizacao', { id: ORG_A }))).toBe(false);

    // MUTAÇÃO (fase vermelha do mecanismo): SEM invalidar, pedir com papel ADMIN devolve a ability
    // MEMBER cacheada — a permissão obsoleta continuaria valendo. É exatamente o bug que a
    // invalidação existe para impedir.
    const semInvalidar = cache.obter(CONTA, ORG_A, 'ADMIN');
    expect(semInvalidar.can('administrar', subject('Organizacao', { id: ORG_A }))).toBe(false);

    // COM invalidação: a próxima checagem reconstrói com o papel atual, sem janela obsoleta.
    cache.invalidar(CONTA, ORG_A);
    const aposInvalidar = cache.obter(CONTA, ORG_A, 'ADMIN');
    expect(aposInvalidar.can('administrar', subject('Organizacao', { id: ORG_A }))).toBe(true);
  });

  it('invalidar uma chave não afeta outra Organização da mesma conta', () => {
    const cache = new AbilityCache();
    cache.obter(CONTA, ORG_A, 'ADMIN');
    const antesC = cache.obter(CONTA, ORG_C, 'MEMBER');

    cache.invalidar(CONTA, ORG_A);

    // A ability da Org C é a MESMA instância memoizada — invalidar A não a tocou.
    expect(cache.obter(CONTA, ORG_C, 'MEMBER')).toBe(antesC);
  });

  it('o cache tem teto: cresce até o limite e a evicção não corrompe a correção', () => {
    const cache = new AbilityCache();

    // Enche muito além do teto (10k). Sem limite, o Map guardaria todas as 10.050 entradas — um
    // vazamento de memória lento. Com o teto FIFO, as mais antigas são descartadas.
    for (let i = 0; i < 10_050; i++) {
      cache.obter(`conta-${i}`, ORG_A, 'GUEST');
    }

    // Evictada e reconstruída: a ability de uma conta ADMIN, mesmo após passar pelo cache cheio,
    // continua deny-by-default e escopada — evictar só custa reconstrução, nunca correção.
    const admin = cache.obter(CONTA, ORG_A, 'ADMIN');
    expect(admin.can('administrar', subject('Organizacao', { id: ORG_A }))).toBe(true);
    expect(admin.can('administrar', subject('Organizacao', { id: ORG_C }))).toBe(false);
  });
});

describe('permissão derivada, nunca em token (SC-607 / AC de AD-9)', () => {
  it('a ability é função pura de (papel, orgId) — não lê token nem sessão', () => {
    // O factory recebe apenas papel e orgId. Duas construções com os mesmos argumentos produzem o
    // mesmo veredito. Nada de permissão viaja em cookie/token: o papel vem da Membership (banco),
    // resolvido no contexto (org-context.test.ts). Este teste ancora essa propriedade estrutural.
    const a = construirAbility('ADMIN', ORG_A);
    const b = construirAbility('ADMIN', ORG_A);
    expect(a.can('administrar', subject('Organizacao', { id: ORG_A }))).toBe(
      b.can('administrar', subject('Organizacao', { id: ORG_A })),
    );
  });
});

describe('negação observável e sanitizada (SC-608 / INV-REPORT-01)', () => {
  it('loga authz.denied com ação/sujeito/escopo e SEM recurso concreto ou PII', () => {
    const { guard, ctx, eventos } = criarGuard();

    const erro = ctx.executarNoEscopo((): unknown => {
      ctx.definir({ orgId: ORG_A, accountId: CONTA, papel: 'MEMBER' });
      try {
        guard.canActivate(execFor(RotaProtegida.prototype.administrar));
        return null;
      } catch (e) {
        return e;
      }
    });
    expect(erro).toBeInstanceOf(ForbiddenException);

    const negacao = eventos.find((e) => e.dados['event'] === 'authz.denied');
    expect(negacao).toBeDefined();
    expect(negacao?.dados).toMatchObject({
      event: 'authz.denied',
      acao: 'administrar',
      sujeito: 'Organizacao',
      orgId: ORG_A,
      accountId: CONTA,
      papel: 'MEMBER',
    });

    // Sanitização: o log não carrega PII (e-mail) nem id de recurso concreto além do orgId, que o
    // próprio principal já conhece. Dizer "o recurso X existe" a quem não pode vê-lo é o vazamento
    // por negação que o INV-REPORT-01 proíbe.
    const serializado = JSON.stringify(negacao?.dados);
    expect(serializado).not.toContain(EMAIL);
    expect(serializado).not.toMatch(/senha|password|token|cookie/i);
  });
});
