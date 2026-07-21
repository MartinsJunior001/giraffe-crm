import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type {
  EmailTransacional,
  ErroEnvio,
  ResultadoEnvio,
  TransactionalEmailPort,
} from './transactional-email.port';

/**
 * Adapter REAL de e-mail transacional via **Resend** (Story 8.2, G1).
 *
 * Implementado sobre a **API REST** do Resend com `fetch`, e não o SDK npm, por decisão registrada na
 * spec: zero dependência nova (lockfile permanece frozen), o provedor fica 100% encapsulado aqui, e o
 * adapter é testável mockando `fetch`. Contrato conferido via Context7 (POST /emails, Bearer,
 * `Idempotency-Key`, resposta `{id}` / erro `{message,name,statusCode}`).
 *
 * **Nada do provedor vaza para o domínio:** o serviço de Convite conhece apenas `TransactionalEmailPort`.
 * **Nada sensível vaza para log:** nunca a chave, nunca o token/URL do Convite, e o destinatário é
 * mascarado. Falha vira `ErroEnvio` tipado — o serviço decide o efeito (o Convite segue `pendente`).
 */
@Injectable()
export class ResendTransactionalEmailAdapter implements TransactionalEmailPort {
  private readonly endpoint = 'https://api.resend.com/emails';

  constructor(
    private readonly apiKey: string,
    /** Identidade remetente (`EMAIL_FROM`) — configurável, nunca hardcoded. */
    private readonly from: string,
    private readonly timeoutMs: number,
    private readonly logger: PinoLogger,
  ) {}

  async enviar(email: EmailTransacional): Promise<ResultadoEnvio> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          // Idempotência de ENTREGA: um retry com a mesma chave não duplica o e-mail no provedor.
          'Idempotency-Key': email.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.from,
          to: email.para,
          subject: email.assunto,
          html: email.html,
          text: email.texto,
        }),
        signal: controller.signal,
      });
      return await this.interpretar(res, email);
    } catch (err) {
      return { estado: 'falhou', erro: this.classificar(err) };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Traduz a resposta HTTP do Resend em `ResultadoEnvio`, sem vazar corpo sensível para log. */
  private async interpretar(res: Response, email: EmailTransacional): Promise<ResultadoEnvio> {
    if (res.ok) {
      const corpo = (await res.json().catch(() => ({}))) as { id?: string };
      this.logger.info(
        { event: 'email.enviado', para: mascarar(email.para), provedor: 'resend' },
        'e-mail transacional enviado',
      );
      return { estado: 'enviada', idProvedor: corpo.id ?? 'desconhecido' };
    }

    const erro: ErroEnvio = {
      codigo: res.status === 401 || res.status === 403 ? 'auth' : 'rejeitado',
      detalhe: `HTTP ${res.status}`,
    };
    // Log sanitizado: status e destinatário mascarado; NUNCA a chave, o corpo ou o token.
    this.logger.warn(
      {
        event: 'email.falhou',
        para: mascarar(email.para),
        status: res.status,
        codigo: erro.codigo,
      },
      'falha ao enviar e-mail transacional',
    );
    return { estado: 'falhou', erro };
  }

  /** Classifica exceção (timeout/rede) em erro tipado, sem detalhe cru do SDK/rede. */
  private classificar(err: unknown): ErroEnvio {
    const nome = err instanceof Error ? err.name : '';
    if (nome === 'AbortError') {
      this.logger.warn({ event: 'email.timeout' }, 'timeout ao enviar e-mail transacional');
      return { codigo: 'timeout', detalhe: `timeout ${this.timeoutMs}ms` };
    }
    this.logger.warn({ event: 'email.indisponivel' }, 'provedor de e-mail indisponível');
    return { codigo: 'indisponivel', detalhe: 'provedor indisponível' };
  }
}

/** Mascara o e-mail para log: `an***@exemplo.test` — nunca o endereço completo (NFR-1/PII). */
function mascarar(email: string): string {
  const [local, dominio] = email.split('@');
  if (!dominio || !local) return '***';
  const visivel = local.slice(0, 2);
  return `${visivel}***@${dominio}`;
}
