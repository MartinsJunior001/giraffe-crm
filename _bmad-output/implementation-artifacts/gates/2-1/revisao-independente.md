# Revisão independente — Story 2.1 (PR #17)

> Quatro revisores **read-only** que não implementaram a Story revisaram o diff
> `main...story/2-1-ciclo-de-vida-e-catalogo-de-pipes` diretamente sobre código/migration/rollback/testes,
> com mandato para ignorar os aceites e resumos do implementador. Este documento consolida os vereditos e
> registra como cada finding foi tratado. (A autorrevisão do implementador está em `autorrevisao-insumo.md`,
> rotulada como insumo, **não** como gate.)
>
> **Nota de independência:** os revisores foram subagentes de contexto fresco iniciados pelo agente
> implementador. Eles agregam rigor real (leram o código sem confiar nos aceites), mas cabe ao revisor
> humano decidir se essa camada satisfaz o gate estrito de Path C ou se ainda deseja um terceiro externo
> por cima. O **merge permanece ação humana** (Path A).

## Vereditos

| Revisor | Escopo | Veredito |
|---|---|---|
| Architecture Agent | D-1/C3 | **C3 COMPATIBLE — APPROVED (resolvido pelos artefatos)** |
| Blind Security | RLS, WITH CHECK, GRANT, enumeração, tenant-context, auditoria | **SECURITY APPROVED** |
| Edge Case Hunter | concorrência, transações, update cruzado, archive/restore, contexto ausente, rollback | **APPROVED WITH LOW FINDINGS** |
| Acceptance Auditor | AC1–AC4, contrato congelado, testes tautológicos, HTTP | **ACCEPTANCE CHANGES REQUIRED** (governança, não código) |

Convergência: **AC1–AC4 integralmente implementados e cobertos por teste real** (PostgreSQL e HTTP de
verdade); **nenhum teste tautológico** (o INSERT cross-org usa `createMany` sem RETURNING; "sem DELETE" usa
`deleteMany`; propriedade de dono via `relowner`); códigos HTTP corretos; isolamento provado pelo banco.

## D-1 / C3 — decisão registrada

**Resolução: EXTENSÃO LEGÍTIMA do catálogo de sujeitos, sancionada por AD-9. Contrato congelado C3
intacto.** Aplicada sem escalar, conforme a regra "se os artefatos autoritativos resolverem a decisão,
aplique-os sem pedir aprovação".

Fundamento do Architecture Agent (evidência):
- **AD-9** (`ARCHITECTURE-SPINE.md:86-89`) já nomeia `Pipe` como *subject* e já prevê que "atributos do
  recurso alimentam a política". Adicionar o sujeito `Pipe { orgId }` e popular esse escopo no guard é
  **usar** o mecanismo como projetado.
- A superfície que o **C3** congela (`l1-contratos-congelados.md:32-36`) — assinatura do `@Requer`,
  deny-by-default, ordem do guard (2º global), papel vindo do banco, chave do `AbilityCache` — permanece
  **idêntica**. A forma do objeto passado a `subject()` não faz parte da superfície congelada.
- `Organizacao` preservada bit a bit (o CASL só avalia as chaves da condition; `orgId` extra é inerte);
  nenhum caminho preexistente passa de negar para conceder; sujeito futuro que usasse `id` como id de
  recurso falharia **fechado** (nega).

**Limite de escopo desta ratificação:** ela é registrada na trilha de **implementação**. A inscrição de uma
AD numerada na `ARCHITECTURE-SPINE.md` (artefato autoritativo) — se a equipe quiser um registro formal além
do veredito independente aqui — é follow-up pelo **workflow oficial de arquitetura**, não uma edição da
implementação, e **não** é bloqueador de código (a substância já está sancionada por AD-9). Convenção de
higiene recomendada pelo Architecture Agent: sujeitos futuros que precisem de escopo por recurso seguem o
padrão de `Pipe` (forma própria org-scoped + RLS fina), nunca reutilizando `id` como id de recurso nesta
guarda grossa.

## Findings e tratamento

### MEDIUM — corrigido

- **[Edge Case #1 / Blind Security LOW] Falso `denied` de auditoria na idempotência.** Arquivar/restaurar
  um Pipe já no estado-alvo produzia `updateMany` com `{ count: 0 }`, classificado como tentativa filtrada
  por RLS → linha `denied` + warn "possível acesso cruzado". No domínio Pipe a idempotência é caminho feliz
  de primeira classe, então poluía a trilha FR-214 com falso sinal de ataque.
  **Correção (`pipes.service.ts` `arquivar`/`restaurar`):** o `obter()` inicial já carrega o `state`; quando
  o Pipe já está no estado-alvo, retorna idempotente **sem** emitir o `updateMany` — elimina o falso
  `denied` na origem e evita uma escrita inútil. Sem tocar a lógica genérica do `tenant-context`.
  **Teste:** `pipes-http.test.ts` passou a afirmar que o re-archive preserva o `archivedAt` original (não
  reescreve) e adicionou o caso de restore idempotente.

- **[Acceptance] D-1/C3 sem AD registrada.** Tratado pela seção "D-1/C3 — decisão registrada" acima
  (ratificação independente + AD-9). Não é defeito de código; todos os AC passam.

### LOW — hardening aplicado

- **[Blind Security LOW#2] Teste de mover Pipe para outra Org usava `update` (com RETURNING).** Convertido
  para `updateMany` (sem RETURNING) em `pipes-rls.test.ts`, para bater direto no `WITH CHECK` do UPDATE, sem
  depender da policy de SELECT — simétrico ao teste de INSERT.
- **[Acceptance LOW] `GET /pipes/:id` 200 não asserido diretamente.** Adicionado teste de happy-path em
  `pipes-http.test.ts`.

### LOW — aceito e rastreado (não corrigido por decisão)

- **[Edge Case #2] PATCH renomeia Pipe ARCHIVED.** O Spec é silente e `locked` é não-objetivo explícito;
  não há AC exigindo imutabilidade do arquivado. Registrado como decisão de design a confirmar quando um
  Épico futuro der semântica a `locked`. **Não bloqueia.**
- **[Edge Case #3] Resposta racy de archive/restore concorrentes.** Sem corrupção (a leitura final é
  honesta do estado commitado; `updateMany` condicional evita sobrescrita de `archivedAt`), sem 500. Débito
  de robustez, aceitável na escala atual. **Não bloqueia.**
- **[R-3 / DBT-ROLLBACK-CI]** CI exercita deploy, não rollback; SC-206 provou o rollback à mão. Débito L6.
- **[M-1]** `?arquivados=1` cai em "só ativos" (UX). Aceito.

## Estado dos gates após as correções

`format:check` ✅ · `lint` ✅ · `typecheck` ✅ (src + test) · `pnpm --filter @giraffe/api test` ✅
**255/255** (22 arquivos; +2 testes novos) · `build` ✅. As três suítes de Pipe: **25/25**.

## Conclusão

Do ponto de vista das quatro revisões independentes, a Story 2.1 está **aprovada com findings tratados**:
sem CRITICAL/HIGH, o único MEDIUM de código foi corrigido na origem, o MEDIUM de governança (D-1/C3) foi
resolvido pelos artefatos autoritativos, os LOW acionáveis viraram hardening de teste e os demais estão
rastreados. **Pré-condições restantes para o merge (ação humana):** (1) o revisor humano confirmar que
aceita esta camada de revisão como independente para o Path C — ou acrescentar um terceiro; (2) uma
re-olhada no delta das correções (pequeno e recomendado pelos próprios revisores); (3) CI verde no head
atualizado. **Nenhum merge** é executado por este agente.
