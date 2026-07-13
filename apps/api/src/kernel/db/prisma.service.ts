import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { PrismaClient } from '../../../generated/prisma';
import { getEnv } from '../config/env';

/**
 * Teto para a sonda de readiness (ver `isReachable`).
 *
 * 5s, e não 2s, por medição: a PRIMEIRA query de um client Prisma paga a subida do engine e
 * a conexão — 2.038 ms neste projeto; as seguintes, 0 ms. Um deadline de 2s reprovava um
 * banco perfeitamente saudável no primeiro `/ready` depois do boot, que é justamente quando
 * o orquestrador pergunta. Aquecimento não é sinal de saúde.
 *
 * O deadline existe para limitar um banco PENDURADO (pacotes descartados, não recusados), em
 * que a sonda esperaria pelo `pool_timeout` do Prisma. O `--timeout` do HEALTHCHECK no
 * Dockerfile é maior que este valor — do contrário o probe morreria antes de a sonda ter
 * chance de responder, e o container seria marcado unhealthy sem nunca ter sido consultado.
 */
const DEADLINE_READINESS_MS = 5_000;

/**
 * Remove qualquer string de conexão da mensagem antes de ela ir para o log.
 *
 * O erro do driver carrega host, porta, usuário e — na forma de URL — a SENHA. Não vazar
 * para o cliente (o payload de `/ready` é `{status}` e nada mais) não basta: o log também
 * é um destino, e um segredo em log é um segredo vazado (NFR-1/AD-29).
 */
function sanitizar(err: unknown): string {
  const bruto = err instanceof Error ? err.message : String(err);
  return bruto.replace(/postgres(?:ql)?:\/\/\S*/gi, '[conexão omitida]');
}

/**
 * Client do PostgreSQL para o RUNTIME da aplicação.
 *
 * Conecta com `DATABASE_URL` — o papel `giraffe_app`, que NÃO tem `BYPASSRLS`, não é
 * superusuário e não é dono das tabelas. O processo de runtime deliberadamente não
 * possui a credencial do papel de migration (AD-6).
 *
 * Este client sozinho NÃO carrega contexto de Organização: use `withTenantContext()`.
 * Uma query feita direto por aqui não enxerga nenhuma linha organizacional — é o
 * deny-by-default funcionando, não um bug.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(private readonly logger: Logger) {
    super({ datasourceUrl: getEnv().DATABASE_URL });
  }

  // NÃO existe `onModuleInit` com `$connect()`. Um connect ansioso lança quando o banco está
  // fora NO BOOT, e o processo morre antes de abrir a porta HTTP — sem `/health`, sem
  // `/ready`, sem 503. Isso contradiria o motivo pelo qual `/ready` existe: sinalizar
  // "não estou apto" e deixar o orquestrador desviar o tráfego enquanto o processo espera.
  //
  // Com a conexão preguiçosa do Prisma, um banco indisponível no boot produz `/health` 200
  // (o processo está vivo) e `/ready` 503 (não está apto) — e a recuperação é automática
  // quando o banco volta, sem restart. Fail-fast continua valendo para CONFIGURAÇÃO
  // (`getEnv()` acima), que é erro do operador; um banco fora é falha de dependência, e as
  // duas não merecem a mesma reação.

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Readiness do banco: aptidão real para atender, não apenas "o socket respondeu".
   *
   * A sonda lê uma tabela do schema (`LIMIT 0` — não traz linha nem depende de contexto de
   * RLS). Com isso ela prova, de uma vez: conexão viva, schema migrado e GRANT concedido ao
   * papel de runtime. Um `SELECT 1` provaria só a conexão — e um container com o banco de
   * pé e as migrations NÃO aplicadas responderia `200 ok` e entraria em rotação para falhar
   * em toda requisição de domínio. Readiness que mente é pior que readiness ausente.
   *
   * Há DEADLINE próprio: sem ele, um banco pendurado (pacotes descartados, não recusados)
   * seguraria a sonda até o `pool_timeout` do Prisma — mais que o `--timeout=3s` do
   * HEALTHCHECK, que mataria o probe sem resposta alguma.
   *
   * Devolve booleano, e o erro NUNCA sobe para o payload de `/ready`. Mas é REGISTRADO,
   * sanitizado: não vazar não pode significar não saber — sem isto, o 503 era mudo e o
   * operador não tinha o que ler.
   */
  async isReachable(): Promise<boolean> {
    let temporizador: NodeJS.Timeout | undefined;
    try {
      const prazo = new Promise<never>((_, reject) => {
        temporizador = setTimeout(
          () => reject(new Error(`sonda excedeu ${DEADLINE_READINESS_MS}ms`)),
          DEADLINE_READINESS_MS,
        );
      });
      await Promise.race([this.$queryRaw`SELECT 1 FROM "Membership" LIMIT 0`, prazo]);
      return true;
    } catch (err) {
      this.logger.warn(
        { event: 'db.unreachable', reason: sanitizar(err) },
        'banco não está apto — /ready responderá 503',
      );
      return false;
    } finally {
      clearTimeout(temporizador);
    }
  }
}
