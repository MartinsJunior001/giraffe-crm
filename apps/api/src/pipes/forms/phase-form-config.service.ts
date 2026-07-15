import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { type ContextoOrganizacional, RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { withTenantContext } from '../../kernel/db/tenant-context';
import { exigirGerenciarPipe } from '../pipe-authz';

type Db = ReturnType<typeof withTenantContext>;

/** Modo do Formulário de Fase, do jeito que sai pela API interna. */
export interface ModoFormularioFaseVisao {
  phaseId: string;
  requisitoEntrada: boolean;
  requisitoSaida: boolean;
}

/**
 * Configuração do MODO do Formulário de Fase (Story 2.15, D1): `requisitoEntrada`/`requisitoSaida` (dois booleanos
 * independentes). É **"config do Pipe"** (`exigirGerenciarPipe` — Admin da Org/Admin do Pipe; Membro→403; sem
 * acesso→404), resolvida pelo `phase.pipeId`. O Formulário de Fase é materializado sob demanda (getOrCreate), como
 * na montagem (2.4) — configurar o modo não exige que Campos já existam.
 */
@Injectable()
export class PhaseFormConfigService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /** Define o modo do Formulário de Fase. Só os campos informados mudam (PATCH parcial). */
  async definirModo(
    pipeId: string,
    phaseId: string,
    modo: { requisitoEntrada?: boolean; requisitoSaida?: boolean },
  ): Promise<ModoFormularioFaseVisao> {
    const { contexto, db } = this.db();

    // A Fase precisa pertencer ao Pipe (RN-030) e o principal precisa GERENCIAR o Pipe.
    const phase = await db.phase.findFirst({
      where: { id: phaseId, pipeId },
      select: { id: true },
    });
    if (!phase) throw new NotFoundException();
    await exigirGerenciarPipe(db, contexto, pipeId); // 404 sem acesso; 403 se só opera/lê

    const form = await this.getOrCreatePhaseForm(db, contexto.orgId, phaseId);
    const data: { requisitoEntrada?: boolean; requisitoSaida?: boolean } = {};
    if (modo.requisitoEntrada !== undefined) data.requisitoEntrada = modo.requisitoEntrada;
    if (modo.requisitoSaida !== undefined) data.requisitoSaida = modo.requisitoSaida;

    if (Object.keys(data).length > 0) {
      await db.form.updateMany({ where: { id: form.id }, data });
    }
    const atualizado = await db.form.findUniqueOrThrow({
      where: { id: form.id },
      select: { requisitoEntrada: true, requisitoSaida: true },
    });
    return {
      phaseId,
      requisitoEntrada: atualizado.requisitoEntrada,
      requisitoSaida: atualizado.requisitoSaida,
    };
  }

  /**
   * Materializa o Formulário de contexto PHASE da Fase (sem `upsert`: o índice único é a garantia). Um Form PHASE
   * tem `phaseId` como owner e `pipeId` NULL (CHECK da migration de Formulários) — o Pipe é derivado da Fase.
   */
  private async getOrCreatePhaseForm(
    db: Db,
    orgId: string,
    phaseId: string,
  ): Promise<{ id: string }> {
    const existente = await db.form.findFirst({
      where: { context: 'PHASE', phaseId },
      select: { id: true },
    });
    if (existente) return existente;
    return db.form.create({
      data: { orgId, context: 'PHASE', phaseId },
      select: { id: true },
    });
  }
}
