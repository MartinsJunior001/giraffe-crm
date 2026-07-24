/**
 * Núcleo PURO da distribuição de Notificações (Story 5.6) — transformações da lista de destinatários, SEM banco
 * e SEM Nest. É aqui que as regras testáveis do gate OQ-33 (b/f) e da regra do ator (a) viram código: colapso
 * por Membership (dedup), exclusão/inclusão do ator conforme o tipo, CAP de fan-out fail-closed, e a forma do
 * **resultado explícito** (nunca falha silenciosa — §1634/§1636). A resolução de candidatos (I/O), a
 * revalidação de acesso e as preferências vivem no serviço; a POLÍTICA por-candidato é pura.
 */

/** Um candidato a destinatário: a pessoa NA Org (Membership) + sua `Account` global. */
export interface CandidatoDestinatario {
  membershipId: string;
  userId: string;
}

/**
 * Teto de fan-out de UMA distribuição (defesa operacional — OQ-33.f). Excedente é truncado de forma
 * determinística (por `membershipId`) e sinalizado ao chamador para log. Bem acima de qualquer caso legítimo da
 * Fase 1 (Responsável ≤ 1; partes de um Card, poucas).
 */
export const MAX_DESTINATARIOS = 500;

/**
 * Colapsa candidatos por `membershipId` (dedup — OQ-33.b): a mesma pessoa resolvida por múltiplos papéis/
 * relações (Responsável + concessão direta) vira UM candidato. Preserva a ordem da primeira ocorrência
 * (determinístico). É a 1ª barreira de deduplicação; a `dedupeKey` da fonte 5.3 é a garantia final.
 */
export function colapsarPorMembership(
  candidatos: readonly CandidatoDestinatario[],
): CandidatoDestinatario[] {
  const vistos = new Map<string, CandidatoDestinatario>();
  for (const c of candidatos) {
    if (!vistos.has(c.membershipId)) vistos.set(c.membershipId, c);
  }
  return [...vistos.values()];
}

/**
 * Aplica a regra do ator (OQ-33.a): se o tipo NÃO inclui o ator (`incluirAtor=false`), remove o candidato cuja
 * `Account` é o ator do evento — quem dispara não recebe da própria ação (RN-082). `atorUserId` nulo (evento de
 * sistema/automação) ⇒ nada a excluir. Comparação por `userId` (a identidade global do ator).
 */
export function aplicarRegraAtor(
  candidatos: readonly CandidatoDestinatario[],
  atorUserId: string | null,
  incluirAtor: boolean,
): CandidatoDestinatario[] {
  if (incluirAtor || atorUserId === null) return [...candidatos];
  return candidatos.filter((c) => c.userId !== atorUserId);
}

/** Resultado da aplicação do CAP: a lista (possivelmente truncada) e quantos foram descartados. */
export interface ResultadoCap {
  destinatarios: CandidatoDestinatario[];
  truncados: number;
}

/** Aplica o CAP de fan-out (determinístico por `membershipId`). Não lança — devolve o descarte para log. */
export function aplicarCap(candidatos: readonly CandidatoDestinatario[]): ResultadoCap {
  if (candidatos.length <= MAX_DESTINATARIOS) {
    return { destinatarios: [...candidatos], truncados: 0 };
  }
  const ordenados = [...candidatos].sort((a, b) => a.membershipId.localeCompare(b.membershipId));
  return {
    destinatarios: ordenados.slice(0, MAX_DESTINATARIOS),
    truncados: ordenados.length - MAX_DESTINATARIOS,
  };
}

/**
 * Resultado EXPLÍCITO de uma distribuição (§1634/§1636 — nunca falha silenciosa):
 * - `entregue`: a Notificação foi criada na fonte 5.3 (`notificationId` + `destinatariosCriados`).
 * - `sem_destinatario`: nenhum candidato sobreviveu (ausente / perdeu acesso / silenciou o tipo) — a fonte NÃO
 *   é chamada (ela exige ≥1 destinatário); o `motivo` é auditável.
 */
export type ResultadoDistribuicao =
  | {
      tipo: 'entregue';
      type: string;
      sourceEventId: string;
      notificationId: string;
      destinatariosCriados: number;
    }
  | {
      tipo: 'sem_destinatario';
      type: string;
      sourceEventId: string;
      motivo: MotivoSemDestinatario;
    };

/** Por que a distribuição não teve destinatário — sempre explícito. */
export type MotivoSemDestinatario =
  'nenhum_candidato_resolvido' | 'nenhum_com_acesso_atual' | 'todos_silenciados';
