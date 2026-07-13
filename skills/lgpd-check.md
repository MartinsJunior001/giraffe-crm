# lgpd-check

## 1. Finalidade

A skill `lgpd-check` garante que toda funcionalidade do Giraffe CRM que trate
dados pessoais seja analisada e implementada em conformidade com a Lei Geral de
Protecao de Dados Pessoais.

Esta skill deve identificar e impedir:

- coleta excessiva de dados;
- ausencia de finalidade definida;
- uso de dados incompativel com a finalidade informada;
- retencao indefinida;
- exposicao de dados pessoais;
- compartilhamento nao documentado;
- processamento sem base legal adequada;
- ausencia de mecanismos para atendimento aos direitos do titular;
- registro excessivo de dados em logs;
- envio indevido de dados pessoais para servicos de IA;
- ausencia de anonimizacao ou pseudonimizacao quando necessaria;
- exclusao incompleta;
- transferencia internacional nao avaliada;
- acesso interno excessivo;
- ausencia de rastreabilidade sobre o uso dos dados.

## 2. Quando usar

Aplicar sempre que houver tratamento de dados pessoais.

Esta skill e obrigatoria em alteracoes relacionadas a:

- usuarios;
- contatos;
- leads;
- clientes;
- colaboradores;
- convidados;
- formularios;
- conversas;
- WhatsApp;
- Meta;
- e-mail;
- telefonia;
- arquivos;
- anexos;
- importacoes;
- exportacoes;
- automacoes;
- inteligencia artificial;
- gravacoes;
- transcricoes;
- dashboards;
- relatorios;
- logs;
- auditoria;
- integracoes externas;
- backups;
- exclusao de dados;
- anonimizacao;
- consentimento;
- preferencias de comunicacao;
- cookies;
- rastreamento;
- enriquecimento de dados.

Sequencia recomendada:

1. `technical-docs-check.md`;
2. `pre-implementation-check.md`;
3. `safe-implementation.md`;
4. `code-review.md`;
5. `security-check.md`;
6. `lgpd-check.md`;
7. demais checks aplicaveis.

## 3. Regra principal

Nenhum dado pessoal deve ser coletado, armazenado, processado, compartilhado ou
enviado a terceiros sem:

- finalidade clara;
- necessidade comprovada;
- base legal definida;
- acesso controlado;
- periodo de retencao;
- destino conhecido;
- documentacao;
- mecanismo de exclusao ou anonimizacao quando aplicavel.

O fato de o dado estar disponivel publicamente nao elimina a necessidade de
analise de finalidade, necessidade e uso adequado.

## 4. Conceitos utilizados

### Dado pessoal

Informacao relacionada a pessoa natural identificada ou identificavel.

Exemplos:

- nome;
- telefone;
- e-mail;
- CPF;
- endereco;
- IP;
- localizacao;
- identificadores online;
- historico de atendimento;
- mensagens;
- gravacoes;
- preferencias;
- informacoes profissionais vinculadas a uma pessoa.

### Dado pessoal sensivel

Dado sobre origem racial ou etnica, conviccao religiosa, opiniao politica,
filiacao sindical, saude, vida sexual, dado genetico ou dado biometrico
vinculado a uma pessoa.

O tratamento de dados sensiveis exige controle reforcado e base legal
especifica.

### Titular

Pessoa natural a quem os dados se referem.

### Controlador

Parte que decide sobre o tratamento dos dados.

### Operador

Parte que trata dados em nome do controlador.

### Encarregado

Canal de comunicacao entre controlador, titulares e autoridade competente.

### Tratamento

Qualquer operacao realizada com dados pessoais, incluindo coleta, acesso,
armazenamento, consulta, alteracao, compartilhamento, transmissao,
classificacao, processamento, arquivamento, exclusao e anonimizacao.

## 5. Principios obrigatorios

Toda implementacao deve avaliar:

- **Finalidade:** o dado deve possuir objetivo legitimo, especifico e informado.
- **Adequacao:** o tratamento deve ser compativel com a finalidade declarada.
- **Necessidade:** somente os dados minimos necessarios devem ser tratados.
- **Livre acesso:** o titular deve conseguir obter informacoes sobre o
  tratamento.
- **Qualidade dos dados:** os dados devem ser corretos, claros, relevantes e
  atualizados quando necessario.
- **Transparencia:** o tratamento nao deve ser oculto ou ambiguo.
- **Seguranca:** os dados devem ser protegidos contra acesso e uso indevidos.
- **Prevencao:** riscos devem ser tratados antes da ocorrencia de incidentes.
- **Nao discriminacao:** os dados nao podem ser usados para fins
  discriminatorios ilicitos ou abusivos.
- **Responsabilizacao:** as decisoes e controles devem gerar evidencias
  verificaveis.

## 6. Processo obrigatorio

### Etapa 1 - Mapear os dados tratados

Para cada funcionalidade, identificar:

- dado coletado;
- origem;
- titular;
- finalidade;
- base legal;
- local de armazenamento;
- prazo de retencao;
- pessoas ou sistemas com acesso;
- compartilhamentos;
- transferencias internacionais;
- destino em caso de exclusao;
- presenca em logs;
- presenca em backups;
- uso em IA;
- nivel de sensibilidade.

### Etapa 2 - Classificar os dados

Classificar cada dado como:

- dado nao pessoal;
- dado pessoal comum;
- dado pessoal sensivel;
- dado de crianca ou adolescente;
- dado financeiro;
- credencial;
- dado de autenticacao;
- dado de comunicacao;
- dado derivado;
- dado anonimizado;
- dado pseudonimizado.

A classificacao deve orientar os controles aplicaveis.

### Etapa 3 - Definir a base legal

Toda finalidade deve estar associada a uma base legal adequada.

Possiveis bases incluem:

- consentimento;
- cumprimento de obrigacao legal ou regulatoria;
- execucao de politicas publicas;
- estudos por orgao de pesquisa;
- execucao de contrato ou procedimentos preliminares;
- exercicio regular de direitos;
- protecao da vida;
- tutela da saude;
- legitimo interesse;
- protecao do credito.

A base legal nao deve ser escolhida apenas por conveniencia tecnica.

### Etapa 4 - Avaliar riscos

Analisar:

- exposicao indevida;
- uso incompativel;
- acesso excessivo;
- vazamento;
- reidentificacao;
- retencao excessiva;
- compartilhamento nao autorizado;
- enriquecimento indevido;
- transferencia internacional;
- inferencia sensivel;
- automacao com impacto relevante;
- tratamento por IA;
- dificuldade de exclusao;
- permanencia em backup;
- falhas de auditoria.

Classificar o risco como baixo, medio, alto ou critico.

## 7. Checklist LGPD

### Finalidade

[ ] A finalidade esta documentada.  
[ ] A finalidade e especifica.  
[ ] A finalidade e legitima.  
[ ] O uso real corresponde ao uso informado.  
[ ] O dado nao sera reutilizado para outra finalidade sem nova avaliacao.  
[ ] A finalidade e compreensivel ao titular.  
[ ] Dados coletados por integracao nao sao reaproveitados automaticamente.  
[ ] Dados usados por IA possuem finalidade definida.  

### Necessidade e minimizacao

[ ] Cada campo coletado e necessario.  
[ ] Campos opcionais sao realmente opcionais.  
[ ] Dados desnecessarios foram removidos.  
[ ] Payloads internos nao carregam dados excessivos.  
[ ] APIs retornam somente campos necessarios.  
[ ] Logs nao registram payloads completos.  
[ ] Exportacoes nao incluem campos irrelevantes.  
[ ] Dados enviados a IA foram minimizados.  
[ ] Dados utilizados em testes foram anonimizados quando necessario.  
[ ] Dados pessoais nao sao replicados sem justificativa.  

### Base legal

[ ] Existe base legal definida para cada finalidade.  
[ ] A base legal esta documentada.  
[ ] A base legal e compativel com a operacao.  
[ ] Consentimento nao e usado quando nao e adequado.  
[ ] Legitimo interesse possui avaliacao especifica.  
[ ] Dados sensiveis possuem base legal adequada.  
[ ] Dados de criancas e adolescentes possuem tratamento especial.  
[ ] Compartilhamentos seguem a mesma finalidade e base legal.  
[ ] O uso por IA esta coberto pela base legal aplicavel.  

### Consentimento

Quando o consentimento for a base legal:

[ ] E livre.  
[ ] E informado.  
[ ] E inequivoco.  
[ ] E especifico.  
[ ] Nao esta agrupado com finalidades independentes.  
[ ] Pode ser revogado.  
[ ] A revogacao e simples.  
[ ] A data e versao do consentimento sao registradas.  
[ ] A origem do consentimento e registrada.  
[ ] Existe evidencia auditavel.  
[ ] A ausencia de consentimento nao gera coercao indevida.  
[ ] Novo uso exige nova avaliacao ou consentimento.  

### Preferencias de comunicacao

Para e-mail, WhatsApp, SMS e canais semelhantes:

[ ] A origem do contato e conhecida.  
[ ] A finalidade do contato esta definida.  
[ ] Preferencias do titular sao respeitadas.  
[ ] Existe mecanismo de opt-out quando aplicavel.  
[ ] O opt-out e persistido.  
[ ] Automacoes respeitam bloqueios.  
[ ] Revogacao interrompe comunicacoes futuras.  
[ ] Listas importadas possuem origem documentada.  
[ ] O sistema nao recria inscricoes removidas.  
[ ] A prova da preferencia pode ser auditada.  

### Transparencia

[ ] O titular e informado sobre o tratamento.  
[ ] A politica de privacidade cobre a funcionalidade.  
[ ] A linguagem e clara.  
[ ] Os terceiros envolvidos sao informados quando necessario.  
[ ] O uso de IA e informado quando relevante.  
[ ] O uso de automacao relevante e informado.  
[ ] A retencao e informada quando aplicavel.  
[ ] O canal para exercicio de direitos esta disponivel.  
[ ] Mudancas relevantes geram atualizacao da documentacao.  

### Qualidade dos dados

[ ] O titular pode corrigir dados quando aplicavel.  
[ ] Dados desatualizados podem ser identificados.  
[ ] Duplicidades sao tratadas.  
[ ] Fontes externas possuem confiabilidade avaliada.  
[ ] Dados inferidos sao diferenciados de dados fornecidos.  
[ ] Alteracoes relevantes possuem historico.  
[ ] Dados incorretos nao continuam sendo propagados.  
[ ] Sincronizacoes externas tratam conflitos.  

### Controle de acesso

[ ] O acesso segue o menor privilegio.  
[ ] O acesso e limitado por funcao.  
[ ] O acesso e limitado por empresa.  
[ ] O acesso e limitado por processo ou recurso.  
[ ] Dados sensiveis possuem controle adicional.  
[ ] Acoes administrativas sao auditadas.  
[ ] Acesso de suporte e controlado.  
[ ] Acesso temporario expira.  
[ ] Exportacoes exigem permissao especifica.  
[ ] Usuarios desligados perdem acesso.  
[ ] Contas compartilhadas sao evitadas.  

### Isolamento multiempresa

[ ] Dados pessoais nunca cruzam tenants.  
[ ] Consultas filtram pela empresa.  
[ ] Arquivos sao isolados.  
[ ] Caches sao isolados.  
[ ] Filas preservam o tenant.  
[ ] Logs nao misturam contexto entre empresas.  
[ ] Exportacoes respeitam o tenant.  
[ ] IA nao reutiliza contexto entre empresas.  
[ ] Vetores, embeddings e bases de busca sao isolados.  
[ ] Backups preservam a separacao logica.  
[ ] Acesso de superadmin e auditado.  

Qualquer exposicao entre empresas deve ser classificada como critica.

### Retencao

Para cada categoria de dado, definir prazo, justificativa, evento inicial,
evento de encerramento, destino ao final do prazo, excecoes legais e tratamento
em backup.

[ ] Nao existe retencao indefinida sem justificativa.  
[ ] O prazo esta documentado.  
[ ] O prazo e tecnicamente aplicavel.  
[ ] Jobs de limpeza existem quando necessarios.  
[ ] Dados temporarios expiram.  
[ ] Arquivos temporarios sao removidos.  
[ ] Tokens expiram.  
[ ] Logs possuem retencao definida.  
[ ] Dados de IA possuem retencao definida.  
[ ] Conversas antigas possuem politica.  
[ ] Dados de contas encerradas possuem destino definido.  

### Exclusao

[ ] Existe mecanismo de exclusao quando aplicavel.  
[ ] A exclusao cobre tabelas relacionadas.  
[ ] A exclusao cobre arquivos.  
[ ] A exclusao cobre indices de busca.  
[ ] A exclusao cobre embeddings.  
[ ] A exclusao cobre caches.  
[ ] A exclusao cobre filas pendentes quando possivel.  
[ ] A exclusao nao recria dados por sincronizacao.  
[ ] A exclusao preserva somente o necessario por obrigacao legal.  
[ ] A exclusao e auditada.  
[ ] O titular recebe retorno adequado.  
[ ] O tratamento em backup esta documentado.  

### Anonimizacao e pseudonimizacao

[ ] Dados sao anonimizados quando a identificacao nao e necessaria.  
[ ] Identificadores diretos sao removidos.  
[ ] Combinacoes que permitam reidentificacao foram avaliadas.  
[ ] Chaves de pseudonimizacao sao protegidas.  
[ ] Dados anonimizados nao carregam metadados identificaveis.  
[ ] Ambientes de teste usam dados sinteticos ou anonimizados.  
[ ] Relatorios agregados evitam grupos pequenos identificaveis.  
[ ] Logs usam identificadores tecnicos quando possivel.  
[ ] Dados enviados a IA sao pseudonimizados quando viavel.  

### Logs

[ ] Logs nao contem dados pessoais completos sem necessidade.  
[ ] Telefones e e-mails sao mascarados quando possivel.  
[ ] Mensagens completas nao sao registradas sem justificativa.  
[ ] Prompts e respostas de IA nao sao gravados integralmente por padrao.  
[ ] Tokens e credenciais nunca sao registrados.  
[ ] Payloads de webhook sao filtrados.  
[ ] Logs possuem retencao.  
[ ] Acesso aos logs e restrito.  
[ ] Exportacao de logs e controlada.  
[ ] Logs de auditoria possuem finalidade clara.  
[ ] Dados sensiveis possuem protecao reforcada.  

### Inteligencia artificial

Toda funcionalidade de IA deve seguir tambem `ai-guardrails-check.md`.

[ ] Existe finalidade especifica para o uso da IA.  
[ ] Apenas os dados necessarios sao enviados.  
[ ] Dados sensiveis sao excluidos sempre que possivel.  
[ ] Dados de um tenant nao entram no contexto de outro.  
[ ] Prompts internos nao incluem dados excessivos.  
[ ] Logs de prompts possuem minimizacao.  
[ ] A saida da IA nao cria novos dados sensiveis indevidamente.  
[ ] Inferencias sao tratadas como inferencias.  
[ ] O titular nao e submetido a decisao exclusivamente automatizada sem avaliacao adequada.  
[ ] Existe revisao humana quando necessaria.  
[ ] O fornecedor de IA esta documentado.  
[ ] A regiao de processamento foi avaliada.  
[ ] A retencao do fornecedor foi verificada.  
[ ] O uso para treinamento pelo fornecedor foi avaliado.  
[ ] Contratos e termos do fornecedor foram considerados.  
[ ] Embeddings e vetores possuem politica de exclusao.  
[ ] Conteudo excluido e removido dos indices relacionados.  
[ ] Custos e volume nao justificam coleta excessiva.  

### Decisoes automatizadas

[ ] Existe impacto relevante sobre o titular.  
[ ] A logica utilizada esta documentada.  
[ ] O resultado pode ser contestado quando aplicavel.  
[ ] Existe revisao humana.  
[ ] Dados incorretos podem ser corrigidos.  
[ ] O sistema nao produz discriminacao ilicita.  
[ ] O titular recebe informacoes adequadas.  
[ ] A decisao nao depende de dado sensivel sem justificativa.  
[ ] A automacao possui trilha de auditoria.  
[ ] O fallback humano esta definido.  

### Integracoes externas

Para cada integracao, registrar fornecedor, finalidade, dados enviados, dados
recebidos, base legal, local de processamento, retencao, contrato,
suboperadores, mecanismo de exclusao e medidas de seguranca.

[ ] Apenas os dados necessarios sao enviados.  
[ ] O fornecedor e conhecido.  
[ ] O fornecedor possui medidas adequadas.  
[ ] O acesso e limitado.  
[ ] O contrato define responsabilidades.  
[ ] Suboperadores foram considerados.  
[ ] A exclusao pode ser propagada.  
[ ] Logs externos foram considerados.  
[ ] Dados nao sao reutilizados para finalidade propria sem avaliacao.  
[ ] Tokens de acesso possuem escopo minimo.  

### Transferencia internacional

[ ] O pais ou regiao de destino e conhecido.  
[ ] A transferencia esta documentada.  
[ ] O fornecedor informa onde processa os dados.  
[ ] O contrato trata protecao de dados.  
[ ] Subprocessadores foram avaliados.  
[ ] A transferencia e necessaria.  
[ ] O titular e informado quando aplicavel.  
[ ] Existem medidas tecnicas complementares.  
[ ] Dados sensiveis possuem protecao reforcada.  
[ ] A exclusao pode ser atendida em todos os destinos.  

### Importacoes

[ ] A origem dos dados e conhecida.  
[ ] A empresa confirma legitimidade do uso.  
[ ] Dados excessivos sao descartados.  
[ ] Campos sensiveis sao bloqueados ou tratados.  
[ ] O tenant e aplicado.  
[ ] Duplicidades sao tratadas.  
[ ] Preferencias de comunicacao sao preservadas.  
[ ] O historico da importacao e registrado.  
[ ] O arquivo temporario e excluido.  
[ ] Erros nao expoem dados de outros registros.  
[ ] O operador responsavel e identificado.  

### Exportacoes

[ ] Existe permissao especifica.  
[ ] A finalidade da exportacao e valida.  
[ ] O tenant e respeitado.  
[ ] Os campos exportados sao minimos.  
[ ] Dados sensiveis sao removidos quando possivel.  
[ ] O arquivo possui acesso controlado.  
[ ] O link expira.  
[ ] O download e auditado.  
[ ] A retencao do arquivo e curta.  
[ ] Arquivos temporarios sao removidos.  
[ ] Exportacoes em massa possuem controle adicional.  

### Backups

Aplicar tambem `backup-check.md`.

[ ] Backups possuem acesso restrito.  
[ ] Backups sao criptografados quando necessario.  
[ ] A retencao e definida.  
[ ] Backups expirados sao removidos.  
[ ] Ambientes possuem separacao.  
[ ] Restauracoes de backup nao criam exposicao.  
[ ] O processo de exclusao em backup esta documentado.  
[ ] Dados anonimizados nao voltam a ser identificaveis apos restauracao.  
[ ] Testes de restauracao usam ambiente protegido.  
[ ] Backups nao sao usados como fonte operacional indevida.  

### Ambientes de desenvolvimento e teste

[ ] Dados reais sao evitados.  
[ ] Dados pessoais sao anonimizados.  
[ ] Dumps de producao sao controlados.  
[ ] O acesso e restrito.  
[ ] Dados temporarios sao removidos.  
[ ] Credenciais de producao nao sao reutilizadas.  
[ ] Integracoes externas usam ambientes de sandbox.  
[ ] Logs de desenvolvimento nao contem dados reais.  
[ ] Screenshots e gravacoes nao expoem titulares.  
[ ] Ferramentas externas nao recebem dados reais sem avaliacao.  

### Direitos do titular

O sistema deve permitir, conforme aplicavel: confirmacao da existencia do
tratamento, acesso, correcao, anonimizacao, bloqueio, eliminacao, portabilidade,
informacao sobre compartilhamento, informacao sobre consentimento, revogacao do
consentimento, oposicao e revisao de decisao automatizada.

[ ] Existe canal para solicitacao.  
[ ] A identidade do solicitante e verificada.  
[ ] A solicitacao e registrada.  
[ ] O prazo e acompanhado.  
[ ] A resposta e auditavel.  
[ ] O atendimento cobre integracoes.  
[ ] O atendimento cobre backups conforme politica.  
[ ] O atendimento cobre IA e embeddings.  
[ ] O acesso nao expoe dados de terceiros.  
[ ] Solicitacoes abusivas possuem tratamento adequado.  
[ ] A equipe responsavel esta definida.  

### Dados de criancas e adolescentes

[ ] O tratamento e necessario.  
[ ] O melhor interesse foi considerado.  
[ ] A base legal e adequada.  
[ ] O consentimento responsavel foi avaliado quando necessario.  
[ ] A informacao e clara e acessivel.  
[ ] Nao existe perfilamento indevido.  
[ ] O uso de IA possui controles adicionais.  
[ ] Compartilhamentos sao reduzidos.  
[ ] A retencao e minima.  
[ ] O acesso interno e restrito.  

### Dados sensiveis

[ ] O tratamento e estritamente necessario.  
[ ] Existe base legal especifica.  
[ ] O acesso e restrito.  
[ ] O armazenamento possui protecao adicional.  
[ ] O dado nao aparece em logs.  
[ ] O dado nao e enviado a IA por padrao.  
[ ] Exportacoes sao limitadas.  
[ ] O compartilhamento e controlado.  
[ ] A retencao e reduzida.  
[ ] Existe rastreabilidade de acesso.  
[ ] O risco de discriminacao foi avaliado.  

### Incidentes de seguranca

[ ] Existe processo de resposta a incidentes.  
[ ] O incidente pode ser detectado.  
[ ] O escopo pode ser identificado.  
[ ] Os titulares afetados podem ser identificados.  
[ ] Logs permitem investigacao.  
[ ] O responsavel interno esta definido.  
[ ] Existe processo de comunicacao.  
[ ] Evidencias sao preservadas.  
[ ] O incidente nao e ocultado por falha silenciosa.  
[ ] Medidas corretivas podem ser rastreadas.  

## 8. Registro de operacoes de tratamento

Toda funcionalidade relevante deve contribuir para um inventario contendo:

- categoria de titular;
- categoria de dado;
- finalidade;
- base legal;
- origem;
- sistema;
- operadores;
- compartilhamentos;
- transferencia internacional;
- retencao;
- medidas de seguranca;
- mecanismo de exclusao;
- responsavel interno.

## 9. Relatorio de impacto

Um relatorio de impacto deve ser considerado quando houver:

- tratamento de alto risco;
- uso de dados sensiveis;
- grande volume de dados;
- monitoramento sistematico;
- perfilamento;
- decisao automatizada relevante;
- cruzamento de bases;
- uso intensivo de IA;
- dados de criancas;
- tecnologia nova;
- risco elevado aos direitos dos titulares.

O relatorio deve registrar operacao, necessidade, proporcionalidade, riscos,
controles, responsaveis, risco residual e decisao de aprovacao.

## 10. Severidade dos achados

### Critico

Exemplos: exposicao de dados entre empresas, dados sensiveis enviados sem
controle, tratamento sem finalidade ou base legal, coleta massiva indevida,
impossibilidade de exclusao em fluxo critico, acesso publico a dados pessoais
ou uso de IA com dados de clientes cruzados.

Bloqueia imediatamente.

### Alto

Exemplos: retencao indefinida, ausencia de mecanismo de revogacao, exportacao
excessiva, fornecedor sem avaliacao, transferencia internacional nao
documentada, logs com mensagens completas ou ausencia de controle sobre dados
enviados a IA.

Normalmente bloqueia.

### Medio

Exemplos: documentacao incompleta, prazo de retencao generico, minimizacao
insuficiente, acesso interno acima do necessario, processo de direitos do
titular incompleto ou anonimizacao fraca.

Pode bloquear conforme o risco.

### Baixo

Exemplos: texto de transparencia pouco claro, nomenclatura inconsistente,
ausencia de evidencia secundaria ou pequeno ajuste documental.

Deve ser corrigido ou registrado.

## 11. Condicoes automaticas de bloqueio

A aprovacao deve ser bloqueada quando houver:

- ausencia de finalidade;
- ausencia de base legal;
- coleta desnecessaria relevante;
- dados entre tenants;
- dado sensivel sem protecao;
- envio excessivo de dados a IA;
- retencao indefinida de alto risco;
- logs contendo credenciais ou dados sensiveis;
- impossibilidade de atender exclusao;
- fornecedor externo nao identificado;
- transferencia internacional nao avaliada;
- exportacao de dados sem permissao;
- uso de dados de producao em teste sem protecao;
- decisao automatizada relevante sem controle;
- ausencia de mecanismo de revogacao quando consentimento for utilizado;
- risco critico nao mitigado.

## 12. Checklist final

[ ] Os dados tratados foram mapeados.  
[ ] As finalidades foram definidas.  
[ ] As bases legais foram registradas.  
[ ] A coleta foi minimizada.  
[ ] Os acessos seguem menor privilegio.  
[ ] O isolamento multiempresa foi validado.  
[ ] A retencao foi definida.  
[ ] A exclusao foi planejada.  
[ ] Logs foram minimizados.  
[ ] Backups foram considerados.  
[ ] Integracoes foram mapeadas.  
[ ] Transferencias internacionais foram avaliadas.  
[ ] O uso de IA foi analisado.  
[ ] Direitos dos titulares podem ser atendidos.  
[ ] Dados sensiveis possuem protecao adicional.  
[ ] Ambientes de teste nao usam dados inadequados.  
[ ] Incidentes podem ser detectados e investigados.  
[ ] Nao existem achados criticos pendentes.  
[ ] Nao existem achados altos pendentes.  

## 13. Formato obrigatorio de saida

Ao finalizar esta skill, gerar:

```md
# LGPD Check Report

## Identificacao
- Story:
- Tarefa:
- Branch:
- Commit:
- Responsavel:

## Funcionalidade analisada
- descricao:
- titulares:
- dados:
- sistemas:
- integracoes:

## Inventario de dados
| Dado | Categoria | Origem | Finalidade | Base legal | Retencao | Destino |
|------|-----------|--------|------------|------------|----------|---------|

## Finalidade
- status:
- justificativa:
- observacoes:

## Base legal
- finalidade:
- base:
- justificativa:
- evidencia:

## Minimizacao
- dados necessarios:
- dados removidos:
- dados excessivos:
- observacoes:

## Consentimento
- aplicavel:
- coleta:
- evidencia:
- revogacao:
- observacoes:

## Transparencia
- politica:
- aviso:
- uso de IA:
- compartilhamentos:
- observacoes:

## Controle de acesso
- perfis:
- menor privilegio:
- isolamento multiempresa:
- auditoria:
- observacoes:

## Retencao
- categoria:
- prazo:
- justificativa:
- mecanismo tecnico:
- observacoes:

## Exclusao e anonimizacao
- mecanismo:
- arquivos:
- integracoes:
- backups:
- embeddings:
- observacoes:

## Logs
- dados registrados:
- mascaramento:
- retencao:
- acesso:
- observacoes:

## IA
- dados enviados:
- finalidade:
- fornecedor:
- retencao:
- transferencia internacional:
- revisao humana:
- observacoes:

## Integracoes e operadores
- fornecedor:
- dados compartilhados:
- finalidade:
- contrato:
- retencao:
- exclusao:
- localizacao:
- observacoes:

## Direitos do titular
- acesso:
- correcao:
- exclusao:
- portabilidade:
- oposicao:
- revisao automatizada:
- observacoes:

## Riscos
- risco:
- classificacao:
- impacto:
- mitigacao:
- risco residual:

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
- responsaveis:
```

## 14. Criterios de aprovacao

A alteracao pode ser aprovada quando:

- os dados estiverem mapeados;
- a finalidade estiver definida;
- a base legal estiver registrada;
- a coleta estiver limitada ao necessario;
- o acesso estiver controlado;
- o isolamento multiempresa estiver comprovado;
- a retencao estiver definida;
- exclusao e anonimizacao forem viaveis;
- logs nao expuserem dados desnecessarios;
- integracoes estiverem documentadas;
- o uso de IA possuir controles;
- os direitos dos titulares puderem ser atendidos;
- nao existirem achados criticos ou altos pendentes;
- os riscos residuais estiverem documentados e aceitos.

## 15. Resultado esperado

A aplicacao desta skill deve garantir que o Giraffe CRM:

- trate somente os dados necessarios;
- use dados para finalidades legitimas e documentadas;
- preserve o isolamento entre empresas;
- controle acessos;
- limite retencao;
- permita exclusao e anonimizacao;
- minimize dados em logs e IA;
- documente compartilhamentos;
- permita atender direitos dos titulares;
- gere evidencias de conformidade;
- bloqueie implementacoes com risco inaceitavel.
