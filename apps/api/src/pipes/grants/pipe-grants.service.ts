import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma, type PipeRole } from '../../../generated/prisma';
import { RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { withTenantContext } from '../../kernel/db/tenant-context';

/**
 * O que uma concessão expõe pela API interna. `orgId` NÃO sai (fronteira interna). O `membershipId`
 * sai — é o alvo que o Admin da Org precisa para gerir o roster; é identificador interno, não PII
 * (não é e-mail nem nome da pessoa).
 */
export interface ConcessaoVisao {
  id: string;
  pipeId: string;
  membershipId: string;
  role: PipeRole;
  state: 'ACTIVE' | 'REVOKED';
  createdAt: Date;
  updatedAt: Date;
  revokedAt: Date | null;
}

/** Projeção fixa — mantém `orgId` fora do payload por construção. */
const SELECT_GRANT = {
  id: true,
  pipeId: true,
  membershipId: true,
  role: true,
  state: true,
  createdAt: true,
  updatedAt: true,
  revokedAt: true,
} as const;

/**
 * Concessão de papel POR Pipe (Story 2.2). Em 2.2, **só o Admin da Organização** administra concessões
 * (o guard `@Requer('administrar','Pipe')` já barra MEMBER/GUEST — deny-by-default). TODA query passa por
 * `withTenantContext`: o isolamento entre Organizações é do banco (RLS), não desta camada.
 *
 * A tabela liga a concessão a uma `Membership` (o vínculo Account×Org), nunca à Account global — o papel
 * por Pipe vive dentro da Organização. O `orgId` gravado vem do contexto do servidor (nunca do corpo) e o
 * `WITH CHECK` da policy reconfere.
 *
 * **No máximo um papel ATIVO por (Pipe, pessoa)** é imposto pelo BANCO (índice único parcial
 * `WHERE state='ACTIVE'`), não por leitura-antes-de-escrever — uma segunda concessão ativa colide no
 * INSERT e vira 409, sem corrida.
 */
@Injectable()
export class PipeGrantsService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db() {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /**
   * Garante que o Pipe existe NA ORGANIZAÇÃO do contexto (a RLS filtra outra Org → null → 404). Sem
   * isto, conceder papel num `pipeId` de outra Org vazaria a existência dele por um erro distinto.
   */
  private async exigirPipeDaOrg(db: ReturnType<typeof withTenantContext>, pipeId: string) {
    const pipe = await db.pipe.findUnique({ where: { id: pipeId }, select: { id: true } });
    if (!pipe) throw new NotFoundException();
  }

  /**
   * Garante que a Membership alvo existe NA ORGANIZAÇÃO do contexto e está ATIVA. Conceder papel a uma
   * Membership de outra Org (id adivinhado) é barrado aqui — a RLS de `Membership` a torna invisível — e
   * conceder a uma Membership suspensa/removida não faz sentido. 400 (o cliente mandou um alvo inválido),
   * não 404: o recurso da rota é o Pipe (que existe); o corpo é que está errado.
   */
  private async exigirMembershipAtivaDaOrg(
    db: ReturnType<typeof withTenantContext>,
    membershipId: string,
  ) {
    const m = await db.membership.findUnique({
      where: { id: membershipId },
      select: { state: true },
    });
    if (!m || m.state !== 'ACTIVE') {
      throw new BadRequestException('membershipId não é uma Membership ativa desta Organização');
    }
  }

  /** Concede um papel a uma Membership num Pipe. Recusa (409) se já houver concessão ATIVA ao par. */
  async conceder(pipeId: string, membershipId: string, role: PipeRole): Promise<ConcessaoVisao> {
    const { contexto, db } = this.db();
    await this.exigirPipeDaOrg(db, pipeId);
    await this.exigirMembershipAtivaDaOrg(db, membershipId);
    try {
      return await db.pipeGrant.create({
        data: { orgId: contexto.orgId, pipeId, membershipId, role },
        select: SELECT_GRANT,
      });
    } catch (e) {
      // Índice único parcial (pipeId, membershipId) WHERE state='ACTIVE' — segunda concessão ativa ao
      // mesmo par. É o "no máximo um papel efetivo por Pipe" (AC2), imposto pelo banco. Alterar o papel
      // existente é o PATCH, não um novo POST.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('já existe uma concessão ativa para esta pessoa neste Pipe');
      }
      throw e;
    }
  }

  /** Lista as concessões ATIVAS de um Pipe (o roster). Só as da Org do contexto (RLS). */
  async listar(pipeId: string): Promise<ConcessaoVisao[]> {
    const { db } = this.db();
    await this.exigirPipeDaOrg(db, pipeId);
    return db.pipeGrant.findMany({
      where: { pipeId, state: 'ACTIVE' },
      select: SELECT_GRANT,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Exige uma concessão ATIVA daquele Pipe, na Org do contexto — ou 404 uniforme. É uma LEITURA
   * (`findUnique`, não auditada) feita ANTES do `updateMany`, para que os casos "não existe / outra Org
   * (RLS→null) / outro Pipe / já revogada" respondam 404 **sem** emitir um `updateMany` com `{ count: 0 }`.
   * Um `updateMany` que casa 0 linhas é classificado pela auditoria como tentativa filtrada por RLS →
   * falso `denied` na trilha FR-214; aqui a re-revogação/alteração de uma concessão inexistente ou já
   * revogada é operação legítima do Admin, não sinal de acesso cruzado. (Mesma correção da 2.1 em
   * arquivar/restaurar.)
   */
  private async exigirConcessaoAtivaDoPipe(
    db: ReturnType<typeof withTenantContext>,
    pipeId: string,
    grantId: string,
  ): Promise<void> {
    const grant = await db.pipeGrant.findUnique({
      where: { id: grantId },
      select: { pipeId: true, state: true },
    });
    if (!grant || grant.pipeId !== pipeId || grant.state !== 'ACTIVE') {
      throw new NotFoundException();
    }
  }

  /** Altera o papel de uma concessão ATIVA. 404 (não-enumerante) se não existe, é de outra Org ou já revogada. */
  async alterarPapel(pipeId: string, grantId: string, role: PipeRole): Promise<ConcessaoVisao> {
    const { db } = this.db();
    await this.exigirConcessaoAtivaDoPipe(db, pipeId, grantId);
    const { count } = await db.pipeGrant.updateMany({
      where: { id: grantId, pipeId, state: 'ACTIVE' },
      data: { role },
    });
    // A guarda acima e o `updateMany` são transações separadas (`withTenantContext` recusa `$transaction`).
    // Se uma revogação concorrente entrar nessa janela, o `updateMany` casa 0 linhas: honramos com 404 em vez
    // de devolver um corpo re-lido enganoso (200 sobre uma concessão que já não está mais ativa).
    if (count === 0) throw new NotFoundException();
    const grant = await db.pipeGrant.findUnique({ where: { id: grantId }, select: SELECT_GRANT });
    if (!grant) throw new NotFoundException();
    return grant;
  }

  /**
   * Revoga uma concessão (soft-delete: `state = REVOKED`, `revokedAt = now`). NUNCA apaga (o runtime nem
   * tem GRANT de DELETE) — preserva a trilha. Revogar uma já revogada (ou inexistente/de outra Org) é 404,
   * coerente com "revogar o que está ATIVO" — e sem gerar falso `denied` de auditoria (ver
   * `exigirConcessaoAtivaDoPipe`).
   */
  async revogar(pipeId: string, grantId: string): Promise<ConcessaoVisao> {
    const { db } = this.db();
    await this.exigirConcessaoAtivaDoPipe(db, pipeId, grantId);
    const { count } = await db.pipeGrant.updateMany({
      where: { id: grantId, pipeId, state: 'ACTIVE' },
      data: { state: 'REVOKED', revokedAt: new Date() },
    });
    // Mesma janela de `alterarPapel`: uma revogação concorrente que vença a corrida deixa este `updateMany`
    // com 0 linhas. 404 é a resposta honesta — a concessão já não estava mais ativa para esta operação revogar.
    if (count === 0) throw new NotFoundException();
    const grant = await db.pipeGrant.findUnique({ where: { id: grantId }, select: SELECT_GRANT });
    if (!grant) throw new NotFoundException();
    return grant;
  }
}
