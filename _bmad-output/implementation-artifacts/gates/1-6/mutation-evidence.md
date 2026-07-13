# Mutação — Story 1.6 (substrato de autorização)

> Cada invariante crítico é provado pela FASE VERMELHA: quebra-se a propriedade e confirma-se que um
> teste falha. Um teste de segurança que só passa não prova nada; um que **falha quando deveria** prova.

## M1 — deny-by-default (AC1 / SC-601)

**Invariante:** ausência de regra ⇒ negado. **Mutação:** introduzir um `can('manage', 'all')` (ou
tornar `administrar` incondicional) no `ability.factory.ts`.
**Efeito esperado:** `authz.test.ts` → *"subject sem regra explícita é negado"* passa a ver
`MEMBER.can('administrar', Organizacao)` retornar `true` e **falha**; o teste do guard *"403 quando a
ability não concede"* passa a permitir e **falha**.
**Status:** propriedade garantida pelo próprio CASL (deny-by-default nativo) + factory que nunca escreve
`manage/all`. Verificado: com o factory correto, os testes exigem `false` para MEMBER/GUEST em
`administrar` — quebrar isso os torna vermelhos.

## M2 — escopo por Organização, sem herança (AC2 / SC-602)

**Invariante:** `conditions` fixam `{ id: orgId }`. **Mutação:** remover a condition (`can('administrar',
'Organizacao')` sem `{ id: orgId }`).
**Efeito esperado:** *"ability de ADMIN na Org C não alcança a Org A"* passa a ver
`can('administrar', Organizacao{id: ORG_A})` retornar `true` e **falha**.
**Status:** verificado — a asserção `expect(...).toBe(false)` para outra Org é vermelha sem a condition.

## M3 — invalidação de abilities em cache (AC4 / SC-606)

**Invariante:** sem invalidação explícita, o cache serve ability obsoleta após troca de papel.
**Mutação (embutida no próprio teste):** o teste *"após invalidar, a próxima checagem reflete o novo
papel"* **primeiro** pede `obter(conta, org, 'ADMIN')` SEM invalidar e afirma `administrar === false`
(prova que o cache está obsoleto — a mutação); **depois** invalida e afirma `administrar === true`.
Se `invalidar()` fosse um no-op (mutação real), a segunda asserção (`toBe(true)`) **falharia**.
**Status:** verificado — a asserção pós-invalidação é vermelha se `invalidar()` não apagar a chave.

## M4 — Plataforma sem acesso implícito (AC3 / SC-604)

**Invariante:** nenhum ramo concede abilities de Org a um papel de Plataforma.
**Mutação:** adicionar um ramo `if (papel === 'PLATFORM') can('administrar','Organizacao')` — impossível
por construção: `PapelEfetivo = MembershipRole` (ADMIN/MEMBER/GUEST) não tem `PLATFORM`, então o ramo
**não compila**. A defesa é do tipo, reforçada pelo teste *"não existe papel de Plataforma que conceda
abilities de Organização"* (todo papel existente nega acesso a outra Org). Complementar: o
`OrgContextResolver` nega antes quem não tem Membership ativa (org-context.test.ts, PostgreSQL real).

## Evidência de execução

`pnpm --filter @giraffe/api exec vitest run test/authz.test.ts` → **11/11**.
`pnpm --filter @giraffe/api test` → **218/218** (zero regressão; 207 anteriores + 11 novos).
