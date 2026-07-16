import { NotFoundException } from '@nestjs/common';
import { exigirGerenciarDatabase, resolverPoderNoDatabase } from '../../databases/database-authz';
import type { withTenantContext } from '../../kernel/db/tenant-context';
import { exigirGerenciarPipe, resolverPoderNoPipe } from '../pipe-authz';
import type { AlvoFormulario } from './form-locate';

/**
 * Roteamento de autorização por CONTEXTO do Formulário (Story 3.3, DBT-AUTHZ-01). O Form Builder é único
 * (INV-FORM-01), mas quem autoriza depende do owner:
 *  - Formulário inicial/de Fase → `pipe-authz` (config do Pipe);
 *  - Formulário de Database → `database-authz` (3.2 — gerenciar = Admin da Org / Admin do Database; ler =
 *    qualquer poder no Database; sem acesso → 404 não-enumerante).
 *
 * Funções PURAS (sem provider) — importáveis pelos serviços do builder sem ciclo de DI: `database-authz` não
 * importa nada de `pipes/`. **Não** tocam o guard/`ability.ts` (C3 congelado): a guarda grossa é `@Requer`; esta
 * é a guarda FINA no serviço. Ambos `pipe-authz` e `database-authz` consomem apenas `Principal {accountId, papel}`,
 * satisfeito estruturalmente pelo `ContextoOrganizacional`.
 */

type Db = ReturnType<typeof withTenantContext>;

interface Principal {
  accountId: string;
  papel: string;
}

/**
 * Exige **gerenciar** o Formulário do contexto (montar/evoluir/publicar). Database → `exigirGerenciarDatabase`
 * (Admin da Org / Admin do Database; 403 se só opera/lê; 404 sem acesso). Pipe/Fase → `exigirGerenciarPipe`.
 */
export async function exigirGerenciarForm(
  db: Db,
  principal: Principal,
  alvo: AlvoFormulario,
): Promise<void> {
  if (alvo.databaseId) {
    await exigirGerenciarDatabase(db, principal, alvo.databaseId);
    return;
  }
  if (!alvo.pipeId) throw new NotFoundException();
  await exigirGerenciarPipe(db, principal, alvo.pipeId);
}

/**
 * Exige ao menos **ler** o Formulário do contexto (404 não-enumerante sem acesso). Database → qualquer poder
 * no Database (`resolverPoderNoDatabase`). Pipe/Fase → `resolverPoderNoPipe`.
 */
export async function resolverPoderNoForm(
  db: Db,
  principal: Principal,
  alvo: AlvoFormulario,
): Promise<void> {
  if (alvo.databaseId) {
    await resolverPoderNoDatabase(db, principal, alvo.databaseId);
    return;
  }
  if (!alvo.pipeId) throw new NotFoundException();
  await resolverPoderNoPipe(db, principal, alvo.pipeId);
}
