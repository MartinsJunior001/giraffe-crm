import { SENHAS_COMUNS } from './senhas-comuns';

/**
 * Política de senha — validador ÚNICO e centralizado (D-1).
 *
 * É o núcleo **puro** (sem I/O, sem estado, sem dependência de runtime externo) consumido por TODO
 * fluxo que define ou altera senha (hoje: a troca autenticada da Story 1.12; amanhã: recuperação
 * 1.10 e onboarding). D-1 é explícita: "validador centralizado nos fluxos de definição/alteração,
 * sem duplicar". Uma segunda cópia divergiria — e a que ninguém revisa aceitaria a senha fraca.
 *
 * A política, tal como ratificada em D-1:
 *  - mínimo **15**, máximo **128** caracteres;
 *  - **sem** exigência de mistura de classes (maiúscula/número/símbolo) — o comprimento é a defesa,
 *    e regras de composição empurram o usuário para padrões previsíveis (`Senha@2024`);
 *  - **permite frases-senha e espaços** — o espaço é um caractere como outro qualquer, e frases
 *    longas são justamente o que se quer incentivar;
 *  - **rejeita senha comum/comprometida** por mecanismo local/determinístico (`SENHAS_COMUNS`);
 *  - **sem** troca periódica e **sem** invalidar senhas já existentes só por esta adoção — isso é
 *    responsabilidade dos fluxos que consomem o validador, não do validador.
 *
 * NUNCA registra, ecoa ou serializa a senha: devolve apenas um veredito tipado.
 */

/** Piso de comprimento (D-1). Frases-senha curtas caem aqui. */
export const SENHA_MIN = 15;
/** Teto de comprimento (D-1). Protege contra DoS por hash de entrada gigantesca. */
export const SENHA_MAX = 128;

/** Por que a senha foi rejeitada. Estável — é contrato de resposta (nunca inclui a senha). */
export type MotivoRejeicaoSenha = 'NAO_TEXTO' | 'CURTA' | 'LONGA' | 'COMUM';

export type ResultadoPolitica = { ok: true } | { ok: false; motivo: MotivoRejeicaoSenha };

/**
 * Normaliza um candidato para a comparação contra a lista de senhas comuns.
 *
 * Objetivo: fazer variações triviais colidirem na mesma entrada. `NFKC` unifica formas Unicode
 * compatíveis; minúsculas ignoram a capitalização; remover TODO espaço em branco faz a passphrase
 * "correct horse battery staple" bater na entrada "correcthorsebatterystaple".
 *
 * **Isto é SÓ para a checagem de senha-comum** — não altera a senha armazenada nem afrouxa o
 * comprimento (que é medido sobre a senha ORIGINAL, com espaços e tudo).
 */
export function normalizarParaComparacao(senha: string): string {
  return senha.normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
}

/** A senha (normalizada) é uma das comuns/comprometidas conhecidas? */
export function ehSenhaComum(senha: string): boolean {
  return SENHAS_COMUNS.has(normalizarParaComparacao(senha));
}

/**
 * Valida uma senha nova/alterada contra a política central. Fail-closed: entrada não-string é
 * rejeitada, não coagida.
 *
 * O comprimento é contado em **code points** (`[...senha].length`), não em unidades UTF-16: senão um
 * emoji (par substituto) contaria como 2 e uma frase legítima com acentos poderia ser penalizada de
 * forma surpreendente. A senha em si é preservada como veio (não há `trim`) — espaços fazem parte
 * dela.
 */
export function validarPoliticaSenha(senha: unknown): ResultadoPolitica {
  if (typeof senha !== 'string') return { ok: false, motivo: 'NAO_TEXTO' };

  const comprimento = [...senha].length;
  if (comprimento < SENHA_MIN) return { ok: false, motivo: 'CURTA' };
  if (comprimento > SENHA_MAX) return { ok: false, motivo: 'LONGA' };
  if (ehSenhaComum(senha)) return { ok: false, motivo: 'COMUM' };

  return { ok: true };
}
