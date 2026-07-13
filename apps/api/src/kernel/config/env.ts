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

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().max(65535).default(3001),
  // Obrigatória, sem default: ausência dispara fail-fast. Deve conter ≥1 origem
  // real após o parse (evita valores como " , " que passariam num min(1) ingênuo).
  CORS_ALLOWED_ORIGINS: z
    .string()
    .min(1, 'CORS_ALLOWED_ORIGINS é obrigatória (sem wildcard em produção)')
    .refine((v) => parseCorsOrigins(v).length > 0, {
      message: 'CORS_ALLOWED_ORIGINS deve conter ao menos uma origem válida',
    }),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
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
   * IPs/CIDRs dos PROXIES confiáveis. **Vazio por padrão** — e isso é a decisão, não um
   * esquecimento.
   *
   * Confiar em `X-Forwarded-For` sem saber quem o escreveu é o mesmo que não ter limite por IP: o
   * atacante forja o header e cada requisição chega de um "IP" novo. Sem proxy confiável
   * configurado, o IP vem do **socket** — que ninguém pode forjar.
   *
   * Nunca coloque aqui uma faixa privada ampla (`10.0.0.0/8`): isso significa que qualquer coisa
   * dentro da rede pode forjar IP. São os endereços dos SEUS proxies, e só.
   */
  TRUSTED_PROXY_IPS: z.string().default(''),
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
