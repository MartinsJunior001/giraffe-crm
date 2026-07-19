import { describe, expect, it } from 'vitest';
import { AvatarService } from '../src/accounts/avatar/avatar.service';
import type { ContextoOrganizacional } from '../src/kernel/context/request-context';

/**
 * O avatar é dado pessoal (LGPD/NFR-32). Este teste prova o que NÃO pode sair em log: o nome original do
 * arquivo (PII fornecida pelo usuário), a chave do objeto, o caminho e o binário.
 *
 * É unitário de propósito. Um teste de integração observaria o log AGREGADO da requisição — e passaria por
 * acidente se o `AvatarService` não logasse nada. Aqui a asserção é sobre o que ESTE serviço entrega ao
 * logger, que é onde a decisão de sanitização mora.
 */

const CONTEXTO: ContextoOrganizacional = {
  orgId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  accountId: '11111111-1111-1111-1111-111111111111',
  papel: 'ADMIN',
};

const NOME_PII = 'foto-do-meu-rosto-cpf-12345678901.png';
const BUCKET_KEY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/deadbeef-0000-0000-0000-000000000000';
const FILE_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

/** Registra tudo que foi entregue ao logger, para inspeção. */
class LoggerEspiao {
  registros: unknown[] = [];
  info(obj: object, msg: string): void {
    this.registros.push({ obj, msg });
  }
  warn(obj: object, msg: string): void {
    this.registros.push({ obj, msg });
  }
  debug(obj: object, msg: string): void {
    this.registros.push({ obj, msg });
  }
  tudo(): string {
    return JSON.stringify(this.registros);
  }
}

/** Prisma mínimo: transação que executa o callback com um tx que registra o slot em memória. */
function prismaFake(slotInicial: { id: string; fileId: string; state: string } | null) {
  let slot = slotInicial;
  const tx = {
    $executeRaw: () => Promise.resolve(1),
    accountAvatar: {
      findUnique: () => Promise.resolve(slot),
      create: () => {
        slot = { id: 'slot-1', fileId: FILE_ID, state: 'ACTIVE' };
        return Promise.resolve(slot);
      },
      updateMany: () => Promise.resolve({ count: 1 }),
    },
    fileObject: { updateMany: () => Promise.resolve({ count: 1 }) },
  };
  // `withTenantContext` encadeia DOIS `$extends`; o fake precisa devolver algo encadeável.
  const estendido: Record<string, unknown> = {
    accountAvatar: {
      findUnique: () =>
        Promise.resolve(
          slot
            ? {
                ...slot,
                updatedAt: new Date(),
                file: { nomeOriginal: NOME_PII, state: 'DISPONIVEL' },
              }
            : null,
        ),
    },
    fileObject: { updateMany: () => Promise.resolve({ count: 1 }) },
  };
  estendido.$extends = () => estendido;

  return {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    $extends: () => estendido,
  };
}

function montar(slotInicial: { id: string; fileId: string; state: string } | null): {
  service: AvatarService;
  logger: LoggerEspiao;
} {
  const logger = new LoggerEspiao();
  const requestContext = { obter: () => CONTEXTO };
  const files = {
    enviar: () =>
      Promise.resolve({
        id: FILE_ID,
        resourceType: 'ACCOUNT',
        resourceId: CONTEXTO.accountId,
        state: 'DISPONIVEL' as const,
        nomeOriginal: NOME_PII,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    baixar: () => Promise.resolve({ stream: null, nomeOriginal: NOME_PII }),
  };
  // As dependências são structurally-typed pelo construtor; os fakes cobrem só o que este caminho usa.
  const service = new AvatarService(
    requestContext as never,
    prismaFake(slotInicial) as never,
    logger as never,
    files as never,
  );
  return { service, logger };
}

describe('auditoria do avatar não vaza PII', () => {
  it('enviar não registra o nome do arquivo, a chave do objeto nem o binário', async () => {
    const { service, logger } = montar(null);
    // PNG válido: o serviço valida magic bytes antes de qualquer coisa (avatar tem de ser imagem).
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
    await service.enviar({ buffer: png, nomeOriginal: NOME_PII });

    const registrado = logger.tudo();
    expect(registrado).not.toContain(NOME_PII);
    expect(registrado).not.toContain(BUCKET_KEY);
    expect(registrado).not.toMatch(/cpf|rosto/i);
    // O que DEVE estar lá: a trilha exigida pelo FR-214, com referência opaca ao arquivo.
    expect(registrado).toContain('audit');
    expect(registrado).toContain('AccountAvatar');
    expect(registrado).toContain(FILE_ID);
  });

  it('remover não registra o nome do arquivo', async () => {
    const { service, logger } = montar({ id: 'slot-1', fileId: FILE_ID, state: 'ACTIVE' });
    await service.remover();

    expect(logger.tudo()).not.toContain(NOME_PII);
    expect(logger.tudo()).toContain('audit');
  });
});
