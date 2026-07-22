/**
 * Lista LOCAL e determinística de senhas comuns/comprometidas (D-1).
 *
 * A política proíbe senha comum "por mecanismo local/canônico, sem dependência runtime de serviço
 * externo" (D-1). Consultar um serviço online (ex.: HaveIBeenPwned) a cada troca acoplaria a
 * definição de senha à disponibilidade de um terceiro — fail-OPEN por definição no dia em que ele
 * cair, ou uma negação de serviço no fluxo mais sensível do produto. Uma lista embarcada é
 * determinística, offline, testável e não vaza a senha para fora do processo.
 *
 * **Forma normalizada.** Cada entrada é guardada como o candidato seria normalizado por
 * `normalizarParaComparacao` (minúsculas, sem espaços em branco, NFKC) — assim "Correct Horse
 * Battery Staple", "correcthorsebatterystaple" e "CORRECTHORSEBATTERYSTAPLE" batem na mesma linha.
 *
 * **Por que entradas majoritariamente longas.** O piso da política é 15 caracteres, então os
 * clássicos curtos ("123456", "password") já são barrados por comprimento — repeti-los aqui seria
 * inútil. O que esta lista adiciona é a classe que PASSA no comprimento mas continua trivial:
 * repetições, sequências de teclado longas, passphrases famosas e concatenações previsíveis.
 *
 * Não pretende ser exaustiva — pretende ser a fronteira canônica e extensível. Ampliá-la é aditivo
 * (uma linha nova), e o mecanismo que a consome não muda.
 */

/** As entradas JÁ na forma normalizada (minúsculas, sem espaços). Ver `normalizarParaComparacao`. */
const ENTRADAS: readonly string[] = [
  // Sequências numéricas longas
  '123456789012345',
  '1234567890123456',
  '12345678901234567890',
  '111111111111111',
  '000000000000000',
  '0000000000000000',
  '123412341234123',
  '147258369147258',
  // Repetições de caractere/palavra que atingem o comprimento
  'aaaaaaaaaaaaaaaa',
  'passwordpassword',
  'password12345678',
  'password123456789',
  'password1234567890',
  'senha123456789012',
  'senhasenhasenha1',
  'adminadminadmin1',
  'administrator123',
  'qwertyqwertyqwer',
  'abcabcabcabcabc1',
  'abcdefghijklmnop',
  'abcdefghijklmnopqrstuvwxyz',
  // Sequências de teclado longas
  'qwertyuiopasdfgh',
  'qwertyuiopasdfghjkl',
  'qwertyuiop123456',
  'asdfghjklasdfghj',
  'zxcvbnmzxcvbnm12',
  '1qaz2wsx3edc4rfv',
  'zaq12wsxcde34rfv',
  '1q2w3e4r5t6y7u8i',
  'qazwsxedcrfvtgby',
  // Passphrases / frases famosas (xkcd, cultura pop, defaults)
  'correcthorsebatterystaple',
  'thequickbrownfoxjumps',
  'thequickbrownfoxjumpsoverthelazydog',
  'iloveyouiloveyou',
  'letmeinletmein12',
  'welcome123456789',
  'welcometothejungle',
  'trustno1trustno1',
  'masterofpuppets1',
  'superman12345678',
  'batman1234567890',
  'startrek12345678',
  'starwars12345678',
  'pokemon123456789',
  'football12345678',
  'baseball12345678',
  'princess12345678',
  'sunshine12345678',
  'monkey1234567890',
  'dragon1234567890',
  'changeme12345678',
  'changemenow12345',
  'defaultpassword1',
  'passw0rdpassw0rd',
  'p@ssw0rdp@ssw0rd',
  'qwerty1234567890',
  'iloveyou12345678',
  'whateverwhatever',
  'nevergonnagiveyouup',
  'keyboardkeyboard',
  'temporarypassword',
  'temppassword1234',
  'notmypassword123',
  'mypasswordissafe',
  'secretpassword12',
  'letmeinnow123456',
];

/** As entradas comuns, indexadas para lookup O(1). */
export const SENHAS_COMUNS: ReadonlySet<string> = new Set(ENTRADAS);
