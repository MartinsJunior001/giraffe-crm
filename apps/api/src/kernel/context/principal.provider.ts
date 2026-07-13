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
 * A implementação vive na Story 1.4 (`kernel/auth/sessao-principal.provider.ts`): a identidade vem
 * da **sessão validada no servidor**, e de mais nada.
 *
 * Até a 1.4, a única implementação registrada era o `SemSessaoPrincipalProvider`, que devolvia
 * sempre `null` — e por isso toda rota de domínio respondia 401. Ela cumpriu o papel dela e foi
 * **removida**: um provider que nega tudo, mantido no código depois de existir autenticação de
 * verdade, é um pé de cabra esperando alguém registrá-lo por engano num módulo de teste que vaza
 * para produção.
 *
 * O que nunca se fez, em nenhuma das duas Stories: um header de conveniência (`x-account-id`) para
 * "destravar" o caminho positivo enquanto o login não existia. Seria um backdoor de identidade em
 * produção com nome de andaime — e andaime tem o hábito de sobreviver à obra.
 *
 * O guard e o resolvedor de contexto **não mudaram uma linha** quando a 1.4 chegou. Era exatamente
 * para isso que este port existia.
 */
