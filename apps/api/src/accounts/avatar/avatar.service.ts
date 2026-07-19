import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { type ContextoOrganizacional, RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { definirContextoOrg, withTenantContext } from '../../kernel/db/tenant-context';
import { type DownloadArquivo, FilesService } from '../../files/files.service';
import { detectarTipo } from '../../files/file-validation.core';

type Db = ReturnType<typeof withTenantContext>;

/** `resourceType` do avatar na capacidade de arquivos (3.7). O `resourceId` é o `accountId` do titular. */
const RESOURCE_ACCOUNT = 'ACCOUNT';

/**
 * Projeção do avatar pela fronteira. **Não** carrega URL, chave de objeto nem caminho — o binário só sai pela
 * rota de download, sob sessão (sem presigned). `presente: false` é o sinal para a UI cair nas iniciais (1.11).
 */
export interface AvatarVisao {
  presente: boolean;
  fileId: string | null;
  nomeOriginal: string | null;
  atualizadoEm: Date | null;
}

const AUSENTE: AvatarVisao = {
  presente: false,
  fileId: null,
  nomeOriginal: null,
  atualizadoEm: null,
};

/** Conflito de concorrência (→ 409, nunca 500): P2002/P2028, como em Card (2.7)/Registro (3.4). */
function isConflito(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Avatar do PRÓPRIO usuário (Story 3.10, FR-32) — envio, substituição, remoção e download.
 *
 * O binário reusa **integralmente** a capacidade de arquivos da 3.7 (`FilesService.enviar`): validação de
 * MIME/extensão/magic-bytes/tamanho, quarentena, verificação antivírus e promoção fail-closed. Não há segundo
 * pipeline de upload, e esta classe **não** fala com storage nem com o scanner.
 *
 * O que é próprio daqui é o **SLOT**: qual arquivo é o avatar vigente. Ele vive em `AccountAvatar`, org-scoped,
 * com unicidade `(orgId, accountId)` — "um avatar por Conta por Organização" é a CHAVE, não uma regra de
 * aplicação com corrida. `Account` não é tocada: segue GLOBAL e SELECT-only para o runtime (AD-10).
 *
 * A autorização é **self-only** e mora no `FileAuthzDispatcher` (`resourceType='ACCOUNT'`), com a RLS self-only
 * de `AccountAvatar` como backstop de banco — mesmo que a checagem de aplicação fosse burlada, a policy negaria.
 */
@Injectable()
export class AvatarService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    private readonly files: FilesService,
  ) {}

  private ctx(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /**
   * Auditoria (FR-214). Sem PII: nunca o nome do arquivo, a chave, o caminho ou o binário — só o `fileId`
   * opaco e o ator, que já é o próprio principal.
   */
  private auditar(contexto: ContextoOrganizacional, action: string, fileId: string | null): void {
    this.logger.info(
      {
        event: 'audit',
        actor: contexto.accountId,
        orgId: contexto.orgId,
        action,
        resource: 'AccountAvatar',
        fileId,
        result: 'allowed',
        at: new Date().toISOString(),
      },
      'auditoria',
    );
  }

  /**
   * O avatar vigente do próprio usuário na Organização do contexto. Ausente ⇒ a UI usa as iniciais (1.11).
   *
   * Não exige a capacidade de arquivos: consultar o ponteiro é leitura de domínio. Com `FILE_UPLOAD_ENABLED`
   * desligado o slot pode até existir, mas o download responderá 503 e a UI cai nas iniciais de todo modo.
   */
  async obter(): Promise<AvatarVisao> {
    const { contexto, db } = this.ctx();
    const slot = await db.accountAvatar.findUnique({
      where: { orgId_accountId: { orgId: contexto.orgId, accountId: contexto.accountId } },
      select: {
        fileId: true,
        state: true,
        updatedAt: true,
        file: { select: { nomeOriginal: true, state: true } },
      },
    });
    if (!slot || slot.state !== 'ACTIVE') return AUSENTE;
    // O arquivo pode ter sido bloqueado/removido/expurgado pelo ciclo de vida da 3.7 depois de virar avatar.
    if (slot.file.state !== 'DISPONIVEL') return AUSENTE;
    return {
      presente: true,
      fileId: slot.fileId,
      nomeOriginal: slot.file.nomeOriginal,
      atualizadoEm: slot.updatedAt,
    };
  }

  /**
   * Envia (ou SUBSTITUI) o próprio avatar. Um caminho só: o slot é único por `(orgId, accountId)`, então
   * "substituir" é o mesmo `UPDATE` de `fileId` — atômico por construção.
   *
   * Ordem deliberada: o arquivo passa TODOS os gates da 3.7 **antes** de o ponteiro mudar. Um arquivo que
   * falhe na validação ou no antivírus nunca chega a ser avatar, nem por um instante.
   *
   * `FILE_UPLOAD_ENABLED=false` ⇒ 503 honesto, vindo do `exigirCapacidade` da 3.7 (fail-closed, sem contorno).
   */
  async enviar(arquivo: { buffer: Buffer; nomeOriginal: string }): Promise<AvatarVisao> {
    const { contexto } = this.ctx();

    // Um avatar tem de ser IMAGEM. A allowlist da 3.7 é a de anexo geral e inclui `application/pdf` — um PDF
    // passaria todos os gates dela e viraria "avatar", que a UI então não conseguiria renderizar. A checagem é
    // por MAGIC BYTES (o mesmo núcleo puro da 3.7), nunca pela extensão ou pelo `Content-Type` do cliente, que
    // são ambos controlados por quem envia. Roda ANTES do upload: rejeita cedo, sem gastar slot de scan.
    const tipo = detectarTipo(arquivo.buffer);
    if (tipo === null || !tipo.startsWith('image/')) {
      throw new BadRequestException('o avatar precisa ser uma imagem (PNG, JPEG, GIF ou WEBP)');
    }

    // Autz self-only + gate de capacidade + validação + scan + promoção: tudo da 3.7.
    const novo = await this.files.enviar(RESOURCE_ACCOUNT, contexto.accountId, arquivo);

    // O contrato da 3.7 NÃO lança quando o veredito é adverso: ela PERSISTE o arquivo como `BLOCKED` e
    // devolve a projeção. Sem esta guarda, um upload com malware (ou que falhasse a prova de integridade
    // if-match) apontaria o slot para um arquivo bloqueado — e, pior, teria aposentado o avatar legítimo
    // anterior no caminho. Um envio que não resultou em arquivo DISPONIVEL não toca o slot, ponto.
    if (novo.state !== 'DISPONIVEL') {
      throw new BadRequestException('arquivo recusado pela verificação de segurança');
    }

    try {
      await this.apontarSlot(contexto, novo.id);
    } catch (err) {
      // COMPENSAÇÃO: o binário já existe e passou nos gates, mas não virou avatar. Deixá-lo DISPONIVEL
      // criaria uma imagem pessoal órfã esperando um coletor que ainda não existe (retenção é débito aberto
      // da 3.7) — marca-se REMOVIDO_LOGICO aqui, de forma determinística. Sem exclusão física.
      await this.marcarRemovidoSilencioso(contexto, novo.id);
      if (isConflito(err)) {
        throw new ConflictException('envio concorrente de avatar; repita a requisição');
      }
      throw err;
    }
    this.auditar(contexto, 'update', novo.id);
    return this.obter();
  }

  /**
   * Aponta o slot para `novoFileId` e aposenta o avatar ANTERIOR — as duas escritas na MESMA transação.
   *
   * A atomicidade aqui é o ponto: se a troca do ponteiro e a aposentadoria do binário anterior fossem duas
   * transações, uma falha entre elas deixaria o arquivo antigo DISPONIVEL para sempre — uma imagem pessoal
   * órfã, sem coletor (retenção é débito aberto da 3.7). Ou as duas acontecem, ou nenhuma.
   *
   * Transação com contexto no client raiz (`definirContextoOrg`, mesmo primitivo de 2.6/2.7/3.4): o
   * `withTenantContext` recusa `$transaction` no client estendido, e aqui leitura e escrita precisam do
   * mesmo contexto.
   *
   * **Guarda otimista** no caminho de substituição (`updateMany where fileId = <lido>`): dois envios
   * simultâneos não podem ambos "vencer". Quem não casa recebe `count === 0` e vira 409 — nunca um lost
   * update silencioso, nunca dois avatares ativos. No caminho de criação, quem impõe é o UNIQUE (P2002 → 409).
   */
  private async apontarSlot(contexto: ContextoOrganizacional, novoFileId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const p of definirContextoOrg(tx, contexto)) await p;

      const atual = await tx.accountAvatar.findUnique({
        where: { orgId_accountId: { orgId: contexto.orgId, accountId: contexto.accountId } },
        select: { id: true, fileId: true, state: true },
      });

      if (!atual) {
        // Primeiro avatar nesta Organização. Concorrência aqui colide no UNIQUE (P2002 → 409).
        await tx.accountAvatar.create({
          data: { orgId: contexto.orgId, accountId: contexto.accountId, fileId: novoFileId },
        });
        return;
      }

      const r = await tx.accountAvatar.updateMany({
        where: { id: atual.id, fileId: atual.fileId, state: atual.state },
        data: { fileId: novoFileId, state: 'ACTIVE', removedAt: null },
      });
      if (r.count === 0) {
        // Alguém mudou o slot entre a leitura e a escrita: aborta a transação inteira (sem meio-termo).
        throw new ConflictException('envio concorrente de avatar; repita a requisição');
      }

      // O avatar ANTERIOR sai de cena na mesma transação: remoção lógica, nunca exclusão física (LGPD/3.7).
      // Só é "anterior" o que estava ATIVO; um slot já REMOVED não tem avatar a aposentar.
      if (atual.state === 'ACTIVE' && atual.fileId !== novoFileId) {
        await tx.fileObject.updateMany({
          where: { id: atual.fileId, state: 'DISPONIVEL' },
          data: { state: 'REMOVIDO_LOGICO' },
        });
      }
    });
  }

  /**
   * Remove o próprio avatar: limpa o slot e aposenta o binário, na MESMA transação. Idempotente.
   *
   * **Não exige `FILE_UPLOAD_ENABLED`** — e isso é deliberado. Limpar o ponteiro é escrita de domínio, não uma
   * operação do subsistema de arquivos; trancar o titular fora de retirar a própria imagem justamente quando
   * os arquivos foram desligados por um incidente seria um erro de LGPD. Por isso a transição do `FileObject`
   * é feita aqui (um `UPDATE` de `state`, dentro do GRANT column-scoped da 3.7) em vez de por
   * `FilesService.remover`, que aplicaria o gate de capacidade e responderia 503.
   *
   * O efeito para o usuário é imediato: sem slot ATIVO, a UI cai nas iniciais (1.11). Sem exclusão física.
   */
  async remover(): Promise<AvatarVisao> {
    const { contexto, db } = this.ctx();
    const atual = await db.accountAvatar.findUnique({
      where: { orgId_accountId: { orgId: contexto.orgId, accountId: contexto.accountId } },
      select: { id: true, fileId: true, state: true },
    });
    if (!atual || atual.state !== 'ACTIVE') return AUSENTE; // idempotente: já não há avatar.

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        // Guarda otimista: só remove o slot que foi LIDO (se mudou no meio, a corrida se resolve fora).
        const r = await tx.accountAvatar.updateMany({
          where: { id: atual.id, fileId: atual.fileId, state: 'ACTIVE' },
          data: { state: 'REMOVED', removedAt: new Date() },
        });
        if (r.count === 0) return; // corrida — o slot já mudou; nada a aposentar aqui.
        await tx.fileObject.updateMany({
          where: { id: atual.fileId, state: 'DISPONIVEL' },
          data: { state: 'REMOVIDO_LOGICO' },
        });
      });
    } catch (err) {
      if (isConflito(err)) throw new ConflictException('remoção concorrente; repita a requisição');
      throw err;
    }
    this.auditar(contexto, 'update', atual.fileId);
    return AUSENTE;
  }

  /**
   * Download do próprio avatar por STREAM, sob sessão — **sem URL presigned** (o binário nunca é alcançável
   * por link que dispense a autorização). Reusa `FilesService.baixar`, que reaplica a autz self-only e a RLS.
   *
   * Ausente/indisponível ⇒ 404, e a UI cai nas iniciais (1.11) sem quebrar.
   */
  async baixar(): Promise<DownloadArquivo> {
    const avatar = await this.obter();
    if (!avatar.presente || !avatar.fileId) throw new NotFoundException();
    return this.files.baixar(avatar.fileId);
  }

  /**
   * Aposenta um binário (DISPONIVEL → REMOVIDO_LOGICO) sem deixar o erro derrubar o fluxo principal.
   *
   * É usado na compensação e na troca de avatar: nesses pontos o resultado para o usuário já está decidido, e
   * falhar aqui só transformaria um sucesso em erro. O pior caso é um arquivo que continua DISPONIVEL — e é
   * por isso que a chamada existe, não o contrário. Nunca registra nome/chave (PII).
   */
  private async marcarRemovidoSilencioso(
    contexto: ContextoOrganizacional,
    fileId: string,
  ): Promise<void> {
    try {
      const db = withTenantContext(this.prisma, contexto, this.logger);
      await db.fileObject.updateMany({
        where: { id: fileId, state: 'DISPONIVEL' },
        data: { state: 'REMOVIDO_LOGICO' },
      });
    } catch {
      this.logger.warn({ fileId }, 'falha ao aposentar binário de avatar');
    }
  }
}
