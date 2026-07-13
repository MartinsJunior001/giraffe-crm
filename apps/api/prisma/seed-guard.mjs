// Guarda do seed de credenciais — a decisão de "pode semear aqui?", isolada para ser testável.
//
// O seed grava uma senha CONHECIDA (pública, no repositório) nas contas de fixture. Rodá-lo contra
// um banco real criaria contas com credencial pública. Esta função é a barreira, e ela é dupla:
//
// 1. `NODE_ENV=production` é recusado SEMPRE — sem exceção, sem opt-in. Barreira dura.
// 2. Quem decide o destino de fato é o HOST da URL. Só hosts locais passam por padrão; um host
//    não-local exige o opt-in explícito `ALLOW_NONLOCAL_DEV_SEED=true` (para Docker/CI), que **nunca**
//    vence a barreira 1.
//
// Lança `Error` com mensagem acionável e SEM segredo (só o hostname; nunca usuário, senha ou DSN).

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * @param {{ nodeEnv: string | undefined, url: string, allowNonLocal: boolean }} params
 * @returns {string} o hostname validado (para o chamador logar, se quiser — não é segredo)
 */
export function verificarDestinoSeed({ nodeEnv, url, allowNonLocal }) {
  if (nodeEnv === 'production') {
    throw new Error(
      'seed de credenciais é proibido em produção (NODE_ENV=production): ele grava uma senha ' +
        'conhecida. Não há opt-in que vença esta barreira.',
    );
  }

  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = '';
  }

  // IPv6 chega entre colchetes na URL (`[::1]`); `URL.hostname` já os remove, mas normalizamos por
  // garantia para a comparação com o Set.
  const hostNormalizado = host.replace(/^\[|\]$/g, '');

  if (!HOSTS_LOCAIS.has(hostNormalizado) && !allowNonLocal) {
    throw new Error(
      `seed de credenciais recusado: destino "${hostNormalizado}" não é local. ` +
        `Este script grava uma senha conhecida. Para Docker/CI, defina ALLOW_NONLOCAL_DEV_SEED=true ` +
        `— mas NUNCA com NODE_ENV=production.`,
    );
  }

  return hostNormalizado;
}
