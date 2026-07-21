import { Injectable } from '@nestjs/common';
import type {
  EmailTransacional,
  ResultadoEnvio,
  TransactionalEmailPort,
} from './transactional-email.port';

/**
 * Adapter FAKE de e-mail transacional (Story 8.2) — usado em dev/teste/CI e sempre que
 * `EMAIL_SEND_ENABLED` está desligado. **Determinístico e inspecionável**: registra em memória o que
 * "enviaria", para os testes asserirem sobre destinatário/assunto/idempotência SEM rede e SEM
 * credencial. Nunca toca a internet.
 *
 * Por que ele existe além dos testes: com o gate desligado (default), o produto continua funcional —
 * o Convite é criado e persistido; só o envio real fica suspenso. Isso permite exercitar todo o
 * fluxo de Convite em staging/dev antes de a credencial do provedor existir (o gate externo).
 */
@Injectable()
export class FakeTransactionalEmailAdapter implements TransactionalEmailPort {
  /** Tudo que "seria enviado" — inspecionável nos testes. */
  readonly enviados: EmailTransacional[] = [];

  /** Se definido, o próximo envio falha com este resultado (para testar o caminho de falha). */
  private falharProximo: ResultadoEnvio | null = null;

  /** Programa uma falha determinística para o próximo `enviar` (teste do caminho `falhou`). */
  programarFalha(resultado: ResultadoEnvio): void {
    this.falharProximo = resultado;
  }

  enviar(email: EmailTransacional): Promise<ResultadoEnvio> {
    if (this.falharProximo) {
      const r = this.falharProximo;
      this.falharProximo = null;
      return Promise.resolve(r);
    }
    this.enviados.push(email);
    // Id determinístico e único por idempotencyKey — o serviço pode conferir sem rede.
    return Promise.resolve({ estado: 'enviada', idProvedor: `fake-${email.idempotencyKey}` });
  }
}
