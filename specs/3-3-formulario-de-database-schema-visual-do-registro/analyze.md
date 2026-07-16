# Analyze — Story 3.3 (consistência cross-artefato)

## Cobertura AC → task → teste

| AC | Task | Teste |
|----|------|-------|
| AC1 (builder canônico, isolamento) | T004/T006/T007 | database-forms-http (catálogo/isolamento) |
| AC2 (contexto identificado; ler não cria) | T004/T006 | database-forms-http (obter/adicionar) |
| AC3 (evolução segura) | T006/T007 | database-forms-http (editar/arquivar/opções) |
| AC4 (publicação + imutabilidade) | T002/T006/T007 | database-forms-http + database-forms-rls (FormVersion) |
| AC5 (autz por Database; 404) | T005/T006/T007 | database-forms-http (gerenciar × MEMBER/VIEWER × sem acesso) |
| AC6 (isolamento Org/Database) | T002/T004 | database-forms-rls (CHECK + isolamento + cross-database) |
| AC7 (sem antecipar 3.4; Arquivo gated) | T007 | database-forms-http (sem rota Registro; publish gated) |

## Gates de revisão (RV)

- **RV-1 (sem segundo builder):** os controllers de Database reusam `FormsService`/`FieldsService`/
  `FormPublicationService`; não há segunda tabela de Campo nem segundo catálogo de tipos. Verificar no diff que
  nenhum serviço de builder foi duplicado.
- **RV-2 (autz fina no serviço; C3 congelado):** o roteamento por contexto vive em `form-authz.ts` (serviço),
  não no guard; `ability.ts`/`authz.guard.ts` inalterados; `@Requer('ler','Database')` grosso.
- **RV-3 (sem regressão de E2 e da 3.1/3.2):** Formulário inicial/de Fase inalterados (T011); ciclo de vida/
  concessões de Database inalterados; MEMBER/VIEWER do Database só leem o schema.
- **RV-4 (imutabilidade = não corromper Registros):** `FormVersion` segue sem UPDATE/DELETE; editar rascunho não
  altera versão publicada (provado por teste).

## Reconciliações

- **RD-1 (escopo 3.3 vs 3.4):** a AC do épico "rascunho não recebe submissões" é **contrato** consumido por 3.4;
  em 3.3 não há Registro. 3.3 entrega o schema publicável + estado de publicação. Sem rota de submissão.
- **RD-2 (Campo Arquivo):** montar é permitido (catálogo); publicar é gated (AD-28) — paridade com E2, sem
  antecipar 3.7/3.8.

## Veredito

**APROVADO PARA IMPLEMENTAÇÃO.** Escopo congelado e coerente com epics/Spine; nenhuma antecipação; invariantes do
dono mapeados a ACs e gates; riscos (regressão de E2, ciclo de módulo, CHECK de owner) com mitigação e teste.
