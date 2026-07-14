# Revisão independente — Story 2.2, incremento 2 (PR #20)

> Três revisores **read-only** de contexto fresco (não implementaram a Story) revisaram o diff
> `main...story/2-2` (apenas o incremento 2: acesso por concessão) sobre código/serviço/testes, ignorando
> os aceites do implementador. Consolida vereditos, a **decisão SC-222**, o tratamento dos findings e os
> débitos rastreados.
>
> **Independência:** subagentes iniciados pelo Orquestrador, contexto fresco, read-only, sem participação
> na implementação. O **merge permanece sujeito ao guardrail** (regra de permissão).

## Escopo do incremento 2

Liga as concessões (incremento 1) ao acesso efetivo: toda Membership ativa passa a poder o TIPO `ler Pipe`
(guarda **grossa**, em `ability.factory.ts`); QUAL Pipe cada não-Admin enxerga é a guarda **fina**, no
`PipesService`, pela concessão `PipeGrant` ACTIVE da própria Membership, com não-enumeração (404). Admin da
Org vê todos sem concessão. Ciclo de vida/config do Pipe segue exigindo `administrar` (só Admin da Org).

Diff: `ability.factory.ts` (catálogo de regras), `pipes.service.ts` (`listar`/`obter` cientes de concessão +
`membershipIdAtual`), `tenant-context.ts` (`PipeGrant` em `MODELOS_AUDITADOS`), nova suíte
`pipe-access-http.test.ts`, atualização de `pipes-authz.test.ts`/`pipes-http.test.ts`. **`authz.guard.ts` e
`ability.ts` NÃO são tocados** (contrato congelado C3 intacto — confirmado por `git diff`).

## Vereditos

| Revisor | Veredito |
|---|---|
| Blind Security | **SECURITY APPROVED** |
| Edge Case Hunter | **APPROVED WITH LOW FINDINGS** |
| Acceptance Auditor | **ACCEPTANCE CHANGES REQUIRED** → itens de rastreabilidade tratados abaixo |

Convergência: isolamento entre Orgs intacto (`membershipIdAtual` roda sob RLS org-escopada; o ramo por-conta
da policy desliga com Org ativa; sem vazamento cross-tenant), `state:'ACTIVE'` em **todas** as queries de
acesso (revogar corta imediatamente), deny-by-default preservado (ciclo de vida só ADMIN), não-enumeração 404
uniforme, `AbilityCache` memoiza só a ability grossa por `(accountId, orgId, papel)` — a revogação reflete na
requisição seguinte —, **nenhum teste tautológico** (nenhuma asserção afirma o diferencial SC-222) e **nenhuma
antecipação de escopo** (`role` armazenado mas inerte — o oposto de antecipar).

## DECISÃO SC-222 → (B): armazenar o papel e preparar; diferenciação deferida

O Acceptance Auditor leu o texto exato da Story e dos artefatos autoritativos e concluiu **(B)**, não por
conveniência mas porque **(A) contradiria as fontes**:

- **SC-222** (`spec.md`): "VIEWER lê e **não** edita/move; MEMBER edita; ADMIN do Pipe administra **config** e
  não controla ciclo de vida." As três metades ativas ("MEMBER edita", "Admin do Pipe config") só são
  **observáveis** sobre recursos editáveis do Pipe.
- **PRD** (`docs/01-documentacao-base/04-permissoes/permissoes-fase-1.md`): "Admin do Pipe — configura o pipe
  (**fases, formulários, automações**)"; "Membro do Pipe — **opera cards** do pipe". Todos non-objetivos da 2.2.
- **PRD §15**: "`locked`/`starred` são **atributos do pipe, não permissões de usuário**." Logo a candidata
  mínima a "config diferencial na 2.2" (PATCH = renomear + `locked`/`starred`) **não** serve: renomear é
  ciclo de vida/catálogo governado pela Story 2.1 (Admin da Org), e `locked`/`starred` não são permissão.
- **Non-objetivos 2.2** (`spec.md`): Cards (2.7+/2.10), Fases (2.3), Formulários (2.4+) — **fora**.

Tornar o PATCH diferencial por papel de Pipe **contradiz** o PRD §7/§15 e seria **antecipação de escopo
(Constitution II)**. Portanto a decisão atual — toda concessão ACTIVE dá **leitura**; ciclo de vida/config só
Admin da Org — é **aceitável e reversível**.

**Guardrails exigidos pelo cenário B — verificados:**
1. **MEMBER/VIEWER não recebem poder não implementado:** `ability.factory.ts` só concede `ler` a não-Admin;
   `administrar` (POST/PATCH/archive/restore) só ADMIN; `role` é inerte no caminho de acesso (`grep role` no
   `pipes.service.ts` = 0). Provado em `pipes-authz.test.ts` e `pipe-access-http.test.ts` (MEMBER concedido →
   403 em PATCH/archive). Deny-by-default intacto.
2. **Onde a diferenciação ativa:** Admin do Pipe (config: fases/formulários/automações) → **Story 2.3 / 2.4+**;
   Membro do Pipe (opera cards) → **Story 2.7+ / 2.10**.
3. **Critério + gate para não esquecer:** ver **DBT-2.2-ROLE-DORMENTE** abaixo.

## Findings e tratamento

### LOW (Edge Case) — corrigido

- **[Edge Case] `alterarPapel`/`revogar` ignoravam o `count` do `updateMany`.** A guarda
  `exigirConcessaoAtivaDoPipe` (findUnique) e o `updateMany` são transações separadas
  (`withTenantContext` recusa `$transaction`). Sob **revogação concorrente** nessa janela, o `updateMany`
  casa 0 linhas, mas o método devolvia o `findUnique` seguinte → **200 com corpo enganoso** (concessão já não
  ativa) + a linha `count:0` gerava falso `denied` de auditoria. **Correção (`pipe-grants.service.ts`):**
  capturar `const { count }` e lançar `NotFoundException` quando `count === 0` — 404 honesto. O caminho
  sequencial já era coberto pela guarda; a checagem fecha a corrida concorrente (defesa; não há teste
  determinístico de concorrência — a guarda cobre o caso sequencial).

### LOW — aceito e rastreado (débitos com os seis campos)

**DBT-2.2-ROLE-DORMENTE** — `PipeRole` é gravado e editável (POST/PATCH de concessões) mas **não tem efeito
comportamental** no incremento 2: toda concessão ACTIVE concede **leitura**, independentemente do papel
(VIEWER ≡ MEMBER ≡ leitura). É a metade deferida do SC-222 (decisão B).
- *Impacto:* risco de a diferenciação por papel ser **esquecida** quando surgirem os recursos editáveis do
  Pipe; SC-222 (AC2) nunca fechado; `role` coletado sem consumidor.
- *Justificativa para deferir:* as superfícies onde o papel se diferencia (Fases, Cards, Formulários) são
  non-objetivos da 2.2; implementar agora seria antecipação de escopo contra o PRD §7/§15.
- *Responsável:* Escritor da trilha de autorização por Pipe (Épico 2). *Lotes-alvo:* **Story 2.3** (Admin do
  Pipe administra **config** — fases/formulários) e **Story 2.7/2.10** (Membro do Pipe **opera cards**; VIEWER
  só lê). *Critério de correção:* a resolução de acesso passa a **ler `role`** e a **reconferir
  `Membership.state`** ao computar o poder efetivo sobre o recurso editável; VIEWER lê e não edita, MEMBER
  edita, ADMIN do Pipe administra config e **não** o ciclo de vida. *Gate:* o **checklist de aceite das
  Stories 2.3 e 2.7/2.10 deve incluir explicitamente** a reconferência de `role` + `Membership.state` e um
  teste de poder diferencial (fase vermelha: papel errado → 403). Enquanto o débito estiver aberto, `role`
  permanece inerte por construção (nenhum caminho o consome).

**DBT-2.2-FK-COMPOSTA** — mantido do incremento 1 (FKs de `PipeGrant` referenciam `Pipe(id)`/`Membership(id)`,
não `(orgId,id)`). Defesa-em-profundidade no banco; isolamento vivo intacto via app+RLS. Blind Security do
PR #20 reconfirmou como único LOW residual, não explorável. Sem mudança de responsável/lote/critério/gate.

**DBT-2.2-MEMBERSHIP-ADVISORY** — mantido do incremento 1, **agora com alvo concreto**: o incremento 2 resolve
a Membership por `membershipIdAtual` mas **não reconfere `Membership.state`** ao computar acesso (uma
Membership SUSPENDED da própria Org com concessão ACTIVE ainda listaria/obteria o Pipe até a concessão ser
revogada). Absorvido pelo critério de **DBT-2.2-ROLE-DORMENTE** (a resolução de poder efetivo em 2.3/2.7
reconfere `Membership.state`). *Gate:* teste de aceite dessas Stories (papel só vale com Membership ativa).

### Lacunas de cobertura (LOW, observadas por Edge Case/Blind Security) — rastreadas

Sem asserção nova exigida para fechar a 2.2 (comportamento coberto pela lógica e pelos testes de leitura),
mas registradas para as próximas suítes: GUEST-com-concessão (hoje trilha idêntica a MEMBER — leitura),
Pipe ARCHIVED com concessão (leitura via `incluirArquivados`), Membership SUSPENDED da própria Org com
concessão (coberto pelo critério de DBT-2.2-MEMBERSHIP-ADVISORY).

### F2 (Acceptance) — drift de artefato corrigido
`tasks.md` reconciliado: T006/T010/T011/T012 marcados `[x]` (implementados e testados em PostgreSQL real);
T004/T008 marcados `[~]` (parte grossa entregue; **metade diferencial deferida** por SC-222=B, com nota).

### INFO (sem ação)
- C3/contrato congelado intacto: `git diff` não toca `authz.guard.ts` nem `ability.ts`; muda só o catálogo de
  regras (`ability.factory.ts`) e `MODELOS_AUDITADOS` (`tenant-context.ts`).
- Divergência de **mecanismo** (não de resultado) vs. `spec.md`: a guarda fina é por filtro de query
  (existência de concessão ACTIVE), não por CASL subject com o Pipe carregado. AC1/SC-221/227 satisfeitos; o
  "papel efetivo via CASL" materializa-se quando DBT-2.2-ROLE-DORMENTE for endereçado. Escolha documentada.

## Estado dos gates após as correções
`format:check` · `lint` · `typecheck` · `build` verdes; suíte da API verde (a evidência de execução real é
anexada pelo gate de testes — Constitution X). CI do PR #20 revalidado no push.

## Conclusão
Incremento 2 **aprovado com findings tratados**: SC-221/224/225/227 entregues de forma sólida, testados em
PostgreSQL real, com C3/guard intacto, deny-by-default preservado, sem tautologia e sem antecipação de escopo.
A decisão **SC-222=(B)** está fundamentada nas fontes autoritativas (não em conveniência) e a metade diferencial
fica **rastreada por DBT-2.2-ROLE-DORMENTE**, com Story-alvo (2.3/2.7), critério e gate de aceite que impedem o
esquecimento. O único LOW acionável de código (corrida `count===0`) foi corrigido na origem. Sem CRITICAL/HIGH.
Merge do #20 sujeito ao guardrail de merge e ao CI verde.
