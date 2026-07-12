# Sprint Plan & Roadmap — Giraffe CRM · Fase 1

**Date:** 2026-07-12 · **Autor:** John (PM) · **Base:** PRD/UX/Architecture Spine (final) · `epics.md` · Readiness `READY WITH TRACKED GATES`.
**Companion:** `sprint-status.yaml` (rastreador canônico de status). **Regra global:** nenhum código nesta etapa; nenhuma decisão D1–D6 reaberta; datas/velocidade/capacidade **não inventadas**.

---

## 1. Resumo executivo
O plano organiza **79 Stories em 8 Épicos** na ordem de execução aprovada `E1 → E8 → E2 → E3 → E4 → E5 → E6 → E7`, em **9 ondas de entrega** derivadas de dependências reais. O trabalho segue **slices verticais demonstráveis**, com **contratos compartilhados implementados uma única vez** (Membership/Auditoria, Motor de Automação, Fonte de Notificações, Capacidade de Arquivos, Form Builder, Read-models). **~20 gates** de pré-implementação estão amarrados às Stories/projeções exatas que bloqueiam — a codificação de uma Story só inicia com seu gate fechado e sua Definition of Ready satisfeita. Estimativas são por **Sprint lógica** (não temporal), pois não há dados de equipe/velocidade.

## 2. Artefatos analisados (autoritativos, finais)
- `prds/prd-giraffe-crm-2026-07-11/prd.md`
- `ux-designs/ux-giraffe-crm-2026-07-11/DESIGN.md` + `EXPERIENCE.md`
- `architecture/architecture-giraffe-crm-2026-07-11/ARCHITECTURE-SPINE.md`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/implementation-readiness-report-2026-07-12.md`

## 3. Ordem dos Épicos (macro)
`E1 Fundação → E8 Administração/Membros/Auditoria → E2 Pipes/Cards/Formulários → E3 Databases/Registros/Arquivos → E4 Automações → E5 Tarefas/Solicitações/Notificações → E6 E-mail/IA → E7 Visibilidade`. Não reordenar sem contradição comprovada.

## 4. Grafo de dependências (contratos-seam)
```text
E1 (identidade, tenancy, RLS, CASL, casca, Perfil)
 ├──> E8  (Membership + Auditoria + Preflight/Evento)  ──contratos──┐
 ├──> E2  (Pipes/Cards/Fases/Form Builder/Evento canônico 2.16/Histórico)
 │        └── consome contrato Membership (E8)
 ├──> E3  (Databases/Registros; Capacidade de Arquivos 3.7; Vínculo 3.9)  [usa Form Builder 2.4]
 ├──> E4  (Motor + Contrato de extensão 4.9)  [usa 2.16/2.14/2.15/2.17, 3.4/3.6/3.9]
 ├──> E5  (Tarefas/Solicitações; Fonte de Notificações 5.3-5.6)  [usa E8 Membership, E2, E3/3.7, E4/4.9 via 5.7]
 ├──> E6  (E-mail/Templates; IA)  [usa E3/3.7, E4/4.9, E5/5.6]
 └──> E7  (Read-models 7.1; Dashboard/Busca/Relatórios)  [usa E1/1.7, E2, E3, E5/5.4, contrato Membership]
Contratos entregues 1x: Membership+Auditoria (E8) · Evento canônico+Movimentação (E2) · Form Builder (E2/2.4) ·
Capacidade de Arquivos (E3/3.7) · Motor+Extensão (E4/4.9) · Fonte de Notificações (E5/5.3-5.6) · Read-models (E7/7.1)
```
**Sem ciclos de implementação** — cada seam é consumido em uma direção por vez.

## 5. Roadmap por ondas

### Onda 1 — Fundação técnica e identidade (E1)
- **Objetivo:** base executável, multi-tenant, autenticada e navegável.
- **Valor demonstrável:** login real → Dashboard (casca) isolado por Organização; Perfil; recuperação/step-up.
- **Stories:** 1.1→1.13.
- **Entradas:** stack seed (Spine). **Contratos entregues:** tenancy/RLS (1.2), contexto de Org (1.3), authz efetiva/CASL (1.6), casca+design system (1.7/1.8), step-up reutilizável (1.12/1.13), contrato estável de Membership (base 1.2/1.3/1.4).
- **Gates:** limites de senha/rate limit/antiabuso (1.3/1.10); porta de e-mail transacional (1.10); step-up (1.12/1.13).
- **Critérios de saída:** 1.1–1.9 concluídas liberam E8/E2; isolamento tenant provado (INV base); estados honestos (UX-DR6) na casca.
- **Riscos:** RLS/propagação de contexto mal isolada (vazamento tenant). **Paralelização:** 1.7/1.8 (UX) em paralelo a 1.5/1.6 após 1.4.

### Onda 2 — Administração e Membership (E8)
- **Objetivo:** governança de membros + Auditoria (write-side) + contratos consumidos por E2/E3/E5/E7.
- **Valor demonstrável:** convidar → aceitar → papéis → suspender/remover, tudo auditável.
- **Stories:** 8.1→8.8.
- **Entradas:** E1 (identidade/authz/step-up/e-mail transacional). **Contratos entregues:** Membership (ciclos), Preflight+Evento pós-alteração, write-side de Auditoria (8.2), read-side (8.8).
- **Gates:** provedor/identidade de e-mail transacional + token/rate limit/antiabuso (8.2); step-up (8.4/8.5/8.6); invalidação de sessão/abilities (8.4/8.5/8.6); proteção atômica do último Admin (8.4); retenção da Auditoria (8.8, pré-produção).
- **Critérios de saída:** contrato de Membership + Auditoria estáveis e publicados; INV-ADMIN-01/02, INV-AUDIT-01 provados.
- **Riscos:** contrato E8→consumidores incompleto (watch point); gates de e-mail/step-up tardios. **Paralelização:** 8.4→8.5→8.6 em série; 8.8 após 8.2.

### Onda 3 — Núcleo operacional Pipe/Card (E2)
- **Objetivo:** processos de trabalho + Form Builder + evento canônico de movimentação.
- **Valor demonstrável:** criar Pipe/Fases/Formulário, submeter → Card no Kanban, mover Card com Histórico.
- **Stories:** 2.1→2.18.
- **Entradas:** E1 + contrato Membership (E8). **Contratos entregues:** Form Builder (2.4), preflight de movimentação (2.14/2.15), **evento canônico opt-in (2.16)**, write/read-side Histórico do Card (2.7/2.17).
- **Gates:** Campo Arquivo indisponível até E3/AD-28 (2.4); autorização de triagem pública (2.8).
- **Critérios de saída:** evento canônico 2.16 e serviço de movimentação disponíveis para E4/E5/E7.
- **Riscos:** dependência circular 2.14/2.15 (resolvida por preflight); idempotência de submissão. **Paralelização:** 2.1/2.2/2.3 e 2.4/2.5/2.6 em blocos; 2.10 antes de 2.11–2.13.

### Onda 4 — Databases e Arquivos (E3)
- **Objetivo:** dados estruturados + capacidade compartilhada de arquivos + vínculo Card↔Registro.
- **Valor demonstrável:** criar Database/Registros, anexar arquivos seguros, vincular Card↔Registro.
- **Stories:** 3.1→3.10.
- **Entradas:** E1, E2 (Form Builder 2.4, Card 2.9, Históricos). **Contratos entregues:** capacidade de arquivos (3.7 → E5/E6/avatar), Histórico do Registro (3.4/3.6).
- **Gates:** OQ-47 storage + AD-28 (3.7); limites numéricos de arquivo/anexo (3.7/3.8).
- **Critérios de saída:** 3.7 disponível antes dos anexos de E5/E6 e do avatar (3.10/2.18).
- **Riscos:** segurança de arquivos (acesso cruzado), fail-closed. **Paralelização:** 3.1/3.2/3.3 → 3.4; 3.7 é pré-requisito de 3.8/3.10.

### Onda 5 — Motor de Automação (E4)
- **Objetivo:** motor Evento→Condição→Ação + contrato de extensão (4.9).
- **Valor demonstrável:** Automação move Card/cria Registro relacionado com trilha de Execuções, sem ciclos.
- **Stories:** 4.1→4.9.
- **Entradas:** E1, E2 (2.14/2.15/2.16/2.17), E3 (3.4/3.6/3.9). **Contratos entregues:** motor + **contrato tipado 4.9** (consumido por E5/E6).
- **Gates:** OQ-26 (Ação↔Template versionado) 4.9; limites do motor (profundidade/tentativas/timeout/retenção/dead-letter) 4.6/4.7; outbox/idempotência/concorrência (Arquitetura).
- **Critérios de saída:** 4.9 disponível antes de 5.7 e 6.6/6.9.
- **Riscos:** idempotência/at-least-once; encadeamento cíclico. **Paralelização:** 4.3/4.4/4.5 após 4.1/4.2; 4.9 após 4.5–4.8.

### Onda 6 — Trabalho operacional e Notificações (E5)
- **Objetivo:** Tarefas/Solicitações + fonte única de Notificações + integração com E4.
- **Valor demonstrável:** Tarefa com prazo/atraso; Notificações consistentes (badge/popover/página) em tempo real.
- **Stories:** 5.1→5.7.
- **Entradas:** contrato Membership (E8), E2 (Card/2.16), E3 (3.7), E4 (4.9). **Contratos entregues:** fonte de Notificações (5.3-5.6, consumida por E6/E8/E7).
- **Gates:** scheduler/timezone/idempotência temporal ("Tarefa atrasada") 5.1; OQ-33 distribuição 5.6; AD-28 anexos 5.1/5.2; AD-21 tempo real 5.5.
- **Critérios de saída:** fonte de Notificações disponível antes do badge (7.3) e dos tipos de E6/E8.
- **Riscos:** duplicação de mecanismo de Notificação; defasagem tempo real×fonte. **Paralelização:** 5.1‖5.2; 5.3→5.4→5.5; 5.3→5.6; 5.7 por último.

### Onda 7 — Comunicação e IA assistiva (E6)
- **Objetivo:** e-mail outbound real + Templates versionados + IA assistiva com guardrails.
- **Valor demonstrável:** compor/enviar e-mail por Card com histórico; IA sugere e-mail/resumo (revisável); IA como Ação sob aprovação humana.
- **Stories:** 6.1→6.9 (dois blocos paralelos: E-mail 6.1-6.6 · IA 6.7-6.9).
- **Entradas:** E3 (3.7), E4 (4.9), E5 (5.6). **Contratos consumidos:** Motor 4.9, Fonte de Notificações 5.6.
- **Gates:** OQ-28 provedor/identidade/SPF-DKIM-DMARC (6.4); limites de e-mail/anexo (6.4/6.5); OQ-32 IA modelo/região/retenção (6.7); OQ-43..46 LGPD/transferência (pré-produção); AD-28.
- **Critérios de saída:** e-mail e IA fail-closed até gates; guardrails NFR-17/AD-20 provados.
- **Riscos:** custos de IA; prompt injection; entrega de e-mail. **Paralelização:** bloco E-mail ‖ bloco IA; 6.4 não espera 6.3.

### Onda 8 — Visibilidade e read-models (E7)
- **Objetivo:** Dashboard, Busca Global, Relatórios sobre read-models derivados.
- **Valor demonstrável:** Dashboard com indicadores reais; Busca restrita à Org; Relatórios com filtros, sem dupla contagem.
- **Stories:** 7.1→7.5.
- **Entradas:** E1 (1.7), E2, E3, E5 (5.4), contrato Membership. **Contratos entregues:** read-models (7.1).
- **Gates:** NFR-28 (defasagem) / NFR-29 (desempenho) antes das projeções; índice/materialização tenant-safe (Arquitetura).
- **Critérios de saída:** coerência entre Dashboard/badge/Busca/Relatórios; INV-REPORT-01/02.
- **Riscos:** defasagem de read-models; vazamento por agregação. **Paralelização:** 7.2‖7.4‖7.5 após 7.1; 7.3 em paralelo (consome E1+E5).

### Onda 9 — Estabilização transversal e fechamento da Fase 1
- **Objetivo:** fechar gates de produção (LGPD OQ-43..46, retenção de Auditoria, backup/migração/RPO-RTO), hardening de segurança/observabilidade, validação de invariantes ponta a ponta.
- **Valor demonstrável:** Fase 1 pronta para go-live com compliance e observabilidade.
- **Gates:** LGPD/DPA/transferência; retenção/anonimização; backup/restore; migrações seguras.
- **Critérios de saída:** todos os gates 🔵 fechados; nenhuma regressão de invariante.

## 6. Plano de Sprints lógicas (sem tempo/velocidade)
> **Premissas declaradas:** sem tamanho de equipe/velocidade/duração conhecidos; sprints são **lógicas** (fatias coesas), estimativas **preliminares**; sequência real depende de capacidade a definir.

| Sprint lógica | Foco | Stories | Paralelização | Gates de entrada | Demonstração |
|---|---|---|---|---|---|
| S1 | Bootstrap tenant/auth | 1.1→1.6 | 1.7/1.8 após 1.4 | limites de senha (1.3) | login isolado por Org |
| S2 | Casca + conta | 1.7→1.13 | 1.7‖1.8; 1.11‖1.12 | e-mail transacional (1.10); step-up (1.12) | Perfil/recuperação/troca de Org |
| S3 | Admin core | 8.1→8.3 | — | e-mail transacional/token (8.2) | convite→aceite→Membership |
| S4 | Transições de Membership | 8.4→8.8 | 8.7 após 8.4-8.6; 8.8 após 8.2 | step-up + invalidação sessão (8.4-8.6) | papéis/suspensão/remoção auditados |
| S5 | Pipes/Fases/Form Builder | 2.1→2.6 | 2.1-2.3‖2.4-2.6 | — | Pipe+Formulário publicável |
| S6 | Card e movimentação | 2.7→2.17 | 2.10 antes de 2.11-2.13 | — | Card no Kanban, mover com Histórico+evento 2.16 |
| S7 | Databases/Registros | 3.1→3.6, 2.18 | 3.1-3.3→3.4 | — | Database+Registros+Histórico |
| S8 | Arquivos + vínculo + avatar | 3.7→3.10 | 3.8‖3.10 após 3.7 | OQ-47/AD-28 + limites (3.7) | anexos seguros + Card↔Registro + avatar |
| S9 | Motor de Automação | 4.1→4.9 | 4.3-4.5 após 4.1-4.2 | OQ-26 + limites do motor (4.7/4.9) | Automação com trilha, sem ciclos |
| S10 | Trabalho + Notificações | 5.1→5.7 | 5.1‖5.2; 5.3→5.4/5.6→5.5 | scheduler (5.1); OQ-33 (5.6) | Tarefas + Notificações 3 superfícies |
| S11 | E-mail + IA | 6.1→6.9 | E-mail‖IA | OQ-28 (6.4); OQ-32 (6.7) | e-mail por Card + IA revisável/aprovada |
| S12 | Visibilidade | 7.1→7.5 | 7.2‖7.4‖7.5; 7.3‖ | NFR-28/29 (projeções) | Dashboard/Busca/Relatórios coerentes |
| S13 | Estabilização/compliance | (transversal) | — | LGPD/retenção/backup/migração | go-live-ready |

**Itens que não podem entrar juntos (mesma sprint):** 3.7 e suas dependentes 3.8/3.10 (gate antes); 4.9 e 5.7/6.6/6.9 (contrato antes); 5.6 e 7.3 (fonte antes); qualquer Story gated com seu gate ainda aberto.

## 7. Ordem completa das Stories
E1: 1.1→1.13 · E8: 8.1→8.8 · E2: 2.1→2.18 · E3: 3.1→3.10 · E4: 4.1→4.9 · E5: 5.1→5.7 · E6: 6.1→6.9 · E7: 7.1→7.5. **(79 Stories.)**

## 8. Paralelização segura (resumo)
- E1: `1.1→1.2→1.3→1.4`; depois `1.5/1.6` ‖ `1.7→1.8`; `1.9` após 1.4; `1.10/1.11/1.12/1.13` após 1.5/1.6 (12/13 reutilizam step-up).
- E8: `8.1→8.2→8.3`; `8.4→8.5→8.6`; `8.7` após 8.4-8.6; `8.8` após 8.2.
- E2: `2.1/2.2/2.3` ‖ `2.4/2.5/2.6`; `2.7/2.8` após 2.6; `2.9→2.10→2.11→2.12→2.13`; `2.14→2.15→2.16→2.17`; `2.18` suporte.
- E3: `3.1/3.2/3.3→3.4→3.5/3.6`; `3.7` (gate) → `3.8/3.10`; `3.9` após 3.4/3.6.
- E4: `4.1→4.2`; `4.3→4.4→4.5`; `4.6→4.7→4.8`; `4.9` último.
- E5: `5.1 ‖ 5.2`; `5.3→5.4→5.5`; `5.3→5.6`; `5.7` último.
- E6: `6.1→6.3/6.4/6.5→6.6` ‖ `6.7→6.8/6.9`.
- E7: `7.1→(7.2 ‖ 7.4 ‖ 7.5)`; `7.3` ‖ (consome E1+E5).

## 9. Matriz Story × dependências (por Épico, resumida)
| Épico | Dependências de entrada | Notas |
|---|---|---|
| E1 | stack seed (Spine) | 1.x internas em cadeia; 1.1 sem deps |
| E8 | E1 (1.4/1.5/1.6/1.7/1.8/1.12) | 8.x internas; contrato consumido depois |
| E2 | E1 + contrato Membership (E8) | 2.14↔2.15 via preflight (sem ciclo) |
| E3 | E1, E2 (2.4/2.9/2.17) | 3.7 pré-requisito de 3.8/3.10 |
| E4 | E1, E2 (2.14/2.15/2.16/2.17), E3 (3.4/3.6/3.9) | 4.9 consome 4.5-4.8 |
| E5 | contrato Membership, E2 (2.16), E3 (3.7), E4 (4.9 p/ 5.7) | 5.7 após 4.9 |
| E6 | E3 (3.7), E4 (4.9), E5 (5.6) | 6.6 após 4.9+6.2+6.4; 6.9 após 5.6 |
| E7 | E1 (1.7), E2, E3, E5 (5.4), contrato Membership | 7.1 base; 7.3 consome E5 |

## 10. Matriz Story × gates
| Gate | Dono | Stories/projeções bloqueadas | Momento máx. de fechamento | Evidência exigida | Consequência se aberto | Trabalho paralelo? |
|---|---|---|---|---|---|---|
| OQ-29 (E-mail↔Card 0..1, mec. A) | Produto | 6.1 | ✅ resolvido | decisão no PRD/epics | — | — |
| AD-28 (fail-closed) | Arq/Seg | 3.7/3.8, 5.1/5.2 (anexos), 6.4/6.5/6.7-6.9, 3.10 | antes do código gated | infra de habilitação em runtime | features gated inativas | estrutura sim, runtime não |
| OQ-47 storage | Arq/Seg | 3.7 | antes de 3.7 | design de storage/quarentena/entrega | sem arquivos | 3.1-3.6 seguem |
| Limites arquivo/anexo | Prod/Seg | 3.7/3.8/6.5 | antes das Stories de upload | valores numéricos aprovados | upload indefinido | sim |
| OQ-26 Ação↔Template (versionado) | Arq | 4.9, 6.6 | antes de 4.9/6.6 | semântica de versão fechada | referência órfã/mutável | resto de E4 segue |
| Limites do motor | Prod/Arq | 4.6/4.7 | antes de 4.6/4.7 | profundidade/tentativas/timeout/retenção/dead-letter | ciclos/estouro | 4.1-4.5 seguem |
| Scheduler/timezone/idempotência temporal | Arq | 5.1 (Evento atraso), 5.7 | antes de 5.1 (evento) | design de scheduler + fuso | duplicidade/atraso incorreto | resto de 5.1 segue |
| OQ-33 distribuição Notificações | Arq/Prod | 5.6 | antes de 5.6 | resolução/dedup/fan-out/limites | distribuição simulada | 5.1-5.5 seguem |
| OQ-28 provedor e-mail (SPF/DKIM/DMARC) | Prod/Arq/Seg | 6.4/6.5/6.6 | antes de 6.4 | provedor/identidade/cofre | sem envio real | 6.1-6.3 seguem |
| Limites de e-mail | Prod/Seg | 6.4/6.5 | antes de 6.4 | limites por usuário/Org/intervalo | abuso/marketing | sim |
| OQ-32 IA modelo/região/retenção | Prod/Jur/Arq | 6.7-6.9 | antes de 6.7 | provedor/modelo/região/retenção | IA inativa | E-mail segue |
| OQ-43..46 LGPD/transferência | Jurídico | ativação de IA/e-mail/arquivos/Auditoria | pré-produção | base legal/DPA/transferência | bloqueio de go-live | dev estrutural segue |
| NFR-28 defasagem | Prod/Arq | 7.1/7.5 (projeções) | antes das projeções | limite por superfície | dado antigo como atual | E7 estrutura segue |
| NFR-29 desempenho | Prod/Arq | 7.1/7.5 (projeções) | antes das projeções | volume/latência-alvo | sem meta de desempenho | idem |
| Limites de senha/rate limit | Prod/Seg | 1.3/1.10, 8.2 | antes de 1.10/8.2 | requisitos numéricos | brute force | 1.1-1.9 seguem |
| Step-up | Segurança | 1.12/1.13, 8.4/8.5/8.6 | antes das Stories | regras de step-up | operações sensíveis frágeis | resto segue |
| Invalidação sessão/abilities | Arquitetura | 8.4/8.5/8.6 | antes das transições | mecanismo de revogação | acesso residual pós-mudança | 8.1-8.3 seguem |
| Proteção último Admin | Arq/Seg | 8.4 | antes de 8.4 | garantia atômica | Org sem Admin | resto de E8 segue |
| Retenção Auditoria | Gov/LGPD | 8.8 (produção) | pré-produção | política de retenção | não conformidade | consulta operacional segue |
| Backup/migração/RPO-RTO | Arq/Gov | transversal (produção) | pré-produção | design de backup/migração | perda/rollback inviável | dev segue |

## 11. Matriz Story × skills/checks (por tipo de trabalho — executar no ciclo da Story, não agora)
| Tipo de Story | Checks aplicáveis |
|---|---|
| Toda Story (base) | `context7-check` (antes de usar libs) · `pre-implementation-check` (DoR) · `safe-implementation` · `code-review` · `commit-check` |
| Tenancy/authz (1.2/1.3/1.6, 2.2/2.10, 3.2, todas com dados de Org) | + `security-check` |
| Dados pessoais / LGPD (1.11/1.13, 3.7/3.10, 5.3/5.6, 6.x, 8.2/8.8) | + `lgpd-check` |
| Eventos/filas/observabilidade (2.16, 4.6-4.8, 5.3-5.5, 8.8) | + `observability-check` |
| Migrações/estado persistente (1.2, 2.x/3.x que criam entidades, 8.x) | + `migration-check` |
| Backup/retention (3.7, 8.8, 5.3) | + `backup-check` |
| Read-models/agregação/tempo real (5.5, 7.1-7.5) | + `performance-check` |
| IA (6.7/6.8/6.9, 4.9 IA-como-Ação) | + `ai-guardrails-check` · `cost-monitoring-check` |
| Deploy/infra (fechamento de onda) | + `coolify-deploy-check` |

## 12. Definition of Ready (DoR) — por Story, antes de `bmad-create-story`/dev
Narrativa+ACs completos · dependências anteriores concluídas · contrato cross-epic disponível · **gate aplicável fechado (com evidência)** · UX necessária disponível · decisões arquiteturais suficientes · estratégia de dados/migração definida · autorização/tenancy definidas · observabilidade definida · segurança/LGPD avaliadas · testes previstos · nenhuma contradição aberta.

## 13. Definition of Done (DoD) — mínima Fase 1
ACs validados · testes automatizados · **autorização deny-by-default** · **isolamento tenant** provado · logs estruturados **sem dados sensíveis** · tratamento de erros · **estados honestos de UX** · documentação técnica atualizada · **migração segura + rollback aplicável** · observabilidade · segurança · LGPD · **code-review** · **validação dos contratos cross-epic** · **sem regressão de invariantes** (FORM-01/NOTIF-01/REPORT-01-02/ADMIN-01-02/AUDIT-01/WORK-01-02).

## 14. Riscos e mitigação
| Risco | Severidade | Mitigação |
|---|---|---|
| Gates tardios (e-mail/IA/limites) | Média | fechar na Arquitetura/Segurança **antes** de sequenciar a Story; não iniciar código gated |
| Duplicação de mecanismo (motor/builder/fonte/read-model) | Média | contratos únicos (4.9/2.4/5.3-5.6/7.1) — proibir reimplementação; validar no code-review |
| Vazamento tenant | Alta | RLS+CASL desde 1.2/1.6; `security-check` em toda Story com dados de Org |
| Idempotência (submissão/motor/e-mail/Notificação/vínculo) | Alta | chaves idempotentes por evento/ação; outbox; `pre-implementation-check` |
| Migração | Média | `migration-check` + rollback na DoD |
| Custos de IA | Média | `cost-monitoring-check` + limites/circuit breaker (6.7) |
| Defasagem de read-models | Média | NFR-28/29 fechados; estados honestos (defasado) na UX |
| Dependências grandes (Stories volumosas) | Baixa | fatiar por contrato write/read-side (já aplicado 4.x/8.8) |
| Seam E4↔E5 | Baixa | 5.7 após 4.9 e núcleo E5 (watch point) |
| Contrato E8→consumidores | Baixa | validar "fechamento do laço" na integração de E2/E3/E5 |
| Propriedade compartilhada FR-5 | Baixa | E5 fonte/operação, E7/7.3 superfície — registrado |

## 15. Milestones demonstráveis
M1 (fim E1): login multi-tenant + Perfil. M2 (fim E8): governança de membros auditável. M3 (fim E2): Pipe→Card→movimentação com Histórico. M4 (fim E3): Databases/Registros/arquivos/vínculos. M5 (fim E4): Automações rastreáveis. M6 (fim E5): Tarefas + Notificações. M7 (fim E6): e-mail + IA assistiva. M8 (fim E7): Dashboard/Busca/Relatórios. M9: compliance/go-live-ready.

## 16. Critérios de conclusão por Épico
Todas as Stories do Épico em `done`; contratos do Épico publicados e consumidos sem duplicação; invariantes do Épico provados; gates do Épico fechados (ou explicitamente diferidos a pré-produção); retrospectiva (opcional) considerada.

## 17. Sequência para `bmad-create-story`
Ciclo por Story: **`bmad-create-story` (CS) → `bmad-create-story:validate` (VS) → fechar gate aplicável → `bmad-dev-story` (DS) → `bmad-code-review` (CR)** → próxima Story; `bmad-retrospective` (ER) ao fim de cada Épico. Ordem de seleção = ordem da fila (execução), começando por E1.

## 18. Primeira Story recomendada
**`1-1-esqueleto-executavel-e-ambiente-base`** (Story 1.1 — Esqueleto executável e ambiente base). Sem gate bloqueador; sem dependências anteriores; habilita todo o resto.

## 19. Próxima ação exata
```
/bmad-create-story
```
(prepara a próxima Story da fila — 1.1 — em contexto novo; depois `/bmad-create-story` no modo validate.)

## 20. Artefatos gerados por esta etapa
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (rastreador canônico)
- `_bmad-output/implementation-artifacts/sprint-plan-roadmap-2026-07-12.md` (este roadmap/plano)
