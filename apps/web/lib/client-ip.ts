import { isIP } from 'node:net';

/**
 * Deriva o IP validado do cliente a partir do `X-Forwarded-For` que a WEB recebeu — o elo
 * Web→API da cadeia de proxy confiável (D-01: Traefik → Web → API).
 *
 * ## Por que a ÚLTIMA entrada, e não a primeira
 *
 * O Traefik SEMPRE ANEXA o endereço do peer TCP ao final da cadeia. Um cliente que envie
 * `X-Forwarded-For: 1.2.3.4` forjado chega aqui como `1.2.3.4, <ip-real>`: a ponta esquerda é
 * exatamente a parte que o atacante controla; a última entrada é a única escrita por QUEM VIU O
 * SOCKET. Espelha a regra do lado da API (`kernel/auth/client-ip.ts`, direita para a esquerda).
 *
 * ## O que a Web encaminha à API
 *
 * SÓ o IP derivado — nunca a cadeia recebida. Com o hop autenticado (D-01) esse IP viaja DENTRO de um
 * envelope assinado (`lib/internal-hop.ts`), e a API o honra pela ASSINATURA, não mais por um IP fixo
 * da Web (que no padrão nativo do Coolify é dinâmico). Em modo direto (sem segredo), segue como um
 * X-Forwarded-For único; reenviar a cadeia inteira só daria ao cliente material para confundir o próximo salto.
 *
 * ## Fail-closed
 *
 * Header ausente (dev sem proxy) ou última entrada que não é um IP válido ⇒ `undefined`, e o
 * chamador NÃO envia o header. A API cai no peer (a própria Web) — colapsa o rate limit num
 * balde único, o que é restritivo demais, nunca permissivo demais.
 *
 * ## Limite conhecido (registrado no D-01)
 *
 * Um route handler do Next não enxerga o socket, então a Web não consegue verificar que o peer
 * é o Traefik. O compensatório é topológico: a Web não publica porta de host e só é alcançável
 * pelas redes docker — forjar exigiria um container vizinho já comprometido, e o impacto máximo
 * é envenenar a chave de rate limit (nunca autorização).
 */
export function derivarIpValidadoDoXff(forwarded: string | null): string | undefined {
  if (forwarded === null) return undefined;

  const cadeia = forwarded
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const ultimo = cadeia[cadeia.length - 1];
  if (ultimo === undefined) return undefined;

  // Formato IPv4-mapeado do Node (`::ffff:1.2.3.4`) vira IPv4 puro, como na API.
  const limpo = ultimo.toLowerCase().startsWith('::ffff:')
    ? ultimo.slice('::ffff:'.length)
    : ultimo;
  return isIP(limpo) ? limpo : undefined;
}
