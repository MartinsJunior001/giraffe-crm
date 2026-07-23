import { BadRequestException } from '@nestjs/common';

/**
 * Contratos de saída e validação de entrada das SUPERFÍCIES de Notificação (Story 5.4), no estilo dos demais
 * DTOs do domínio (aceita `unknown`, valida, devolve o tipo estreito ou lança `BadRequestException`
 * SANITIZADA; sem `class-validator` — Constitution II). `orgId`/`dedupeKey`/`availabilityState` bruto ficam
 * SEMPRE fora da fronteira; `orgId` nunca vem do cliente (é do contexto).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPO_RE = /^[A-Z][A-Z0-9_]*$/;

/** Valida um UUID de rota (`:notificationId`) — 400 sanitizado se malformado. */
export function validarUuidDeRota(valor: string, campo: string): string {
  if (typeof valor !== 'string' || !UUID_RE.test(valor)) {
    throw new BadRequestException(`${campo} inválido`);
  }
  return valor;
}

/** Valida o `:type` de rota das preferências (formato estrutural — nunca texto livre). */
export function validarTipoDeRota(valor: string): string {
  if (typeof valor !== 'string' || !TIPO_RE.test(valor)) {
    throw new BadRequestException('tipo de Notificação inválido');
  }
  return valor;
}

/**
 * Projeção sanitizada de UMA Notificação para a superfície (só do que é ACESSÍVEL — inacessível é oculto).
 * `params` já vem escapado do write (5.3). `lida` é DERIVADO de `readAt`. Sem `orgId`/`dedupeKey`.
 */
export interface NotificacaoVisao {
  id: string; // notificationId
  type: string;
  typeVersion: number;
  resourceType: string;
  resourceId: string | null;
  actorId: string | null;
  occurredAt: Date;
  params: unknown;
  readAt: Date | null;
  lida: boolean;
  deliveredAt: Date;
}

/** Uma página da lista completa, com o cursor determinístico para a próxima. */
export interface PaginaNotificacoes {
  notificacoes: NotificacaoVisao[];
  proximoCursor: string | null;
}

/** Contagem do badge (calculada no servidor). `mais=true` quando o bruto de não-lidas excede o teto (CAP). */
export interface ContagemVisao {
  naoLidas: number;
  mais: boolean;
}

/** Preferência EFETIVA de um tipo, como a superfície de preferências a devolve. */
export interface PreferenciaVisao {
  type: string;
  enabled: boolean; // efetivo (obrigatório › override › padrão)
  podeDesativar: boolean;
  obrigatorio: boolean;
  padrao: boolean;
}

/** Cursor de paginação = `id` do `NotificationRecipient` da última linha FETCHADA. Ausente → 1ª página. Lixo → 400. */
export function parseCursor(valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string' || !UUID_RE.test(valor)) {
    throw new BadRequestException('cursor inválido');
  }
  return valor;
}

/** Limite da página; ausente → 30. Inteiro positivo; o teto rígido (100) é aplicado no serviço. Lixo → 400. */
export function parseLimite(valor: unknown): number {
  if (valor === undefined || valor === null || valor === '') return 30;
  const n = typeof valor === 'string' ? Number(valor) : NaN;
  if (!Number.isInteger(n) || n <= 0) {
    throw new BadRequestException('limite inválido');
  }
  return n;
}

/** Flag booleana de query (`?apenasNaoLidas=true`). Ausente → `false`. Valor fora de true/false → 400. */
export function parseBooleano(valor: unknown, campo: string): boolean {
  if (valor === undefined || valor === null || valor === '') return false;
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  throw new BadRequestException(`${campo} inválido`);
}

/** Valida o corpo de SET de preferência (`{ enabled: boolean }`). A regra por tipo é do núcleo puro. */
export function parseSetPreferencia(body: unknown): { enabled: boolean } {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('corpo inválido');
  }
  const enabled = (body as { enabled?: unknown }).enabled;
  if (typeof enabled !== 'boolean') throw new BadRequestException('enabled deve ser booleano');
  return { enabled };
}
