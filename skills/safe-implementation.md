# safe-implementation

## 1. Finalidade

A skill `safe-implementation` garante que toda implementacao seja realizada de
forma controlada, incremental, rastreavel e alinhada as especificacoes aprovadas
do Giraffe CRM.

Ela deve impedir:

- implementacao fora do escopo;
- alteracoes desnecessarias;
- quebra de funcionalidades existentes;
- mudancas arquiteturais nao aprovadas;
- criacao de solucoes improvisadas;
- exposicao de dados sensiveis;
- remocao acidental de comportamentos existentes;
- alteracoes destrutivas no banco de dados;
- dependencias adicionadas sem necessidade;
- implementacao sem validacao.

Esta skill deve ser executada depois de `pre-implementation-check.md` e antes de
`code-review.md`.

## 2. Quando usar

Aplicar durante qualquer atividade que envolva:

- criacao de funcionalidades;
- alteracao de funcionalidades existentes;
- correcao de bugs;
- refatoracao;
- criacao ou alteracao de APIs;
- alteracoes no banco de dados;
- implementacao de integracoes externas;
- implementacao de automacoes;
- implementacao de recursos de IA;
- alteracao de autenticacao ou permissoes;
- mudanca de configuracao de infraestrutura;
- alteracao de filas, workers, cache ou WebSockets.

## 3. Regra principal

A implementacao deve executar somente o que foi aprovado na story,
specification, plan e tasks.

Nao implementar funcionalidades adicionais, melhorias paralelas ou mudancas
estruturais que nao facam parte do escopo aprovado.

Quando uma melhoria relevante for identificada fora do escopo:

1. nao implementar automaticamente;
2. registrar a sugestao;
3. explicar o motivo;
4. indicar impacto, risco e beneficio;
5. aguardar inclusao formal no planejamento.

## 4. Fontes obrigatorias da implementacao

Antes de alterar codigo, confirmar a existencia e a consistencia dos artefatos
aplicaveis:

- Constitution do projeto;
- Product Brief, quando aplicavel;
- PRD;
- arquitetura aprovada;
- especificacao da story;
- resultado do Clarify;
- plano de implementacao;
- checklist;
- lista de tasks;
- regras de negocio relacionadas;
- regras de permissao;
- modelagem de dados;
- documentacao tecnica atualizada;
- contratos das integracoes envolvidas.

Nenhuma decisao relevante deve ser baseada apenas em suposicao.

## 5. Principios de implementacao segura

### Escopo minimo

Implementar a menor alteracao capaz de atender integralmente ao requisito.

Evitar:

- refatoracoes amplas durante correcoes pequenas;
- troca de bibliotecas sem necessidade;
- alteracao de contratos nao relacionados;
- reorganizacao de pastas sem justificativa;
- criacao de abstracoes prematuras;
- duplicacao de componentes existentes;
- mudancas cosmeticas fora do escopo.

### Mudancas incrementais

Dividir a implementacao em alteracoes pequenas e verificaveis.

Cada etapa deve:

- possuir objetivo claro;
- ser testavel;
- preservar o funcionamento existente;
- evitar mudancas simultaneas em varias camadas sem necessidade;
- permitir facil identificacao da origem de falhas.

### Preservacao de comportamento

Antes de alterar codigo existente, identificar:

- comportamento atual;
- consumidores internos;
- consumidores externos;
- efeitos colaterais;
- regras de negocio relacionadas;
- permissoes envolvidas;
- eventos disparados;
- filas ou automacoes dependentes;
- dados persistidos;
- logs e metricas existentes.

Nao remover ou alterar comportamento existente sem requisito explicito.

### Compatibilidade

Verificar compatibilidade com:

- APIs existentes;
- banco de dados;
- migrations anteriores;
- frontend;
- backend;
- workers;
- filas;
- integracoes externas;
- WebSockets;
- autenticacao;
- autorizacao;
- ambientes de desenvolvimento, homologacao e producao.

Quando uma quebra de compatibilidade for inevitavel, ela deve ser documentada,
justificada, planejada, versionada quando necessario e acompanhada por
estrategia de migracao.

## 6. Fluxo obrigatorio

### Etapa 1 - Confirmar o escopo

Antes de implementar, registrar:

- story ou tarefa relacionada;
- objetivo da alteracao;
- resultado esperado;
- arquivos ou modulos afetados;
- regras de negocio envolvidas;
- itens explicitamente fora do escopo.

### Etapa 2 - Identificar riscos

Avaliar:

- risco de regressao;
- risco de perda de dados;
- risco de indisponibilidade;
- risco de falha silenciosa;
- risco de exposicao de dados;
- risco de quebra de integracao;
- risco de aumento de custo;
- risco de impacto em permissoes;
- risco de concorrencia;
- risco de duplicidade de processamento.

Classificar o risco como:

- baixo;
- medio;
- alto;
- critico.

### Etapa 3 - Definir estrategia de alteracao

Antes de modificar codigo, definir:

- abordagem escolhida;
- motivo da abordagem;
- componentes afetados;
- dependencias envolvidas;
- testes necessarios;
- estrategia de rollback;
- necessidade de feature flag;
- necessidade de migration;
- necessidade de backup;
- necessidade de logs ou metricas adicionais.

### Etapa 4 - Implementar por camadas

Quando aplicavel, seguir a ordem:

1. contratos e tipos;
2. modelagem de dados;
3. migrations;
4. dominio e regras de negocio;
5. servicos de aplicacao;
6. repositorios e persistencia;
7. integracoes externas;
8. controllers, rotas ou handlers;
9. permissoes;
10. frontend;
11. automacoes;
12. logs, metricas e alertas;
13. testes.

Essa ordem pode ser adaptada, mas qualquer alteracao deve manter consistencia
entre as camadas.

### Etapa 5 - Validar cada mudanca

Apos cada grupo de alteracoes:

- executar verificacao de tipos;
- executar lint;
- executar testes relacionados;
- validar comportamento principal;
- validar cenarios de erro;
- verificar logs;
- verificar alteracoes inesperadas;
- confirmar que o escopo nao foi expandido.

## 7. Regras para alteracao de codigo

### Nao sobrescrever codigo sem analise

Antes de substituir um bloco existente:

- entender sua finalidade;
- verificar quem o utiliza;
- identificar testes relacionados;
- avaliar efeitos colaterais;
- preservar comportamento necessario.

### Nao criar duplicacao

Antes de criar funcao, hook, service, componente, utilitario, validator, schema,
repository ou provider, pesquisar se ja existe implementacao equivalente.

Preferir reutilizacao quando ela nao causar acoplamento inadequado.

### Nao introduzir dependencias sem necessidade

Antes de adicionar uma biblioteca:

- confirmar que a stack atual nao resolve o problema;
- verificar manutencao e compatibilidade;
- avaliar impacto no bundle;
- avaliar seguranca;
- avaliar licenca;
- avaliar tamanho;
- avaliar custo operacional;
- verificar documentacao atual.

Toda nova dependencia deve possuir justificativa tecnica.

### Nao utilizar atalhos inseguros

E proibido utilizar como solucao definitiva:

- `any` sem justificativa;
- `@ts-ignore` sem justificativa documentada;
- desativacao global de lint;
- captura de erro vazia;
- retorno silencioso em falhas criticas;
- segredo hardcoded;
- credenciais no repositorio;
- consulta SQL concatenada;
- desativacao de autenticacao;
- bypass de autorizacao;
- permissao temporaria esquecida;
- dados pessoais em logs;
- timeout infinito;
- retry sem limite;
- fallback que esconda falhas;
- comentario `TODO` como substituicao de requisito obrigatorio.

## 8. Tratamento de erros

Toda implementacao deve definir explicitamente:

- erros esperados;
- erros inesperados;
- mensagens retornadas ao usuario;
- logs internos;
- codigos HTTP;
- comportamento de retry;
- comportamento de fallback;
- politica de timeout;
- tratamento de indisponibilidade externa.

Erros nao devem ser ignorados. Falhas criticas devem produzir sinais
observaveis.

## 9. Idempotencia

Operacoes que possam ser executadas mais de uma vez devem avaliar necessidade
de idempotencia.

Aplicar especialmente em:

- webhooks;
- filas;
- pagamentos;
- envio de mensagens;
- automacoes;
- criacao de cards;
- sincronizacoes;
- importacoes;
- processamento de eventos;
- chamadas de IA com efeito persistente.

Quando necessario, usar:

- chave idempotente;
- controle de evento processado;
- constraint unica;
- lock;
- deduplicacao;
- transacao.

## 10. Concorrencia

Avaliar possiveis condicoes de corrida em:

- movimentacao de cards;
- atualizacao de registros;
- atribuicao de responsaveis;
- execucao de automacoes;
- consumo de filas;
- atualizacao de status;
- sincronizacao externa;
- contadores;
- permissoes;
- processamento de mensagens.

Quando necessario, utilizar transacoes, locks, versionamento otimista,
constraints, operacoes atomicas ou deduplicacao.

## 11. Banco de dados

Alteracoes no banco devem seguir `migration-check.md`.

Nao executar alteracoes destrutivas diretamente.

Toda alteracao deve considerar:

- compatibilidade com dados existentes;
- valores nulos;
- valores padrao;
- indices;
- constraints;
- volume de dados;
- tempo de execucao;
- rollback;
- backup;
- deploy gradual.

Mudancas destrutivas devem ser divididas em etapas.

Exemplo:

1. adicionar novo campo;
2. publicar codigo compativel;
3. migrar dados;
4. validar;
5. remover campo antigo em versao posterior.

## 12. Integracoes externas

Toda integracao deve considerar:

- autenticacao;
- timeout;
- retry;
- rate limit;
- idempotencia;
- validacao de payload;
- assinatura de webhook;
- tratamento de indisponibilidade;
- logs;
- metricas;
- fallback;
- versionamento da API;
- armazenamento seguro de credenciais.

Nao confiar em payload externo sem validacao.

## 13. Implementacoes com IA

Recursos de IA devem seguir tambem `ai-guardrails-check.md`.

A implementacao deve definir:

- objetivo exato da IA;
- dados enviados ao modelo;
- dados que nao podem ser enviados;
- limites de contexto;
- validacao de entrada;
- validacao de saida;
- comportamento em caso de erro;
- fallback para atendimento humano;
- controle de custo;
- registro de uso;
- protecao contra prompt injection;
- protecao contra prompt leak;
- acoes que exigem confirmacao humana.

A IA nao deve executar automaticamente acoes criticas sem controle definido.

## 14. Seguranca e LGPD

Toda implementacao deve considerar:

- principio do menor privilegio;
- autenticacao;
- autorizacao;
- isolamento entre empresas;
- isolamento entre usuarios;
- validacao de entrada;
- sanitizacao;
- protecao de dados pessoais;
- minimizacao de dados;
- retencao;
- anonimizacao;
- auditoria;
- seguranca de logs.

Aplicar tambem:

- `security-check.md`;
- `lgpd-check.md`.

## 15. Observabilidade

Novos fluxos criticos devem possuir:

- logs estruturados;
- identificador de correlacao;
- contexto minimo necessario;
- metricas;
- registro de falhas;
- alertas quando aplicavel;
- rastreabilidade de eventos.

Nunca registrar:

- senhas;
- tokens;
- segredos;
- conteudo sensivel desnecessario;
- dados pessoais completos sem justificativa;
- prompts com informacoes pessoais sem tratamento adequado.

Aplicar tambem `observability-check.md`.

## 16. Feature flags

Utilizar feature flag quando a funcionalidade:

- possuir risco elevado;
- precisar de liberacao gradual;
- ainda estiver em validacao;
- afetar muitos usuarios;
- depender de integracao instavel;
- exigir rollback rapido;
- possuir custo operacional relevante.

A feature flag nao deve substituir testes, autorizacao, regras de negocio ou
tratamento de erros.

## 17. Testes minimos

Toda implementacao deve validar:

- cenario principal;
- cenario de erro;
- entrada invalida;
- usuario sem permissao;
- isolamento entre empresas;
- comportamento com dados inexistentes;
- comportamento com dados duplicados;
- falha de integracao;
- timeout;
- idempotencia, quando aplicavel.

Dependendo da alteracao, incluir:

- testes unitarios;
- testes de integracao;
- testes de contrato;
- testes end-to-end;
- testes de migration;
- testes manuais documentados.

## 18. Validacao antes de concluir

Antes de considerar a implementacao concluida, confirmar:

[ ] O codigo implementa somente o escopo aprovado.  
[ ] As regras de negocio foram respeitadas.  
[ ] As permissoes foram aplicadas.  
[ ] O isolamento multiempresa foi validado.  
[ ] Nao foram adicionadas dependencias desnecessarias.  
[ ] Nao existem segredos no codigo.  
[ ] Nao existem dados sensiveis em logs.  
[ ] Os erros sao tratados.  
[ ] Os fluxos criticos sao observaveis.  
[ ] Os testes relevantes foram executados.  
[ ] O build foi validado.  
[ ] O lint foi validado.  
[ ] A verificacao de tipos foi validada.  
[ ] Alteracoes no banco possuem migration segura.  
[ ] Existe estrategia de rollback.  
[ ] Nao houve alteracao fora do escopo.  
[ ] A documentacao relacionada foi atualizada.  
[ ] A implementacao esta pronta para `code-review.md`.  

## 19. Condicoes de bloqueio

A implementacao deve ser interrompida quando:

- nao existe especificacao suficiente;
- existem regras de negocio conflitantes;
- o plano nao cobre a alteracao necessaria;
- a mudanca exige decisao arquitetural nao aprovada;
- ha risco critico de perda de dados;
- nao existe estrategia segura de migration;
- nao existe backup para operacao destrutiva;
- a implementacao exige quebrar permissoes;
- dados pessoais serao tratados sem definicao adequada;
- uma integracao exige credenciais nao configuradas;
- os testes essenciais nao podem ser executados;
- o codigo existente contradiz a documentacao aprovada.

Nesses casos, registrar:

1. bloqueio encontrado;
2. impacto;
3. risco;
4. decisao necessaria;
5. recomendacao tecnica.

## 20. Formato obrigatorio de saida

Ao finalizar a aplicacao desta skill, gerar:

```md
# Safe Implementation Report

## Escopo implementado
- Story:
- Tarefa:
- Objetivo:
- Resultado:

## Arquivos alterados
- arquivo:
  - alteracao:
  - motivo:

## Decisoes tecnicas
- decisao:
- justificativa:
- alternativa descartada:

## Riscos identificados
- risco:
- classificacao:
- mitigacao:

## Seguranca
- autenticacao:
- autorizacao:
- isolamento multiempresa:
- validacao de entrada:
- dados sensiveis:

## Banco de dados
- migration necessaria:
- compatibilidade:
- backup:
- rollback:

## Observabilidade
- logs:
- metricas:
- alertas:
- correlacao:

## Testes executados
- typecheck:
- lint:
- unitarios:
- integracao:
- end-to-end:
- manuais:

## Itens fora do escopo
- item:
- recomendacao:

## Resultado
- [ ] Aprovado para code review
- [ ] Aprovado com ressalvas
- [ ] Bloqueado

## Pendencias
- pendencia:
- responsavel:
- acao necessaria:
```

## 21. Resultado esperado

A aplicacao desta skill deve produzir uma implementacao:

- alinhada a especificacao;
- limitada ao escopo aprovado;
- segura;
- testavel;
- observavel;
- reversivel;
- compativel com o sistema existente;
- preparada para revisao de codigo;
- adequada ao ambiente multiempresa do Giraffe CRM.
