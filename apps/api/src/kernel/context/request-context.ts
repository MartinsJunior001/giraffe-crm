import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { MembershipRole } from '../../../generated/prisma';

/**
 * O contexto organizacional de UMA requisição, resolvido no SERVIDOR.
 *
 * `orgId` não é o que o cliente pediu — é o que a Membership permitiu. A distinção é a Story 1.3
 * inteira. `papel` é o `MembershipRole` efetivo dessa mesma Membership ativa: a Story 1.6 o adiciona
 * aqui para que a autorização (CASL) o derive do BANCO, nunca de um token (AD-9). Ele existe porque
 * um contexto de Organização só nasce de uma Membership ativa — e toda Membership tem um papel.
 */
export interface ContextoOrganizacional {
  readonly orgId: string;
  readonly accountId: string;
  readonly papel: MembershipRole;
}

/** Escopo mutável de uma requisição. Nasce vazio; o guard o preenche. */
interface Escopo {
  contexto?: ContextoOrganizacional;
}

/**
 * Erro de LEITURA de contexto — sempre um defeito de programação, nunca entrada do usuário.
 * Por isso é uma classe própria: ele nunca deve virar 4xx (o usuário não fez nada errado), e
 * nunca deve ser confundido com "acesso negado".
 */
export class ContextoIndisponivelError extends Error {
  constructor(motivo: string) {
    super(`Contexto organizacional indisponível: ${motivo}`);
    this.name = 'ContextoIndisponivelError';
  }
}

/**
 * Contexto de requisição via `AsyncLocalStorage`.
 *
 * Por que ALS e não passar `orgId` por parâmetro: porque a alternativa é enfiar o `orgId` em cada
 * assinatura de cada camada, e a primeira função que esquecer de repassá-lo vira um caminho sem
 * contexto. O parâmetro esquecido é silencioso; a ALS não é.
 *
 * Por que isso NÃO substitui o `set_config(..., true)` da Story 1.2: são camadas diferentes. A ALS
 * carrega o contexto na APLICAÇÃO; a extensão do Prisma o aplica na TRANSAÇÃO. Trocar uma pela
 * outra reintroduziria o vazamento por pool de conexões que a 1.2 fechou — o contexto grudaria na
 * conexão, ela voltaria ao pool, e a próxima requisição herdaria o tenant anterior.
 */
@Injectable()
export class RequestContext {
  private readonly als = new AsyncLocalStorage<Escopo>();

  /**
   * Abre o escopo da requisição. Chamado UMA vez, pelo middleware, envolvendo a requisição
   * inteira — inclusive os guards, que precisam escrever nele.
   *
   * O escopo morre quando `fn` termina. Contexto que sobrevive à requisição é contexto que vaza
   * para a próxima.
   */
  executarNoEscopo<T>(fn: () => T): T {
    return this.als.run({}, fn);
  }

  /**
   * Preenche o escopo com o contexto resolvido. Só o guard chama isto.
   *
   * Definir duas vezes é proibido: um contexto que pode ser trocado no meio da requisição é um
   * contexto que pode ser trocado por um atacante. Ele é escrito uma vez e é imutável dali em
   * diante.
   */
  definir(contexto: ContextoOrganizacional): void {
    const escopo = this.als.getStore();
    if (!escopo) {
      throw new ContextoIndisponivelError('não há escopo de requisição aberto');
    }
    if (escopo.contexto) {
      throw new ContextoIndisponivelError('o contexto já foi definido nesta requisição');
    }
    escopo.contexto = contexto;
  }

  /**
   * Lê o contexto. **LANÇA** quando não há — e essa é a decisão central deste arquivo.
   *
   * Devolver `undefined` seria a porta de entrada do bug clássico: alguém escreve
   * `const org = ctx?.orgId` e "trata" o `undefined` com um default, um `if` ou um `??` — e o que
   * era "sem contexto" vira "qualquer contexto". Ausência de contexto não é um valor; é um erro.
   */
  obter(): ContextoOrganizacional {
    const escopo = this.als.getStore();
    if (!escopo) {
      throw new ContextoIndisponivelError('leitura fora de uma requisição');
    }
    if (!escopo.contexto) {
      throw new ContextoIndisponivelError('a requisição ainda não teve o contexto resolvido');
    }
    return escopo.contexto;
  }

  /**
   * Existe contexto? Para quem PRECISA decidir sem lançar (ex.: um logger que enriquece a linha
   * quando há contexto). Nunca use isto para autorizar — quem autoriza usa `obter()`.
   */
  temContexto(): boolean {
    return this.als.getStore()?.contexto !== undefined;
  }
}
