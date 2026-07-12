# observability-check

## 1. Finalidade

A skill `observability-check` garante que toda implementacao relevante do
Giraffe CRM seja observavel em producao por meio de logs, metricas, traces,
auditoria, alertas e contexto de correlacao.

Esta skill deve impedir:

- falhas silenciosas;
- erros sem contexto;
- logs insuficientes;
- logs excessivos;
- ausencia de correlacao entre servicos;
- falta de rastreabilidade em filas e integracoes;
- alertas sem acao;
- metricas sem utilidade operacional;
- exposicao de dados sensiveis em telemetria;
- impossibilidade de investigar incidentes;
- ausencia de visibilidade sobre automacoes;
- ausencia de visibilidade sobre consumo e falhas de IA.

## 2. Quando usar

Aplicar sempre que uma alteracao afetar:

- APIs;
- servicos de dominio;
- banco de dados;
- autenticacao;
- autorizacao;
- integracoes externas;
- webhooks;
- filas;
- workers;
- automacoes;
- WebSockets;
- uploads;
- exportacoes;
- importacoes;
- processamento assincrono;
- infraestrutura;
- deploy;
- recursos de IA;
- operacoes criticas;
- fluxos com impacto financeiro;
- fluxos com impacto em dados pessoais.

Sequencia recomendada:

1. `technical-docs-check.md`;
2. `pre-implementation-check.md`;
3. `safe-implementation.md`;
4. `code-review.md`;
5. `security-check.md`;
6. `lgpd-check.md`;
7. `observability-check.md`;
8. demais checks aplicaveis.

## 3. Regra principal

Toda funcionalidade critica deve permitir responder:

- o que aconteceu;
- quando aconteceu;
- onde aconteceu;
- com qual usuario;
- em qual empresa;
- em qual requisicao;
- em qual job;
- em qual integracao;
- com qual resultado;
- qual foi o erro;
- qual foi o impacto;
- se houve retry;
- se houve fallback;
- se houve recuperacao.

Se essas respostas nao puderem ser obtidas com seguranca e precisao, a
observabilidade e insuficiente.

## 4. Principios obrigatorios

Toda implementacao deve seguir:

- logs estruturados;
- correlacao ponta a ponta;
- contexto minimo suficiente;
- minimizacao de dados;
- metricas acionaveis;
- alertas relevantes;
- falha visivel;
- rastreabilidade de efeitos;
- separacao entre log operacional e auditoria;
- retencao definida;
- consistencia de nomenclatura;
- baixo ruido;
- evidencia verificavel.

## 5. Processo obrigatorio

### Etapa 1 - Classificar a criticidade

Classificar o fluxo como:

- **Baixa criticidade:** ajustes visuais, carregamento de conteudo nao critico,
  eventos sem persistencia ou acoes sem impacto operacional.
- **Media criticidade:** leitura de dados, filtros, atualizacoes nao criticas,
  notificacoes internas ou sincronizacoes recuperaveis.
- **Alta criticidade:** criacao ou alteracao de dados importantes,
  movimentacao de cards, automacoes, envio de mensagens, integracoes, uploads,
  importacoes, exportacoes, jobs assincronos ou acoes de IA com efeito
  persistente.
- **Critica:** autenticacao, permissoes, exclusoes, migracoes, restauracao,
  faturamento, isolamento multiempresa, incidentes de seguranca, acoes
  irreversiveis ou processamento em massa.

A profundidade da observabilidade deve acompanhar a criticidade.

### Etapa 2 - Mapear pontos observaveis

Identificar:

- entrada do fluxo;
- validacoes;
- autorizacao;
- operacao principal;
- acesso ao banco;
- chamadas externas;
- publicacao de eventos;
- criacao de jobs;
- execucao de jobs;
- retries;
- fallback;
- conclusao;
- falha;
- compensacao;
- auditoria.

### Etapa 3 - Definir sinais necessarios

Para cada fluxo, avaliar necessidade de:

- logs;
- metricas;
- traces;
- eventos de auditoria;
- alertas;
- dashboards;
- health checks;
- dead-letter;
- indicadores de negocio.

## 6. Logs

### Objetivo dos logs

Logs devem permitir diagnostico, correlacao, investigacao, analise de falhas,
analise de latencia, rastreio de integracoes, rastreio de jobs e analise de
comportamento anormal.

Logs nao devem ser usados como substitutos de metricas ou auditoria.

### Logs estruturados

Utilizar formato estruturado, preferencialmente JSON.

Campos recomendados:

- `timestamp`;
- `level`;
- `service`;
- `environment`;
- `event`;
- `message`;
- `requestId`;
- `correlationId`;
- `traceId`;
- `spanId`;
- `tenantId`;
- `userId`;
- `resourceType`;
- `resourceId`;
- `operation`;
- `status`;
- `durationMs`;
- `errorCode`;
- `errorType`;
- `retryCount`;
- `integration`;
- `jobId`;
- `queue`;
- `version`.

Nem todos os campos precisam existir em todos os logs.

### Niveis de log

- **Debug:** usar apenas para diagnostico detalhado em ambientes controlados,
  sem dados sensiveis.
- **Info:** usar para eventos operacionais relevantes, como inicio e conclusao
  de processo, mudanca de estado, job processado, integracao concluida ou
  fallback acionado.
- **Warn:** usar para comportamento inesperado recuperavel, retry, degradacao,
  uso proximo do limite, integracao lenta, dado inconsistente tratado ou
  fallback nao critico.
- **Error:** usar para falha de operacao, job nao processado, integracao
  indisponivel, erro nao recuperado, inconsistencia relevante ou falha que exige
  investigacao.
- **Fatal:** usar para indisponibilidade do servico, corrupcao de estado,
  impossibilidade de iniciar, falha sistemica critica ou perda de conexao
  essencial sem recuperacao.

### Regras de logging

[ ] Logs sao estruturados.  
[ ] Eventos possuem nomes consistentes.  
[ ] O nivel de log e adequado.  
[ ] O inicio e o fim de fluxos criticos sao rastreaveis.  
[ ] Falhas possuem contexto.  
[ ] O erro original e preservado.  
[ ] Retries sao registrados.  
[ ] Fallbacks sao registrados.  
[ ] Operacoes em lote possuem resumo.  
[ ] Logs nao dependem apenas de texto livre.  
[ ] O contexto e herdado entre camadas.  
[ ] Logs duplicados foram evitados.  
[ ] Eventos de sucesso excessivamente frequentes foram controlados.  
[ ] Logs de desenvolvimento nao vazam para producao sem necessidade.  

### Dados proibidos em logs

Nunca registrar:

- senhas;
- tokens;
- refresh tokens;
- chaves de API;
- cookies;
- secrets;
- credenciais;
- conteudo completo de autorizacao;
- dados bancarios completos;
- documentos pessoais completos;
- mensagens completas sem justificativa;
- prompts completos com dados pessoais;
- respostas completas de IA com dados sensiveis;
- payloads completos de webhook por padrao;
- arquivos em base64;
- conteudo bruto de anexos.

### Mascaramento

Quando necessario, aplicar mascaramento em e-mail, telefone, CPF, CNPJ, IP, IDs
externos, identificadores de sessao, conteudo de mensagens e dados de
integracao.

Exemplo:

```text
email: ma***@dominio.com
phone: ******4321
cpf: ***.***.***-09
```

## 7. Correlacao

### Correlation ID

Toda operacao distribuida deve possuir um identificador de correlacao.

Esse identificador deve acompanhar requisicao HTTP, servico interno, acesso a
banco, evento, fila, worker, integracao, resposta, logs e traces.

### Request ID

Cada requisicao deve possuir identificador proprio.

O `requestId` pode ser diferente do `correlationId`.

Exemplo:

- um `correlationId` representa uma automacao completa;
- varios `requestId` representam chamadas individuais dentro dela.

### Contexto multiempresa

[ ] O `tenantId` acompanha os logs relevantes.  
[ ] O tenant vem de contexto confiavel.  
[ ] O tenant nao e registrado quando desnecessario.  
[ ] Logs nao misturam informacoes entre empresas.  
[ ] Filas preservam a correlacao e o tenant.  
[ ] Integracoes preservam contexto suficiente.  

## 8. Metricas

### Objetivo das metricas

Metricas devem responder se o sistema esta saudavel, se o volume esta dentro do
esperado, se a latencia aumentou, se os erros cresceram, se filas estao
acumulando, se integracoes estao falhando, se automacoes estao sendo executadas,
se a IA esta consumindo alem do previsto e se usuarios estao sendo impactados.

### Categorias de metricas

**Metricas tecnicas:**

- taxa de erro;
- latencia;
- throughput;
- uso de CPU;
- uso de memoria;
- conexoes;
- tamanho de fila;
- retries;
- timeouts;
- falhas de banco;
- falhas de cache;
- status de workers.

**Metricas operacionais:**

- jobs processados;
- jobs falhos;
- mensagens enviadas;
- webhooks recebidos;
- automacoes executadas;
- exportacoes;
- importacoes;
- uploads;
- eventos WebSocket;
- falhas por integracao.

**Metricas de negocio:**

- cards criados;
- cards movimentados;
- formularios enviados;
- contatos criados;
- conversas iniciadas;
- automacoes concluidas;
- follow-ups gerados;
- falhas de entrega;
- tempo medio por etapa.

**Metricas de IA:**

- chamadas por modelo;
- tokens de entrada;
- tokens de saida;
- custo estimado;
- latencia;
- taxa de erro;
- retries;
- fallback humano;
- respostas bloqueadas;
- uso por tenant;
- uso por funcionalidade.

### Regras para metricas

[ ] A metrica possui objetivo claro.  
[ ] O nome segue padrao.  
[ ] Labels possuem cardinalidade controlada.  
[ ] IDs individuais nao sao usados como labels.  
[ ] Dados pessoais nao sao usados como labels.  
[ ] Metricas criticas possuem baseline.  
[ ] Metricas possuem unidade.  
[ ] Metricas podem ser agregadas.  
[ ] Metricas nao duplicam logs.  
[ ] A retencao e adequada.  
[ ] O custo de coleta foi considerado.  

### Labels perigosas

Evitar labels com alta cardinalidade:

- `userId`;
- `tenantId` em sistemas com muitos tenants;
- `resourceId`;
- `requestId`;
- `email`;
- `phone`;
- `url` completa;
- mensagem de erro completa;
- conteudo de prompt;
- nome de arquivo arbitrario.

Quando necessario, usar agregacao ou dimensoes controladas.

## 9. Traces

### Quando usar tracing

Aplicar tracing distribuido em fluxos com multiplos servicos, filas,
integracoes, latencia variavel, chamadas encadeadas, jobs assincronos,
automacoes, IA com ferramentas ou operacoes criticas.

### Regras de tracing

[ ] O trace comeca na entrada.  
[ ] O contexto e propagado.  
[ ] Spans possuem nomes claros.  
[ ] Chamadas externas possuem spans.  
[ ] Operacoes de banco relevantes possuem spans.  
[ ] Filas propagam contexto.  
[ ] Erros marcam o span.  
[ ] Dados sensiveis nao estao em atributos.  
[ ] A amostragem e adequada.  
[ ] Traces criticos podem ser localizados por correlacao.  

## 10. Alertas

### Regra principal dos alertas

Todo alerta deve indicar uma condicao acionavel.

Um alerta deve responder:

- o que falhou;
- qual servico;
- desde quando;
- qual impacto provavel;
- qual limiar foi excedido;
- qual acao inicial executar;
- onde investigar.

### Alertas recomendados

- **APIs:** aumento de erros 5xx, aumento de latencia, queda de throughput,
  timeout elevado ou autenticacao falhando acima do normal.
- **Banco de dados:** conexoes proximas do limite, queries lentas, falha de
  conexao, lock prolongado, replicacao atrasada ou espaco proximo do limite.
- **Redis:** indisponibilidade, evictions elevadas, memoria proxima do limite,
  latencia elevada ou falha de conexao.
- **Filas:** backlog crescente, jobs falhos, dead-letter, worker offline, retry
  excessivo ou job parado por tempo anormal.
- **Integracoes:** taxa de erro, timeout, autenticacao invalida, webhook
  invalido, quota excedida ou degradacao de provedor.
- **IA:** aumento de custo, aumento de tokens, erro de modelo, fallback
  excessivo, latencia elevada, respostas bloqueadas, loops de ferramentas ou
  uso fora do padrao.
- **Seguranca:** falhas repetidas de login, tentativa de acesso entre tenants,
  uso anormal de exportacao, aumento de 403, webhook invalido ou comportamento
  suspeito.

### Regras para alertas

[ ] O alerta possui dono.  
[ ] O alerta possui severidade.  
[ ] O limiar e justificavel.  
[ ] O alerta evita ruido.  
[ ] Existe janela de avaliacao.  
[ ] Existe runbook.  
[ ] Existe canal de notificacao.  
[ ] Existe deduplicacao.  
[ ] Existe escalonamento quando necessario.  
[ ] O alerta e testavel.  
[ ] O alerta pode ser silenciado com controle.  
[ ] O alerta nao depende de dado pessoal.  

## 11. Health checks

### Tipos

- **Liveness:** indica se o processo esta vivo. Nao deve depender de todos os
  servicos externos.
- **Readiness:** indica se o servico pode receber trafego. Pode verificar
  dependencias essenciais.
- **Startup:** indica se a inicializacao terminou corretamente. Util para
  servicos com boot demorado.

### Regras de health checks

[ ] Nao expoem segredos.  
[ ] Nao retornam detalhes internos excessivos.  
[ ] Possuem timeout.  
[ ] Diferenciam liveness de readiness.  
[ ] Validam dependencias essenciais.  
[ ] Nao executam operacoes pesadas.  
[ ] Nao alteram estado.  
[ ] Sao monitorados externamente.  
[ ] Possuem comportamento definido durante deploy.  

## 12. Auditoria

### Diferenca entre log e auditoria

Logs operacionais ajudam a diagnosticar.

Auditoria registra acoes relevantes para seguranca, conformidade,
rastreabilidade, investigacao e responsabilidade.

### Eventos que devem ser auditados

- login;
- logout;
- falha de login relevante;
- alteracao de senha;
- alteracao de e-mail;
- alteracao de permissao;
- convite;
- remocao de usuario;
- acesso administrativo;
- exportacao;
- exclusao;
- alteracao de integracao;
- criacao de token;
- revogacao de token;
- alteracao de automacao;
- acao de IA com efeito persistente;
- alteracao de configuracao;
- restauracao de backup;
- migration critica.

### Campos de auditoria

- ator;
- tenant;
- acao;
- recurso;
- recurso anterior;
- recurso posterior;
- resultado;
- timestamp;
- origem;
- IP quando permitido;
- user agent quando necessario;
- correlation ID;
- justificativa quando aplicavel.

### Regras de auditoria

[ ] Usuarios comuns nao alteram auditoria.  
[ ] Auditoria possui retencao definida.  
[ ] Dados sensiveis sao minimizados.  
[ ] Alteracoes criticas possuem antes e depois quando permitido.  
[ ] Falhas tambem sao registradas.  
[ ] A auditoria pode ser consultada com autorizacao.  
[ ] O tenant esta correto.  
[ ] A acao automatizada identifica o executor tecnico.  
[ ] A acao de IA identifica ferramenta e decisao.  

## 13. Checklists por area

### APIs

[ ] Requisicoes possuem `requestId`.  
[ ] Erros possuem codigo estavel.  
[ ] Latencia e medida.  
[ ] Status codes sao agregados.  
[ ] Payloads nao sao registrados integralmente.  
[ ] Dependencias externas sao rastreadas.  
[ ] Timeouts sao medidos.  
[ ] Rate limit possui metrica.  
[ ] Falhas de autorizacao sao observaveis.  
[ ] Endpoints criticos possuem dashboard ou metricas.  

### Banco de dados

[ ] Queries lentas podem ser identificadas.  
[ ] Falhas de conexao sao registradas.  
[ ] Transacoes falhas sao rastreaveis.  
[ ] Deadlocks sao observaveis.  
[ ] Pool de conexao e monitorado.  
[ ] Migrations possuem logs.  
[ ] Operacoes em lote possuem metricas.  
[ ] Dados sensiveis nao aparecem em query logs.  
[ ] N+1 pode ser detectado.  
[ ] Tempo de query e medido.  

### Filas e workers

[ ] Job possui identificador.  
[ ] Job possui correlation ID.  
[ ] Job possui tenant.  
[ ] Inicio e registrado.  
[ ] Sucesso e registrado.  
[ ] Falha e registrada.  
[ ] Retry e registrado.  
[ ] Duracao e medida.  
[ ] Backlog e monitorado.  
[ ] Dead-letter e monitorada.  
[ ] Worker offline gera alerta.  
[ ] Payload sensivel nao e logado.  
[ ] Jobs presos podem ser identificados.  
[ ] Jobs duplicados podem ser detectados.  

### Webhooks

[ ] Recebimento e registrado.  
[ ] A origem e identificada.  
[ ] Assinatura invalida e registrada.  
[ ] Duplicidade e registrada.  
[ ] Latencia de processamento e medida.  
[ ] Resposta ao provedor e medida.  
[ ] Falhas geram retry controlado.  
[ ] Eventos descartados sao contabilizados.  
[ ] O tenant e rastreavel.  
[ ] Payload completo nao e registrado por padrao.  
[ ] Existe metrica por tipo de evento.  
[ ] Existe alerta para falha persistente.  

### Integracoes externas

[ ] Cada chamada possui timeout.  
[ ] Latencia e medida.  
[ ] Status da resposta e registrado.  
[ ] Retry e registrado.  
[ ] Rate limit externo e monitorado.  
[ ] Credenciais invalidas geram alerta.  
[ ] Payloads sensiveis sao minimizados.  
[ ] Erros do provedor sao normalizados.  
[ ] O nome da integracao e registrado.  
[ ] A versao da API pode ser identificada.  
[ ] Existe metrica de disponibilidade.  
[ ] Fallbacks sao rastreados.  

### WebSockets

[ ] Conexoes ativas sao monitoradas.  
[ ] Falhas de autenticacao sao registradas.  
[ ] Entrada em sala e rastreavel.  
[ ] Eventos enviados sao contabilizados.  
[ ] Eventos rejeitados sao contabilizados.  
[ ] Desconexoes anormais sao monitoradas.  
[ ] Reconexoes excessivas podem ser detectadas.  
[ ] Eventos entre tenants sao bloqueados e auditados.  
[ ] Payloads sensiveis nao sao logados.  
[ ] Flood pode ser detectado.  

### Automacoes

Toda automacao deve permitir rastrear gatilho, condicoes, acoes, inicio,
resultado, duracao, retries, falha, fallback, recursos afetados, tenant,
executor e custo quando aplicavel.

[ ] Cada execucao possui identificador.  
[ ] O resultado e persistido.  
[ ] Falhas sao visiveis ao usuario autorizado.  
[ ] A acao exata pode ser identificada.  
[ ] Existe historico.  
[ ] Retries nao escondem falhas.  
[ ] Execucoes parciais sao identificaveis.  
[ ] Compensacoes sao registradas.  
[ ] Automacoes desativadas nao executam.  
[ ] Execucoes excessivas podem ser alertadas.  

### Inteligencia artificial

Aplicar tambem:

- `ai-guardrails-check.md`;
- `cost-monitoring-check.md`;
- `lgpd-check.md`.

[ ] Cada chamada possui identificador.  
[ ] O modelo utilizado e registrado.  
[ ] A funcionalidade de origem e registrada.  
[ ] O tenant e rastreavel.  
[ ] Tokens de entrada sao medidos.  
[ ] Tokens de saida sao medidos.  
[ ] Custo estimado e registrado.  
[ ] Latencia e medida.  
[ ] Erros sao classificados.  
[ ] Retries sao registrados.  
[ ] Fallback humano e registrado.  
[ ] Respostas bloqueadas sao contabilizadas.  
[ ] Ferramentas chamadas sao registradas.  
[ ] Loops de ferramentas sao detectaveis.  
[ ] Dados pessoais nao sao expostos nos logs.  
[ ] Prompts completos nao sao registrados por padrao.  
[ ] Saidas completas nao sao registradas por padrao.  
[ ] Versao do prompt pode ser identificada.  
[ ] Limites excedidos geram sinal.  
[ ] Uso anormal por tenant pode ser detectado.  

### Frontend

[ ] Erros relevantes sao capturados.  
[ ] Erros possuem contexto minimo.  
[ ] Source maps sao protegidos adequadamente.  
[ ] Falhas de API sao diferenciadas.  
[ ] Erros de renderizacao sao observaveis.  
[ ] Web Vitals sao coletados quando necessario.  
[ ] Sessoes afetadas podem ser correlacionadas sem expor dados.  
[ ] Informacoes sensiveis nao sao enviadas a ferramenta de monitoramento.  
[ ] Feedback do usuario pode ser associado ao erro.  
[ ] Loops de renderizacao podem ser detectados.  

### Infraestrutura e deploy

[ ] Deploy possui identificador.  
[ ] Versao da aplicacao e registrada.  
[ ] Falhas de deploy sao visiveis.  
[ ] Rollback e rastreavel.  
[ ] Reinicializacoes sao monitoradas.  
[ ] Uso de CPU e monitorado.  
[ ] Uso de memoria e monitorado.  
[ ] Disco e monitorado.  
[ ] Certificados sao monitorados.  
[ ] Servicos internos possuem health check.  
[ ] Containers reiniciando geram alerta.  
[ ] Configuracao por ambiente e identificavel.  
[ ] Migrations podem ser correlacionadas ao deploy.  
[ ] Mudancas de configuracao sao auditadas.  

## 14. Dashboards minimos

Dependendo do escopo, considerar dashboards para:

- **Visao geral:** disponibilidade, erros, latencia, throughput e deploy atual.
- **APIs:** requisicoes, p95, p99, erros 4xx, erros 5xx e endpoints lentos.
- **Banco:** conexoes, queries lentas, locks, erros e uso de disco.
- **Filas:** backlog, jobs por minuto, falhas, retries, dead-letter e workers
  ativos.
- **Integracoes:** disponibilidade, latencia, erro por provedor, retries e
  quota.
- **IA:** chamadas, tokens, custo, latencia, erros, fallback e uso por
  funcionalidade.
- **Negocio:** cards, formularios, contatos, mensagens, automacoes e falhas
  operacionais.

## 15. SLO, SLA e indicadores

Quando aplicavel, definir:

- disponibilidade alvo;
- latencia alvo;
- taxa maxima de erro;
- tempo maximo de processamento;
- backlog aceitavel;
- tempo de recuperacao;
- volume esperado;
- custo esperado;
- tolerancia a falhas.

Exemplo:

```text
SLO: 99,9% das requisicoes de leitura abaixo de 500 ms em 30 dias.
```

## 16. Testes de observabilidade

Executar quando aplicavel:

- gerar erro controlado;
- validar log;
- validar correlation ID;
- validar trace;
- validar metrica;
- validar alerta;
- validar retry;
- validar dead-letter;
- validar health check;
- validar falha de integracao;
- validar falha de worker;
- validar timeout;
- validar fallback;
- validar anonimizacao;
- validar ausencia de dados sensiveis;
- validar dashboard.

## 17. Severidade dos achados

### Critico

Exemplos: falha critica totalmente silenciosa, ausencia de rastreabilidade em
exclusao em massa, impossibilidade de investigar incidente entre tenants, perda
de jobs sem registro ou ausencia de qualquer sinal em acao irreversivel.

Bloqueia imediatamente.

### Alto

Exemplos: fila sem metrica, worker falhando sem alerta, integracao critica sem
observabilidade, automacao sem historico, IA com custo sem medicao ou logs sem
correlacao em fluxo distribuido.

Normalmente bloqueia.

### Medio

Exemplos: metricas incompletas, dashboard ausente, alerta sem runbook, nivel de
log inadequado, retencao nao definida ou rastreabilidade parcial.

Pode bloquear conforme o risco.

### Baixo

Exemplos: nomenclatura inconsistente, mensagem pouco clara, ausencia de metrica
secundaria ou pequeno excesso de logs.

Deve ser corrigido ou registrado.

## 18. Condicoes automaticas de bloqueio

A aprovacao deve ser bloqueada quando houver:

- falha critica silenciosa;
- ausencia de logs em operacao irreversivel;
- ausencia de correlacao em fluxo distribuido critico;
- jobs perdidos sem rastreabilidade;
- integracoes criticas sem monitoramento;
- automacoes sem historico de execucao;
- logs com segredos;
- logs com dados pessoais excessivos;
- ausencia de alertas para indisponibilidade critica;
- ausencia de metrica de backlog em fila essencial;
- IA sem controle de custo ou falha;
- impossibilidade de identificar tenant em incidente;
- health check enganoso;
- erro grave sem contexto suficiente;
- risco critico nao mitigado.

## 19. Checklist final

[ ] A criticidade foi classificada.  
[ ] Os pontos observaveis foram mapeados.  
[ ] Logs sao estruturados.  
[ ] Existe correlation ID.  
[ ] O tenant e rastreavel com seguranca.  
[ ] Falhas criticas nao sao silenciosas.  
[ ] Retries sao visiveis.  
[ ] Fallbacks sao visiveis.  
[ ] Metricas tecnicas foram definidas.  
[ ] Metricas operacionais foram definidas.  
[ ] Metricas de negocio foram avaliadas.  
[ ] Alertas sao acionaveis.  
[ ] Health checks sao adequados.  
[ ] Filas sao monitoradas.  
[ ] Integracoes sao monitoradas.  
[ ] Automacoes possuem historico.  
[ ] IA possui metricas de uso e falha.  
[ ] Logs nao expoem segredos.  
[ ] Logs nao expoem dados pessoais desnecessarios.  
[ ] A retencao foi definida.  
[ ] Testes de observabilidade foram executados.  
[ ] Nao existem achados criticos pendentes.  
[ ] Nao existem achados altos pendentes.  

## 20. Formato obrigatorio de saida

Ao finalizar esta skill, gerar:

```md
# Observability Check Report

## Identificacao
- Story:
- Tarefa:
- Branch:
- Commit:
- Responsavel:

## Funcionalidade analisada
- descricao:
- criticidade:
- servicos:
- integracoes:
- filas:
- automacoes:
- IA:

## Mapa do fluxo
- entrada:
- validacao:
- processamento:
- dependencias:
- saida:
- falhas:
- fallback:

## Logs
- eventos:
- niveis:
- campos:
- correlation ID:
- tenant:
- mascaramento:
- retencao:
- observacoes:

## Metricas
- tecnica:
- operacional:
- negocio:
- IA:
- unidade:
- cardinalidade:
- observacoes:

## Traces
- aplicavel:
- inicio:
- spans:
- propagacao:
- amostragem:
- observacoes:

## Alertas
- condicao:
- limiar:
- severidade:
- canal:
- responsavel:
- runbook:
- observacoes:

## Health checks
- liveness:
- readiness:
- startup:
- dependencias:
- observacoes:

## Filas e workers
- backlog:
- falhas:
- retries:
- dead-letter:
- worker offline:
- observacoes:

## Integracoes
- latencia:
- erros:
- timeout:
- retry:
- disponibilidade:
- observacoes:

## Automacoes
- execution ID:
- historico:
- resultado:
- falhas:
- compensacao:
- observacoes:

## IA
- modelo:
- tokens:
- custo:
- latencia:
- erros:
- fallback:
- ferramentas:
- dados sensiveis:
- observacoes:

## Auditoria
- acoes:
- ator:
- tenant:
- recurso:
- antes e depois:
- retencao:
- observacoes:

## Testes executados
- teste:
- resultado:
- evidencia:

## Achados criticos
- achado:

## Achados altos
- achado:

## Achados medios
- achado:

## Achados baixos
- achado:

## Riscos residuais
- risco:
- impacto:
- mitigacao:
- responsavel:

## Resultado final
- [ ] Aprovado
- [ ] Aprovado com ressalvas
- [ ] Alteracoes solicitadas
- [ ] Bloqueado

## Justificativa
- decisao:
- acoes necessarias:
```

## 21. Criterios de aprovacao

A alteracao pode ser aprovada quando:

- fluxos criticos forem rastreaveis;
- falhas nao forem silenciosas;
- logs forem estruturados;
- correlacao estiver implementada;
- tenant e usuario puderem ser identificados com seguranca;
- metricas relevantes existirem;
- alertas forem acionaveis;
- filas e integracoes forem monitoradas;
- automacoes possuirem historico;
- IA possuir metricas de uso, custo e falha;
- dados sensiveis nao forem expostos;
- testes aplicaveis tiverem sido executados;
- nao existirem achados criticos ou altos pendentes.

## 22. Resultado esperado

A aplicacao desta skill deve garantir que o Giraffe CRM:

- permita detectar falhas rapidamente;
- permita investigar incidentes;
- preserve correlacao ponta a ponta;
- monitore filas, integracoes e automacoes;
- torne custos e falhas de IA visiveis;
- produza alertas uteis;
- evite ruido excessivo;
- proteja dados em telemetria;
- gere evidencias operacionais;
- bloqueie implementacoes que possam falhar silenciosamente.
