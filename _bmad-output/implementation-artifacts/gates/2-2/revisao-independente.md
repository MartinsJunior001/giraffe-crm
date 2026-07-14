# Revisão independente — Story 2.2, incremento 1 (PR #18)

> Três revisores **read-only** de contexto fresco, que não implementaram a Story, revisaram o diff
> `story/2-1...story/2-2` diretamente sobre código/migration/rollback/testes, ignorando os aceites do
> implementador. É uma Story **CRÍTICA** (tabela nova, RLS, migration, GRANTs), logo recebeu a bateria
> completa. Consolida vereditos e o tratamento dos findings.
>
> **Independência:** subagentes iniciados pelo Orquestrador, contexto fresco, read-only, sem participação
> na implementação. O **merge permanece ação sujeita ao guardrail** (humano/regra de permissão).

## Vereditos

| Revisor | Veredito |
|---|---|
| Blind Security | **SECURITY APPROVED** |
| Edge Case Hunter | **APPROVED WITH LOW FINDINGS** (1 MEDIUM) |
| Acceptance Auditor | **ACCEPTANCE APPROVED** |

Convergência: RLS `ENABLE+FORCE` com `WITH CHECK` duplo, GRANT sem DELETE (dono = migrator, sem
`ALTER DEFAULT PRIVILEGES` escondido), índice único parcial impõe unicidade sem corrida (P2002→409),
não-enumeração (404 Pipe / 400 Membership), auditoria da tentativa negada, **nenhum teste tautológico**
(WITH CHECK via `createMany` sem RETURNING; `relowner`; DELETE→`permission denied`). Sem antecipação do
incremento 2 e sem erosão de contrato L1 (C3/guard intacto; C4/RLS replicado).

## Findings e tratamento

### MEDIUM — corrigido

- **[Edge Case #1] Falso `denied` de auditoria em `revogar`/`alterarPapel`.** `updateMany where {state:'ACTIVE'}`
  casando 0 linhas (concessão já REVOKED, de outro Pipe, inexistente/outra Org) era classificado como
  tentativa filtrada por RLS → linha `denied` na trilha FR-214. Mesma classe do MEDIUM da 2.1.
  **Correção (`pipe-grants.service.ts`):** helper `exigirConcessaoAtivaDoPipe` faz um `findUnique` (leitura,
  não auditada) **antes** do `updateMany`; os casos 404 não emitem `updateMany`, logo não geram falso
  `denied`. **Teste:** re-revogar → 404 e alterar papel de concessão revogada → 404 (`pipe-grants-http.test.ts`).

### LOW — corrigido

- **[Acceptance] Rótulos `SC-222`/`SC-225`/`AC1` aspiracionais nos `describe`.** Cobriam só o CRUD da
  concessão, não o poder-de-papel/corte-de-acesso (incremento 2). **Correção:** rótulos ajustados para
  refletir o que é provado (SC-223 CRUD, SC-226 isolamento; "incremento 1").

### LOW — aceito e rastreado (débitos com os seis campos)

**DBT-2.2-FK-COMPOSTA** — FKs de `PipeGrant` referenciam `Pipe(id)`/`Membership(id)`, não `(orgId,id)`.
- *Impacto:* a coerência de Org entre a concessão e o Pipe/Membership referenciados é garantida por
  app+RLS, não pela FK (defesa-em-profundidade ausente no banco).
- *Justificativa para não corrigir agora:* isolamento vivo intacto (`conceder` valida via RLS→404/400);
  referência cross-org exigiria burlar o serviço; sem consumidor de resolução de acesso no incremento 1.
  Corrigir exige `UNIQUE(orgId,id)` em `Pipe` (2.1) e `Membership` (1.2) — cruza fronteiras de Story.
- *Responsável:* Escritor da trilha de schema/RLS. *Lote-alvo:* L6/hardening (ou incremento 2, junto da
  resolução de acesso que consumirá a FK). *Critério de correção:* FKs compostas `(orgId,pipeId)`/
  `(orgId,membershipId)` + `UNIQUE(orgId,id)` nas tabelas-pai; teste provando rejeição de vínculo cross-org
  no banco. *Gate:* `migration-check` + teste RLS de vínculo cross-org (fase vermelha).

**DBT-2.2-MEMBERSHIP-ADVISORY** — `conceder` valida `Membership.state=ACTIVE` em transação separada do INSERT.
- *Impacto:* janela em que a Membership vira SUSPENDED/REMOVED entre o check e o INSERT ⇒ concessão ACTIVE
  apontando para Membership não-ativa. Não é falha de isolamento.
- *Justificativa:* `withTenantContext` recusa `$transaction` (escopo da Story 1.3); a resolução de papel
  efetivo (incremento 2) **precisa** reconferir `Membership.state` de qualquer modo. *Responsável:* Escritor
  2.2. *Lote-alvo:* incremento 2. *Critério:* a resolução de acesso rechecar `Membership.state`; documentar
  a checagem de conceder como advisória. *Gate:* teste de aceite do incremento 2 (papel só vale com
  Membership ativa).

**DBT-2.2-ROSTER-PIPE-ARQUIVADO** — gerir concessões de um Pipe ARCHIVED é permitido (`exigirPipeDaOrg` não
filtra estado).
- *Impacto:* roster editável em Pipe arquivado. Spec silente (pode ser intencional).
- *Justificativa:* mesma classe do LOW da 2.1 (PATCH em Pipe arquivado); decisão de produto pendente sobre
  congelar o roster ao arquivar. *Responsável:* PM/Escritor. *Lote-alvo:* incremento 2 (quando o acesso a
  Pipe considerar estado). *Critério:* decisão registrada; se for congelar, `409` ao conceder em Pipe
  arquivado + teste. *Gate:* checklist de aceite do incremento 2.

**DBT-2.2-READ-AFTER-WRITE** — `alterarPapel`/`revogar` releem por `findUnique` em transação separada.
- *Impacto:* corpo devolvido pode refletir estado concorrente (cosmético; sem corrupção). *Justificativa:*
  muito baixo; `withTenantContext` recusa `$transaction`. *Responsável:* Escritor 2.2. *Lote-alvo:*
  oportunístico (`updateManyAndReturn`). *Critério:* resposta derivada da própria escrita. *Gate:* revisão
  de código.

### INFO (sem ação)
- `UUID_RE` relaxa nibbles de versão/variante (aceita id sintético do seed) — deliberado; fronteira é RLS+service.
- `GET listar` exige `administrar Pipe` (spec dizia "acesso") — mais restritivo (deny-by-default), coerente com "só Admin da Org em 2.2".

## Estado dos gates após as correções
`format:check` · `lint` · `typecheck` · `build` verdes; suíte da API verde; suítes de grants **13/13**. CI do PR #18 revalidado no push.

## Conclusão
Incremento 1 **aprovado com findings tratados**: o único MEDIUM foi corrigido na origem (com teste), os LOW
acionáveis viraram débitos rastreados com responsável/lote/critério/gate, e não há CRITICAL/HIGH. Merge do
#18 depende do merge da 2.1 (feito) e do guardrail de merge.
