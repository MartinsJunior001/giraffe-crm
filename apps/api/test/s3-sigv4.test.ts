import { describe, expect, it } from 'vitest';
import { assinar, encodarCaminho, formatarData, sha256hex, SHA256_VAZIO } from '../src/kernel/storage/s3-sigv4';

/**
 * Assinatura SigV4 (Story 3.7) contra o **vetor oficial documentado da AWS** (S3 "Authorization header" — PUT
 * `examplebucket/test$file.text`). Prova a cadeia inteira (canonical request → string to sign → chave derivada →
 * assinatura) de forma determinística — o gate que substitui a impossibilidade de exercitar o storage real aqui.
 * Fonte: AWS "Signature Calculations for the Authorization Header: Transferring Payload in a Single Chunk".
 */

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
    expect(headers.authorization).toContain(
      'Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd',
    );
    expect(headers.authorization).toContain('Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request');
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
