# Referências Visuais — Giraffe CRM

**Status:** Aprovado para consolidação da Fase 1  
**Fase do projeto:** 1. Preparar documentação base  
**Pasta:** `docs/01-documentacao-base/08-referencias-visuais/`

---

## 1. Objetivo desta pasta

Esta pasta organiza as referências visuais oficiais do Giraffe CRM.

Ela existe para garantir que:

- decisões visuais não fiquem espalhadas;
- screenshots não sejam confundidas com especificações;
- protótipos não substituam decisões aprovadas;
- futuras telas mantenham consistência;
- IA e pessoas saibam qual fonte consultar;
- referências externas sejam usadas como inspiração e não como cópia.

A regra central é:

> **Markdown decide → HTML demonstra → Screenshots inspiram.**

---

## 2. Fonte de verdade

A fonte oficial da direção visual do produto é:

```text
visual-direction.md
```

Esse arquivo define:

- norte visual;
- personalidade;
- paleta;
- tipografia;
- espaçamento;
- geometria;
- hierarquia;
- uso do laranja;
- estados;
- responsividade;
- direção por área do produto.

Quando houver dúvida visual, consulte primeiro:

```text
visual-direction.md
```

---

## 3. Hierarquia das referências

Use esta ordem:

```text
1. visual-direction.md
        ↓
2. Design System aprovado
        ↓
3. Protótipo HTML aprovado
        ↓
4. Screenshot com nota de referência
        ↓
5. Screenshot sem nota
        ↓
6. Sugestão externa
```

### Regra

Uma fonte inferior não substitui silenciosamente uma fonte superior.

Se uma nova referência sugerir algo melhor:

1. identificar a diferença;
2. comparar com a direção oficial;
3. propor a mudança;
4. aprovar explicitamente;
5. atualizar o documento oficial;
6. só então tratar a nova decisão como padrão.

---

## 4. Estrutura da pasta

```text
08-referencias-visuais/
├── README.md
├── visual-direction.md
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

Novas áreas podem ser adicionadas quando houver decisão aprovada.

Não crie pasta para cada tela pequena sem necessidade.

---

## 5. Papel de cada tipo de arquivo

### 5.1 `visual-direction.md`

É a fonte oficial.

Responde:

> **“Como o Giraffe CRM deve parecer?”**

Pode definir:

- princípios;
- hierarquia;
- comportamento visual;
- direção por área;
- estados;
- responsividade.

Não deve conter:

- código de produção;
- framework;
- biblioteca;
- implementação frontend.

---

### 5.2 `README.md`

É o manual de uso desta pasta.

Responde:

> **“Como interpretar, organizar e usar as referências visuais?”**

Não substitui o `visual-direction.md`.

---

### 5.3 Screenshots

Servem para:

- inspiração;
- comparação;
- estudo de padrões;
- compreensão de interação;
- registro de uma referência visual.

Screenshots não são especificações finais.

Uma screenshot pode inspirar:

- composição;
- hierarquia;
- densidade;
- comportamento.

Ela não autoriza automaticamente copiar:

- marca;
- identidade;
- textos;
- ícones;
- componentes;
- cores;
- dimensões exatas.

---

### 5.4 Notas `.md` de screenshots

Servem para registrar:

- o que aproveitar;
- o que adaptar;
- o que não copiar;
- qual decisão do Giraffe CRM a referência ajuda a explicar.

Sempre que uma screenshot for importante para uma decisão, crie uma nota `.md`.

---

### 5.5 Protótipos HTML

Servem para demonstrar:

- composição;
- hierarquia;
- fluxo visual;
- comportamento esperado;
- responsividade conceitual.

Os protótipos HTML:

- não são frontend de produção;
- não escolhem arquitetura;
- não escolhem framework;
- não definem API;
- não definem banco;
- não implementam regras de negócio reais.

### Regra

HTML demonstra.

Ele não decide.

---

## 6. Regra de uso de screenshots

Antes de usar uma screenshot como referência, perguntar:

1. qual problema visual ela ajuda a resolver?
2. o que exatamente deve ser aproveitado?
3. o que precisa ser adaptado?
4. o que não pode ser copiado?
5. a referência entra em conflito com `visual-direction.md`?
6. existe outra referência já aprovada para a mesma área?

Não salve screenshots sem contexto quando elas forem importantes.

---

## 7. Formato recomendado para notas de referência

Exemplo:

```md
# Referência — Form Builder

## Objetivo da referência

[Por que esta imagem foi salva.]

## Aproveitar

- biblioteca de campos;
- construção visual;
- drag-and-drop;
- organização por seções.

## Adaptar

- identidade Giraffe CRM;
- base neutra;
- #FF7200 estratégico;
- Destino dos Dados;
- página completa.

## Não copiar

- marca;
- azul predominante;
- textos;
- ícones proprietários;
- dimensões exatas;
- componentes exatos.

## Decisões relacionadas

- visual-direction.md → Form Builder
- Formulário → Database → Pipe
```

---

## 8. Convenção de nomes

Usar nomes:

- claros;
- descritivos;
- em `kebab-case`;
- sem nomes genéricos como `print1.png`.

### Bom

```text
form-builder-reference-01.png
card-details-reference-01.png
automation-list-reference-01.png
automation-editor-reference-01.png
```

### Evitar

```text
print.png
tela2.png
imagem-final-final.png
captura123.png
```

---

## 9. Organização das referências atuais

### Forms

```text
screenshots/forms/
```

Usar para referências de:

- biblioteca de campos;
- Form Builder;
- preview;
- publicação;
- seções;
- Destino dos Dados.

---

### Card

```text
screenshots/card/
```

Usar para referências de:

- informações gerais;
- Fase atual;
- tarefas;
- responsáveis;
- Histórico;
- ações.

---

### Automations

```text
screenshots/automations/
```

Usar para referências de:

- lista de Automações;
- editor;
- Quando → Condições → Então;
- estado;
- última execução;
- resultado;
- Logs.

---

### Dashboard

```text
screenshots/dashboard/
```

Usar para referências de:

- itens que exigem atenção;
- indicadores operacionais;
- prioridades;
- alertas.

---

### Pipe

```text
screenshots/pipe/
```

Usar para referências de:

- Kanban;
- Fases;
- Cards;
- movimentação;
- densidade.

---

### Database

```text
screenshots/database/
```

Usar para referências de:

- tabela;
- lista;
- campos;
- filtros;
- relacionamentos;
- painéis laterais.

---

### Conversations

```text
screenshots/conversations/
```

Usar para referências de:

- lista de Conversas;
- Mensagens;
- canais;
- Notas Internas;
- Follow-ups.

---

### Arquivos como capacidade contextual

Referências relacionadas a Arquivos devem ser classificadas conforme o contexto visual principal.

Exemplos:

- arquivo dentro de Registro → `database/`;
- arquivo dentro de Card → `card/`;
- upload em Formulário → `forms/`;
- anexo de Conversa → `conversations/`.

Não crie uma pasta `files/` apenas porque existe um arquivo na interface.

---

### AI

```text
screenshots/ai/
```

Usar para referências de:

- Sugestão;
- revisão;
- edição humana;
- aprovação;
- descarte.

---

### Integrations

```text
screenshots/integrations/
```

Usar para referências de:

- conexão;
- estado;
- falha;
- desconexão;
- reautorização.

---

### Settings

```text
screenshots/settings/
```

Usar para referências de:

- configurações do produto;
- preferências de usuário;
- permissões visuais;
- ajustes administrativos.

---

### Mobile

```text
screenshots/mobile/
```

Usar para referências de:

- Card;
- tarefas;
- Histórico;
- Formulário público;
- IA;
- ações principais.

---

## 10. Protótipos prioritários da Fase 1

Os protótipos prioritários são:

```text
prototypes/
├── form-builder.html
├── card-view.html
├── automations.html
└── mobile.html
```

### `form-builder.html`

Deve demonstrar:

- biblioteca de campos;
- Canvas;
- painel de configuração;
- Destino dos Dados;
- Preview;
- Publicar.

---

### `card-view.html`

Deve demonstrar:

- contexto;
- Fase atual;
- tarefas;
- responsáveis;
- Histórico;
- ações.

---

### `automations.html`

Deve demonstrar:

- lista de Automações;
- estado;
- última execução;
- resultado;
- Logs;
- Quando → Condições → Então.

---

### `mobile.html`

Deve demonstrar pelo menos:

- Card no celular;
- tarefas da Fase;
- responsável;
- Histórico essencial;
- Sugestão de IA;
- Formulário público.

---

## 11. O que não precisa ser criado na Fase 1

Não é obrigatório criar agora:

- frontend real;
- Design System final;
- biblioteca completa de componentes;
- protótipo navegável de todo o sistema;
- todas as telas;
- todas as variantes;
- dashboard final;
- Pipe final;
- Database final;
- Conversas final.

Esses itens serão aprofundados principalmente em:

```text
BMAD
└── UX
```

---

## 12. Relação com BMAD UX

A Fase 1 define:

- direção;
- referências;
- princípios;
- exemplos;
- protótipos críticos.

O BMAD UX aprofundará:

- arquitetura de informação;
- jornadas;
- fluxos;
- wireframes;
- estados;
- responsividade;
- Design System.

### Regra

BMAD UX evolui a direção aprovada.

Ele não reinicia o visual do zero.

---

## 13. Relação com Design System

O Design System será criado depois que os principais fluxos forem compreendidos.

Estrutura futura recomendada:

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

### `MASTER.md`

Deve definir:

- cores;
- tipografia;
- spacing;
- radius;
- botões;
- inputs;
- estados;
- acessibilidade.

### `areas/`

Cada arquivo contém somente diferenças necessárias daquela área.

---

## 14. Relação com UI UX Pro Max

A UI UX Pro Max pode:

- pesquisar padrões;
- comparar alternativas;
- revisar UX;
- sugerir componentes;
- verificar responsividade;
- identificar anti-patterns.

Ela não decide a identidade do produto.

### Fluxo correto

```text
Direção oficial
        ↓
Problema de UX
        ↓
UI UX Pro Max sugere opções
        ↓
Comparação
        ↓
Aprovação explícita
        ↓
Atualização da fonte oficial
```

---

## 15. Regra de não copiar

É permitido aproveitar:

- padrões;
- hierarquia;
- densidade;
- comportamento;
- lógica de interação.

Não é permitido tratar a referência como instrução para copiar:

- marca;
- identidade visual;
- textos;
- ícones proprietários;
- componentes exatos;
- dimensões exatas;
- combinação visual completa.

### Regra

O objetivo é:

> **aprender com a referência e transformar em Giraffe CRM.**

---

## 16. Conflitos

Quando uma referência entrar em conflito com uma decisão aprovada:

1. não substituir silenciosamente;
2. registrar a contradição;
3. indicar a fonte oficial atual;
4. propor alternativas;
5. decidir explicitamente;
6. atualizar o documento correto.

---

## 17. Checklist antes de adicionar uma referência

Antes de adicionar uma nova screenshot ou protótipo:

- [ ] a área correta está identificada?
- [ ] o arquivo possui nome claro?
- [ ] a referência tem objetivo?
- [ ] está claro o que aproveitar?
- [ ] está claro o que não copiar?
- [ ] ela respeita `visual-direction.md`?
- [ ] existe conflito com outra decisão?
- [ ] uma nota `.md` é necessária?

---

## 18. Checklist antes de aprovar um protótipo

- [ ] respeita o norte visual?
- [ ] usa `#FF7200` com moderação?
- [ ] mantém base neutra?
- [ ] diferencia estado atual e Histórico?
- [ ] mostra falhas e incerteza quando necessário?
- [ ] respeita Formulário, Database e Pipe como conceitos diferentes?
- [ ] evita copiar identidade externa?
- [ ] funciona conceitualmente em telas menores?
- [ ] não introduz regra de negócio nova?
- [ ] não introduz decisão técnica de arquitetura?

---

## 19. Princípio final

Sempre usar esta lógica:

```text
DECISÃO
→ visual-direction.md

DEMONSTRAÇÃO
→ prototype.html

INSPIRAÇÃO
→ screenshot.png
```

A pergunta final é:

> **“Estamos usando esta referência para aprender ou para copiar?”**

Se for para aprender, ela está no lugar correto.

Se for para copiar, ela precisa ser revista.
