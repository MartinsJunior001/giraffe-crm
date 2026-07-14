# lgpd-check — Story 2.1 (ciclo de vida e catálogo de Pipes)

## Há tratamento de dado pessoal nesta Story?
**Não há dado pessoal novo.** A entidade `Pipe` descreve um **processo de trabalho** da Organização, não uma
pessoa. Suas colunas são `id`, `orgId`, `name`, `state`, `locked`, `starred`, `createdAt`, `updatedAt`,
`archivedAt` — nenhuma delas é PII: não há e-mail, nome de pessoa, documento, telefone nem identificador de
titular.

`name` é **rótulo de processo** ("Vendas", "Onboarding"). Um usuário pode, teoricamente, escrever o nome de
uma pessoa nesse campo — mas isso é conteúdo inserido pelo cliente, não coleta de PII pelo produto, e o dado
está protegido pelo mesmo isolamento por Organização que tudo o mais. Não há minimização adicional a fazer
sem inventar regra que ninguém especificou (Constitution II).

Os Cards — onde o dado de pessoa efetivamente vai morar — **não existem** nesta Story (2.7+).

## Minimização
- Nenhuma coluna "de brinde": o modelo tem exatamente os atributos que os AC pedem.
- A API **não** devolve `orgId` no payload de Pipe (`SELECT_PIPE` o mantém fora por construção) — nem
  identificador interno vaza para a apresentação.

## Logs
- Logs estruturados (Pino), com a redaction global já configurada (`authorization`, `cookie`,
  `set-cookie`).
- A trilha de auditoria de `Pipe` (ver `observability-check.md`) registra **ator, Organização, ação,
  recurso, resultado, timestamp** — identificadores internos (`accountId`, `orgId`, id do Pipe), **não**
  conteúdo. Não se registra e-mail, nome de pessoa nem corpo de requisição.
- Nenhum segredo, token ou header de autenticação em log.

## Isolamento por Organização
É a fronteira de proteção do dado do cliente, e nesta Story ela é imposta **pelo banco** (RLS ENABLE+FORCE,
policies por `current_org_id()`), não pela aplicação. Um tenant não lê nem escreve o Pipe de outro —
provado contra PostgreSQL real (`pipes-rls.test.ts`, SC-206). Ver `security-check.md`.

## Rastreabilidade administrativa
Toda **mutação** de Pipe (criar, renomear, alternar marcadores, arquivar, restaurar) entra na trilha de
auditoria (FR-214), inclusive as **tentativas negadas**. Há, portanto, registro de quem alterou o quê, em
qual Organização e com que resultado — proporcional a uma entidade de configuração, sem vigiar leitura
(auditar `SELECT` afogaria a trilha em ruído).

## Retenção
- Arquivar **preserva** os dados: é literalmente o requisito (AC2), não uma retenção indevida.
- Não há exclusão definitiva em 2.1 — e, portanto, **não há** pedido de eliminação a atender aqui. Quando
  o direito de eliminação incidir sobre dado de titular, ele incidirá sobre **Cards** (2.7+/2.11), não
  sobre o catálogo de processos.
- Nenhum dado novo é coletado, logo não há prazo de retenção novo a definir.

## Veredito

**APROVADO — não aplicável em sentido estrito.** A Story não introduz tratamento de dado pessoal. As
garantias que sustentam a LGPD nesta base (isolamento por Organização, logs sanitizados, trilha
administrativa) foram **estendidas** à nova entidade, não enfraquecidas.
