import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import { CABECALHOS_ESTATICOS } from './lib/cabecalhos-seguranca';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Saída standalone para container mínimo (monorepo: raiz de tracing na raiz do repo).
  output: 'standalone',
  outputFileTracingRoot: path.join(dirname, '../../'),
  reactStrictMode: true,

  // `X-Powered-By: Next.js` é o item nomeado pelo finding S1: anuncia framework e faixa de versão a
  // quem escaneia, sem entregar nada a quem usa o produto.
  poweredByHeader: false,

  /**
   * Cabeçalhos que não dependem da requisição (TECH-S1). Os dinâmicos — CSP com nonce e HSTS, que
   * dependem do esquema e de um valor por requisição — são emitidos pelo `proxy.ts`.
   *
   * `source: '/(.*)'` alcança TODA resposta, inclusive `_next/static`: um `nosniff` que não valesse
   * para o asset serviria de pouco, porque é justamente o arquivo servido que o browser sniffa.
   */
  async headers() {
    return [{ source: '/(.*)', headers: [...CABECALHOS_ESTATICOS] }];
  },
};

export default nextConfig;
