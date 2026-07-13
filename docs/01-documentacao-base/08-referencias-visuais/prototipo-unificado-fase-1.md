# Prototipo Unificado - Giraffe CRM - Fase 1

> Documento oficial de inventario e uso do prototipo visual da Fase 1.
> Fonte oficial: `docs/01-documentacao-base/`.
> O HTML demonstra fluxo, navegacao e direcao visual. Ele nao e implementacao
> final, nao define arquitetura e nao substitui BMAD/Spec Kit.

---

## 1. Localizacao do prototipo principal

O prototipo principal da Fase 1 esta em:

```text
docs/01-documentacao-base/08-referencias-visuais/prototypes/giraffe-crm-prototipo-html/
```

Arquivos principais observados:

- `index.html`;
- `login.html`;
- `forgot-password.html`;
- `dashboard-home.html`;
- `meu-trabalho.html`;
- `pipe-kanban.html`;
- `database-empresas-parceiras.html`;
- `automacoes-pipe.html`;
- `agentes-ia.html`;
- `tarefas-solicitacoes.html`;
- `minhas-notificacoes.html`;
- `relatorios-empresa.html`;
- `meu-perfil.html`;
- `painel-administrativo.html`;
- `js/giraffe-state.js`;
- `js/giraffe-shell.js`;
- `js/field-config.js`;
- `js/email-templates.js`;
- `assets/images/`.

---

## 2. Localizacao do Super Admin

A referencia visual separada do Platform Super Admin esta em:

```text
docs/01-documentacao-base/08-referencias-visuais/prototypes/super-admin-giraffe-crm.html
```

Essa referencia pertence ao escopo da Plataforma. Ela nao faz parte do fluxo
operacional principal e nao deve ser confundida com o Painel Administrativo da
Organizacao.

Regra:

- Administrador da Organizacao administra a propria organizacao;
- Super Admin administra a Plataforma;
- Super Admin e referencia visual separada, nao tela operacional comum da
  Organizacao;
- a integracao futura do Super Admin ao produto principal ainda sera definida.

---

## 3. Status do prototipo

O prototipo esta aprovado como referencia visual e de fluxo para preparacao da
documentacao base da Fase 1.

Status da validacao final antes do BMAD: o prototipo principal representa a
Fase 1 operacional; o Super Admin permanece como referencia separada da
Plataforma; a fonte oficial da documentacao e `docs/01-documentacao-base/`.

Ele pode ser usado para:

- entender a composicao das telas;
- validar hierarquia visual;
- entender navegacao entre modulos;
- confirmar nomes e agrupamentos visuais;
- apoiar BMAD UX;
- evitar que documentos fiquem abstratos demais.

Ele nao pode ser usado como:

- frontend final;
- arquitetura final;
- contrato de API;
- schema de banco;
- implementacao de regras de negocio;
- prova de autenticacao, autorizacao, envio de e-mail ou persistencia real.

A implementacao final sera especificada depois, usando a stack oficial da Fase 1
(`Next.js`, `React` e demais itens de `09-stack-escolhida/stack-fase-1.md`).

---

## 4. O que esta confirmado visualmente

| Area | Confirmacao visual |
|---|---|
| Login | Entrada no produto e caminho para dashboard. |
| Dashboard operacional | Visao inicial com pipes, databases e indicadores. |
| Pipes / Kanban | Quadro visual com fases e cards. |
| Cards | Modal/detalhamento de trabalho, fase, status e historico visual. |
| Formularios | Configuracao visual de campos em contextos diferentes. |
| Database | Tela de base estruturada, distinta do Kanban. |
| Automacoes basicas | Modelo visual Evento -> Condicao -> Acao. |
| E-mails | Composer, templates e historico visual. |
| IA basica | Tela de assistentes e AI Builder demonstrativo. |
| Tarefas e Solicitacoes | Acompanhamento operacional de pendencias. |
| Notificacoes | Popover, pagina e badge. |
| Relatorios | Indicadores operacionais basicos. |
| Perfil | Dados e contexto do usuario. |
| Painel Administrativo da Organizacao | Administracao da propria organizacao. |
| Super Admin | Referencia separada da Plataforma. |

---

## 5. O que e apenas demonstrativo

Devem ser tratados como demonstrativos no prototipo:

- autenticacao real;
- sessao real;
- recuperacao real de senha;
- envio real de e-mail;
- persistencia real em banco;
- isolamento multi-organizacao completo;
- execucao real de automacoes;
- AI Builder conectado a fluxo produtivo;
- logs e auditoria definitivos;
- financeiro no Painel Administrativo;
- API, tokens, GraphQL, Webhooks, MCP e requisicao HTTP.

Se um recurso esta visualmente presente, mas os documentos oficiais o classificam
como Fase 2, futuro, `NAO CONFIRMADO` ou `PENDENTE DE DECISAO`, ele nao deve ser
tratado como funcional na Fase 1.

---

## 6. Limitacoes conhecidas

Limitacoes que devem orientar BMAD e Spec Kit:

- o prototipo HTML nao possui backend real;
- algumas telas usam dados locais, mesmo quando existe um state central de
  referencia;
- dados locais do prototipo nao sao fonte final de modelagem;
- Kanban, Cards, Fases, registros do Database, templates e automacoes ainda
  precisam ser consolidados na futura implementacao;
- `phase` pode aparecer como nome de fase, nao como `phaseId`;
- `state.records` nao confirma uma fonte unica de registros;
- historico de Card e logs/auditoria ainda precisam de modelo final;
- Super Admin esta separado, nao integrado ao prototipo operacional principal;
- arquivos copiados dentro da pasta interna `prototypes/giraffe-crm-prototipo-html/docs/`
  nao substituem a documentacao oficial em `docs/01-documentacao-base/`.

### Links internos validados

Validacao estatica de `href`/`src` relativos no pacote principal confirmou que:

- `forgot-password.html` existe no pacote principal atual;
- `meu-trabalho.html` existe no pacote principal atual.

Nenhum HTML foi alterado por esta atualizacao documental. Para o BMAD, esses
arquivos devem ser tratados como parte da referencia visual do prototipo
operacional, nao como implementacao final.

---

## 7. Regra de uso do HTML

Regra oficial:

> HTML demonstra. Markdown decide. BMAD e Spec Kit especificam. Implementacao vem depois.

Consequencias:

- nao alterar o prototipo para "resolver" decisao de produto;
- nao criar tela nova a partir de lacuna documental;
- nao tratar comportamento visual como regra implementada;
- nao derivar API, schema ou arquitetura diretamente do HTML;
- sempre conferir a decisao oficial nos Markdown de `docs/01-documentacao-base/`.

---

## 8. Relação com BMAD

No BMAD, o prototipo deve servir como insumo para:

- UX;
- Product Brief;
- PRD;
- arquitetura de informacao;
- inventario de telas;
- consistencia visual;
- validacao de fluxos principais.

O BMAD nao deve usar o prototipo para reabrir Fase 2 como se fosse parte do MVP.

---

## 9. Decisao oficial

O prototipo unificado da Fase 1 e uma referencia visual aprovada. Ele permanece
dentro de:

```text
docs/01-documentacao-base/08-referencias-visuais/prototypes/
```

Nenhum arquivo HTML, JS, CSS ou asset do prototipo deve ser alterado por esta
documentacao. A implementacao final sera especificada posteriormente.
