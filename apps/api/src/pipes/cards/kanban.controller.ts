import { Controller, Get, Param, Query } from '@nestjs/common';
import { Requer } from '../../kernel/authz/requer.decorator';
import { validarIdRota } from './cards.dto';
import { parseCursor, parseLimite } from './kanban.dto';
import {
  type CardDetalheVisao,
  type KanbanVisao,
  KanbanReadService,
  type PaginaCards,
} from './kanban-read.service';

/**
 * Kanban e espaço operacional do Card (Story 2.9), API INTERNA — **somente leitura**. Sob `pipes/:pipeId`.
 * `@Requer('ler','Pipe')` é a guarda GROSSA; a guarda FINA (acesso ao Pipe — VIEWER concedido lê; sem acesso →
 * 404 não-enumerante) vive no `KanbanReadService` via `resolverPoderNoPipe`. Todas as rotas são **GET** e nenhuma
 * muda nada — a movimentação do Card entre Fases é a Story 2.14 (o runtime segue sem GRANT de UPDATE em `Card`).
 */
@Controller('pipes/:pipeId')
export class KanbanController {
  constructor(private readonly kanban: KanbanReadService) {}

  /** O Kanban: colunas (Fases ativas por `position`) com a contagem de Cards de cada uma. */
  @Requer('ler', 'Pipe')
  @Get('kanban')
  async verKanban(@Param('pipeId') pipeId: string): Promise<KanbanVisao> {
    return this.kanban.verKanban(validarIdRota(pipeId, 'pipeId'));
  }

  /** Uma página de Cards de uma coluna (Fase). Paginação por cursor determinístico (`?cursor=&limite=`). */
  @Requer('ler', 'Pipe')
  @Get('kanban/phases/:phaseId/cards')
  async verColuna(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
    @Query('cursor') cursor?: string,
    @Query('limite') limite?: string,
  ): Promise<PaginaCards> {
    return this.kanban.verColunaCards(
      validarIdRota(pipeId, 'pipeId'),
      validarIdRota(phaseId, 'phaseId'),
      parseCursor(cursor),
      parseLimite(limite),
    );
  }

  /** O espaço operacional de um Card: dados, Fase atual e capacidades efetivas do principal. */
  @Requer('ler', 'Pipe')
  @Get('cards/:cardId')
  async verCard(
    @Param('pipeId') pipeId: string,
    @Param('cardId') cardId: string,
  ): Promise<CardDetalheVisao> {
    return this.kanban.verCard(validarIdRota(pipeId, 'pipeId'), validarIdRota(cardId, 'cardId'));
  }
}
