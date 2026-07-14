import { createHash } from 'node:crypto';
import type { FieldType, Prisma } from '../../../generated/prisma';
import { podePublicarComArquivo, type CampoParaGate } from './file-gate';
import { lerOpcoes, TypeConfigInvalidoError } from './option-config';

/**
 * Núcleo PURO da publicação de Formulário (Story 2.6) — montagem do SNAPSHOT imutável e validação de
 * publicabilidade. Sem dependência de framework nem de banco, para ser provado em unidade. O serviço orquestra
 * (autorização, leitura, transação atômica); os invariantes de conteúdo vivem aqui.
 *
 * O snapshot congela a definição PUBLICADA: apenas Campos **ativos**, na ordem, com identidade estável (AD-12).
 * Campos arquivados não entram (não serão exibidos nem submetidos). Não existe atributo "obrigatoriedade" em
 * `Field` na 2.4/2.5 — o snapshot NÃO o inventa (Constitution II); captura o que a definição realmente tem
 * (id, label, tipo, ajuda, `typeConfig`). Se um dia um atributo de obrigatoriedade for adicionado ao Campo,
 * ele passa a ser capturado aqui.
 */

/** Tipos de Seleção — os únicos cuja publicação exige ≥1 opção ativa. */
const TIPOS_SELECAO = new Set<FieldType>(['SELECT_SINGLE', 'SELECT_MULTI']);

/** O mínimo de um Campo ativo que a montagem do snapshot observa. */
export interface CampoParaSnapshot {
  id: string;
  label: string;
  type: FieldType;
  help: string | null;
  typeConfig: Prisma.JsonValue;
}

/** Uma opção congelada no snapshot (só ativas; sem `state`, pois todas são ativas por construção). */
interface OpcaoSnapshot {
  id: string;
  label: string;
  position: number;
}

/** Um Campo congelado no snapshot. `typeConfig` normalizado (Seleção: só opções ativas, reindexadas). */
interface CampoSnapshot {
  id: string;
  label: string;
  type: FieldType;
  help: string | null;
  typeConfig: { options?: OpcaoSnapshot[] };
}

/** Snapshot integral e ordenado da definição publicada. É o conteúdo imutável de `FormVersion.snapshot`. */
export interface FormSnapshot {
  formId: string;
  fields: CampoSnapshot[];
}

/** Publicação recusada por definição inválida — o serviço traduz em 400 determinístico. */
export class PublicacaoInvalidaError extends Error {}

/**
 * Valida se a definição (Campos ATIVOS) pode ser publicada e devolve o snapshot. FALHA FECHADA: qualquer
 * violação lança `PublicacaoInvalidaError` — nada de publicar "meio válido". Regras:
 *
 *  1. Formulário sem Campo ativo NÃO publica (nada a submeter) — draft inválido, erro determinístico.
 *  2. Gate do Campo Arquivo (AD-28): `FILE` ativo sem `fileUpload` habilitado barra a publicação.
 *  3. Campo de Seleção ativo exige **≥1 opção ativa** válida (reusa o parser de `option-config`).
 *  4. `typeConfig` malformado barra (o parser lança) — nunca se "conserta" no ato de publicar.
 */
export function montarSnapshot(
  formId: string,
  camposAtivos: readonly CampoParaSnapshot[],
  opcoes: { fileUpload: boolean },
): FormSnapshot {
  if (camposAtivos.length === 0) {
    throw new PublicacaoInvalidaError('Formulário sem Campos ativos não pode ser publicado');
  }

  const paraGate: CampoParaGate[] = camposAtivos.map((c) => ({ type: c.type, state: 'ACTIVE' }));
  if (!podePublicarComArquivo(paraGate, opcoes)) {
    throw new PublicacaoInvalidaError('Campo de Arquivo indisponível impede a publicação');
  }

  const fields = camposAtivos.map((campo): CampoSnapshot => {
    let typeConfig: { options?: OpcaoSnapshot[] } = {};
    if (TIPOS_SELECAO.has(campo.type)) {
      let ativas;
      try {
        ativas = lerOpcoes(campo.typeConfig).filter((o) => o.state === 'ACTIVE');
      } catch (err) {
        if (err instanceof TypeConfigInvalidoError) {
          throw new PublicacaoInvalidaError(`Campo "${campo.label}" tem configuração inválida`);
        }
        throw err;
      }
      if (ativas.length === 0) {
        throw new PublicacaoInvalidaError(
          `Campo de Seleção "${campo.label}" precisa de ao menos uma opção ativa`,
        );
      }
      typeConfig = {
        options: ativas.map((o, i) => ({ id: o.id, label: o.label, position: i + 1 })),
      };
    }
    return { id: campo.id, label: campo.label, type: campo.type, help: campo.help, typeConfig };
  });

  return { formId, fields };
}

/**
 * Revisão determinística do snapshot: SHA-256 do JSON canônico (chaves em ordem estável). Duas montagens da
 * MESMA definição produzem a MESMA revisão; qualquer mudança (rótulo, ordem, opção) muda a revisão. Serve para
 * identificar a versão e detectar divergência entre o que foi validado e o que foi gravado.
 */
export function calcularRevisao(snapshot: FormSnapshot): string {
  return createHash('sha256').update(canonicalizar(snapshot)).digest('hex');
}

/** JSON com chaves ordenadas recursivamente — torna o hash independente da ordem de inserção das chaves. */
function canonicalizar(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(canonicalizar).join(',')}]`;
  const obj = valor as Record<string, unknown>;
  const chaves = Object.keys(obj).sort();
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${canonicalizar(obj[k])}`).join(',')}}`;
}
