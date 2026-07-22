import { Controller, Get, Query } from '@nestjs/common';
import { Requer } from '../../kernel/authz/requer.decorator';
import { type PaginaAuditoria, AuditReadService } from './audit-read.service';
import { parseConsultaAuditoria } from './audit.dto';

/**
 * Auditoria administrativa da Organização (Story 8.8), API INTERNA — **somente leitura**.
 *
 * `@Requer('administrar', 'Organizacao')` é a guarda GROSSA: a ability que a 1.6 concede APENAS ao ADMIN
 * ATIVO da Org (`ability.factory.ts`). MEMBER/GUEST e o Super Admin da Plataforma (sem Membership) batem no
 * `AuthzGuard` (deny-by-default) → 403 sem executar o handler. A autoridade fina (defesa em profundidade =
 * ADMIN no contexto) e o isolamento (RLS) vivem no `AuditReadService` — guard/`ability.ts` intocados (C3).
 *
 * **Nenhum `orgId` vem do cliente** — a Organização é a do contexto resolvido no servidor. A rota só
 * recebe filtros (todos fail-closed no DTO) e paginação por cursor. GET, nada muda: a trilha é append-only
 * e imutável pelo banco (correção = novo Evento, escrito pelos produtores 8.4/8.5/8.6).
 */
@Controller('organizations/audit')
export class AuditController {
  constructor(private readonly auditoria: AuditReadService) {}

  /**
   * Consulta paginada da Auditoria. Filtros: `categoria`, `operacao`, `resultado`, `ator`, `tipoAlvo`,
   * `alvo`, intervalo `de`/`ate` (sobre `occurredAt`). Paginação: `cursor`/`limite` (teto 100).
   */
  @Requer('administrar', 'Organizacao')
  @Get()
  async consultar(@Query() query: Record<string, unknown>): Promise<PaginaAuditoria> {
    return this.auditoria.consultar(parseConsultaAuditoria(query ?? {}));
  }
}
