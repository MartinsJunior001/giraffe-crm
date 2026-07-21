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

/**
 * Nomeia o que um status HTTP inesperado significa. Um `503` no `/ready` não é um erro
 * qualquer: é a API declarando, corretamente, que não alcança o banco. Sem esta linha,
 * quem depura vê "HTTP 503" e vai procurar bug na API — quando o serviço a consertar é o
 * PostgreSQL. O smoke continua FALHANDO; ele só para de mentir sobre a causa.
 */
function explainStatus(status) {
  if (status === 503) return ' — dependência indisponível (provavelmente o banco)';
  if (status === 404) return ' — rota inexistente (versão da API divergente?)';
  return '';
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
      console.log(
        `FAIL  ${name}  (${url}) -> HTTP ${res.status} (esperado 2xx)${explainStatus(res.status)}`,
      );
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

/**
 * Contrato de saúde: JSON com EXATAMENTE a chave `status`, valor `"ok"`.
 *
 * A checagem de chaves extras não é preciosismo: o payload de health é público e não pode
 * vazar versão, host, nome de banco ou env (AC2 da Story 1.1). Agora que o `/ready` consulta
 * o PostgreSQL, a tentação de "só devolver o detalhe do erro" fica a um commit de distância —
 * este assert é o que barra isso.
 */
async function expectStatusOk(res) {
  const body = await readJson(res);
  if (body?.status !== 'ok') {
    throw new BodyError(`esperado status "ok", recebido ${JSON.stringify(body?.status)}`);
  }

  const chaves = Object.keys(body ?? {});
  if (chaves.length !== 1) {
    throw new BodyError(`payload deve conter apenas "status"; veio: ${chaves.join(', ')}`);
  }
}

/**
 * Cabeçalhos de segurança da borda (TECH-S1 — finding S1 do veredito de staging).
 *
 * Esta é a única camada que prova o que interessa: que a **aplicação servida** emite os
 * cabeçalhos. O teste de unidade prova a política; só uma resposta HTTP real prova que o servidor
 * a aplica. No CI isso roda no job `containers`, contra a imagem de produção (`next start`,
 * `NODE_ENV=production`) — o runtime semelhante à produção que o gate exige.
 *
 * A CSP é exigida em modo **enforcing**: `Content-Security-Policy-Report-Only` não bloqueia nada e,
 * se fosse o que estivesse no ar, o veredito honesto seria `S1_PARTIAL_REQUIRES_ENFORCING_CSP`.
 */
async function expectCabecalhosDeSeguranca(res) {
  const exigidos = {
    'content-security-policy': /object-src 'none'/,
    'x-content-type-options': /^nosniff$/,
    'x-frame-options': /^DENY$/,
    'referrer-policy': /strict-origin-when-cross-origin/,
    'permissions-policy': /camera=\(\)/,
  };

  for (const [nome, formato] of Object.entries(exigidos)) {
    const valor = res.headers.get(nome);
    if (valor === null) throw new BodyError(`cabeçalho ausente: ${nome}`);
    if (!formato.test(valor)) throw new BodyError(`${nome} com valor inesperado: ${valor}`);
  }

  // Report-Only como estado final = S1 NÃO resolvido.
  if (res.headers.get('content-security-policy-report-only') !== null) {
    throw new BodyError('CSP em Report-Only — o finding S1 exige enforcing');
  }

  const csp = res.headers.get('content-security-policy');
  if (!/'nonce-[A-Za-z0-9+/=]+'/.test(csp)) throw new BodyError('CSP sem nonce por requisição');
  if (csp.includes('unsafe-eval')) throw new BodyError("CSP de produção com 'unsafe-eval'");

  // O item nomeado pelo finding: o framework não se anuncia.
  const powered = res.headers.get('x-powered-by');
  if (powered !== null) throw new BodyError(`X-Powered-By exposto: ${powered}`);

  // HSTS só é exigível — e só é honrado pelo browser — sobre HTTPS. Num alvo HTTP (CI local,
  // container sem TLS) cobrar HSTS seria exigir prova que o próprio protocolo descarta; num alvo
  // HTTPS (staging atrás do Traefik), a ausência é falha real.
  if (WEB_URL.startsWith('https://')) {
    const hsts = res.headers.get('strict-transport-security');
    if (hsts === null) throw new BodyError('resposta HTTPS sem Strict-Transport-Security');
    if (!/max-age=\d+/.test(hsts)) throw new BodyError(`HSTS malformado: ${hsts}`);
  }
}

const results = [];
results.push(await check('API /health', `${API_URL}/health`, expectStatusOk));
results.push(await check('API /ready', `${API_URL}/ready`, expectStatusOk));
results.push(await check('WEB /healthz', `${WEB_URL}/healthz`, expectStatusOk));
// A casca é a experiência real do usuário: basta responder 2xx (o corpo é HTML).
results.push(await check('WEB /', `${WEB_URL}/`, async () => {}));
// Borda: os cabeçalhos de segurança na resposta REAL da aplicação servida (TECH-S1).
results.push(
  await check('WEB / cabeçalhos de segurança', `${WEB_URL}/`, expectCabecalhosDeSeguranca),
);
results.push(
  await check(
    'WEB /login cabeçalhos de segurança',
    `${WEB_URL}/login`,
    expectCabecalhosDeSeguranca,
  ),
);

const allOk = results.every(Boolean);
console.log(
  `\nSmoke: ${allOk ? 'OK' : 'FALHOU'} (${results.filter(Boolean).length}/${results.length})`,
);
// Não usar process.exit() síncrono (dispara assertion do libuv no Windows ao encerrar
// com handles ativos). Define o código e deixa o event loop drenar naturalmente.
process.exitCode = allOk ? 0 : 1;
