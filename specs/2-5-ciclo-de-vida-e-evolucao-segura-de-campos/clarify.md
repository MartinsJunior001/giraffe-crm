# Clarify — Story 2.5: Ciclo de vida e evolução segura de Campos

> Registro das ambiguidades resolvidas antes do `plan`. Respostas pela hierarquia de artefatos
> (`spec.md` → `epics.md` Story 2.5 → `prd.md` D3.1/D3.4 → `regras-negocio-fase-1.md` RN-050..054 →
> `ARCHITECTURE-SPINE.md` AD-11/AD-12) e pela **decisão do usuário** (Opção A). Sem migration.

| # | Ambiguidade | Resolução | Fonte |
|---|---|---|---|
| C1 | Opções de Seleção: JSON no `typeConfig` vs tabela `FieldOption`? | **(A) JSON no `typeConfig`.** A forma da opção ganha `state`: `{ id, label, position, state }`. Cada operação é **um único `field.update`** atômico; **zero migration** (`state`/`archivedAt` já existem em `Field` desde a 2.4). | Decisão do usuário; `spec.md` §Modelo (A); DBT-2.4-OPCOES-JSON |
| C2 | `type` imutável vs rota de mudança de tipo? | **`type` imutável.** Editar **não** aceita `type`. Mudança de tipo é contrato futuro (guard "bloqueado por valores" não dispara hoje — valores = 2.7+); a alternativa "criar novo Campo" já é `adicionarCampo` (2.4). | Constitution II / AD-11; `spec.md` §Edge |
| C3 | Travas de arquivamento como seam vs guard funcional? | **Arquivar/restaurar SEM trava condicional** (publicação=2.6, requisito de Fase=2.15, marco=2.12 inexistentes; sem coluna `required`). Documentar o ponto de verificação futuro **sem** materializar coluna/estado. | AD-11; `spec.md` §Edge; SC-254 |
| C4 | Semântica de remover opção agora? | **Remover permitido enquanto nunca usada** (hoje sempre — publicação/uso = 2.6/2.7); **arquivar** sempre disponível. A restrição "após uso, só arquivar" entra quando 2.6/2.7 derem o consumidor. Preservar identidade estável para renderização histórica futura. | `spec.md` §Edge; SC-256 |
| C5 | Migration? | **Não.** Opção A mantém tudo em `Field` (colunas já existentes). Registrado para o `migration-check`: **a 2.5 não toca `schema.prisma` nem cria migration.** | `spec.md` §Modelo; C1 |
| C6 | Invariante "≥1 Campo ativo"? | **Não replicar.** Um Formulário pode ficar vazio (diferente do "≥1 Fase ativa" de `Phase`); arquivar é livre quanto à contagem. | `spec.md` §Estados; SC-253 |
| C7 | Forma da edição / verbos / operações de opção? | **DTO manual** (sem `class-validator`, como a 2.4). Editar/arquivar/restaurar/opção = **200** (mutação de linha existente, nenhuma criação). Operações de opção **dedicadas** (add/rename/reorder/archive/remove) — **nunca** substituir o array inteiro (o cliente perderia um `id` silenciosamente → quebraria a identidade estável, AD-12). | `spec.md` §Contrato/§Clarif 7 |
| C8 | Local/serviço? | **Serviço irmão `FieldsService`** no módulo `src/pipes/forms/` existente (não sobrecarrega o `FormsService`; reusa `pipe-authz` e a resolução por `phase.pipeId`). Sem novo módulo. Sem tocar C3. | `spec.md` §Clarif 8; DBT-AUTHZ-01 |

## Opção A: condições que a invalidariam (nenhuma presente)
A Opção A (JSON) só seria inválida se as opções: (a) precisassem ser **consultadas relacionalmente**;
(b) tivessem **permissões próprias**; (c) tivessem **relacionamento externo**; (d) tivessem **ciclo de vida
independente** do Campo; (e) precisassem de **integridade referencial no banco**; (f) fossem
**compartilhadas entre Campos** diferentes. **Nenhuma** vale na Fase 1: a opção pertence a um único Campo,
sem permissão nem relacionamento próprios; a integridade referencial "valor → opção" só nasce com a
**submissão** (2.7+), que não existe aqui (o gatilho do DBT-2.4-OPCOES-JSON **não** é atingido pela 2.5).
Logo, **JSON**.

## Invariantes do `typeConfig` (contrato que o plan detalha e os testes provam)
1. cada opção tem **`id` estável e único** no Campo;
2. o valor persistido (futuro, 2.7+) referenciará o **`id`**, nunca o `label` — a 2.5 garante a estabilidade do `id` que torna isso possível;
3. **renomear `label` não altera o `id`** (nem "desloca" dados históricos);
4. **ordenação determinística** (`position` numérica; desempate estável);
5. **`id` duplicado é recusado**;
6. **`label` vazio/só-espaços/inválido é recusado**;
7. **limites**: nº de opções, tamanho do `label`, tamanho do payload;
8. **config desconhecida/malformada falha fechada** (recusa; não "conserta" silenciosamente);
9. o cliente **não injeta propriedades extras** perigosas (allowlist de chaves; mass-assignment barrado);
10. `label` é **conteúdo não confiável** — sem sanitização destrutiva no back; escape é responsabilidade da Web (React escapa por padrão; nenhuma rota devolve HTML);
11. **isolamento herdado** do `Field` pai (FORCE RLS) — nenhuma policy/tabela nova;
12. **atualização concorrente não perde alteração silenciosamente** — como ler e regravar o `typeConfig` são passos separados (sem transação multi-statement), o `update` de opção usa **guarda otimista**: filtra por `typeConfig: { equals: <lido> }` e, se o valor mudou desde a leitura, atinge 0 linhas e responde **409** (não sobrescreve às cegas). Testar concorrência (HTTP: 200-ou-409, nada some) e o mecanismo (token obsoleto → 0 linhas).

## Não-objetivos rastreáveis (contrato futuro, não implementados)
Mudança de `type`; travas "obrigatório em publicado / requisito de Fase / marco"; "após uso, só arquivar";
publicação/versionamento (2.6); submissão/valores/Card (2.7+); Database (E3); exclusão definitiva de Campo;
regras condicionais/validação programável. Nenhum materializa tabela/coluna (AD-11).
