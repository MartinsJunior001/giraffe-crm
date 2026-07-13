# Direção Visual — Giraffe CRM

**Status:** Aprovado para consolidação da Fase 1  
**Fase do projeto:** 1. Preparar documentação base  
**Documento:** Fonte oficial da direção visual do produto  
**Versão:** 1.0

---

## 1. Objetivo

Este documento define como o Giraffe CRM deve parecer e se comportar visualmente.

Ele é a fonte oficial para orientar:

- Dashboard;
- Pipes;
- Cards;
- Databases;
- Formulários;
- Automações;
- Logs;
- Conversas;
- Arquivos como capacidade contextual;
- IA;
- Integrações;
- responsividade.

A direção visual deve permitir que o produto seja:

- claro;
- produtivo;
- profissional;
- moderno;
- confiável;
- consistente;
- simples na superfície;
- poderoso por baixo.

---

## 2. Norte visual

A frase central da identidade visual do Giraffe CRM é:

> **Muito poder por baixo, pouca distração por cima.**

Isso significa que a interface pode sustentar processos complexos sem parecer complicada.

A experiência deve transmitir:

- controle;
- organização;
- agilidade;
- confiança;
- clareza;
- previsibilidade.

A interface não deve depender de:

- excesso de cor;
- sombras fortes;
- gradientes decorativos;
- animações chamativas;
- Cards coloridos sem função;
- aparência exageradamente futurista;
- excesso de elementos “de IA”.

---

## 3. Personalidade visual

### Deve parecer

- clean;
- profissional;
- moderna;
- direta;
- organizada;
- confiável;
- produtiva;
- leve sem parecer vazia;
- amigável sem parecer infantil.

### Não deve parecer

- ERP antigo;
- dashboard genérico de template;
- interface de jogo;
- produto infantil;
- sistema excessivamente colorido;
- painel cheio de gradientes;
- produto de IA com neon;
- cópia de outro sistema.

---

## 4. Princípio de uso das referências

As referências externas servem para aprender:

- composição;
- hierarquia;
- densidade;
- comportamento;
- organização;
- padrões de interação.

Elas não devem ser copiadas literalmente.

### Regra central

> **Markdown decide → HTML demonstra → Screenshots inspiram.**

A ordem de confiança visual é:

```text
visual-direction.md
        ↓
Design System aprovado
        ↓
Protótipo HTML aprovado
        ↓
Screenshot de referência
        ↓
Sugestão externa
```

Quando existir conflito entre uma referência externa e este documento, este documento permanece como fonte de verdade até uma revisão explícita ser aprovada.

---

## 5. Referências visuais aprovadas

### 5.1 Sistema visual neutro e editorial

Aproveitar:

- branco, preto e cinzas como base;
- poucas sombras;
- bordas discretas;
- densidade alta sem bagunça;
- ritmo de 8px;
- cor reservada para momentos importantes;
- superfícies planas;
- hierarquia tipográfica clara.

Não copiar:

- identidade de outra marca;
- fontes proprietárias;
- estrutura de e-commerce;
- componentes específicos de varejo;
- preto como CTA principal universal.

---

### 5.2 Airbnb

Aproveitar:

- suavidade;
- clareza;
- superfícies claras;
- hierarquia simples;
- boa legibilidade.

Não copiar:

- excesso de espaçamento;
- estrutura de marketplace;
- dependência de fotografia;
- pills em excesso.

---

### 5.3 Linear

Aproveitar:

- clareza;
- densidade;
- foco;
- estados bem definidos;
- sensação de produto rápido.

Não copiar:

- identidade escura como padrão;
- excesso de minimalismo;
- linguagem visual proprietária.

---

### 5.4 Airtable e Attio

Aproveitar:

- visualização de dados estruturados;
- tabelas densas;
- relacionamentos;
- painéis laterais;
- edição contextual.

Não copiar:

- estrutura exata;
- identidade;
- terminologia;
- comportamentos que entrem em conflito com Pipe e Database.

---

## 6. Princípio de cor

A interface deve seguir aproximadamente:

> **85–90% neutros + 10–15% identidade e estados.**

O laranja orienta.

Ele não domina.

### Regra

Se muitos elementos laranja aparecem ao mesmo tempo, nenhum deles parece prioritário.

---

## 7. Paleta visual oficial

### 7.1 Neutros

#### Canvas

`#FFFFFF`

Uso:

- fundo principal;
- superfícies principais;
- conteúdo.

#### Surface Soft

`#FAFAFA`

Uso:

- áreas secundárias;
- blocos sutis;
- alternância leve.

#### Soft Cloud

`#F5F5F5`

Uso:

- fundos de controles;
- áreas de apoio;
- containers leves;
- estados neutros.

#### Hairline

`#E5E5E5`

Uso:

- bordas;
- divisores;
- separação estrutural.

#### Ink

`#111111`

Uso:

- texto principal;
- ícones fortes;
- texto sobre laranja;
- ações secundárias fortes.

#### Charcoal

`#39393B`

Uso:

- texto de apoio;
- ícones secundários.

#### Mute

`#707072`

Uso:

- metadados;
- texto secundário;
- descrições.

#### Stone

`#9E9EA0`

Uso:

- baixa prioridade;
- estados inativos.

---

### 7.2 Laranja Giraffe

#### Primary Orange

`#FF7200`

Uso:

- botão primário;
- ação principal;
- item selecionado;
- foco;
- identidade;
- aprovação humana importante;
- conexão visual de fluxo.

#### Texto sobre o laranja

`#111111`

### Regra

Não usar branco como texto padrão sobre `#FF7200`.

---

#### Orange Hover

`#F26A00`

#### Orange Pressed

`#CC5B00`

#### Orange Soft

`#FFF3E8`

#### Orange Border

`#FFD0A8`

#### Orange Focus

`#FFB066`

---

## 8. Cores semânticas

O laranja não representa todos os estados.

### Erro

`#D92D20`

Uso:

- falha;
- erro;
- ação destrutiva.

### Sucesso

`#157A52`

Uso:

- concluído;
- ação confirmada;
- integração saudável.

### Informação

`#2563EB`

Uso:

- informação;
- estado informativo.

### Atenção

`#A15C00`

Uso:

- risco;
- atraso;
- atenção operacional.

### Regra

Não usar `#FF7200` para:

- erro;
- sucesso;
- falha;
- indisponibilidade;
- alerta;
- integração com problema;
- Automação com problema.

---

## 9. Tipografia

### Fonte principal

**Inter**

Motivos:

- alta legibilidade;
- boa densidade;
- boa leitura em tabelas;
- boa leitura em telas pequenas;
- variedade de pesos.

### Hierarquia

#### Título de página

24–28px  
Peso 600–700

#### Título de seção

18–20px  
Peso 600

#### Título de Card

14–16px  
Peso 500–600

#### Texto principal

14px  
Peso 400

#### Texto de interface

13–14px  
Peso 400–500

#### Metadado

12–13px  
Peso 400–500

#### Números operacionais

24–32px  
Peso 600–700

### Regra

O produto não deve depender de títulos gigantes para criar hierarquia.

Produtividade vem antes do efeito editorial.

---

## 10. Sistema de espaçamento

### Unidade base

8px

### Escala conceitual

- 4px — microajuste;
- 8px — relação direta;
- 12px — componente compacto;
- 16px — componente padrão;
- 24px — bloco;
- 32px — seção interna;
- 48px — grande separação.

### Regra

Espaço deve criar organização.

Não usar espaço vazio apenas para parecer premium.

---

## 11. Densidade

A densidade padrão deve ser:

> **Equilibrada para alta produtividade.**

O produto precisa acomodar:

- Clientes;
- Cards;
- Registros;
- Fases;
- tarefas;
- responsáveis;
- Arquivos relacionados;
- Conversas;
- Follow-ups;
- Automações;
- Logs;
- indicadores.

### Evitar

- padding excessivo;
- Cards gigantes;
- tabelas com linhas muito altas;
- espaço desperdiçado;
- informação demais ao mesmo tempo.

---

## 12. Formas e geometria

### Botões

Radius: 8px

### Inputs

Radius: 8px

### Cards

Radius: 10–12px

Tratamento:

- superfície limpa;
- borda leve;
- separação por espaço.

Evitar:

- sombra pesada;
- elevação exagerada.

### Modais e painéis

Radius: 12–16px

### Avatares

Circulares.

### Pills

Reservadas para:

- chips;
- filtros;
- tags;
- status.

Não usar pills como padrão para todos os botões.

---

## 13. Elevação e profundidade

A interface deve ser predominantemente plana.

### Nível 0

Sem sombra.

Uso:

- Cards;
- tabelas;
- seções.

### Nível 1

Borda de 1px.

Uso:

- separação;
- seleção;
- container.

### Nível 2

Sombra muito leve.

Uso:

- dropdown;
- popover;
- modal;
- elemento flutuante.

---

## 14. Hierarquia de botões

### 14.1 Primário

Visual:

- fundo `#FF7200`;
- texto `#111111`;
- radius 8px;
- peso 600.

Uso:

- criar;
- salvar;
- continuar;
- enviar;
- aprovar;
- conectar;
- publicar;
- ativar;
- concluir ação prioritária.

### Regra

Preferir uma ação primária clara por região visual.

---

### 14.2 Secundário

Visual:

- branco ou `#F5F5F5`;
- texto `#111111`;
- borda `#E5E5E5`.

Uso:

- editar;
- cancelar;
- filtrar;
- ações de apoio.

---

### 14.3 Terciário

Visual:

- sem fundo;
- texto `#39393B`.

Uso:

- ver detalhes;
- abrir;
- ações de menor prioridade.

---

### 14.4 Destrutivo

Usar vermelho semântico.

Nunca usar laranja para exclusão destrutiva.

---

## 15. Navegação principal

### Sidebar

Base:

- branca;
- ou cinza muito claro.

Item normal:

- texto escuro;
- ícone neutro.

Item ativo:

Opção A:

- fundo `#FFF3E8`;
- texto `#111111`;
- ícone laranja.

Opção B:

- fundo neutro;
- pequena barra lateral `#FF7200`.

### Regra

Não usar sidebar inteira laranja.

---

### Header

Preferir:

- branco;
- borda inferior leve;
- ações organizadas;
- CTA laranja somente quando necessário.

---

## 16. Dashboard

A pergunta central do Dashboard é:

> **O que precisa da minha atenção agora?**

### Ordem visual

1. atrasados;
2. Follow-ups;
3. itens sem atividade;
4. Automações com problema;
5. Integrações com atenção;
6. operação em andamento;
7. visão geral.

### Uso do laranja

Usar em:

- CTA principal;
- filtro ativo;
- seleção;
- identidade.

Não usar para todos os números.

---

## 17. Pipe

### Direção visual

- Cards neutros;
- Fases claras;
- alta legibilidade;
- pouca decoração.

### Card no Kanban deve priorizar

- identificação;
- responsável;
- prazo;
- estado;
- alertas.

### Uso do laranja

- Card selecionado;
- foco;
- criar Card;
- ação principal;
- indicador ativo.

### Não usar

- todos os Cards laranja;
- cada Fase com uma cor forte diferente.

---

## 18. Database

O Database deve parecer:

- estruturado;
- informacional;
- produtivo;
- diferente de Kanban.

Priorizar:

- tabela;
- lista;
- painel lateral;
- relacionamentos;
- filtros;
- campos.

### Uso do laranja

- célula ativa;
- linha selecionada;
- filtro ativo;
- criar Registro;
- foco.

---

# 19. Form Builder

## 19.1 Direção visual

O Form Builder deve parecer:

- configurável;
- claro;
- direto;
- produtivo;
- orientado a montagem.

A estrutura preferencial é:

```text
┌────────────────┬───────────────────────────┬──────────────────┐
│ CAMPOS         │ FORMULÁRIO                │ CONFIGURAÇÃO     │
│                │                           │                  │
│ Texto curto    │ Dados da empresa          │ Nome do campo    │
│ Texto longo    │                           │ Obrigatório      │
│ E-mail         │ [____________________]    │ Placeholder      │
│ Telefone       │                           │ Ajuda            │
│ Número         │ Materiais                 │                  │
│ Data           │ [ Enviar arquivos ]       │ DESTINO          │
│ Seleção        │                           │ Database         │
│ Arquivo        │                           │ Pipe             │
└────────────────┴───────────────────────────┴──────────────────┘
```

### Esquerda

Biblioteca de campos.

### Centro

Formulário em construção.

### Direita

Configuração do elemento selecionado.

---

## 19.2 Área de trabalho

Preferir:

- página completa;
- navegação clara;
- espaço para crescimento.

Evitar:

- modal gigante;
- configuração comprimida;
- rolagem lateral excessiva.

---

## 19.3 Biblioteca de campos

Deve permitir reconhecer rapidamente:

- texto curto;
- texto longo;
- e-mail;
- telefone;
- número;
- data;
- seleção;
- checkbox;
- Arquivo;
- seção;
- texto informativo.

Visual:

- lista compacta;
- ícones neutros;
- rótulos claros;
- hover discreto;
- seleção em laranja suave.

---

## 19.4 Canvas do Formulário

Deve permitir:

- leitura da estrutura;
- reordenação;
- seleção do campo;
- visualização de seções;
- estado vazio útil.

### Regra

O Canvas deve parecer Formulário.

Não deve parecer Database nem Kanban.

---

## 19.5 Painel de configuração

Pode mostrar:

- nome;
- orientação;
- obrigatoriedade;
- placeholder;
- opções;
- Destino dos Dados.

### Regra

O painel contextual deve reduzir a quantidade de modais.

---

## 19.6 Destino dos Dados

O usuário precisa entender:

```text
Formulário
    ↓
Database / Registro
    ↓
Pipe / Card
```

Usar:

- labels claras;
- seleção por recurso;
- resumo do fluxo;
- linguagem de negócio.

Evitar:

- payloads;
- schemas;
- aparência técnica.

---

## 19.7 Ações principais

Priorizar:

- Pré-visualizar;
- Salvar;
- Publicar.

`Publicar` pode ser ação primária quando o Formulário estiver pronto.

---

# 20. Visualização detalhada do Card

## 20.1 Objetivo

Permitir compreender:

- onde o processo está;
- o que precisa acontecer agora;
- quem é responsável;
- o que já aconteceu antes.

---

## 20.2 Estrutura preferencial

```text
┌──────────────────┬──────────────────────────┬──────────────────┐
│ CONTEXTO         │ EXECUÇÃO ATUAL           │ AÇÕES            │
│                  │                          │                  │
│ Informações      │ Fase atual               │ Mover Card       │
│ Arquivos         │                          │ Alterar resp.    │
│                  │ Tarefas                  │ Outras ações     │
│ Histórico        │ Campos da etapa          │                  │
└──────────────────┴──────────────────────────┴──────────────────┘
```

### Esquerda

- informações gerais;
- Arquivos relevantes;
- Histórico.

### Centro

- Fase atual;
- tarefas atuais;
- responsáveis;
- campos e dados da etapa.

### Direita

- mudança de Fase;
- ações rápidas;
- ações complementares.

### Regra

O estado atual tem maior prioridade visual.

O Histórico permanece visível ou facilmente acessível.

---

# 21. Tarefas por Fase

As tarefas devem parecer ligadas à Fase atual.

Exemplo:

```text
FASE ATUAL
Produção

TAREFAS

○ Criar arte
✓ Revisar conteúdo
○ Preparar versão final
```

### Estados

- pendente;
- em andamento, quando aplicável;
- concluída;
- reaberta, quando aplicável.

### Regra

Não depender apenas de cor.

Usar:

- ícone;
- label;
- texto;
- posição.

---

## Execução real

Exemplo:

```text
✓ Revisar briefing

Concluída por Martins
Hoje às 09:42
```

### Regra

Deve ficar claro:

```text
Tarefa configurada na Fase
        ≠
Execução real no Card
```

---

# 22. Responsáveis por Fase

A interface deve diferenciar:

```text
Responsável padrão da Fase
```

de:

```text
Responsável atual do Card
```

Exemplo:

```text
FASE: PRODUÇÃO

Equipe padrão
Design

RESPONSÁVEL ATUAL

Martins Junior
```

### Regra

Não mostrar os dois conceitos como se fossem o mesmo dado.

Pode usar:

- avatar;
- nome;
- equipe;
- label contextual.

---

# 23. Histórico do Card

## 23.1 Direção visual

O Histórico deve permitir leitura cronológica.

Exemplo:

```text
HISTÓRICO

● Card criado
  por Martins
  09:02

● Entrou em Produção
  por Junior
  09:15

● Tarefa concluída
  Revisar briefing
  09:42

● Arquivo adicionado
  identidade-visual.pdf
  10:03

● Automação executada
  Criar Card de Artes
  10:05
```

### Hierarquia

Cada evento destaca:

- ação principal;
- ator ou origem;
- momento;
- contexto relevante.

### Regra

Não transformar cada evento em Card grande.

Preferir:

- timeline;
- lista compacta;
- agrupamento cronológico.

---

## 23.2 Tipos de evento

Podem incluir:

- criação;
- mudança de Fase;
- tarefa;
- responsável;
- comentário;
- Arquivo;
- Automação;
- IA;
- ação externa.

### Regra

O Histórico deve permanecer visualmente consistente mesmo com tipos diferentes de evento.

---

## 23.3 Histórico e Log

O Histórico pode mostrar:

```text
“Automação executada”
```

O Log detalhado pode mostrar:

- gatilho;
- condições;
- ação;
- tentativas;
- resultado.

### Regra

Não despejar Log técnico no Histórico do Card.

---

# 24. Automações

## 24.1 Direção geral

O usuário deve entender:

```text
QUANDO
        ↓
CONDIÇÕES
        ↓
ENTÃO
```

---

## 24.2 Lista de Automações

Estrutura recomendada:

```text
Automações | Logs

┌──────────────────────────────────────────────────────┐
│ Follow-up de cliente parado               Ativa  ⋮  │
│                                                      │
│ QUANDO                     ENTÃO                     │
│ Card sem atividade    →    Pedir sugestão à IA      │
│                                                      │
│ Última execução: Hoje 09:32                          │
│ Resultado: Concluído                                 │
└──────────────────────────────────────────────────────┘
```

A lista deve mostrar:

- nome;
- gatilho;
- ação;
- estado;
- última execução;
- resultado recente;
- responsável pela última alteração quando aplicável.

---

## 24.3 Editor de Automação

```text
QUANDO

┌───────────────────────────┐
│ Card ficar sem atividade  │
└─────────────┬─────────────┘
              ↓

CONDIÇÕES

┌───────────────────────────┐
│ Processo ainda está ativo │
└─────────────┬─────────────┘
              ↓

ENTÃO

┌───────────────────────────┐
│ Pedir sugestão à IA       │
└───────────────────────────┘
```

### Regra

A conexão visual deve ajudar a leitura.

Não deve virar diagrama complexo no MVP.

---

## 24.4 Uso do laranja

Usar em:

- Nova Automação;
- ação principal;
- seleção;
- conector;
- foco.

Não usar em:

- todos os blocos;
- todos os estados;
- falhas.

---

## 24.5 Estados

A interface deve distinguir:

- ativa;
- pausada;
- com problema, quando aplicável.

Usar:

- texto;
- ícone ou label;
- cor semântica quando necessário.

---

# 25. Logs e resultados de Automação

## 25.1 Objetivo

Permitir responder:

- qual Automação executou;
- por que executou;
- o que tentou fazer;
- qual foi o resultado.

---

## 25.2 Estados mínimos

- concluído;
- não concluído;
- aguardando resultado;
- precisa de atenção.

### Regra

`Aguardando resultado` não deve parecer sucesso.

---

## 25.3 Visual do Log

Exemplo:

```text
AUTOMAÇÃO
Follow-up de cliente parado

GATILHO
Card ficou sem atividade

CONDIÇÕES
Processo ativo: Sim

AÇÃO
Solicitar sugestão à IA

RESULTADO
Concluído
```

Pode incluir timeline interna quando necessário.

### Regra

O Log deve parecer:

- operacional;
- legível;
- rastreável.

Não deve parecer:

- console técnico;
- terminal;
- dump de payload.

---

# 26. Conversas

A área de Conversas deve deixar claro:

- quem falou;
- em qual canal;
- quando;
- se exige resposta;
- se existe Follow-up;
- se é Mensagem Externa ou Nota Interna.

### Uso do laranja

- Conversa selecionada;
- envio principal;
- aprovação humana;
- foco.

### Não usar

- balões inteiros laranja;
- Nota Interna com o mesmo visual da Mensagem Externa.

---

# 27. IA

A IA deve parecer:

- assistiva;
- clara;
- revisável;
- controlada.

Ela não deve parecer:

- autônoma;
- mágica;
- misteriosa;
- futurista com neon.

### Estados visuais

- Sugestão gerada;
- aguardando revisão;
- editada pelo humano;
- aprovada;
- descartada;
- ação executada.

### IA em Automação

Quando aparecer:

```text
ENTÃO
Pedir sugestão à IA
```

deve ficar claro:

```text
IA solicitada
        ≠
Ação externa executada
```

---

# 28. Arquivos como capacidade contextual

Arquivos não possuem uma área principal independente no MVP.

Eles aparecem dentro dos contextos aos quais pertencem.

Não haverá File Manager independente, biblioteca global de arquivos, Google Drive interno, gerenciador de pastas ou área principal chamada "Files" no MVP.

Upload e download são capacidades do MVP.

Arquivos importantes não devem ficar presos apenas em Cards temporários. Quando necessário, devem estar relacionados ao contexto persistente apropriado.

A decisão técnica de armazenamento fica para Stack e Arquitetura.

## 28.1 No Database / Registro

Pode mostrar:

- nome;
- tipo;
- tamanho;
- origem;
- data;
- quem enviou;
- upload;
- download.

Exemplo conceitual:

```text
Registro: Cliente Giraffe Marketing

Informações
├── Nome
├── CNPJ
├── Telefone
├── Site
└── Arquivos
    ├── logo.png
    ├── contrato.pdf
    └── briefing.docx
```

## 28.2 No Card

Pode mostrar:

- arquivos relevantes ao processo;
- origem;
- relação com o Registro;
- upload;
- download.

## 28.3 No Formulário

Pode existir campo de upload.

Fluxo:

```text
Formulário
    ↓
Submissão
    ↓
Arquivo
    ↓
Registro relacionado
```

## 28.4 Em Conversas

Anexos podem aparecer relacionados à Mensagem e, quando necessário, também ao contexto persistente apropriado.

### Uso do laranja

- upload principal;
- item selecionado;
- ação prioritária.

---

# 29. Integrações

A interface deve mostrar claramente:

- ativa;
- desconectada;
- atenção necessária;
- ação pendente;
- resultado desconhecido;
- falha.

### Regra

O laranja não representa sozinho a saúde da Integração.

Usar estados semânticos.

---

# 30. Estados do sistema

Definir padrões para:

- loading;
- vazio;
- erro;
- sem permissão;
- desconectado;
- Integração com problema;
- Automação pausada;
- Automação com problema;
- ação pendente;
- resultado desconhecido;
- IA processando;
- IA aguardando revisão;
- item atrasado;
- item sem atividade.

### Regra

Estados não podem depender apenas de cor.

Usar também:

- texto;
- ícone;
- label;
- estrutura.

---

# 31. Responsividade

O Giraffe CRM é web responsivo.

Não é necessário aplicativo nativo no MVP.

## No celular, deve ser possível

- consultar Cliente;
- abrir Card;
- mover Card;
- visualizar tarefas da Fase;
- concluir tarefa;
- visualizar responsáveis;
- consultar Histórico essencial;
- visualizar arquivos no contexto do Registro ou Card;
- acompanhar Conversa;
- verificar pendências;
- revisar Sugestão de IA;
- aprovar Follow-up;
- preencher Formulário público;
- consultar resultado essencial de Automação.

## Pode permanecer prioritariamente desktop

- configurar Pipe;
- configurar Database;
- configurar Form Builder;
- criar ou editar Automação;
- gerenciar Permissões;
- configurar Integrações;
- administração complexa.

### Regra

Prioridade desktop não significa inutilizável fora do desktop.

---

# 32. Breakpoints conceituais

A direção não fixa framework.

### Desktop amplo

1440px+

- maior densidade;
- mais colunas;
- painéis simultâneos.

### Desktop

1024–1439px

- layout padrão.

### Tablet

768–1023px

- redução de colunas;
- painéis recolhíveis.

### Mobile

320–767px

- uma coluna;
- ações principais acessíveis;
- navegação adaptada;
- sem esconder contexto essencial.

---

# 33. Acessibilidade

Todo controle principal deve possuir área de toque adequada.

Direção mínima:

- 44px para ações principais em mobile;
- foco visível;
- contraste suficiente;
- informação não dependente apenas de cor.

### Regra

Acessibilidade faz parte da direção visual.

Não é ajuste final.

---

# 34. Do

- usar muito branco e neutros;
- usar laranja apenas onde há prioridade;
- manter texto quase preto;
- usar bordas leves;
- usar pouca sombra;
- manter densidade produtiva;
- usar Inter;
- usar 8px como ritmo-base;
- diferenciar Formulário de Database;
- diferenciar Pipe de Database;
- diferenciar configuração da Fase de execução do Card;
- diferenciar responsável padrão de responsável atual;
- manter Histórico acessível;
- mostrar última execução e resultado das Automações;
- diferenciar estados de IA;
- diferenciar Nota Interna de Mensagem Externa;
- mostrar falhas de Integração e Automação;
- adaptar a experiência ao celular.

---

# 35. Don't

- não pintar a sidebar inteira de laranja;
- não usar todos os botões em laranja;
- não usar branco como texto padrão sobre `#FF7200`;
- não usar laranja como erro;
- não usar laranja como sucesso;
- não usar gradiente decorativo;
- não usar sombra pesada;
- não usar pills em tudo;
- não usar radius exagerado;
- não transformar Dashboard em coleção de Cards coloridos;
- não transformar Database em outro Kanban;
- não transformar Form Builder em modal apertado;
- não esconder Histórico em navegação difícil;
- não misturar Log técnico com Histórico do Card;
- não tratar IA solicitada como ação concluída;
- não transformar Automação em diagrama complexo demais no MVP;
- não copiar identidade de referências.

---

# 36. Estrutura recomendada de Referências Visuais

```text
docs/
└── 01-documentacao-base/
    └── 08-referencias-visuais/
        ├── visual-direction.md
        ├── README.md
        ├── screenshots/
        │   ├── ai/
        │   ├── automations/
        │   ├── card/
        │   ├── conversations/
        │   ├── dashboard/
        │   ├── database/
        │   ├── forms/
        │   ├── integrations/
        │   ├── mobile/
        │   ├── pipe/
        │   └── settings/
        └── prototypes/
```

---

# 37. Estrutura futura do Design System

```text
design-system/
├── MASTER.md
└── areas/
    ├── dashboard.md
    ├── pipe.md
    ├── card.md
    ├── database.md
    ├── forms.md
    ├── automations.md
    ├── conversations.md
    ├── ai.md
    ├── integrations.md
    └── settings.md
```

### Regra

Uma área não cria novo sistema visual sem justificativa.

---

# 38. Validação final

Antes de aprovar uma nova decisão visual, verificar:

1. o Giraffe CRM continua predominantemente neutro?
2. `#FF7200` está sendo usado com moderação?
3. o botão primário usa texto `#111111`?
4. existem poucos CTAs primários simultâneos?
5. o laranja não substitui estados semânticos?
6. Dashboard mostra atenção sem virar painel colorido?
7. Pipe continua orientado a processo?
8. Database continua orientado a informação?
9. Form Builder parece configurável?
10. construção e configuração estão visualmente separadas?
11. Destino dos Dados é compreensível?
12. Card mostra estado atual e Histórico?
13. tarefas parecem ligadas à Fase?
14. responsável padrão e responsável atual estão separados?
15. Histórico é acessível sem dominar a tela?
16. Automação preserva Quando → Condições → Então?
17. lista de Automações mostra última execução e resultado?
18. Logs são compreensíveis para operação?
19. resultado desconhecido não parece sucesso?
20. Conversas continuam orientadas a comunicação?
21. IA parece assistiva e revisável?
22. IA em Automação não parece ação externa concluída?
23. Integrações mostram falha e desconexão?
24. celular mantém as ações principais?
25. referências foram usadas como inspiração e não cópia?

---

# 39. Princípio final

Sempre prefira:

> **Base neutra + hierarquia forte + densidade equilibrada + contexto visível + laranja estratégico**

em vez de:

> **Interface colorida em que tudo compete por atenção.**

As perguntas finais são:

**“Se retirarmos o laranja de todos os elementos não essenciais, a interface continua clara e o que sobra em laranja realmente indica prioridade?”**

**“O usuário consegue entender o que precisa fazer agora e o que já aconteceu antes?”**

**“Uma Automação parece simples de compreender sem esconder seu resultado?”**

**“Formulário, Database e Pipe parecem partes relacionadas do mesmo produto, mas com funções visuais distintas?”**

Se as respostas forem sim, a direção visual está preservando a identidade e a usabilidade do Giraffe CRM.
