import { Injectable, Logger } from '@nestjs/common';
import { connect, type Socket } from 'node:net';
import { getEnv } from '../config/env';
import type { ResultadoClamAV } from '../../files/file-verdict.core';

/** Assinatura do vírus de teste EICAR — string canônica, inofensiva, que todo antivírus real detecta. */
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

/** Tamanho do chunk do INSTREAM (o clamd aceita blocos; 64 KiB é confortável e abaixo do StreamMaxChunk). */
const CHUNK = 64 * 1024;

/**
 * Wrapper técnico do ClamAV (Story 3.7) — fronteira do kernel (AD-4/AD-5). Fala com o `clamd` por TCP usando o
 * protocolo nativo `INSTREAM`/`VERSION` sobre `node:net` — **sem dependência externa** (menos superfície, menos
 * risco de supply chain). Sem regra de negócio: escaneia bytes, lê a data da base, roda o canário EICAR. A
 * composição fail-closed (o que fazer com cada resultado) vive no núcleo puro `file-verdict.core` e no serviço.
 *
 * **Fail-closed em toda superfície:** erro/timeout/indisponibilidade ⇒ `NAO_ESCANEAVEL` (nunca LIMPO por omissão);
 * data da base desconhecida ⇒ `null` (o veredito trata como base cega). Nada de client preguiçoso a manter — cada
 * verificação abre e fecha sua própria conexão (stateless, resiliente a clamd reciclado).
 */
@Injectable()
export class ClamavService {
  private readonly logger = new Logger(ClamavService.name);

  /**
   * Escaneia um buffer via INSTREAM. `stream: OK` ⇒ LIMPO; `... FOUND` ⇒ INFECTADO; qualquer outra coisa
   * (erro/`size limit exceeded`/timeout/conexão) ⇒ NAO_ESCANEAVEL (fail-closed).
   */
  async escanear(conteudo: Buffer): Promise<ResultadoClamAV> {
    try {
      const resposta = await this.instream(conteudo);
      if (/\bFOUND\b/.test(resposta)) return 'INFECTADO';
      if (/\bOK\b/.test(resposta)) return 'LIMPO';
      // "size limit exceeded", "ERROR", vazio... ⇒ não escaneável (AlertExceedsMax também cai aqui).
      return 'NAO_ESCANEAVEL';
    } catch (err) {
      this.logger.warn(
        { event: 'clamav.erro', motivo: (err as { message?: string })?.message ?? 'erro' },
        'ClamAV indisponível/erro — tratado como NAO_ESCANEAVEL (fail-closed)',
      );
      return 'NAO_ESCANEAVEL';
    }
  }

  /**
   * Data de construção da base de assinaturas (para o gate de frescor). `null` se indeterminável — o veredito
   * trata `null` como base cega (fail-closed). Parseia o `VERSION`: "ClamAV 1.4.0/27000/Mon Jul 15 10:00:00 2026".
   */
  async dataDaBase(): Promise<Date | null> {
    try {
      const versao = await this.comando('nVERSION\n');
      const partes = versao.trim().split('/');
      if (partes.length < 3) return null;
      const data = new Date(partes[2].trim());
      return Number.isNaN(data.getTime()) ? null : data;
    } catch (err) {
      this.logger.warn(
        { event: 'clamav.versao.erro', motivo: (err as { message?: string })?.message ?? 'erro' },
        'não foi possível ler a versão/base do ClamAV (fail-closed)',
      );
      return null;
    }
  }

  /**
   * Canário EICAR: escaneia a assinatura de teste e exige detecção. `true` = o scanner enxerga (não está cego);
   * `false` = detecção falhou (base vazia/cega ou clamd mudo) → o chamador recusa promover (fail-closed).
   */
  async canarioDetecta(): Promise<boolean> {
    return (await this.escanear(Buffer.from(EICAR, 'ascii'))) === 'INFECTADO';
  }

  /** Abre uma conexão com o clamd, envia `comando` (texto), lê a resposta inteira e fecha. */
  private comando(comando: string): Promise<string> {
    return this.comSocket((socket) => socket.write(comando));
  }

  /** Executa o INSTREAM: envia o comando, os chunks emoldurados (4 bytes BE de tamanho) e o terminador zero. */
  private instream(conteudo: Buffer): Promise<string> {
    return this.comSocket((socket) => {
      socket.write('nINSTREAM\n');
      for (let i = 0; i < conteudo.length; i += CHUNK) {
        const pedaco = conteudo.subarray(i, i + CHUNK);
        const tamanho = Buffer.alloc(4);
        tamanho.writeUInt32BE(pedaco.length, 0);
        socket.write(tamanho);
        socket.write(pedaco);
      }
      // Terminador: chunk de tamanho zero.
      socket.write(Buffer.from([0, 0, 0, 0]));
    });
  }

  /**
   * Ciclo de vida do socket, com timeout — coleta toda a resposta até o clamd fechar. Fail-closed: qualquer
   * erro/timeout rejeita (o chamador traduz em NAO_ESCANEAVEL/null).
   */
  private comSocket(escrever: (socket: Socket) => void): Promise<string> {
    const env = getEnv();
    return new Promise<string>((resolve, reject) => {
      const socket = connect({ host: env.CLAMAV_HOST, port: env.CLAMAV_PORT });
      const partes: Buffer[] = [];
      socket.setTimeout(60_000);

      socket.on('connect', () => escrever(socket));
      socket.on('data', (d) => partes.push(d));
      socket.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
      socket.on('close', () => resolve(Buffer.concat(partes).toString('utf8')));
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('timeout do clamd'));
      });
      socket.on('error', (err) => reject(err));
    });
  }
}
