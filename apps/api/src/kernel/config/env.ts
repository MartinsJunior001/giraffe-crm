import { isIP } from 'node:net';
import { z } from 'zod';

/**
 * Erro de configuração — falha honesta (fail-fast). A mensagem lista apenas
 * NOMES de variáveis e mensagens de validação; NUNCA os valores fornecidos
 * (evita vazar segredo em log/stderr) — AD-29/AD-31/NFR-1.
 */
export class ConfigValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      'Configuração inválida — variáveis obrigatórias ausentes ou incorretas:\n- ' +
        issues.join('\n- '),
    );
    this.name = 'ConfigValidationError';
  }
}

/**
 * Valida o formato da URL de banco sem nunca ecoar o valor (ela contém senha).
 * Deliberadamente NÃO existe `MIGRATION_DATABASE_URL` neste schema: o processo de
 * runtime não deve sequer possuir a credencial do papel dono do schema (AD-6).
 */
function isPostgresUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'postgresql:' || protocol === 'postgres:';
  } catch {
    return false;
  }
}

/**
 * Trata **variável vazia como ausente**.
 *
 * `LOGIN_HMAC_PREVIOUS_SECRET=` (sem valor) é o estado normal fora de uma rotação — é assim que ela
 * aparece no `.env.example` e é assim que o Compose a repassa quando não está definida. Sem isto, a
 * string vazia seria um valor *presente* e reprovaria no `min(32)`: quem copiasse o `.env.example`
 * não conseguiria subir a API, e a mensagem falaria de um segredo curto demais que ele nunca definiu.
 */
function vazioComoAusente<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === '' ? undefined : v), schema);
}

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().max(65535).default(3001),
    // Obrigatória, sem default: ausência dispara fail-fast. Deve conter ≥1 origem
    // real após o parse (evita valores como " , " que passariam num min(1) ingênuo).
    CORS_ALLOWED_ORIGINS: z
      .string()
      .min(1, 'CORS_ALLOWED_ORIGINS é obrigatória (sem wildcard em produção)')
      .refine((v) => parseCorsOrigins(v).length > 0, {
        message: 'CORS_ALLOWED_ORIGINS deve conter ao menos uma origem válida',
      })
      // Curingas são recusados — e não só o `*` isolado. Esta variável alimenta o CORS **e** o
      // `trustedOrigins` do Better Auth (CSRF), e o `wildcardMatch` dele trata QUALQUER entrada com
      // `*` ou `?` como padrão: `*.dominio.com` e `http://*` casariam qualquer subdomínio/origem. O
      // `cors` do Express compara por igualdade exata (lá o curinga é inócuo), mas o CSRF do Better
      // Auth o honra — a proteção ficaria a uma variável de ambiente de ser anulada, sem alarme.
      // O invariante é "sem wildcard"; qualquer curinga (não apenas `*` puro) falha no boot.
      // Um origin legítimo (`esquema://host[:porta]`) nunca contém `*` nem `?`.
      .refine((v) => !parseCorsOrigins(v).some((o) => o.includes('*') || o.includes('?')), {
        message:
          'CORS_ALLOWED_ORIGINS não pode conter curingas ("*"/"?") — alimenta o CORS e o trustedOrigins/CSRF do Better Auth',
      }),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    // Papel de RUNTIME: sem BYPASSRLS, não proprietário das tabelas (AD-6). Obrigatória.
    // A mensagem de erro cita apenas o NOME da variável — a URL carrega senha e nunca
    // pode vazar para log/stderr (AD-29/AD-31).
    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL é obrigatória (papel de runtime da aplicação)')
      .refine(isPostgresUrl, {
        message: 'DATABASE_URL deve ser uma URL PostgreSQL válida',
      }),

    // ── Story 1.4 — autenticação e antiabuso ────────────────────────────────────────────────

    /** Segredo do Better Auth (assinatura de sessão). Obrigatório, sem default. */
    BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET deve ter ao menos 32 caracteres'),

    /** URL pública da API, usada pelo Better Auth para cookies e callbacks. */
    BETTER_AUTH_URL: z.string().url('BETTER_AUTH_URL deve ser uma URL válida'),

    /**
     * Segredo do HMAC que deriva a chave do contador de falhas (G1).
     *
     * Existe para que o e-mail NUNCA seja gravado em claro na tabela de contadores: em claro, ele
     * criaria um segundo cadastro de e-mails fora do `Account`, e um dump dessa tabela seria uma
     * lista de usuários. Separado do `BETTER_AUTH_SECRET` de propósito — comprometer um não deve
     * entregar o outro, e eles têm ciclos de rotação diferentes.
     */
    LOGIN_HMAC_SECRET: z.string().min(32, 'LOGIN_HMAC_SECRET deve ter ao menos 32 caracteres'),

    /**
     * Versão do segredo do HMAC (D6). Rotacionar o segredo muda TODAS as chaves derivadas — e um
     * atacante em curso teria o contador zerado exatamente no momento da rotação, sem que ninguém
     * percebesse. Versionar torna a queda de contadores explicável em vez de silenciosa.
     */
    LOGIN_HMAC_KEY_VERSION: z.coerce.number().int().positive().default(1),

    /**
     * Segredo ANTERIOR, durante a janela de sobreposição da rotação (D6). Opcional.
     *
     * Sem ele, trocar o segredo mudaria todas as chaves derivadas de uma vez, e os contadores de quem
     * está sob ataque **agora** ficariam órfãos: o atacante ganharia 5 tentativas novas de graça, no
     * exato instante da rotação. Com ele, as falhas registradas sob a chave antiga continuam **sendo
     * contadas** até a janela delas expirar.
     *
     * Deve ser removido só depois de decorrida a maior janela relevante (ver `docs/.../rotacao-hmac`).
     */
    LOGIN_HMAC_PREVIOUS_SECRET: vazioComoAusente(
      z.string().min(32, 'LOGIN_HMAC_PREVIOUS_SECRET deve ter ao menos 32 caracteres').optional(),
    ),

    /** Versão do segredo anterior. Obrigatória quando há segredo anterior. */
    LOGIN_HMAC_PREVIOUS_KEY_VERSION: vazioComoAusente(
      z.coerce.number().int().positive().optional(),
    ),

    /**
     * IPs dos PROXIES confiáveis, separados por vírgula. **Vazio por padrão** — e isso é a decisão,
     * não um esquecimento.
     *
     * Só o endereço de um peer listado aqui autoriza a leitura do `X-Forwarded-For`. Para todos os
     * demais, o IP é o do **socket**, e o header é ignorado — quem fala direto com a aplicação não tem
     * autoridade para declarar quem é. Ver `kernel/auth/client-ip.ts`, que implementa a regra (o
     * Better Auth sozinho **não** faz isso: ele confia num `X-Forwarded-For` de valor único).
     *
     * Endereços **exatos**, não faixas. Nunca uma faixa privada ampla (`10.0.0.0/8`) "porque o proxy
     * está na rede interna": isso declararia confiável qualquer contêiner da rede, inclusive um
     * comprometido. Os endereços do proxy do Coolify entram quando forem verificados contra o ambiente
     * real (gate de staging), não por suposição.
     *
     * Faixas CIDR **não** são suportadas nesta Story (débito D-02): entradas com `/` são recusadas no
     * boot, para não dar a impressão de que uma faixa funciona quando a comparação é por igualdade.
     */
    TRUSTED_PROXY_IPS: z.string().default(''),

    /**
     * Opt-in para rodar em produção **sem** proxy confiável (exposição direta). Fail-closed.
     *
     * Em produção, `TRUSTED_PROXY_IPS` vazio ATRÁS de um proxy reverso faz o IP de toda requisição
     * virar o do proxy — e o G2 (por IP) colapsa num balde único: um DoS de login em escala de
     * plataforma. Por isso, em produção, a lista vazia **falha no boot** — a menos que o operador
     * declare explicitamente que a exposição é direta (sem proxy), assumindo que o IP virá do socket.
     * Sem este opt-in, ninguém sobe em produção com o footgun ligado por esquecimento.
     */
    ALLOW_DIRECT_EXPOSURE: z
      .string()
      .optional()
      .transform((v) => v === 'true'),

    // ── Story 2.4 — capacidade de arquivos (gate do Campo Arquivo, AD-27/AD-28) ──────────────

    /**
     * Capacidade de UPLOAD de arquivos. **Desabilitada por padrão** — fail-closed (AD-28).
     *
     * O tipo de Campo `FILE` existe no catálogo canônico, mas o armazenamento de arquivos é do Épico 3.
     * Enquanto esta flag for falsa, um Formulário com Campo `FILE` ativo **não pode ser publicado** (a
     * publicação é da Story 2.6, que consome a regra `podePublicarComArquivo`). O default falso garante que
     * ninguém habilite a capacidade por esquecimento: habilitar exige ação explícita, quando o storage do E3
     * existir. Só `'true'` liga; qualquer outro valor (inclusive ausência) mantém desligado.
     */
    FILE_UPLOAD_ENABLED: z
      .string()
      .optional()
      .transform((v) => v === 'true'),

    // ── Story 3.7 — capacidade compartilhada de arquivos (storage/antivírus/limites) ─────────
    // Estes serviços (MinIO/ClamAV) existem só em dev/CI (AD-32). Com o gate desligado (default),
    // são opcionais e a capacidade fica indisponível de forma honesta. Ligá-lo EXIGE storage
    // configurado — a coerência é imposta no `.superRefine` fail-closed abaixo.

    /** Endpoint do storage S3-compatível (ex.: MinIO `http://127.0.0.1:9000`). Vazio = ausente. */
    STORAGE_ENDPOINT: vazioComoAusente(
      z.string().url('STORAGE_ENDPOINT deve ser uma URL válida').optional(),
    ),
    /** Região do storage (S3 exige uma; irrelevante no MinIO, mas o SDK a requer). */
    STORAGE_REGION: z.string().default('us-east-1'),
    /** Bucket privado dos arquivos. */
    STORAGE_BUCKET: z.string().default('giraffe-files'),
    /** Credencial de acesso do storage (dev/CI). Segredo — nunca em log/health. Vazio = ausente. */
    STORAGE_ACCESS_KEY: vazioComoAusente(z.string().optional()),
    /** Credencial secreta do storage (dev/CI). Segredo — nunca em log/health. Vazio = ausente. */
    STORAGE_SECRET_KEY: vazioComoAusente(z.string().optional()),
    /** MinIO exige path-style (bucket no path, não no host). Só `'false'` desliga; default liga. */
    STORAGE_FORCE_PATH_STYLE: z
      .string()
      .optional()
      .transform((v) => v !== 'false'),

    /** Host do clamd (TCP). Dev/CI. */
    CLAMAV_HOST: z.string().default('127.0.0.1'),
    /** Porta do clamd (padrão 3310). */
    CLAMAV_PORT: z.coerce.number().int().positive().max(65535).default(3310),
    /**
     * Idade máxima da base de assinaturas do ClamAV (horas). Base mais velha que isto ⇒ o veredito
     * é RECUSADO (fail-closed): um scanner com base velha é um scanner cego. Default conservador.
     */
    CLAMAV_DB_MAX_AGE_HOURS: z.coerce.number().int().positive().default(48),
    /**
     * Timeout (ms) do scan do clamd. O TTL do slot (`SCAN_SLOT_TTL_SECONDS`) DEVE ser maior que isto, ou um slot
     * ainda em uso expiraria durante o scan e outra requisição entraria acima do teto — coerência no superRefine.
     */
    CLAMAV_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

    /**
     * Tamanho máximo por arquivo (bytes). Limita também o buffer de upload (DoS). Default 10 MiB. O teto (50 MiB)
     * casa com a barreira dura do multer (`MULTER_MAX_BYTES`); acima disso o limite "configurável" seria capado
     * silenciosamente pelo multer.
     */
    FILE_MAX_BYTES: z.coerce.number().int().positive().max(52_428_800).default(10_485_760),
    /** Contagem máxima de arquivos por recurso (Q1 = 10). Validado por faixa, fail-closed. */
    FILE_MAX_PER_RESOURCE: z.coerce.number().int().positive().max(1000).default(10),
    /** Teto de verificações concorrentes por Organização (semáforo `ScanSlot`). Fail-closed no teto (429). */
    SCAN_MAX_CONCURRENT_PER_ORG: z.coerce.number().int().positive().max(100).default(3),
    /** TTL do slot de verificação (segundos) — auto-liberação de slot órfão. */
    SCAN_SLOT_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  })
  /**
   * Coerência do proxy confiável (D5). Fail-fast no boot para configurações que só falhariam — em
   * silêncio — sob tráfego real.
   */
  .superRefine((env, ctx) => {
    const entradas = env.TRUSTED_PROXY_IPS.split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const entrada of entradas) {
      if (entrada === '*') {
        ctx.addIssue({ code: 'custom', message: 'TRUSTED_PROXY_IPS não pode conter "*"' });
        continue;
      }
      // CIDR (`/`) fica para D-02. Recusar em vez de aceitar-e-ignorar: uma faixa que não funciona é
      // pior que um erro, porque parece uma defesa.
      if (entrada.includes('/')) {
        ctx.addIssue({
          code: 'custom',
          message: `TRUSTED_PROXY_IPS não suporta CIDR nesta versão ("${entrada}") — use IPs exatos (débito D-02)`,
        });
        continue;
      }
      if (isIP(entrada) === 0) {
        ctx.addIssue({
          code: 'custom',
          message: `TRUSTED_PROXY_IPS contém entrada que não é um IP válido: "${entrada}"`,
        });
      }
    }

    // Fail-closed em produção: sem proxy confiável E sem declarar exposição direta = não sobe.
    if (env.NODE_ENV === 'production' && entradas.length === 0 && !env.ALLOW_DIRECT_EXPOSURE) {
      ctx.addIssue({
        code: 'custom',
        message:
          'em produção, defina TRUSTED_PROXY_IPS (IPs do proxy) ou ALLOW_DIRECT_EXPOSURE=true ' +
          '(exposição direta, sem proxy) — a lista vazia atrás de um proxy colapsa o G2 num balde único',
      });
    }
  })
  /**
   * Coerência da rotação do HMAC (D6). Uma rotação mal configurada falha **no boot**, não em silêncio
   * na primeira tentativa de login.
   *
   * As mensagens citam apenas NOMES de variáveis — nunca valores, que aqui são segredos.
   */
  .superRefine((env, ctx) => {
    const temSegredo = env.LOGIN_HMAC_PREVIOUS_SECRET !== undefined;
    const temVersao = env.LOGIN_HMAC_PREVIOUS_KEY_VERSION !== undefined;

    // Meia rotação é pior que nenhuma: a chave antiga seria derivada sem versão que a explique, ou a
    // versão apontaria para um segredo que não existe.
    if (temSegredo !== temVersao) {
      ctx.addIssue({
        code: 'custom',
        message:
          'LOGIN_HMAC_PREVIOUS_SECRET e LOGIN_HMAC_PREVIOUS_KEY_VERSION devem ser definidas juntas',
      });
    }

    if (!temSegredo) return;

    // Segredo anterior IGUAL ao atual derivaria a MESMA chave — e o contador daquela linha seria
    // somado duas vezes. O usuário seria bloqueado com 3 falhas em vez de 5, e ninguém entenderia
    // por quê.
    if (env.LOGIN_HMAC_PREVIOUS_SECRET === env.LOGIN_HMAC_SECRET) {
      ctx.addIssue({
        code: 'custom',
        message:
          'LOGIN_HMAC_PREVIOUS_SECRET não pode ser igual a LOGIN_HMAC_SECRET (a mesma chave seria contada duas vezes)',
      });
    }

    if (env.LOGIN_HMAC_PREVIOUS_KEY_VERSION === env.LOGIN_HMAC_KEY_VERSION) {
      ctx.addIssue({
        code: 'custom',
        message:
          'LOGIN_HMAC_PREVIOUS_KEY_VERSION não pode ser igual a LOGIN_HMAC_KEY_VERSION (a rotação ficaria irrastreável)',
      });
    }
  })
  /**
   * Coerência do gate de arquivos (3.7, AD-28). Ligar `FILE_UPLOAD_ENABLED` sem storage configurado
   * é a receita de uma capacidade "ligada" que aceita upload e não tem onde guardar — falha opaca na
   * 1ª requisição. Fail-closed: com o gate ON, o storage é obrigatório e a API não sobe sem ele.
   *
   * As mensagens citam apenas NOMES de variáveis — as credenciais nunca podem vazar para log/stderr.
   */
  .superRefine((env, ctx) => {
    if (!env.FILE_UPLOAD_ENABLED) return;

    const faltando = (
      [
        ['STORAGE_ENDPOINT', env.STORAGE_ENDPOINT],
        ['STORAGE_ACCESS_KEY', env.STORAGE_ACCESS_KEY],
        ['STORAGE_SECRET_KEY', env.STORAGE_SECRET_KEY],
        ['STORAGE_BUCKET', env.STORAGE_BUCKET],
      ] as const
    )
      .filter(([, v]) => v === undefined || v === '')
      .map(([nome]) => nome);

    if (faltando.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message:
          'FILE_UPLOAD_ENABLED=true exige storage configurado — variáveis ausentes: ' +
          faltando.join(', ') +
          ' (a capacidade não pode ligar sem onde guardar o binário — fail-closed AD-28)',
      });
    }

    // O slot do semáforo é segurado durante o scan SÍNCRONO. Se o TTL expirar antes do scan terminar, o slot é
    // coletado e outra requisição entra ACIMA do teto de concorrência. Exige margem sobre o timeout do clamd.
    if (env.SCAN_SLOT_TTL_SECONDS * 1000 <= env.CLAMAV_TIMEOUT_MS) {
      ctx.addIssue({
        code: 'custom',
        message:
          'SCAN_SLOT_TTL_SECONDS (em ms) deve ser MAIOR que CLAMAV_TIMEOUT_MS — senão um slot em uso expira ' +
          'durante o scan e a concorrência ultrapassa SCAN_MAX_CONCURRENT_PER_ORG',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** Valida o ambiente de forma pura. Lança `ConfigValidationError` se inválido. */
export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new ConfigValidationError(issues);
  }
  return parsed.data;
}

/**
 * Retorna o ambiente validado a partir de `process.env`. Fail-fast: lança se inválido.
 *
 * Sem memoização — a validação é barata (roda 2x no boot: fail-fast no `main.ts` e no
 * factory do logger) e um cache em variável de módulo seria estado global mutável, que
 * faria testes na mesma execução herdarem silenciosamente o ambiente de um teste anterior.
 * O parsing puro é `loadEnv(env)`, testável com quantas configurações forem necessárias.
 */
export function getEnv(): Env {
  return loadEnv(process.env);
}

/**
 * Converte CORS_ALLOWED_ORIGINS em lista limpa de origens, normalizando a barra
 * final (o `cors` do Express compara a Origin por igualdade exata, e o browser
 * nunca envia barra final no header Origin).
 */
export function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}
