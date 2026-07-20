import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { PRINCIPAL_PROVIDER, type PrincipalProvider } from './principal.provider';
import {
  OrganizacaoAtivaService,
  type OrganizacaoElegivel,
  type OrganizacoesVisao,
} from './organizacao-ativa.service';
import { SemContextoOrganizacional } from './sem-contexto.decorator';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Consulta e troca da Organização ativa (Story 1.9).
 *
 * **Ambas as rotas dispensam o contexto organizacional** (`@SemContextoOrganizacional`), e isso não
 * é um relaxamento — é a única forma coerente. Um usuário com duas Memberships ativas e nenhuma
 * escolha feita **não tem** contexto: o resolvedor devolve 403 "escolha obrigatória". Se a rota que
 * lista as opções exigisse contexto, ela seria inalcançável exatamente por quem precisa dela, e o
 * usuário ficaria preso num 403 sem saída. A rota de troca tem o mesmo problema pela mesma razão.
 *
 * O que elas **não** dispensam é a AUTENTICAÇÃO: o principal é resolvido aqui, explicitamente, e
 * sem sessão a resposta é 401. E não dispensam a autorização real — a autoridade continua sendo a
 * Membership ATIVA, conferida dentro do serviço.
 */
@Controller('session')
export class OrganizacaoAtivaController {
  constructor(
    private readonly organizacoes: OrganizacaoAtivaService,
    @Inject(PRINCIPAL_PROVIDER) private readonly principais: PrincipalProvider,
  ) {}

  /** Organizações elegíveis (Memberships ACTIVE da própria conta) + a atual, quando houver. */
  @SemContextoOrganizacional()
  @Get('organizacoes')
  async listar(@Req() req: IncomingMessage): Promise<OrganizacoesVisao> {
    const principal = await this.principais.resolver(req);
    if (!principal) throw new UnauthorizedException();
    // A preferência CRUA da sessão; o serviço a valida contra as Memberships ativas antes de
    // devolvê-la como "atual". Ver `listar()` — preferência não validada não vira destaque na UI.
    return this.organizacoes.listar(principal.accountId, principal.orgIdPreferido ?? null);
  }

  /** Troca explícita. Revalida a Membership no servidor e só então persiste na sessão. */
  // 200, não o 201 default do Nest: trocar de Organização não CRIA recurso nenhum — atualiza a
  // preferência de uma sessão que já existe. Um 201 aqui insinuaria um recurso novo a cada troca.
  @SemContextoOrganizacional()
  @HttpCode(HttpStatus.OK)
  @Post('organizacao')
  async trocar(@Req() req: IncomingMessage, @Body() body: unknown): Promise<OrganizacaoElegivel> {
    const accountId = await this.exigirConta(req);
    return this.organizacoes.trocar(req, accountId, extrairOrgId(body));
  }

  /**
   * Identidade da sessão validada no servidor. 401 quando ausente — nunca 403: a diferença entre
   * "não sei quem você é" e "sei e você não pode" é a mesma que o guard já preserva.
   */
  private async exigirConta(req: IncomingMessage): Promise<string> {
    const principal = await this.principais.resolver(req);
    if (!principal) throw new UnauthorizedException();
    return principal.accountId;
  }
}

/** Fronteira de entrada: só `orgId`, só UUID. Nada mais do corpo é lido. */
function extrairOrgId(body: unknown): string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException({ motivo: 'CORPO_INVALIDO' });
  }
  const bruto = (body as Record<string, unknown>).orgId;
  if (typeof bruto !== 'string' || !UUID.test(bruto)) {
    throw new BadRequestException({ motivo: 'ORG_ID_INVALIDO' });
  }
  // Minúsculas pelo mesmo motivo do guard: o PostgreSQL emite `uuid` sempre em minúsculas, e a
  // comparação com a Membership é byte a byte. Sem isso, um UUID em maiúsculas (comum em .NET/Java)
  // receberia 404 sendo legítimo — e ainda geraria um falso evento de troca negada.
  return bruto.toLowerCase();
}
