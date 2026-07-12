// Smoke integrado do esqueleto (Story 1.1). Verifica endpoints de um ambiente já em execução
// (via `pnpm dev` ou `docker compose up`). Não sobe serviços; não depende de banco/Redis/domínio.
// Uso: API_URL=http://localhost:3001 WEB_URL=http://localhost:3000 node scripts/smoke.mjs

const API_URL = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
const WEB_URL = (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const rawTimeout = Number(process.env.SMOKE_TIMEOUT_MS);
const TIMEOUT_MS = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 3000;

/** Falha de contrato: a resposta chegou, mas o corpo não é o esperado. */
class BodyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BodyError';
  }
}

/**
 * Traduz um erro em causa acionável. Um diagnóstico honesto importa: chamar tudo de
 * "sem conexão" manda quem depura caçar rede quando o problema é o payload.
 * Só a mensagem — nunca a stack, que pode carregar caminhos internos.
 */
function diagnose(err) {
  if (err?.name === 'AbortError') return `timeout após ${TIMEOUT_MS}ms`;
  if (err instanceof BodyError) return `corpo inválido: ${err.message}`;
  if (err instanceof SyntaxError) return 'corpo inválido: resposta não é JSON';
  // fetch() rejeita com TypeError quando não conseguiu falar com o servidor.
  if (err instanceof TypeError) return 'sem conexão (host inalcançável ou recusado)';
  return `erro inesperado: ${err?.name ?? 'Error'} — ${err?.message ?? 'sem detalhe'}`;
}

/** Lê o corpo como JSON, transformando resposta não-JSON em falha de contrato explícita. */
async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new SyntaxError('resposta não é JSON');
  }
}

/**
 * `validate` recebe a resposta e lança (BodyError/SyntaxError) se o contrato não bater.
 * Retornar normalmente significa sucesso.
 */
async function check(name, url, validate) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      // Drena para liberar o socket keep-alive e o processo encerrar limpo.
      await res.body?.cancel().catch(() => {});
      console.log(`FAIL  ${name}  (${url}) -> HTTP ${res.status} (esperado 2xx)`);
      return false;
    }

    await validate(res);

    if (res.body && !res.bodyUsed) {
      await res.body.cancel().catch(() => {});
    }
    console.log(`PASS  ${name}  (${url}) -> HTTP ${res.status}`);
    return true;
  } catch (err) {
    console.log(`FAIL  ${name}  (${url}) -> ${diagnose(err)}`);
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** Contrato de saúde: JSON exatamente `{ status: "ok" }`. */
async function expectStatusOk(res) {
  const body = await readJson(res);
  if (body?.status !== 'ok') {
    throw new BodyError(`esperado status "ok", recebido ${JSON.stringify(body?.status)}`);
  }
}

const results = [];
results.push(await check('API /health', `${API_URL}/health`, expectStatusOk));
results.push(await check('API /ready', `${API_URL}/ready`, expectStatusOk));
results.push(await check('WEB /healthz', `${WEB_URL}/healthz`, expectStatusOk));
// A casca é a experiência real do usuário: basta responder 2xx (o corpo é HTML).
results.push(await check('WEB /', `${WEB_URL}/`, async () => {}));

const allOk = results.every(Boolean);
console.log(
  `\nSmoke: ${allOk ? 'OK' : 'FALHOU'} (${results.filter(Boolean).length}/${results.length})`,
);
// Não usar process.exit() síncrono (dispara assertion do libuv no Windows ao encerrar
// com handles ativos). Define o código e deixa o event loop drenar naturalmente.
process.exitCode = allOk ? 0 : 1;
