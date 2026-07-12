# backup-check

## 1. Finalidade

A skill `backup-check` garante que toda alteracao relevante do Giraffe CRM
preserve a capacidade de backup, restauracao e recuperacao dos dados e servicos
criticos.

Esta skill deve impedir:

- ausencia de backup para dados criticos;
- backups nao testados;
- restauracao nao validada;
- perda de dados apos migration;
- backups incompletos;
- retencao indefinida ou insuficiente;
- backups sem criptografia;
- backups acessiveis indevidamente;
- dependencia de um unico ponto de armazenamento;
- exclusao acidental sem possibilidade de recuperacao;
- backups incompativeis com a versao atual;
- restauracao que cause conflito entre tenants;
- recuperacao sem documentacao;
- uso de backup como substituto de alta disponibilidade.

## 2. Quando usar

Aplicar sempre que houver alteracao em:

- banco de dados;
- modelagem de dados;
- migrations;
- exclusoes;
- importacoes;
- exportacoes;
- arquivos;
- anexos;
- MinIO ou armazenamento de objetos;
- configuracoes de producao;
- autenticacao;
- permissoes;
- integracoes;
- filas;
- Redis;
- automacoes;
- infraestrutura;
- deploy;
- restauracao;
- retencao;
- disaster recovery;
- dados pessoais;
- dados tratados por IA;
- embeddings ou indices de busca.

E obrigatoria antes de:

- migration destrutiva;
- alteracao de schema;
- remocao de coluna;
- remocao de tabela;
- mudanca de formato de dado;
- reprocessamento em massa;
- importacao em producao;
- exclusao em massa;
- troca de provedor;
- mudanca de storage;
- atualizacao critica de banco;
- restauracao de ambiente.

Sequencia recomendada:

1. `technical-docs-check.md`;
2. `pre-implementation-check.md`;
3. `safe-implementation.md`;
4. `code-review.md`;
5. `security-check.md`;
6. `lgpd-check.md`;
7. `observability-check.md`;
8. `backup-check.md`;
9. `migration-check.md`, quando aplicavel.

## 3. Regra principal

Um backup so deve ser considerado valido quando:

- foi criado com sucesso;
- contem os dados esperados;
- esta integro;
- pode ser localizado;
- pode ser acessado por quem deve;
- pode ser restaurado;
- a restauracao foi testada;
- o tempo de recuperacao foi medido;
- o procedimento esta documentado;
- o resultado foi validado.

A existencia de um arquivo de backup nao comprova recuperabilidade.

## 4. Conceitos obrigatorios

### RPO

Recovery Point Objective. Define a quantidade maxima aceitavel de perda de dados
medida em tempo.

Exemplo:

```text
RPO de 15 minutos:
em caso de incidente, aceita-se perder no maximo os ultimos 15 minutos de dados.
```

### RTO

Recovery Time Objective. Define o tempo maximo aceitavel para restaurar o
servico.

Exemplo:

```text
RTO de 2 horas:
o sistema deve voltar a operar em ate 2 horas apos o incidente.
```

### Backup completo

Copia integral do conjunto de dados.

### Backup incremental

Copia somente alteracoes desde o ultimo backup.

### Backup diferencial

Copia alteracoes desde o ultimo backup completo.

### PITR

Point-in-Time Recovery. Permite restaurar o banco para um instante especifico.

### Snapshot

Captura do estado de um volume, banco ou servico em determinado momento.

Snapshot nao deve ser automaticamente tratado como backup independente.

### Restore test

Teste real de recuperacao a partir de um backup.

## 5. Principios obrigatorios

Toda estrategia de backup deve seguir:

- copias independentes;
- retencao definida;
- criptografia;
- acesso minimo;
- separacao de ambientes;
- copia fora do ambiente principal;
- restauracao testada;
- rastreabilidade;
- automacao;
- monitoramento;
- compatibilidade;
- protecao contra exclusao indevida;
- documentacao.

## 6. Processo obrigatorio

### Etapa 1 - Identificar ativos criticos

Mapear:

- banco PostgreSQL;
- arquivos e anexos;
- objetos no MinIO;
- configuracoes;
- variaveis de ambiente;
- segredos;
- templates;
- integracoes;
- regras de automacao;
- filas persistentes;
- dados de auditoria;
- historicos de conversa;
- documentos;
- embeddings;
- indices de busca;
- configuracoes do Coolify;
- arquivos de deploy;
- certificados;
- codigo-fonte;
- documentacao operacional.

### Etapa 2 - Classificar criticidade

Classificar cada ativo como:

- **Baixa criticidade:** pode ser recriado facilmente, como cache, arquivos
  temporarios, artefatos de build e dados derivados simples.
- **Media criticidade:** pode ser recriado, mas com custo ou impacto, como
  indices de busca, thumbnails, dados agregados e relatorios derivados.
- **Alta criticidade:** dificil de reconstruir ou com impacto operacional
  relevante, como configuracoes de automacao, arquivos de clientes, historico
  de conversas, integracoes e dados de pipeline.
- **Critica:** perda inaceitavel ou irreversivel, como banco principal,
  permissoes, dados pessoais, registros financeiros, auditoria, credenciais
  mestras e configuracoes essenciais de producao.

### Etapa 3 - Definir RPO e RTO

Para cada ativo critico, registrar:

- RPO;
- RTO;
- frequencia de backup;
- metodo de recuperacao;
- dependencias;
- responsavel;
- prioridade de restauracao.

### Etapa 4 - Definir estrategia

A estrategia deve informar:

- tipo de backup;
- frequencia;
- retencao;
- local;
- criptografia;
- imutabilidade;
- redundancia;
- validacao;
- teste de restauracao;
- alertas;
- procedimento de emergencia.

## 7. Checklist de backup

### Banco de dados

[ ] Existe backup automatico.  
[ ] A frequencia atende ao RPO.  
[ ] Existe backup completo periodico.  
[ ] Existe PITR quando necessario.  
[ ] WAL ou mecanismo equivalente esta configurado quando aplicavel.  
[ ] O backup inclui schema e dados.  
[ ] Extensoes necessarias estao documentadas.  
[ ] Roles e permissoes necessarias estao documentadas.  
[ ] O processo nao depende de execucao manual.  
[ ] O backup possui data, versao e identificacao do ambiente.  
[ ] O backup e validado.  
[ ] A restauracao foi testada.  
[ ] O tempo de restauracao atende ao RTO.  
[ ] A integridade referencial foi verificada apos o restore.  
[ ] O isolamento multiempresa foi preservado.  
[ ] Dados sensiveis permanecem protegidos.  

### Arquivos e anexos

[ ] Arquivos possuem copia separada.  
[ ] O backup cobre todos os buckets necessarios.  
[ ] Metadados sao preservados.  
[ ] Permissoes sao preservadas.  
[ ] O vinculo com registros do banco pode ser reconstruido.  
[ ] Arquivos temporarios nao sao incluidos sem necessidade.  
[ ] URLs assinadas nao sao tratadas como dados permanentes.  
[ ] O processo detecta arquivos ausentes.  
[ ] O restore foi testado.  
[ ] O tenant permanece corretamente associado.  
[ ] O acesso apos restore continua restrito.  
[ ] Arquivos excluidos seguem a politica de retencao.  

### MinIO ou object storage

[ ] Buckets criticos estao incluidos.  
[ ] Versionamento foi avaliado.  
[ ] Object lock foi avaliado.  
[ ] Replicacao foi avaliada.  
[ ] As credenciais de backup possuem privilegio minimo.  
[ ] A copia esta fora do mesmo ponto de falha.  
[ ] A retencao esta configurada.  
[ ] Objetos podem ser restaurados individualmente.  
[ ] O processo de restore nao sobrescreve dados atuais sem controle.  
[ ] O restore mantem metadados e content type.  
[ ] O backup nao expoe objetos publicamente.  
[ ] A criptografia esta ativa quando aplicavel.  

### Configuracoes

[ ] Configuracoes de aplicacao estao versionadas quando possivel.  
[ ] Configuracoes de infraestrutura possuem backup.  
[ ] Configuracoes do Coolify podem ser reconstruidas.  
[ ] Docker Compose esta versionado.  
[ ] Configuracoes de proxy estao documentadas.  
[ ] Variaveis de ambiente estao inventariadas.  
[ ] Valores secretos nao sao armazenados em texto aberto no repositorio.  
[ ] Existe procedimento para restaurar configuracoes.  
[ ] Configuracoes por ambiente estao separadas.  
[ ] Alteracoes criticas sao auditadas.  
[ ] Dependencias externas estao documentadas.  
[ ] A ordem de restauracao esta definida.  

### Segredos e credenciais

Segredos nao devem ser incluidos em backups comuns sem controle especifico.

[ ] Existe inventario de segredos.  
[ ] O armazenamento e seguro.  
[ ] O backup e criptografado.  
[ ] O acesso e restrito.  
[ ] A recuperacao exige autorizacao.  
[ ] Segredos podem ser rotacionados.  
[ ] Credenciais antigas podem ser revogadas.  
[ ] Dumps nao contem segredos indevidos.  
[ ] Chaves de criptografia nao ficam junto do backup.  
[ ] Existe plano caso a chave de backup seja perdida.  
[ ] A restauracao nao reativa credenciais revogadas sem validacao.  

### Redis

Classificar os dados do Redis como descartaveis, reconstruiveis, persistentes ou
criticos.

[ ] Esta definido se Redis precisa de backup.  
[ ] Cache nao e confundido com dado de origem.  
[ ] Sessoes foram consideradas.  
[ ] Jobs e filas foram considerados.  
[ ] Persistencia RDB ou AOF foi avaliada.  
[ ] O restore nao reprocessa jobs indevidamente.  
[ ] Jobs duplicados sao evitados.  
[ ] Chaves expiradas nao voltam incorretamente.  
[ ] Dados sensiveis sao protegidos.  
[ ] Existe estrategia para perda total do Redis.  

### BullMQ e filas

[ ] A fonte de verdade dos jobs esta definida.  
[ ] Jobs criticos podem ser reconstruidos.  
[ ] Jobs em andamento possuem estrategia.  
[ ] Jobs concluidos possuem retencao.  
[ ] Dead-letter e preservada quando necessario.  
[ ] O restore nao duplica efeitos.  
[ ] Idempotencia foi validada.  
[ ] A correlacao e preservada.  
[ ] O tenant e preservado.  
[ ] Existe procedimento para reprocessamento seguro.  
[ ] Filas nao sao restauradas sem avaliar o estado externo.  

### Integracoes externas

[ ] Configuracoes podem ser reconstruidas.  
[ ] Tokens armazenados estao protegidos.  
[ ] Webhook URLs estao documentadas.  
[ ] Secrets de webhook podem ser restaurados ou regenerados.  
[ ] IDs externos necessarios estao preservados.  
[ ] O restore nao dispara sincronizacoes duplicadas.  
[ ] O restore nao reenvia mensagens.  
[ ] O restore nao recria contatos indevidamente.  
[ ] O estado de sincronizacao foi considerado.  
[ ] O procedimento inclui revalidacao de credenciais.  

### Automacao

[ ] Regras de automacao estao no backup.  
[ ] Versoes de automacao sao preservadas quando necessario.  
[ ] Execucoes historicas possuem politica propria.  
[ ] Jobs pendentes sao tratados.  
[ ] O restore nao executa automacoes antigas automaticamente.  
[ ] Automacoes desativadas permanecem desativadas.  
[ ] Credenciais utilizadas pelas acoes sao revalidadas.  
[ ] O estado parcial de execucao e tratado.  
[ ] O restore possui modo seguro antes da reativacao.  

### Inteligencia artificial

[ ] Prompts versionados estao preservados.  
[ ] Configuracoes de modelo estao documentadas.  
[ ] Guardrails podem ser restaurados.  
[ ] Ferramentas autorizadas estao registradas.  
[ ] Embeddings possuem estrategia.  
[ ] Indices vetoriais possuem backup ou reconstrucao.  
[ ] Dados excluidos nao reaparecem apos restore.  
[ ] Contextos entre tenants permanecem isolados.  
[ ] Logs de IA seguem retencao.  
[ ] Custos nao aumentam por reprocessamento indevido.  
[ ] O restore nao dispara chamadas antigas ao modelo.  

### Embeddings e indices de busca

Classificar como fonte de verdade, dado derivado, reconstruivel ou parcialmente
reconstruivel.

[ ] A fonte original esta preservada.  
[ ] A versao do modelo de embedding esta registrada.  
[ ] A estrategia de reconstrucao esta documentada.  
[ ] O tenant e preservado.  
[ ] Exclusoes continuam respeitadas.  
[ ] Indices inconsistentes podem ser recriados.  
[ ] O custo de reconstrucao foi estimado.  
[ ] O tempo de reconstrucao atende ao RTO.  
[ ] O backup nao mistura dados entre tenants.  
[ ] Dados antigos nao voltam apos restore.  

### Codigo e documentacao

[ ] Codigo esta versionado.  
[ ] Branch principal esta protegida.  
[ ] Tags de release existem quando necessario.  
[ ] Infraestrutura como codigo esta versionada.  
[ ] Scripts de backup estao versionados.  
[ ] Scripts de restore estao versionados.  
[ ] Runbooks estao versionados.  
[ ] Documentacao de disaster recovery esta atualizada.  
[ ] Dependencias e versoes estao registradas.  
[ ] A versao compativel com cada backup pode ser identificada.  

## 8. Estrategia 3-2-1

Quando aplicavel, seguir:

- 3 copias dos dados;
- 2 tipos diferentes de armazenamento;
- 1 copia fora do ambiente principal.

Para ativos criticos, avaliar tambem copia imutavel, regiao diferente, conta
diferente, credenciais diferentes e protecao contra ransomware.

## 9. Criptografia

[ ] Backup e criptografado em transito.  
[ ] Backup e criptografado em repouso.  
[ ] Algoritmos adequados sao utilizados.  
[ ] Chaves possuem controle de acesso.  
[ ] Chaves sao rotacionaveis.  
[ ] Chaves nao ficam no mesmo local do backup.  
[ ] A perda da chave foi considerada.  
[ ] O restore exige acesso controlado a chave.  
[ ] Logs nao expoem chaves.  
[ ] Backups antigos continuam recuperaveis apos rotacao planejada.  

## 10. Retencao

Para cada backup, definir frequencia, retencao diaria, semanal, mensal, anual
quando aplicavel, expiracao, exclusao segura e excecoes legais.

[ ] A retencao atende ao negocio.  
[ ] A retencao atende a LGPD.  
[ ] Nao existe retencao infinita sem justificativa.  
[ ] Backups expirados sao removidos.  
[ ] A exclusao e automatizada.  
[ ] A imutabilidade nao impede cumprimento de obrigacoes.  
[ ] A politica esta documentada.  
[ ] O custo de armazenamento foi avaliado.  

## 11. Imutabilidade

Para backups criticos, avaliar object lock, WORM, snapshot protegido, conta
separada, credenciais sem permissao de exclusao e retencao minima forcada.

[ ] Um invasor do ambiente principal nao consegue apagar todos os backups.  
[ ] A conta de aplicacao nao possui acesso de exclusao.  
[ ] A protecao contra ransomware foi considerada.  
[ ] A expiracao continua controlada.  
[ ] O processo de emergencia esta documentado.  

## 12. Separacao de ambientes

[ ] Producao possui backup proprio.  
[ ] Homologacao nao substitui producao.  
[ ] Desenvolvimento nao acessa backup de producao sem controle.  
[ ] Dumps de producao sao protegidos.  
[ ] Dados restaurados em teste sao anonimizados quando necessario.  
[ ] Credenciais de producao nao sao reutilizadas.  
[ ] Ambientes possuem storage separado.  
[ ] Backups sao identificados por ambiente.  
[ ] Restauracoes nao apontam para o destino errado.  

## 13. Restauracao

### Regra principal

Backup sem teste de restauracao deve ser considerado nao validado.

### Teste de restauracao

[ ] O backup pode ser localizado.  
[ ] O backup pode ser baixado ou acessado.  
[ ] A chave de criptografia esta disponivel.  
[ ] O arquivo esta integro.  
[ ] A versao da aplicacao e compativel.  
[ ] O banco inicia.  
[ ] Migrations estao coerentes.  
[ ] O login funciona.  
[ ] O tenant esta isolado.  
[ ] Arquivos estao acessiveis.  
[ ] Relacionamentos estao integros.  
[ ] Integracoes ficam desativadas inicialmente.  
[ ] Automacoes ficam desativadas inicialmente.  
[ ] Filas nao reprocessam efeitos antigos.  
[ ] Dados sensiveis permanecem protegidos.  
[ ] O RTO foi medido.  
[ ] O RPO foi validado.  

### Ordem de restauracao

Definir uma ordem segura, por exemplo:

1. infraestrutura base;
2. rede;
3. banco;
4. storage;
5. segredos;
6. aplicacao;
7. autenticacao;
8. filas;
9. integracoes;
10. automacoes;
11. observabilidade;
12. liberacao gradual.

A ordem deve ser adaptada ao ambiente real.

### Modo seguro apos restore

Apos restauracao, considerar:

- integracoes externas desativadas;
- envio de mensagens bloqueado;
- automacoes desativadas;
- workers criticos pausados;
- webhooks temporariamente bloqueados;
- acesso administrativo restrito;
- validacao manual;
- liberacao gradual.

## 14. Recuperacao granular

Avaliar necessidade de restaurar um registro, card, tenant, tabela, arquivo,
bucket, configuracao, automacao, conversa ou conjunto de dados.

[ ] Existe estrategia para recuperacao sem restaurar todo o ambiente.  
[ ] A recuperacao granular nao expoe outro tenant.  
[ ] A integridade dos relacionamentos e preservada.  
[ ] A operacao e auditada.  
[ ] O dado recuperado nao sobrescreve versoes atuais sem confirmacao.  
[ ] O processo respeita LGPD e retencao.  

## 15. Backup antes de migration

Antes de migration de risco medio, alto ou critico:

[ ] Criar backup consistente.  
[ ] Registrar horario.  
[ ] Registrar versao da aplicacao.  
[ ] Registrar commit.  
[ ] Validar integridade.  
[ ] Confirmar local de armazenamento.  
[ ] Confirmar acesso.  
[ ] Definir rollback.  
[ ] Definir responsavel.  
[ ] Estimar tempo de restore.  
[ ] Pausar operacoes quando necessario.  
[ ] Verificar espaco disponivel.  
[ ] Testar em homologacao.  

## 16. Monitoramento

[ ] Falha de backup gera alerta.  
[ ] Backup atrasado gera alerta.  
[ ] Tamanho inesperado gera alerta.  
[ ] Backup vazio gera alerta.  
[ ] Falha de criptografia gera alerta.  
[ ] Falha de upload gera alerta.  
[ ] Retencao incorreta gera alerta.  
[ ] Teste de restore atrasado gera alerta.  
[ ] Espaco insuficiente gera alerta.  
[ ] Falha de replicacao gera alerta.  
[ ] Alertas possuem responsavel.  
[ ] Existe runbook.  

## 17. Auditoria

Registrar inicio do backup, conclusao, falha, tamanho, duracao, origem, destino,
versao, checksum, responsavel tecnico, teste de restore, resultado, exclusao,
restauracao, usuario que autorizou, ambiente e correlation ID.

## 18. Seguranca do backup

[ ] O acesso segue menor privilegio.  
[ ] A aplicacao nao possui permissao de apagar backups criticos.  
[ ] Credenciais sao separadas.  
[ ] Acesso administrativo e auditado.  
[ ] Downloads sao auditados.  
[ ] Backups nao possuem links publicos.  
[ ] Acesso temporario expira.  
[ ] Dados pessoais continuam protegidos.  
[ ] Backups nao sao enviados para servicos nao aprovados.  
[ ] Existe protecao contra alteracao.  
[ ] Existe protecao contra exclusao.  
[ ] Existe processo de revogacao de acesso.  

## 19. LGPD

Aplicar tambem `lgpd-check.md`.

[ ] Retencao de backup esta documentada.  
[ ] Exclusao do titular em backup possui politica.  
[ ] Backups nao sao usados para finalidade nova.  
[ ] Restauracao nao reintroduz dados ja excluidos sem tratamento.  
[ ] Dados restaurados sao reconciliados com solicitacoes de exclusao.  
[ ] Acesso a backup com dados pessoais e restrito.  
[ ] Testes de restore nao expoem dados reais.  
[ ] Transferencia internacional foi avaliada.  
[ ] O fornecedor de storage foi documentado.  
[ ] A retencao atende a necessidade e proporcionalidade.  

## 20. Disaster Recovery

Um plano de recuperacao deve conter:

- cenarios de desastre;
- responsaveis;
- contatos;
- ordem de restauracao;
- credenciais de emergencia;
- dependencias;
- RPO;
- RTO;
- procedimentos;
- comunicacao;
- validacao;
- liberacao;
- rollback;
- registro pos-incidente.

Cenarios minimos:

- perda do banco;
- perda do storage;
- corrupcao de dados;
- exclusao acidental;
- ransomware;
- falha do servidor;
- falha do provedor;
- credencial comprometida;
- migration com erro;
- perda parcial de tenant;
- indisponibilidade do Redis;
- perda de configuracao.

## 21. Testes minimos

Executar quando aplicavel:

- backup manual controlado;
- backup automatico;
- validacao de checksum;
- restore em ambiente isolado;
- login apos restore;
- leitura e escrita;
- acesso a arquivos;
- isolamento entre tenants;
- restauracao pontual;
- restauracao de versao anterior;
- restore com automacoes desativadas;
- restore com integracoes desativadas;
- validacao de RPO;
- medicao de RTO;
- validacao de alertas;
- exclusao por retencao;
- rotacao de chave;
- simulacao de falha.

## 22. Severidade dos achados

### Critico

Exemplos: ausencia de backup do banco, backup nao restauravel, perda de dados
critica sem recuperacao, backup exposto publicamente, todos os backups no mesmo
ponto de falha, backup apagavel pela aplicacao, restauracao mistura tenants ou
chaves de criptografia perdidas.

Bloqueia imediatamente.

### Alto

Exemplos: restore nunca testado, frequencia nao atende ao RPO, restore nao
atende ao RTO, arquivos fora do backup, integracao reprocessada apos restore,
automacoes executadas indevidamente apos restore, retencao incompativel com LGPD
ou backup sem monitoramento.

Normalmente bloqueia.

### Medio

Exemplos: documentacao incompleta, recuperacao granular ausente, alerta sem
runbook, retencao pouco clara, teste de restore atrasado ou dependencia manual
excessiva.

Pode bloquear conforme o risco.

### Baixo

Exemplos: nomenclatura inconsistente, evidencia secundaria ausente, pequena
melhoria de automacao ou documentacao operacional incompleta.

Deve ser corrigido ou registrado.

## 23. Condicoes automaticas de bloqueio

A aprovacao deve ser bloqueada quando houver:

- ativo critico sem backup;
- backup sem criptografia quando necessario;
- backup sem acesso controlado;
- backup nao testado em fluxo critico;
- restore incompativel;
- ausencia de backup antes de migration destrutiva;
- ausencia de rollback para mudanca critica;
- restore que pode reenviar mensagens;
- restore que pode duplicar jobs;
- restore que pode executar automacoes antigas;
- perda de isolamento multiempresa;
- backup em unico ponto de falha;
- ausencia de alerta para falha de backup critico;
- retencao incompativel com LGPD;
- risco critico nao mitigado.

## 24. Checklist final

[ ] Os ativos criticos foram identificados.  
[ ] A criticidade foi classificada.  
[ ] RPO foi definido.  
[ ] RTO foi definido.  
[ ] A frequencia atende ao RPO.  
[ ] O restore atende ao RTO.  
[ ] Banco esta coberto.  
[ ] Arquivos estao cobertos.  
[ ] Configuracoes estao cobertas.  
[ ] Segredos possuem estrategia segura.  
[ ] Redis e filas foram avaliados.  
[ ] Integracoes foram avaliadas.  
[ ] Automacoes foram avaliadas.  
[ ] IA e embeddings foram avaliados.  
[ ] Existe copia fora do ambiente principal.  
[ ] A retencao foi definida.  
[ ] A criptografia foi validada.  
[ ] A imutabilidade foi avaliada.  
[ ] O restore foi testado.  
[ ] O isolamento multiempresa foi validado.  
[ ] Alertas estao configurados.  
[ ] O runbook esta atualizado.  
[ ] A LGPD foi considerada.  
[ ] Nao existem achados criticos pendentes.  
[ ] Nao existem achados altos pendentes.  

## 25. Formato obrigatorio de saida

Ao finalizar esta skill, gerar:

```md
# Backup Check Report

## Identificacao
- Story:
- Tarefa:
- Branch:
- Commit:
- Ambiente:
- Responsavel:

## Escopo analisado
- banco:
- arquivos:
- configuracoes:
- segredos:
- filas:
- integracoes:
- automacoes:
- IA:
- infraestrutura:

## Ativos criticos
| Ativo | Criticidade | Fonte de verdade | RPO | RTO | Estrategia |
|------|-------------|------------------|-----|-----|------------|

## Estrategia de backup
- tipo:
- frequencia:
- retencao:
- destino:
- redundancia:
- imutabilidade:
- criptografia:
- responsavel:

## Banco de dados
- metodo:
- PITR:
- frequencia:
- validacao:
- observacoes:

## Arquivos e storage
- buckets:
- versionamento:
- replicacao:
- restore:
- observacoes:

## Configuracoes e segredos
- configuracoes:
- segredos:
- criptografia:
- rotacao:
- observacoes:

## Redis e filas
- persistencia:
- jobs:
- deduplicacao:
- restore:
- observacoes:

## Integracoes e automacoes
- risco de reprocessamento:
- modo seguro:
- revalidacao:
- observacoes:

## IA e indices
- prompts:
- embeddings:
- indices:
- reconstrucao:
- observacoes:

## Retencao
- diaria:
- semanal:
- mensal:
- anual:
- exclusao:
- LGPD:
- observacoes:

## Restauracao
- ambiente de teste:
- data:
- backup utilizado:
- duracao:
- RPO validado:
- RTO medido:
- resultado:

## Validacoes pos-restore
- banco:
- login:
- arquivos:
- tenant:
- permissoes:
- filas:
- integracoes:
- automacoes:
- observacoes:

## Monitoramento
- falha de backup:
- atraso:
- tamanho:
- restore test:
- espaco:
- responsavel:
- runbook:

## Seguranca
- acesso:
- criptografia:
- imutabilidade:
- auditoria:
- observacoes:

## Riscos
- risco:
- classificacao:
- impacto:
- mitigacao:
- responsavel:

## Achados criticos
- achado:

## Achados altos
- achado:

## Achados medios
- achado:

## Achados baixos
- achado:

## Resultado final
- [ ] Aprovado
- [ ] Aprovado com ressalvas
- [ ] Alteracoes solicitadas
- [ ] Bloqueado

## Justificativa
- decisao:
- acoes necessarias:
- prazo:
```

## 26. Criterios de aprovacao

A alteracao pode ser aprovada quando:

- todos os ativos criticos estiverem cobertos;
- RPO e RTO estiverem definidos;
- a frequencia atender ao RPO;
- o restore atender ao RTO;
- banco, arquivos e configuracoes puderem ser recuperados;
- a restauracao tiver sido testada;
- o isolamento multiempresa estiver preservado;
- integracoes e automacoes nao forem reprocessadas indevidamente;
- backups estiverem protegidos;
- retencao estiver definida;
- alertas estiverem configurados;
- LGPD estiver contemplada;
- nao existirem achados criticos ou altos pendentes.

## 27. Resultado esperado

A aplicacao desta skill deve garantir que o Giraffe CRM:

- possa recuperar dados apos falhas;
- possua backups completos e verificaveis;
- consiga restaurar banco, arquivos e configuracoes;
- preserve seguranca e isolamento multiempresa;
- evite reprocessamentos indevidos;
- cumpra RPO e RTO;
- monitore falhas de backup;
- proteja copias contra exclusao e ransomware;
- mantenha documentacao operacional atualizada;
- bloqueie mudancas criticas sem recuperacao comprovada.
