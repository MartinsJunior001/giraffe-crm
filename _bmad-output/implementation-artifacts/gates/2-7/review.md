# Revisão independente — Story 2.7 (submissão interna do Formulário inicial e criação do Card)

> Revisão adversarial de **risco ALTO**: quatro revisores read-only em paralelo. CRITICAL/HIGH corrigidos com
> regressão; MEDIUM que afete aceite/dados/histórico/isolamento bloqueia merge. Evidência real; PostgreSQL real.

## Revisores e veredito
- **Blind Security** — sem CRITICAL/HIGH. Isolamento (RLS+FORCE, WITH CHECK), imutabilidade/append-only pelo
  GRANT, `orgId`/`actorId` sempre do servidor, allowlist anti-mass-assignment, contexto transaction-local sem
  vazamento de pool e idempotência sem duplicata/lost update — todos confirmados. **1 MEDIUM** (auditoria manual
  não registra negação), LOWs (GRANT UPDATE de Card sem consumidor; idempotência não vinculada ao payload).
- **Architecture Reviewer** — COMPATÍVEL com AD-6/10/11/12/13 e invariantes; docstrings honestas (não repetem o
  erro da 2.6). **1 MEDIUM** (GRANT UPDATE de Card sem consumidor nem teste de escopo); LOWs (`updatedAt`/`summary`
  sem consumidor; docstring de `pipe-authz` desatualizada).
- **Edge Case Hunter** — **1 HIGH** (P2028 na corrida de idempotência viraria 500, ao contrário da 2.6); **1
  MEDIUM** (a corrida de idempotência não era testada — só retries sequenciais); LOWs (limite de 256KB abaixo do
  body-parser → 413; TOCTOU de Fase/publicação; idempotência atravessa versões; 201 no retry).
- **Acceptance Auditor** — SC-272/273/274/277/278 COBERTOS. **SC-271 PARCIAL (ALTA)**: "definição congelada" e
  "1ª Fase ativa" afirmados sem prova de comportamento (`formVersionId` só `typeof string`; todo fixture com 1
  Fase → `orderBy` não exercido). BAIXA: evento `CREATED` não verificado ponta-a-ponta.

## Achados e disposição

| # | Sev. | Achado | Disposição |
|---|------|--------|------------|
| Edge-H1 | HIGH | Retry de idempotência só reconhecia `P2002`; sob contenção o Prisma lança `P2028` → `throw err` → **500** não-determinístico (a publicação 2.6 já trata P2002+P2028). | **CORRIGIDO.** Novo predicado `isConflitoDeSubmissao` (P2002 ‖ P2028), simétrico ao `isConflitoDePublicacao`. No conflito sem Card visível (P2028/rollback), lança **409** ("repita"), nunca 500. Coberto pela regressão de concorrência (`cards-http`: 6 submissões paralelas → só 201/409, 1 Card, 1 evento). |
| Edge-M1 / Acc | MED | A corrida de idempotência não era testada (retries sequenciais não exercitam o INSERT×INSERT); MEMORY de guarda otimista exige regressão determinística, não só `Promise.all`. | **CORRIGIDO.** Teste `Promise.all` de 6 submissões idênticas afirmando **exatamente 1** `Card` e **1** `CardHistory` no banco (via migrator) e mesmo `id` em toda resposta com corpo — prova o fix do H1 e a atomicidade. |
| Acc-271a | ALTA | "Definição congelada" (AD-12) sem prova: `formVersionId` só `typeof string`; sem teste de republicação. | **CORRIGIDO.** Teste de congelamento: submeter (v1) → adicionar Campo B → republicar (v2) → re-submeter a mesma chave devolve o Card com `formVersionId` de **v1 inalterado**; submissão nova aceita valor do Campo B (só existente em v2) e referencia outra versão. Prova comportamental do congelamento e de que o novo usa a versão corrente. |
| Acc-271b / Arch-2 | MED | "1ª Fase ativa" nunca testada com várias Fases; o `orderBy [position, id]` não era exercido. | **CORRIGIDO.** Teste multi-Fase: duas Fases ativas → o Card nasce na de **menor position** (a 1ª), não na última. |
| Sec-L3 / Arch-M | MED | `GRANT UPDATE` em `Card` sem consumidor nem teste de escopo na 2.7 (a Story só CRIA Card) — contraria "conceder privilégio só com o teste que prova o escopo". | **CORRIGIDO.** GRANT reduzido a `SELECT, INSERT` (migration + schema + banco vivo revogado). 2.9/2.11 acrescentam `GRANT UPDATE` com o consumidor real. Teste novo em `cards-rls` prova que UPDATE de Card → `permission denied`. |
| Acc-271c | BAIXA | Evento `CREATED` não verificado ponta-a-ponta numa submissão real (AD-13). | **CORRIGIDO.** O teste principal SC-271 afirma `contarEventos(card.id,'CREATED') === 1` após um `/submit` real; a regressão de concorrência reafirma 1 evento por Card. |
| Arch-L / pipe-authz | LOW | Docstring de `pipe-authz` listava só 2.3/2.4 como consumidores. | **CORRIGIDO.** Atualizada para 2.3–2.6 + operação de Cards (2.7). |
| Sec-M1 / Edge-L5 | MED→LOW | A tx raiz não passa pela extensão de auditoria, então uma tentativa NEGADA no INSERT não vira `result:'denied'` na trilha. | **ACEITO (seam da 2.6).** Idêntico ao caminho de publicação (auditoria manual só `allowed`); o cenário exige contexto corrompido no servidor (o `orgId` vem sempre do contexto, então o `WITH CHECK` sempre casa). Registrado; não bloqueia. |
| Edge-L1 | LOW | Limite de 256KB fica abaixo do body-parser (100KB) → nessa faixa o cliente vê **413**, não 400; branch de 256KB inalcançável. | **ACEITO.** Determinístico e seguro (413 é uma recusa honesta); o limite de string de 10KB por Campo é alcançável e funciona. É backstop defensivo. Registrado. |
| Edge-L2 | LOW | TOCTOU: Fase arquivada / Formulário despublicado entre a leitura e o INSERT. | **ACEITO (seam).** Arquivar é `state` (a Fase existe; FK íntegra); o snapshot é congelado; travas "arquivar sob uso" são contrato de 2.11. Registrado em `analyze` D-R3. |
| Edge-L3 | LOW | Idempotência atravessa versões (chave reusada após republicar devolve o Card antigo). | **ACEITO.** Semântica esperada de "chave = dedup lógico"; sem lost update. Registrado. |
| LOWs restantes | LOW | 201 no retry (nit REST); `Card.updatedAt`/`CardHistory.summary` sem consumidor na 2.7 (convenção); P2002 de outra unique → 409 (defensivo, não alcançável: Card só tem a unique de idempotência). | **ACEITOS**, registrados. Não bloqueiam. |

## Veredito
Um HIGH (Edge-H1) corrigido com regressão determinística; todos os MEDIUM de aceite/isolamento corrigidos
(congelamento, multi-Fase, GRANT reduzido, concorrência). Nenhum CRITICAL. Suíte 2.7: 27 testes; suíte cheia
verde. Pronto para commit e PR.
