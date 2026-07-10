---
name: giraffe-external-integrations-mapping
description: Transforma a Visão do Produto, o MVP, as Regras de Negócio, as Permissões e a Modelagem de Dados aprovadas do Giraffe CRM em um mapa de integrações externas claro, priorizado, seguro e independente de fornecedor. Use ao mapear WhatsApp API, Meta, e-mail, telefonia ou qualquer sistema externo; ao decidir o que entra no MVP; ao relacionar entradas externas com Formulários, Submissões, Databases, Registros, Pipes, Cards, Automações, IA e Histórico; ao comparar provedores; ao definir eventos, ações, autenticação, webhooks, referências externas, falhas, LGPD, observabilidade, custos e riscos de dependência. Não use para implementar código, escolher biblioteca, criar endpoints, definir filas, schemas físicos, infraestrutura, arquitetura técnica detalhada ou layout visual.
---

# Skill — Mapeamento de Integrações Externas do Giraffe CRM

## 1. Objetivo

Transformar as necessidades do Giraffe CRM em um mapa explícito de integrações externas antes de qualquer implementação.

A Skill deve responder:

**“Com quais sistemas o Giraffe CRM precisa se comunicar, para qual valor de negócio, quais dados entram e saem, quem é a fonte de verdade, quais eventos importam, quais riscos existem e qual integração mínima deve ser validada primeiro?”**

O objetivo não é integrar tudo.

O objetivo é:

- saber por que cada integração existe;
- evitar integração sem caso de uso;
- impedir dependência desnecessária de fornecedor;
- proteger o modelo de dados interno;
- preparar o MVP sem superdimensioná-lo;
- tornar falhas visíveis;
- preservar contexto e rastreabilidade;
- ligar entradas e saídas ao fluxo real do produto;
- evitar vazamento de dados entre Organizações;
- mapear custos e riscos antes da implementação.

Esta Skill deve proteger especialmente a relação entre:

```text
Evento ou entrada externa
        ↓
Formulário / Submissão / Evento interno
        ↓
Database / Registro
        ↓
Pipe / Card
        ↓
Fases / Tarefas / Responsáveis
        ↓
Histórico
        ↓
Automação
        ↓
IA / Integração / Ação Externa
        ↓
Resultado + Log
```

---

## 2. Entradas obrigatórias

Antes de mapear uma integração, consulte:

- Visão do Produto aprovada;
- MVP aprovado;
- Regras de Negócio aprovadas;
- Permissões aprovadas;
- Modelagem de Dados aprovada;
- decisões explícitas já registradas;
- referências visuais aprovadas, apenas para compreender quais estados, ações e resultados precisam estar disponíveis ao usuário;
- integrações já existentes no projeto, quando houver.

Para o Giraffe CRM, considere obrigatoriamente:

- público inicial: agências de marketing;
- o produto é multi-organização;
- Formulário captura a entrada;
- Submissão preserva o envio recebido;
- Database guarda informações persistentes;
- Pipe organiza processos;
- Fase orienta a execução atual;
- Card representa processo em andamento;
- Form Builder configurável por serviço faz parte do MVP;
- Formulário pode criar ou atualizar Registro;
- Formulário pode criar Card quando configurado;
- Cards e Registros podem ser relacionados;
- cada Fase pode possuir tarefas próprias;
- cada Fase pode possuir responsáveis próprios;
- Automação não substitui tarefas e responsáveis nativos da Fase;
- Histórico do Card deve preservar atividades anteriores;
- Automações seguem Quando → Condições → Então;
- Execuções de Automação possuem resultado rastreável;
- Logs de Automação e Histórico operacional possuem finalidades diferentes;
- IA pode ser ação dentro de uma Automação;
- Contato representa a pessoa;
- Conversa agrupa comunicação;
- Mensagem representa comunicação;
- Histórico de Conversas não depende do ciclo de vida do Card;
- Arquivos importantes não ficam presos apenas a Mensagens ou Cards;
- IA assistida para follow-up faz parte do MVP;
- Dashboard operacional faz parte do MVP;
- pelo menos uma integração externa concreta faz parte do MVP;
- aplicação web responsiva faz parte do MVP;
- o núcleo não deve ser modelado para um único provedor.

---

## 3. Integrações obrigatórias para mapeamento

A Skill deve mapear, no mínimo:

1. WhatsApp API;
2. Meta;
3. e-mail;
4. telefonia.

Mapear não significa implementar todas no MVP.

### Regra do MVP

O MVP deve implementar pelo menos uma integração externa concreta ligada ao fluxo principal.

As demais podem permanecer:

- mapeadas;
- priorizadas;
- com dependências conhecidas;
- fora da implementação inicial.

### Regra de prioridade

Não priorize uma integração porque a tecnologia é interessante.

Priorize porque ela valida um valor aprovado do produto.

---

## 4. Fonte de verdade e conflitos documentais

Não resolva silenciosamente conflitos entre documentos.

Ao encontrar contradição entre Visão, MVP, Regras de Negócio, Permissões, Modelagem e o mapa de integrações:

1. identifique os documentos envolvidos;
2. descreva exatamente a contradição;
3. não consolide a decisão conflitante;
4. registre em **Conflitos e decisões pendentes**;
5. aguarde decisão explícita;
6. após a decisão, reconcilie os documentos afetados.

Uma integração não pode mudar silenciosamente a responsabilidade de uma entidade interna.

### Exemplo

Se a Modelagem define:

**Contato é a identidade humana persistente**

a integração de WhatsApp não pode transformar:

**número de telefone**

na identidade principal de toda pessoa dentro do produto.

O número é uma identidade de canal relacionada ao Contato.

---

## 5. Princípio central: capacidade antes de fornecedor

Sempre modele primeiro a capacidade de negócio.

Depois avalie o fornecedor.

### Exemplo correto

```text
Capacidade:
Receber mensagens de WhatsApp

Fluxo:
Canal externo
    ↓
Integração
    ↓
Conversa
    ↓
Mensagem
    ↓
Contato

Fornecedores candidatos:
- Meta Cloud API
- BSP oficial
- outro provedor aprovado
```

### Exemplo incorreto

```text
O sistema inteiro será modelado em torno do payload do fornecedor X.
```

### Regra

O fornecedor pode mudar.

A responsabilidade interna do Giraffe CRM deve continuar válida.

---

## 6. Princípio de adaptação externa

Cada integração deve possuir uma fronteira clara entre:

### Modelo externo

Representa:

- IDs do fornecedor;
- eventos do fornecedor;
- estados do fornecedor;
- formatos do fornecedor;
- limites do fornecedor.

### Modelo interno

Representa:

- Contato;
- Conversa;
- Mensagem;
- Formulário;
- Submissão;
- Registro;
- Card;
- Tarefa;
- Histórico;
- Automação;
- Execução de Automação;
- Sugestão de IA;
- Ação Externa.

### Regra

Não copie o modelo do fornecedor para o núcleo do Giraffe CRM.

Mapeie:

**evento externo → significado interno**

e:

**ação interna → comando externo**

---

## 7. Fronteira entre capacidade interna e integração externa

Nem toda nova capacidade do Giraffe CRM pertence a uma integração.

### Capacidades internas nativas

Exemplos:

- Form Builder configurável;
- tarefas padrão da Fase;
- responsáveis padrão da Fase;
- Histórico do Card;
- criação manual de Card;
- criação manual de Registro.

### Capacidades que podem se conectar a integrações

Exemplos:

- receber lead externo;
- receber mensagem;
- enviar mensagem;
- iniciar chamada;
- receber documento externo;
- usar evento externo como gatilho de Automação;
- usar Automação para executar ação externa.

### Regra

A integração deve conectar o Giraffe CRM ao mundo externo.

Ela não deve ser usada para substituir capacidades nativas do produto.

### Exemplo

Correto:

```text
Card entra na Fase "Produção"
    ↓
Fase apresenta tarefas e responsáveis
```

Também correto:

```text
Card entra na Fase "Produção"
    ↓
Automação
    ↓
Enviar notificação externa
```

Incorreto:

```text
Card entra na Fase
    ↓
Integração externa obrigatória
    ↓
Somente então tarefas e responsáveis aparecem
```

---

## 8. Template obrigatório de mapeamento por integração

Toda integração deve ser analisada com estes campos:

```text
### [Nome da integração]

**Objetivo de negócio:**
[Por que existe.]

**Usuário beneficiado:**
[Quem recebe valor.]

**Prioridade:**
[MVP / Próxima fase / Futuro]

**Capacidades necessárias:**
[O que precisa fazer.]

**Entradas:**
[O que o Giraffe CRM recebe.]

**Saídas:**
[O que o Giraffe CRM envia.]

**Fonte de verdade:**
[Qual sistema é responsável por cada dado.]

**Entidades internas afetadas:**
[Contato, Submissão, Registro, Card, Conversa...]

**Relação com Formulários:**
[Se a integração alimenta Formulário, Submissão ou entrada equivalente.]

**Relação com Database e Pipe:**
[Se cria, atualiza ou relaciona Registros e Cards.]

**Relação com Automações:**
[Quais eventos podem ser gatilhos e quais ações podem ser executadas.]

**Relação com IA:**
[Se a IA pode analisar, sugerir ou preparar ação.]

**Referências externas necessárias:**
[Quais identidades precisam ser preservadas.]

**Eventos relevantes:**
[O que precisa ser percebido.]

**Ações externas relevantes:**
[O que o Giraffe CRM pode pedir ao sistema externo.]

**Autenticação e autorização:**
[Tipo de credencial, escopos e responsáveis — sem implementar.]

**Webhooks, callbacks ou sincronização:**
[Como mudanças podem chegar.]

**Deduplicação e idempotência:**
[Como impedir duplicidade de efeito.]

**Ordem e reconciliação:**
[Como lidar com eventos atrasados, repetidos ou fora de ordem.]

**Falhas e estados incertos:**
[Como o negócio distingue sucesso, falha e resultado desconhecido.]

**Histórico e Logs:**
[O que aparece no Histórico operacional e o que permanece no Log detalhado.]

**Permissões:**
[Quem pode configurar, usar, aprovar e visualizar.]

**LGPD e consentimento:**
[Dados pessoais, base de tratamento e restrições.]

**Retenção:**
[O que precisa de decisão.]

**Observabilidade:**
[O que precisa ser visível para evitar falha silenciosa.]

**Custos:**
[Quais dimensões podem gerar custo.]

**Limites e quotas:**
[O que precisa ser monitorado.]

**Dependência de fornecedor:**
[Qual risco de lock-in existe.]

**Plano de substituição:**
[O que deve permanecer estável se o fornecedor mudar.]

**Riscos:**
[Principais riscos.]

**Decisões pendentes:**
[Somente decisões reais ainda não aprovadas.]
```

---

## 9. Estados mínimos de uma integração

A Skill deve distinguir, conceitualmente:

### Estado da conexão

Exemplos:

- não configurada;
- configurando;
- ativa;
- atenção necessária;
- desconectada.

Não fixe esses nomes como enum técnico.

Valide os estados de negócio necessários.

### Estado de uma ação externa

A modelagem deve permitir distinguir:

- ação solicitada;
- ação aceita para processamento;
- resultado concluído;
- resultado não concluído;
- resultado ainda desconhecido.

### Estado de uma execução de automação que depende de integração

A Skill deve avaliar se o resultado da Execução depende do resultado externo.

Exemplo:

```text
Execução de Automação
    ↓
solicita envio externo
    ↓
Ação Externa aguardando confirmação
```

### Regra

Ausência de confirmação não deve ser tratada automaticamente como sucesso.

### Regra

Uma Execução de Automação não deve ser considerada concluída com sucesso final quando seu resultado depende de uma Ação Externa ainda desconhecida.

---

## 10. Eventos externos: regras obrigatórias

Ao mapear eventos externos, considere que eles podem ser:

- repetidos;
- atrasados;
- fora de ordem;
- incompletos;
- referentes a algo ainda não conhecido internamente.

### A Skill deve exigir resposta para:

1. como identificar o evento?
2. qual integração o originou?
3. a qual Organização pertence?
4. a qual entidade interna se relaciona?
5. ele já foi processado?
6. ele altera estado ou apenas adiciona Histórico?
7. ele pode iniciar uma Automação?
8. ele pode gerar Submissão ou entrada equivalente?
9. ele pode criar ou atualizar Registro?
10. ele pode criar Card?
11. ele pode criar relação entre Card e Registro?
12. o evento pode chegar novamente?
13. pode existir evento anterior ainda não recebido?
14. como o sistema identifica um estado incerto?
15. quando é necessário reconciliar com a fonte externa?

### Regra

Receber o mesmo evento mais de uma vez não pode produzir efeitos de negócio duplicados.

### Regra

Um evento externo que iniciar uma Automação deve preservar vínculo com:

- evento externo;
- integração;
- Organização;
- entidade de contexto;
- Execução de Automação resultante.

---

## 11. Ações externas: regras obrigatórias

Ao mapear uma ação enviada para sistema externo, responda:

1. quem solicitou?
2. a origem foi humana, Automação, IA ou sistema?
3. qual Organização originou a ação?
4. qual é o contexto de negócio?
5. qual entidade interna originou a ação?
6. qual Execução de Automação originou a ação, quando aplicável?
7. qual Sugestão de IA originou a ação, quando aplicável?
8. qual revisão humana ocorreu, quando exigida?
9. qual integração será usada?
10. o usuário possui permissão?
11. existe revisão humana obrigatória?
12. qual referência externa será preservada?
13. como saber se o resultado foi concluído?
14. o que acontece se o resultado permanecer desconhecido?

### Regra

A integração não pode ser um atalho para contornar as Permissões aprovadas.

### Regra

Ação sugerida pela IA, Ação Externa solicitada e resultado externo são conceitos diferentes.

---

# 12. Integração com Form Builder e fluxo Formulário → Database → Pipe

## 12.1 Form Builder nativo

O Form Builder é uma capacidade interna do Giraffe CRM.

Ele não depende de fornecedor externo para existir.

### Regra

Não modele o Form Builder como integração.

---

## 12.2 Entrada externa equivalente a Formulário

Uma integração externa pode receber dados que, conceitualmente, cumprem função de entrada semelhante a uma Submissão.

Exemplos:

- Meta Lead Ads;
- formulário de site externo;
- webhook de parceiro;
- importação autorizada.

### A Skill deve mapear

- origem externa;
- identificador externo;
- campos recebidos;
- transformação para o modelo interno;
- consentimento e origem do dado;
- deduplicação;
- destino;
- resultados produzidos.

---

## 12.3 Conexão Formulário → Database → Pipe

Quando um fluxo de entrada externo ou nativo estiver configurado para:

```text
Entrada
    ↓
Registro
    ↓
Card
```

a Skill deve mapear:

- qual entrada originou o fluxo;
- qual Registro foi criado ou atualizado;
- qual Card foi criado;
- qual relação foi criada;
- quais Arquivos foram associados;
- qual Histórico deve ser visível;
- quais falhas precisam aparecer;
- se uma Automação foi envolvida.

### Regra

A integração não deve criar um caminho paralelo ao fluxo interno.

Ela deve adaptar a entrada externa às entidades aprovadas.

---

## 12.4 Resultado de entrada externa

A Skill deve distinguir:

```text
Evento ou lead recebido
        ≠
Registro criado
        ≠
Card criado
        ≠
Relação criada
```

### Regra

Cada resultado deve ser rastreável.

### Regra

Falha parcial deve permanecer identificável.

Exemplo:

```text
Lead recebido
✓ Registro criado
✗ Card não criado
```

Não apresentar o fluxo inteiro como sucesso completo.

---

# 13. Integrações e Fases com tarefas e responsáveis

As Fases, tarefas e responsáveis são capacidades internas.

Integrações podem interagir com esse contexto somente quando houver caso de uso aprovado.

### Exemplos válidos

```text
Evento externo recebido
    ↓
Automação
    ↓
Mover Card para Fase
```

```text
Card entra em Fase
    ↓
Automação
    ↓
Enviar aviso externo ao responsável
```

```text
Mensagem externa recebida
    ↓
Atualizar contexto do Card
```

### Regra

A integração não deve redefinir silenciosamente:

- tarefas padrão da Fase;
- responsáveis padrão da Fase;
- instruções da Fase.

### Regra

Se uma ação externa alterar:

- Fase;
- responsável;
- tarefa;

essa alteração deve respeitar:

- Regras de Negócio;
- Permissões;
- Histórico;
- Automação configurada.

---

# 14. Histórico visível e rastreabilidade externa

O Histórico do Card deve permitir compreender ações externas relevantes sem precisar expor todo o detalhe técnico.

### Exemplo de Histórico operacional

```text
09:32 — Lead recebido da Meta
09:33 — Registro "Cliente XPTO" criado
09:33 — Card "Onboarding" criado
09:34 — Automação acionada
09:35 — Follow-up sugerido pela IA
09:41 — Mensagem aprovada e enviada
```

### Exemplo de Log detalhado

```text
Evento externo recebido
Identificador externo
Condições avaliadas
Ação solicitada
Resposta do fornecedor
Tentativas
Resultado atual
```

### Regra

Histórico operacional e Log detalhado se relacionam.

Eles não são a mesma coisa.

### Regra

O Histórico pode resumir que uma integração ou Automação atuou sem copiar:

- payload completo;
- segredo;
- detalhe técnico sensível.

---

# 15. Automações no modelo Quando → Condições → Então

Integrações podem participar do modelo de Automação como:

### Gatilhos

Exemplos:

- lead recebido;
- mensagem recebida;
- e-mail recebido;
- chamada encerrada;
- ação externa concluída;
- ação externa não concluída;
- integração desconectada.

### Condições

Exemplos:

- origem do lead;
- canal;
- estado do Card;
- campo do Registro;
- Fase atual;
- consentimento aplicável;
- estado da conexão.

### Ações

Exemplos:

- enviar mensagem;
- enviar e-mail;
- iniciar chamada;
- buscar dado externo;
- criar Card relacionado;
- atualizar Registro;
- pedir sugestão à IA.

### Regra

O mapa de integração deve indicar:

- quais eventos externos podem iniciar Automação;
- quais ações externas podem ser executadas por Automação;
- quais resultados precisam ser acompanhados;
- quais ações exigem revisão humana.

---

# 16. Execuções, Logs e resultados de Automações com integração

Quando uma Automação usar uma integração, preserve a cadeia:

```text
Evento
    ↓
Automação
    ↓
Execução de Automação
    ↓
Ação Externa
    ↓
Resultado Externo
```

Quando houver IA:

```text
Evento
    ↓
Automação
    ↓
Execução
    ↓
Sugestão de IA
    ↓
Revisão Humana
    ↓
Ação Externa
    ↓
Resultado Externo
```

### A Skill deve mapear

- vínculo entre Execução e Ação Externa;
- estado da Execução;
- estado da Ação Externa;
- Log da Execução;
- evento resumido no Histórico;
- necessidade de reconciliação.

### Regra

Não comprima toda essa cadeia em um único estado genérico de “sucesso”.

---

# 17. IA como ação possível dentro de Automação

A IA pode ser uma ação interna iniciada por Automação.

Exemplo:

```text
QUANDO
Card ficar sem atividade

SE
processo estiver ativo

ENTÃO
pedir sugestão de follow-up à IA
```

A integração externa entra depois, quando houver ação real:

```text
Sugestão de IA
    ↓
Revisão Humana
    ↓
Envio por WhatsApp ou e-mail
```

### A Skill deve mapear

- quais dados externos podem compor o contexto da IA;
- quais dados não devem ser enviados à IA;
- origem da solicitação;
- Execução de Automação relacionada;
- revisão humana;
- canal externo eventual;
- resultado final;
- custo de IA relacionado;
- retenção necessária.

### Regra

IA como ação de Automação não significa envio externo automático.

### Regra

A IA não ganha acesso adicional por causa da Automação ou da Integração.

---

# 18. Mapeamento — WhatsApp API

## 18.1 Objetivo de negócio

Permitir que a agência:

- receba mensagens de clientes;
- preserve Histórico;
- relacione comunicação a Contatos e Registros;
- acompanhe Conversas;
- use IA para sugerir follow-up;
- use eventos de Mensagem em Automações;
- revise sugestões;
- envie Mensagem aprovada;
- acompanhe resultado da ação externa.

---

## 18.2 Capacidades a mapear

Avalie:

- conexão de número ou conta;
- recebimento de Mensagens;
- envio de Mensagens;
- Mensagens de texto;
- mídia e documentos;
- identificação do remetente;
- identificação do destinatário;
- estados de Mensagem;
- mensagens iniciadas pela empresa;
- modelos ou templates quando exigidos pelo canal;
- múltiplos números;
- múltiplas Organizações;
- Histórico disponível pelo fornecedor;
- limites de sincronização;
- coexistência com outros usos do número;
- desconexão e reconexão.

Não assuma que todo fornecedor suporta as mesmas capacidades.

---

## 18.3 Entidades internas afetadas

No mínimo:

- Organização;
- Integração;
- Referência Externa;
- Contato;
- Identidade de Contato;
- Conversa;
- Participante da Conversa;
- Mensagem;
- Arquivo;
- Histórico;
- Automação;
- Execução de Automação;
- Sugestão de IA;
- Ação Externa.

---

## 18.4 Fluxo de entrada recomendado

```text
Evento do canal
        ↓
Identificar Integração e Organização
        ↓
Identificar evento externo
        ↓
Verificar duplicidade
        ↓
Resolver identidade de canal
        ↓
Identificar ou criar contexto de Contato
        ↓
Identificar ou criar Conversa
        ↓
Registrar Mensagem
        ↓
Relacionar Arquivos quando existirem
        ↓
Registrar Histórico
        ↓
Avaliar Automação quando configurada
        ↓
Atualizar Dashboard ou follow-up quando aplicável
```

### Regra

Não crie novo Contato automaticamente sem regra explícita de resolução de identidade.

Quando a identidade for incerta, preserve o evento sem fundir pessoas indevidamente.

---

## 18.5 Fluxo de saída recomendado

```text
Usuário, Automação ou IA origina intenção
        ↓
Permissão é validada
        ↓
Revisão humana quando obrigatória
        ↓
Ação Externa é registrada
        ↓
Fornecedor recebe solicitação
        ↓
Resultado é acompanhado
        ↓
Mensagem, Execução e Histórico são atualizados
```

### Regra

Sugestão de IA não é Mensagem enviada.

### Regra

Solicitação aceita pelo fornecedor não é necessariamente entrega concluída.

---

## 18.6 Gatilhos de Automação candidatos

Mapear, quando disponíveis e aprovados:

- nova Mensagem recebida;
- Mensagem enviada;
- Mensagem entregue;
- Mensagem não concluída;
- Conversa sem resposta;
- conexão perdida.

Não implementar todos automaticamente.

---

## 18.7 Ações de Automação candidatas

Mapear:

- enviar Mensagem aprovada;
- criar ou atualizar Registro;
- criar Card relacionado;
- pedir sugestão à IA;
- sinalizar necessidade de atenção.

---

## 18.8 Provedores candidatos

A Skill pode avaliar:

- Meta WhatsApp Business Platform / Cloud API;
- BSPs oficiais;
- 360dialog;
- Evolution API;
- outros provedores aprovados.

A comparação deve considerar:

- aderência ao caso de uso;
- estabilidade;
- onboarding;
- suporte multi-organização;
- múltiplos números;
- eventos disponíveis;
- estados de Mensagem;
- mídia;
- templates;
- histórico;
- operação necessária;
- segurança;
- custos;
- suporte;
- risco de indisponibilidade;
- risco de bloqueio;
- dependência do fornecedor;
- esforço para trocar de provedor.

### Regra

A Skill não escolhe automaticamente o fornecedor porque ele já existe no código legado.

O legado é uma entrada.

Não é decisão final.

---

# 19. Mapeamento — Meta

## 19.1 Objetivo de negócio

Permitir que a agência conecte o Giraffe CRM ao ecossistema Meta para casos de uso aprovados.

Possíveis capacidades:

- receber leads;
- preservar origem;
- associar formulário externo;
- criar ou atualizar Contato;
- criar ou atualizar Registro;
- iniciar Card;
- criar relação Card ↔ Registro;
- iniciar Automação;
- acompanhar origem;
- consultar informações autorizadas.

---

## 19.2 Escopos que devem ser separados

Não trate “Meta” como uma única integração genérica.

Avalie separadamente:

### Meta Lead Ads

Objetivo:

- receber leads;
- preservar origem;
- associar formulário;
- associar campanha quando disponível;
- iniciar fluxo aprovado.

### Meta Ads / Marketing

Objetivo possível:

- consultar contas;
- campanhas;
- conjuntos;
- anúncios;
- métricas autorizadas.

### Páginas e outros ativos

Somente se existir caso de uso aprovado.

### Regra

Não peça acesso a ativos e dados que o produto ainda não usa.

---

## 19.3 Fluxo de Lead Ads

```text
Novo lead externo
        ↓
Evento recebido
        ↓
Referência Externa preservada
        ↓
Dados do lead recuperados quando necessário
        ↓
Entrada equivalente a Submissão
        ↓
Contato identificado ou sinalizado como novo
        ↓
Registro criado ou atualizado
        ↓
Card criado quando configurado
        ↓
Card ↔ Registro relacionados
        ↓
Automação acionada quando configurada
        ↓
Origem preservada no Histórico
```

### A Skill deve mapear

- identificação do lead;
- conta e ativo de origem;
- formulário de origem;
- campanha quando disponível;
- consentimentos coletados na origem;
- campos externos;
- transformação para campos internos;
- duplicidade;
- atualização versus criação;
- criação opcional de Card;
- relacionamento;
- falhas parciais;
- perda de autorização.

---

## 19.4 Falha parcial em entrada

Exemplo:

```text
Lead recebido
✓ Entrada preservada
✓ Registro criado
✗ Card não criado
```

### Regra

O fluxo não deve ser representado como sucesso completo.

A parte concluída permanece válida.

A parte não concluída deve ficar visível e tratável.

---

## 19.5 Fonte de verdade

Defina explicitamente:

- quais dados continuam sendo verdade da Meta;
- quais dados passam a ser verdade do Giraffe CRM;
- quais dados são apenas Referências Externas;
- quais dados podem ser atualizados internamente.

### Regra

Não mantenha cópia interna como se fosse verdade atual quando o dado depende da fonte externa e pode mudar.

---

# 20. Mapeamento — E-mail

## 20.1 Objetivo de negócio

Permitir:

- receber e-mails relacionados aos clientes;
- preservar Histórico de comunicação;
- enviar follow-ups aprovados;
- relacionar anexos;
- identificar participantes;
- manter continuidade da Conversa;
- usar eventos de e-mail em Automações.

---

## 20.2 Capacidades a mapear

Avalie:

- conexão de caixa postal;
- múltiplas caixas por Organização;
- recebimento;
- envio;
- threads;
- respostas;
- participantes;
- anexos;
- pastas ou labels quando relevantes;
- estado de envio quando disponível;
- identidade do remetente;
- aliases;
- desconexão;
- revogação de acesso.

---

## 20.3 Entidades internas afetadas

No mínimo:

- Organização;
- Integração;
- Conta Externa;
- Referência Externa;
- Contato;
- Identidade de Contato;
- Conversa;
- Mensagem;
- Participantes;
- Arquivos;
- Automação;
- Execução de Automação;
- Ação Externa;
- Histórico.

---

## 20.4 Regra de thread

Thread externa e Conversa interna podem se relacionar.

Não presuma que são obrigatoriamente a mesma entidade.

Avalie:

- um thread externo pode mudar?
- uma Conversa interna pode reunir mais de um thread?
- respostas mantêm referência de origem?
- mensagens de canais diferentes podem pertencer ao mesmo contexto de Cliente?

A decisão deve preservar Histórico sem prender o domínio ao provedor.

---

## 20.5 Gatilhos de Automação candidatos

Mapear:

- novo e-mail recebido;
- resposta recebida;
- e-mail enviado;
- falha de envio;
- caixa desconectada.

---

## 20.6 Ações de Automação candidatas

Mapear:

- enviar e-mail aprovado;
- criar Registro;
- atualizar Registro;
- criar Card relacionado;
- pedir sugestão à IA;
- sinalizar atenção.

---

## 20.7 Provedores e métodos candidatos

A Skill pode avaliar:

- Gmail API / Google Workspace;
- Microsoft Graph / Microsoft 365;
- provedores transacionais;
- protocolos de e-mail, quando aprovados.

Comparar:

- autorização;
- recebimento de mudanças;
- sincronização;
- envio;
- threads;
- anexos;
- limites;
- segurança;
- operação;
- custos;
- suporte multi-organização.

Não escolher automaticamente método genérico quando API do provedor for necessária para o caso real.

---

# 21. Mapeamento — Telefonia

## 21.1 Objetivo de negócio

Preparar o Giraffe CRM para:

- receber chamadas;
- realizar chamadas;
- relacionar chamadas a Contatos;
- registrar Histórico;
- acompanhar estado da chamada;
- relacionar gravação quando permitida;
- relacionar transcrição quando permitida;
- usar eventos de chamada em Automações;
- futuramente suportar IA de voz com fallback humano.

---

## 21.2 Capacidades a mapear

Avalie:

- número telefônico;
- chamada recebida;
- chamada realizada;
- identificação de participantes;
- início;
- atendimento;
- encerramento;
- resultado;
- duração;
- gravação;
- transcrição;
- transferência;
- encaminhamento;
- fila;
- agente humano;
- agente de IA;
- fallback;
- indisponibilidade.

Não inclua tudo automaticamente no MVP.

---

## 21.3 Entidades internas afetadas

Avalie:

- Organização;
- Integração;
- Número ou Identidade de Canal;
- Contato;
- Conversa;
- Interação de Chamada;
- Participantes;
- Gravação;
- Transcrição;
- Automação;
- Execução de Automação;
- Ação Externa;
- Histórico.

### Regra

Chamada não deve ser forçada a parecer Mensagem de texto.

Ela pode pertencer ao domínio de Conversa, mas possui ciclo e eventos próprios.

---

## 21.4 Gatilhos de Automação candidatos

Mapear:

- chamada recebida;
- chamada não atendida;
- chamada concluída;
- gravação disponível;
- transcrição disponível;
- falha de chamada.

---

## 21.5 Ações de Automação candidatas

Mapear:

- criar tarefa de retorno;
- criar Card relacionado;
- atualizar Registro;
- pedir resumo à IA;
- iniciar chamada quando aprovado futuramente.

---

## 21.6 Gravação e transcrição

Antes de mapear como funcionalidade, registre:

- finalidade;
- consentimento;
- base de tratamento;
- aviso;
- acesso;
- retenção;
- exclusão;
- quem pode ouvir;
- quem pode usar na IA.

### Regra

Não presuma que toda chamada será gravada.

Não presuma que toda gravação será enviada para IA.

---

## 21.7 IA de voz

Quando essa fase existir, mapear obrigatoriamente:

- escopo da IA;
- ações permitidas;
- dados acessíveis;
- transferência para humano;
- situações de fallback;
- proibição de inventar informação;
- confirmação antes de ações críticas;
- registro do que foi executado;
- custo por chamada;
- observabilidade;
- falha silenciosa.

A IA de voz não entra automaticamente no MVP atual.

---

# 22. Modelo de canais do Giraffe CRM

O núcleo deve distinguir:

### Canal

Exemplos:

- WhatsApp;
- e-mail;
- telefonia;
- outro canal futuro.

### Provedor

Exemplos:

- fornecedor A;
- fornecedor B.

### Conexão

Representa uma integração configurada para uma Organização.

### Identidade de Canal

Representa:

- número;
- endereço;
- conta;
- identificador externo.

### Regra

Canal e Provedor não são a mesma coisa.

O Giraffe CRM deve poder trocar o Provedor sem redefinir o conceito de Canal.

---

# 23. Mapa canônico de capacidades

A Skill deve mapear as capacidades internas necessárias sem copiar nomes de endpoints.

## Entrada de dados

- receber evento;
- receber lead;
- receber dados de formulário externo;
- preservar origem;
- criar entrada interna;
- criar ou atualizar Registro;
- criar Card quando configurado;
- relacionar resultados.

## Comunicação

- receber interação;
- enviar interação;
- receber estado;
- receber Arquivo;
- enviar Arquivo;
- identificar participante.

## Automação

- usar evento externo como gatilho;
- avaliar contexto interno;
- executar ação externa;
- acompanhar resultado;
- reconciliar incerteza.

## IA

- solicitar sugestão;
- usar contexto permitido;
- preservar origem;
- exigir revisão quando aplicável;
- encaminhar ação aprovada ao canal externo.

## Telefonia

- iniciar chamada;
- receber chamada;
- acompanhar progresso;
- concluir chamada;
- relacionar gravação;
- relacionar transcrição.

## Integração

- conectar;
- desconectar;
- verificar estado;
- renovar autorização quando aplicável;
- receber evento;
- executar ação;
- reconciliar resultado.

### Regra

O mapa canônico define capacidades.

Não define endpoints.

---

# 24. Referências externas

Toda entidade externa relevante deve preservar identidade contextual.

Exemplo conceitual:

```text
Organização
  + Integração
  + Tipo de entidade externa
  + Identificador externo
```

### Regra

Um identificador externo nunca deve ser presumido como único em todo o Giraffe CRM sem contexto.

Avalie referências para:

- contato externo;
- conversa externa;
- mensagem externa;
- lead;
- formulário externo;
- submissão externa;
- campanha;
- conta;
- número;
- chamada;
- gravação;
- arquivo;
- ação externa.

---

# 25. Deduplicação e idempotência

A Skill deve exigir uma estratégia conceitual para cada integração.

## Eventos recebidos

Responder:

- qual identificador permite reconhecer repetição?
- o mesmo evento pode chegar novamente?
- o mesmo objeto pode gerar eventos diferentes?
- qual efeito não pode ser duplicado?
- uma repetição poderia criar Card duplicado?
- uma repetição poderia criar Registro duplicado?
- uma repetição poderia acionar Automação duas vezes?

## Ações enviadas

Responder:

- uma nova tentativa pode gerar duplicidade externa?
- qual contexto precisa ser preservado?
- como distinguir nova ação de repetição da mesma ação?
- como impedir envio duplicado após retry?

### Regra

Retry técnico não pode criar segunda ação de negócio quando a intenção original era única.

---

# 26. Ordem de eventos e reconciliação

A Skill deve mapear se os eventos podem chegar fora de ordem.

### Exemplo conceitual

Pode chegar:

```text
estado concluído
antes de
estado intermediário
```

O mapa deve definir:

- qual estado pode substituir outro;
- quando preservar evento sem alterar estado atual;
- quando consultar a fonte externa;
- como identificar informação incerta;
- como atualizar Execução de Automação relacionada.

### Regra

Último evento recebido não significa automaticamente estado mais atual.

---

# 27. Autenticação, autorização e credenciais

A Skill deve mapear, sem implementar:

- quem conecta a integração;
- qual nível de permissão é necessário;
- quais escopos de acesso são necessários;
- quais ativos externos ficam disponíveis;
- quando a autorização expira;
- como a conexão pode ser revogada;
- como detectar perda de acesso.

### Regra de menor privilégio

Solicite apenas os acessos necessários para o caso de uso aprovado.

### Regra de segredo

Não trate como campo comum:

- token;
- senha;
- chave;
- segredo;
- credencial.

O mapa deve indicar:

- proprietário;
- finalidade;
- escopo;
- rotação quando aplicável;
- revogação;
- referência segura.

Não definir armazenamento técnico nesta etapa.

---

# 28. Webhooks, callbacks, push e sincronização

Para cada integração, classifique como ela informa mudanças.

Possibilidades:

- webhook;
- callback;
- push;
- sincronização incremental;
- polling;
- consulta sob demanda.

### A Skill deve responder

- qual mecanismo é preferencial?
- qual é o fallback?
- existe confirmação de recebimento?
- o fornecedor pode reenviar?
- existe assinatura ou validação de origem?
- há prazo de resposta?
- a recepção deve apenas aceitar e processar depois?
- é necessário renovar assinatura ou acompanhamento?
- como detectar que eventos pararam de chegar?
- como uma falha de recebimento afeta Automações dependentes?

### Regra

Falha silenciosa de recebimento é inaceitável.

A integração deve possuir um sinal observável de saúde.

---

# 29. Falhas e estados incertos

A Skill deve mapear:

### Falha antes do envio

A ação não saiu do Giraffe CRM.

### Aceitação externa

O fornecedor aceitou a solicitação.

Isso não significa necessariamente resultado final.

### Falha externa conhecida

O fornecedor informou que a ação não foi concluída.

### Estado desconhecido

Não existe evidência suficiente para declarar sucesso ou falha.

### Falha parcial de fluxo

Exemplo:

```text
Evento externo recebido
✓ Registro atualizado
✓ Card criado
✗ Mensagem não enviada
```

### Regra

Estado desconhecido continua visível até reconciliação ou decisão explícita.

### Regra

Falha parcial não apaga resultados válidos já concluídos.

### Regra

Não transforme desconhecido em sucesso.

---

# 30. Observabilidade obrigatória

Cada integração deve possuir requisitos de observabilidade.

Mapeie:

- última comunicação bem-sucedida;
- último evento recebido;
- falhas recentes;
- ações pendentes;
- ações em estado desconhecido;
- perda de autorização;
- desconexão;
- crescimento de backlog quando aplicável;
- taxa anormal de falhas;
- interrupção de eventos;
- Automações dependentes afetadas;
- execuções aguardando resultado externo.

### Regra

O sistema deve permitir distinguir:

**“não aconteceu nada”**

de:

**“a integração parou de funcionar”.**

---

# 31. Histórico e rastreabilidade

Toda ação relevante deve permitir identificar:

- Organização;
- integração;
- contexto de negócio;
- entidade interna;
- referência externa;
- origem da ação;
- usuário, Automação, IA ou sistema;
- ação pretendida;
- resultado;
- momento;
- Execução de Automação relacionada quando existir;
- Sugestão de IA relacionada quando existir.

### Regra

Logs técnicos não substituem Histórico de negócio.

Histórico de negócio não substitui observabilidade técnica.

### Regra

O Histórico do Card pode resumir:

```text
“Mensagem enviada por Automação”
```

enquanto o Log detalhado preserva:

- gatilho;
- condições;
- tentativas;
- respostas;
- resultado.

---

# 32. Permissões obrigatórias

A Skill deve mapear separadamente:

## Configurar integração

Exemplos:

- conectar conta;
- trocar credencial;
- selecionar ativo;
- desconectar.

## Usar integração

Exemplos:

- enviar Mensagem;
- realizar chamada;
- importar lead.

## Configurar Automação com integração

Exemplos:

- usar evento externo como gatilho;
- configurar envio externo como ação;
- selecionar conta ou canal autorizado.

## Aprovar ação

Exemplo:

- aprovar follow-up sugerido pela IA.

## Visualizar Histórico

Exemplos:

- ler Conversa;
- consultar chamada;
- ver resultado de envio.

## Visualizar Log

Exemplos:

- consultar detalhe de Execução;
- ver falha;
- ver estado desconhecido.

### Regra

Configurar uma integração e usar uma integração não são a mesma permissão.

### Regra

Configurar Automação não concede automaticamente acesso a qualquer Integração.

---

# 33. IA e integrações externas

No MVP:

- IA identifica necessidade de acompanhamento;
- IA sugere próxima ação;
- IA pode sugerir Mensagem;
- IA pode ser acionada por Automação;
- humano revisa quando exigido;
- ação externa acontece somente após aprovação necessária.

### A Skill deve mapear

- quais dados a IA pode usar;
- quais dados externos entram no contexto;
- quais canais podem receber ação;
- quem pode revisar;
- quem pode aprovar;
- quem pode executar;
- qual Histórico é preservado;
- como evitar envio duplicado;
- como registrar alteração humana da sugestão;
- como vincular Sugestão à Execução de Automação;
- como vincular Ação Externa à Sugestão aprovada.

### Regra

A IA não ganha acesso adicional por causa da integração.

---

# 34. LGPD, consentimento e privacidade

Para cada integração, mapear:

- dados pessoais recebidos;
- dados pessoais enviados;
- finalidade;
- origem do dado;
- consentimentos quando aplicáveis;
- opt-out quando aplicável;
- compartilhamento com fornecedor;
- processamento por IA;
- retenção;
- exclusão;
- anonimização;
- transferência internacional quando relevante;
- acesso interno.

### Entradas de Formulário e Leads

Mapear especialmente:

- origem do consentimento;
- texto apresentado na origem;
- finalidade da coleta;
- campos recebidos;
- Arquivos recebidos;
- repasse para IA;
- repasse para outros fornecedores.

### WhatsApp e e-mail

Mapear especialmente:

- comunicação operacional;
- comunicação de marketing;
- preferência do Contato;
- bloqueio ou opt-out;
- origem do consentimento.

### Telefonia

Mapear especialmente:

- gravação;
- transcrição;
- aviso;
- acesso;
- retenção;
- uso por IA.

### Regra

Não invente base legal ou prazo de retenção.

Registre como decisão pendente quando ainda não aprovado.

---

# 35. Custos e monitoramento

Toda integração deve mapear o que pode gerar custo.

Exemplos:

- Mensagens;
- Conversas;
- templates;
- chamadas;
- minutos;
- números;
- gravações;
- transcrições;
- armazenamento;
- requisições;
- processamento;
- IA relacionada;
- retries;
- sincronizações.

### A Skill deve exigir

- unidade de custo;
- responsável pelo custo;
- limite ou orçamento quando existir;
- métrica de uso;
- alerta de crescimento anormal;
- capacidade de atribuir custo à Organização quando necessário;
- relação entre custo de Automação e ação externa quando aplicável.

### Regra

Não fixar preços na Skill.

Preços mudam.

Mapeie dimensões de custo.

---

# 36. Limites, quotas e capacidade

Para cada fornecedor, registre:

- limites conhecidos;
- quotas;
- restrições;
- janelas de uso quando existirem;
- limites por conta;
- limites por número;
- limites por aplicativo;
- limites por Organização.

### Regra

Não codifique números temporais ou quotas instáveis como regra permanente do produto.

A implementação deve consultar documentação atual antes da decisão técnica.

---

# 37. Dependência de fornecedor

Para cada integração, avalie:

- quanto do modelo interno depende do fornecedor;
- quais IDs precisam ser preservados;
- quais recursos são exclusivos;
- quais dados podem ser exportados;
- quais Históricos podem ser recuperados;
- dificuldade de migração;
- impacto de indisponibilidade;
- impacto de bloqueio;
- dependência operacional;
- impacto sobre Automações dependentes.

### Classificação sugerida

- baixa;
- média;
- alta.

### Regra

Não classifique sem justificar.

---

# 38. Avaliação de provedores

Quando houver mais de um fornecedor candidato, use uma matriz.

```text
| Critério | Peso | Provedor A | Provedor B | Provedor C |
|---|---:|---:|---:|---:|
| Aderência ao caso de uso | | | | |
| Estabilidade | | | | |
| Segurança | | | | |
| Webhooks/eventos | | | | |
| Estados e rastreabilidade | | | | |
| Uso em Automações | | | | |
| Multi-organização | | | | |
| Operação necessária | | | | |
| Suporte | | | | |
| Custos | | | | |
| Lock-in | | | | |
| Facilidade de substituição | | | | |
```

### Regra

O menor custo não vence automaticamente.

A tecnologia mais conhecida também não vence automaticamente.

A escolha deve refletir o caso de uso aprovado.

---

# 39. Priorização das integrações do Giraffe CRM

A Skill deve classificar cada integração.

## P0 — Necessária para validar o MVP

Existe caso de uso real aprovado e sem ela um pilar obrigatório não é validado.

## P1 — Próxima fase

Possui alto valor, mas não é necessária para validar o primeiro fluxo completo.

## P2 — Futuro

Importante para expansão.

## Pesquisa

Ainda não existe informação suficiente.

### Regra

A prioridade deve indicar:

- valor validado;
- dependências;
- risco;
- esforço relativo;
- razão da decisão.

Não priorizar somente por preferência pessoal.

---

# 40. Recomendação inicial de avaliação para o projeto

Com base no fluxo aprovado do Giraffe CRM, a Skill deve avaliar primeiro:

## WhatsApp

Como candidato forte à integração concreta do MVP por sua relação direta com:

- comunicação de agência;
- follow-up;
- Conversa;
- IA assistida;
- Automação;
- envio aprovado;
- resultado rastreável.

Esta é uma recomendação de avaliação.

Não é escolha automática de fornecedor.

## Meta Lead Ads

Avaliar como integração de entrada capaz de provar:

```text
Lead externo
    ↓
Entrada preservada
    ↓
Registro
    ↓
Card relacionado
    ↓
Automação
```

Pode ser P0 ou P1 conforme o fluxo real escolhido para o MVP.

## E-mail

Avaliar como canal de comunicação persistente e follow-up.

Pode ser P1 se WhatsApp validar primeiro o canal externo.

## Telefonia

Mapear desde já.

Implementar quando houver caso de uso aprovado e prioridade.

IA de voz não entra automaticamente no MVP atual.

---

# 41. Fronteira com referências visuais

As referências aprovadas para:

- Form Builder;
- Card;
- Automações;

podem indicar quais estados e resultados precisam estar disponíveis para o usuário.

Exemplos:

- Form Builder mostra Destino dos Dados;
- Card mostra Histórico anterior;
- Automação mostra estado, última execução e resultado;
- Logs possuem acesso separado.

### Regra

Esta Skill pode exigir que a integração forneça informações suficientes para sustentar essas experiências.

Ela não deve decidir:

- posição do botão;
- cor;
- largura de painel;
- composição da tela;
- número de colunas;
- componente visual.

### Exemplo correto

**“A lista de Automações precisa conseguir mostrar última execução e resultado recente.”**

### Exemplo incorreto

**“O resultado deve aparecer em um card de 320px no lado direito.”**

---

# 42. Regras de qualidade do mapeamento

Antes de aprovar uma integração, verifique:

1. existe objetivo de negócio claro?
2. existe usuário beneficiado?
3. a prioridade está justificada?
4. entradas e saídas estão explícitas?
5. a fonte de verdade está definida?
6. entidades internas afetadas estão definidas?
7. a relação com Formulário, Database e Pipe foi avaliada?
8. a integração evita criar caminho paralelo ao modelo interno?
9. criação de Card e Registro relacionados foi mapeada quando aplicável?
10. referências externas estão contextualizadas?
11. eventos relevantes estão definidos?
12. ações externas estão definidas?
13. eventos externos podem iniciar Automação?
14. ações externas podem ser usadas por Automação?
15. Execução de Automação e Ação Externa estão separadas?
16. Logs e Histórico possuem finalidades diferentes?
17. duplicidade foi considerada?
18. eventos fora de ordem foram considerados?
19. falhas parciais foram consideradas?
20. estados desconhecidos foram considerados?
21. configuração e uso possuem Permissões separadas?
22. configurar Automação não concede qualquer Integração?
23. IA respeita Permissões?
24. IA como ação preserva origem e revisão?
25. LGPD e consentimento foram avaliados?
26. observabilidade foi definida?
27. custos foram mapeados por dimensão?
28. limites instáveis não viraram regra permanente?
29. lock-in foi avaliado?
30. existe plano conceitual de substituição?
31. o modelo interno continua independente do fornecedor?
32. a integração não criou segunda fonte de verdade?
33. o MVP não tenta implementar todas as integrações?
34. nenhum segredo foi tratado como dado comum?
35. referências visuais não viraram especificação de layout?
36. conflitos documentais foram registrados?

Se qualquer resposta for “não”, revise.

---

# 43. Formato obrigatório de saída

SEMPRE gere a saída com estes títulos, nesta ordem:

```text
# Mapeamento de Integrações Externas — [produto ou escopo]

## 1. Escopo
[O que está sendo mapeado.]

## 2. Fontes consultadas
[Visão, MVP, Regras, Permissões, Modelagem e decisões.]

## 3. Princípios protegidos
[Princípios que não podem ser quebrados.]

## 4. Inventário de integrações
[WhatsApp, Meta, e-mail, telefonia e outras.]

## 5. Priorização
[P0, P1, P2 ou Pesquisa, com justificativa.]

## 6. Mapa por integração
[Aplicar o template obrigatório completo.]

## 7. Fluxos de entrada
[Como dados e eventos entram.]

## 8. Fluxos de saída
[Como ações saem.]

## 9. Relação com Formulário, Database e Pipe
[Como entradas externas alimentam o fluxo interno.]

## 10. Relação com Automações e IA
[Gatilhos, ações, revisão e resultados.]

## 11. Eventos e referências externas
[Eventos, identidades e contexto.]

## 12. Falhas, duplicidade e reconciliação
[Comportamentos necessários.]

## 13. Histórico, Logs e rastreabilidade
[O que aparece para operação e o que permanece detalhado.]

## 14. Permissões
[Quem configura, usa, aprova e visualiza.]

## 15. Segurança, LGPD e consentimento
[Riscos e decisões.]

## 16. Observabilidade
[Como detectar saúde e falhas silenciosas.]

## 17. Custos, limites e quotas
[Dimensões e riscos.]

## 18. Dependência de fornecedor
[Lock-in e substituição.]

## 19. Matriz de provedores
[Quando houver alternativas.]

## 20. Decisão recomendada para o MVP
[Uma integração concreta e o valor que valida.]

## 21. Conflitos e decisões pendentes
[Somente conflitos e dúvidas reais.]

## 22. Fora deste documento
[Código, endpoints, filas, infraestrutura, schemas físicos, layout e implementação.]
```

Não gere:

- código;
- endpoint;
- payload definitivo;
- tabela física;
- fila;
- worker;
- deployment;
- segredo;
- credencial;
- layout.

---

# 44. Validação final obrigatória

Antes de considerar o mapeamento aprovado, responda:

1. WhatsApp foi mapeado como canal e não como fornecedor único?
2. Meta foi separado por casos de uso reais?
3. e-mail preserva Conversa, Mensagem e participantes?
4. telefonia foi modelada com ciclo próprio?
5. Contato continua sendo identidade humana?
6. Conversa continua independente do Card?
7. Form Builder continua capacidade interna e não integração?
8. entrada externa pode alimentar o fluxo Formulário/Submissão → Database → Pipe?
9. criação de Registro e Card relacionados preserva contexto?
10. falha parcial de criação permanece visível?
11. Fases, tarefas e responsáveis continuam capacidades internas?
12. integração não redefine silenciosamente a configuração da Fase?
13. eventos externos podem ser gatilhos de Automação quando aprovados?
14. ações externas podem ser ações de Automação quando aprovadas?
15. Automação segue Quando → Condições → Então?
16. Execução de Automação está separada da Ação Externa?
17. estado desconhecido da Ação Externa não vira sucesso?
18. Execução dependente de resultado externo não é concluída prematuramente?
19. Histórico do Card pode resumir ações externas?
20. Log detalhado permanece separado do Histórico?
21. IA pode ser ação de Automação?
22. Sugestão de IA está separada de envio externo?
23. revisão humana permanece rastreável?
24. o núcleo não copiou payloads de fornecedores?
25. cada Referência Externa possui contexto da Integração?
26. eventos duplicados não geram efeitos duplicados?
27. retry não cria Card, Registro ou envio duplicado?
28. eventos fora de ordem foram considerados?
29. falha silenciosa possui observabilidade?
30. Permissões separam configurar, usar, aprovar e visualizar?
31. configurar Automação não concede qualquer Integração?
32. IA não amplia acesso?
33. LGPD e consentimento foram avaliados?
34. gravação e transcrição não foram assumidas automaticamente?
35. custos foram mapeados por dimensão?
36. limites instáveis não viraram regra permanente?
37. lock-in foi avaliado?
38. existe integração concreta recomendada para o MVP?
39. as outras integrações podem permanecer mapeadas sem serem implementadas?
40. referências visuais foram usadas apenas para identificar necessidades de estado e contexto?
41. alguma decisão técnica ou visual invadiu o documento?
42. existe conflito documental não resolvido?

Se qualquer resposta indicar falha, conflito ou acoplamento indevido, revise antes de aprovar.

---

# 45. Princípio final

Sempre prefira:

**capacidade de negócio estável + adaptação por fornecedor + contexto preservado + Automação rastreável + falha visível**

em vez de:

**núcleo preso ao payload de uma API externa.**

As perguntas finais são:

**“Se trocarmos o fornecedor de WhatsApp, e-mail ou telefonia amanhã, o Giraffe CRM continua entendendo Contatos, Conversas, Mensagens, Cards e Histórico da mesma forma?”**

**“Se um evento externo criar um Registro e um Card, conseguimos saber de onde veio, o que foi criado e qual parte falhou?”**

**“Se uma Automação executar uma ação externa, conseguimos distinguir o que foi solicitado, o que foi aceito e o que realmente foi concluído?”**

**“Se a IA participar do fluxo, conseguimos separar sugestão, revisão humana e ação externa?”**

Se as respostas forem sim, o mapeamento preserva a flexibilidade do produto.
