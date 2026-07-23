import type { IncomingMessage } from 'node:http';
import { Inject, Injectable } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PinoLogger } from 'nestjs-pino';
import { getEnv } from '../../kernel/config/env';
import { OrgContextResolver } from '../../kernel/context/org-context.resolver';
import {
  PRINCIPAL_PROVIDER,
  type PrincipalProvider,
} from '../../kernel/context/principal.provider';
import type { NotificationRealtimePort } from './notification-realtime.port';
import {
  ContadorConexoes,
  EVENTO_INVALIDACAO,
  EVENTO_SYNC,
  salaDe,
  type SinalInvalidacao,
  SignalThrottle,
} from './realtime-signal.core';

/** Forma canônica de um UUID (hex + hífens). Normalizado para minúsculas antes de conferir. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O que guardamos no `socket.data` após a autorização do handshake — nunca vindo do cliente. */
interface DadosSocket {
  userId?: string;
  orgId?: string;
  admitido?: boolean;
}

/**
 * Gateway de tempo real (Story 5.5) — Socket.IO como **invalidação, não fonte de verdade**.
 *
 * Anexa ao MESMO servidor HTTP da API (`@WebSocketGateway()` sem porta → path `/socket.io/`),
 * deploy-friendly (o proxy só libera o upgrade WS no mesmo host/porta). Implementa a
 * `NotificationRealtimePort`: PRODUTORES (fonte única 5.3, Membership 8.5/8.6, troca de Org 1.9) falam
 * com a interface; este gateway transporta.
 *
 * **Autenticação/autorização no handshake E na reconexão** (reconexão = nova conexão física → mesmo
 * caminho) reusam a MESMA sessão (cookie better-auth) via o `PRINCIPAL_PROVIDER` + `OrgContextResolver`
 * — a autoridade é a Membership ATIVA conferida no servidor, NUNCA o cliente. Deny-by-default: sem
 * sessão / sem Membership ativa / acima do teto → `connect_error` (recusado). Guard/`ability.ts` (C3)
 * congelado — a autz de canal vive aqui, no gateway (o socket só autoriza o PRÓPRIO canal
 * `(userId,orgId)`; acesso a RECURSO é revalidado pela 5.4 na leitura).
 *
 * **Isolamento:** sala `(userId, orgId)`; nenhum socket recebe evento de outra Org/usuário. **Payload
 * sem PII:** só `SinalInvalidacao` (`id`+`at`). **Backpressure:** coalescing por sala + teto de
 * conexões por conta. **Degradação:** emissão best-effort e fault-isolated — a app funciona 100% sem o
 * socket. Ver `decisions/socketio-architecture.md`.
 */
@Injectable()
@WebSocketGateway({
  // O cliente só RECEBE sinais (não envia payloads de app): um buffer pequeno é defensivo (anti-DoS de
  // frame gigante). O handshake/cookies vão nos headers, não neste buffer.
  maxHttpBufferSize: 10_000,
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, NotificationRealtimePort
{
  @WebSocketServer() private server?: Server;

  private readonly throttle: SignalThrottle;
  private readonly conexoes: ContadorConexoes;

  constructor(
    @Inject(PRINCIPAL_PROVIDER) private readonly principais: PrincipalProvider,
    private readonly resolver: OrgContextResolver,
    private readonly logger: PinoLogger,
  ) {
    const env = getEnv();
    this.throttle = new SignalThrottle(env.REALTIME_THROTTLE_MS);
    this.conexoes = new ContadorConexoes(env.REALTIME_MAX_SOCKETS_PER_USER);
  }

  // ─────────────────────────────────────────────────────────── HANDSHAKE ──

  /**
   * Registra o middleware de handshake (`io.use`) — o ponto onde a conexão é autenticada/autorizada
   * ANTES de existir. Recusar aqui (`next(err)`) manda `connect_error` ao cliente, semântica limpa de
   * "handshake recusado". O middleware roda também em cada RECONEXÃO.
   */
  afterInit(server: Server): void {
    server.use((socket, next) => {
      this.autorizarHandshake(socket).then(
        (ok) => next(ok ? undefined : new Error('unauthorized')),
        () => next(new Error('unauthorized')),
      );
    });
  }

  /**
   * Resolve identidade + Organização do handshake e decide a admissão. Reusa EXATAMENTE o
   * `PRINCIPAL_PROVIDER` (sessão better-auth em prod; o mesmo port sobreposto em teste) e o
   * `OrgContextResolver` (Membership ATIVA) — a mesma precedência do `TenantContextGuard`. Nada é
   * confiado do cliente além de um PEDIDO de Org, conferido contra a Membership.
   */
  private async autorizarHandshake(socket: Socket): Promise<boolean> {
    // `socket.request` é o `IncomingMessage` original do handshake (com `headers.cookie`).
    const principal = await this.principais.resolver(socket.request as IncomingMessage);
    if (!principal) {
      this.negar('sem sessão válida');
      return false;
    }

    const pedido = this.orgPedido(socket, principal.orgIdPreferido);
    let contexto: { orgId: string; accountId: string };
    try {
      contexto = await this.resolver.resolver(principal.accountId, pedido);
    } catch {
      // `OrgContextResolver` lança (403) quando não há Membership ativa / Org pedida não casa.
      this.negar('sem Membership ativa na Organização');
      return false;
    }

    // Teto de conexões por conta (backpressure). Só incrementa quando ADMITE — a liberação é no
    // `handleDisconnect` do socket admitido.
    if (!this.conexoes.admitir(contexto.accountId)) {
      this.negar('teto de conexões por usuário excedido');
      return false;
    }

    const dados = socket.data as DadosSocket;
    dados.userId = contexto.accountId;
    dados.orgId = contexto.orgId;
    dados.admitido = true;
    return true;
  }

  /**
   * O que o cliente PEDIU de Organização — `handshake.auth.orgId` (canônico) ou header `x-org-id`
   * (equivalente ao HTTP). Pedido, nunca autoridade: vira `origem:'header'` (conferido estrito pela
   * Membership). Ausente → preferência da sessão → única Membership ativa (mesma cascata do guard).
   * Valor ambíguo/malformado é ignorado como "não pediu" (o resolver decide com a Membership).
   */
  private orgPedido(
    socket: Socket,
    preferida: string | undefined,
  ): { orgId: string; origem: 'header' | 'preferencia' } | undefined {
    const bruto = this.orgDoHandshake(socket);
    if (bruto !== undefined) return { orgId: bruto, origem: 'header' };
    if (preferida !== undefined) return { orgId: preferida, origem: 'preferencia' };
    return undefined;
  }

  private orgDoHandshake(socket: Socket): string | undefined {
    const auth = socket.handshake.auth as { orgId?: unknown } | undefined;
    const doAuth = typeof auth?.orgId === 'string' ? auth.orgId : undefined;
    const header = socket.handshake.headers['x-org-id'];
    const doHeader = typeof header === 'string' ? header : undefined;
    const bruto = doAuth ?? doHeader;
    if (bruto === undefined) return undefined;
    const normal = bruto.trim().toLowerCase();
    // Sintaticamente inválido → tratado como "não pediu": o resolver decide pela Membership (não vira
    // erro de handshake, coerente com o header duplicado do guard HTTP).
    return UUID.test(normal) ? normal : undefined;
  }

  /**
   * Conexão ADMITIDA (o middleware já autorizou). Entra na sua sala `(userId,orgId)` e recebe a dica
   * de sincronização inicial (o cliente busca o backlog pela 5.4). O `handleConnection` só é chamado
   * para sockets que passaram no `io.use`.
   */
  handleConnection(socket: Socket): void {
    const dados = socket.data as DadosSocket;
    if (!dados.admitido || !dados.userId || !dados.orgId) {
      // Defensivo: não deveria ocorrer (middleware recusa antes). Encerra sem vazar.
      socket.disconnect(true);
      return;
    }
    socket.join(salaDe(dados.orgId, dados.userId));
    // Dica: "faça o fetch inicial pela 5.4". Sem dado — só um empurrão de sincronização.
    socket.emit(EVENTO_SYNC, {});
  }

  /** Libera a cota de conexões do usuário ao desconectar (só para o socket que foi admitido). */
  handleDisconnect(socket: Socket): void {
    const dados = socket.data as DadosSocket;
    if (dados.admitido && dados.userId) this.conexoes.liberar(dados.userId);
  }

  // ─────────────────────────────────────────── NotificationRealtimePort ──

  /**
   * Emite o SINAL (não o conteúdo) ao canal de cada destinatário. Best-effort e coalescido por sala
   * (backpressure): rajada para o mesmo destinatário colapsa num sinal dentro da janela. Fault-isolated
   * — qualquer erro é engolido/logado (a fonte é o banco; o socket é otimização).
   */
  notificarDestinatarios(orgId: string, userIds: readonly string[], sinal: SinalInvalidacao): void {
    if (!this.server) return; // gateway ainda não inicializado (degrada)
    const agora = Date.now();
    try {
      for (const userId of new Set(userIds)) {
        const sala = salaDe(orgId, userId);
        if (this.throttle.deveEmitir(sala, agora)) {
          this.server.to(sala).emit(EVENTO_INVALIDACAO, sinal);
        }
      }
    } catch (err) {
      this.logger.warn(
        { event: 'realtime.emit_falhou', motivo: mensagem(err) },
        'falha ao emitir sinal de tempo real (degrada para a fonte canônica)',
      );
    }
  }

  /**
   * Revoga o canal `(userId,orgId)`: desconecta os sockets da sala (encerra as inscrições anteriores).
   * Best-effort. O backstop de segurança real é a revalidação de acesso da 5.4 — este método reduz a
   * janela, não é a fronteira de acesso a dado.
   */
  revogarCanal(orgId: string, userId: string): void {
    if (!this.server) return;
    const sala = salaDe(orgId, userId);
    try {
      this.server.in(sala).disconnectSockets(true);
      this.throttle.esquecer(sala);
    } catch (err) {
      this.logger.warn(
        { event: 'realtime.revogacao_falhou', motivo: mensagem(err) },
        'falha ao revogar canal de tempo real',
      );
    }
  }

  /** Negação de handshake — evento de segurança sanitizado (sem PII/cookie/token). */
  private negar(motivo: string): void {
    this.logger.warn({ event: 'realtime.denied', motivo }, 'handshake de tempo real recusado');
  }
}

/** Mensagem de erro sem vazar stack/objeto. */
function mensagem(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
