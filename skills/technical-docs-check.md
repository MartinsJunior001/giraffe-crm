# technical-docs-check

## 1. Finalidade

A skill `technical-docs-check` valida documentacao tecnica atual, oficial e
compativel com as versoes usadas ou planejadas no Giraffe CRM antes de qualquer
decisao tecnica, planejamento arquitetural ou implementacao.

Ela existe para impedir decisoes baseadas exclusivamente em memoria do agente,
exemplos antigos, tutoriais desatualizados, APIs depreciadas ou comportamento
presumido de bibliotecas.

Esta skill e independente de IDE, agente ou fornecedor especifico. Ela pode ser
executada por Cursor, Claude, ChatGPT, Copilot, outro agente, outra IDE ou uma
ferramenta automatizada. Ferramentas de consulta documental, como Context7,
podem ajudar quando disponiveis, mas nao sao obrigatorias para a existencia ou
funcionamento conceitual desta skill.

## 2. Quando executar

Executar obrigatoriamente antes de:

- escolher ou adicionar uma biblioteca;
- utilizar API de framework;
- criar integracao;
- alterar autenticacao;
- alterar autorizacao;
- criar migration;
- configurar banco de dados;
- configurar filas;
- configurar cache;
- configurar armazenamento;
- configurar observabilidade;
- utilizar SDK de IA;
- configurar deploy;
- atualizar dependencias;
- implementar comportamento baseado em servico externo;
- utilizar recurso cuja API possa variar por versao.

## 3. Quando nao e necessario

Nao exigir a execucao completa para:

- correcao ortografica;
- organizacao de Markdown;
- movimentacao documental autorizada;
- analise da documentacao interna;
- alteracao puramente textual;
- mudanca visual que nao dependa de API externa ou biblioteca nova.

## 4. Prioridade das fontes

Usar esta ordem:

1. documentacao oficial da tecnologia;
2. especificacao oficial;
3. repositorio oficial;
4. changelog e release notes oficiais;
5. documentacao da versao utilizada;
6. ferramentas de consulta documental, como Context7, quando disponiveis;
7. fontes secundarias apenas como apoio.

Blogs, foruns, videos e tutoriais nao devem ser usados como fonte principal
quando existir documentacao oficial.

## 5. Processo obrigatorio

O agente deve:

1. identificar as tecnologias envolvidas;
2. localizar as versoes instaladas ou planejadas;
3. consultar a documentacao correspondente as versoes;
4. confirmar a API recomendada;
5. identificar APIs depreciadas;
6. verificar compatibilidade com a stack;
7. verificar implicacoes de seguranca;
8. verificar necessidade de migration;
9. registrar fontes e conclusoes;
10. somente depois planejar ou implementar.

Stack oficial documentada em:

```text
docs/01-documentacao-base/09-stack-escolhida/stack-fase-1.md
```

Tecnologias principais da Fase 1:

- TypeScript;
- Next.js;
- React;
- Tailwind CSS;
- shadcn/ui;
- Radix UI;
- NestJS;
- PostgreSQL;
- Prisma;
- Redis;
- BullMQ;
- Socket.IO;
- Better Auth;
- CASL;
- MinIO;
- Sentry;
- Pino;
- OpenAI Agents SDK para TypeScript;
- Docker Compose;
- Coolify.

Itens futuros:

- GitHub Actions;
- Qdrant;
- Meilisearch.

Itens futuros nao devem ser tratados como implementados ou obrigatorios na
Fase 1.

## 6. Checklist minimo

[ ] tecnologia identificada  
[ ] versao identificada  
[ ] documentacao oficial consultada  
[ ] documentacao compativel com a versao  
[ ] API atual confirmada  
[ ] APIs depreciadas verificadas  
[ ] compatibilidade com a stack confirmada  
[ ] impacto de seguranca avaliado  
[ ] impacto de migration avaliado  
[ ] decisao tecnica registrada  

## 7. Criterios de bloqueio

A skill deve bloquear a continuidade quando:

- a versao da tecnologia nao for conhecida;
- nao houver documentacao confiavel disponivel;
- houver conflito entre documentacao oficial e codigo atual;
- a solucao exigir API depreciada;
- existir incompatibilidade entre versoes;
- for necessaria mudanca de stack nao aprovada;
- for necessaria migration ainda nao planejada;
- a alteracao pertencer a Fase 2;
- a decisao arquitetural ainda nao estiver aprovada.

Nesses casos, registrar:

```text
STATUS: BLOQUEADO
```

E explicar claramente o motivo e a decisao necessaria.

## 8. Resultado esperado

A saida deve seguir este formato:

```md
# Technical Documentation Check Report

## Contexto da tarefa

## Tecnologias envolvidas

## Versoes identificadas

## Fontes oficiais consultadas

## APIs confirmadas

## APIs depreciadas ou evitadas

## Compatibilidade com a stack

## Impactos de seguranca

## Impactos de migration

## Riscos identificados

## Decisoes pendentes

## Status final
```

Usar somente:

- APROVADO
- APROVADO COM RESSALVAS
- BLOQUEADO

## 9. Relacao com outras skills

Esta skill deve ser executada antes de:

- pre-implementation-check;
- safe-implementation;
- migration-check;
- security-check;
- code-review.

## 10. Regras do Giraffe CRM

- nao trocar tecnologia da stack sem decisao arquitetural;
- nao adicionar dependencia sem necessidade documentada;
- nao utilizar versao incompativel;
- nao implementar recursos da Fase 2 durante a Fase 1;
- nao tratar o prototipo HTML como arquitetura final;
- usar a documentacao do projeto como fonte de requisitos;
- usar documentacao externa oficial para validar o comportamento tecnico;
- registrar incertezas em vez de assumir respostas.

## Principios

- documentacao atual antes de memoria;
- fonte oficial antes de tutorial;
- versao correta antes de exemplo generico;
- seguranca antes de conveniencia;
- compatibilidade antes de implementacao;
- evidencia antes de suposicao.
