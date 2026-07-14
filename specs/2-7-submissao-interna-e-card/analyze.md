# Analyze — Story 2.7

## Cobertura dos critérios
- **SC-271** (submeter cria Card na 1ª Fase ativa, com a versão publicada e valores validados) — `cards-http`:
  Card criado com `valores` iguais **e** evento `CREATED` (AD-13); **congelamento** (republicar não muda o Card;
  submissão nova usa a versão corrente); **1ª Fase ativa** entre várias (menor `position`, exercita o `orderBy`)
  + `submission` (unidade). ✅
- **SC-272** (idempotência) — `cards-http` (mesma chave→mesmo Card; chave nova→outro) + **concorrência** (6
  submissões paralelas → 1 Card + 1 evento, só 201/409) + `cards-rls` (UNIQUE barra a 2ª inserção, P2002). ✅
- **SC-273** (autorização "operar") — `cards-authz` (Admin da Org e Membro submetem; Viewer 403; sem concessão
  404). Prova o poder do Membro do Pipe **recém-ativado**. ✅
- **SC-274** (gate de publicação e validação) — `cards-http` (não publicado → 409; form inexistente → 404; chave
  ausente → 400; Campo desconhecido/tipo errado → 400; Seleção por `id`, rótulo → 400). ✅
- **SC-277/278** (imutabilidade/append-only pelo GRANT) — `cards-rls`: `Card` só SELECT+INSERT (UPDATE **e**
  DELETE → permission denied); `CardHistory` sem UPDATE/DELETE; + isolamento (cross-tenant, sem contexto, WITH
  CHECK). ✅

## Achado da revisão corrigido (HIGH)
- **D-R0 — P2028 na corrida de idempotência (Edge Case Hunter):** o retry só reconhecia `P2002`; sob contenção o
  Prisma lança `P2028` (a 2ª submissão bloqueia no índice único e o timeout da tx estoura antes da violação se
  materializar), que caía em `throw err` → **500**. CORRIGIDO: `isConflitoDeSubmissao` (P2002 ‖ P2028), simétrico
  ao `isConflitoDePublicacao` da 2.6; conflito sem Card visível → **409** (repita), nunca 500. Regressão
  determinística: 6 submissões paralelas da mesma chave → só 201/409, 1 Card, 1 evento.

## Divergências / riscos residuais
- **D-R1 — atomicidade cross-tabela:** criar toca INSERT `Card` + INSERT `CardHistory`. Resolvida por transação
  interativa com contexto no client RAIZ (`set_config(..., true)`), o mesmo primitivo interno de
  `withTenantContext` já usado na publicação (2.6). Não é bypass de RLS: o contexto é definido dentro da
  transação; WITH CHECK/USING valem. Auditoria emitida à mão (o caminho não passa pela extensão); `Card` e
  `CardHistory` também estão em `MODELOS_AUDITADOS` para escritas via extensão.
- **D-R2 — idempotência via `acharPorChave` fora da tx:** no retry (P2002), o Card existente é lido numa segunda
  operação (com contexto), não dentro da tx que falhou. É seguro: a linha já foi comitada pela submissão
  original; a leitura é isolada por RLS. Sem lost update (não há escrita no caminho de retry).
- **D-R3 — 1ª Fase ativa lida fora da tx de criação:** a Fase é resolvida antes do INSERT atômico. Se a Fase for
  arquivada entre a leitura e o INSERT, o Card ainda referencia uma Fase válida (arquivar é `state`, não DELETE;
  a FK continua íntegra). Sem trava "não submeter em Pipe cuja 1ª Fase mudou" — coerente com o escopo (movimento
  entre Fases é 2.10). Registrado.
- **D-R4 — `valores` sem normalização por Campo:** ficam em JSONB por `Field.id` (opção por `id`), não em tabela
  de valores. Coerente com o snapshot JSON da 2.6 e com AD-11 (sem normalização especulativa). A validação
  garante que só Campos do snapshot entram.
- **D-R5 — Campo FILE gated:** a validação trata FILE como string (referência); a capacidade real de upload é do
  E3 (AD-28). Não materializado. Registrado.
- **D-R6 — obrigatoriedade ausente:** `Field` não tem o atributo (2.4/2.5); a submissão não a valida (valor
  ausente é permitido). Quando existir, a validação passa a exigi-lo. Registrado (Constitution II).

## Regressão
2.1–2.6 intocadas (só adições + `MODELOS_AUDITADOS` += `Card`/`CardHistory` e `pipe-authz` += `operar`). Suíte
cheia verde: 48 arquivos, 424 testes.
