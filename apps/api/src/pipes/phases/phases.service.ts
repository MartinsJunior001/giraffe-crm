import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '../../../generated/prisma';
import { RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { withTenantContext } from '../../kernel/db/tenant-context';
import { exigirGerenciarPipe, resolverPoderNoPipe } from '../pipe-authz';

/**
 * O que uma Fase expõe pela API interna. `orgId` NÃO sai (fronteira interna) e `position` **também não**:
 * a posição é a chave de ordenação interna (um `Decimal` fracionário), não dado de apresentação — a ordem
 * já vem materializada na sequência da lista. `pipeId` sai (identifica o Pipe; já está na rota).
 */
export interface FaseVisao {
  id: string;
  pipeId: string;
  name: string;
  state: 'ACTIVE' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

/** Projeção fixa — mantém `orgId` e `position` fora do payload por construção. */
const SELECT_FASE = {
  id: true,
  pipeId: true,
  name: true,
  state: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
} as const;

/**
 * Gerenciamento de Fases de um Pipe (Story 2.3). TODA query passa por `withTenantContext`: o isolamento
 * entre Organizações é do banco (RLS), não desta camada.
 *
 * **Ativa o poder diferencial por papel de Pipe** (deferido na 2.2 — DBT-2.2-ROLE-DORMENTE): gerenciar
 * Fases é "config do Pipe" (PRD §7). Pode gerenciar o **Admin da Organização** (qualquer Pipe) **ou** o
 * **Admin do Pipe** (concessão `PipeGrant.role = ADMIN` ACTIVE, com `Membership` ACTIVE). MEMBER/VIEWER
 * concedidos **leem**, não gerenciam. A guarda fina vive AQUI (DBT-AUTHZ-01), não no guard — a guarda
 * grossa das rotas é só `@Requer('ler','Pipe')` (o tipo é acessível a qualquer Membership ativa).
 *
 * **Ordenação intra-Pipe por chave fracionária:** mover uma Fase é UM único UPDATE (novo `position` = ponto
 * médio dos vizinhos), porque `withTenantContext` define o contexto por operação e recusa transação
 * multi-statement — reescrever N posições em lote não seria atômico.
 */
@Injectable()
export class PhasesService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db() {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /** Lê uma Fase do Pipe (após já resolvido o acesso). 404 se não existe ou é de outro Pipe (RN-030). */
  private async lerFase(
    db: ReturnType<typeof withTenantContext>,
    pipeId: string,
    phaseId: string,
  ): Promise<FaseVisao> {
    const fase = await db.phase.findUnique({ where: { id: phaseId }, select: SELECT_FASE });
    if (!fase || fase.pipeId !== pipeId) throw new NotFoundException();
    return fase;
  }

  /** Maior `position` entre as Fases ACTIVE do Pipe + 1 (append ao final da ordem ativa); 1 se não houver. */
  private async proximaPosicao(
    db: ReturnType<typeof withTenantContext>,
    pipeId: string,
  ): Promise<Prisma.Decimal> {
    const ultima = await db.phase.findFirst({
      where: { pipeId, state: 'ACTIVE' },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return ultima ? new Prisma.Decimal(ultima.position).plus(1) : new Prisma.Decimal(1);
  }

  /**
   * Lista as Fases do Pipe **na ordem**. Ordena por `[state, position, id]`: as ACTIVE primeiro (o enum
   * declara `ACTIVE` antes de `ARCHIVED`), por `position` asc, com `id` como desempate determinístico; as
   * ARCHIVED vêm **depois** (só quando `incluirArquivadas`). Sem a chave `state`, uma arquivada de `position`
   * baixa se intercalaria entre as ativas. Exige ao menos acesso de leitura ao Pipe (senão 404 não-enumerante).
   */
  async listar(pipeId: string, incluirArquivadas: boolean): Promise<FaseVisao[]> {
    const { contexto, db } = this.db();
    await resolverPoderNoPipe(db, contexto, pipeId); // lança 404 se não há acesso
    const filtroEstado = incluirArquivadas ? {} : { state: 'ACTIVE' as const };
    return db.phase.findMany({
      where: { pipeId, ...filtroEstado },
      select: SELECT_FASE,
      orderBy: [{ state: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    });
  }

  /** Cria uma Fase ACTIVE ao final da ordem ativa do Pipe. `orgId` vem do servidor, nunca do corpo. */
  async criar(pipeId: string, name: string): Promise<FaseVisao> {
    const { contexto, db } = this.db();
    await exigirGerenciarPipe(db, contexto, pipeId);
    const position = await this.proximaPosicao(db, pipeId);
    return db.phase.create({
      data: { orgId: contexto.orgId, pipeId, name, position },
      select: SELECT_FASE,
    });
  }

  /** Renomeia uma Fase do Pipe. 404 (não-enumerante) se não existe ou é de outro Pipe (RN-030). */
  async renomear(pipeId: string, phaseId: string, name: string): Promise<FaseVisao> {
    const { contexto, db } = this.db();
    await exigirGerenciarPipe(db, contexto, pipeId);
    const { count } = await db.phase.updateMany({ where: { id: phaseId, pipeId }, data: { name } });
    if (count === 0) throw new NotFoundException();
    return this.lerFase(db, pipeId, phaseId);
  }

  /**
   * Move uma Fase ACTIVE para logo **depois** de `afterPhaseId` (ou para o **início** se `afterPhaseId` é
   * `null`), com um **único UPDATE**: `position` = ponto médio dos vizinhos no destino. Intra-Pipe: a ordem
   * de outro Pipe não é tocada. Idempotente por resultado (mover para onde já está reescreve a mesma faixa).
   */
  async mover(pipeId: string, phaseId: string, afterPhaseId: string | null): Promise<FaseVisao> {
    const { contexto, db } = this.db();
    await exigirGerenciarPipe(db, contexto, pipeId);
    if (afterPhaseId === phaseId) {
      throw new NotFoundException(); // mover uma Fase "para depois de si mesma" não é uma posição válida
    }
    const alvo = await db.phase.findUnique({
      where: { id: phaseId },
      select: { id: true, pipeId: true, state: true },
    });
    if (!alvo || alvo.pipeId !== pipeId || alvo.state !== 'ACTIVE') throw new NotFoundException();

    // Ordem ativa atual, sem a Fase que está sendo movida — os vizinhos do destino saem daqui.
    const ativas = await db.phase.findMany({
      where: { pipeId, state: 'ACTIVE', id: { not: phaseId } },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true, position: true },
    });

    let anterior: Prisma.Decimal | null = null;
    let seguinte: Prisma.Decimal | null = null;
    if (afterPhaseId === null) {
      // Início da ordem: sem vizinho anterior; o seguinte é a 1ª ativa (se houver).
      const primeira = ativas[0];
      seguinte = primeira ? new Prisma.Decimal(primeira.position) : null;
    } else {
      const idx = ativas.findIndex((f) => f.id === afterPhaseId);
      const referencia = idx === -1 ? undefined : ativas[idx];
      if (!referencia) {
        // `afterPhaseId` não é uma Fase ativa deste Pipe (ou é a própria movida): posição inválida.
        throw new NotFoundException();
      }
      anterior = new Prisma.Decimal(referencia.position);
      const prox = ativas[idx + 1];
      seguinte = prox ? new Prisma.Decimal(prox.position) : null;
    }

    const novaPosicao = this.pontoMedio(anterior, seguinte);
    const { count } = await db.phase.updateMany({
      where: { id: phaseId, pipeId, state: 'ACTIVE' },
      data: { position: novaPosicao },
    });
    if (count === 0) throw new NotFoundException();
    return this.lerFase(db, pipeId, phaseId);
  }

  /**
   * Ponto médio entre dois vizinhos da ordem. Entre ambos: `(a+b)/2`. Só anterior (final): `a+1`. Só
   * seguinte (início): `b/2`. Nenhum (a Fase movida era a única ativa): `1` (fica sozinha na ordem).
   */
  private pontoMedio(
    anterior: Prisma.Decimal | null,
    seguinte: Prisma.Decimal | null,
  ): Prisma.Decimal {
    if (anterior && seguinte) return anterior.plus(seguinte).div(2);
    if (anterior) return anterior.plus(1);
    if (seguinte) return seguinte.div(2);
    return new Prisma.Decimal(1);
  }

  /**
   * Arquiva uma Fase (ACTIVE → ARCHIVED, `archivedAt = now`). **Bloqueia (409) arquivar a última Fase
   * ativa do Pipe** (invariante "≥1 Fase ativa" — SC-233). Idempotente: arquivar uma já arquivada retorna
   * SEM emitir `updateMany` (um `count: 0` viraria falso `denied` de auditoria — mesma correção da 2.1).
   */
  async arquivar(pipeId: string, phaseId: string): Promise<FaseVisao> {
    const { contexto, db } = this.db();
    await exigirGerenciarPipe(db, contexto, pipeId);
    const fase = await this.lerFase(db, pipeId, phaseId);
    if (fase.state === 'ARCHIVED') return fase; // idempotente, sem updateMany
    const ativas = await db.phase.count({ where: { pipeId, state: 'ACTIVE' } });
    if (ativas <= 1) {
      throw new ConflictException('não é possível arquivar a última Fase ativa do Pipe');
    }
    await db.phase.updateMany({
      where: { id: phaseId, pipeId, state: 'ACTIVE' },
      data: { state: 'ARCHIVED', archivedAt: new Date() },
    });
    return this.lerFase(db, pipeId, phaseId);
  }

  /**
   * Restaura uma Fase (ARCHIVED → ACTIVE, `archivedAt = null`) ao **final da ordem ativa** (nova
   * `position`). Idempotente: restaurar uma já ativa retorna SEM emitir `updateMany` (evita falso `denied`).
   */
  async restaurar(pipeId: string, phaseId: string): Promise<FaseVisao> {
    const { contexto, db } = this.db();
    await exigirGerenciarPipe(db, contexto, pipeId);
    const fase = await this.lerFase(db, pipeId, phaseId);
    if (fase.state === 'ACTIVE') return fase; // idempotente, sem updateMany
    const position = await this.proximaPosicao(db, pipeId);
    await db.phase.updateMany({
      where: { id: phaseId, pipeId, state: 'ARCHIVED' },
      data: { state: 'ACTIVE', archivedAt: null, position },
    });
    return this.lerFase(db, pipeId, phaseId);
  }
}
