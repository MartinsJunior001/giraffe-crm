# security-check

## 1. Finalidade

A skill `security-check` garante que toda implementacao do Giraffe CRM seja
analisada sob a perspectiva de seguranca antes de ser aprovada para merge,
deploy ou producao.

Esta skill deve identificar e bloquear:

- acesso nao autorizado;
- falhas de autenticacao;
- falhas de autorizacao;
- quebra de isolamento entre empresas;
- exposicao de dados;
- vazamento de credenciais;
- injecao de codigo ou comandos;
- manipulacao indevida de arquivos;
- abuso de APIs;
- falhas em integracoes externas;
- configuracoes inseguras;
- uso incorreto de criptografia;
- tratamento inadequado de sessoes;
- vulnerabilidades em dependencias;
- acoes criticas executadas sem validacao;
- falhas de seguranca em recursos de IA.

## 2. Quando usar

Aplicar apos a implementacao e a revisao de codigo.

Esta skill e obrigatoria quando houver alteracao em:

- autenticacao;
- autorizacao;
- permissoes;
- usuarios;
- empresas;
- organizacoes;
- tenants;
- APIs;
- formularios publicos;
- upload e download de arquivos;
- banco de dados;
- integracoes externas;
- webhooks;
- filas;
- workers;
- WebSockets;
- automacoes;
- recursos de IA;
- variaveis de ambiente;
- infraestrutura;
- deploy;
- armazenamento;
- logs;
- auditoria;
- dados pessoais;
- dados sensiveis.

Sequencia recomendada:

1. `technical-docs-check.md`;
2. `pre-implementation-check.md`;
3. `safe-implementation.md`;
4. `code-review.md`;
5. `security-check.md`;
6. `lgpd-check.md`;
7. checks adicionais aplicaveis.

## 3. Regra principal

Nenhuma funcionalidade deve ser considerada segura apenas porque:

- exige login;
- esta escondida no frontend;
- utiliza um identificador dificil de adivinhar;
- foi testada apenas com um usuario administrador;
- utiliza HTTPS;
- usa uma biblioteca conhecida;
- funciona apenas em ambiente interno;
- ainda esta em MVP;
- esta protegida por uma feature flag.

A seguranca deve ser validada em todas as camadas relevantes.

## 4. Principios obrigatorios

Toda implementacao deve seguir:

- defesa em profundidade;
- menor privilegio;
- negacao por padrao;
- isolamento multiempresa;
- validacao de toda entrada;
- minimizacao de exposicao;
- segredo fora do codigo;
- seguranca por design;
- falha segura;
- rastreabilidade;
- separacao de responsabilidades;
- reducao da superficie de ataque.

## 5. Processo obrigatorio

### Etapa 1 - Identificar a superficie de ataque

Antes da analise, mapear:

- quem pode acessar a funcionalidade;
- quais endpoints estao envolvidos;
- quais dados sao recebidos;
- quais dados sao retornados;
- quais recursos sao alterados;
- quais integracoes sao chamadas;
- quais permissoes sao exigidas;
- quais arquivos sao processados;
- quais eventos sao publicados;
- quais filas ou workers sao acionados;
- quais dados pessoais sao tratados;
- quais acoes possuem efeito critico.

### Etapa 2 - Classificar o risco

Classificar a funcionalidade como:

- **Baixo risco:** alteracao visual sem dados sensiveis, componente sem acao
  persistente, conteudo publico estatico ou ajuste interno sem entrada externa.
- **Medio risco:** leitura de dados autenticados, filtros e consultas, edicao
  de dados nao criticos, notificacoes internas ou automacoes sem efeito externo
  relevante.
- **Alto risco:** criacao, alteracao ou exclusao de dados, upload de arquivos,
  integracoes externas, webhooks, permissoes, convites, exportacoes, execucao de
  automacoes, acoes da IA ou alteracao de configuracoes.
- **Critico:** autenticacao, recuperacao de senha, alteracao de e-mail,
  alteracao de permissoes administrativas, acesso entre empresas, exportacao em
  massa, exclusao em massa, execucao de codigo, acesso a segredos, pagamentos,
  impersonacao, acoes irreversiveis ou migracoes destrutivas.

O nivel de profundidade da analise deve acompanhar o risco.

### Etapa 3 - Definir ameacas relevantes

Avaliar, quando aplicavel:

- spoofing;
- adulteracao de dados;
- repudio;
- exposicao de informacao;
- negacao de servico;
- elevacao de privilegio;
- injecao;
- abuso de logica de negocio;
- enumeracao de recursos;
- replay;
- sequestro de sessao;
- CSRF;
- XSS;
- SSRF;
- upload malicioso;
- path traversal;
- mass assignment;
- falhas de concorrencia;
- quebra de isolamento de tenant;
- prompt injection;
- tool abuse por IA.

## 6. Checklist de seguranca

### Autenticacao

[ ] Endpoints protegidos exigem autenticacao.  
[ ] A autenticacao ocorre no backend.  
[ ] Tokens sao validados corretamente.  
[ ] Tokens expirados sao rejeitados.  
[ ] Tokens revogados sao rejeitados quando aplicavel.  
[ ] O algoritmo esperado e validado.  
[ ] O emissor do token e validado.  
[ ] A audiencia do token e validada quando aplicavel.  
[ ] O identificador do usuario nao vem apenas do payload enviado pelo cliente.  
[ ] Sessoes possuem expiracao.  
[ ] Sessoes podem ser revogadas.  
[ ] Alteracoes criticas podem exigir reautenticacao.  
[ ] Nao existe autenticacao alternativa nao documentada.  
[ ] Rotas internas nao estao expostas publicamente por engano.  

### Senhas

Quando o sistema tratar senhas:

[ ] Senhas nunca sao armazenadas em texto puro.  
[ ] O algoritmo de hash e adequado.  
[ ] O salt e aplicado corretamente.  
[ ] A comparacao de senha usa metodo seguro.  
[ ] Senhas nao aparecem em logs.  
[ ] Senhas nao aparecem em respostas de API.  
[ ] Senhas nao sao enviadas por e-mail.  
[ ] A politica de senha esta documentada.  
[ ] A troca de senha invalida sessoes quando necessario.  
[ ] O reset de senha possui token unico e expiravel.  
[ ] O token de reset nao pode ser reutilizado.  
[ ] A resposta nao permite enumerar usuarios.  
[ ] Existe limitacao contra tentativas repetidas.  

### Autorizacao

[ ] Toda acao protegida valida permissao no backend.  
[ ] A autorizacao ocorre no recurso especifico.  
[ ] A existencia do recurso nao implica autorizacao.  
[ ] O frontend nao e a unica camada de controle.  
[ ] Permissoes administrativas sao explicitamente verificadas.  
[ ] Acoes em lote validam cada recurso.  
[ ] Rotas de leitura e escrita possuem controles separados.  
[ ] Permissoes herdadas sao calculadas corretamente.  
[ ] A negacao e o comportamento padrao.  
[ ] Nao existem bypasses temporarios.  
[ ] Nao existem permissoes baseadas apenas em campos enviados pelo cliente.  

### Isolamento multiempresa

O Giraffe CRM e multiempresa. Toda operacao deve estar vinculada a um tenant.

[ ] O tenant e obtido de contexto confiavel.  
[ ] O tenant nao e aceito sem validacao a partir do cliente.  
[ ] Todas as consultas incluem o tenant.  
[ ] Todas as atualizacoes incluem o tenant.  
[ ] Todas as exclusoes incluem o tenant.  
[ ] Relacoes entre entidades pertencem ao mesmo tenant.  
[ ] Usuarios nao podem alterar o tenant por payload.  
[ ] Arquivos sao isolados por tenant.  
[ ] Chaves de cache incluem o tenant.  
[ ] Filas transportam o tenant de forma confiavel.  
[ ] Workers revalidam o contexto do tenant.  
[ ] WebSockets usam salas isoladas.  
[ ] Eventos nao sao publicados para tenants incorretos.  
[ ] Exportacoes filtram pelo tenant.  
[ ] Buscas globais respeitam o tenant.  
[ ] Logs nao expoem dados cruzados.  
[ ] Administradores comuns nao possuem acesso global.  
[ ] Acesso de suporte ou superadmin e auditado.  

Qualquer quebra de isolamento deve ser classificada como critica.

### Controle de acesso por recurso

Para cada recurso, validar empresa, usuario, pipe, fase, card, database,
registro, formulario, automacao, conversa, contato, arquivo, integracao,
dashboard e relatorio.

[ ] O usuario pode visualizar o recurso.  
[ ] O usuario pode editar o recurso.  
[ ] O usuario pode excluir o recurso.  
[ ] O usuario pode executar a acao solicitada.  
[ ] O usuario pode acessar recursos relacionados.  
[ ] A permissao e revalidada apos mudanca de estado.  
[ ] O acesso direto por ID e protegido.  
[ ] IDs sequenciais nao geram exposicao.  

### Validacao de entrada

Toda entrada externa deve ser considerada nao confiavel.

[ ] Body e validado.  
[ ] Query parameters sao validados.  
[ ] Path parameters sao validados.  
[ ] Headers relevantes sao validados.  
[ ] Cookies sao validados.  
[ ] Webhooks sao validados.  
[ ] Mensagens de filas sao validadas.  
[ ] Eventos de WebSocket sao validados.  
[ ] Respostas externas sao validadas.  
[ ] Arquivos sao validados.  
[ ] Campos desconhecidos sao rejeitados ou ignorados com seguranca.  
[ ] Strings possuem limite de tamanho.  
[ ] Arrays possuem limite de itens.  
[ ] Numeros possuem limites.  
[ ] Enums sao restritos.  
[ ] Datas sao verificadas.  
[ ] URLs sao verificadas.  
[ ] Dados aninhados possuem limite de profundidade.  
[ ] Objetos nao permitem alteracao indevida de propriedades internas.  

### Mass assignment

Verificar se o cliente pode enviar propriedades que nao deveria controlar.

Exemplos criticos:

- `role`;
- `isAdmin`;
- `tenantId`;
- `organizationId`;
- `ownerId`;
- `createdBy`;
- `status`;
- `approved`;
- `permissions`;
- `plan`;
- `billingStatus`;
- `internalNotes`.

[ ] DTOs possuem campos explicitos.  
[ ] Objetos do cliente nao sao repassados diretamente ao ORM.  
[ ] Campos internos sao definidos pelo servidor.  
[ ] Updates parciais possuem whitelist.  
[ ] Campos de permissao nao sao atualizaveis por usuarios comuns.  

### SQL injection e consultas

[ ] Consultas utilizam ORM ou parametros.  
[ ] SQL bruto usa parametros vinculados.  
[ ] Nao existe concatenacao de entrada em SQL.  
[ ] Ordenacao dinamica usa whitelist.  
[ ] Filtros dinamicos usam campos permitidos.  
[ ] Nomes de tabela e coluna nao vem diretamente do cliente.  
[ ] Queries de busca possuem limites.  
[ ] Consultas caras possuem protecao.  
[ ] O tenant esta incluido nas consultas.  

### Command injection

[ ] Entradas externas nao sao concatenadas em comandos.  
[ ] Execucao de shell e evitada.  
[ ] Argumentos sao passados separadamente.  
[ ] Comandos permitidos usam whitelist.  
[ ] Caminhos de arquivos sao normalizados.  
[ ] Workers nao executam conteudo fornecido pelo usuario.  
[ ] Processamento de midia nao aceita parametros arbitrarios.  
[ ] Ferramentas como FFmpeg possuem argumentos controlados.  

### Cross-Site Scripting

[ ] Conteudo fornecido pelo usuario e escapado.  
[ ] HTML bruto e evitado.  
[ ] Renderizacao de Markdown e sanitizada.  
[ ] Conteudo de e-mails e tratado.  
[ ] Nomes de arquivos sao escapados.  
[ ] Dados vindos de integracoes sao tratados.  
[ ] Nao existe uso inseguro de `dangerouslySetInnerHTML`.  
[ ] URLs inseridas pelo usuario sao validadas.  
[ ] Protocolos perigosos sao bloqueados.  
[ ] Templates nao permitem execucao de scripts.  

### CSRF

Quando autenticacao baseada em cookies for utilizada:

[ ] A protecao CSRF esta ativa.  
[ ] Cookies usam `SameSite` adequado.  
[ ] Acoes criticas exigem token CSRF quando aplicavel.  
[ ] Metodos GET nao alteram estado.  
[ ] CORS nao e tratado como substituto de CSRF.  
[ ] Integracoes externas nao reutilizam sessao do navegador.  

### CORS

[ ] Origens permitidas sao explicitas.  
[ ] Nao existe `*` com credenciais.  
[ ] Metodos permitidos sao restritos.  
[ ] Headers permitidos sao restritos.  
[ ] Ambientes possuem configuracoes proprias.  
[ ] Subdominios nao sao aceitos de forma ampla sem necessidade.  
[ ] A origem nao e refletida automaticamente sem validacao.  

### SSRF

Funcionalidades que recebem URLs devem verificar:

[ ] Protocolos permitidos.  
[ ] Bloqueio de `file://`.  
[ ] Bloqueio de enderecos locais.  
[ ] Bloqueio de metadados de nuvem.  
[ ] Bloqueio de redes privadas.  
[ ] Redirecionamentos sao revalidados.  
[ ] DNS rebinding foi considerado.  
[ ] Timeout esta definido.  
[ ] Tamanho maximo da resposta esta definido.  
[ ] Tipo de conteudo e validado.  
[ ] A funcionalidade usa allowlist quando possivel.  

### Upload de arquivos

[ ] O tamanho maximo e limitado.  
[ ] A extensao e validada.  
[ ] O MIME type e validado.  
[ ] O conteudo real e verificado quando necessario.  
[ ] O nome original nao define o caminho final.  
[ ] O nome do arquivo e sanitizado.  
[ ] O armazenamento fica fora de diretorio executavel.  
[ ] Arquivos nao sao servidos como codigo.  
[ ] O acesso ao arquivo exige autorizacao.  
[ ] O tenant faz parte do caminho ou metadado.  
[ ] URLs assinadas expiram.  
[ ] Arquivos perigosos sao bloqueados.  
[ ] Arquivos compactados possuem limites.  
[ ] Processamento de imagem ou video possui timeout.  
[ ] Metadados sensiveis sao removidos quando aplicavel.  
[ ] Exclusao de arquivo respeita permissoes.  
[ ] Downloads registram auditoria quando necessario.  

### Path traversal

[ ] Caminhos nao sao construidos diretamente com entrada do usuario.  
[ ] O caminho final e normalizado.  
[ ] O caminho permanece dentro do diretorio permitido.  
[ ] Sequencias como `../` sao rejeitadas.  
[ ] Links simbolicos foram considerados.  
[ ] Nomes de arquivos externos nao sao confiados.  
[ ] Arquivos de outro tenant nao podem ser acessados.  

### APIs

[ ] Endpoints possuem autenticacao adequada.  
[ ] Endpoints possuem autorizacao.  
[ ] Existe rate limit.  
[ ] Existe limite de payload.  
[ ] Existe paginacao.  
[ ] Existem limites de consulta.  
[ ] Erros nao expoem stack trace.  
[ ] Respostas nao expoem campos internos.  
[ ] Dados sensiveis sao removidos.  
[ ] APIs administrativas sao separadas.  
[ ] Versionamento foi considerado.  
[ ] Metodos HTTP sao coerentes.  
[ ] Acoes destrutivas exigem confirmacao quando aplicavel.  
[ ] Operacoes em lote possuem limite.  
[ ] APIs publicas possuem protecao contra abuso.  

### Rate limiting e abuso

Aplicar protecao especialmente em login, recuperacao de senha, convites,
formularios publicos, webhooks, envio de e-mail, envio de WhatsApp, geracao por
IA, exportacoes, buscas, uploads, criacao de cards e automacoes.

[ ] Existe limite por IP quando aplicavel.  
[ ] Existe limite por usuario.  
[ ] Existe limite por tenant.  
[ ] Existe limite por chave de API.  
[ ] Operacoes caras possuem quotas.  
[ ] Respostas de bloqueio sao adequadas.  
[ ] O limite nao pode ser facilmente contornado.  
[ ] Eventos de abuso sao registrados.  
[ ] Alertas foram considerados.  

### Webhooks

[ ] A origem e autenticada.  
[ ] A assinatura e validada.  
[ ] O corpo original e usado na validacao quando necessario.  
[ ] O timestamp e validado.  
[ ] Replays sao bloqueados.  
[ ] Eventos duplicados sao tratados.  
[ ] O processamento e idempotente.  
[ ] Payloads sao validados.  
[ ] O tenant e resolvido de forma segura.  
[ ] Erros nao expoem dados internos.  
[ ] A resposta ocorre dentro do prazo exigido.  
[ ] Processamento pesado e enviado para fila.  
[ ] Segredos de webhook sao rotacionaveis.  
[ ] Tentativas invalidas sao registradas.  

### WebSockets

[ ] A conexao exige autenticacao.  
[ ] A sessao e validada na conexao.  
[ ] A autorizacao e validada ao entrar em uma sala.  
[ ] O tenant e validado.  
[ ] O cliente nao escolhe salas arbitrarias.  
[ ] Eventos recebidos sao validados.  
[ ] Eventos enviados filtram dados sensiveis.  
[ ] Reconexoes revalidam autenticacao.  
[ ] Tokens expirados encerram ou limitam a sessao.  
[ ] Existe protecao contra flood.  
[ ] Existe limite de payload.  
[ ] Eventos administrativos sao separados.  

### Filas e workers

[ ] Jobs possuem payload validado.  
[ ] O tenant esta presente e e revalidado.  
[ ] Jobs nao confiam apenas em IDs.  
[ ] Jobs possuem idempotencia.  
[ ] Retries possuem limite.  
[ ] Jobs envenenados sao isolados.  
[ ] Dead-letter foi considerada.  
[ ] Dados sensiveis nao sao armazenados sem necessidade.  
[ ] Falhas sao registradas.  
[ ] Workers nao executam comandos arbitrarios.  
[ ] Jobs antigos nao quebram apos deploy.  
[ ] A origem do job pode ser rastreada.  

### Sessoes e cookies

[ ] Cookies usam `HttpOnly`.  
[ ] Cookies usam `Secure` em producao.  
[ ] `SameSite` esta configurado.  
[ ] O escopo de dominio e minimo.  
[ ] O escopo de path e minimo.  
[ ] A sessao possui expiracao.  
[ ] A sessao e rotacionada apos login.  
[ ] A sessao e invalidada apos logout.  
[ ] Sessoes podem ser revogadas.  
[ ] A elevacao de privilegio renova a sessao.  
[ ] Sessoes antigas sao invalidadas apos troca de credenciais.  
[ ] Identificadores de sessao nao aparecem em URLs.  

### Segredos e credenciais

[ ] Segredos nao estao no codigo.  
[ ] Segredos nao estao no Git.  
[ ] Segredos nao aparecem em logs.  
[ ] Segredos nao aparecem no frontend.  
[ ] Variaveis publicas nao contem credenciais.  
[ ] Segredos possuem escopo minimo.  
[ ] Credenciais de ambientes sao separadas.  
[ ] Credenciais podem ser rotacionadas.  
[ ] Chaves antigas podem ser revogadas.  
[ ] A documentacao nao contem valores reais.  
[ ] Arquivos `.env` estao ignorados.  
[ ] Dumps e backups nao expoem segredos.  
[ ] Tokens de terceiros possuem permissoes minimas.  

Se um segredo for encontrado no historico Git, remove-lo do arquivo nao e
suficiente. Ele deve ser revogado e substituido.

### Criptografia

[ ] HTTPS e obrigatorio em producao.  
[ ] Certificados sao validos.  
[ ] Protocolos obsoletos nao sao aceitos.  
[ ] Dados sensiveis em repouso possuem protecao adequada.  
[ ] Senhas usam hash, nao criptografia reversivel.  
[ ] Algoritmos proprios nao sao utilizados.  
[ ] Chaves nao ficam junto dos dados criptografados.  
[ ] Nonces ou IVs nao sao reutilizados.  
[ ] Bibliotecas mantidas sao utilizadas.  
[ ] Comparacoes sensiveis evitam diferencas temporais quando aplicavel.  
[ ] Backups recebem protecao equivalente.  

### Logs e mensagens de erro

[ ] Logs nao contem senhas.  
[ ] Logs nao contem tokens.  
[ ] Logs nao contem chaves de API.  
[ ] Logs nao contem cookies.  
[ ] Logs nao contem payloads completos sem necessidade.  
[ ] Dados pessoais sao minimizados.  
[ ] Stack traces nao sao retornadas ao cliente.  
[ ] Mensagens externas sao genericas quando necessario.  
[ ] Logs internos preservam contexto suficiente.  
[ ] Tentativas de acesso indevido sao registradas.  
[ ] Falhas criticas geram alertas.  
[ ] Logs de auditoria nao podem ser alterados por usuarios comuns.  

### Dependencias

[ ] Novas dependencias possuem justificativa.  
[ ] A versao utilizada e suportada.  
[ ] Nao existem vulnerabilidades conhecidas criticas ou altas.  
[ ] A biblioteca possui manutencao ativa.  
[ ] A licenca e compativel.  
[ ] Dependencias transitivas foram consideradas.  
[ ] Lockfile foi atualizado corretamente.  
[ ] Pacotes desnecessarios foram evitados.  
[ ] Scripts de instalacao foram avaliados.  
[ ] Dependencias vindas de fontes desconhecidas nao foram utilizadas.  
[ ] Atualizacoes de seguranca nao quebram compatibilidade.  
[ ] Imagens Docker utilizam versoes controladas.  

### Configuracao de producao

[ ] Modo debug esta desativado.  
[ ] Stack traces publicas estao desativadas.  
[ ] CORS esta restrito.  
[ ] Headers de seguranca estao configurados.  
[ ] HTTPS e obrigatorio.  
[ ] Servicos internos nao estao publicos.  
[ ] Portas desnecessarias estao fechadas.  
[ ] Bancos nao estao expostos a internet.  
[ ] Redis nao esta exposto publicamente.  
[ ] MinIO possui politica segura.  
[ ] Paineis administrativos possuem protecao.  
[ ] Credenciais padrao foram removidas.  
[ ] Ambientes usam segredos diferentes.  
[ ] Backups possuem acesso restrito.  
[ ] Logs possuem retencao definida.  
[ ] Health checks nao expoem dados sensiveis.  

### Headers de seguranca

[ ] `Content-Security-Policy`.  
[ ] `Strict-Transport-Security`.  
[ ] `X-Content-Type-Options`.  
[ ] `Referrer-Policy`.  
[ ] `Permissions-Policy`.  
[ ] Protecao contra framing.  
[ ] Cache adequado para dados sensiveis.  
[ ] Cookies seguros.  
[ ] CSP nao permite fontes amplas sem necessidade.  
[ ] Nonces ou hashes sao usados quando necessario.  

### Redirecionamentos

[ ] URLs de redirecionamento sao validadas.  
[ ] Existe allowlist.  
[ ] Redirecionamentos externos nao sao aceitos livremente.  
[ ] Parametros `returnUrl`, `next` e similares sao tratados.  
[ ] OAuth valida `redirect_uri`.  
[ ] Redirecionamentos nao carregam tokens em query string.  

### E-mail

[ ] Links possuem expiracao.  
[ ] Tokens nao podem ser reutilizados.  
[ ] O destinatario e validado.  
[ ] Templates escapam conteudo.  
[ ] Dados sensiveis sao minimizados.  
[ ] E-mails nao expoem existencia de usuarios.  
[ ] Envio possui rate limit.  
[ ] Alteracoes criticas nao dependem apenas do clique.  
[ ] Dominios e configuracoes de envio sao protegidos.  
[ ] Conteudo fornecido por usuarios e sanitizado.  

### Integracoes externas

[ ] Credenciais possuem escopo minimo.  
[ ] A autenticacao da API e segura.  
[ ] Certificados sao validados.  
[ ] Timeouts sao definidos.  
[ ] Respostas sao validadas.  
[ ] Dados retornados nao sao confiados automaticamente.  
[ ] Rate limits sao respeitados.  
[ ] Retries nao causam duplicidade.  
[ ] Logs nao expoem payloads sensiveis.  
[ ] O tenant correto esta vinculado a integracao.  
[ ] Tokens podem ser revogados.  
[ ] O armazenamento dos tokens e seguro.  
[ ] Webhooks possuem validacao.  
[ ] Falhas externas possuem isolamento.  

### Links publicos e compartilhamento

[ ] Links publicos possuem escopo limitado.  
[ ] Links podem expirar.  
[ ] Links podem ser revogados.  
[ ] Tokens possuem entropia suficiente.  
[ ] Tokens nao revelam IDs internos.  
[ ] Dados sensiveis nao sao compartilhados por padrao.  
[ ] Acesso e somente leitura quando aplicavel.  
[ ] Downloads sao controlados.  
[ ] A criacao do link e auditada.  
[ ] O tenant e validado.  
[ ] Links nao sao indexaveis por buscadores quando privados.  

### Exportacoes

[ ] O usuario possui permissao de exportacao.  
[ ] O tenant e aplicado.  
[ ] O escopo da exportacao e limitado.  
[ ] Campos sensiveis sao removidos.  
[ ] Exportacoes grandes sao processadas com seguranca.  
[ ] Arquivos gerados possuem expiracao.  
[ ] O download exige autorizacao.  
[ ] A acao e auditada.  
[ ] Existe rate limit.  
[ ] Formulas perigosas em CSV sao neutralizadas.  
[ ] Arquivos nao ficam publicos permanentemente.  

### Importacoes

[ ] Arquivos sao validados.  
[ ] Existe limite de tamanho e linhas.  
[ ] Dados sao validados antes da persistencia.  
[ ] O tenant e aplicado pelo servidor.  
[ ] IDs externos nao permitem acesso cruzado.  
[ ] Erros parciais sao tratados.  
[ ] A operacao e idempotente quando necessario.  
[ ] Formulas ou macros nao sao executadas.  
[ ] A importacao nao altera campos protegidos.  
[ ] A origem e o executor sao auditados.  

### Exclusao de dados

[ ] O usuario possui permissao.  
[ ] A exclusao respeita o tenant.  
[ ] Relacionamentos foram considerados.  
[ ] A acao exige confirmacao adequada.  
[ ] Exclusoes em massa possuem protecao adicional.  
[ ] O processo pode ser recuperado quando aplicavel.  
[ ] Arquivos relacionados sao tratados.  
[ ] Logs de auditoria sao preservados conforme politica.  
[ ] Dados de outro tenant nao sao afetados.  
[ ] Jobs pendentes nao recriam o dado excluido.  

### Auditoria

Acoes criticas devem registrar ator, empresa, acao, recurso, resultado, data e
hora, origem, correlation ID e valores relevantes antes e depois, quando
permitido.

[ ] Usuarios comuns nao alteram logs de auditoria.  
[ ] Dados sensiveis sao minimizados.  
[ ] Falhas de autorizacao sao registradas.  
[ ] Mudancas de permissao sao auditadas.  
[ ] Exportacoes sao auditadas.  
[ ] Acessos administrativos sao auditados.  
[ ] Impersonacoes sao auditadas.  
[ ] Integracoes criadas ou removidas sao auditadas.  
[ ] Acoes da IA com efeito persistente sao auditadas.  

### Recursos de IA

Aplicar tambem `ai-guardrails-check.md`.

[ ] A IA recebe apenas os dados necessarios.  
[ ] Dados pessoais sao minimizados.  
[ ] O prompt interno nao e exposto.  
[ ] Entradas externas sao tratadas como conteudo nao confiavel.  
[ ] Prompt injection foi considerada.  
[ ] A saida da IA e validada antes do uso.  
[ ] A IA nao define permissoes.  
[ ] A IA nao escolhe livremente o tenant.  
[ ] Ferramentas possuem autorizacao independente.  
[ ] Acoes destrutivas exigem confirmacao.  
[ ] A IA nao acessa segredos.  
[ ] A IA nao executa comandos arbitrarios.  
[ ] O escopo das ferramentas e minimo.  
[ ] Existe limite de tokens e chamadas.  
[ ] Existe protecao contra loops.  
[ ] Existe fallback para humano.  
[ ] Existe auditoria das acoes.  
[ ] Conteudo recuperado de documentos nao substitui instrucoes do sistema.  
[ ] Saidas estruturadas possuem schema.  
[ ] Dados entre tenants nao compartilham contexto ou cache.  

## 7. Testes de seguranca minimos

Dependendo da alteracao, executar:

- teste sem autenticacao;
- teste com token invalido;
- teste com token expirado;
- teste com usuario sem permissao;
- teste com usuario de outro tenant;
- teste alterando `tenantId`;
- teste com ID de recurso de outra empresa;
- teste com campos extras no payload;
- teste com entrada excessivamente grande;
- teste com payload malformado;
- teste com caracteres especiais;
- teste com HTML ou script;
- teste com SQL malicioso;
- teste com caminhos `../`;
- teste com URL interna;
- teste com arquivo invalido;
- teste com webhook sem assinatura;
- teste com webhook duplicado;
- teste com repeticao de requisicoes;
- teste de rate limit;
- teste de acao concorrente;
- teste de exportacao indevida;
- teste de acesso direto a arquivo;
- teste de evento WebSocket de outro tenant;
- teste de job manipulado.

## 8. Severidade dos achados

### Critico

Exemplos: acesso entre tenants, bypass de autenticacao, bypass administrativo,
execucao remota, injecao com acesso a dados, segredo exposto, exclusao indevida
em massa, controle total de conta ou acesso publico a dados privados.

Bloqueia imediatamente.

### Alto

Exemplos: autorizacao incompleta, webhook sem assinatura, upload perigoso, SSRF,
reset de senha reutilizavel, sessao sem revogacao em fluxo critico, exportacao
excessiva ou acao de IA sem controle.

Normalmente bloqueia.

### Medio

Exemplos: rate limit ausente, logs excessivos, header de seguranca ausente,
validacao incompleta, configuracao permissiva ou auditoria insuficiente.

Pode bloquear conforme o risco.

### Baixo

Exemplos: mensagem de erro detalhada sem dado sensivel, configuracao defensiva
incompleta, documentacao de seguranca ausente ou pequena inconsistencia de
header.

Deve ser corrigido ou registrado.

## 9. Condicoes automaticas de bloqueio

A aprovacao deve ser bloqueada quando houver:

- quebra de isolamento multiempresa;
- endpoint sensivel sem autenticacao;
- acao sem autorizacao no backend;
- segredo em codigo, log ou frontend;
- SQL ou command injection;
- upload com execucao possivel;
- SSRF com acesso a rede interna;
- webhook critico sem autenticacao;
- token de reset reutilizavel;
- acesso direto a arquivo sem autorizacao;
- configuracao de producao com credenciais padrao;
- banco ou Redis exposto publicamente;
- exportacao de dados de outro tenant;
- acao destrutiva por IA sem confirmacao;
- ferramenta de IA sem controle de permissao;
- vulnerabilidade critica conhecida em dependencia;
- dados sensiveis retornados indevidamente;
- ausencia de correcao para achado critico ou alto.

## 10. Formato dos achados

Cada achado deve conter:

```md
### [CRITICO] Quebra de isolamento multiempresa

**Arquivo:** `src/modules/cards/cards.service.ts`  
**Local:** metodo `findById`

**Problema:**  
A consulta busca o card apenas pelo identificador e nao inclui o identificador
da empresa autenticada.

**Cenario de exploracao:**  
Um usuario autenticado pode informar o ID de um card pertencente a outra
empresa.

**Impacto:**  
Exposicao de informacoes entre clientes do sistema.

**Correcao recomendada:**  
Buscar o recurso utilizando simultaneamente `id` e `organizationId`, obtendo o
tenant exclusivamente do contexto autenticado.

**Validacao necessaria:**  
Criar teste garantindo que um usuario de outra empresa receba resposta de acesso
negado ou recurso inexistente.
```

## 11. Checklist final

[ ] A superficie de ataque foi mapeada.  
[ ] O risco foi classificado.  
[ ] A autenticacao foi validada.  
[ ] A autorizacao foi validada.  
[ ] O isolamento multiempresa foi validado.  
[ ] Entradas externas sao validadas.  
[ ] Nao existe mass assignment.  
[ ] Nao existem injecoes.  
[ ] Uploads sao seguros.  
[ ] APIs possuem limites.  
[ ] Webhooks sao autenticados.  
[ ] WebSockets sao autorizados.  
[ ] Filas preservam o tenant.  
[ ] Sessoes e cookies estao seguros.  
[ ] Segredos estao protegidos.  
[ ] Logs nao expoem dados sensiveis.  
[ ] Dependencias foram analisadas.  
[ ] Configuracoes de producao sao seguras.  
[ ] Integracoes usam credenciais minimas.  
[ ] Acoes criticas sao auditadas.  
[ ] Recursos de IA possuem guardrails.  
[ ] Testes de seguranca aplicaveis foram executados.  
[ ] Nao existem achados criticos pendentes.  
[ ] Nao existem achados altos pendentes.  

## 12. Formato obrigatorio de saida

Ao finalizar esta skill, gerar:

```md
# Security Check Report

## Identificacao
- Story:
- Tarefa:
- Branch:
- Commit:
- Responsavel pela analise:

## Escopo analisado
- Funcionalidade:
- Endpoints:
- Servicos:
- Dados tratados:
- Integracoes:
- Infraestrutura:

## Classificacao de risco
- Nivel:
- Justificativa:

## Superficie de ataque
- atores:
- entradas:
- recursos:
- dados:
- acoes criticas:
- integracoes:

## Autenticacao
- status:
- evidencias:
- observacoes:

## Autorizacao
- status:
- evidencias:
- observacoes:

## Isolamento multiempresa
- status:
- evidencias:
- testes executados:
- observacoes:

## Validacao de entrada
- status:
- schemas:
- limites:
- observacoes:

## Protecao de dados
- dados sensiveis:
- exposicao:
- logs:
- criptografia:
- observacoes:

## APIs e abuso
- rate limit:
- paginacao:
- limite de payload:
- protecao contra automacao:
- observacoes:

## Arquivos
- upload:
- download:
- autorizacao:
- armazenamento:
- observacoes:

## Integracoes
- autenticacao:
- webhook:
- timeout:
- retry:
- credenciais:
- observacoes:

## Infraestrutura
- servicos expostos:
- TLS:
- configuracao de producao:
- segredos:
- observacoes:

## Dependencias
- analise executada:
- vulnerabilidades encontradas:
- decisao:

## IA
- prompt injection:
- autorizacao de ferramentas:
- validacao de saida:
- confirmacao humana:
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

## 13. Criterios de aprovacao

A alteracao pode ser aprovada quando:

- autenticacao e autorizacao estiverem corretas;
- o isolamento multiempresa estiver comprovado;
- entradas externas forem validadas;
- segredos estiverem protegidos;
- dados sensiveis nao forem expostos;
- integracoes estiverem autenticadas;
- APIs possuirem protecao proporcional ao risco;
- nao existirem achados criticos ou altos pendentes;
- testes relevantes tiverem sido executados;
- riscos residuais estiverem documentados e aceitos.

## 14. Resultado esperado

A aplicacao desta skill deve garantir que a implementacao:

- negue acesso por padrao;
- respeite permissoes;
- preserve o isolamento entre empresas;
- proteja dados e credenciais;
- valide todas as entradas externas;
- reduza a superficie de ataque;
- trate integracoes de forma segura;
- impeca acoes indevidas da IA;
- produza evidencias objetivas de seguranca;
- seja bloqueada quando apresentar risco inaceitavel.
