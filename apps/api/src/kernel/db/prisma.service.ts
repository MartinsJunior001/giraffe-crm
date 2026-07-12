import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../../generated/prisma';
import { getEnv } from '../config/env';

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
  constructor() {
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
   * Readiness do banco. Devolve booleano — o erro NUNCA sobe para o payload de
   * `/ready`, porque a mensagem do driver pode carregar host, porta e usuário.
   */
  async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
