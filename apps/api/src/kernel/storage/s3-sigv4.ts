import { createHash, createHmac } from 'node:crypto';

/**
 * Assinatura AWS Signature Version 4 (SigV4) — PURO, sem dependência externa (Story 3.7). Assina requisições
 * para um storage S3-compatível (MinIO em dev/CI). Evitar o `@aws-sdk/client-s3` (50+ pacotes transitivos) mantém
 * a story **zero-dependência**: o CI `--frozen-lockfile` não precisa de mudança de lockfile, e a superfície de
 * supply chain fica mínima. O algoritmo é determinístico e provado por vetor conhecido da AWS no teste de unidade.
 */

/** SHA-256 hex do conteúdo VAZIO — payload hash de requisições sem corpo (GET/DELETE/CopyObject). */
export const SHA256_VAZIO = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** SHA-256 hex de um buffer/string. */
export function sha256hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/**
 * Codifica um caminho no padrão RFC 3986 exigido pelo S3: cada segmento é percent-encoded, mas as barras entre
 * segmentos são preservadas. `encodeURIComponent` deixa `!*'()` de fora — o S3 os exige codificados.
 */
export function encodarCaminho(path: string): string {
  return path
    .split('/')
    .map((seg) =>
      encodeURIComponent(seg).replace(
        /[!*'()]/g,
        (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
      ),
    )
    .join('/');
}

/** Chave de assinatura derivada (cadeia de HMAC: data → região → serviço → aws4_request). */
export function derivarChaveAssinatura(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

export interface EntradaAssinatura {
  method: string;
  /** Caminho canônico já com bucket, ex.: `/bucket/org/uuid` (NÃO encodado — a função encoda). */
  canonicalPath: string;
  /** Cabeçalhos a assinar (nomes quaisquer; a função normaliza para minúsculas e ordena). Inclua `host`. */
  headers: Record<string, string>;
  /** Hash hex do payload (`SHA256_VAZIO` para corpo vazio; `sha256hex(body)` para PUT com corpo). */
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  /** Instante da requisição — `amzDate` (YYYYMMDDTHHMMSSZ) e `dateStamp` (YYYYMMDD) derivam dele. */
  amzDate: string;
  dateStamp: string;
}

/**
 * Assina a requisição e devolve os cabeçalhos finais a enviar (inclui `Authorization`, `x-amz-date`,
 * `x-amz-content-sha256` e os que vieram em `headers`). Sem query string (as operações da 3.7 não usam query).
 */
export function assinar(e: EntradaAssinatura): Record<string, string> {
  const headers: Record<string, string> = {
    ...e.headers,
    'x-amz-date': e.amzDate,
    'x-amz-content-sha256': e.payloadHash,
  };

  // Cabeçalhos canônicos: nome minúsculo, valor trimado, ordenados por nome.
  const nomes = Object.keys(headers)
    .map((n) => n.toLowerCase())
    .sort();
  const mapaLower: Record<string, string> = {};
  // Canonicalização AWS: trim das pontas E colapso de espaços sequenciais internos num único espaço.
  for (const [k, v] of Object.entries(headers)) {
    mapaLower[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ');
  }

  const canonicalHeaders = nomes.map((n) => `${n}:${mapaLower[n]}\n`).join('');
  const signedHeaders = nomes.join(';');

  const canonicalRequest = [
    e.method,
    encodarCaminho(e.canonicalPath),
    '', // canonical query string (vazia)
    canonicalHeaders,
    signedHeaders,
    e.payloadHash,
  ].join('\n');

  const scope = `${e.dateStamp}/${e.region}/${e.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', e.amzDate, scope, sha256hex(canonicalRequest)].join(
    '\n',
  );

  const chave = derivarChaveAssinatura(e.secretAccessKey, e.dateStamp, e.region, e.service);
  const signature = createHmac('sha256', chave).update(stringToSign, 'utf8').digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${e.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { ...headers, authorization };
}

/** Formata um instante em `amzDate` (YYYYMMDDTHHMMSSZ) e `dateStamp` (YYYYMMDD). */
export function formatarData(agora: Date): { amzDate: string; dateStamp: string } {
  const iso = agora.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20260717T120000Z
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}
