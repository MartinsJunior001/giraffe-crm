/**
 * Porta de e-mail transacional da Plataforma (Story 8.2, G1).
 *
 * **Nenhuma regra de domínio depende do SDK do provedor.** O serviço de Convite fala com esta porta;
 * quem fala com o Resend é o `ResendTransactionalEmailAdapter`, e os testes usam o
 * `FakeTransactionalEmailAdapter`. Trocar de provedor amanhã é trocar o adapter, não o domínio — é
 * o mesmo princípio de fronteira do `FileStoragePort`/`FileScanPort` da capacidade de arquivos (AD-28).
 *
 * A porta é **transacional da Plataforma**, separada do Composer outbound de E6 (epics §616): não
 * depende de Template da Organização, identidade remetente do cliente, nem histórico por Card.
 */

export const TRANSACTIONAL_EMAIL_PORT = Symbol('TransactionalEmailPort');

/** Um e-mail transacional a enviar. Sem HTML livre do cliente — o corpo é montado pelo template. */
export interface EmailTransacional {
  /** Destinatário (e-mail já validado/normalizado pelo domínio). */
  para: string;
  assunto: string;
  /** Corpo em texto e HTML, montados por template da própria Plataforma. */
  texto: string;
  html: string;
  /**
   * Chave de idempotência de ENTREGA: dois envios com a mesma chave não devem duplicar a mensagem no
   * provedor (o adapter a repassa quando o provedor suporta). Deriva do Convite + versão do token,
   * para que um retry não gere segundo e-mail (contrato da Story).
   */
  idempotencyKey: string;
}

/** Desfecho do envio — separado do estado do Convite (epics §616: `enfileirada/enviada/falhou`). */
export type ResultadoEnvio =
  { estado: 'enviada'; idProvedor: string } | { estado: 'falhou'; erro: ErroEnvio };

/** Erro TIPADO de envio — sem segredo, sem token, sem corpo do e-mail (observabilidade sanitizada). */
export interface ErroEnvio {
  /** Categoria acionável, não a mensagem crua do SDK. */
  codigo: 'timeout' | 'auth' | 'rejeitado' | 'indisponivel' | 'desconhecido';
  /** Detalhe já sanitizado (nunca `Authorization`, chave, ou destinatário completo). */
  detalhe: string;
}

/**
 * Porta de envio transacional. O adapter real aplica timeout e traduz falha em `ErroEnvio` tipado;
 * NUNCA lança segredo/token. A falha de entrega **não** altera o estado do Convite (segue `pendente`)
 * — quem decide isso é o serviço, a partir do `ResultadoEnvio`.
 */
export interface TransactionalEmailPort {
  enviar(email: EmailTransacional): Promise<ResultadoEnvio>;
}
