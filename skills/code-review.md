# code-review

## 1. Finalidade

A skill `code-review` garante que toda alteracao de codigo seja revisada de
forma tecnica, estruturada, rastreavel e alinhada as especificacoes, regras de
negocio, arquitetura e padroes do Giraffe CRM.

Esta skill deve identificar:

- erros funcionais;
- regressoes;
- violacoes de regras de negocio;
- falhas de permissao;
- vulnerabilidades;
- problemas de arquitetura;
- duplicacao de codigo;
- baixa legibilidade;
- tratamento inadequado de erros;
- problemas de concorrencia;
- falhas de observabilidade;
- ausencia ou baixa qualidade de testes;
- mudancas fora do escopo;
- riscos de manutencao futura.

## 2. Quando usar

Aplicar apos a implementacao e antes da aprovacao para merge, deploy ou release.

Usar em:

- novas funcionalidades;
- correcoes de bugs;
- refatoracoes;
- alteracoes de APIs;
- alteracoes no banco de dados;
- integracoes externas;
- automacoes;
- recursos de IA;
- autenticacao;
- permissoes;
- filas;
- workers;
- WebSockets;
- infraestrutura;
- configuracoes de producao.

Sequencia recomendada:

1. `technical-docs-check.md`;
2. `pre-implementation-check.md`;
3. `safe-implementation.md`;
4. `code-review.md`;
5. `security-check.md`;
6. demais checks aplicaveis.

## 3. Regra principal

A revisao deve analisar o codigo real alterado e comparar a implementacao com
os artefatos aprovados.

Nao aprovar uma alteracao apenas porque:

- o codigo compila;
- os testes existentes passaram;
- a interface aparenta funcionar;
- a implementacao esta visualmente organizada;
- o autor informou que concluiu;
- a alteracao e pequena.

Toda aprovacao deve ser baseada em evidencias.

## 4. Fontes obrigatorias da revisao

Antes de revisar, consultar quando aplicavel:

- Constitution;
- Product Brief;
- PRD;
- arquitetura;
- epico;
- story;
- resultado do Clarify;
- plano;
- checklist;
- tasks;
- regras de negocio;
- regras de permissao;
- modelagem de dados;
- documentacao tecnica;
- contratos de API;
- relatorio da `safe-implementation.md`;
- diff completo da alteracao;
- testes relacionados.

## 5. Escopo da revisao

A revisao deve verificar:

1. aderencia ao escopo;
2. correcao funcional;
3. regras de negocio;
4. arquitetura;
5. qualidade do codigo;
6. tipagem;
7. seguranca;
8. permissoes;
9. isolamento multiempresa;
10. banco de dados;
11. integracoes;
12. tratamento de erros;
13. concorrencia;
14. observabilidade;
15. desempenho;
16. testes;
17. documentacao;
18. manutencao futura.

## 6. Processo obrigatorio

### Etapa 1 - Entender a mudanca

Antes de analisar o codigo, registrar:

- objetivo da alteracao;
- story ou tarefa relacionada;
- problema resolvido;
- comportamento anterior;
- comportamento esperado;
- modulos afetados;
- riscos informados;
- itens fora do escopo.

O revisor nao deve comecar pela leitura isolada do diff sem entender o objetivo
da mudanca.

### Etapa 2 - Analisar o diff completo

Revisar:

- arquivos criados;
- arquivos alterados;
- arquivos removidos;
- dependencias adicionadas;
- migrations;
- configuracoes;
- testes;
- documentacao;
- scripts;
- variaveis de ambiente.

Verificar tambem alteracoes indiretas, como:

- lockfiles;
- arquivos gerados;
- permissoes;
- rotas;
- schemas;
- contratos;
- exports;
- configuracao de build;
- configuracao de deploy.

### Etapa 3 - Classificar os achados

Cada achado deve receber uma severidade.

#### Critico

Problema que pode causar perda ou corrupcao de dados, vazamento de dados,
quebra de isolamento entre empresas, acesso nao autorizado, indisponibilidade
relevante, execucao indevida de acoes criticas, migration destrutiva,
comprometimento de credenciais ou falha grave de seguranca.

Um achado critico bloqueia a aprovacao.

#### Alto

Problema que pode causar comportamento funcional incorreto, regressao
importante, quebra de integracao, duplicidade de processamento, inconsistencia
de dados, falha de autorizacao, erro silencioso em fluxo critico ou ausencia de
tratamento de erro relevante.

Um achado alto normalmente bloqueia a aprovacao.

#### Medio

Problema que pode causar manutencao dificil, inconsistencia arquitetural, baixa
cobertura de testes, observabilidade insuficiente, duplicacao, acoplamento
excessivo ou comportamento incorreto em cenario secundario.

Pode bloquear dependendo do contexto.

#### Baixo

Problema relacionado a legibilidade, nomenclatura, simplificacao, organizacao,
documentacao ou pequenas inconsistencias de padrao.

Nao deve ser ignorado, mas pode nao bloquear.

#### Sugestao

Melhoria opcional que nao representa defeito nem risco imediato. Sugestoes nao
devem ser apresentadas como bloqueios.

## 7. Checklist de revisao

### Escopo

[ ] A implementacao corresponde a story.  
[ ] Todas as tasks previstas foram atendidas.  
[ ] Nao existem funcionalidades adicionais nao aprovadas.  
[ ] Nao houve refatoracao ampla sem necessidade.  
[ ] Nao foram alterados modulos nao relacionados.  
[ ] Os itens fora do escopo permaneceram fora do codigo.  
[ ] As decisoes tomadas durante a implementacao foram documentadas.  

### Correcao funcional

[ ] O fluxo principal funciona.  
[ ] Os cenarios alternativos foram tratados.  
[ ] Entradas invalidas sao rejeitadas.  
[ ] Estados vazios foram considerados.  
[ ] Dados inexistentes foram considerados.  
[ ] Dados duplicados foram considerados.  
[ ] O comportamento anterior foi preservado quando necessario.  
[ ] Os criterios de aceite foram atendidos.  

### Regras de negocio

[ ] As regras de negocio estao implementadas no local correto.  
[ ] As regras nao dependem apenas do frontend.  
[ ] Excecoes previstas foram tratadas.  
[ ] Restricoes foram aplicadas.  
[ ] Transicoes de estado sao validas.  
[ ] Regras temporais foram consideradas.  
[ ] Regras multiempresa foram respeitadas.  
[ ] Nao existem regras importantes espalhadas ou duplicadas.  

Regras criticas devem estar centralizadas em dominio ou servico apropriado.

### Arquitetura

[ ] A implementacao respeita a arquitetura definida.  
[ ] As responsabilidades estao separadas.  
[ ] Nao ha logica de negocio em controllers ou componentes visuais.  
[ ] Nao ha acesso direto indevido entre camadas.  
[ ] Dependencias apontam na direcao esperada.  
[ ] Nao existem dependencias circulares.  
[ ] A abstracao utilizada e necessaria.  
[ ] Nao houve sobreengenharia.  
[ ] O codigo pode ser testado de forma isolada.  
[ ] O modulo alterado mantem coesao.  

### Qualidade do codigo

[ ] O codigo e legivel.  
[ ] Nomes representam corretamente a intencao.  
[ ] Funcoes possuem responsabilidade clara.  
[ ] Funcoes nao sao excessivamente grandes.  
[ ] Condicionais complexas foram simplificadas.  
[ ] Nao existe codigo morto.  
[ ] Nao existem comentarios obsoletos.  
[ ] Nao existem blocos comentados sem necessidade.  
[ ] Nao existe duplicacao relevante.  
[ ] Nao existem abstracoes prematuras.  
[ ] Constantes magicas foram evitadas.  
[ ] O codigo segue os padroes do projeto.  

### Tipagem

[ ] Nao foram introduzidos `any` desnecessarios.  
[ ] Tipos refletem o dominio.  
[ ] Tipos opcionais sao realmente opcionais.  
[ ] Valores nulos sao tratados.  
[ ] Conversoes de tipo sao seguras.  
[ ] Type assertions possuem justificativa.  
[ ] DTOs e schemas estao consistentes.  
[ ] Tipos do frontend e backend nao divergem.  
[ ] Retornos de funcoes estao bem definidos.  
[ ] Erros estao tipados quando aplicavel.  

Sinais de alerta:

- `as any`;
- `as unknown as`;
- `@ts-ignore`;
- `@ts-expect-error` sem justificativa;
- uso excessivo de campos opcionais;
- tipos genericos sem significado de dominio.

### Autenticacao e autorizacao

[ ] Rotas protegidas exigem autenticacao.  
[ ] O backend valida autorizacao.  
[ ] O frontend nao e a unica barreira de acesso.  
[ ] O usuario possui permissao para a acao.  
[ ] A permissao e validada no recurso correto.  
[ ] O papel do usuario foi considerado.  
[ ] Permissoes de empresa, processo e card foram respeitadas.  
[ ] Nao existe bypass temporario.  
[ ] A resposta nao revela dados indevidos.  
[ ] Operacoes administrativas possuem protecao adequada.  

### Isolamento multiempresa

Toda consulta e alteracao relacionada a dados de cliente deve validar o tenant.

[ ] Consultas filtram pela empresa correta.  
[ ] Updates validam propriedade do registro.  
[ ] Deletes validam propriedade do registro.  
[ ] Relacionamentos pertencem a mesma empresa.  
[ ] IDs externos nao permitem acesso cruzado.  
[ ] Caches sao segmentados por empresa.  
[ ] Filas carregam contexto do tenant.  
[ ] WebSockets respeitam canais da empresa.  
[ ] Arquivos sao isolados por tenant.  
[ ] Logs permitem rastrear a empresa sem expor dados sensiveis.  

Qualquer falha de isolamento multiempresa deve ser classificada como critica.

### Validacao de entrada

[ ] Payloads sao validados.  
[ ] Parametros de rota sao validados.  
[ ] Query strings sao validadas.  
[ ] Uploads possuem validacao.  
[ ] Tipos de arquivo sao restritos.  
[ ] Tamanho de arquivo e limitado.  
[ ] Campos obrigatorios sao verificados.  
[ ] Strings possuem limites adequados.  
[ ] Valores enumerados sao validados.  
[ ] Dados externos nao sao confiados diretamente.  

### Tratamento de erros

[ ] Erros esperados sao tratados.  
[ ] Erros inesperados sao registrados.  
[ ] Nao existem blocos `catch` vazios.  
[ ] Erros nao sao ocultados.  
[ ] Mensagens ao usuario sao adequadas.  
[ ] Detalhes internos nao vazam para o cliente.  
[ ] Codigos HTTP sao coerentes.  
[ ] Falhas externas possuem timeout.  
[ ] Retry possui limite.  
[ ] Falhas criticas geram sinal observavel.  
[ ] O fallback nao esconde falhas relevantes.  

### Banco de dados

[ ] O schema corresponde a modelagem aprovada.  
[ ] A migration e necessaria.  
[ ] A migration e segura.  
[ ] A migration e compativel com dados existentes.  
[ ] Campos obrigatorios possuem estrategia de preenchimento.  
[ ] Indices foram avaliados.  
[ ] Constraints foram avaliadas.  
[ ] Unicidade foi considerada.  
[ ] Chaves estrangeiras estao corretas.  
[ ] Deletes possuem comportamento definido.  
[ ] Transacoes sao utilizadas quando necessario.  
[ ] Existe rollback ou estrategia de recuperacao.  
[ ] Nao ha operacao destrutiva nao planejada.  

Alteracoes de banco devem seguir tambem `migration-check.md`.

### Concorrencia e idempotencia

[ ] Operacoes repetidas nao geram duplicidade.  
[ ] Webhooks possuem deduplicacao.  
[ ] Jobs podem ser reprocessados com seguranca.  
[ ] Atualizacoes concorrentes foram consideradas.  
[ ] Contadores utilizam operacoes atomicas.  
[ ] Transacoes sao suficientes.  
[ ] Constraints protegem integridade.  
[ ] Locks sao utilizados apenas quando necessarios.  
[ ] Existe controle de versao quando aplicavel.  
[ ] Retries nao repetem efeitos colaterais indevidos.  

### Integracoes externas

[ ] Credenciais nao estao hardcoded.  
[ ] Segredos usam variaveis seguras.  
[ ] Payloads externos sao validados.  
[ ] Webhooks validam assinatura.  
[ ] A integracao possui timeout.  
[ ] O retry e controlado.  
[ ] Rate limits foram considerados.  
[ ] Respostas inesperadas foram tratadas.  
[ ] A versao da API foi considerada.  
[ ] Logs nao expoem credenciais.  
[ ] Falhas externas nao quebram fluxos nao relacionados.  
[ ] Existe fallback quando necessario.  

### Filas e workers

[ ] Jobs possuem nome e payload claros.  
[ ] Payloads sao validados.  
[ ] Jobs sao idempotentes quando necessario.  
[ ] Retries possuem limite.  
[ ] Backoff foi definido.  
[ ] Dead-letter ou tratamento de falha foi considerado.  
[ ] O job registra sucesso e falha.  
[ ] O tenant acompanha o job.  
[ ] Dados sensiveis nao sao expostos.  
[ ] Jobs antigos sao compativeis com a nova versao.  
[ ] O worker trata shutdown corretamente.  

### WebSockets e eventos

[ ] Eventos possuem contrato definido.  
[ ] Eventos nao expoem dados de outra empresa.  
[ ] Salas ou canais sao isolados.  
[ ] O usuario e autorizado antes da inscricao.  
[ ] Eventos duplicados foram considerados.  
[ ] Reconexao foi considerada.  
[ ] O frontend trata eventos fora de ordem.  
[ ] Payloads possuem versao ou estabilidade adequada.  
[ ] Nao ha vazamento de dados sensiveis.  
[ ] Eventos criticos tambem sao persistidos quando necessario.  

### Recursos de IA

[ ] O escopo da IA esta claramente limitado.  
[ ] Dados enviados ao modelo sao necessarios.  
[ ] Dados pessoais foram minimizados.  
[ ] Entradas sao protegidas contra prompt injection.  
[ ] Saidas sao validadas.  
[ ] A IA nao toma acoes criticas sem controle.  
[ ] Existe fallback humano.  
[ ] Erros do modelo sao tratados.  
[ ] O consumo de tokens e registrado.  
[ ] O modelo utilizado e adequado ao caso.  
[ ] Prompts nao expoem instrucoes internas.  
[ ] Ferramentas acessadas pela IA possuem autorizacao.  
[ ] O tenant e validado em toda acao.  
[ ] Respostas potencialmente inseguras sao bloqueadas.  

Aplicar tambem `ai-guardrails-check.md`.

### Observabilidade

[ ] Fluxos criticos possuem logs.  
[ ] Logs sao estruturados.  
[ ] Existe correlation ID.  
[ ] O tenant pode ser identificado com seguranca.  
[ ] Falhas externas sao registradas.  
[ ] Jobs possuem rastreabilidade.  
[ ] Metricas relevantes foram adicionadas.  
[ ] Alertas foram considerados.  
[ ] Nao existem logs excessivos.  
[ ] Nao existem dados pessoais desnecessarios nos logs.  
[ ] Tokens e segredos nao sao registrados.  
[ ] Erros silenciosos foram evitados.  

Aplicar tambem `observability-check.md`.

### Desempenho

[ ] Consultas N+1 foram evitadas.  
[ ] Consultas possuem filtros adequados.  
[ ] Paginacao foi aplicada.  
[ ] Indices foram considerados.  
[ ] Dados excessivos nao sao carregados.  
[ ] APIs nao retornam campos desnecessarios.  
[ ] Loops nao realizam chamadas externas repetidas.  
[ ] Cache foi avaliado.  
[ ] Invalidacao de cache foi considerada.  
[ ] O frontend evita renderizacoes desnecessarias.  
[ ] O bundle nao recebeu dependencia pesada sem necessidade.  
[ ] Operacoes sincronas pesadas foram evitadas.  

### Testes

[ ] Existem testes para o cenario principal.  
[ ] Existem testes para cenarios de erro.  
[ ] Existem testes de permissao.  
[ ] Existe teste de isolamento entre empresas.  
[ ] Entradas invalidas sao testadas.  
[ ] Dados inexistentes sao testados.  
[ ] Duplicidade e testada.  
[ ] Integracoes possuem mocks ou testes de contrato.  
[ ] Migrations foram testadas.  
[ ] Os testes validam comportamento, nao implementacao interna.  
[ ] Os testes sao deterministicos.  
[ ] Os testes nao dependem de ordem.  
[ ] Os testes antigos continuam passando.  

Ausencia de teste deve ser tratada conforme o risco da alteracao.

### Frontend

[ ] Estados de carregamento existem.  
[ ] Estados de erro existem.  
[ ] Estados vazios existem.  
[ ] A interface respeita permissoes.  
[ ] Acoes indisponiveis sao bloqueadas.  
[ ] O backend continua validando as permissoes.  
[ ] Formularios validam entradas.  
[ ] Mensagens de erro sao compreensiveis.  
[ ] Componentes existentes foram reutilizados.  
[ ] Acessibilidade basica foi respeitada.  
[ ] O layout e responsivo.  
[ ] Dados nao confiaveis sao renderizados com seguranca.  
[ ] Nao existem informacoes sensiveis no cliente.  

### APIs

[ ] A rota segue o padrao do projeto.  
[ ] O metodo HTTP e adequado.  
[ ] O status HTTP e adequado.  
[ ] O contrato de entrada esta documentado.  
[ ] O contrato de saida esta documentado.  
[ ] Erros possuem formato consistente.  
[ ] Paginacao segue padrao.  
[ ] Filtros seguem padrao.  
[ ] Ordenacao segue padrao.  
[ ] A API e compativel com consumidores existentes.  
[ ] Mudancas incompativeis foram versionadas.  
[ ] Dados sensiveis nao sao retornados.  

### Documentacao

[ ] A documentacao tecnica foi atualizada.  
[ ] Variaveis de ambiente foram documentadas.  
[ ] Novas rotas foram documentadas.  
[ ] Novos eventos foram documentados.  
[ ] Novos jobs foram documentados.  
[ ] Regras de negocio alteradas foram atualizadas.  
[ ] Decisoes arquiteturais relevantes foram registradas.  
[ ] Instrucoes de execucao foram atualizadas.  
[ ] Procedimentos de rollback foram documentados.  
[ ] Comentarios explicam decisoes, nao codigo obvio.  

## 8. Padrao dos comentarios de revisao

Cada comentario deve conter:

1. severidade;
2. arquivo e localizacao;
3. problema encontrado;
4. impacto;
5. evidencia;
6. correcao recomendada.

Formato:

```md
### [ALTO] Falta de isolamento por empresa

**Arquivo:** `src/modules/cards/cards.service.ts`  
**Local:** metodo `findById`

**Problema:**  
A consulta busca o card apenas pelo `id` e nao valida o `organizationId`.

**Impacto:**  
Um usuario autenticado pode acessar um card pertencente a outra empresa caso
conheca o identificador.

**Correcao recomendada:**  
Adicionar o identificador da empresa na consulta e validar a propriedade do
recurso antes de retornar os dados.
```

Os comentarios devem ser especificos, objetivos, tecnicamente fundamentados,
acionaveis, proporcionais ao risco, respeitosos e independentes de preferencia
pessoal.

Evitar comentarios como:

- "nao gostei";
- "melhorar isso";
- "esta estranho";
- "refaca";
- "nao esta bom";
- "use outro padrao" sem justificativa.

## 9. Condicoes automaticas de bloqueio

A revisao deve ser bloqueada quando existir:

- falha de isolamento multiempresa;
- bypass de autenticacao;
- bypass de autorizacao;
- segredo no codigo;
- dado pessoal sensivel exposto em log;
- migration destrutiva sem estrategia;
- perda potencial de dados;
- falha critica sem tratamento;
- endpoint critico sem validacao;
- operacao nao idempotente sujeita a duplicidade grave;
- ausencia de transacao em operacao critica;
- alteracao incompativel nao documentada;
- mudanca fora do escopo com impacto relevante;
- teste essencial ausente;
- codigo que contradiz regra de negocio aprovada;
- dependencia vulneravel ou sem justificativa;
- recurso de IA com acao critica sem controle;
- webhook sem validacao minima;
- falha silenciosa em fluxo critico.

## 10. Criterios de aprovacao

### Aprovado

A alteracao pode ser aprovada quando:

- nao existem achados criticos;
- nao existem achados altos pendentes;
- o escopo foi atendido;
- os criterios de aceite foram cumpridos;
- os testes necessarios passaram;
- seguranca e permissoes foram validadas;
- o isolamento multiempresa foi confirmado;
- a documentacao foi atualizada;
- riscos residuais sao aceitaveis.

### Aprovado com ressalvas

Pode ser usado apenas quando:

- nao existem problemas criticos ou altos;
- os itens pendentes sao de baixo risco;
- as ressalvas estao documentadas;
- existe responsavel e prazo para correcao;
- a alteracao pode operar com seguranca.

### Alteracoes solicitadas

Usar quando:

- existem problemas altos;
- criterios de aceite nao foram cumpridos;
- testes importantes estao ausentes;
- regras de negocio estao incorretas;
- a arquitetura foi violada;
- permissoes estao incompletas;
- existe risco relevante de regressao.

### Bloqueado

Usar quando:

- existe problema critico;
- nao ha documentacao suficiente;
- o diff nao pode ser validado;
- testes essenciais nao podem ser executados;
- a alteracao apresenta risco de perda de dados;
- o isolamento multiempresa nao pode ser comprovado;
- ha conflito entre codigo e especificacao.

## 11. Formato obrigatorio de saida

Ao finalizar a revisao, gerar:

```md
# Code Review Report

## Identificacao
- Story:
- Tarefa:
- Branch:
- Commit:
- Autor:
- Revisor:

## Objetivo da alteracao
- Problema:
- Resultado esperado:
- Escopo revisado:

## Resumo da revisao
- Arquivos analisados:
- Testes analisados:
- Migrations analisadas:
- Dependencias adicionadas:

## Pontos positivos
- item:

## Achados criticos
### Achado 1
- arquivo:
- localizacao:
- problema:
- impacto:
- correcao recomendada:

## Achados altos
### Achado 1
- arquivo:
- localizacao:
- problema:
- impacto:
- correcao recomendada:

## Achados medios
### Achado 1
- arquivo:
- localizacao:
- problema:
- impacto:
- correcao recomendada:

## Achados baixos
### Achado 1
- arquivo:
- localizacao:
- problema:
- correcao recomendada:

## Sugestoes
- sugestao:
- beneficio:

## Regras de negocio
- status:
- observacoes:

## Permissoes
- autenticacao:
- autorizacao:
- isolamento multiempresa:
- observacoes:

## Seguranca
- validacao de entrada:
- segredos:
- dados sensiveis:
- observacoes:

## Banco de dados
- migration:
- integridade:
- rollback:
- observacoes:

## Observabilidade
- logs:
- metricas:
- alertas:
- observacoes:

## Testes
- unitarios:
- integracao:
- end-to-end:
- permissoes:
- multiempresa:
- resultado:

## Validacoes tecnicas
- typecheck:
- lint:
- build:
- testes:
- migration:

## Resultado final
- [ ] Aprovado
- [ ] Aprovado com ressalvas
- [ ] Alteracoes solicitadas
- [ ] Bloqueado

## Justificativa
- decisao:
- riscos residuais:
- acoes necessarias:
```

## 12. Resultado esperado

A aplicacao desta skill deve garantir que o codigo revisado seja:

- funcionalmente correto;
- aderente ao escopo;
- consistente com as regras de negocio;
- compativel com a arquitetura;
- seguro;
- corretamente autorizado;
- isolado por empresa;
- testavel;
- observavel;
- manutenivel;
- preparado para os checks seguintes;
- adequado para merge somente quando houver evidencia suficiente.
