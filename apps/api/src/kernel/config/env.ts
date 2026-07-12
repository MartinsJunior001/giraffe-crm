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
