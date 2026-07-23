/**
 * Núcleo PURO do tempo real (Story 5.5) — a lógica que decide FORMA de sala, FORMA do sinal e o
 * COALESCING por sala, sem tocar Socket.IO nem timers reais. Isolar isto num núcleo puro é o que
 * torna backpressure e isolamento testáveis sem servidor e sem banco (mesma disciplina de
 * `card-health.core`/`record-query.core`).
 *
 * INVARIANTE: o sinal NUNCA carrega conteúdo. Só um identificador (para dedup no cliente) e o
 * instante (para ordenação). O conteúdo — e a REVALIDAÇÃO de acesso — vivem na leitura 5.4; o socket
 * é invalidação, não fonte de verdade (INV-NOTIF-01). Ver `decisions/socketio-architecture.md` §5.
 */

/** O evento único que o servidor emite: "há novidade, revalide pela 5.4". Nome estável (contrato). */
export const EVENTO_INVALIDACAO = 'notifications:invalidate' as const;

/** Dica opcional emitida na conexão: "faça o fetch inicial pela 5.4". Não carrega dado. */
export const EVENTO_SYNC = 'notifications:sync' as const;

/**
 * O sinal de invalidação. `id` = `notificationId` (identificador para DEDUP no cliente); `at` =
 * `occurredAt` em ISO (ordenação/heurística de "após o cursor"). **Nada mais** — sem
 * `type`/`params`/`resourceId`/`actorId`/PII/token. Se este contrato crescer, o payload deixa de ser
 * um sinal e vira um vazamento.
 */
export interface SinalInvalidacao {
  readonly id: string;
  readonly at: string;
}

/** Constrói o sinal sanitizado a partir do identificador e do instante. */
export function construirSinal(notificationId: string, occurredAt: Date): SinalInvalidacao {
  return { id: notificationId, at: occurredAt.toISOString() };
}

/**
 * Chave da sala escopada por `(userId, organizationId)` — a fronteira de isolamento do canal. Um
 * socket entra EXATAMENTE na sua sala; a emissão é sempre `io.to(salaDe(...))`. `userId`/`orgId`
 * derivam da Membership resolvida no servidor, nunca do cliente. O prefixo tipado evita colisão com
 * a sala default (o próprio `socket.id`) e torna a chave auto-descritiva no diagnóstico.
 */
export function salaDe(orgId: string, userId: string): string {
  return `u:${userId}:o:${orgId}`;
}

/**
 * Coalescing por sala (backpressure / proteção contra tempestade — AC4). Decide, com um relógio
 * INJETADO (`agora` em ms), se um novo sinal para `sala` deve ser emitido AGORA ou suprimido por
 * ainda estar dentro da janela do último emitido. Uma rajada de N notificações para o mesmo
 * destinatário colapsa em poucos sinais — o cliente refaz UM fetch (5.4) que traz todas.
 *
 * Puro no sentido que importa: sem timers, sem I/O, estado explícito (`Map` de últimos instantes).
 * O Gateway detém o `Map` e passa `agora = Date.now()`. Testável determinístico com clock fake.
 */
export class SignalThrottle {
  private readonly ultimoPorSala = new Map<string, number>();

  constructor(private readonly janelaMs: number) {}

  /** `true` se deve emitir agora (e registra o instante); `false` se coalescido dentro da janela. */
  deveEmitir(sala: string, agora: number): boolean {
    const ultimo = this.ultimoPorSala.get(sala);
    if (ultimo !== undefined && agora - ultimo < this.janelaMs) return false;
    this.ultimoPorSala.set(sala, agora);
    return true;
  }

  /** Esquece o estado de uma sala vazia (evita crescimento do Map após todos saírem). */
  esquecer(sala: string): void {
    this.ultimoPorSala.delete(sala);
  }
}

/**
 * Contador de conexões por usuário (teto de conexões — AC4). Mantém o número de sockets ativos por
 * `userId` para recusar conexões acima do teto no handshake. Estado explícito, sem I/O.
 */
export class ContadorConexoes {
  private readonly porUsuario = new Map<string, number>();

  constructor(private readonly teto: number) {}

  /** `true` se ADMITE mais uma conexão para `userId` (e incrementa); `false` se já está no teto. */
  admitir(userId: string): boolean {
    const atual = this.porUsuario.get(userId) ?? 0;
    if (atual >= this.teto) return false;
    this.porUsuario.set(userId, atual + 1);
    return true;
  }

  /** Decrementa ao desconectar; remove a chave ao zerar. */
  liberar(userId: string): void {
    const atual = this.porUsuario.get(userId) ?? 0;
    if (atual <= 1) this.porUsuario.delete(userId);
    else this.porUsuario.set(userId, atual - 1);
  }

  /** Nº de conexões ativas de um usuário (diagnóstico/teste). */
  ativas(userId: string): number {
    return this.porUsuario.get(userId) ?? 0;
  }
}
