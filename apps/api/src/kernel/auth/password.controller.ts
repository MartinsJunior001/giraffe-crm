import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { SemContextoOrganizacional } from '../context/sem-contexto.decorator';
import { proxiesConfiaveisDoAmbiente, resolverIpCliente } from './client-ip';
import { parseStepUp, parseTrocaSenha } from './password.dto';
import { PasswordChangeService, type TrocaSenhaResultado } from './password-change.service';
import { StepUpService, STEP_UP_JANELA_ANTIABUSO_MS } from './step-up.service';

/**
 * Rotas de step-up e troca AUTENTICADA de senha (Story 1.12) — operações sobre a Account GLOBAL.
 *
 * **`@SemContextoOrganizacional()` por método, e ainda assim autenticadas.** O decorator dispensa o
 * guard de contexto de ORGANIZAÇÃO (senha/sessão são atributos globais do titular, AD-10 — não
 * pertencem a uma Org). A autenticação NÃO é dispensada: cada handler resolve a sessão pelo Better
 * Auth (`StepUpService.sessaoAtual`) e responde **401** se não houver. A dispensa é declarada método a
 * método (lição CR-04 da 1.3): uma rota nova aqui nasceria protegida por padrão.
 *
 * A identidade vem SEMPRE da sessão validada no servidor — nunca de header, corpo ou parâmetro. O
 * `accountId`/`sessionId` que o serviço usa são os da sessão; o cliente não pode declarar outra conta.
 */
@Controller('me')
export class PasswordController {
  private readonly proxiesConfiaveis = proxiesConfiaveisDoAmbiente();

  constructor(
    private readonly stepUp: StepUpService,
    private readonly troca: PasswordChangeService,
  ) {}

  /**
   * Reautenticação recente (step-up). Revalida a senha atual e sela a janela de 10 min.
   *
   * 204 no sucesso (nada a devolver — o estado é server-side). Senha incorreta → **401 não-enumerante**;
   * excesso de falhas (Account+IP) → **429**. Nenhum corpo revela a senha nem por que exatamente falhou.
   */
  @SemContextoOrganizacional()
  @Post('step-up')
  @HttpCode(204)
  async reautenticar(
    @Req() req: ExpressRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<void> {
    const sessao = await this.stepUp.sessaoAtual(req.headers);
    if (!sessao) throw new UnauthorizedException();

    const { senhaAtual } = parseStepUp(body);
    const ip = this.resolverIp(req);

    const r = await this.stepUp.reautenticar(req.headers, senhaAtual, sessao, ip);
    if (r.ok) return; // 204, sem corpo — o estado é server-side

    if (r.falha.tipo === 'RATE_LIMIT') {
      // Mesmo contrato do rate limit de login (G3): o cliente sabe quando voltar. Nada permanente.
      res.setHeader('X-Retry-After', String(Math.floor(STEP_UP_JANELA_ANTIABUSO_MS / 1000)));
      throw new HttpException({ erro: 'MUITAS_TENTATIVAS' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    // Senha incorreta: 401 neutro. Não distingue de "sem sessão" nem revela que foi a senha — a
    // reautenticação simplesmente não foi concedida.
    throw new UnauthorizedException({ erro: 'STEP_UP_FALHOU' });
  }

  /**
   * Troca a própria senha (após step-up válido). Valida a nova senha pela política central, troca só a
   * própria Account, preserva a sessão atual, revoga as demais e invalida recuperação pendente.
   *
   * Sem step-up válido → **403 STEP_UP_REQUIRED** (no serviço). Nova senha fraca → **400**.
   */
  @SemContextoOrganizacional()
  @Put('password')
  async trocar(@Req() req: ExpressRequest, @Body() body: unknown): Promise<TrocaSenhaResultado> {
    const sessao = await this.stepUp.sessaoAtual(req.headers);
    if (!sessao) throw new UnauthorizedException();

    const { novaSenha } = parseTrocaSenha(body);
    return this.troca.trocarSenha(novaSenha, sessao);
  }

  /** IP do cliente para o balde de rate limit (mesma resolução da borda: socket + proxies confiáveis). */
  private resolverIp(req: ExpressRequest): string | undefined {
    const bruto = req.headers['x-forwarded-for'];
    return resolverIpCliente({
      peer: req.socket.remoteAddress,
      forwarded: Array.isArray(bruto) ? bruto.join(',') : bruto,
      proxiesConfiaveis: this.proxiesConfiaveis,
    });
  }
}
