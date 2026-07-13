import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { getEnv } from '../config/env';
import { PrismaService } from '../db/prisma.service';

/** G1, ratificado: 5 falhas por identificador em 15 minutos. */
export const MAX_FALHAS = 5;
export const JANELA_MS = 15 * 60 * 1000;

/**
 * Prefixo de FINALIDADE na entrada do HMAC.
 *
 * Sem ele, a mesma chave derivada poderia servir a dois contadores diferentes (login, recuperação
 * de senha, verificação) — e estourar o limite de um zeraria ou envenenaria o outro. O prefixo é o
 * que mantém as finalidades separadas mesmo compartilhando o segredo.
 */
const FINALIDADE = 'login:';

/**
 * Contador de FALHAS de login por identificador — o G1.
 *
 * Ele existe porque o rate limiter nativo do Better Auth **não consegue** fazer isto: a chave dele é
 * `${ip}|${path}` e ele conta *solicitações*, não *falhas* (verificado na fonte, ver
 * `gates/1-4/context7-check.md`). Confiar no nativo para as duas coisas deixaria a força bruta
 * dirigida a UMA conta sem proteção nenhuma — um atacante com uma lista de e-mails, testando uma
 * senha comum em cada, jamais estoura um limite por conta.
 *
 * Duas propriedades que o desenho não pode perder:
 *
 * 1. **Nenhum e-mail em claro.** A chave é HMAC do identificador normalizado. E-mail é PII: em claro
 *    aqui, esta tabela viraria um segundo cadastro de e-mails fora do `Account` — e um dump dela,
 *    uma lista de usuários.
 * 2. **Incremento atômico.** `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, instrução única.
 *    `SELECT`-depois-`UPDATE` perde contagens sob concorrência, que é exatamente o regime em que um
 *    ataque acontece: o atacante não erra a senha cinco vezes em sequência educada, ele dispara
 *    cinquenta requisições de uma vez.
 */
@Injectable()
export class LoginFailureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Normaliza o identificador ANTES de derivar a chave.
   *
   * Sem isto, `ANA@Exemplo.TEST`, ` ana@exemplo.test ` e `ana@exemplo.test` gerariam três chaves
   * diferentes — e o G1 seria contornável só variando a capitalização. O limite de 5 falhas viraria
   * um limite de 5 falhas *por grafia*.
   */
  private normalizar(identificador: string): string {
    return identificador.trim().toLowerCase();
  }

  /** HMAC-SHA256(finalidade + identificador normalizado). Nunca o e-mail. */
  private derivarChave(identificador: string): string {
    const env = getEnv();
    return createHmac('sha256', env.LOGIN_HMAC_SECRET)
      .update(FINALIDADE + this.normalizar(identificador))
      .digest('hex');
  }

  /**
   * Registra UMA falha e devolve se o limite foi atingido.
   *
   * A instrução é única e atômica. O `CASE` resolve a expiração da janela dentro do próprio
   * `UPDATE`: se a janela venceu, a contagem **reinicia em 1** e a janela recomeça — não há um
   * segundo comando de limpeza que pudesse rodar entre a leitura e a escrita.
   *
   * `keyVersion` acompanha a chave (D6): quando o segredo rotaciona, as chaves antigas deixam de
   * ser derivadas e simplesmente **expiram com a janela** — em vez de serem apagadas, o que zeraria
   * o contador de um atacante em curso no exato momento da rotação.
   */
  async registrarFalha(identificador: string): Promise<{ bloqueado: boolean; count: number }> {
    const env = getEnv();
    const chave = this.derivarChave(identificador);
    const agora = new Date();
    const inicioValido = new Date(agora.getTime() - JANELA_MS);

    const linhas = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "LoginFailure" ("key", "keyVersion", "count", "windowStart")
      VALUES (${chave}, ${env.LOGIN_HMAC_KEY_VERSION}, 1, ${agora})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "LoginFailure"."windowStart" < ${inicioValido} THEN 1
          ELSE "LoginFailure"."count" + 1
        END,
        "windowStart" = CASE
          WHEN "LoginFailure"."windowStart" < ${inicioValido} THEN ${agora}
          ELSE "LoginFailure"."windowStart"
        END,
        "keyVersion" = ${env.LOGIN_HMAC_KEY_VERSION}
      RETURNING "count"
    `;

    const count = linhas[0]?.count ?? 1;
    const bloqueado = count >= MAX_FALHAS;

    // O identificador NUNCA vai para o log — nem em claro, nem hasheado. A chave HMAC no log seria
    // um identificador estável de uma pessoa, o que a torna PII pseudonimizada: correlacionável, e
    // portanto sujeita à LGPD. O que o operador precisa saber é que houve falha e quantas.
    this.logger.warn({ event: 'auth.login.failed', count, bloqueado }, 'falha de login registrada');

    return { bloqueado, count };
  }

  /**
   * O identificador está bloqueado agora?
   *
   * Chamado ANTES de verificar a senha — senão a 6ª tentativa com a senha CERTA passaria, e o
   * limite não limitaria nada: bastaria ao atacante acertar na tentativa seguinte à quinta.
   */
  async estaBloqueado(identificador: string): Promise<boolean> {
    const chave = this.derivarChave(identificador);
    const inicioValido = new Date(Date.now() - JANELA_MS);

    const linhas = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT "count" FROM "LoginFailure"
      WHERE "key" = ${chave} AND "windowStart" >= ${inicioValido}
    `;

    return (linhas[0]?.count ?? 0) >= MAX_FALHAS;
  }

  /**
   * Login bem-sucedido: limpa o contador **deste identificador** (G4).
   *
   * E **só** dele. O contador de IP (G2, nativo do Better Auth) **não** é tocado — se fosse, o
   * atacante intercalaria um login válido da própria conta a cada N tentativas e zeraria o antiabuso
   * de origem para sempre. As duas defesas protegem coisas diferentes e por isso não compartilham
   * um botão de reset.
   */
  async limpar(identificador: string): Promise<void> {
    const chave = this.derivarChave(identificador);
    await this.prisma.$executeRaw`DELETE FROM "LoginFailure" WHERE "key" = ${chave}`;
  }

  /**
   * Compara a chave derivada de um identificador com uma chave conhecida, sem vazar tempo.
   *
   * Usado apenas em teste, para provar que a tabela guarda o HMAC e não o e-mail — sem que o próprio
   * teste precise saber calcular o HMAC de um jeito diferente do de produção.
   */
  chaveDe(identificador: string): string {
    return this.derivarChave(identificador);
  }

  /** Igualdade em tempo constante — a comparação de chaves não deve virar um oráculo. */
  static chavesIguais(a: string, b: string): boolean {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  }
}
