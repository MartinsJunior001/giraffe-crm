import { describe, expect, it } from 'vitest';
import { getApiBaseUrl } from '../lib/env';

describe('getApiBaseUrl', () => {
  it('remove barras finais', () => {
    expect(getApiBaseUrl('http://localhost:3001/')).toBe('http://localhost:3001');
    expect(getApiBaseUrl('http://localhost:3001///')).toBe('http://localhost:3001');
  });

  it('mantém URL sem barra final', () => {
    expect(getApiBaseUrl('http://api:3001')).toBe('http://api:3001');
  });

  it('falha honestamente quando ausente', () => {
    expect(() => getApiBaseUrl('')).toThrowError(/API_BASE_URL ausente/);
    expect(() => getApiBaseUrl(undefined)).toThrowError(/API_BASE_URL ausente/);
  });
});
