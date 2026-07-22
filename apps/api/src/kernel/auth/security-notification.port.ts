/**
 * Porta da NOTIFICAÇÃO de segurança (Story 1.12) — CONTRATO consumido, não implementação.
 *
 * Mesma decisão de fronteira da porta `INVITE_ACCEPTED_NOTIFICATION_PORT` (8.3): o write-side
 * completo de Notificações/e-mail transacional para o titular (E5/1.13) está em BACKLOG. Para não
 * criar dependência circular nem duplicar mecanismo, a troca de senha emite o evento por ESTA porta;
 * QUEM entrega (e-mail, badge, popover) é E5/1.13 quando existir. O adapter atual é de LOG
 * (observável) — ele **não finge entrega**. Trocar por um adapter real é aditivo.
 *
 * **Minimização (D-4).** O evento carrega SÓ o identificador do titular e o instante — nunca a
 * senha, o hash, um token, o e-mail em claro, nem cookie/identificador de sessão. É o suficiente
 * para a fonte única resolver o destinatário e a preferência.
 */
export const SECURITY_NOTIFICATION_PORT = Symbol('SECURITY_NOTIFICATION_PORT');

/** O evento "sua senha foi alterada" — o único emitido nesta Story. */
export interface SenhaAlteradaEvento {
  readonly tipo: 'SENHA_ALTERADA';
  /** Titular da Account cuja senha mudou. Referência mínima e pseudonimizável (D-4). */
  readonly accountId: string;
  /** Instante da alteração (ISO 8601). */
  readonly em: string;
}

export interface SecurityNotificationPort {
  /**
   * Registra o evento de segurança pela fonte única. Idempotência e entrega são responsabilidade do
   * consumidor final (E5). Falha aqui NÃO desfaz a troca de senha (já commitada) — é observável e
   * recuperável.
   */
  notificarSeguranca(evento: SenhaAlteradaEvento): Promise<void>;
}
