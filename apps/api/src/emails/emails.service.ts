import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { type ContextoOrganizacional, RequestContext } from '../kernel/context/request-context';
import { PrismaService } from '../kernel/db/prisma.service';
import { withTenantContext } from '../kernel/db/tenant-context';
import { exigirOperarCard } from '../pipes/pipe-authz';
import {
  type AcaoEmail,
  ComposicaoInvalidaError,
  type EstadoEmail,
  normalizarDestinatarios,
  planejarTransicao,
  validarConteudo,
} from './email-compose.core';
import type { CriarEmailDTO, EditarEmailDTO } from './emails.dto';

type Db = ReturnType<typeof withTenantContext>;

/** O e-mail como sai pela API interna (`orgId` FORA da fronteira; nunca vaza). */
export interface EmailVisao {
  id: string;
  cardId: string | null;
  state: EstadoEmail;
  recipients: string[];
  subject: string;
  body: string;
  createdByMembershipId: string;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SELECT_EMAIL = {
  id: true,
  cardId: true,
  state: true,
  recipients: true,
  subject: true,
  body: true,
  createdByMembershipId: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Composer do e-mail canônico (Story 6.1). SEM envio real (6.4, AD-28 — nenhuma porta de provedor aqui).
 *
 * Autorização FINA no serviço (DBT-AUTHZ-01, C3 congelado — D-61.3):
 *  · compor/editar/descartar/submeter **com Card** → exige OPERAR o Card (`exigirOperarCard`, 2.10) — a
 *    associação nunca amplia: quem não opera o Card não anexa e-mail ao contexto dele;
 *  · **sem Card** → Membership ativa ADMIN/MEMBER da Org (GUEST → 403, deny-by-default);
 *  · **ler o detalhe** → o AUTOR (Membership criadora) ou o Admin da Org; terceiros (mesmo com acesso ao
 *    Card) → **404 não-enumerante** — acesso ao Card NÃO concede acesso ao e-mail (RF-1/AC-1).
 *
 * Imutabilidade pós-SUBMITTED: núcleo puro + **guarda otimista** (`updateMany where state='DRAFT'` →
 * count 0 → reconsulta → no-op idempotente ou 409). O caminho idempotente NÃO emite `updateMany` (sem
 * falso `denied` na auditoria). Logs NUNCA carregam destinatários/assunto/corpo (PII).
 */
@Injectable()
export class EmailsService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /** Membership ativa do PRINCIPAL na Org do contexto (autoria). Sob RLS; ausente → 403 (defesa). */
  private async membershipDoPrincipal(db: Db, contexto: ContextoOrganizacional): Promise<string> {
    const m = await db.membership.findFirst({
      where: { accountId: contexto.accountId, state: 'ACTIVE' },
      select: { id: true },
    });
    if (!m) throw new ForbiddenException();
    return m.id;
  }

  /** Capacidade de COMPOR no alvo: com Card → operar o Card; sem Card → papel ADMIN/MEMBER (GUEST 403). */
  private async exigirCompor(
    db: Db,
    contexto: ContextoOrganizacional,
    cardId: string | null,
  ): Promise<void> {
    if (cardId !== null) {
      await exigirOperarCard(db, contexto, cardId); // 404 sem acesso; 403 se só lê
      return;
    }
    if (contexto.papel === 'GUEST') throw new ForbiddenException();
  }

  /** Carrega sob RLS + autoriza LEITURA (autor ou Admin da Org); senão 404 não-enumerante. */
  private async carregarAutorizado(
    db: Db,
    contexto: ContextoOrganizacional,
    membershipId: string,
    emailId: string,
  ): Promise<EmailVisao> {
    const email = await db.emailMessage.findUnique({
      where: { id: emailId },
      select: SELECT_EMAIL,
    });
    if (!email) throw new NotFoundException();
    const ehAutor = email.createdByMembershipId === membershipId;
    if (!ehAutor && contexto.papel !== 'ADMIN') throw new NotFoundException(); // não-enumerante
    return email as EmailVisao;
  }

  private valida400(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      if (err instanceof ComposicaoInvalidaError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────── CRIAR ──

  async criar(dto: CriarEmailDTO): Promise<EmailVisao> {
    const { contexto, db } = this.db();
    await this.exigirCompor(db, contexto, dto.cardId);
    const membershipId = await this.membershipDoPrincipal(db, contexto);

    let recipients: string[] = [];
    let conteudo = { subject: '', body: '' };
    this.valida400(() => {
      recipients = normalizarDestinatarios(dto.recipients, false);
      conteudo = validarConteudo(dto.subject, dto.body);
    });

    const criado = await db.emailMessage.create({
      data: {
        id: randomUUID(),
        orgId: contexto.orgId,
        cardId: dto.cardId,
        recipients,
        subject: conteudo.subject,
        body: conteudo.body,
        createdByMembershipId: membershipId,
      },
      select: SELECT_EMAIL,
    });
    return criado as EmailVisao;
  }

  // ─────────────────────────────────────────────────────────────── OBTER ──

  async obter(emailId: string): Promise<EmailVisao> {
    const { contexto, db } = this.db();
    const membershipId = await this.membershipDoPrincipal(db, contexto);
    return this.carregarAutorizado(db, contexto, membershipId, emailId);
  }

  // ──────────────────────────────────────────────────────────────── EDITAR ──

  async editar(emailId: string, dto: EditarEmailDTO): Promise<EmailVisao> {
    const { contexto, db } = this.db();
    const membershipId = await this.membershipDoPrincipal(db, contexto);
    const atual = await this.carregarAutorizado(db, contexto, membershipId, emailId);
    if (atual.state !== 'DRAFT') {
      throw new ConflictException({ motivo: 'EMAIL_NAO_EDITAVEL' }); // imutável pós-fluxo-de-envio
    }

    // Autoriza nos DOIS lados da associação (review 6.1 — Arch-F1): mudar/remover o vínculo exige operar
    // o Card de ORIGEM (a edição de um e-mail associado é edição no contexto daquele Card — RF-5) e, se
    // houver destino novo, operar também o Card de DESTINO. Sem mudança de vínculo, autoriza no atual.
    const cardAlvo = dto.cardId === undefined ? atual.cardId : dto.cardId;
    if (dto.cardId !== undefined && atual.cardId !== null && dto.cardId !== atual.cardId) {
      await this.exigirCompor(db, contexto, atual.cardId);
    }
    await this.exigirCompor(db, contexto, cardAlvo);

    const data: Record<string, unknown> = {};
    this.valida400(() => {
      if (dto.cardId !== undefined) data.cardId = dto.cardId;
      if (dto.recipients !== undefined) {
        data.recipients = normalizarDestinatarios(dto.recipients, false);
      }
      if (dto.subject !== undefined || dto.body !== undefined) {
        const c = validarConteudo(dto.subject ?? atual.subject, dto.body ?? atual.body);
        if (dto.subject !== undefined) data.subject = c.subject;
        if (dto.body !== undefined) data.body = c.body;
      }
    });

    // Guarda otimista: só atualiza se AINDA é DRAFT (perder a corrida para submit/discard → 409).
    const { count } = await db.emailMessage.updateMany({
      where: { id: emailId, state: 'DRAFT' },
      data,
    });
    if (count === 0) throw new ConflictException({ motivo: 'EMAIL_NAO_EDITAVEL' });
    return this.carregarAutorizado(db, contexto, membershipId, emailId);
  }

  // ──────────────────────────────────────────────────────────── TRANSIÇÕES ──

  async submeter(emailId: string): Promise<EmailVisao> {
    return this.transicao(emailId, 'submeter');
  }

  async descartar(emailId: string): Promise<EmailVisao> {
    return this.transicao(emailId, 'descartar');
  }

  private async transicao(emailId: string, acao: AcaoEmail): Promise<EmailVisao> {
    const { contexto, db } = this.db();
    const membershipId = await this.membershipDoPrincipal(db, contexto);
    const atual = await this.carregarAutorizado(db, contexto, membershipId, emailId);
    await this.exigirCompor(db, contexto, atual.cardId);

    const plano = planejarTransicao(atual.state, acao);
    if (plano.tipo === 'noop') return atual; // idempotente — SEM updateMany (sem falso `denied`)
    if (plano.tipo === 'invalido') {
      throw new ConflictException({ motivo: 'TRANSICAO_INVALIDA' });
    }

    if (acao === 'submeter') {
      // Congela SÓ conteúdo VÁLIDO: revalida destinatários (≥1) e conteúdo persistidos, no servidor.
      this.valida400(() => {
        normalizarDestinatarios(atual.recipients, true);
        validarConteudo(atual.subject, atual.body);
      });
    }

    // Guarda otimista de ESTADO **e de CONTEÚDO** (review 6.1 — Sec-M1): sem o conteúdo no `where`, um
    // PATCH concorrente do próprio autor poderia trocar destinatários/corpo ENTRE a revalidação acima e
    // este UPDATE, congelando SUBMITTED com conteúdo diferente do validado (até 0 destinatários). Com o
    // conteúdo lido na condição, a corrida perde → count 0 → reconsulta → 409, nunca congela inválido.
    const { count } = await db.emailMessage.updateMany({
      where: {
        id: emailId,
        state: 'DRAFT',
        recipients: { equals: atual.recipients },
        subject: atual.subject,
        body: atual.body,
      },
      data:
        plano.alvo === 'SUBMITTED'
          ? { state: 'SUBMITTED', submittedAt: new Date() }
          : { state: 'DISCARDED' },
    });
    if (count === 0) {
      // Perdeu a corrida (de estado OU de conteúdo): reconsulta — chegou ao MESMO alvo → idempotente;
      // senão → 409 (o chamador reconsulta e repete sobre o conteúdo atual).
      const depois = await this.carregarAutorizado(db, contexto, membershipId, emailId);
      if (depois.state === plano.alvo) return depois;
      throw new ConflictException({ motivo: 'TRANSICAO_INVALIDA' });
    }
    // Sem auditoria manual aqui (review 6.1 — Arch-F4): o `updateMany` acima roda pelo client estendido
    // (`withTenantContext`) e `EmailMessage` está em MODELOS_AUDITADOS — a trilha FR-214 já é emitida pela
    // extensão; duplicar produziria evento dobrado. A manual é reservada a tx no client raiz (não usadas
    // na 6.1 — D-61.6).
    return this.carregarAutorizado(db, contexto, membershipId, emailId);
  }
}
