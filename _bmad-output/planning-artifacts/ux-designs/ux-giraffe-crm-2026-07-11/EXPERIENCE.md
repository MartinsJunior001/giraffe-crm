---
title: "EXPERIENCE — Giraffe CRM · Fase 1"
status: final
created: 2026-07-11
updated: 2026-07-11
ui_system: "shadcn/ui + Radix + Tailwind (conforme stack do PRD)"
sources:
  - "PRD final: _bmad-output/planning-artifacts/prds/prd-giraffe-crm-2026-07-11/prd.md"
  - "docs/01-documentacao-base/"
  - "docs/01-documentacao-base/08-referencias-visuais/visual-direction.md"
design_ref: "./DESIGN.md"
---

# Fundação (Foundation)

- **Form-factor:** web responsivo (PRD; `visual-direction.md` §31). **Sem app nativo** no MVP. **Desktop-first para configuração**, **mobile para operação**.
- **UI system:** shadcn/ui + Radix + Tailwind (stack do PRD). O `DESIGN.md` é a referência de identidade visual; este documento especifica apenas o delta comportamental.
- **Norte de experiência** (`visual-direction.md` §2): *"Muito poder por baixo, pouca distração por cima."* — densidade produtiva, base neutra, laranja estratégico.
- **Limite estrutural herdado do PRD:** toda superfície respeita **isolamento por Organização** (NFR-3) e **permissões efetivas** (NFR-4). A visibilidade exata por papel depende de OQ-1..4 (`PENDENTE`) — a navegação **se adapta às permissões efetivas**, sem presumir aqui o mapa por papel.

### Capacidades confirmadas em mobile (`visual-direction.md` §31)
Consultar cliente, abrir/mover Card, ver e concluir tarefas da Fase, ver responsáveis, consultar Histórico essencial, ver arquivos no contexto, acompanhar comunicação, verificar pendências, revisar sugestão de IA, aprovar follow-up, consultar resultado essencial de Automação.

> **Condicional:** "preencher Formulário público" em mobile **não é capacidade confirmada** — depende da decisão sobre acesso externo (não autenticado) ao Formulário inicial (OQ-10, `PENDENTE`).

### Prioritariamente desktop
Configurar Pipe, Database e Form Builder; criar/editar Automação; gerenciar permissões; administração complexa. *(Prioridade desktop ≠ inutilizável fora do desktop.)*

# Arquitetura de Informação

Mapa de superfícies dos módulos do PRD Fase 1.

**Chrome global**
- **Sidebar** — navegação primária (operacional, dentro da Organização atual).
- **Topbar** — Busca Global, Notificações, Perfil/conta, contexto da Organização atual.

### Superfícies operacionais (sidebar)
| Superfície | FR | Sub-superfícies |
|---|---|---|
| Dashboard | FR-4, FR-5 | — |
| Pipes | FR-7, FR-8 | Pipe (Kanban) → **Card (detalhe)** (FR-9..13) |
| Databases | FR-18, FR-19 | Database (tabela) → **Registro (detalhe)** (FR-20) |
| Tarefas & Solicitações | FR-27, FR-28 | **mesma área, duas visões** (aba Tarefas · aba Solicitações) |
| E-mails | FR-24, FR-25 | lista/composição + Templates |
| Relatórios | FR-31 | — |

### Superfícies de chrome / contextuais (topbar)
| Superfície | FR | Onde |
|---|---|---|
| Busca Global | FR-6 | topbar (restrita à Organização atual) |
| Notificações | FR-29, FR-30 | topbar: badge + popover **e** página dedicada (INV-NOTIF-01) |
| Perfil | FR-32 | menu do usuário (topbar) |
| IA assistiva | FR-26 | **não é área** — aparece **no contexto**, sempre rotulada como IA (NFR-11). Os pontos de presença concretos da IA **não são fixados** nesta rodada (dependem dos casos de uso — OQ-30/OQ-31, `PENDENTE`). |

### Superfícies de configuração (desktop-first)
| Superfície | FR | Acesso | Observação |
|---|---|---|---|
| Configuração de Pipe / Fases | FR-7, FR-8 | contextual, a partir do Pipe | **Condicionada** às decisões de gerenciamento (criar/editar/reordenar/arquivar) e permissões ainda abertas (OQ-6, OQ-7, OQ-2) |
| Form Builder (3 contextos independentes) | FR-14..17 | a partir da config. de Pipe / Fase / Database | builder de página inteira (`visual-direction.md` §19) |
| **Automações + histórico de execuções** | FR-21..23 | **dentro de cada Pipe**, via configuração do Pipe | histórico de execuções fica **junto às Automações**; **não** se confunde com logs técnicos de observabilidade (NFR-6) |
| Painel Administrativo | FR-33 | área administrativa da própria Organização | ver ressalva abaixo |

> **Painel Administrativo — subseções condicionadas:** **membros**, **permissões** e **Auditoria** ainda **não são confirmadas como áreas operacionais completas** — ficam condicionadas às decisões do PRD (OQ-37 gerenciamento de membros; OQ-1..4 permissões; OQ-38/INV-AUDIT-01 Auditoria). Nesta etapa, são superfícies previstas, não operacionais fechadas.

### Fora da navegação da Fase 1
- **Super Admin** (FR-34) — referência de Plataforma, sem superfície operacional (PRD §5.3/§6.2).
- **Conversas (como módulo), área de Integrações, ações externas** — **referência visual futura**, não superfícies da Fase 1 (decisão desta sessão).

# Navegação

- **Sidebar** (`visual-direction.md` §15): fundo branco / cinza muito claro. Item ativo = **fundo `Orange Soft` + ícone laranja** *ou* **barra lateral `#FF7200`** (variante escolhida no `DESIGN.md`). **Nunca** sidebar inteira laranja.
- **Topbar:** branca, borda inferior leve; Busca Global à esquerda/centro; ações (Notificações, avatar) à direita; CTA laranja só quando necessário.
- **Contexto de Organização (multi-organização — resolvido pela Arquitetura, Forma B):** um usuário **pode participar de várias Organizações**. A **Organização atual está sempre visível** na topbar.
  - O **seletor de Organização aparece somente quando o usuário possui mais de uma Membership ativa**; com uma única Membership, nenhum seletor é exibido.
  - A **troca de Organização exige ação explícita** do usuário.
  - **Após a troca, navegação, dados, permissões e contexto refletem somente a nova Organização ativa** (isolamento por Organização — NFR-3; o contexto anterior é descartado).
  - *Rastreabilidade:* busca em múltiplas Organizações simultâneas permanece futuro (OQ-49); a participação multi-organização foi confirmada como Forma B na etapa de Arquitetura.

# Voz e Tom

- **Idioma:** pt-BR. Tom **profissional, direto e claro** — "amigável sem parecer infantil" (`visual-direction.md` §3).
- **Linguagem de negócio, não técnica:** no "Destino dos Dados" do formulário, falar em Database/Registro/Pipe/Card; **evitar** payload/schema (`visual-direction.md` §19.6).
- **IA sempre identificada** como gerada por IA; nunca apresentada como ação já executada (NFR-11/NFR-17).
- **Estados vazios úteis** — orientam a próxima ação, não telas em branco.
- **Erros e estados** com cor semântica + texto + ícone — **nunca só cor**, nunca laranja para erro (`visual-direction.md` §8, §30).

# Padrões de Estado

**Regra transversal:** nenhum estado depende **só de cor** — sempre cor semântica **+ texto + ícone + estrutura** (`visual-direction.md` §30).

### Estados de sistema
| Estado | Tratamento |
|---|---|
| Loading | skeleton/spinner; não bloquear a leitura do contexto essencial já disponível |
| Vazio | **estado vazio útil** — orienta a próxima ação, nunca tela em branco |
| Erro | `destructive #D92D20` + ícone + texto + ação de recuperação |
| Sem permissão | mensagem clara **sem revelar a existência** de recurso não autorizado (NFR-4, INV-REPORT-01) |
| Ação pendente | label explícito de pendência |
| Resultado desconhecido / aguardando | **não pode parecer sucesso** (`visual-direction.md` §25.2) |

### Estados de domínio (apenas os confirmados)
| Estado | Tratamento |
|---|---|
| Item atrasado | `warning #A15C00` + ícone + label (não só cor) |
| Item sem atividade | label (a **priorização/ordenação** desses itens é `PENDENTE` — ver abaixo) |
| Tarefa | **aberta · atrasada · concluída** (catálogo confirmado, RN-090) — ícone + label + posição (`visual-direction.md` §21). Mecanismo de "atrasada" (manual vs. derivado do prazo) é `PENDENTE`; estados adicionais em OQ-12. |
| Automação | indicador básico **ativa / inativa** (estados mais ricos são `PENDENTE` — ver abaixo) |
| IA | **conteúdo gerado · aguardando revisão · editado · aceito · descartado** — sempre rotulada como IA (§27; NFR-11). **Não há estado "ação executada" da IA**: qualquer efeito operacional ocorre **somente após confirmação explícita** (NFR-17). |

**Pendentes de Produto/UX (registrados, não presumidos):**
- Priorização/ordenação automática de itens (ex.: "sem atividade") no Dashboard — OQ-35.
- Estados de Tarefa além de pendente/concluída (ex.: "em andamento", "reaberta") — OQ-12.
- Estados de Automação "pausada" e "com problema" e o **catálogo completo de estados de execução** de Automação — OQ-11, OQ-24, OQ-25.

**Fora de escopo (referência futura):** estados de saúde de Integração (ativa/desconectada/falha) e "ação externa".

# Primitivas de Interação

- **Seleção** (Card, linha, célula): **não depende apenas do laranja** — combina fundo/borda (`primary`/`accent`) com **indicador estrutural, ícone ou atributo semântico** (ex.: `aria-selected`).
- **Foco:** anel `ring #CC5B00` sempre visível.
- **Hover:** discreto (§19.3).
- **Arrastar (drag-and-drop):** mover Card entre Fases no Kanban. *A primitiva existe; as **regras** de quem pode mover e restrições entre Fases são `PENDENTE` (OQ-15) — não presumidas.*
- **Painel lateral contextual:** edição em painel lateral (Card, Registro) para **reduzir modais** (§19.5).
- **Reordenação:** campos no Form Builder (§19.4); reordenação de Fases é `PENDENTE` (OQ-7).
- **Confirmação (diferenciada por natureza):**
  - **Destrutiva:** confirmação **proporcional ao risco** da ação.
  - **Sensível:** **reautenticação** quando definida por Produto e Segurança (NFR-33/NFR-38; mecanismo = Arquitetura).
  - **IA:** **revisão e confirmação antes** de qualquer efeito operacional (NFR-17) — "IA solicitada ≠ ação executada" (§27).

# Piso de Acessibilidade

**Conformidade-piso:** **WCAG 2.2 nível AA.**

- **Área de toque:** mínimo AA é 24×24 CSS px; **padrão interno reforçado de 44×44 px** para ações principais em mobile (melhora a operação por toque).
- **Navegação completa por teclado** em todos os fluxos.
- **Ordem de foco lógica**, coerente com a leitura visual.
- **Foco visível** em todo controle interativo.
- **Nome acessível** para controles apenas com ícone (`aria-label`/texto oculto).
- **Associação** entre label, instrução, mensagem de erro e o campo correspondente.
- **Modais com foco controlado** (focus trap) e **retorno ao elemento de origem** ao fechar.
- **Preferência por movimento reduzido** (`prefers-reduced-motion`) respeitada.
- **Mensagens dinâmicas anunciáveis** por tecnologia assistiva (`aria-live` para estados/resultados que mudam).
- **`aria-current`** no item de navegação ativo (definido no A2).
- Informação **nunca só por cor** (reforça Padrões de Estado).

**Verificação pendente (não é decisão de Produto):** validar o contraste do `ring #CC5B00` contra **todos** os fundos em que aparece (branco, `accent #FFF3E8`, `muted #F5F5F5`, superfícies de seleção) — o token não é considerado aprovado apenas pela aparência; requer verificação de contraste na implementação.

# Superfície: Login e Sessão (FR-1..3)

**Login**
- Campos: e-mail + senha; CTA primário **"Entrar"**.
- **Autenticação e sessão são reais** no MVP. A tecnologia (mecanismo de sessão, formato de token, duração) fica para Arquitetura — não definida aqui.
- **"Esqueci minha senha":** apenas **elemento condicional** — não apresentado como ação disponível até a resolução da OQ-48. O fluxo de recuperação não é desenhado nesta etapa.

**Estados de sessão**
- Erro de credenciais: `destructive` + texto claro, **sem revelar** se a conta existe.
- **Tentativas excessivas** (NFR-2): recebem **feedback seguro e passam a ser temporariamente limitadas, sem revelar a existência da conta**.
- **Sessão expirada:** solicitar nova autenticação.
- **Logout:** retornar ao Login.
- **Acesso a rota protegida sem sessão:** redirecionar ao Login.
- *Não se define, nesta etapa, duração da sessão nem bloqueio de conta.*

**Destino:** login bem-sucedido leva ao **Dashboard** (estado de entrada da UJ-2 do PRD: autenticado, no Dashboard).

# Superfície: Dashboard (FR-4, FR-5)

**Propósito** (`visual-direction.md` §16): dar uma **visão rápida da operação atual** — "o que precisa da minha atenção agora?". Não é painel colorido de vaidade.

**Capacidades confirmadas**
- **Catálogo/grade real de Pipes e Databases** da Organização atual.
- **Indicadores baseados em dados reais** (não fictícios — INV-ADMIN-02 como princípio de transparência).
- **Acesso ao recurso correspondente** a partir de cada item: o destino pode ser **Pipe, Card, Database ou outro recurso aprovado**.

**Restrições transversais**
- Restrito à **Organização atual** (NFR-3) e às **permissões efetivas** (NFR-4).
- **Zero legítimo ≠ falha:** "0 itens" deve ser distinguível de erro/carregamento (estados definidos em Padrões de Estado).
- **Uso do laranja:** CTA principal, filtro ativo, seleção — **não** em todos os números (§16).

**Área de atenção operacional**
- O Dashboard **pode reservar uma área de atenção operacional**, mas **conteúdo, critérios e ordenação dependem da OQ-35** (`PENDENTE`). Não fixo aqui blocos de itens em prioridade decrescente como comportamento confirmado.

**Topbar — Notificações (presença consistente)**
- A topbar apresenta o **badge + popover de Notificações**, com estado consistente (contagem/leitura) conforme **INV-NOTIF-01**. A superfície completa de Notificações **não é redesenhada aqui** — é tratada no B7.

**Distinção provisória (final na OQ-34):**
- **Dashboard** = visão rápida da operação atual.
- **Relatórios** = análise e exploração.

# Superfície: Pipe / Kanban (FR-7, FR-8)

- **Catálogo de Pipes** (FR-7) → abrir um Pipe exibe o **Kanban** (FR-8): colunas = **Fases**, Cards distribuídos nas Fases.
- **Pipe ≠ Database** — Kanban orientado a processo, não a tabela.

**Card no Kanban**
- **Identificação** é a base. **Responsável, prazo, estado e alertas** são **condicionais** — aparecem quando existem e conforme as decisões do módulo; **não** se exige todos em todo Card (`visual-direction.md` §17).
- Cards **neutros**; Fases claras; pouca decoração.
- **Uso do laranja:** Card selecionado, foco, ação principal, indicador ativo — não todos os Cards, não cor forte por Fase.

**Criar Card**
- O CTA "Criar Card" fica **condicionado à definição do fluxo de criação** — não presumo se será manual, por Formulário inicial (OQ-20) ou outro fluxo aprovado.

**Interação e permissões**
- **Arrastar Card entre Fases** existe **apenas para usuários autorizados** e tem **alternativa acessível por teclado/menu** ("Mover para outra Fase").
- A movimentação, quando ocorre, é **persistida** e registra **entrada no Histórico** (UJ-2 do PRD).
- **Somente leitura:** ações não permitidas ficam **ocultas ou claramente desabilitadas**, sem revelar opções administrativas indevidas (NFR-4).

**Pendências (registro, não presumidas):** papéis de Pipe (OQ-2); criar/editar/arquivar Pipe e gerenciar Fases (OQ-6, OQ-7); máquina de estados do Card e regras de movimentação (OQ-14, OQ-15); se a movimentação dispara Automação/Notificação (OQ-16).

# Superfície: Card (detalhe) (FR-9..13)

**Padrão de layout — três painéis** (`visual-direction.md` §20.2); o **centro (execução atual) tem a maior prioridade visual**; o Histórico permanece acessível.

| Esquerda — CONTEXTO | Centro — EXECUÇÃO ATUAL | Direita — AÇÕES |
|---|---|---|
| Informações gerais | Fase atual | (apenas ações aprovadas para o usuário) |
| Arquivos (condicional — OQ-47) | Tarefas da etapa | Mover Card (se autorizado) |
| Vínculo com Registro (só quando a capacidade estiver configurada) | Campos/dados da etapa | Outras ações aprovadas |
| Histórico | Responsáveis | |

- **Painel esquerdo:** **Arquivos** ficam **condicionados à aprovação das capacidades de arquivos/anexos (OQ-47)**; o **vínculo com Registro** só aparece **quando essa capacidade estiver configurada** (cardinalidade Card↔Registro é `PENDENTE`, OQ-18).
- **Painel direito:** exibe **somente ações aprovadas** para o usuário. **Não fixo "Alterar responsável"** enquanto papéis, atribuição e permissões estiverem pendentes (OQ-2, OQ-3).

**Distinções obrigatórias preservadas** (do's da `visual-direction.md`):
- **Configuração da Fase ≠ Execução no Card** (§21).
- **Responsável padrão da Fase ≠ Responsável atual do Card** — nunca o mesmo dado (§22).
- **Histórico ≠ Log técnico** (§23.3).
- **Card ≠ Registro**.

**Tarefas da etapa** (§21): catálogo confirmado **aberta · atrasada · concluída** (RN-090); mecanismo de "atrasada" (manual vs. derivado) `PENDENTE`; estados adicionais em OQ-12. Ícone + label + posição, não só cor. Execução real mostra ator + momento — ex.: *"Concluída por [usuário] em [data e hora]."*

**Histórico** (§23): **timeline cronológica** compacta. Eventos **confirmados**: **criação** e **mudança de Fase**; catálogo completo é `PENDENTE` (OQ-17). **Ator, origem e momento** aparecem **quando esses dados estiverem disponíveis e aprovados**. Não transformar cada evento em Card grande.

**Pendências (registro):** papéis de Card (OQ-3); persistência/edição dos campos do Formulário de Fase após saída da Fase (OQ-21); cardinalidade Card↔Registro (OQ-18).

### Padrão responsivo (Pipe e Card)
- **Desktop:** Contexto | Execução atual | Ações (três painéis).
- **Tablet:** execução principal + painel contextual recolhível.
- **Mobile:** seções empilhadas ou abas, com ações principais acessíveis.

# Superfície: Formulários / Form Builder (FR-14..17)

### Conceito central
Três **contextos independentes** (INV-FORM-01): **inicial do Pipe**, **de Fase**, **de Database**. Mesmo catálogo visual de campos, **estado de configuração independente** — alterar um contexto **não altera** os demais.

> **Contexto sempre visível:** o builder deixa **sempre claro qual contexto está sendo editado** (Pipe inicial · Fase · Database), evitando alterações no Formulário errado.

### Layout de três painéis (`visual-direction.md` §19.1) — página inteira, não modal (§19.2)

| CAMPOS (biblioteca) | FORMULÁRIO (canvas) | CONFIGURAÇÃO (do elemento) |
|---|---|---|
| Biblioteca de tipos de campo | Formulário em construção | Configuração do campo selecionado |

- **Esquerda — biblioteca de campos** (§19.3): lista compacta, ícones neutros, rótulos claros, seleção em laranja suave. *O conjunto sugerido (texto curto/longo, e-mail, telefone, número, data, seleção, checkbox, seção, texto informativo) é **direção**; o **catálogo oficial e a estrutura funcional do Campo** são `PENDENTE` (OQ-9). O tipo **"Arquivo"** é **condicional** (OQ-47).*
- **Centro — canvas** (§19.4): leitura da estrutura, **reordenação** de campos, seleção, seções, **estado vazio útil**. A reordenação **tem alternativa por teclado ou menu**, não depende apenas de arrastar. O canvas **parece Formulário**, não Database nem Kanban.
- **Direita — painel de configuração** (§19.5): nome e demais atributos. **Obrigatoriedade, placeholder, opções e validações** aparecem **somente quando aprovados e aplicáveis ao tipo de campo** (OQ-9). O painel contextual **reduz modais**.

### Destino dos Dados — por contexto (não fluxo fixo)
Em **linguagem de negócio**, não técnica (§19.6). O destino é mostrado **conforme o contexto**:
- **Formulário inicial** → contexto de entrada do Card, conforme **OQ-20**.
- **Formulário de Fase** → dados da execução do Card naquela Fase, conforme **OQ-21**.
- **Formulário de Database** → estrutura e dados de Registro, conforme **OQ-19**.

### Área de ações (ciclo não confirmado — reservada)
A área de ações do builder é **reservada**; o ciclo oficial **não é confirmado** nesta etapa. Permanecem `PENDENTE`:
- rascunho;
- salvar;
- pré-visualizar;
- publicar / despublicar;
- alterações após publicação.

### Pendências que não presumo (registro)
- Catálogo oficial de tipos de campo e estrutura funcional do Campo — **OQ-9**.
- Quem configura/visualiza/submete cada Formulário, e se o **Formulário inicial** pode ser acessado por **ator externo não autenticado** (formulário público) — **OQ-10**.
- Tipo de campo "Arquivo" — condicional à **OQ-47**.
- Comportamento de destino por contexto — **OQ-20** (inicial), **OQ-21** (Fase), **OQ-19** (Database).

### Padrão responsivo (builder desktop-first, `visual-direction.md` §31)
- **Desktop:** três painéis.
- **Tablet:** canvas com **painel alternável** (biblioteca **ou** configuração).
- **Mobile:** **edição limitada ou orientada**, **sem comprimir** os três painéis.
- **Preenchimento:** a experiência de preenchimento dos **Formulários aprovados** deve ser **responsiva**. **Acesso público sem autenticação permanece condicionado à OQ-10.**

# Superfície: Database / Registros (FR-18..20)

### Database (`visual-direction.md` §18)
- Deve parecer **estruturado, informacional, produtivo** — **diferente de Kanban**. **Database ≠ Pipe**; **não** transformar Database em outro Kanban.
- Prioriza: **tabela**, lista, **painel lateral**, relacionamentos, filtros, campos.
- **Catálogo de Databases** (FR-18) → abrir um Database exibe a **tabela de Registros** (FR-19).
- **Uso do laranja** (§18): célula ativa, linha selecionada, filtro ativo, "Criar Registro", foco — combinados com indicador estrutural/semântico (seleção não depende só de cor, do A3).
- **"Criar Registro"** fica **condicionado à OQ-19** (criação e ciclo de vida ainda não aprovados).

### Registro (detalhe) (FR-20)
- Abre em **painel lateral** que **garante a visualização** do Registro; a **edição** só aparece **quando essa operação for definida** (OQ-19).
- **Card ≠ Registro** — o Registro é o dado **persistente**. O **vínculo Card↔Registro** só aparece **quando configurado e autorizado**, **sem presumir cardinalidade** (OQ-18).
- **Arquivos no Registro** (§28.1) permanecem **condicionados à OQ-47** — incluindo **upload, download, permissões, retenção e exclusão**.

### Persistência
- **Persistência real de Registros é requisito confirmado** para o Database ser operacional (OQ-19). *Permanecem `PENDENTE`:* **criação, edição, exclusão, validação e ciclo de vida** do Registro (comportamento = Produto; mecanismo = Arquitetura).
- Origem via **Formulário de Database** → estrutura/dados de Registro (do B3, OQ-19).

### Interações e acessibilidade da tabela
- **Seleção** de linha/célula: fundo/borda + atributo semântico (`aria-selected`), não só laranja.
- **Navegação por teclado na tabela:** foco entre células/linhas, **seleção anunciável** (tecnologia assistiva) e **abertura do Registro sem depender do mouse**.
- **Filtros/ordenação:** a superfície reserva a área; o conjunto exato de filtros/ordenação/paginação e a navegabilidade uniforme dos Databases são `PENDENTE` (OQ-22).
- **Painel lateral** para leitura (e edição, quando definida) do Registro selecionado.

### Pendências que não presumo (registro)
- Criar/editar/arquivar Database pelo usuário — **OQ-8**.
- CRUD, validação e ciclo de vida do Registro (e o CTA "Criar Registro") — **OQ-19**.
- Cardinalidade Card↔Registro — **OQ-18**.
- Filtros/ordenação/paginação e navegabilidade uniforme — **OQ-22**.
- Arquivos no Registro (upload/download/permissões/retenção/exclusão) — condicional à **OQ-47**.

### Padrão responsivo
- **Desktop:** tabela + painel lateral; o layout **se adapta quando não houver largura suficiente, sem comprimir o conteúdo**.
- **Tablet:** tabela com painel lateral recolhível.
- **Mobile:** **lista responsiva de Registros, com resumo dos campos principais** (não tabela larga com rolagem lateral excessiva); Registro em tela/painel dedicado; ações principais acessíveis.

# Superfície: Automações + Execuções (FR-21..23)

### Localização e natureza (decisão do A1)
- Automações vivem **dentro de cada Pipe**, acessadas pela **configuração do Pipe** (desktop-first).
- O **histórico de execuções** fica **junto às Automações**. **Terminologia:** a aba visível chama-se **"Execuções"** (ou "Histórico de execuções") — **"logs" fica reservado à observabilidade técnica** (infra, NFR-6), que não é superfície de usuário.

### Modelo mental preservado (`visual-direction.md` §24.1)
```
QUANDO → CONDIÇÕES → ENTÃO
```
(Evento → Condição → Ação, com **ações internas** — sem requisição HTTP externa, coerente com o PRD.)

### Lista de Automações (§24.2) — aba "Automações" · aba "Execuções"
- Sempre: **nome** e **gatilho/ação** (leitura do que a Automação faz).
- **Condicionais** (exibir só quando realmente disponíveis e aprovados): **estado**, **última execução**, **resultado recente**, **responsável pela última alteração**.
- **CTA "Nova Automação"** e as ações de **criar/editar/ativar/excluir** ficam **condicionados à OQ-11**.

### Editor de Automação (§24.3)
- Três blocos: **Quando** · **Condições** · **Então**. Devem ser **compreensíveis sem depender apenas de setas, cor ou posição** — incluir **títulos**, **ordem lógica** e **navegação por teclado**. Não vira diagrama complexo no MVP.
- *O catálogo de Eventos, Condições e Ações e o comportamento das Condições é `PENDENTE` (OQ-24).*

### Estados (gerais aprovados — sem catálogo final de execução)
Não fixo um catálogo final de estados de execução. Uso apenas os **estados gerais já aprovados** (do A3):
- **carregando**;
- **vazio**;
- **erro**;
- **resultado disponível**;
- **resultado desconhecido ou aguardando** — **sem aparência de sucesso** (§25.2).

Automação: **ativa / inativa** confirmados; "pausada"/"com problema" e o catálogo completo de execução são `PENDENTE` (OQ-11, OQ-24/OQ-25).

### Histórico de execuções (§25) — operacional, não técnico
- Responde: qual Automação executou, por quê, o que tentou, qual o resultado.
- Visual **operacional, legível, rastreável** — **não** console/terminal/dump de payload (§25.3).
- **Nunca exibir** payloads técnicos, segredos, tokens, prompts completos ou dados pessoais desnecessários (NFR-1, NFR-16) — **apenas o contexto operacional necessário**.

### IA dentro da Automação (§27)
- O exemplo "**Então: pedir sugestão à IA**" aparece **apenas como exemplo condicional** até a resolução da **OQ-27**.
- Quando/se existir, deve ficar claro: **IA solicitada ≠ ação executada**; a sugestão exige **confirmação explícita** antes de qualquer efeito operacional (NFR-17).
- **IA auxiliando a criação de Automações** vs. **IA como Ação dentro de Automações** são pendências distintas (OQ-27) — não presumo nenhuma.

### Estados vazios distintos
- **Nenhuma Automação configurada.**
- **Nenhuma execução registrada.**
- **Usuário sem permissão** (sem revelar recursos não autorizados — NFR-4).
- **Falha ao carregar.**

### Uso do laranja (§24.4)
Nova Automação, ação principal, seleção, conector, foco — **não** em todos os blocos, não em todos os estados, **não** em falhas (falha usa semântica).

### Pendências que não presumo (registro)
- Catálogo de Eventos/Condições/Ações e comportamento das Condições — **OQ-24**.
- Comportamentos esperados do motor (Produto); implementação/validação = Arquitetura/Stories/QA — **OQ-25**. *Automações seedadas ≠ motor validado.*
- Ciclo de vida (criar/editar/ativar/desativar/duplicar/arquivar/excluir) e "editar parcial" do Membro — **OQ-11**.
- Referência Ação↔Template e prevenção de ciclos (Arquitetura) — **OQ-26**.
- IA na Automação — **OQ-27**.

### Padrão responsivo
- **Desktop:** lista + editor (configuração é prioritariamente desktop, §31).
- **Tablet:** lista e editor em navegação sequencial.
- **Mobile:** **consulta** de Automações e **resultado essencial** de execução acessíveis; **criação/edição** permanece prioritariamente desktop.

# Superfície: E-mails/Templates + IA básica (FR-24, FR-25, FR-26)

> Escopo: uso a `visual-direction.md` §26 (Conversas) **apenas como referência visual** para E-mails — **não** importo conceitos de Conversas (canais, Nota Interna × Mensagem Externa, threads), que são módulo fora da Fase 1.

## E-mails e Templates (FR-24, FR-25)

**Natureza:** apoio operacional de **composição** de e-mail e **aplicação de Template**. Enquanto a **OQ-28** estiver aberta, a superfície cobre **apenas composição e aplicação de Template** — **não confirma** ações de **enviar, receber, responder ou acompanhar entrega**, nem caixa de entrada operacional.

**Composição**
- Composer de e-mail com **seleção/aplicação de Template**.
- **Gerenciamento de Templates** (criar/editar/excluir, estrutura assunto/corpo/variáveis, permissões, aplicação em Automações) **não é confirmado como área própria** — fica **condicionado à OQ-13**.
- **Associação E-mail↔Card:** permite **identificar o Card de contexto**, **sem presumir** cardinalidade, obrigatoriedade, nem a existência do E-mail fora do Card (OQ-29).
- Conteúdo de e-mail pode conter **dados pessoais** → tratamento sob LGPD (**NFR-8**).

**Envio/recebimento — condicional (OQ-28):** enquanto pendente, a UX não desenha caixa de entrada nem confirma envio; segurança/observabilidade de e-mail são condicionais a essa decisão (NFR-9, NFR-10).

## IA básica (FR-26) — assistiva e revisável

**Natureza:** **contextual, não é módulo** (decisão do A1). Aparece onde apoia, sempre **rotulada como IA** (NFR-11). Personalidade visual (`visual-direction.md` §27): **assistiva, clara, revisável, controlada** — não autônoma, mágica, misteriosa nem neon.

**Estados** (do A3): **conteúdo gerado · aguardando revisão · editado · aceito · descartado**.

**Distinção obrigatória — aceite ≠ efeito operacional:**
- **Conteúdo aceito pelo usuário** e **efeito operacional realizado** são coisas distintas.
- **Aceitar uma sugestão não significa enviar o e-mail nem alterar dados automaticamente** — qualquer efeito operacional exige **confirmação explícita** (NFR-17).

**Garantias**
- **Transparência** (NFR-11): saída sempre identificada como IA.
- **Revisão humana** (NFR-12): revisável/editável/descartável/regenerável antes de uso definitivo, comunicação externa ou alteração operacional.
- **Fallback manual** (NFR-14): falha da IA não bloqueia o fluxo manual equivalente.
- **Isolamento de contexto** (NFR-13): restrita ao contexto e à Organização autorizados.

**Pendências que não presumo (registro)**
- **Casos de uso concretos** e **pontos de entrada** da IA — **não** posiciono botões como "Gerar resposta" ou "Resumir Card"; dependem da **OQ-30**.
- **AI Builder** — **não aparece na navegação operacional** até a resolução da **OQ-31**.

## Padrão responsivo
- **E-mails:** composição responsiva; a interface **não confirma caixa de entrada ou envio real** (OQ-28).
- **IA:** as saídas de IA dos **casos de uso aprovados** devem permitir **revisão, edição, descarte e confirmação** em mobile; geração/edição plenas prioritariamente desktop.

# Superfície: Tarefas/Solicitações + Notificações (FR-27..30)

## Tarefas & Solicitações (FR-27, FR-28)

**Superfície:** **mesma área, duas visões** (aba **Tarefas** · aba **Solicitações**) — decisão do A1. São **capacidades de visualização e acompanhamento**, não CRUD completo.

**Tarefas** (FR-27)
- Exibem **prazo** e estados **aberta · atrasada · concluída** (RN-090). *A origem de "atrasada" — atribuída manualmente ou calculada pelo prazo (data/horário/fuso) — permanece `PENDENTE`.*
- Estado por ícone + label + posição, **não só cor** (§21).

**Solicitações** (FR-28): estados **aberta · resolvida** (RN-091).

**Vínculo confirmado**
- **INV-WORK-02:** toda Tarefa/Solicitação pertence **obrigatoriamente a um Pipe**. A relação com **Card ou Fase** permanece `PENDENTE` — **não confirmo "tarefas da Fase"**.

**Estado vazio (INV-WORK-01)**
- "Tudo em dia" **não** aparece quando há itens pendentes; e depende do **conjunto de itens que o usuário tem permissão para visualizar** (NFR-4). Critérios exatos (se inclui Cards atrasados) são `PENDENTE`.

**Pendências que não presumo (registro)**
- Operações de ciclo de vida (criar/editar/concluir/resolver/excluir/atribuir) — **OQ-12**.
- **Matriz de permissões** do módulo — **OQ-4** (bloqueante para a UX operacional).

## Notificações internas (FR-29, FR-30)

**Escopo:** **Notificações internas** — não e-mail externo nem push de terceiros.

**Superfícies (INV-NOTIF-01):** **badge + popover** (topbar) **e página dedicada** compartilham **estado consistente** (mesma fonte, leitura e contagem). O **popover pode mostrar apenas um subconjunto recente**; a página traz o conjunto completo autorizado.

**Associação com Card:** **quando relacionada a um Card, a Notificação preserva o vínculo contextual com esse Card.** **Não** confirmo que **toda** Notificação obrigatoriamente aponta para um Card, nem imponho referência polimórfica ou cardinalidade (OQ-33).

**Estados de superfície**
- **carregando · vazio · erro · sem permissão · nenhum item visível no escopo atual.**

**Ações**
- Não confirmo ações como **marcar individualmente, marcar todas, concluir ou resolver** além do que já estiver aprovado nos FRs e nas permissões.

**LGPD:** conteúdo de Notificação pode referenciar dados pessoais → **NFR-23** (aplicação de NFR-8).

**Pendências que não presumo (registro)**
- Catálogo de tipos, alvos além de Card, distribuição, estado lido/não lido por destinatário, popover vs. página — **OQ-33**.
- **Matriz de permissões** de acesso ao módulo — **OQ-4**.

## Padrão responsivo
- **Tarefas/Solicitações (mobile):** **visualizar Tarefas e Solicitações, consultar prazo, estado e contexto**; **ações operacionais dependem da OQ-12 e das permissões**.
- **Notificações:** badge/popover acessíveis em mobile; página dedicada responsiva.

# Superfície: Relatórios + Perfil (FR-31, FR-32)

## Relatórios (FR-31)

**Natureza:** **indicadores** que representam **dados reais** dentro do escopo atual (Organização + permissões + filtros). O escopo aprovado cobre **indicadores** — **não** confirmo **gráficos, tabelas analíticas, exportação ou navegação detalhada**; formatos adicionais dependem da **OQ-34**.

**Invariantes (do PRD)**
- **INV-REPORT-01:** agregados **não revelam** recursos aos quais o usuário não tem acesso, nem indiretamente.
- **INV-REPORT-02:** filtros usam **recursos reais e autorizados**.

**Ações e filtros**
- **Filtros e CTAs só aparecem quando aprovados.** **Não fixo** ações como "Exportar", "Detalhar" ou "Ver Cards".

**Estados de superfície**
- **carregando · vazio legítimo · erro · sem permissão · dados possivelmente desatualizados** (quando aplicável).
- **Zero legítimo ≠ falha/carregamento** (NFR-27).
- Se os dados tiverem **defasagem conhecida**, a interface **deve indicá-la**; o **limite aceitável** permanece pendente em Produto/**NFR-28**.

**Distinção provisória (final na OQ-34):** Dashboard = visão rápida; Relatórios = análise e exploração.

**Pendências que não presumo (registro)**
- Catálogo, fórmula e regras de inclusão de cada indicador (finalizados/arquivados/excluídos); filtros; distinção Dashboard × Relatórios — **OQ-34**.
- **Matriz de permissões** — **OQ-4**.

**Decisões posteriores de Arquitetura:** fonte de verdade, agregação, consistência (NFR-26), atualização (NFR-28), desempenho (NFR-29), observabilidade (NFR-27).

## Perfil (FR-32)

**Natureza:** **mínima** — visualizar a **própria conta** e o **contexto real da Organização** atual. Existência da seção **≠ edição**.

**Quatro camadas conceituais** (distinção conceitual, **não** necessariamente quatro blocos visuais): dados globais da conta · participação na Organização · papel de Organização · eventual papel de Plataforma.

**O que a superfície mantém**
- **Dados da própria conta.**
- **Contexto da Organização atual.**
- **Papel organizacional — somente se aprovado.**
- **Papel de Plataforma / Super Admin não é exibido** no Perfil até que essa informação e sua finalidade sejam aprovadas.

**Escopo**
- **Apenas o próprio Perfil.** Outros usuários → **Painel Administrativo** (B9).
- **Não** inclui **troca de Organização** nesta rodada.

**Edição**
- **Não apresento botões de edição** enquanto a **OQ-36** estiver aberta.
- Quando aprovada, **alteração de e-mail e senha** usa **fluxo separado** das preferências comuns, com **proteção adicional** (NFR-33) e **auditoria** (NFR-35).
- Dados de conta são dados pessoais do próprio usuário → LGPD (**NFR-32**); consistência com outras telas (NFR-34).

**Pendências que não presumo (registro)**
- Edição de nome/avatar/preferências; alteração de e-mail/senha; "Pipes relacionados"; catálogo de preferências; exibição de papéis — **OQ-36**.

## Padrão responsivo
- **Relatórios:** indicadores responsivos; leitura essencial em mobile, exploração ampla prioritariamente desktop.
- **Perfil:** consulta responsiva; edição (quando definida) responsiva, com operações sensíveis protegidas.

# Superfície: Painel Administrativo da Organização (FR-33)

**Natureza:** administração **da própria Organização**, objetiva e testável. **Sem acesso implícito do Super Admin** — o acesso da Plataforma é decisão separada e pendente (**OQ-39**, futuro/Fase 2).

**Invariantes (do PRD)**
- **INV-ADMIN-01:** o Painel **nunca cruza dados entre Organizações**; opera **apenas na Organização atual**. Permissões/contextos de Organização e Plataforma são separados.
- **INV-ADMIN-02:** nenhuma seção exibe **dados fictícios como reais** nem simula persistência.

**Princípio de visibilidade (substitui rótulos "em definição"):**
- capacidade **útil e aprovada** → **exibir**;
- capacidade **indisponível** → **ocultar ou desabilitar claramente**;
- **nunca** apresentar dados simulados.

**Acesso:** somente o **Administrador da Organização** (NFR-37).

### Subseções (status na Fase 1 operacional)
| Subseção | Tratamento na UX |
|---|---|
| **Membros** | Superfície **reservada** (arquitetura de tela). **Não** confirmo lista, convite ou alteração de papéis enquanto a **OQ-37** estiver aberta; ações **não** apresentadas como funcionais. |
| **Permissões** | UX pode **preparar o padrão**, **sem** preencher poderes por suposição nem desenhar matriz operacional definitiva antes de **OQ-1..4**. |
| **Auditoria** | Eventos **sem edição comum**; estados distintos: **vazio · erro · sem permissão · nenhum evento encontrado**; **não** expor segredos ou dados pessoais desnecessários (NFR-1/NFR-40). Retenção e anonimização **condicionadas às decisões de LGPD** (OQ-38). Se aprovada como operacional: imutabilidade (INV-AUDIT-01). |
| **Financeiro** | **Oculto** até a finalidade ser aprovada; **sem conteúdo ilustrativo em produção** (OQ-38). |
| **Estatísticas administrativas** | Só aparecem **quando diferenciadas de Dashboard e Relatórios e com dados reais** (OQ-38). |

**API, Tokens e Webhooks:** **não aparecem** como opções navegáveis no Painel da Fase 1 — **nem** com selo "Em breve" (Non-Goals, §5).

**Pendências que não presumo (registro)**
- Gerenciamento de membros (bloqueante) — **OQ-37**.
- Matriz de permissões — **OQ-1..4**.
- Auditoria (catálogo, acesso, imutabilidade, retenção/anonimização) — **OQ-38** + LGPD.
- Finalidade de Financeiro e distinção Estatísticas × Dashboard × Relatórios — **OQ-38**.
- Acesso/escopo do Super Admin — **OQ-39**.

### Padrão responsivo
- **Desktop-first** (administração complexa, `visual-direction.md` §31).
- **Mobile:** limitado à **consulta das capacidades efetivamente aprovadas**; **ações administrativas sensíveis** permanecem prioritariamente desktop e **dependem das permissões**.

# Key Flows

Jornadas com **protagonistas por papel** (nomes reais evitados até personas formais serem aprovadas). Fluxos dependentes de permissão usam **"usuário autorizado"/"Membro autorizado"** (OQ-1..4 abertas). Cada fluxo cobre só capacidades confirmadas, com **portões de pendência** explícitos.

**KF-1 — Entrar e orientar-se (Membro)**
Login (autenticação real) → chega ao **Dashboard** da Organização atual → vê a operação real (grade de Pipes/Databases, indicadores reais).
- **Clímax:** o Membro sabe, de relance, o estado atual da operação.
- Portões: recuperação de senha é condicional (OQ-48).

**KF-2 — Mover um Card pelo processo (Membro autorizado)** *(núcleo — UJ-2 do PRD)*
Dashboard → abre um **Pipe** (Kanban) → abre um **Card** (layout de três painéis) → lê a Fase atual e o Histórico → **move o Card** para **outra Fase do mesmo Pipe** (alternativa por teclado/menu).
- **Clímax:** o Card passa a pertencer à nova Fase; a movimentação é **persistida** e registra **entrada no Histórico** (resultado confirmado).
- Portões: regras de restrição de movimentação (OQ-15); se dispara Automação/Notificação (OQ-16).

**KF-3 — Consultar um Registro (Membro autorizado)**
Abre um **Database** (tabela) → seleciona uma linha → **Registro** abre em painel lateral (visualização) → consulta campos e, se configurado, arquivos.
- **Clímax:** o Membro encontra o dado persistente que procurava, no contexto certo.
- Portões: criação/edição do Registro (OQ-19); arquivos (OQ-47); vínculo com Card (OQ-18).

**KF-4 — Acompanhar pendências e uma Notificação (Membro autorizado)**
Vê **Tarefas & Solicitações** (prazo/estado) → recebe uma **Notificação** (badge/popover).
- **Clímax:** a Notificação leva o Membro ao contexto relacionado. *A ação ao clicar e o destino exato da Notificação ainda dependem da OQ-33.*
- Portões: ciclo de vida de Tarefas/Solicitações (OQ-12); catálogo/distribuição/leitura de Notificações (OQ-33); permissões (OQ-4).

**KF-5 — Revisar uma sugestão de IA (Membro autorizado)**
Num caso de uso aprovado, a **IA gera conteúdo** → estado **aguardando revisão** → o Membro **edita / aceita / descarta**.
- **Clímax:** **nada é executado sem confirmação explícita** — aceitar a sugestão **não** envia e-mail nem altera dados; o efeito operacional só ocorre após confirmação (NFR-17).
- Portões: casos de uso concretos e pontos de entrada da IA (OQ-30).

**KF-6 — Administrar a Organização (Administrador da Organização)**
Acessa o **Painel Administrativo** (apenas a própria Organização, sem cruzar Orgs) → consulta as capacidades efetivamente aprovadas.
- **Clímax:** o Administrador vê o estado real da sua Organização, sem dados simulados (INV-ADMIN-02).
- Portões: gestão de membros (OQ-37, bloqueante); permissões (OQ-1..4); Auditoria/Financeiro/Estatísticas (OQ-38).

**KF-7 — Configurar um Formulário (usuário autorizado, desktop)**
Escolhe um dos três contextos (sempre visível qual: Pipe inicial · Fase · Database) → monta os campos no builder de três painéis.
- **Clímax:** a **configuração é concluída até o limite das capacidades aprovadas**.
- Portões: catálogo/estrutura de campos (OQ-9); quem configura/submete e acesso externo (OQ-10); destino do Formulário inicial (OQ-20); persistência do Formulário de Fase (OQ-21).

**KF-8 — Configurar uma Automação (usuário autorizado, desktop)**
Dentro de um Pipe → editor **Quando → Condições → Então**.
- **Clímax:** a **configuração é concluída até o limite das capacidades aprovadas**.
- Portões: ciclo de vida da Automação (OQ-11); catálogo de Eventos/Condições/Ações (OQ-24); comportamentos esperados do motor / execução (OQ-25).

---

**Observação sobre os portões:** os portões de pendência **não ampliam o escopo** — apenas tornam visível **onde** cada decisão em aberto precisa entrar. Eles **precisam ser resolvidos antes da conclusão** dos fluxos afetados; até lá, o fluxo é honesto ao terminar no limite das capacidades aprovadas.

# Responsividade

### Filosofia (`visual-direction.md` §31)
- **Web responsivo; sem app nativo** no MVP.
- **Desktop-first para configuração**, **mobile para operação**.
- **Prioridade desktop ≠ inutilizável fora do desktop**; mobile **não esconde contexto essencial**.

### Breakpoints conceituais (§32)
> **Faixas iniciais de UX** — podem ser **refinadas durante implementação e testes, sem alterar os comportamentos definidos** aqui. Não fixam framework.

| Faixa | Largura | Comportamento |
|---|---|---|
| Desktop amplo | 1440px+ | maior densidade, mais colunas, painéis simultâneos |
| Desktop | 1024–1439px | layout padrão |
| Tablet | 768–1023px | redução de colunas, painéis recolhíveis |
| Mobile | 320–767px | uma coluna, ações principais acessíveis, navegação adaptada |

### Matriz de superfícies × comportamento (consolidação A1–B9)
| Superfície | Desktop | Tablet | Mobile |
|---|---|---|---|
| Navegação | sidebar + topbar | sidebar recolhível + topbar | navegação adaptada (menu/topbar) |
| Dashboard | grade + área de atenção | grade reduzida | **grade ou lista adaptada ao espaço disponível** (critérios de prioridade condicionados à OQ-35) |
| Pipe / Kanban | Kanban com Fases e Cards | **visualização adaptada das Fases e Cards** | **visualização adaptada das Fases e Cards** (colunas reduzidas / navegação por Fase) |
| Card | **três painéis** (Contexto\|Execução\|Ações) | **painel contextual** (execução + contexto) | **abas/seções** |
| Database / Registro | tabela + painel lateral | tabela + painel lateral recolhível | lista responsiva de Registros + Registro dedicado |
| Form Builder | três painéis | canvas + painel alternável | edição limitada/orientada, **sem comprimir os 3 painéis** |
| Automações | lista + editor | lista e editor sequenciais | **consulta das Automações e execuções aprovadas** (criação/edição desktop-first, OQ-11) |
| E-mails / IA | composer / IA contextual | composer responsivo / IA contextual | revisão de IA (casos aprovados); sem caixa de entrada (OQ-28) |
| Tarefas / Solicitações | lista + detalhe | lista + detalhe responsivos | consulta (ações dependem de OQ-12/permissões) |
| Notificações | popover + página | popover + página responsivos | badge/popover + página responsiva |
| Relatórios | indicadores amplos | indicadores reduzidos | leitura essencial |
| Perfil | consulta (+ edição futura) | consulta responsiva | consulta responsiva |
| Painel Admin | desktop-first (gestão) | consulta | consulta das capacidades aprovadas |

### Capacidades em mobile (§31, alinhadas às rodadas)
- **Consultar Registros e dados operacionais autorizados** ("Cliente" não é entidade funcional fechada no PRD).
- Abrir e **mover Card** — condicional às regras de movimentação (OQ-15) e às permissões.
- **Visualizar Tarefas e Solicitações** — ações operacionais condicionadas à OQ-12 e às permissões.
- Acompanhar **Notificações**; verificar pendências; consultar **Histórico essencial**.
- Ver **arquivos no contexto** — condicional à OQ-47.
- **Revisar sugestão de IA** (casos aprovados).
- Consultar **resultado de Automação** — condicional aos comportamentos aprovados na OQ-25.
- **"Preencher Formulário público"** — condicional ao acesso externo não autenticado (OQ-10).

### Prioritariamente desktop
Configurar Pipe/Database/Form Builder; criar/editar Automação; gerenciar permissões; administração complexa.

### Regras transversais de responsividade
- **Não comprimir** os três painéis (Card e Form Builder) em telas estreitas — adaptar (empilhar/abas), não espremer.
- **Área de toque:** 44×44 px reforçado para ações principais em mobile (piso A3).
- **Sem rolagem lateral excessiva** em tabelas → lista responsiva no mobile.

### Preservado em todos os tamanhos
- **Foco visível** e **navegação por teclado**.
- **Leitura por tecnologia assistiva.**
- **Mensagens de erro e estados.**
- **Contexto da Organização.**
- **Permissões efetivas.**

<!-- Conteúdo UX completo (A1–A3, B1–B9, C1–C2). Próximo: Finalize. -->













