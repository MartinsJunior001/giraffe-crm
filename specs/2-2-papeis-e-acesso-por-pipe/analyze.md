# Analyze — Story 2.2: Papéis e acesso por Pipe (pré-implementação)

> Análise **não destrutiva** de consistência cruzada do **pacote de planejamento** da 2.2: épico × PRD
> (D1.4/D1.3) × Story × spec × plan × tasks × contratos congelados × débitos herdados. A implementação
> ainda não começou — o objetivo é aprovar (ou não) o pacote para codificar.
>
> Data: 2026-07-13 · Branch: `story/2-2-papeis-e-acesso-por-pipe` (empilhada sobre a 2.1)

## Resultado

**APROVADO PARA IMPLEMENTAÇÃO — com 2 gates de verificação e 1 dependência de ordem.**

O escopo é coerente com o épico e com as decisões de Produto **já aprovadas** (D1.4/D1.3); não há
`[NEEDS CLARIFICATION]` pendente; as ambiguidades de modelagem foram resolvidas por decisão fundamentada e
registradas. Restam duas verificações a fazer **durante** a implementação (não bloqueiam o início) e uma
regra de ordem (a 2.1 precede).

## Cobertura: requisito → onde será provado

| Origem | Requisito | Plano | Prova prevista |
|---|---|---|---|
| AC1 / SC-221,227 | sem papel → sem acesso, sem revelar | serviço filtra por concessão; 404 | `pipe-grants-http`/`-authz` |
| AC2 / SC-222,223 | poder exato do papel; 1 por Pipe | enum + índice único parcial | `pipe-grants-authz`/`-rls` |
| AC3 / SC-224 | Admin da Org sem concessão | `ability.factory` preserva ADMIN | regressão da 2.1 |
| AC4 / SC-225,226 | isolamento + revogação | RLS FORCE + soft-delete | `pipe-grants-rls` |
| migration / SC-228 | deploy+rollback | migration encadeada + `.down.sql` | SC próprio (banco descartável) |

## Consistência épico × PRD × spec

- **D1.4 (OQ-2)** fixa exatamente os três papéis (Admin do Pipe, Membro do Pipe, Somente leitura), o
  **modelo de concessão explícita por Pipe**, "ausência de papel = ausência de acesso", "Admin do Pipe ≠
  Admin da Org", e que os **modos condicionais não são papéis**. A spec e a Story refletem isso **sem
  desvio**.
- **D1.3 (OQ-1)** dá a matriz papel×verbo (Pipes: Administrar / Editar acessíveis / conforme papel) —
  usada para mapear o poder de cada papel. Coerente.
- O épico manda "Fora: acesso/concessão de Card (2.10)" — respeitado; Card não aparece no pacote.

## Requisitos não cobertos
**Nenhum** dos AC do épico ficou sem tarefa e critério de sucesso.

## Escopo antecipado (Constitution II)
**Nenhum.** Sem Card, sem Responsável/Observador/Comentador (D1.5), sem modos condicionais, sem gestão de
membros da Org (Épico 8), sem publicar/despublicar.

## Decisões assumidas (registradas)

- **D-2.2-1 — concessão liga a `Membership`, não `Account`.** O papel por Pipe vive dentro da Org; a
  Membership carrega `orgId`/estado. Evita concessão "sem Org". *Fundamentada; confirmável no code-review.*
- **D-2.2-2 — revogação é soft-delete** (`state=REVOKED`), não DELETE. Preserva trilha, auditável, GRANT
  sem DELETE (simétrico à 2.1).
- **D-2.2-3 — um papel efetivo por Pipe por pessoa via índice único parcial** `WHERE state='ACTIVE'`. 2ª
  concessão ativa **recusada** (não substitui em silêncio). A unicidade é do **banco**, não da app (evita
  corrida).
- **D-2.2-4 — só o Admin da Org concede em 2.2** (deny-by-default; ampliar ao Admin do Pipe é evolução).

## Riscos residuais (a vigiar na implementação)

- **RV-1 (gate) — não-enumeração na listagem filtrada.** Ao filtrar Pipes por concessão para MEMBER/GUEST,
  a query **não pode** revelar a existência de Pipes não concedidos: 404 para acesso direto a Pipe não
  concedido, e a lista simplesmente **não** os inclui. É a mesma disciplina da 2.1; **SC-227** existe para
  provar. **Verificar na implementação.**
- **RV-2 (gate) — autorização fina no lugar certo (DBT-AUTHZ-01).** A checagem "sobre ESTE Pipe" **deve**
  ficar no serviço, com o recurso carregado, **não** como condition do guard. Um teste deve provar que o
  serviço nega mesmo quando o guard concede o tipo. **Verificar na implementação.**
- **RV-3 (ordem) — dependência da 2.1.** Empilha sobre o PR #17. Não abrir PR contra `main` antes do merge
  da 2.1; após o merge, rebasear e revalidar migration/CASL/RLS/testes. Correções da 2.1 têm prioridade.

## Contratos C1–C8
- **C3 (authz)** — consumido pela extensão de regras por recurso; **o mecanismo não muda** e o
  `authz.guard.ts` **não** é tocado (a decisão D-1 da 2.1 já está fechada). Sem novo desvio de contrato.
- **C4 (RLS)** — consumido: `PipeGrant` replica o padrão de `Membership`/`Pipe`.
- C1/C2/C5/C6/C7/C8 — não tocados.

## Débitos herdados
- **DBT-AUTHZ-01** — é **consumido** por esta Story (a autorização por recurso é o seu tema). A 2.2 é o
  lugar previsto para materializar a guarda fina no serviço.
- **DBT-ROLLBACK-CI** (L6) e os débitos de staging (CR-09/D-01/D-02/D-05/D-06) — **não** tocados; seguem
  abertos. **D-06 continua bloqueando `STAGING APPROVED`.**

## Veredito
**APROVADO PARA IMPLEMENTAÇÃO.** Iniciar pela Phase 1 (schema/migration/RLS) após `context7-check` e
`pre-implementation-check`. Implementar as partes que **não** dependem do merge da 2.1; não abrir PR contra
`main` antes dele. RV-1 e RV-2 são gates de verificação durante a codificação; RV-3 é regra de ordem.
