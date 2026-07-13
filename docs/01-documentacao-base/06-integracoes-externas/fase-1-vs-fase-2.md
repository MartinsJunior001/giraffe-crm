# Fase 1 vs Fase 2 - Integracoes Externas

> Documento oficial da fronteira entre Fase 1, Fase 2 e futuro.
> Fonte oficial: `docs/01-documentacao-base/`.
> Este documento existe para impedir que recursos futuros sejam tratados como
> funcionais na Fase 1.

---

## 1. Definicao de Fase 1

A Fase 1 e o nucleo operacional do Giraffe CRM.

Ela inclui:

- Login;
- Dashboard operacional;
- Pipes / Kanban;
- Cards;
- Formularios;
- Database;
- Automacoes basicas;
- E-mails;
- IA basica;
- Tarefas e Solicitacoes;
- Notificacoes;
- Relatorios;
- Perfil;
- Painel Administrativo da Organizacao;
- Super Admin apenas como referencia separada da Plataforma.

A Fase 1 pode possuir servicos tecnicos de apoio definidos pela arquitetura
futura, mas nao oferece ao usuario final um produto de integracoes externas
genericas.

---

## 2. Definicao de Fase 2

A Fase 2 abre a camada de integracoes externas e extensibilidade do Giraffe CRM.

Devem ser tratados como Fase 2:

- API externa;
- Webhooks externos;
- MCP;
- GraphQL publica;
- requisicao HTTP em automacoes;
- painel de tokens/API;
- integracoes externas genericas;
- conectores com ferramentas terceiras;
- regras avancadas de execucao externa.

Se algum desses itens aparecer no prototipo como "Em breve", ele deve continuar
bloqueado para a Fase 1.

---

## 3. Definicao de futuro

Futuro e tudo que vai alem da estabilizacao da Fase 2 ou depende de maturidade
maior do produto.

Devem ser tratados como futuro:

- marketplace;
- billing complexo;
- SAML/SSO avancado;
- impersonation e acesso de suporte;
- app mobile nativo;
- automacoes avancadas;
- IA autonoma avancada com multiplos agentes;
- analytics avancado;
- permissoes extremamente granulares;
- busca vetorial ou full-text avancada quando nao for necessaria ao MVP.

---

## 4. Integracoes permitidas na Fase 1

Na Fase 1, "integracao permitida" significa apoio interno ao produto, nao uma
plataforma aberta de integracoes.

Permitido no escopo de produto:

- notificacoes internas;
- e-mails e templates como fluxo operacional;
- automacoes internas simples;
- IA basica assistiva;
- armazenamento de arquivos como capacidade contextual;
- comunicacao em tempo real interna, se a arquitetura confirmar necessidade;
- filas e cache como infraestrutura tecnica;
- observabilidade e logs como suporte operacional.

Importante: usar um provedor tecnico por baixo, quando a arquitetura definir,
nao transforma o produto em uma plataforma de integracoes externas para clientes
na Fase 1.

---

## 5. Integracoes bloqueadas na Fase 1

Bloqueado como funcional na Fase 1:

- criar ou consumir Webhooks externos;
- expor API publica para clientes;
- expor GraphQL publica;
- executar requisicao HTTP customizada em automacoes;
- oferecer MCP como capacidade do produto;
- criar marketplace de conectores;
- permitir conectores externos genericos;
- prometer SSO/SAML avancado;
- permitir impersonation de suporte;
- criar permissao granular por campo/acao/regra customizada complexa.

Se um fluxo visual sugerir qualquer um desses itens, ele deve ser lido como
demonstrativo ou "Em breve".

---

## 6. API, Webhooks e MCP

### API externa

API externa para clientes e parceiros e Fase 2. A Fase 1 pode ter APIs internas
de implementacao, mas isso nao significa que exista API publica documentada,
versionada ou exposta como produto.

### Webhooks externos

Webhooks externos sao Fase 2. A Fase 1 nao deve prometer eventos enviados para
sistemas terceiros nem recebimento configuravel de eventos externos.

### MCP

MCP e Fase 2. Nao deve ser tratado como funcional no escopo oficial da Fase 1.

### GraphQL publica

GraphQL publica e Fase 2. Se existir mencao visual a token ou GraphQL, deve ser
classificada como "Em breve" ou fora do escopo funcional atual.

### Requisicao HTTP em automacoes

Requisicao HTTP customizada em automacoes e Fase 2. Na Fase 1, automacoes devem
ficar em acoes internas basicas.

---

## 7. Motivo tecnico e de produto da separacao

Separar Fase 1 de Fase 2 protege o produto de tres riscos:

1. **Risco de escopo.** Integracoes externas abrem muitos casos de erro,
   seguranca, limites, retries, autenticacao, logs e suporte.
2. **Risco de modelo.** Antes de expor API/Webhooks, as entidades centrais
   precisam estar estaveis: Organizacao, Pipe, Card, Database, Registro,
   Permissao, Historico e Log.
3. **Risco de experiencia.** O usuario precisa primeiro confiar no nucleo
   operacional. Uma camada de integracoes antes da base estar clara aumenta
   confusao e complexidade.

Produto primeiro estabiliza o nucleo. Depois abre extensibilidade.

---

## 8. Matriz de decisao

| Recurso | Fase 1 | Fase 2 | Futuro | Observacao |
|---|---:|---:|---:|---|
| Notificacoes internas | Sim | - | - | Parte do nucleo operacional. |
| E-mails e templates | Sim | - | - | Fluxo operacional; envio real depende da arquitetura. |
| Automacoes internas basicas | Sim | - | - | Evento -> Condicao -> Acao, sem HTTP externo. |
| IA basica assistiva | Sim | - | - | Apoio humano, sem autonomia avancada. |
| API externa publica | Nao | Sim | - | Produto de extensibilidade. |
| Webhooks externos | Nao | Sim | - | Requer seguranca, retry e auditoria. |
| MCP | Nao | Sim | - | Fora do nucleo inicial. |
| GraphQL publica | Nao | Sim | - | Fora do nucleo inicial. |
| Requisicao HTTP em automacoes | Nao | Sim | - | Acao externa customizada. |
| Marketplace | Nao | - | Sim | Depende de maturidade de integracoes. |
| Billing complexo | Nao | - | Sim | Fora do MVP operacional. |
| SAML/SSO avancado | Nao | - | Sim | Pode entrar quando houver requisito enterprise. |
| Impersonation | Nao | - | Sim | Exige governanca e auditoria forte. |
| App mobile nativo | Nao | - | Sim | Fase 1 e web responsiva. |
| Analytics avancado | Nao | - | Sim | Relatorios basicos entram na Fase 1. |

---

## 9. Regra para BMAD e Spec Kit

Durante BMAD e Spec Kit:

- nao transformar itens de Fase 2 em requisito funcional da Fase 1;
- nao desenhar API publica como entrega inicial;
- nao especificar Webhook/MCP/GraphQL publica como parte do MVP;
- nao usar recursos "Em breve" do prototipo como evidencia de funcionalidade;
- quando houver duvida, classificar como `PENDENTE DE DECISAO` ou `FORA DA FASE 1`.

---

## 10. Decisao oficial

O Giraffe CRM Fase 1 e um CRM operacional interno com automacoes basicas e IA
assistiva. A camada de integracoes externas e extensibilidade pertence a Fase 2
ou futuro.

