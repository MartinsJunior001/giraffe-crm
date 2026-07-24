import { BadRequestException } from '@nestjs/common';
import type { withTenantContext } from '../../kernel/db/tenant-context';
import {
  type ConfiguracaoValidada,
  extrairReferencias,
  type TipoDeReferencia,
} from './automation-config';

/**
 * Revalidação de REFERÊNCIAS da configuração da Automação **sob RLS** (Story 4.1 — F-A4; reusada pela
 * gestão 4.2: editar/ativar/duplicar). Extraída de `AutomationsService` na 4.2 para que a MESMA regra de
 * alcance não seja copiada em dois serviços e passe a divergir (mesmo motivo de `pipe-authz.ts`).
 *
 * Fail-closed: o que não for encontrado invalida a configuração (400). A FK composta cobre o **Pipe
 * proprietário** (F-A1), mas as referências vivem dentro do JSON, onde **não há FK alguma** — sem esta
 * releitura, um `Field.id`/`Record.id` de OUTRA Organização seria persistido tal e qual e só falharia
 * (ou pior, resolveria) quando o motor da 4.6 fosse executá-lo.
 *
 * A releitura acontece por `withTenantContext`: a policy é quem responde "não existe" para um ID de outra
 * Organização — não há `where orgId` manual, e o serviço não tem como esquecer o filtro.
 */

type DbComContexto = ReturnType<typeof withTenantContext>;

/**
 * Relê TODA referência da configuração sob RLS e lança 400 `REFERENCIA_INALCANCAVEL` (sanitizado, só o
 * TIPO) se alguma não é alcançável nesta Organização (e, quando cabe, neste Pipe). Alvo determinístico por
 * `id` exato agrupado por tipo — nunca varredura em massa (escopo da Story).
 */
export async function revalidarReferencias(
  db: DbComContexto,
  pipeId: string,
  config: ConfiguracaoValidada,
): Promise<void> {
  // Agrupa por TIPO e resolve cada tipo em UMA query (`id: { in: [...] }`). A alternativa ingênua — uma
  // query por referência — é um amplificador de carga (NFR-4); aqui o custo é limitado ao nº de TIPOS.
  const porTipo = new Map<TipoDeReferencia, Set<string>>();
  for (const ref of extrairReferencias(config)) {
    const ids = porTipo.get(ref.tipo) ?? new Set<string>();
    ids.add(ref.id); // `Set`: a mesma referência repetida não vira trabalho repetido.
    porTipo.set(ref.tipo, ids);
  }

  for (const [tipo, ids] of porTipo) {
    const encontrados = await idsAlcancaveis(db, pipeId, tipo, [...ids]);
    if (encontrados.size !== ids.size) {
      // Sanitizado: diz o TIPO e que é inalcançável, sem revelar QUAL id faltou nem confirmar se o
      // recurso existe noutra Organização — a resposta não pode virar oráculo de existência.
      throw new BadRequestException({ motivo: 'REFERENCIA_INALCANCAVEL', tipo });
    }
  }
}

/** Quais dos `ids` daquele tipo são alcançáveis nesta Organização (e, quando cabe, neste Pipe). */
async function idsAlcancaveis(
  db: DbComContexto,
  pipeId: string,
  tipo: TipoDeReferencia,
  ids: string[],
): Promise<Set<string>> {
  const colher = (linhas: { id: string }[]): Set<string> => new Set(linhas.map((l) => l.id));

  switch (tipo) {
    case 'PIPE':
      // Só o Pipe proprietário. Desde a 5.7 a ref `PIPE` é também o ALVO de `TASK_CREATE`/`REQUEST_CREATE`:
      // este filtro é a FONTE REAL do invariante de não-ampliação por Pipe — a allowlist do principal
      // (`escopoAlcancaRecurso`) é semeada por estas mesmas refs já validadas, então quem barra uma config
      // com Pipe alheio é ESTA linha (400 `REFERENCIA_INALCANCAVEL`), provado em `automation-e5-e2e`.
      return new Set(ids.filter((id) => id === pipeId));
    case 'PHASE':
      // A Fase precisa ser do Pipe proprietário: uma Automação não alcança Fases de outro Pipe.
      return colher(
        await db.phase.findMany({ where: { id: { in: ids }, pipeId }, select: { id: true } }),
      );
    case 'FORM':
      return colher(await db.form.findMany({ where: { id: { in: ids } }, select: { id: true } }));
    case 'FIELD':
      return colher(await db.field.findMany({ where: { id: { in: ids } }, select: { id: true } }));
    case 'DATABASE':
      return colher(
        await db.database.findMany({ where: { id: { in: ids } }, select: { id: true } }),
      );
    case 'RECORD':
      return colher(await db.record.findMany({ where: { id: { in: ids } }, select: { id: true } }));
    default: {
      // Exaustividade verificada em COMPILAÇÃO: um tipo novo na allowlist sem tratamento aqui quebra o
      // build, em vez de silenciosamente passar a aceitar referência não validada.
      const _exaustivo: never = tipo;
      return _exaustivo;
    }
  }
}
