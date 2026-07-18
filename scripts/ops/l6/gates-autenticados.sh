#!/usr/bin/env bash
#
# gates-autenticados.sh — Gates de APLICAÇÃO (autenticados) da Fase B, contra a INSTÂNCIA REAL do
# staging (API privada, banco real, Admin real). Prova, POR DENTRO da rede (loopback do container da
# API), o comportamento de segurança que a suíte automatizada cobre em CI, mas aqui na instância
# provisionada de verdade:
#   1. login válido → 200 + cookie de sessão; a sessão vira identidade (rota de domínio deixa de 401);
#   2. CSRF: Origin FORJADA é recusada antes de autenticar; Origin válida passa da checagem;
#   3. cross-tenant: x-org-id de Organização alheia/inexistente → 403 NÃO-enumerante;
#   4. rate limit G1 por IDENTIFICADOR usando e-mail INEXISTENTE (5 falhas → 6ª = 429), sem tocar o Admin;
#   5. X-Forwarded-For forjado/inválido é ignorado (401, não 500);
#   6. logout revoga a sessão (o cookie antigo volta a 401).
#
# SEGREDO: a senha é capturada por `read -s` (não ecoa) e entregue ao Node do container por variável
# de AMBIENTE herdada (`docker exec -e NOME`, sem valor no argv) — jamais em argumento, arquivo, log ou
# saída. O script NÃO imprime senha, cookie, token, DSN nem PII (só status HTTP e nomes de caso).
#
# READ-ONLY do ponto de vista de dados do titular: só exercita login/logout/leitura; as escritas são
# apenas contadores de antiabuso (RateLimit/Loginfailure, globais, expiram em 15 min), com e-mails
# SINTÉTICOS descartáveis — a conta do Admin não é bloqueada.
#
# Uso (no host do Coolify):
#   bash scripts/ops/l6/gates-autenticados.sh        # pede e-mail e senha do Admin interativamente
#
set -uo pipefail

PROJ_AUTORIZADO="enl623bli2h2ub5kmu4ygktd"
PROJ="${PROJ:-${PROJ_AUTORIZADO}}"
stop() { echo "STOP: $*" >&2; exit 2; }
[ "${PROJ}" = "${PROJ_AUTORIZADO}" ] || stop "PROJ='${PROJ}' != UUID autorizado — fora do escopo."

mapfile -t APIS < <(docker ps -q \
  --filter "label=com.docker.compose.project=${PROJ}" \
  --filter "label=com.docker.compose.service=api" 2>/dev/null)
[ "${#APIS[@]}" -eq 1 ] || stop "esperado EXATAMENTE 1 container 'api' RUNNING do projeto ${PROJ}; encontrados ${#APIS[@]}."
CT_API="${APIS[0]}"

# Credenciais do Admin — capturadas AQUI. read -s não ecoa a senha; nada vai a argv/arquivo/histórico.
# (Em regressão automatizada, e-mail e senha chegam por stdin — pipe —, consumidos por estes read.)
read -rp  "E-mail do Admin (staging): " ADMIN_EMAIL
read -rsp "Senha do Admin (não ecoa):  " ADMIN_PW; echo
[ -n "${ADMIN_EMAIL}" ] && [ -n "${ADMIN_PW}" ] || stop "e-mail e senha do Admin são obrigatórios."
export ADMIN_EMAIL ADMIN_PW

echo "== Gates autenticados — instância real (API privada, loopback interno) =="

# O corpo de teste roda no Node do PRÓPRIO container da API (fetch/crypto nativos); credenciais vêm
# por -e NOME (valor herdado do ambiente, nunca no argv). O heredoc é o stdin do docker exec.
set +e
docker exec -i -e ADMIN_EMAIL -e ADMIN_PW "${CT_API}" node --input-type=module - <<'NODE'
const BASE = 'http://127.0.0.1:3001';
const { randomUUID } = await import('node:crypto');
const cors = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const ORIGIN = cors[0] || 'http://localhost:3000';
const email = process.env.ADMIN_EMAIL;
const pw = process.env.ADMIN_PW;

let falhas = 0;
const ok = (m) => console.log('  ok: ' + m);
const bad = (m) => { console.log('  FALHA: ' + m); falhas++; };
const sintetico = () => `gate-${randomUUID()}@descartavel.invalid`;

function login(e, p, extra = {}) {
  return fetch(`${BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...extra },
    body: JSON.stringify({ email: e, password: p }),
  });
}
const cookieDe = (res) => (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

// 1. login válido do Admin → 200 + cookie de sessão.
const rL = await login(email, pw);
const cookie = cookieDe(rL);
if (rL.status === 200 && /session/i.test(cookie)) ok('login do Admin → 200 + cookie de sessão');
else bad(`login do Admin → HTTP ${rL.status} (cookie de sessão presente? ${/session/i.test(cookie)})`);

// 2. a sessão vira IDENTIDADE: sem cookie 401; com cookie 200.
const rNo = await fetch(`${BASE}/organizations/current`);
rNo.status === 401 ? ok('rota de domínio SEM cookie → 401') : bad(`rota de domínio sem cookie → ${rNo.status} (esperado 401)`);
const rYes = await fetch(`${BASE}/organizations/current`, { headers: { cookie } });
rYes.status === 200 ? ok('rota de domínio COM cookie → 200 (a sessão é identidade)') : bad(`rota de domínio com cookie → ${rYes.status} (esperado 200)`);

// 3. cross-tenant: x-org-id de Organização alheia/inexistente → 403 não-enumerante.
const rX = await fetch(`${BASE}/organizations/current`, { headers: { cookie, 'x-org-id': randomUUID() } });
if (rX.status === 403) {
  const corpo = (await rX.text()).toLowerCase();
  /not found|não encontrad|does not exist|no such/.test(corpo)
    ? bad('cross-tenant deu 403 mas o corpo ENUMERA a existência da Org')
    : ok('cross-tenant (x-org-id alheio) → 403 não-enumerante');
} else bad(`cross-tenant (x-org-id alheio) → ${rX.status} (esperado 403)`);

// 4. CSRF: Origin forjada é recusada ANTES de autenticar; Origin válida passa da checagem.
const rForj = await login(sintetico(), 'senha-errada', { origin: 'https://origem-forjada.invalid' });
rForj.status === 403 ? ok('CSRF: Origin FORJADA → 403 (recusada antes de autenticar)') : bad(`CSRF: Origin forjada → ${rForj.status} (esperado 403)`);
const rCtrl = await login(sintetico(), 'senha-errada'); // Origin válida (default) + credencial inválida
rCtrl.status === 401 ? ok('CSRF: Origin VÁLIDA + credencial inválida → 401 (passou da checagem de origem)') : bad(`CSRF controle (Origin válida) → ${rCtrl.status} (esperado 401)`);

// 5. rate limit G1 por identificador — e-mail INEXISTENTE, jamais o Admin.
const alvo = sintetico();
const MAX_FALHAS = 5;
let g1ok = true;
for (let i = 0; i < MAX_FALHAS; i++) {
  const r = await login(alvo, 'senha-errada');
  if (r.status !== 401) { bad(`G1 tentativa ${i + 1} → ${r.status} (esperado 401 antes do corte)`); g1ok = false; break; }
}
if (g1ok) {
  const r6 = await login(alvo, 'senha-errada');
  (r6.status === 429 && r6.headers.get('x-retry-after'))
    ? ok(`G1: ${MAX_FALHAS} falhas do mesmo identificador → 6ª = 429 (+X-Retry-After), Admin intocado`)
    : bad(`G1: 6ª tentativa → ${r6.status} (esperado 429 com X-Retry-After)`);
}

// 6. X-Forwarded-For forjado/inválido: ignorado, sem 500.
const rXff = await login(sintetico(), 'senha-errada', { 'x-forwarded-for': 'nao-e-ip, ,,, 999.999.999.999' });
rXff.status === 401 ? ok('X-Forwarded-For forjado/inválido → 401 (ignorado, não 500)') : bad(`XFF forjado → ${rXff.status} (esperado 401, não 500)`);

// 7. logout revoga a sessão: o cookie antigo volta a 401.
const rOut = await fetch(`${BASE}/api/auth/sign-out`, { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: ORIGIN }, body: '{}' });
const rPost = await fetch(`${BASE}/organizations/current`, { headers: { cookie } });
((rOut.status === 200 || rOut.status === 204) && rPost.status === 401)
  ? ok('logout → sessão revogada (o cookie antigo volta a 401)')
  : bad(`logout → sign-out ${rOut.status}, rota protegida pós-logout ${rPost.status} (esperado 200/204 e 401)`);

console.log(`\n  resumo: ${falhas === 0 ? 'todos os casos passaram' : falhas + ' falha(s)'}`);
process.exit(falhas === 0 ? 0 : 1);
NODE
rc=$?
set -e
unset ADMIN_PW ADMIN_EMAIL

echo
if [ "${rc}" -eq 0 ]; then
  echo "GATES_AUTH_OK"
  exit 0
else
  echo "GATES_AUTH_FALHOU (rc=${rc})" >&2
  exit 1
fi
