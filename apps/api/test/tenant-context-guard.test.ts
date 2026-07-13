import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { IncomingMessage } from 'node:http';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it } from 'vitest';
import type { OrgContextResolver } from '../src/kernel/context/org-context.resolver';
import type { PrincipalProvider } from '../src/kernel/context/principal.provider';
import { RequestContext } from '../src/kernel/context/request-context';
import { TenantContextGuard } from '../src/kernel/context/tenant-context.guard';

/**
 * O tratamento do header `x-org-id` no guard, isolado.
 *
 * Por que este arquivo existe, e não bastou o teste HTTP: sobre HTTP, o header duplicado devolve
 * 403 **com ou sem** a defesa — a vírgula da string juntada quebra a regex de UUID lá no
 * resolvedor, e o pedido é negado de qualquer jeito. O status, sozinho, não distingue "rejeitei a
 * ambiguidade" de "dei 403 por acidente".
 *
 * O discriminador real é ONDE a requisição morre: com a defesa, o resolvedor **nunca é chamado**.
 * É isso que estes testes afirmam — e é isso que fica vermelho se alguém remover a checagem.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ANA = '11111111-1111-1111-1111-111111111111';

interface Chamada {
  readonly accountId: string;
  readonly orgIdPedido?: string | undefined;
}

/** Monta o guard com dublês, registrando o que chegou ao resolvedor. */
function montar(headers: IncomingMessage['headers']) {
  const chamadas: Chamada[] = [];
  const eventos: Record<string, unknown>[] = [];

  const resolver = {
    resolver: (accountId: string, orgIdPedido?: string) => {
      chamadas.push({ accountId, orgIdPedido });
      return Promise.resolve({ orgId: ORG_A, accountId });
    },
  } as unknown as OrgContextResolver;

  // O escopo é aberto pelo middleware em produção; aqui, à mão. Sem ele, `definir()` lança — o que
  // não é um detalhe de teste, é o desenho se defendendo: o guard não pode escrever contexto numa
  // requisição que ninguém abriu.
  const requestContext = new RequestContext();

  const guard = new TenantContextGuard(
    { getAllAndOverride: () => false } as unknown as Reflector,
    requestContext,
    resolver,
    { resolver: () => Promise.resolve({ accountId: ANA }) } as PrincipalProvider,
    {
      warn: (dados: Record<string, unknown>) => eventos.push(dados),
      info: () => {},
    } as unknown as PinoLogger,
  );

  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ headers }) as IncomingMessage }),
  } as unknown as ExecutionContext;

  /** Executa o guard como em produção: dentro do escopo que o middleware abriria. */
  const ativar = () => requestContext.executarNoEscopo(() => guard.canActivate(context));

  return { ativar, chamadas, eventos };
}

describe('x-org-id repetido é pedido AMBÍGUO', () => {
  it('o Node junta as duplicatas por vírgula — e o guard rejeita SEM consultar o resolvedor', async () => {
    // É assim que a duplicata chega de verdade: uma string só, juntada por ", ". Só `set-cookie`
    // vira array. O `Array.isArray()` original, sozinho, nunca disparava.
    //
    // Note que o PRIMEIRO valor é a Organização legítima de Ana: se o guard "escolhesse o
    // primeiro", a requisição seria ACEITA. É exatamente assim que se contrabandeia valor por
    // request smuggling — o proxy valida um, a aplicação honra outro.
    const { ativar, chamadas, eventos } = montar({ 'x-org-id': `${ORG_A}, ${ORG_B}` });

    await expect(ativar()).rejects.toBeInstanceOf(ForbiddenException);

    // O discriminador: a requisição morreu no guard. Sem a checagem de vírgula, o resolvedor teria
    // sido chamado (e devolveria 403 por outro motivo, mascarando a ausência da defesa).
    expect(chamadas).toHaveLength(0);
    expect(eventos[0]?.['motivo']).toBe('x-org-id repetido (pedido ambíguo)');
  });

  it('array (a forma que o Node reserva a set-cookie) também é rejeitado', async () => {
    const { ativar, chamadas } = montar({ 'x-org-id': [ORG_A, ORG_B] as unknown as string });

    await expect(ativar()).rejects.toBeInstanceOf(ForbiddenException);
    expect(chamadas).toHaveLength(0);
  });
});

describe('normalização do pedido', () => {
  it('UUID em maiúsculas chega ao resolvedor em minúsculas', async () => {
    // O PostgreSQL emite `uuid` sempre minúsculo. Sem normalizar aqui, a comparação `===` contra a
    // Membership reprovaria um membro legítimo — 403 e um alerta de segurança falso.
    const { ativar, chamadas } = montar({ 'x-org-id': ORG_B.toUpperCase() });

    await ativar();

    expect(chamadas[0]?.orgIdPedido).toBe(ORG_B);
  });

  it('espaço em volta é aparado', async () => {
    const { ativar, chamadas } = montar({ 'x-org-id': `  ${ORG_B}  ` });

    await ativar();

    expect(chamadas[0]?.orgIdPedido).toBe(ORG_B);
  });

  it('sem o header, o resolvedor recebe `undefined` — não uma string vazia', async () => {
    // A distinção importa: `undefined` significa "não pediu nada" (e o resolvedor escolhe a única
    // Org ativa); `''` significaria um pedido, inválido. Confundi-los seria transformar "não pedi"
    // em "pedi errado" — ou, pior, o contrário.
    const { ativar, chamadas } = montar({});

    await ativar();

    expect(chamadas[0]?.orgIdPedido).toBeUndefined();
  });
});
