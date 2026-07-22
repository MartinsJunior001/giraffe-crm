# observability-check — Story 4.5

**Status:** APROVADO
**Risco:** ALTO.

## O que a 4.5 observa
Núcleo puro — não emite log próprio, não abre rota. O único ponto observável novo é o 400 `ACAO_FORA_DO_CATALOGO`
retornado pelos serviços de Automação, que segue o padrão sanitizado de `EVENTO_FORA_DO_CATALOGO` (4.3) e
`CONDICAO_FORA_DO_CATALOGO` (4.4): `{ motivo, detalhe }` estrutural, sem eco do payload.

## Sanitização
- Motivos de recusa da revalidação (`FORA_DA_ORG`/`SEM_CAPACIDADE`/`ESTADO_INVALIDO`/…) são enum estrutural — nunca id,
  valor de Campo ou PII. Projetados para serem seguros na futura trilha de Execuções (4.8).
- A configuração (`entao`, com possíveis `valores`/`membershipId`) **não** vai a log — herdado da 4.1 (o serviço loga só
  `{ automationId, pipeId, state }`), provado em `automations-log.test.ts`.

## Contrato de auditoria (para a 4.6/4.8)
- `TrilhaAtoria` distingue ator/iniciador/principal — o dado mínimo que a trilha de Execuções (4.8) e a auditoria
  administrativa (AD-16) precisam para responder "quem agiu, quem iniciou, qual regra", sem fundir os três.
- `automationVersionId` no principal materializa "a execução registra a versão usada" (AD-18) — rastreabilidade da
  definição versionada.

## Veredito
APROVADO — a superfície observável nova é fail-closed e sanitizada; o contrato de auditoria dos três papéis está pronto
para o consumidor (4.6/4.8).
