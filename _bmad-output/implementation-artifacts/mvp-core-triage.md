# Triagem de release — Core MVP (79 Stories)

> Artefato de **planejamento de release**, não normativo. Não altera PRD/UX/Architecture Spine/epics.
> Nada aqui marca Story como `done`: adiadas permanecem no backlog com a classificação abaixo.
> Legenda risco: **C** = crítico (auth/authz/RLS/PII/migration/backup) · **N** = normal · **B** = baixo.

## Definição do CORE aplicada

Jornada mínima de um primeiro cliente: **autenticar → resolver Organização → isolamento RLS →
autorização mínima → casca navegável → criar/usar um Pipe → configurar Fases → construir/publicar o
Formulário inicial → criar Card por submissão → ver no Kanban → mover entre Fases → ver histórico**,
com recuperação (backup/restore/rollback) e observabilidade das operações críticas.

**Pré-requisito operacional (decisão sinalizada):** não há autocadastro (`disableSignUp`), e o painel
de convites (Épico 8) está em WAVE 2. Logo, a **criação do primeiro tenant (Organização + primeiro
Admin) precisa de um caminho controlado de provisionamento** (seed/rotina de ops versionada, papel de
migrator), não da UI de convites. Isso é CORE (P0, sem ele não há jornada) e vira uma **tech story**
(`tech-2-provisionamento-de-tenant`). Toca a jornada operacional principal — registrado como decisão a
confirmar ao iniciar o Lote 1.

---

## CORE (indispensável à primeira operação)

| Story | Dep. | Risco | Lote | Justificativa (1 frase) |
|---|---|---|---|---|
| 1.1 esqueleto | — | — | L0 ✅done | Base do monorepo/health. |
| 1.2 RLS multi-tenant | 1.1 | C | L0 ✅done | Isolamento-mãe por Organização. |
| 1.3 contexto de Organização | 1.2 | C | L0 ✅done | Resolve e propaga o tenant com segurança. |
| 1.4 login + resolução inicial | 1.2,1.3 | C | L0 ✅done | Autenticação real + contexto inicial. |
| tech-2 provisionamento de tenant | 1.2,1.4 | C | L1 | Cria o 1º Org+Admin sem depender de convites (E8=WAVE2). |
| 1.5 sessão/logout/proteção de rota | 1.4 | N | L1 | Continuidade de sessão + logout; sessão não dispensa revalidar Membership. |
| 1.6 substrato de autorização (CASL) | 1.2–1.4 | C | L1 | Deny-by-default por papel efetivo — autorização do produto. |
| 1.7 casca navegável + design system | 1.4,1.6 | N | L1 | Sidebar/Topbar/tokens — sem casca ninguém opera. |
| 1.8 estados honestos + a11y essencial | 1.7 | N | L1 | Loading/vazio/erro/negado + WCAG AA base (a11y é fixa). |
| 2.1 ciclo de vida de Pipes | E1 | C | L2 | Criar/arquivar Pipe (nova tabela + RLS). |
| 2.3 gerenciamento de Fases | 2.1 | N | L2 | Fases do Pipe — o fluxo do Card. |
| 2.4 form builder + campos canônicos | E1,2.1 | C | L3 | Construir o Formulário inicial (novas tabelas + RLS). |
| 2.6 publicação de Formulários | 2.4 | N | L3 | Rascunho→publicar→usar. |
| 2.7 submissão interna → cria Card | 2.6 | C | L4 | Cria o Card + write-side append-only do Histórico (idempotência). |
| 2.9 Kanban + espaço do Card | 2.7 | N | L4 | Ver/abrir Cards por Fase, só ações permitidas. |
| 2.11 ciclo de vida do Card | 2.9 | N | L4 | Abrir/fechar/arquivar Card. |
| 2.14 movimentação + regras de transição | 2.9,2.11 | C | L5 | Mover Card entre Fases com preflight/autorização. |
| 2.17 histórico do Card (read-side) | 2.7 | N | L5 | Timeline auditável do Card (item 11: auditar). |

**Cross-cutting P0 (Lote 6 — recuperação/observabilidade):** backup+restore comprovados, rollback
comprovado, observabilidade/alertas, smoke, E2E da jornada. Débitos de staging: **CR-09** (/ready na
borda), **D-01** (IPs do proxy Coolify), **D-02** (CIDR), **D-05** (agendador do db:cleanup), **D-06**
(rate limiter transacional pode 500 sob rajada a `/api/auth/*` — Trilha A/Backend; realocado de tech-2
em 2026-07-13, ver `gates/1-5/summary.md`). Cada débito tem responsável e critérios próprios; todos
**bloqueiam `STAGING APPROVED`**.

## WAVE 2 (cliente opera temporariamente sem)

| Grupo | Stories | Risco | Justificativa |
|---|---|---|---|
| Segurança self-service da conta | 1.10, 1.11, 1.12, 1.13 | C/N | Recuperação/perfil/troca de senha/e-mail — gated em porta de e-mail; admin re-provisionado por ops no início. |
| Troca de Organização | 1.9 | N | Só importa com >1 Membership; 1.4 já resolve seleção no login. |
| Administração e membros | 8.1–8.7 | C/N | Convites/papéis/roster — onboarding de equipe; gated em e-mail transacional. |
| Auditoria administrativa | 8.8 | N | Trilha de mudanças administrativas — segue o Épico 8. |
| Acesso granular por Pipe/Card | 2.2, 2.10 | C | Papéis por Pipe/Card; no CORE o Admin acessa tudo (default seguro). |
| Evolução de campos | 2.5 | N | CORE configura→publica→usa; evolução pós-publicação é refinamento. |
| Formulário público + triagem | 2.8 | C | Submissão externa — expansão, não a jornada interna. |
| Prazos/saúde/Formulário de Fase | 2.12, 2.13, 2.15, 2.16 | N | SLA temporal, health, form de Fase, evento canônico opt-in — refinamento do fluxo. |
| Perfil: Pipes relacionados | 2.18 | B | Integração de perfil. |
| Databases/Registros/Arquivos | 3.1–3.9 | C/N | Estrutura de dados separada da jornada Pipe→Card. |
| Tarefas/Solicitações/Notificações | 5.1–5.4, 5.6 | N | Colaboração e avisos — jornada CORE funciona sem. |
| Dashboard/Busca | 7.1–7.4 | N | Casca do Dashboard entra em 1.7; conteúdo e busca são WAVE 2. |

## PÓS-MVP (refinamento/expansão/automação/IA/integração)

| Grupo | Stories | Justificativa |
|---|---|---|
| Automações internas | 4.1–4.9 | Motor evento→condição→ação; expansão. |
| E-mails/Templates/IA | 6.1–6.9 | Outbound + IA — gated e não essencial. |
| Tempo real | 5.5, 5.7 | Socket.IO e integração com Automação. |
| FR-32 avatar | 3.10 | Integração de avatar. |
| Relatórios agregados | 7.5 | Relatórios avançados. |

---

## Mapa de lotes verticais (CORE)

- **L0 ✅** — Fundação + Login (1.1–1.4). **DONE.**
- **L1 — Sessão, Autorização e Casca** (tech-2, 1.5, 1.6, 1.7, 1.8): entra-se, navega-se com segurança, autorização deny-by-default. *Risco do lote: C (1.6).*
- **L2 — Pipes e Fases** (2.1, 2.3): Admin cria um Pipe com Fases. *C (RLS de novas tabelas).*
- **L3 — Formulários** (2.4, 2.6): construir e publicar o Formulário inicial. *C.*
- **L4 — Cards e Kanban** (2.7, 2.9, 2.11): submeter→Card→Kanban→ciclo de vida. *C (2.7).*
- **L5 — Movimentação e Histórico** (2.14, 2.17): mover Card entre Fases + timeline. *C (2.14).*
- **L6 — Recuperação e Observabilidade** (cross-cutting P0): backup/restore/rollback/alertas/E2E + débitos de staging.

Contagem CORE: **4 done + 13 a implementar** (incl. 1 tech story) em **6 lotes**.
