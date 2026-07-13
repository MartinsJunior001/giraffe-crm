import { Injectable } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';

/** Quem está fazendo a requisição. Só a identidade — papel e permissão são da Story 1.6. */
export interface Principal {
  readonly accountId: string;
}

/** Token de injeção do port. */
export const PRINCIPAL_PROVIDER = Symbol('PrincipalProvider');

/**
 * Port do principal: "quem é o requisitante?".
 *
 * Existe para INVERTER a dependência entre esta Story e a Story 1.4. A propagação de contexto
 * (1.3) precisa de identidade, mas a autenticação (1.4) ainda não existe — e a ordem das Stories
 * é essa por decisão do épico, não por acidente.
 */
export interface PrincipalProvider {
  /** `null` = não há principal. Não é erro; é ausência, e quem trata é o guard. */
  resolver(req: IncomingMessage): Promise<Principal | null>;
}

/**
 * A ÚNICA implementação registrada nesta Story: não há sessão, logo não há principal.
 *
 * Consequência deliberada: toda rota que exija contexto organizacional responde **401**. Isso não
 * é um furo — é o AC2, e é a demonstração vertical que o épico pede ("rejeição de requisição sem
 * contexto").
 *
 * O que NÃO se fez aqui, e por quê: um header de conveniência (`x-account-id`) para "destravar" o
 * caminho positivo enquanto o login não chega. Isso seria um backdoor de identidade em produção
 * com nome de andaime — e andaime tem o hábito de sobreviver à obra. Qualquer um que descobrisse
 * o header assumiria qualquer conta.
 *
 * Os testes registram um provider falso no módulo de teste. Isso é costura de teste, não
 * backdoor: ele não existe no bundle de produção, e há teste que verifica que o provider
 * registrado no `AppModule` REAL nega.
 *
 * A Story 1.4 substitui esta classe. O resolvedor e o guard não mudam uma linha.
 */
@Injectable()
export class SemSessaoPrincipalProvider implements PrincipalProvider {
  resolver(): Promise<Principal | null> {
    return Promise.resolve(null);
  }
}
