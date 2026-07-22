# Plan — Story 4.4: Catálogo de Condições + avaliação AND

> Risco **ALTO**. Deriva do estado real do código em `origin/main = 8c7d9e0` (4.3 fechada).

## Abordagem

Espelhar o desenho de 4.3 (catálogo puro + enforcement no serviço) e de 3.5/2.13 (núcleo puro determinístico
fail-closed). **Zero migration, zero GRANT, guard/`ability.ts` intocado (C3 congelado).** A 4.4 entrega o
NÚCLEO avaliável; o motor (4.6) é o consumidor concreto futuro (AD-11).

## Consolidação do gate de Arquitetura (fuso oficial + semântica de comparação)

**DERIVADO** dos precedentes — registro em `decisions/condition-evaluation-4-4.md`:
1. **Semântica de comparação por tipo de Campo** ← `record-query.core.ts` (3.5). Reuso via a função
   `categoriaDeCampo` (exportada da 3.5, aditivo): FONTE ÚNICA do mapeamento `FieldType → categoria`. Operadores
   de Campo = os de 3.5 (`igual`/`contem`/`maior`/`menor`/`intervalo`/`contemOpcao`) + os explícitos de Condição
   (`diferente`/`preenchido`/`vazio`/`mudou`, §1357/§1360). Data por instante absoluto; número validado; sem
   coerção. **Não há segundo catálogo de operadores.**
2. **Fuso oficial** ← 2.12 (marcos por Fase, `@db.Timestamptz`, DIV-1): comparação sobre instantes absolutos UTC;
   `avaliadoEm` (=`occurredAt` do Evento) é a referência temporal congelada.
3. **Nenhuma escolha nova não-derivável** ⇒ sem `EXTERNAL_BLOCKER`.

## Arquivos

**Novos (`apps/api/src/pipes/automations/conditions/`):**
- `condition-catalog.ts` — catálogo fixo dos 7 tipos (5 domínios) + `exigirCondicoesNoCatalogo` (fail-closed).
- `condition-snapshot.ts` — contrato `SnapshotAvaliacao` (tipos puros; documenta a montagem sob RLS pela 4.6).
- `condition-eval.core.ts` — `avaliarCondicoes` (AND puro determinístico fail-closed).

**Alterados (aditivos):**
- `apps/api/src/databases/records/record-query.core.ts` — exporta `categoriaDeCampo` (sem mudar comportamento).
- `apps/api/src/pipes/automations/automations.service.ts` — `validar` chama `exigirCondicoesNoCatalogo`.
- `apps/api/src/pipes/automations/automation-lifecycle.service.ts` — idem no `validar`.

**Testes:**
- `apps/api/test/condition-catalog.core.test.ts` — catálogo fixo/completo + enforcement (puro).
- `apps/api/test/condition-eval.core.test.ts` — avaliador AND, provas (a)–(g) (puro).
- `apps/api/test/automations-http.test.ts` — bloco `CONDICAO_FORA_DO_CATALOGO` (integração real, config-time).

## Decisões técnicas (dentro do escopo)

- **`categoriaDeCampo` exportada** em vez de duplicar o mapa: menor mudança, fonte única, honra o gate.
- **Enforcement no serviço, não no núcleo estrutural da 4.1** — mesmo padrão do catálogo de Eventos (4.3): a 4.1
  valida FORMA (aceita qualquer `tipo`/`operador`), a 4.4 valida VOCABULÁRIO. Assim os catálogos evoluem sem
  tocar o contrato puro da 4.1, e os testes puros da 4.1 (`automations.core.test.ts`) seguem verdes.
- **Compatibilidade fina operador↔tipo de Campo é fail-closed na AVALIAÇÃO**, não na configuração — o tipo do
  Campo vive no snapshot (4.6), não é barato ler no config-time; espelha 3.5 (valida contra a definição viva).
- **Resultado por-Condição** (`ResultadoCondicao`) devolvido pelo avaliador: saída natural para a trilha da 4.8
  (só metadados, nunca o valor — possível PII). Não é antecipação: é o contrato do avaliador.
- **Sem persistir snapshot/resultado**: a 4.6/4.8 decidem a persistência com seu consumidor (AD-11).

## Riscos e mitigação

- **Quebrar regressão de 4.1/4.3/4.2**: os testes de LOG escrevem via Prisma direto (não pelo serviço), então o
  novo enforcement não os afeta; os testes HTTP usam `condicoes: []`. Confirmado por inspeção antes de codar.
- **Falso "verdadeiro por omissão"**: cada Condição é ISOLADA em try/catch ⇒ erro vira `false`, nunca disparo.
- **DoS de cast de data**: comparação em memória com `Date.parse` validado (sem cast SQL) — herda a lição de 3.5.

## Gates aplicáveis (risco ALTO)

`pre-implementation-check` → `safe-implementation` → `security-check` → `observability-check` →
`migration-check` (N/A — sem migration, registrado) → `context7-check` (Prisma 6.19.3/NestJS 11) →
testes puros + integração real → `commit-check` → PR.
