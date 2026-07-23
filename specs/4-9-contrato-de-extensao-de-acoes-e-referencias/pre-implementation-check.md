# pre-implementation-check — Story 4.9

## Status: **APROVADO COM RESSALVAS**

Ressalva única e material: **risco de abstração especulativa** (o gate anti-especulação). Mitigado por RECORTE explícito
(abaixo). Sem esse recorte o status seria BLOQUEADO.

## Fase e liberação
- Fase 1, Épico 4 (Automações), Story 4.9 — **última** do Épico. Deps 4.5/4.6/4.7/4.8 **done**. Sprint-status: 4.9 = backlog.
- **Não** depende de recurso de Fase 2. Depende de E5/E6 apenas **como contrato consumido por eles** (não o inverso — epics
  §1256: "não há dependência de implementação futura de E5/E6 sobre E4").

## Recorte que remove o bloqueio (anti-especulação)
- Consumidor concreto do contrato = os **8 handlers 4.5/4.6** (formalização do existente). ✔
- **Proibido e ausente:** handler/entidade/módulo de Tarefa/Solicitação/Notificação/E-mail/IA/Template; migration; tabela;
  GRANT; `TEMPLATE` em `TIPOS_DE_REFERENCIA`; motor paralelo; reescrita do dispatch 4.6. ✔
- **Ação↔Template (§1460)** e **IA como Ação (§1461)** = DECISÃO registrada (semântica de versão fechada na Arquitetura **antes
  de E6**, §1459/OQ-26), **não** código. ✔

## Story / AC
Objetivo, escopo, AC §1463–1466, fora-de-escopo (§1467) e demonstração parcial (§1468) confirmados no spec/analyze.

## Produto / invariantes
`Card ≠ Registro`, `Pipe ≠ Database`, deny-by-default, `PERMISSÃO = AÇÃO + ESCOPO` preservados. Contrato não altera autorização;
`PrincipalAutomacao`/`revalidarAcao` intocados (não-ampliação). C3 congelado (`ability.ts` não tocado).

## Técnica
- Stack: NestJS 11, Prisma 6.19.3, TS estrito. Núcleo **puro** (sem I/O/framework), padrão de `event-catalog.ts` (4.3),
  `action-catalog.ts` (4.5), `condition-catalog.ts` (4.4). Sem biblioteca nova ⇒ context7-check não requerido (nenhuma API de
  terceiro nova).
- Módulos afetados: `pipes/automations/actions/*` (novo contrato) + os 2 serviços de Automação (enforcement aditivo). Motor
  4.6 **não** alterado.
- Migrations: **nenhuma**. `prisma generate` sem diff (confirmar no gate).

## Dados / permissões
- Sem entidade/dado novo. Isolamento inalterado (núcleo puro; RLS/GRANT existentes seguem). Fonte de verdade da definição de
  Ação = `Automation.entao` (JSON, desde 4.1) + `AutomationVersion.snapshot`. Sem retenção/anonimização nova.
- Permissões inalteradas (config = "config do Pipe", já existente).

## Skills obrigatórias para o encerramento
- **security-check** (toca fronteira de config/autz — obrigatória).
- **observability-check** (mensagem de erro sanitizada nova — leve).
- **migration-check / backup-check / lgpd-check**: **não aplicáveis** (sem migration, sem dado, sem PII nova).
- **performance-check**: não aplicável (núcleo puro, sem query nova).

## Plano mínimo
Ver `plan.md`/`tasks.md`. Ordem: contrato puro → enforcement → testes (contrato + conformação motor + http) → decisão → gates.

## Veredito
Liberado para `safe-implementation`. Manter o recorte sob auditoria da Lane 0.
