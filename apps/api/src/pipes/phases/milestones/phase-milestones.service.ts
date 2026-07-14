import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RequestContext } from '../../../kernel/context/request-context';
import { PrismaService } from '../../../kernel/db/prisma.service';
import { withTenantContext } from '../../../kernel/db/tenant-context';
import { exigirGerenciarPipe, resolverPoderNoPipe } from '../../pipe-authz';
import {
  type ConfigMarcos,
  ConfigMarcosInvalidaError,
  validarConfigMarcos,
} from './phase-milestones.core';

/** O que a config de marcos expõe pela API interna (`orgId`/`position` ficam fora da fronteira). */
export interface ConfigMarcosVisao extends ConfigMarcos {
  phaseId: string;
  pipeId: string;
}

const SELECT_CONFIG = {
  id: true,
  pipeId: true,
  expectedDurationMin: true,
  dueDurationMin: true,
  expirationDurationMin: true,
  expectedFieldId: true,
  dueFieldId: true,
  expirationFieldId: true,
} as const;

/** Tipos de Campo aceitos como fonte de override absoluto (epics §949: Campo Data/Data-hora). */
const TIPOS_OVERRIDE = new Set(['DATE', 'DATETIME']);

/**
 * Configuração de marcos por Fase (Story 2.12). Configurar é **"config do Pipe"** — como Fases (2.3) e Formulários
 * (2.4-2.6): pode o **Admin da Org** (qualquer Pipe) **ou** o **Admin do Pipe** (`exigirGerenciarPipe`); **Membro
 * não configura** (403); sem acesso ao Pipe → 404 não-enumerante. A guarda fina vive AQUI (DBT-AUTHZ-01), não no
 * guard/CASL (C3 congelado). O Pipe dono resolve-se por `phase.pipeId`.
 *
 * A config são COLUNAS em `Phase` (`Phase` já tem GRANT SELECT/INSERT/UPDATE — configurar é UPDATE). O snapshot
 * dela é congelado na entrada do Card (`registrarEntradaNaFase`); mudar a config aqui **não** recalcula Cards já
 * na Fase (D-OA1=A — só entradas futuras; sem recálculo retroativo silencioso).
 */
@Injectable()
export class PhaseMilestonesService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db() {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /** Lê a config de marcos de uma Fase. Qualquer poder no Pipe (≥ ler) enxerga; sem acesso → 404. */
  async obterConfig(phaseId: string): Promise<ConfigMarcosVisao> {
    const { contexto, db } = this.db();
    const fase = await db.phase.findUnique({ where: { id: phaseId }, select: SELECT_CONFIG });
    if (!fase) throw new NotFoundException();
    await resolverPoderNoPipe(db, contexto, fase.pipeId); // 404 se o principal não acessa o Pipe
    return this.montarVisao(phaseId, fase);
  }

  /**
   * Substitui a config de marcos da Fase (semântica PUT). 404 se a Fase não existe ou o principal não acessa o
   * Pipe; 403 se só pode operar/ler (não é Admin do Pipe/Org); 400 se a ordenação/valores são inválidos ou um
   * Campo de override não é um `DATE`/`DATETIME` do Formulário inicial do Pipe.
   */
  async configurar(phaseId: string, config: ConfigMarcos): Promise<ConfigMarcosVisao> {
    const { contexto, db } = this.db();
    const fase = await db.phase.findUnique({
      where: { id: phaseId },
      select: { id: true, pipeId: true },
    });
    if (!fase) throw new NotFoundException();
    await exigirGerenciarPipe(db, contexto, fase.pipeId); // Membro/Viewer → 403; sem acesso → 404

    // Invariante de ordenação/valores (núcleo puro) — 400 determinístico.
    try {
      validarConfigMarcos(config);
    } catch (err) {
      if (err instanceof ConfigMarcosInvalidaError) throw new BadRequestException(err.message);
      throw err;
    }

    // Cada Campo de override designado precisa ser um DATE/DATETIME do Formulário inicial do Pipe (fonte dos valores
    // do Card). Um Campo inexistente/de outro tipo/de outro Pipe → 400 (não silenciar um override que nunca aplicaria).
    await this.validarCamposOverride(db, fase.pipeId, config);

    const atualizada = await db.phase.update({
      where: { id: phaseId },
      data: {
        expectedDurationMin: config.expectedDurationMin,
        dueDurationMin: config.dueDurationMin,
        expirationDurationMin: config.expirationDurationMin,
        expectedFieldId: config.expectedFieldId,
        dueFieldId: config.dueFieldId,
        expirationFieldId: config.expirationFieldId,
      },
      select: SELECT_CONFIG,
    });
    return this.montarVisao(phaseId, atualizada);
  }

  // ── Internos ─────────────────────────────────────────────────────────────────────────────────

  private montarVisao(
    phaseId: string,
    fase: {
      pipeId: string;
      expectedDurationMin: number | null;
      dueDurationMin: number | null;
      expirationDurationMin: number | null;
      expectedFieldId: string | null;
      dueFieldId: string | null;
      expirationFieldId: string | null;
    },
  ): ConfigMarcosVisao {
    return {
      phaseId,
      pipeId: fase.pipeId,
      expectedDurationMin: fase.expectedDurationMin,
      dueDurationMin: fase.dueDurationMin,
      expirationDurationMin: fase.expirationDurationMin,
      expectedFieldId: fase.expectedFieldId,
      dueFieldId: fase.dueFieldId,
      expirationFieldId: fase.expirationFieldId,
    };
  }

  /** Confere que cada `fieldId` de override é um Campo DATE/DATETIME do Formulário inicial do Pipe. */
  private async validarCamposOverride(
    db: ReturnType<typeof withTenantContext>,
    pipeId: string,
    config: ConfigMarcos,
  ): Promise<void> {
    const ids = [config.expectedFieldId, config.dueFieldId, config.expirationFieldId].filter(
      (v): v is string => v !== null,
    );
    if (ids.length === 0) return;

    const form = await db.form.findFirst({
      where: { context: 'PIPE_INITIAL', pipeId },
      select: { id: true },
    });
    if (!form) {
      throw new BadRequestException(
        'o Pipe não tem Formulário inicial para designar Campos de override',
      );
    }

    const campos = await db.field.findMany({
      where: { formId: form.id, id: { in: ids } },
      select: { id: true, type: true },
    });
    const porId = new Map(campos.map((c) => [c.id, c.type]));
    for (const id of ids) {
      const tipo = porId.get(id);
      if (tipo === undefined) {
        throw new BadRequestException(
          'Campo de override não pertence ao Formulário inicial do Pipe',
        );
      }
      if (!TIPOS_OVERRIDE.has(tipo)) {
        throw new BadRequestException('Campo de override deve ser do tipo Data ou Data e hora');
      }
    }
  }
}
