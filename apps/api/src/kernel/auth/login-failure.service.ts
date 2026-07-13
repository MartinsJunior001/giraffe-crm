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

  /** HMAC-SHA256(finalidade + identificador normalizado), sob um segredo. Nunca o e-mail. */
  private derivar(identificador: string, segredo: string): string {
    return createHmac('sha256', segredo)
      .update(FINALIDADE + this.normalizar(identificador))
      .digest('hex');
  }

  /** A chave sob o segredo ATUAL — é nela que toda falha nova é registrada. */
  private derivarChave(identificador: string): string {
    return this.derivar(identificador, getEnv().LOGIN_HMAC_SECRET);
  }

  /**
   * As chaves que ainda **contam** neste momento: a atual e, durante a sobreposição da rotação (D6),
   * a derivada do segredo anterior.
   *
   * É isto que impede o buraco central da rotação: trocar o segredo muda todas as chaves derivadas
   * de uma vez, e sem consultar a anterior os contadores de quem está sob ataque **agora** ficariam
   * órfãos. O atacante ganharia 5 tentativas novas de graça, no instante exato da rotação — e a
   * rotação é uma operação de segurança, não pode abrir uma janela de ataque.
   *
   * A chave anterior é só de **leitura**: nada novo é escrito nela (ver `registrarFalha`).
   */
  private chavesAtivas(identificador: string): string[] {
    const env = getEnv();
    const chaves = [this.derivarChave(identificador)];

    if (env.LOGIN_HMAC_PREVIOUS_SECRET !== undefined) {
      chaves.push(this.derivar(identificador, env.LOGIN_HMAC_PREVIOUS_SECRET));
    }

    return chaves;
  }

  /**
   * Soma as falhas ainda dentro da janela, considerando TODAS as chaves ativas.
   *
   * A soma é o que faz a rotação não zerar limite: 3 falhas sob a chave antiga + 2 sob a nova são 5,
   * e bloqueiam. O `env` garante que os dois segredos são distintos, então as duas chaves nunca são
   * a mesma linha contada em dobro.
   */
  private async contarValidas(identificador: string): Promise<number> {
    const chaves = this.chavesAtivas(identificador);
    const inicioValido = new Date(Date.now() - JANELA_MS);

    const linhas = await this.prisma.$queryRaw<{ total: bigint | number | null }[]>`
      SELECT COALESCE(SUM("count"), 0) AS total FROM "LoginFailure"
      WHERE "key" = ANY(${chaves}::text[]) AND "windowStart" >= ${inicioValido}
    `;

    return Number(linhas[0]?.total ?? 0);
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

    // As chaves ANTERIORES (rotação em curso), que são somadas mas nunca incrementadas.
    const anteriores = this.chavesAtivas(identificador).slice(1);

    // **Uma instrução só.** O incremento vem do `RETURNING` do próprio `INSERT ... ON CONFLICT`, e a
    // soma da chave anterior é calculada no mesmo comando.
    //
    // A tentação era incrementar e depois reler o total num segundo `SELECT`. Isso reintroduziria a
    // corrida que este desenho existe para evitar: sob concorrência, as releituras acontecem todas
    // *depois* dos incrementos e devolvem o mesmo valor — cinco chamadas simultâneas veriam
    // `[1,2,5,5,5]` em vez de `[1,2,3,4,5]`. O contador do banco ficaria certo, mas a evidência de
    // que nenhuma contagem se perdeu iria embora, e com ela a capacidade de detectar uma regressão.
    const linhas = await this.prisma.$queryRaw<{ atual: number; anterior: bigint | number }[]>`
      WITH atual AS (
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
      )
      SELECT
        (SELECT "count" FROM atual) AS atual,
        COALESCE((
          SELECT SUM("count") FROM "LoginFailure"
          WHERE "key" = ANY(${anteriores}::text[]) AND "windowStart" >= ${inicioValido}
        ), 0) AS anterior
    `;

    const countAtual = linhas[0]?.atual ?? 1;
    const countAnterior = Number(linhas[0]?.anterior ?? 0);

    // O total que decide o bloqueio soma as falhas ainda válidas da chave anterior — senão a rotação
    // do segredo daria ao atacante um orçamento novo de 5 tentativas (D6).
    const count = countAtual + countAnterior;
    const bloqueado = count >= MAX_FALHAS;

    // O identificador NUNCA vai para o log — nem em claro, nem hasheado. A chave HMAC no log seria
    // um identificador estável de uma pessoa, o que a torna PII pseudonimizada: correlacionável, e
    // portanto sujeita à LGPD. O que o operador precisa saber é que houve falha e quantas.
    this.logger.warn(
      { event: 'auth.login.failed', count, countAtual, bloqueado },
      'falha de login registrada',
    );

    return { bloqueado, count };
  }

  /**
   * O identificador está bloqueado agora?
   *
   * Chamado ANTES de verificar a senha — senão a 6ª tentativa com a senha CERTA passaria, e o
   * limite não limitaria nada: bastaria ao atacante acertar na tentativa seguinte à quinta.
   */
  async estaBloqueado(identificador: string): Promise<boolean> {
    return (await this.contarValidas(identificador)) >= MAX_FALHAS;
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
    // TODAS as versões ativas. Limpar só a atual deixaria a contagem antiga viva: o usuário legítimo
    // acertaria a senha e continuaria bloqueado até a janela da chave anterior expirar.
    const chaves = this.chavesAtivas(identificador);
    await this.prisma.$executeRaw`DELETE FROM "LoginFailure" WHERE "key" = ANY(${chaves}::text[])`;
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

  /** As chaves que contam agora (atual + anterior, se houver rotação em curso). Usado em teste. */
  chavesDe(identificador: string): string[] {
    return this.chavesAtivas(identificador);
  }

  /** Igualdade em tempo constante — a comparação de chaves não deve virar um oráculo. */
  static chavesIguais(a: string, b: string): boolean {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  }
}
