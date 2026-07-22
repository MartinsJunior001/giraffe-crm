# Decisão de Arquitetura — Avaliação de Condições (Story 4.4)

> Consolida o gate do epics.md §1371: **"fuso oficial e semântica de comparação = Arquitetura"**. Não inventa
> nada: **DERIVA** dos precedentes já materializados. Se surgisse escolha nova não-derivável, seria
> `EXTERNAL_BLOCKER` — não é o caso.

## Contexto

A Story 4.4 avalia Condições (AND) sobre o **snapshot pós-Evento**. O gate pede a definição do **fuso oficial**
e da **semântica de comparação por tipo**. Ambos já existem no código; a 4.4 os reusa em vez de criar um segundo
catálogo/semântica (o que violaria "sem segundo catálogo de operadores incompatível" — Story §1355).

## Decisão 1 — Semântica de comparação por tipo de Campo = `record-query.core.ts` (3.5)

- **Fonte única do mapeamento `FieldType → categoria`**: a função `categoriaDeCampo(type)`, **exportada** de
  `apps/api/src/databases/records/record-query.core.ts` (mudança aditiva, sem alterar o comportamento de 3.5).
  Categorias: `texto`/`numero`/`data`/`selecao`/`booleano`; `FILE` → `null` (gated, AD-28).
- **Operadores de Campo** = os de 3.5 (`igual`/`contem`/`maior`/`menor`/`intervalo`/`contemOpcao`) acrescidos dos
  operadores EXPLÍCITOS que o domínio de Condição exige (Story §1357/§1360): `diferente`, `preenchido`, `vazio`,
  `mudou`. É o MESMO espaço de operadores, estendido de forma compatível — não um catálogo paralelo.
- **Regras de valor herdadas de 3.5**: número exige `number` finito (sem coerção de string); data validada por
  parse (fail-closed se malformada — herda a lição anti-DoS de cast de 3.5); texto/seleção comparados como
  literais. **Sem coerção implícita** entre tipos incompatíveis (Story §1360).
- **Compatibilidade fina operador↔tipo** é resolvida na AVALIAÇÃO (o tipo do Campo vive no snapshot), como 3.5
  valida contra a definição viva. Na CONFIGURAÇÃO, valida-se só que o operador é um operador de Campo conhecido.

## Decisão 2 — Fuso oficial = instante absoluto UTC (`@db.Timestamptz`, 2.12/DIV-1)

- A base temporal do projeto são **instantes absolutos** (2.12: `CardPhaseEntry.enteredAt` em `@db.Timestamptz`;
  `DomainEvent.occurredAt` idem na 4.3). Não há fuso "de parede" persistido; o instante É a referência.
- A comparação de **prazo/marco/data** é, portanto, sobre instantes absolutos UTC. A **referência temporal** da
  avaliação é `snapshot.avaliadoEm` = `occurredAt` do Evento gatilho — congelada, para o determinismo (Story
  §1358: "execução tardia na fila não altera retroativamente o resultado").
- O limiar de marco é **inclusivo** (`avaliadoEm >= marco`), coerente com `derivarSaude` (2.13).

## Decisão 3 — Contrato do snapshot pós-Evento

- `SnapshotAvaliacao` (`condition-snapshot.ts`) é a fotografia congelada montada pelo **motor (4.6)** sob
  `withTenantContext` (RLS). A 4.4 entrega o TIPO e o avaliador puro; **não monta o snapshot** (sem consumidor
  concreto — AD-11).
- Isolamento por construção: referência cross-tenant não entra no snapshot (a policy responde "não existe") ⇒ o
  avaliador a trata como falso (fail-closed). O avaliador **não** autoriza por `orgId` (é só carimbo).

## Consequência

Nenhuma escolha arquitetural nova. A 4.4 é aditiva e reusa 3.5 + 2.12. `EXTERNAL_BLOCKER`: **não**.

## Débitos registrados

- **DEB-4-4-SNAPSHOT-BUILDER**: a montagem de `SnapshotAvaliacao` sob RLS (ler Card/Registro/marcos/vínculos,
  derivar saúde via `derivarSaude`, preencher `valoresAnteriores` a partir do envelope do Evento) é da 4.6.
- **DEB-4-4-RESPONSAVEL-CONDICAO**: o epics.md cita "responsável" ao falar de referência removível (§1362); não
  há Condição de Responsável nos 5 domínios do §1355. Fica fora da Fase 1 (AD-11) até haver consumidor.
