import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Requer } from '../kernel/authz/requer.decorator';
import { NotificationPreferencesService } from './read/notification-preferences.service';
import type { NotificationRecipientView } from './notifications.dto';
import {
  type ContagemVisao,
  type NotificacaoVisao,
  type PaginaNotificacoes,
  type PreferenciaVisao,
  parseBooleano,
  parseCursor,
  parseLimite,
  parseSetPreferencia,
  validarTipoDeRota,
  validarUuidDeRota,
} from './read/notifications-read.dto';
import { NotificationsReadService } from './read/notifications-read.service';

/**
 * Superfícies de Notificação (Story 5.4), API INTERNA. Badge/popover/página derivam EXCLUSIVAMENTE da fonte de
 * 5.3 (INV-NOTIF-01); a contagem é calculada no SERVIDOR; cada item passa pela revalidação de acesso ao recurso
 * de origem (perdeu acesso ⇒ oculto e fora da contagem — a Notificação nunca concede acesso).
 *
 * `@Requer('ler','Organizacao')` é a guarda GROSSA (piso de qualquer Membership ativa — C3 congelado, sem
 * sujeito CASL novo). A autoridade FINA — "são as MINHAS Notificações / a MINHA preferência" — decide no serviço
 * pelo `recipientMembershipId`/`membershipId` do PRINCIPAL autenticado, NUNCA aceito do cliente.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly leitura: NotificationsReadService,
    private readonly preferencias: NotificationPreferencesService,
  ) {}

  /** PÁGINA — conjunto completo autorizado. `?cursor=&limite=&apenasNaoLidas=`. Cursor determinístico. */
  @Requer('ler', 'Organizacao')
  @Get()
  async listar(
    @Query('cursor') cursor?: string,
    @Query('limite') limite?: string,
    @Query('apenasNaoLidas') apenasNaoLidas?: string,
  ): Promise<PaginaNotificacoes> {
    return this.leitura.listar(
      parseCursor(cursor),
      parseLimite(limite),
      parseBooleano(apenasNaoLidas, 'apenasNaoLidas'),
    );
  }

  /** POPOVER — subconjunto recente (≤ 10). */
  @Requer('ler', 'Organizacao')
  @Get('recentes')
  async recentes(): Promise<NotificacaoVisao[]> {
    return this.leitura.recentes();
  }

  /** BADGE — contagem de não-lidas acessíveis, calculada no servidor. Zero legítimo = `{0,false}`. */
  @Requer('ler', 'Organizacao')
  @Get('contagem')
  async contagem(): Promise<ContagemVisao> {
    return this.leitura.contar();
  }

  /** Ler as preferências efetivas do próprio usuário. */
  @Requer('ler', 'Organizacao')
  @Get('preferences')
  async lerPreferencias(): Promise<PreferenciaVisao[]> {
    return this.preferencias.listar();
  }

  /** MARCAR COMO LIDA (idempotente) — `recipientMembershipId` do principal; 404 se alheio. Contagem recomputada. */
  @Requer('ler', 'Organizacao')
  @Post(':notificationId/read')
  @HttpCode(200)
  async marcarComoLida(
    @Param('notificationId') notificationId: string,
  ): Promise<{ recipient: NotificationRecipientView; naoLidas: number }> {
    return this.leitura.marcarComoLida(validarUuidDeRota(notificationId, 'notificationId'));
  }

  /** MARCAR TODAS COMO LIDAS (idempotente) — corte do servidor; não marca entregas pós-corte. */
  @Requer('ler', 'Organizacao')
  @Post('read-all')
  @HttpCode(200)
  async marcarTodasComoLidas(): Promise<{ marcadas: number; naoLidas: number }> {
    return this.leitura.marcarTodasComoLidas();
  }

  /** SETAR a preferência do próprio usuário para um tipo. Obrigatório/não-desativável não silencia → 400. */
  @Requer('ler', 'Organizacao')
  @Put('preferences/:type')
  async setarPreferencia(
    @Param('type') type: string,
    @Body() body: unknown,
  ): Promise<PreferenciaVisao> {
    const { enabled } = parseSetPreferencia(body);
    return this.preferencias.setar(validarTipoDeRota(type), enabled);
  }
}
