# Analyze — Story 4.4: consistência cross-artefato

Análise não-destrutiva entre `spec.md`, `plan.md`, `tasks.md` e o `epics.md` (fonte autoritativa).

## Cobertura dos critérios de aceite do epics.md (§1364–1368)

| AC do epics.md | Onde | Teste |
|---|---|---|
| AND sobre snapshot pós-Evento; sem Condição segue direto | spec §5.1/§5.2 | `condition-eval` (b) |
| avaliação tardia usa o snapshot (não muda retroativamente); revalidação de estado antes da Ação = 4.5/4.6 | spec §5.2, §2 (fora) | `condition-eval` (e)/(g); revalidação = 4.6 |
| nulo/vazio/ausente e tipos incompatíveis explícitos, sem coerção; datas no fuso oficial | spec §5.4/§5.5, §6 | `condition-eval` (a)/(c)/(d) |
| Campo/Fase/responsável/recurso removido/arquivado invalida a referência (impede ativação/bloqueia fail-closed) | spec §5.7 | `revalidarReferencias` (4.1/4.2) + `condition-eval` (f) |
| Condições não revelam valores inacessíveis nem produzem efeitos | spec §7, §5.8 | `condition-eval` (f); resultado só metadados |

## Consistência interna

- **Sem contradição** entre spec/plan/tasks: 7 tipos, 5 domínios, AND, fail-closed, sem migration.
- **Gate de Arquitetura**: consolidado por derivação (spec §6, plan, decision doc). Nenhuma escolha nova ⇒ sem
  `EXTERNAL_BLOCKER`. Alinhado ao epics.md §1371 ("fuso oficial e semântica de comparação = Arquitetura").
- **AD-11**: fronteira clara — o avaliador é entregue; o motor (4.6) é o consumidor. Nenhuma antecipação
  (sem persistência de snapshot/resultado; a 4.6/4.8 decidem).
- **INV-FORM/`Card ≠ Registro`**: `CARD_FIELD_VALUE` e `RECORD_FIELD_VALUE` são tipos distintos lendo domínios
  distintos do snapshot; o catálogo não funde Card e Registro.

## Divergências / observações

- **DIV-4.4-1 (resolvida)**: o epics.md fala em "responsável" como domínio de referência removível (§1362). Na
  Fase 1 o catálogo NÃO tem Condição de Responsável (não está entre os 5 domínios listados no §1355: Card, Campo,
  prazo, relacionamento, Fase). Mantido fora — não inventar tipo sem consumidor (AD-11). A invalidez de
  referência de Campo/Fase/Registro já é coberta por `revalidarReferencias` + fail-closed.
- **DEB-4-4-SNAPSHOT-BUILDER**: a MONTAGEM do `SnapshotAvaliacao` sob RLS (ler Card/Registro/marcos/vínculos e
  derivar saúde) é da 4.6 — a 4.4 entrega só o CONTRATO (tipo) e o avaliador. Registrado para a 4.6.
- **Nota herdada da 4.3 (`DEB-4-3-OUTBOX-UNIFICACAO`)**: a 4.6 reconcilia `DomainEvent`×`MovementEvent`; não
  afeta a 4.4 (a 4.4 não consome o outbox — recebe o snapshot pronto).

## Veredito

Artefatos **consistentes** com a fonte autoritativa. Pronto para implementação (já realizada) e gates.
