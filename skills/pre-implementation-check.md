# pre-implementation-check

## 1. Finalidade

A skill `pre-implementation-check` funciona como gate obrigatorio antes de
qualquer implementacao, correcao funcional, migration, integracao ou mudanca
arquitetural no Giraffe CRM.

Ela garante que nenhuma implementacao seja iniciada antes de confirmar fase,
escopo, story, criterios de aceite, regras de negocio, permissoes, impactos de
dados, riscos tecnicos, dependencias e validacoes obrigatorias.

O Giraffe CRM segue obrigatoriamente esta sequencia:

1. Documentacao Base
2. BMAD
3. Spec Kit
4. Implementacao
5. Validacoes por skills
6. Deploy

Esta skill e independente de Cursor, Claude, ChatGPT, Copilot, IDE, agente ou
fornecedor especifico.

## 2. Quando executar

Executar obrigatoriamente antes de:

- implementar uma story;
- corrigir bug funcional;
- alterar regra de negocio;
- criar ou alterar entidade;
- criar migration;
- adicionar dependencia;
- criar integracao;
- alterar autenticacao;
- alterar autorizacao ou permissoes;
- modificar filas, cache ou eventos;
- alterar API interna;
- alterar fluxo de dados;
- implementar automacao;
- implementar recurso de IA;
- alterar infraestrutura ou deploy;
- realizar refatoracao com impacto funcional.

## 3. Quando pode ser simplificada

Permitir uma versao reduzida apenas para:

- correcao ortografica;
- ajuste documental sem mudanca de regra;
- formatacao;
- alteracao visual pequena sem impacto funcional;
- remocao de codigo comprovadamente morto;
- correcao trivial sem alteracao de contrato.

Mesmo nesses casos, confirmar que nao existe impacto oculto.

## 4. Identificacao da fase atual

O agente deve confirmar:

- fase atual do projeto;
- etapa atual dentro da fase;
- se a tarefa esta liberada;
- se a tarefa pertence a Fase 1;
- se a tarefa depende de recurso de Fase 2;
- se existe decisao formal permitindo a implementacao.

Se a tarefa antecipar Fase 2, bloquear.

## 5. Validacao da story ou tarefa

Confirmar:

- objetivo;
- problema resolvido;
- ator principal;
- fluxo principal;
- pre-condicoes;
- pos-condicoes;
- criterios de aceite;
- excecoes;
- estados de erro;
- limites do escopo;
- itens explicitamente fora do escopo.

Se nao houver story formal, a tarefa deve possuir especificacao equivalente
aprovada.

## 6. Validacao de produto

Verificar:

- alinhamento com visao do produto;
- alinhamento com MVP;
- alinhamento com regras de negocio;
- alinhamento com permissoes;
- alinhamento com fluxos principais;
- alinhamento com experiencia visual;
- alinhamento com separacao Fase 1 x Fase 2.

Conceitos obrigatorios:

- Pipe != Database;
- Card != Registro;
- Pipe organiza processos;
- Database preserva informacao;
- Card pertence a Pipe;
- Registro pertence a Database;
- Super Admin != Admin da Organizacao;
- prototipo != arquitetura final.

## 7. Validacao tecnica

Confirmar:

- tecnologia envolvida;
- versao envolvida;
- documentacao tecnica validada;
- arquitetura afetada;
- modulos afetados;
- contratos afetados;
- entidades afetadas;
- migrations necessarias;
- dependencias necessarias;
- riscos de compatibilidade;
- impacto em performance;
- impacto em seguranca;
- impacto em observabilidade;
- impacto em backup;
- impacto em LGPD;
- impacto em custos de IA, quando aplicavel.

## 8. Validacao de dados

Verificar:

- entidade responsavel pelo dado;
- fonte de verdade;
- escopo de organizacao;
- isolamento multi-tenant;
- campos afetados;
- relacionamentos afetados;
- cardinalidade;
- integridade referencial;
- historico necessario;
- retencao;
- anonimizacao;
- migration;
- rollback.

Nunca assumir que dados locais do prototipo representam o modelo final.

## 9. Validacao de permissoes

Confirmar:

- quem pode visualizar;
- quem pode criar;
- quem pode editar;
- quem pode excluir;
- quem pode administrar;
- qual e o escopo;
- organizacao afetada;
- Pipe afetado;
- Card afetado;
- comportamento para convidado;
- comportamento para Super Admin;
- negacao por padrao.

Usar o principio:

```text
PERMISSAO = ACAO + ESCOPO
```

## 10. Dependencias entre skills

Antes da aprovacao, avaliar se devem ser executadas:

- technical-docs-check;
- security-check;
- lgpd-check;
- migration-check;
- backup-check;
- observability-check;
- ai-guardrails-check;
- cost-monitoring-check;
- performance-check.

A skill nao deve executar integralmente essas outras skills, mas deve indicar
quais sao obrigatorias para a tarefa.

## 11. Plano minimo de implementacao

Antes de liberar, exigir:

- arquivos ou modulos previstos;
- ordem das alteracoes;
- estrategia de testes;
- estrategia de rollback;
- estrategia de migration, quando aplicavel;
- riscos conhecidos;
- criterios de conclusao;
- itens que nao devem ser alterados.

O plano deve ser pequeno, verificavel e alinhado ao Spec Kit.

## 12. Criterios de bloqueio

Bloquear a implementacao quando:

- a tarefa nao pertence a fase atual;
- a story nao esta especificada;
- os criterios de aceite nao existem;
- existe conflito entre documentos;
- regra de negocio esta indefinida;
- permissao esta indefinida;
- fonte de verdade dos dados esta indefinida;
- mudanca arquitetural nao foi aprovada;
- documentacao tecnica nao foi validada;
- migration necessaria nao foi planejada;
- risco de seguranca alto nao foi tratado;
- risco LGPD nao foi tratado;
- integracao depende de Fase 2;
- impacto multi-tenant esta indefinido;
- rollback nao e possivel ou nao foi considerado;
- a implementacao exige suposicao relevante.

Nesses casos, usar:

```text
STATUS: BLOQUEADO
```

E listar claramente:

- motivo;
- evidencia;
- decisao necessaria;
- responsavel pela decisao;
- proximo passo.

## 13. Condicoes para aprovacao com ressalvas

Usar APROVADO COM RESSALVAS somente quando:

- a pendencia nao afeta regra de negocio;
- a pendencia nao afeta seguranca;
- a pendencia nao afeta dados;
- a pendencia nao afeta permissoes;
- a pendencia nao afeta arquitetura;
- existe mitigacao documentada;
- a implementacao pode prosseguir sem gerar retrabalho estrutural.

## 14. Resultado esperado

A saida da skill deve seguir exatamente este formato:

```md
# Pre-Implementation Check Report

## Identificacao da tarefa

## Fase e etapa atual

## Objetivo

## Escopo incluido

## Fora do escopo

## Documentacao consultada

## Story e criterios de aceite

## Regras de negocio afetadas

## Permissoes afetadas

## Dados e entidades afetados

## Arquitetura e modulos afetados

## Dependencias tecnicas

## Skills obrigatorias para esta tarefa

## Riscos identificados

## Plano minimo de implementacao

## Estrategia de testes

## Estrategia de rollback

## Decisoes pendentes

## Status final
```

Usar somente:

- APROVADO
- APROVADO COM RESSALVAS
- BLOQUEADO

## 15. Checklist obrigatorio

[ ] fase atual confirmada  
[ ] tarefa pertence ao escopo atual  
[ ] story ou especificacao localizada  
[ ] criterios de aceite definidos  
[ ] regras de negocio identificadas  
[ ] permissoes identificadas  
[ ] entidades e relacionamentos identificados  
[ ] fonte de verdade definida  
[ ] impacto multi-tenant avaliado  
[ ] documentacao tecnica validada  
[ ] migration avaliada  
[ ] seguranca avaliada  
[ ] LGPD avaliada  
[ ] observabilidade avaliada  
[ ] backup e rollback avaliados  
[ ] testes planejados  
[ ] dependencias entre skills identificadas  
[ ] itens fora do escopo registrados  
[ ] decisoes pendentes registradas  

## 16. Relacao com outras skills

Esta skill:

- deve ser executada depois de technical-docs-check, quando houver dependencia
  tecnica externa;
- deve ser concluida antes de safe-implementation;
- deve indicar quando security-check e obrigatorio;
- deve indicar quando migration-check e obrigatorio;
- deve indicar quando lgpd-check e obrigatorio;
- deve indicar quando observability-check e obrigatorio;
- deve indicar quando backup-check e obrigatorio;
- deve indicar quando ai-guardrails-check e cost-monitoring-check sao
  obrigatorios.

## 17. Regras obrigatorias do Giraffe CRM

- nao implementar antes de BMAD e Spec Kit correspondentes;
- nao antecipar Fase 2;
- nao alterar stack sem decisao arquitetural;
- nao assumir regras nao documentadas;
- nao usar legado como fonte oficial;
- nao usar prototipo como modelo de dados;
- nao misturar Admin da Organizacao com Super Admin;
- nao misturar Card com Registro;
- nao misturar Pipe com Database;
- aplicar isolamento por organizacao;
- aplicar negacao de acesso por padrao;
- preservar historico quando a regra exigir rastreabilidade;
- registrar toda ressalva antes de liberar implementacao.

## Principios

- clareza antes de codigo;
- especificacao antes de implementacao;
- evidencia antes de suposicao;
- seguranca antes de conveniencia;
- isolamento antes de compartilhamento;
- rollback antes de mudanca irreversivel;
- criterios de aceite antes de conclusao.
