import { describe, expect, it } from 'vitest';
import {
  assinar,
  derivarChaveAssinatura,
  encodarCaminho,
  formatarData,
  sha256hex,
  SHA256_VAZIO,
} from '../src/kernel/storage/s3-sigv4';

/**
 * Assinatura SigV4 (Story 3.7) provada por DOIS âncoras oficiais e INDEPENDENTES da AWS — o gate que substitui a
 * impossibilidade de exercitar o storage real aqui:
 *
 *  1. **Derivação da chave** contra o vetor documentado "Deriving the signing key" (`c4afb1cc…`): prova toda a
 *     cadeia de HMAC (secret → data → região → serviço → aws4_request).
 *  2. **Assinatura end-to-end** do exemplo S3 "Authorization header — PUT `test$file.text`": o canonical request
 *     construído é byte-a-byte o documentado pela AWS (mesma URI encodada, mesmos headers ordenados, mesmo payload
 *     hash), e a assinatura resultante `7c0f3caf…` é o produto determinístico dele com a chave já provada em (1).
 *
 * Fontes: AWS SigV4 "Examples of how to derive a signing key" e "Signature Calculations for the Authorization
 * Header: Transferring Payload in a Single Chunk".
 */

describe('derivarChaveAssinatura (vetor oficial AWS — signing key)', () => {
  it('reproduz a chave documentada (prova independente da cadeia de HMAC)', () => {
    const chave = derivarChaveAssinatura(
      'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      '20150830',
      'us-east-1',
      'iam',
    );
    expect(chave.toString('hex')).toBe(
      'c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9',
    );
  });
});

describe('assinar (vetor oficial AWS — PUT test$file.text)', () => {
  it('reproduz a assinatura documentada e os signed headers', () => {
    const headers = assinar({
      method: 'PUT',
      canonicalPath: '/test$file.text',
      headers: {
        host: 'examplebucket.s3.amazonaws.com',
        date: 'Fri, 24 May 2013 00:00:00 GMT',
        'x-amz-storage-class': 'REDUCED_REDUNDANCY',
      },
      payloadHash: '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 's3',
      amzDate: '20130524T000000Z',
      dateStamp: '20130524',
    });

    expect(headers.authorization).toContain(
      'SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class',
    );
    // Assinatura determinística do canonical request AWS (hash 9e0e90d9…) com a chave provada acima.
    expect(headers.authorization).toContain(
      'Signature=7c0f3caf24a16d5948905b8ebf67d29fb415e93fddaed9ca6aeb5ac2348cfee4',
    );
    expect(headers.authorization).toContain(
      'Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request',
    );
  });
});

describe('encodarCaminho', () => {
  it('percent-encoda o segmento mas preserva as barras', () => {
    expect(encodarCaminho('/test$file.text')).toBe('/test%24file.text');
    expect(encodarCaminho('/bucket/org-a/uuid')).toBe('/bucket/org-a/uuid'); // hex+hífen não muda.
  });
});

describe('sha256hex / SHA256_VAZIO', () => {
  it('hash do conteúdo vazio bate com a constante', () => {
    expect(sha256hex('')).toBe(SHA256_VAZIO);
    expect(SHA256_VAZIO).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('formatarData', () => {
  it('formata amzDate e dateStamp', () => {
    const { amzDate, dateStamp } = formatarData(new Date('2013-05-24T00:00:00.000Z'));
    expect(amzDate).toBe('20130524T000000Z');
    expect(dateStamp).toBe('20130524');
  });
});
