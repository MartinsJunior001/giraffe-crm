<!--
SYNC IMPACT REPORT
==================
Version change: (template, unversioned) → 1.0.0
Bump rationale: MAJOR/initial ratification — primeira Constitution concreta do Giraffe CRM,
substituindo o template de placeholders. Estabelece princípios de governança não-negociáveis.

Modified principles: (todos novos — template não tinha princípios concretos)
Added principles:
  I. Processo antes de código (BMAD → Spec Kit → Implementação)
  II. Implementação apenas por Story aprovada; sem antecipação de escopo
  III. Stack canônica e TypeScript estrito (monorepo Next.js + NestJS)
  IV. Isolamento multi-tenant e deny-by-default
  V. Identidade: Account global + Membership por Organização; distinções conceituais invariantes
  VI. Segurança e segredos (fail-closed)
  VII. Observabilidade e logs sem dados sensíveis
  VIII. Dados: fonte de verdade única, migrações/backups seguros, idempotência
  IX. LGPD e minimização de dados
  X. Testes e gates obrigatórios
  XI. Preservação dos artefatos autoritativos e das invariantes
Added sections:
  - Restrições Técnicas, Segurança e Compliance (Section 2)
  - Fluxo de Desenvolvimento e Quality Gates (Section 3)
Removed sections: nenhuma (template genérico substituído)

Templates requiring updates:
  ✅ .specify/templates/plan-template.md — "Constitution Check" compatível (usar princípios I–XI)
  ✅ .specify/templates/spec-template.md — escopo/requisitos compatíveis (Non-Goals + invariantes)
  ✅ .specify/templates/tasks-template.md — categorias de tarefa compatíveis (testes/observabilidade/segurança)
  ✅ .github/agents/speckit.*.agent.md — sem referências desatualizadas a corrigir

Follow-up TODOs: nenhum placeholder deferido.
-->

# Giraffe CRM Constitution

Governança não-negociável da **Fase 1** do Giraffe CRM. Esta Constitution tem
precedência sobre conveniência, hábito e preferência individual. Onde ela e um
artefato autoritativo (PRD, UX, Architecture Spine, epics.md) se sobrepuserem, o
artefato de maior especificidade prevalece; onde houver conflito real, registra-se
sem alterar o artefato e escala-se ao dono da decisão.

## Core Principles

### I. Processo antes de código (BMAD → Spec Kit → Implementação)

A sequência oficial é **Documentação Base → BMAD → Spec Kit → Implementação →
Validações por skills → Deploy** e MUST ser respeitada. Nenhum código de aplicação
é escrito antes de a Story correspondente ter passado por BMAD (Story validada) e
Spec Kit (specify → clarify → plan → checklist → tasks → analyze). Clareza antes de
código; especificação antes de implementação; evidência antes de suposição.
**Rationale:** unidades construídas fora de sequência divergem e geram retrabalho
estrutural; o processo é o que mantém as invariantes coesas.

### II. Implementação apenas por Story aprovada; sem antecipação de escopo

Só se implementa o que está na Story aprovada e em `ready-for-dev`/`in-progress`.
É PROIBIDO antecipar Fase 2, ampliar o escopo da Fase 1, ou criar estrutura
especulativa (módulos vazios, repositórios genéricos, event bus, abstrações sem
consumidor concreto). Os **Non-Goals** do PRD (§5) MUST ser preservados. Decisões
`PENDENTE`/`Open Question` NÃO são resolvidas por presunção — são levantadas ao dono.
**Rationale:** YAGNI protege a base; escopo antecipado vira dívida e superfície de risco.

### III. Stack canônica e TypeScript estrito (monorepo Next.js + NestJS)

**TypeScript** é a linguagem única (modo estrito). A aplicação é um **monorepo**
com **Next.js/React** (frontend) e **NestJS** (backend), fronteiras de domínio
invariantes (AD-1). O frontend consome **apenas** a API interna; nenhuma regra de
domínio no frontend; a API não é pública na Fase 1 (AD-2). O monorepo compartilha
**só** contratos/schemas/tipos utilitários (AD-3); o kernel é mínimo (AD-4) e a
dependência aponta sempre para o kernel (AD-5). Versões seguem o Stack Seed
(versões fixadas pelo código e verificadas via `context7-check`); **não** se inventa
versão nem se troca a stack sem decisão arquitetural registrada.
**Rationale:** uma stack e fronteiras estáveis são pré-condição para escala segura.

### IV. Isolamento multi-tenant e deny-by-default

O isolamento por **Organização** é o invariante-mãe (AD-6, NFR-3). Todo dado
operacional pertence a uma Organização e MUST ser isolado (RLS + escopo aplicado no
servidor). Autorização é **deny-by-default**: acesso só quando explicitamente
concedido (CASL composto com tenancy — AD-9). `PERMISSÃO = AÇÃO + ESCOPO`. Nenhuma
rota, query ou Ação pode vazar dados entre Organizações.
**Rationale:** vazamento tenant é a falha mais grave possível neste produto.

### V. Identidade: Account global + Membership por Organização; distinções invariantes

O modelo de identidade é **Account global + Membership por Organização (Forma B,
AD-7)**. As distinções conceituais são invariantes e NUNCA podem ser erodidas:
Usuário≠Organização; Plataforma≠Organização; **Super Admin (Plataforma)≠Admin da
Organização**; **Pipe≠Database**; **Card≠Registro**; **Fase≠Status do Card**; os três
Formulários são independentes. Protótipo≠arquitetura final; legado nunca é fonte oficial.
**Rationale:** confundir esses conceitos corrompe o modelo de dados e as permissões.

### VI. Segurança e segredos (fail-closed)

Capacidades gated são **fail-closed** (AD-28): permanecem desligadas até
provedor/identidade/segurança estarem satisfeitos. Segredos vêm de cofre/ambiente
(AD-31/NFR-1) e NUNCA são versionados, embutidos em imagem, logados ou expostos em
health. Sem credencial padrão insegura; sem endpoint administrativo/aberto por
conveniência; CORS restrito e configurável (sem wildcard em produção). Configuração
obrigatória ausente MUST causar **falha honesta (fail-fast)** sanitizada.
**Rationale:** segurança antes de conveniência; o custo de um segredo vazado é irreversível.

### VII. Observabilidade e logs sem dados sensíveis

Toda unidade emite **logs estruturados** com campos mínimos (serviço/ambiente,
`correlationId`, Organização, ator, operação, recurso, resultado, duração, timestamp)
e **política central de sanitização** (AD-29): NUNCA registrar senhas, tokens,
cookies/headers de auth, segredos, corpos completos de e-mail, prompts/respostas
integrais de IA, conteúdo de arquivos ou PII desnecessária. Inicialização, falha
fatal e falha de configuração MUST ser visíveis.
**Rationale:** sem observabilidade sanitizada não há operação segura nem auditável.

### VIII. Dados: fonte de verdade única, migrações/backups seguros, idempotência

Cada dado tem **fonte de verdade única** (AD-14); read-models são derivados. Mutação
de estado relevante é por eventos (AD-13); as quatro trilhas (Histórico do Card,
log operacional, Auditoria administrativa, execução de Automação) são separadas
(AD-15). Alteração destrutiva de esquema passa por **migration controlada** com
rollback (AD-17); backup/recuperação seguem mecanismos definidos (AD-33). Processamento
assíncrono é **at-least-once com idempotência** (AD-16/AD-19). Protótipo NUNCA
representa o modelo final.
**Rationale:** integridade e recuperabilidade dos dados são inegociáveis.

### IX. LGPD e minimização de dados

Tratamento de dados pessoais MUST respeitar minimização, base legal, retenção e
residência conforme decisões de Produto/Jurídico (gates OQ-43..46, AD-34). Dados
reais de produção não vão para dev/testes sem anonimização autorizada. IA opera com
isolamento de contexto e guardrails (AD-20/AD-26); IA nunca produz efeito operacional
direto sem aprovação humana. `lgpd-check` é obrigatório quando há dado pessoal.
**Rationale:** conformidade é requisito legal e de confiança, não item opcional.

### X. Testes e gates obrigatórios

Toda Story MUST ter testes automatizados proporcionais ao risco; a Story só sai de
`in-progress` com testes verdes, lint/format/type-check/build limpos e critérios de
aceite comprovados por evidência real (nunca por afirmação). Os gates aplicáveis MUST
estar fechados antes da Story que bloqueiam — nunca depois. Não se marca `migration-check`
ou `backup-check` como executado quando são N/A; não se marca critério como concluído
sem teste real.
**Rationale:** "verde sem execução" é mentira sobre conclusão — proibido.

### XI. Preservação dos artefatos autoritativos e das invariantes

PRD, UX (DESIGN/EXPERIENCE), Architecture Spine, `epics.md`, readiness report,
roadmap e `sprint-status.yaml` são autoritativos e NÃO são alterados fora de seu
fluxo próprio. Implementação nunca modifica esses artefatos (salvo a própria Story e
o status oficial). As invariantes de negócio (INV-FORM-01, INV-NOTIF-01,
INV-REPORT-01/02, INV-ADMIN-01/02, INV-AUDIT-01, INV-WORK-01/02) MUST permanecer sem
regressão.
**Rationale:** a base de verdade compartilhada é o que impede deriva entre unidades.

## Restrições Técnicas, Segurança e Compliance

**Stack Seed (direção oficial; versões fixadas no código, verificadas via `context7-check`):**
TypeScript · Next.js/React/Tailwind/shadcn/Radix · NestJS · PostgreSQL/Prisma ·
Redis/BullMQ/Socket.IO · Better Auth/CASL · MinIO · Sentry/Pino · OpenAI Agents SDK ·
Docker Compose/Coolify. Node.js LTS. pnpm (workspaces, lockfile único, Corepack).

**Deploy e ambientes (AD-32):** conteinerizado; containers distintos front/back;
segredos fora do repo; ambientes separados com banco/buckets/filas/cache/segredos
próprios; health/readiness; encerramento gracioso; rollback da aplicação; migrations
como etapa controlada. Enquanto não houver CI/CD (decisão posterior), exige-se
procedimento **manual reproduzível** de deploy, rollback e recuperação.

**Checks/skills do projeto (indicados por Story, executados no ciclo):**
`context7-check` · `pre-implementation-check` · `safe-implementation` · `security-check` ·
`lgpd-check` · `observability-check` · `migration-check` · `backup-check` ·
`performance-check` · `ai-guardrails-check` · `cost-monitoring-check` · `code-review` ·
`commit-check` · `coolify-deploy-check`. `migration-check`/`backup-check` são N/A
quando não há persistência.

**Non-Goals da Fase 1 (preservar):** API externa, Webhooks, MCP, GraphQL pública,
requisição HTTP em automações, marketplace, billing complexo, SSO avançado,
impersonation, app mobile nativo, automações/IA avançadas, analytics avançado,
permissões extremamente granulares.

## Fluxo de Desenvolvimento e Quality Gates

1. **BMAD** produz e valida a Story (`bmad-create-story` → `:validate`).
2. **Spec Kit** por Story: `specify` → `clarify` → `plan` → `checklist` → `tasks` →
   `analyze`. Quando já existe implementação parcial, usa-se `converge` para
   classificar o código (compatível / ajustável / divergente / fora do escopo) e
   produzir plano de convergência — sem reabrir decisões BMAD sem contradição provada.
3. **Gates pré-código:** `context7-check` (baseline técnica) + `pre-implementation-check`
   (GO / GO WITH CONDITIONS / NO-GO).
4. **Implementação** (`bmad-dev-story`) incremental, `safe-implementation`, dentro da
   allowlist/denylist da Story, com validação após cada bloco.
5. **Antes de concluir a Story:** `security-check` + `observability-check` +
   (quando aplicável) `lgpd-check`/`migration-check`/`backup-check`/`performance-check`/
   `ai-guardrails-check`/`cost-monitoring-check`; depois `code-review` e `commit-check`.
   `coolify-deploy-check` só antes de deploy real.
6. **Definition of Ready / Done** mínimas da Fase 1: deny-by-default, isolamento
   tenant, logs sem dados sensíveis, estados honestos de UX, migração/rollback,
   observabilidade, segurança, LGPD, contratos cross-epic, invariantes sem regressão.

Não se faz commit antes do `commit-check`; não se faz push/deploy sem autorização
explícita; não se avança para a próxima Story antes de concluir a atual.

## Governance

Esta Constitution supersede práticas conflitantes. **Emendas** exigem: proposta
escrita, justificativa, avaliação de impacto nos artefatos autoritativos e nos
templates do Spec Kit, e versionamento semântico:
- **MAJOR:** remoção/redefinição incompatível de princípio ou governança.
- **MINOR:** novo princípio/seção ou expansão material de orientação.
- **PATCH:** clarificações e ajustes não semânticos.

**Revisão de conformidade:** todo `plan`/`analyze`/`code-review` MUST verificar
aderência aos princípios I–XI; violações bloqueiam avanço até correção ou emenda
aprovada. Complexidade adicional MUST ser justificada. Contradições reais entre
artefatos são registradas (não silenciadas) e escaladas ao dono.

**Version**: 1.0.0 | **Ratified**: 2026-07-12 | **Last Amended**: 2026-07-12
