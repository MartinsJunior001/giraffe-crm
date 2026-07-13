import 'reflect-metadata';
import { Controller, Get, type ArgumentsHost } from '@nestjs/common';

import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { ServerResponse } from 'node:http';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ContextModule } from '../src/kernel/context/context.module';
import { ContextoIndisponivelFilter } from '../src/kernel/context/contexto-indisponivel.filter';
import { ContextoIndisponivelError, RequestContext } from '../src/kernel/context/request-context';
import { SemContextoOrganizacional } from '../src/kernel/context/sem-contexto.decorator';

/**
 * CR-08 do code review: `ContextoIndisponivelError` virava um 500 ANÔNIMO.
 *
 * Ele é o sintoma da falha estrutural mais perigosa desta arquitetura — um handler rodando sem
 * contexto organizacional, porque o middleware não cobriu a rota ou porque ela foi dispensada do
 * guard e lê contexto assim mesmo. Indistinguível de um erro de banco, ele se dissolvia entre os
 * outros 500s. Não se conserta o que não se consegue contar.
 */

/** Captura o que foi logado e o que foi escrito na resposta. */
function montar() {
  const eventos: Record<string, unknown>[] = [];
  const resposta = { statusCode: 0, corpo: '', headers: {} as Record<string, string> };

  const res = {
    set statusCode(v: number) {
      resposta.statusCode = v;
    },
    setHeader: (k: string, v: string) => {
      resposta.headers[k] = v;
    },
    end: (corpo: string) => {
      resposta.corpo = corpo;
    },
  } as unknown as ServerResponse;

  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', url: '/pipes/42?busca=segredo-do-usuario' }),
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;

  const logger = {
    error: (dados: Record<string, unknown>) => eventos.push(dados),
  } as unknown as PinoLogger;

  return { filtro: new ContextoIndisponivelFilter(logger), host, eventos, resposta };
}

describe('a falha estrutural passa a ser CONTÁVEL', () => {
  it('registra `context.missing` com nível de erro, método e rota', () => {
    const { filtro, host, eventos } = montar();

    filtro.catch(new ContextoIndisponivelError('leitura fora de uma requisição'), host);

    // O evento existe e é nomeado: dá para contá-lo, alertar sobre ele e achar a rota culpada.
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      event: 'context.missing',
      method: 'GET',
      path: '/pipes/42',
    });
    expect(eventos[0]?.['motivo']).toMatch(/fora de uma requisição/i);
  });

  it('a query string NÃO vai para o log — ela carrega dado do usuário', () => {
    const { filtro, host, eventos } = montar();

    filtro.catch(new ContextoIndisponivelError('qualquer'), host);

    // O path localiza a rota desprotegida; a query só traria PII para dentro do log (NFR-1/AD-29).
    expect(eventos[0]?.['path']).toBe('/pipes/42');
    expect(JSON.stringify(eventos[0])).not.toContain('segredo-do-usuario');
  });
});

describe('a resposta continua 500 e continua muda', () => {
  it('responde 500 — e não um 4xx', () => {
    const { filtro, host, resposta } = montar();

    filtro.catch(new ContextoIndisponivelError('qualquer'), host);

    // 4xx diria ao cliente que ELE errou. É mentira: quebramos nós. E ainda o convidaria a tentar
    // de novo com outros dados, o que não adiantaria nada.
    expect(resposta.statusCode).toBe(500);
  });

  it('o corpo não descreve a arquitetura interna para quem estiver sondando', () => {
    const { filtro, host, resposta } = montar();

    filtro.catch(
      new ContextoIndisponivelError('a requisição ainda não teve o contexto resolvido'),
      host,
    );

    expect(JSON.parse(resposta.corpo)).toEqual({
      statusCode: 500,
      message: 'Internal Server Error',
    });
    expect(resposta.corpo).not.toMatch(/contexto|organiza|middleware|guard/i);
  });
});

/**
 * Rota-sonda: reproduz EXATAMENTE o defeito que o CR-08 descreve — uma rota dispensada do guard
 * (portanto sem contexto resolvido) cujo handler lê contexto assim mesmo.
 *
 * Ela existe só no módulo de teste. Registrá-la ao lado do `AppModule` REAL faz o filtro global do
 * `ContextModule` valer para ela — que é o que este teste quer provar.
 */
@SemContextoOrganizacional()
@Controller()
class SondaSemContexto {
  constructor(private readonly requestContext: RequestContext) {}

  @Get('sonda-sem-contexto')
  ler(): unknown {
    return this.requestContext.obter();
  }
}

describe('o filtro está REGISTRADO — e este teste falha se alguém o desregistrar', () => {
  it('o ContextModule declara o ContextoIndisponivelFilter como APP_FILTER', () => {
    // Assertiva sobre a FIAÇÃO, e é de propósito.
    //
    // Tentei primeiro provar o registro por HTTP, e o teste passou pelo motivo errado: sem o
    // filtro, o Nest devolve um 500 com exatamente o mesmo corpo. Removi o `APP_FILTER` do módulo
    // e a suíte continuou verde — o teste "de registro" provava apenas que o Nest sabe responder
    // 500, algo que ele já fazia antes de o CR-08 existir.
    //
    // O que o filtro acrescenta é o EVENTO `context.missing`, e ele não aparece na resposta (nem
    // deve: o motivo é do operador, não do cliente). O comportamento está coberto pelos testes de
    // unidade acima; o que faltava era garantir que ele está ligado na aplicação. Isto garante — e
    // fica vermelho no instante em que alguém remover a linha do módulo.
    const providers = Reflect.getMetadata('providers', ContextModule) as {
      provide?: unknown;
      useClass?: unknown;
    }[];

    expect(
      providers.some(
        (p) => p?.provide === APP_FILTER && p?.useClass === ContextoIndisponivelFilter,
      ),
    ).toBe(true);
  });

  it('a rota que lê contexto sem tê-lo responde 500 mudo, ponta a ponta', async () => {
    // Este NÃO prova o registro do filtro (ver acima). O que ele prova é o contrato de ponta a
    // ponta: `obter()` LANÇA em vez de devolver `undefined`, e nada disso vaza para o cliente — o
    // handler não responde 200 com um objeto vazio, que é o resultado que um `obter()` complacente
    // produziria.
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
    process.env.LOG_LEVEL = 'silent';

    const modulo = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [SondaSemContexto],
    }).compile();

    const app = modulo.createNestApplication({ logger: false });
    await app.listen(0);

    try {
      const res = await fetch(`${await app.getUrl()}/sonda-sem-contexto`);

      // 500, não 200 com um objeto vazio, e não 4xx.
      expect(res.status).toBe(500);

      const corpo = await res.text();
      expect(JSON.parse(corpo)).toMatchObject({ statusCode: 500 });
      // O cliente não fica sabendo NADA sobre contexto, middleware ou guard.
      expect(corpo).not.toMatch(/contexto|organiza|middleware|guard/i);
    } finally {
      await app.close();
    }
  });
});
