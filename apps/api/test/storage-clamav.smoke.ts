import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { StorageService } from '../src/kernel/storage/storage.service';
import { ClamavService } from '../src/kernel/scanner/clamav.service';

/**
 * Smoke REAL da capacidade de arquivos (Story 3.7/3.8, T001b) — exercita o caminho de verdade contra MinIO e
 * ClamAV NO AR, não fakes: `StorageService` (SigV4 próprio sobre `node:http`) e `ClamavService` (INSTREAM sobre
 * `node:net`). É o **1º exercício real** desse caminho — se falhar, é bug de infraestrutura/serviço a corrigir.
 *
 * **Não** é coletado por `pnpm test` (db-only, sem MinIO/ClamAV): o nome termina em `.smoke.ts`, fora do
 * `include` (`*.test.ts`) do `vitest.config.ts`. Roda só por `pnpm --filter @giraffe/api test:smoke`
 * (`vitest.smoke.config.ts`) — na suíte de arquivos local e no job ISOLADO do CI, com o override
 * `docker-compose.dev-files.yml` (MinIO+ClamAV em 127.0.0.1; jamais no host compartilhado — AD-32).
 *
 * Exige o ambiente configurado (`STORAGE_*`, `CLAMAV_*`, `FILE_UPLOAD_ENABLED=true`). Serviços fora do ar ⇒
 * vermelho, não pulado (a mesma filosofia do banco: ausência de serviço é falha, não ausência de evidência).
 */

// EICAR — string-padrão de teste de antivírus (inofensiva). Fragmentada para não disparar scanners no repositório.
const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}', '$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');

describe('smoke real — StorageService (SigV4 sobre node:http) contra MinIO', () => {
  const storage = new StorageService();

  it('put → getBytes roundtrip; copyIfMatch com ETag; remove', async () => {
    const key = `smoke/${randomUUID()}`;
    const body = Buffer.from(`conteúdo de smoke ${randomUUID()}`);

    const { etag } = await storage.put(key, body);
    expect(etag).toBeTruthy();

    const lidos = Buffer.from(await storage.getBytes(key));
    expect(lidos.equals(body)).toBe(true);

    // Cópia condicional por ETag (anti-troca-de-bytes): ETag correto copia; ETag errado NÃO (fail-closed).
    const dest = `smoke/${randomUUID()}`;
    expect(await storage.copyIfMatch(key, dest, etag!)).toBe(true);
    expect(await storage.copyIfMatch(key, `smoke/${randomUUID()}`, '"etag-errado"')).toBe(false);

    await storage.remove(key);
    await storage.remove(dest);
  });
});

describe('smoke real — ClamavService (INSTREAM sobre node:net) contra ClamAV', () => {
  const scanner = new ClamavService();
  const host0 = process.env.CLAMAV_HOST;
  const port0 = process.env.CLAMAV_PORT;
  const timeout0 = process.env.CLAMAV_TIMEOUT_MS;

  const restaurar = (nome: string, valor: string | undefined): void => {
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
  };
  afterEach(() => {
    restaurar('CLAMAV_HOST', host0);
    restaurar('CLAMAV_PORT', port0);
    restaurar('CLAMAV_TIMEOUT_MS', timeout0);
  });

  it('LIMPO para bytes benignos; INFECTADO para EICAR (canário); base tem data', async () => {
    expect(await scanner.escanear(Buffer.from('bytes benignos de smoke'))).toBe('LIMPO');
    expect(await scanner.escanear(Buffer.from(EICAR, 'ascii'))).toBe('INFECTADO');
    expect(await scanner.canarioDetecta()).toBe(true);
    expect(await scanner.dataDaBase()).toBeInstanceOf(Date);
  });

  it('fail-closed: scanner indisponível (porta sem serviço) → NAO_ESCANEAVEL', async () => {
    process.env.CLAMAV_PORT = '1'; // nada escutando nessa porta
    expect(await scanner.escanear(Buffer.from('x'))).toBe('NAO_ESCANEAVEL');
  });

  it('fail-closed: timeout curto → NAO_ESCANEAVEL', async () => {
    process.env.CLAMAV_TIMEOUT_MS = '1'; // 1ms: o clamd não responde a tempo
    expect(await scanner.escanear(Buffer.from('x'.repeat(200_000)))).toBe('NAO_ESCANEAVEL');
  });
});
