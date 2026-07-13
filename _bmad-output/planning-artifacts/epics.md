---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories, step-04-final-validation]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-giraffe-crm-2026-07-11/prd.md
  - _bmad-output/planning-artifacts/ux-designs/ux-giraffe-crm-2026-07-11/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-giraffe-crm-2026-07-11/EXPERIENCE.md
  - _bmad-output/planning-artifacts/architecture/architecture-giraffe-crm-2026-07-11/ARCHITECTURE-SPINE.md
---

# Giraffe CRM — Fase 1 - Epic Breakdown

## Overview

Este documento decompõe os requisitos aprovados do Giraffe CRM — Fase 1 (PRD `status: final`, PASS no Reviewer Gate), do contrato de UX (`DESIGN.md` + `EXPERIENCE.md`, final) e do Architecture Spine (`AD-1..AD-34`, final) em Épicos e Stories implementáveis. **Passo 1 (este):** inventário de requisitos com rastreabilidade à origem — sem Épicos nem Stories. Decisões de Produto D1–D6 são baseline fechada e não são reabertas.

## Requirements Inventory

### Functional Requirements

> Origem: `prd.md` §4 (FR-1..FR-34). Cada FR remete às RNs e decisões (Dx.y) do PRD; `docs/01-documentacao-base/03-regras-de-negocio` é fonte auxiliar de conferência das RNs.

**Login e Sessão**
- **FR-1 — Autenticação de usuário:** credenciais válidas autenticam; inválidas rejeitadas sem revelar existência de conta; sucesso → Dashboard (RN-011); logout → Login (RN-012). Mecanismo técnico = Arquitetura.
- **FR-2 — Sessão do usuário:** sessão persiste entre ações; logout invalida a sessão corrente imediatamente (RN-012); pós-logout, ações protegidas voltam a exigir login. Duração/renovação/formato = Arquitetura.
- **FR-3 — Recuperação de senha (R6/D6.1):** recuperação por e-mail com resposta neutra; link de uso único/expirável; ao redefinir revoga todas as sessões da Account; política única de senha; escopo global da Account (não altera Memberships). Token/rate limit/hashing = Segurança/Arquitetura.

**Dashboard e Busca**
- **FR-4 — Visão inicial da operação:** grade real de Pipes e Databases da Organização atual; todo indicador derivado de dados reais (RN-131). Catálogo/ordenação de indicadores (R6/D6.4).
- **FR-5 — Badge de notificações no Dashboard:** contagem real de não lidas (RN-081); "marcar todas como lidas" zera e persiste entre páginas (RN-082).
- **FR-6 — Busca global:** Pipes, Databases, Cards, Usuários e Notificações (RN-140); restrita à Organização atual (RN-141, NFR-3); respeita permissões efetivas (NFR-4).

**Pipes / Kanban / Cards**
- **FR-7 — Catálogo de Pipes:** consistente em todas as telas onde aparece (RN-024); atributos `locked`/`starred`; papéis por Pipe e ciclo de vida do Pipe (R1/D1.4, R2/D2.1).
- **FR-8 — Pipe composto por Fases:** cada Fase pertence a exatamente um Pipe (RN-030); gerenciamento de Fases criar/renomear/reordenar/arquivar/restaurar (R2/D2.2).
- **FR-9 — Card pertence a um Pipe e está em uma Fase:** não aparece fora do contexto do Pipe (RN-046); associação Card–Fase íntegra (NFR-5).
- **FR-10 — Status do Card:** `ok/atrasado/expirado/vencido/finalizado/arquivado`, distinto de Fase (RN-043); máquina de estados (ciclo de vida + saúde temporal, marcos por Fase) (R2/D2.3, D2.7).
- **FR-11 — Movimentação do Card entre Fases:** persiste a nova Fase; gera entrada no Histórico (FR-12); toda movimentação gera evento canônico e pode disparar Automação/Notificação opt-in, sem contornar confirmação humana (R2/D2.4, D2.5).
- **FR-12 — Histórico do Card:** cronológico, por item, append-only; núcleo + eventos condicionais e campos conceituais (R2/D2.6); distinto do Log/Auditoria (RN-170).
- **FR-13 — Conexão Card↔Registro:** N—N, vínculo explícito, autorização dupla, sem fusão de conceitos (RN-073, R3/D3.6).

**Formulários**
- **FR-14 — Três contextos independentes de Formulário:** inicial/Fase/Database, mesmo catálogo visual, configuração independente (INV-FORM-01; R3/D3.1, D3.2, D3.4).
- **FR-15 — Formulário inicial do Pipe:** captura na entrada; submissão cria novo Card (nunca preenche existente); acesso público controlado (R3/D3.3).
- **FR-16 — Formulário de Fase:** obrigatoriedade de campos bloqueia a transição; valores persistem e ficam visíveis após sair da Fase (R3/D3.3).
- **FR-17 — Formulário de Database:** define o schema visual do Registro; criação por submissão e por "Novo Registro" (R3/D3.2, D3.5).

**Database e Registros**
- **FR-18 — Catálogo de Databases:** real da Organização (RN-131); ciclo de vida, papéis e acesso por concessão (R3/D3.4).
- **FR-19 — Database mantém Registros:** cada Registro pertence a exatamente um Database (RN-063); ciclo de vida do Registro sem exclusão definitiva (R3/D3.5).
- **FR-20 — Visualização de Registros:** tabela com navegação uniforme (paginação, ordenação, filtros, estados) (R3/D3.4).

**Automações**
- **FR-21 — Modelo Evento→Condição→Ação:** ligado a exatamente um Pipe; ações internas (RN-100/101); catálogo de Eventos/Condições/Ações (R4/D4.1); integridade de referência Ação↔Template.
- **FR-22 — Gestão de Automação no Pipe:** ciclo de vida por Administrador da Org/Admin do Pipe; Membro do Pipe só visualiza (R4/D4.3).
- **FR-23 — Disparo de Automação:** só ativas avaliadas; Condição AND sobre o estado resultante; toda avaliação rastreável (NFR-6); comportamento do motor (R4/D4.2).

**E-mails e IA**
- **FR-24 — Composer e histórico de E-mail:** composição + histórico por Card; envio outbound real (R6/D6.5); recebimento/sincronização fora da Fase 1; associação E-mail↔Card 0..1 (D3.6).
- **FR-25 — Template de E-mail:** reutilizável, manual ou por Ação de Automação (RN-111); Templates da Organização com integridade de referência (R6/D6.5).
- **FR-26 — IA básica assistiva:** saída identificada (NFR-11), revisável (NFR-12), escopada (NFR-13), com fallback manual (NFR-14) e guardrail de confirmação (NFR-17); casos de uso = sugestão de e-mail, resumo de Card, IA como Ação (R4/D4.4, R6/D6.6); AI Builder fora da Fase 1.

**Tarefas, Solicitações, Notificações**
- **FR-27 — Visualização/acompanhamento de Tarefas:** prazo; `aberta/atrasada/concluída` ("atrasada" derivada) (RN-090); ciclo de vida (R5/D5.2).
- **FR-28 — Visualização/acompanhamento de Solicitações:** `aberta/resolvida` (RN-091); ciclo de vida + Responsável (R5/D5.2).
- **FR-29 — Notificações de fonte única:** badge, popover e página derivam da mesma fonte, com conteúdo/leitura/contagem consistentes (INV-NOTIF-01).
- **FR-30 — Notificação associada a Card:** catálogo de tipos, alvos, distribuição e estado lido/não-lido por destinatário (R6/D6.3).

**Relatórios, Perfil, Administração, Plataforma**
- **FR-31 — Indicadores de Relatórios reais e autorizados:** contadores derivados de dados reais e do escopo autorizado (RN-131/132/133); INV-REPORT-01/02; zero ≠ falha (NFR-27); catálogo e filtros (R6/D6.4).
- **FR-32 — Perfil:** visualização de dados próprios + contexto real da Organização; edição de nome/avatar/preferências, e-mail (2 etapas) e senha (step-up) (R6/D6.2).
- **FR-33 — Painel Administrativo da Organização:** administra somente a Org atual (RN-150/151/152); INV-ADMIN-01/02; gerenciamento de membros (R5/D5.1); Financeiro fora da Fase 1, Estatísticas sem módulo, Auditoria administrativa (R5/D5.3).
- **FR-34 — Super Admin:** Papel de Plataforma, referência separada da Organização, sem entrega operacional na Fase 1 (RN-160..163); INV-ADMIN-01 aplicável simetricamente.

### NonFunctional Requirements

> Origem: `prd.md` — "NFRs Transversais (consolidado)" (NFR-1..NFR-42), organizados nas 10 famílias canônicas. IDs preservados.

**1. Segurança de credenciais/segredos/operações sensíveis**
- **NFR-1** credenciais/segredos/sessão nunca em texto puro nem em logs/erros/auditoria/entradas de IA (FR-1/2, transversal).
- **NFR-2** login com limitação contra força bruta (FR-1).
- **NFR-9** credenciais de provedor e conteúdo sensível de e-mail protegidos em trânsito/repouso — condicional ao envio real (FR-24).
- **NFR-33** operações sensíveis de conta (e-mail/senha) exigem proteção adicional (FR-32).
- **NFR-38** operações administrativas sensíveis (remoção/papel/revogação) exigem proteção adicional (FR-33).

**2. Isolamento por Organização (multi-tenant)**
- **NFR-3 (canônico)** toda leitura/escrita/agregação respeita a Organização atual; nada cruza Organizações (todos os FRs de recurso organizacional). Aplicações: **NFR-13** (IA), **NFR-19** (Notificações), **NFR-24** (Relatórios), **NFR-30** (Perfil), **NFR-36** (Painel Admin).

**3. Autorização por permissões efetivas**
- **NFR-4 (canônico)** resultados/ações respeitam o papel efetivo (Admin da Org/Membro/Convidado); Super Admin sem acesso automático a dados de Org; modelo híbrido (Visualizar/Editar/Administrar + ações nomeadas) (FR-6 e todos os FRs organizacionais). Aplicações: **NFR-20** (Notificações), **NFR-25** (Relatórios, incl. INV-REPORT-01), **NFR-31** (Perfil), **NFR-37** (Painel Admin).

**4. Integridade e consistência de dados**
- **NFR-5** associação Card–Fase válida mesmo após renomear a Fase (FR-9).
- **NFR-26** mesmo indicador coerente em telas/momentos distintos (FR-31).
- **NFR-34** dados do Perfil refletem estado real e atual (FR-32).
- **NFR-41** dados do Painel Admin refletem estado real e atual (FR-33).
- **NFR-21** consistência de Notificações remetida a INV-NOTIF-01 (FR-29).

**5. Observabilidade (diagnóstico operacional)**
- **NFR-6** avaliação/execução de Automação rastreável (FR-23).
- **NFR-10** eventos de e-mail rastreáveis — condicional (FR-24/25).
- **NFR-15** uso/desempenho de IA monitoráveis (FR-26).
- **NFR-22** geração/entrega (ou não) de Notificações rastreável (FR-30).
- **NFR-27** falha/zero de indicador distinguíveis e diagnosticáveis (FR-31).
- **NFR-42** ações administrativas diagnosticáveis, distinto de log técnico (FR-33).

**6. Auditoria (trilha administrativa/conformidade)**
- **NFR-16** uso de IA gera trilha com metadados/contexto/decisão do usuário; sem exigir armazenamento integral de prompts (FR-26).
- **NFR-35** alterações em dados sensíveis de conta registradas (FR-32).
- **NFR-39** eventos administrativos definidos por Produto registrados de forma confiável (FR-33, INV-AUDIT-01).

**7. LGPD / proteção de dados pessoais**
- **NFR-8 (canônico)** tratamento de dados pessoais com finalidade/minimização/acesso autorizado/retenção/direitos do titular (FR-23 e todos os FRs com dados pessoais). Aplicações: **NFR-23** (Notificação), **NFR-32** (Perfil), **NFR-40** (membros/Auditoria).

**8. IA assistiva — transparência/revisão/guardrails**
- **NFR-11** saída sempre identificada como IA; **NFR-12** revisável/editável/descartável/regenerável antes de uso; **NFR-14** falha da IA não bloqueia o fluxo manual; **NFR-17 (guardrail)** IA não executa efeito operacional sem confirmação explícita; **NFR-18** consumo/custo monitorável (todos FR-26).

**9. Prevenção de execução cíclica (Automações)**
- **NFR-7** evita Automação disparar a si mesma ou gerar ciclo (FR-21/23).

**10. Desempenho e atualização**
- **NFR-28** defasagem máxima aceitável entre dado real e indicador (valor pendente) (FR-31).
- **NFR-29** meta mensurável de desempenho de indicadores agregados (meta pendente) (FR-31).

### Additional Requirements

> Origem: `ARCHITECTURE-SPINE.md` (AD-1..AD-34). São **restrições técnicas** que condicionam a decomposição/sequência de Épicos e Stories — não são requisitos de Produto. Cada AD tem Binds/Prevents/Rule no spine.

**Fundações estruturais (substrato de build)**
- **AD-1..AD-5** monólito modular (NestJS por domínio) + Next.js separado; kernel transversal mínimo; fronteiras de domínio invariantes (Pipe≠Database, Card≠Registro, Fase≠Status, Plataforma≠Organização); regras de dependência entre módulos; API interna versionada (não pública na Fase 1).
- **AD-6** isolamento multi-tenant: PostgreSQL compartilhado com `orgId`, deny-by-default + **RLS FORCE**, contexto de Org dentro da transação, papéis de banco separados (invariante-mãe, NFR-3).
- **AD-7** identidade Forma B: Account/User global · Membership (papel+estado) · `activeOrganizationId` de sessão; revalidação de Membership no servidor a cada requisição.
- **AD-8** propagação do contexto de Org a jobs/eventos/cache/arquivos/notificações/auditoria/logs.
- **AD-9** autorização CASL (action+subject+conditions), deny-by-default, aplicada em comandos/consultas/WebSocket/jobs/eventos/arquivos/Ações; principais: usuário/job/Automação/Plataforma.
- **AD-10/AD-14** propriedade de dados (Organização dona do operacional; Plataforma dona de Conta/Sessão/logs); fonte de verdade única (indicadores/cache derivados).
- **AD-11/AD-12** referências por ID estável tenant-safe com integridade dupla; versionamento de Formulário/Campo (valor não depende do nome).
- **AD-15** quatro trilhas separadas: Histórico do Card · Log operacional · Auditoria administrativa · Log técnico.

**Assíncrono e estado**
- **AD-13** mutação por eventos (Outbox transacional; domínio vs. integração; consumidores idempotentes).
- **AD-16** concorrência: sem sobrescrita silenciosa (mecanismo deferred por domínio).
- **AD-17** alteração destrutiva/migrations: nenhuma sem estratégia aprovada; expand-and-contract; validação de isolamento.
- **AD-18** motor de Automação em fila (BullMQ/Redis), pós-transação, revalidação no servidor, prevenção de ciclos (`executionChainId`, profundidade, dedup).
- **AD-19** semântica de entrega: reentrega possível → idempotência + retry/backoff/timeout/estado final/alerta.
- **AD-20** IA nunca produz efeito operacional direto: comando separado, autorizado e auditável; trilha de Execuções sanitizada.
- **AD-21** tempo real (Socket.IO) best-effort; fonte persistida é a autoridade; revalidar authz ao conectar/assinar/trocar Org; contratos de UI versionados.
- **AD-22** Notificações: separar conteúdo/evento do estado de leitura por destinatário; badge/popover/página da mesma fonte (INV-NOTIF-01).
- **AD-23** cache (Redis) derivado, tenant-scoped, nunca fonte de verdade nem base de authz; invalidação em mudança de papel/Membership.

**Capacidades gated e integrações**
- **AD-24** dependências externas atrás de portas por capacidade (e-mail/IA/storage); domínio não conhece SDKs.
- **AD-25** e-mail: composição/Template no escopo; envio/recebimento reais gated por Produto (OQ-28); credenciais de cofre.
- **AD-26** IA: modelo não é principal; assistiva, isolamento de contexto, minimização, anti prompt-injection, limites de custo, fallback; transferência internacional só quando dado é enviado (OQ-44); modelo/região/retenção = OQ-32.
- **AD-27** storage (MinIO): capacidade de arquivos condicional a Produto (OQ-47); buckets privados; URLs curtas; validação/quarentena/checksum; sem acesso cruzado.
- **AD-28 — Fail-closed de capacidades sensíveis (gate técnico de habilitação):** arquivos, envio outbound de e-mail e recursos de IA **pertencem ao escopo funcional aprovado da Fase 1** (R3/D3.5, R6/D6.5, R6/D6.6), mas devem permanecer **desabilitados/indisponíveis em runtime** enquanto seus pré-requisitos técnicos, de Segurança, Governança ou Jurídico não estiverem satisfeitos. O gate **não** altera o escopo de Produto nem reclassifica essas capacidades como posteriores; a ativação em produção pode depender de OQ-32, OQ-43..46 e das decisões técnicas relacionadas.

**Operação e governança**
- **AD-29** observabilidade (Pino/Sentry): logs estruturados, correlação, health, alertas; sanitização central (sem segredos/PII/prompts/corpos completos).
- **AD-30** Auditoria administrativa append-only, resistente a alteração pelo fluxo comum (INV-AUDIT-01); catálogo = OQ-38.
- **AD-31** segurança transversal: segredos de cofre; menor privilégio no acesso a logs/Sentry/Auditoria; alertas de segurança.
- **AD-32** deploy: conteinerizado (Docker Compose/Coolify), containers distintos, segredos fora do repo, ambientes separados, migrations como etapa controlada.
- **AD-33** backup/restore isolados por Organização, criptografados, testados (backup ≠ recuperabilidade).
- **AD-34** governança: Arquitetura entrega mecanismos de RPO/RTO/retenção/encerramento/residência; valores = Produto/Negócio/Jurídico (antes da produção).

**Seed e scaffolding (não há starter template imposto)**
- Sem starter/greenfield template específico no spine. **Épico 1 / Story 1** = scaffolding greenfield conforme o **Structural Seed** (Next.js web · NestJS API · Workers BullMQ · Socket.IO gateway · PostgreSQL+RLS · Redis · MinIO) e o **Stack Seed** (versões deferred, fixadas na implementação).
- Convenções de consistência (identificadores, eventos, estado&mutação, erros&logs, tempo real, contexto de tenant) do spine aplicam-se a todos os Épicos.
- Estrutura de monorepo, contratos detalhados da API interna, mecanismo de Outbox/idempotência/concorrência, retry/backoff, invalidação de cache, persistência física de valores de Registro (JSONB×colunas) e CI/CD = **deferred** (implementação).

### UX Design Requirements

> Origem: `DESIGN.md` (identidade/tokens) + `EXPERIENCE.md` (IA, estados, interações, acessibilidade, jornadas). Itens acionáveis para Stories com AC testáveis.

- **UX-DR1 — Sistema de design tokens:** cores neutras (Canvas/Soft Cloud/Hairline/Ink/Charcoal/Mute/Stone), laranja Giraffe (`#FF7200` + hover/pressed/accent/border), semânticas (destructive/success/info/warning); tipografia Inter (7 níveis); spacing base 8px; radius (botão 8/card 12/modal 16); elevation 0–2. Regras duras: `#FF7200` nunca é erro/sucesso; texto sobre laranja é `#111111`; laranja não é texto comum sobre branco.
- **UX-DR2 — Componentes de botão:** primário/secundário/terciário/destrutivo com as regras de cor do DESIGN (destrutivo `#D92D20`, nunca laranja; um CTA primário por região).
- **UX-DR3 — Sidebar item ativo:** `accent #FFF3E8` + ícone laranja (ou barra `#FF7200`), peso 600, `aria-current`; nunca sidebar inteira laranja; seleção não só por cor.
- **UX-DR4 — Chrome global:** Sidebar (navegação operacional dentro da Org atual) + Topbar (Busca Global, Notificações, Perfil, contexto da Organização).
- **UX-DR5 — Seletor de contexto de Organização (Forma B):** na topbar; aparece **somente com >1 Membership ativa**; troca explícita; pós-troca, navegação/dados/permissões refletem só a nova Org (NFR-3); contexto anterior descartado. *(reconcilia o item cross-stage do Architecture Spine)*
- **UX-DR6 — Sistema transversal de estados:** loading (skeleton) · vazio útil · erro (`destructive` + ícone + texto + recuperação) · sem permissão (sem revelar recurso, INV-REPORT-01) · pendente · aguardando (nunca aparência de sucesso). Regra: nunca só cor (semântica + texto + ícone + estrutura); zero legítimo ≠ falha (NFR-27).
- **UX-DR7 — Primitivas de interação:** seleção (fundo/borda + atributo semântico, não só laranja); foco `ring #CC5B00` sempre visível; hover discreto; drag-and-drop de Card com **alternativa por teclado/menu**; painel lateral contextual (reduz modais); reordenação com alternativa por teclado.
- **UX-DR8 — Piso de acessibilidade WCAG 2.2 AA:** teclado completo; ordem de foco lógica; foco visível; nome acessível para ícones; associação label/instrução/erro/campo; focus trap + retorno em modais; `prefers-reduced-motion`; `aria-live`; `aria-current`; área de toque 44×44 px em ações principais mobile.
- **UX-DR9 — Verificação de contraste do `ring #CC5B00`:** contra todos os fundos onde aparece (branco/accent/muted/seleção) — verificação de implementação (não decisão de Produto).
- **UX-DR10 — Card (detalhe) de três painéis:** Contexto | Execução atual | Ações (só ações aprovadas); responsivo (tablet: contexto recolhível; mobile: abas/seções). Distinções preservadas: Config. da Fase ≠ Execução no Card; Responsável da Fase ≠ Responsável atual; Histórico ≠ Log técnico.
- **UX-DR11 — Form Builder de três painéis:** biblioteca | canvas | configuração; página inteira (não modal); contexto (Pipe inicial/Fase/Database) sempre visível; reordenação com alternativa por teclado; "Destino dos Dados" em linguagem de negócio.
- **UX-DR12 — Database/tabela + painel lateral:** aparência informacional (≠ Kanban); navegação por teclado na tabela; abertura do Registro sem mouse; lista responsiva no mobile (sem rolagem lateral excessiva).
- **UX-DR13 — Automações (editor + Execuções):** editor "Quando → Condições → Então" compreensível sem depender só de cor/setas/posição (títulos + ordem + teclado); aba **"Execuções"** (o termo "logs" fica para observabilidade técnica); histórico operacional legível, sem payloads/segredos/prompts (NFR-1/16).
- **UX-DR14 — E-mails/Templates:** composer + aplicação de Template, responsivo; **sem caixa de entrada operacional** (outbound-only, D6.5); associação ao Card de contexto sem revelar acesso indevido.
- **UX-DR15 — IA contextual:** aparece no contexto, sempre rotulada como IA (NFR-11); estados gerado/aguardando/editado/aceito/descartado; **aceite ≠ efeito operacional** (confirmação explícita, NFR-17); sem estado "ação executada".
- **UX-DR16 — Notificações (3 superfícies):** badge + popover + página com estado consistente (INV-NOTIF-01); popover = subconjunto recente; página = conjunto completo autorizado; contagem no escopo user+Org.
- **UX-DR17 — Voz e tom + estados vazios úteis:** pt-BR, profissional/direto; linguagem de negócio (Database/Registro/Pipe/Card; evitar payload/schema); estados vazios orientam a próxima ação.
- **UX-DR18 — Responsividade:** breakpoints conceituais (desktop amplo/desktop/tablet/mobile); desktop-first para configuração, mobile para operação; **não comprimir** os três painéis (Card e Form Builder) — adaptar (empilhar/abas); sem rolagem lateral excessiva.
- **UX-DR19 — Key Flows de referência:** KF-1..KF-8 (entrar/orientar-se; mover Card; consultar Registro; acompanhar pendências/Notificação; revisar IA; administrar Org; configurar Formulário; configurar Automação), cada um com portões de pendência explícitos que não ampliam escopo.

### Pendências e Dependências (OQs abertas — dono/prazo)

> Origem: `prd.md` §8. Nenhuma bloqueia a **estruturação** dos Épicos; algumas condicionam Stories específicas. Não são reabertas nem presumidas.

- **OQ-26** (A · antes da Arquitetura de detalhe) — mecanismo de referência Ação↔Template e prevenção de ciclos → condiciona Stories de Automação/E-mail.
- **OQ-29** (P resolvido em D3.6: 0..1; **mecanismo = A**) — associação E-mail↔Card.
- **OQ-32** (A/J · antes da produção) — modelo/conta/região/retenção da IA → condiciona habilitação real de IA.
- **OQ-39** (P · futuro/Fase 2) — tela/escopo de Super Admin.
- **OQ-40/41/42** (P/A · antes da produção) — retenção, encerramento de Organização, RPO/RTO.
- **OQ-43/44/45/46** (J · antes de dados reais/produção) — base legal, papéis Controlador/Operador/DPO, transferência internacional/DPA, dados sensíveis.
- **OQ-49** (P · futuro/Fase 2) — busca multi-organização simultânea.
- **OQ-50** (P · antes da produção) — métricas quantitativas de negócio.
- **Parâmetros numéricos pré-Stories** (Produto+Segurança/Arquitetura): limites de arquivo/anexo, limites de anexo de e-mail, requisitos de senha, limites do motor de Automação (profundidade/tentativas/timeout/retenção), orçamento/limites de IA, valores de RPO/RTO.
- **Gate técnico de habilitação (AD-28):** arquivos, e-mail outbound e IA são **MVP obrigatório** (escopo de Produto aprovado); permanecem fail-closed em runtime até satisfazerem pré-requisitos técnicos/Segurança/Governança/Jurídico. Suas Stories registram dependências e gates; **não** migram para "capacidade posterior"; ativação produtiva pode depender de OQ-32 e OQ-43..46.
- **Cross-stage (coberto):** seletor de troca de Organização (Forma B) já presente em `EXPERIENCE.md §Navegação` — sem pendência.

### FR Coverage Map

Cobertura FR-1..FR-33 mapeada a um proprietário principal único; FR-34 documentado como referência de Plataforma sem Épico operacional. Nenhum FR duplicado nem órfão.

| FR | Proprietário principal | Observação de fronteira |
|---|---|---|
| FR-1 | Épico 1 | Autenticação |
| FR-2 | Épico 1 | Sessão |
| FR-3 | Épico 1 | Recuperação de senha (D6.1) |
| FR-4 | **Épico 7** | Conteúdo/indicadores de Dashboard. **Rota + casca + estados honestos = Épico 1** (não entrega indicadores) |
| FR-5 | Épico 7 | Badge de não lidas (consome Notificações do Épico 5) |
| FR-6 | Épico 7 | Busca Global restrita à Org |
| FR-7 | Épico 2 | Catálogo de Pipes |
| FR-8 | Épico 2 | Fases |
| FR-9 | Épico 2 | Card ↔ Pipe/Fase |
| FR-10 | Épico 2 | Estados/saúde do Card |
| FR-11 | Épico 2 | Movimentação (evento canônico; gatilho consumido por E4/E5) |
| FR-12 | Épico 2 | Histórico do Card |
| FR-13 | Épico 3 | Vínculo Card↔Registro (N—N) |
| FR-14 | Épico 2 | Form Builder + catálogo de Campo (capacidade compartilhada; reutilizada por E3) |
| FR-15 | Épico 2 | Formulário inicial → cria Card |
| FR-16 | Épico 2 | Formulário de Fase |
| FR-17 | Épico 3 | Formulário de Database (reutiliza o builder de E2) |
| FR-18 | Épico 3 | Catálogo de Databases |
| FR-19 | Épico 3 | Registros |
| FR-20 | Épico 3 | Visualização/tabela de Registros |
| FR-21 | Épico 4 | Modelo Evento→Condição→Ação (núcleo) |
| FR-22 | Épico 4 | Gestão/ciclo de vida da Automação |
| FR-23 | Épico 4 | Motor/disparo. Integrações: Tarefa/Notificação = E5; E-mail/IA = E6 (consomem o contrato de E4) |
| FR-24 | Épico 6 | Composer + histórico + envio outbound (gate AD-28) |
| FR-25 | Épico 6 | Templates de E-mail |
| FR-26 | Épico 6 | IA assistiva (gate AD-28) |
| FR-27 | Épico 5 | Tarefas |
| FR-28 | Épico 5 | Solicitações |
| FR-29 | Épico 5 | Notificações — fonte única (INV-NOTIF-01) |
| FR-30 | Épico 5 | Notificação associada a Card |
| FR-31 | Épico 7 | Relatórios |
| FR-32 | Épico 1 | Perfil/conta do próprio usuário |
| FR-33 | Épico 8 | Painel Administrativo / Membros |
| FR-34 | — (referência) | Sem Épico operacional; isolamento em E1 (AD-9/INV-ADMIN-01), restrição administrativa em E8; operacional futuro = OQ-39/Fase 2 |

## Epic List

**8 Épicos operacionais**, todos **MVP obrigatório** (nenhum é "capacidade posterior"). Ordem de execução revisada: **E1 → E8 → E2 → E3 → E5 → E4 → E6 → E7**. FR-34 permanece como referência de Plataforma, sem Épico operacional.

**Notas de escopo transversais:**
- Arquivos/anexos, e-mail outbound e IA são **MVP obrigatório**; **AD-28** é gate técnico de habilitação em runtime (não remoção de escopo).
- **OQ-39** e **OQ-49** não geram Stories na Fase 1 (futuro/Fase 2).
- **OQ-32** e **OQ-43..46** condicionam a **ativação produtiva** da IA (não a estrutura/desenvolvimento).
- **OQ-26** condiciona o detalhamento técnico das integrações de Automação e Templates.
- Parâmetros numéricos (limites de arquivo/e-mail, senha, motor, orçamento de IA, RPO/RTO) bloqueiam a **conclusão** das Stories afetadas, não a estrutura.

---

### Épico 1 — Fundação: Acesso, Identidade, Conta e Contexto de Organização
**Ordem de execução:** 1º · **Classificação:** MVP obrigatório
**Objetivo:** substrato da plataforma — autenticação/sessão reais, recuperação de senha, conta/Perfil próprio, isolamento por Organização, autorização efetiva (CASL), contexto multi-organização (Forma B), scaffolding greenfield e casca navegável (sidebar/topbar + design system).
**Valor ao usuário:** entrar com segurança, gerir a própria conta e operar numa Organização isolada, com permissões aplicadas, numa casca coerente.
**Escopo funcional:** FR-1, FR-2, FR-3, FR-32; casca + seletor de Organização (só com >1 Membership); design tokens, estados transversais, piso de acessibilidade; scaffolding.
**Dashboard (delimitação):** entrega **a rota, a casca navegável e os estados honestos** (carregando, vazio, indisponibilidade, acesso negado) do Dashboard. **Não** entrega indicadores, contadores ou priorização operacional de FR-4 (isso é do Épico 7). Sem métricas fictícias/placeholders apresentados como reais.
**FRs/RNs/NFRs/Invariantes:** FR-1/2/3/32 · RN-011/012 · NFR-1/2/3/4/32/33/34/35 · AD-1..AD-11, AD-28 (infra do gate), AD-29/31/32/33 · INV-ADMIN-01.
**Dependências:** nenhuma. Habilita todos os demais.
**Fora do escopo:** gerenciamento de membros (Épico 8); Super Admin operacional (FR-34); conteúdo funcional de Dashboard/Relatórios (Épico 7).

### Épico 8 — Administração da Organização, Membros e Auditoria
**Ordem de execução:** 2º · **Classificação:** MVP obrigatório
**Objetivo:** o Administrador gere a própria Organização — convite/aceite/expiração/reenvio/cancelamento, Membership (papel único, suspensão/remoção/reativação, proteção do último Administrador), roster, e Auditoria administrativa; Financeiro ausente, Estatísticas sem módulo.
**Valor ao usuário:** controlar quem acessa e acompanhar as ações administrativas, sem cruzar Organizações — habilitando colaboração multiusuário real.
**Escopo funcional:** FR-33.
**FRs/RNs/NFRs/Invariantes:** RN-150/151/152/153 · NFR-36..42 · AD-9/30 · INV-ADMIN-01/02, INV-AUDIT-01.
**Dependências:** Épico 1 (identidade/Membership/authz). Antecipado para 2º porque responsáveis de Cards/Tarefas/Solicitações e a validação de colaboração multiusuário dependem de Memberships/papéis reais.
**Fora do escopo:** Super Admin/impersonation (FR-34, OQ-39); API/Token/Webhooks no Painel (Fase 2); retenção/anonimização da Auditoria (Governança, antes da produção).

### Épico 2 — Processos de Trabalho: Pipes, Fases, Formulários de Pipe e Cards
**Ordem de execução:** 3º · **Classificação:** MVP obrigatório
**Objetivo:** núcleo operacional — configurar Pipes/Fases, capturar entrada pelo Formulário inicial (que **cria** o Card), operar Cards no Kanban (estados/saúde temporal, movimentação, Histórico). Estabelece o **Form Builder, o catálogo canônico de Campos e os componentes compartilhados**.
**Valor ao usuário:** desenhar o próprio processo e tocar o trabalho movendo Cards pelas etapas (UJ-2/KF-2).
**Escopo funcional:** FR-7, FR-8, FR-14, FR-15, FR-16, FR-9, FR-10, FR-11, FR-12.
**Capacidade compartilhada:** o Épico 2 estabelece o Form Builder e o catálogo de tipos de Campo; o Épico 3 **reutiliza** essa capacidade, sem criar um segundo builder ou catálogo. Isolamento entre contextos Pipe inicial/Fase/Database regido por **INV-FORM-01**.
**FRs/RNs/NFRs/Invariantes:** RN-023/024/030/043/044/046/050..054/170 · NFR-3/4/5/6 · AD-11/12/13/15 · INV-FORM-01.
**Dependências:** Épico 1 (e usa os papéis disponibilizados pelo Épico 8).
**Fora do escopo:** Database/Registro e vínculo Card↔Registro (Épico 3); disparo de Automação (Épico 4); notificação de movimentação (Épico 5).

### Épico 3 — Databases, Registros, Vínculos e Arquivos
**Ordem de execução:** 4º · **Classificação:** MVP obrigatório
**Objetivo:** manter bases estruturadas (Formulário de Database reutiliza o builder de E2), operar Registros (ciclo de vida sem exclusão definitiva), navegar/filtrar tabelas, conectar Card↔Registro (N—N, autorização dupla) e **estabelecer a capacidade compartilhada de arquivos/anexos**.
**Valor ao usuário:** organizar dados persistentes separados dos processos (Card≠Registro) e conectá-los aos Cards; anexar arquivos no contexto.
**Escopo funcional:** FR-17, FR-18, FR-19, FR-20, FR-13.
**Capacidade compartilhada (arquivos):** a capacidade de upload, autorização, armazenamento, referência, segurança e preservação de arquivos é **estabelecida neste Épico e reutilizada pelos Épicos 5 e 6**. Cada Épico consumidor mantém as regras funcionais específicas do seu recurso. Gate **AD-28** e limites numéricos obrigatórios antes das Stories relacionadas.
**FRs/RNs/NFRs/Invariantes:** RN-053/054/061/062/063/073 · NFR-3/4/8 · AD-11/12/27/28 · INV-FORM-01 (contexto Database).
**Dependências:** Épico 1 + Épico 2 (builder e Card para o vínculo).
**Fora do escopo:** tipo "Referência" como campo (Non-Goal); transferência entre Organizações.

### Épico 5 — Tarefas, Solicitações e Notificações
**Ordem de execução:** 5º · **Classificação:** MVP obrigatório
**Objetivo:** acompanhar Tarefas (prazo, "atrasada" derivada) e Solicitações (com Responsável), e entregar Notificações in-app consistentes (badge/popover/página) por evento. Entrega o **catálogo funcional de Eventos/Ação de Tarefa e a Ação de Notificação** (integrações que consomem o contrato do motor do Épico 4).
**Valor ao usuário:** saber o que fazer agora e ser avisado de eventos relevantes, sem perder contexto (KF-4).
**Escopo funcional:** FR-27, FR-28, FR-29, FR-30.
**FRs/RNs/NFRs/Invariantes:** RN-080..085/090/091/092 · NFR-3/4/19..23 · AD-21/22/23 · INV-NOTIF-01, INV-WORK-01/02.
**Dependências:** Épico 1, Épico 2 (eventos de Card; Tarefa↔Card 0..1), Épico 3 (anexos de Tarefas/Solicitações), Épico 8 (Responsável = Membership ativa). *Núcleo (Tarefas/Solicitações/Notificações + INV-NOTIF-01) é autônomo; as Stories de integração com Automação (Eventos/Ação de Tarefa e Ação de Notificação) consomem o contrato do motor entregue pelo Épico 4 e são sequenciadas na fronteira de E4.*
**Fora do escopo:** canais externos de notificação (e-mail/push/SMS); estado lido compartilhado (é por destinatário); implementação do motor (Épico 4).

### Épico 4 — Automações internas (Evento → Condição → Ação)
**Ordem de execução:** 6º · **Classificação:** MVP obrigatório
**Objetivo:** o **núcleo da Automação** — configuração Evento→Condição→Ação, ciclo de vida, avaliação, idempotência, encadeamento, prevenção de ciclos, trilha de Execuções, Ações sobre Card e Registro, e a infraestrutura de adapters internos. As integrações com Tarefa/Notificação (Épico 5) e E-mail/IA (Épico 6) **usam o contrato deste motor, sem duplicar sua implementação**.
**Valor ao usuário:** automatizar o processo sem código, com regras rastreáveis e seguras.
**Escopo funcional:** FR-21, FR-22, FR-23 (propriedade principal; referências cruzadas às Stories de integração de E5 e E6).
**FRs/RNs/NFRs/Invariantes:** RN-100/101/102/103/104 · NFR-6/7/8 · AD-18/19/20.
**Dependências:** Épico 1, Épico 2 (eventos de Card), Épico 3 (eventos/Ações de Registro), Épico 5 (catálogo funcional de Tarefas/Notificações já existir). **Gate:** OQ-26 (mecanismo Ação↔Template e prevenção de ciclos = Arquitetura, antes das Stories técnicas); limites do motor pré-Stories.
**Fora do escopo:** requisição HTTP externa, Webhook, API externa, MCP (Non-Goals); IA como Ação e envio de E-mail por Automação (contratos consumidos em E6).

### Épico 6 — E-mails, Templates e IA assistiva
**Ordem de execução:** 7º · **Classificação:** MVP obrigatório (com gate de ativação)
**Objetivo:** comunicação **outbound real** (Composer + Templates da Organização + histórico de enviados + visualização por Card) e IA assistiva mínima (sugestão de e-mail, resumo de Card, IA como Ação), sempre com revisão humana e sem efeito operacional automático. Entrega o Evento `E-mail enviado`, a Ação `enviar E-mail usando Template` e a IA como Ação (consumindo o motor de E4).
**Valor ao usuário:** falar com clientes a partir do contexto do trabalho e receber apoio de IA controlado e revisável.
**Escopo funcional:** FR-24, FR-25, FR-26.
**FRs/RNs/NFRs/Invariantes:** RN-110/111/114/120/123 · NFR-8/9/10/11/12/13/14/15/16/17/18 · AD-24/25/26/28 · guardrail NFR-17.
**Dependências:** Épico 1, Épico 2 (contexto de Card), Épico 3 (anexos de E-mail e arquivos existentes), Épico 4 (motor: IA como Ação / e-mail por Automação). **Gates (AD-28):** e-mail outbound e IA fail-closed até provedor/identidade/segurança e OQ-32/OQ-43..46; **recebimento/sincronização de e-mail fora da Fase 1**.
**Fora do escopo:** caixa de entrada operacional, campanhas/newsletter/tracking; AI Builder; agentes autônomos/memória transversal (Non-Goals).

### Épico 7 — Visibilidade: Dashboard, Busca Global e Relatórios
**Ordem de execução:** 8º · **Classificação:** MVP obrigatório
**Objetivo:** os **read-models derivados** (AD-14) sobre os dados já produzidos — conteúdo funcional do Dashboard (indicadores reais + badge + priorização), Busca Global restrita à Organização e Relatórios agregados com filtros autorizados. Implementa FR-4 **sobre a rota e a casca estabelecidas no Épico 1**.
**Valor ao usuário:** ver de relance o estado da operação, encontrar recursos e analisar indicadores reais (KF-1).
**Escopo funcional:** FR-4, FR-5, FR-6, FR-31.
**FRs/RNs/NFRs/Invariantes:** RN-131/132/133/140/141/142 · NFR-24..29 · AD-9/14 · INV-REPORT-01/02.
**Dependências:** agrega dados dos Épicos 1–5 e 8 conforme o catálogo real de indicadores e recursos pesquisáveis (badge depende de Notificações do Épico 5). *Consolidado para evitar re-tocar o domínio de leitura/Relatório a cada Épico de conteúdo (anti file-churn).*
**Fora do escopo:** analytics avançado; busca multi-organização simultânea (OQ-49, Fase 2); métricas quantitativas de negócio (OQ-50, antes da produção).

### Referência — FR-34 (Super Admin, sem Épico operacional)
Referência de Plataforma e restrição de isolamento. **Sem tela, Story ou fluxo na Fase 1.** Isolamento Plataforma×Organização entregue no Épico 1 (AD-9, INV-ADMIN-01) e reforçado no Épico 8; capacidade operacional futura vinculada a OQ-39/Fase 2.

<!-- Stories por Épico. Decompostas e validadas uma a uma; Épicos subsequentes anexados após validação individual. -->

## Épico 1 — Fundação: Acesso, Identidade, Conta e Contexto de Organização — Stories

**Sequência principal:** 1.1 → 1.13, sem dependências funcionais ocultas. Cobertura de FRs: FR-1 (1.4) · FR-2 (1.5) · FR-3 (1.10) · FR-32 (1.11/1.12/1.13, proprietário principal). Substrato: 1.1/1.2/1.3/1.6/1.7/1.8/1.9.

**Gates reais (bloqueiam a implementação das Stories afetadas — não são detalhes posteriores):** limite de tentativas/rate limit do login (1.4); requisitos numéricos e política de senha (1.10/1.12); expiração e proteção antiabuso da recuperação (1.10); regras de step-up (1.12/1.13); porta de e-mail transacional (1.10/1.13).

### Story 1.1: Esqueleto executável e ambiente base

As a time de desenvolvimento,
I want um esqueleto conteinerizado front+back, executável e implantável,
So that todas as capacidades seguintes assentem sobre uma base consistente e reproduzível.

**Escopo:** monorepo Next.js + NestJS (Structural/Stack Seed); kernel transversal vazio; health/readiness; config por ambiente com segredos fora do repo; casca vazia servida; procedimento manual de deploy/rollback.
**Rastreabilidade:** AD-1..AD-5, AD-32; Structural/Stack Seed; NFR-1.
**Dependências:** nenhuma. · **Gates:** versões/árvore do monorepo = deferred; CI/CD = decisão posterior de Engenharia. · **Fora do escopo:** regra de negócio; tabelas de domínio; autenticação. · **Demonstração vertical:** app sobe, health verde, casca vazia acessível.

**Acceptance Criteria:**

**Given** o repositório recém-clonado **When** o ambiente sobe **Then** web e API respondem health/readiness com sucesso.
**Given** a API no ar **When** consulto health **Then** recebo estado saudável sem expor segredos.
**Given** os segredos de ambiente **When** inspeciono o repositório **Then** nenhum está versionado.
**And** existe procedimento de deploy/rollback manual reproduzível.

### Story 1.2: Modelo multi-tenant e isolamento por RLS

As a plataforma multi-inquilino,
I want Account/Membership e RLS deny-by-default no banco,
So that nenhum dado organizacional cruze Organizações.

**Escopo:** Account global; Membership por Organização (papel + estado); `orgId` nos dados organizacionais mínimos; PostgreSQL com `FORCE ROW LEVEL SECURITY`; deny-by-default; papéis de banco separados; aplicação sem `BYPASSRLS`. Cria apenas as entidades necessárias a este isolamento.
**Rastreabilidade:** AD-6, AD-7, AD-10, AD-11; NFR-3; INV-ADMIN-01.
**Dependências:** 1.1. · **Gates:** — · **Fora do escopo:** login; CASL; propagação completa do contexto (1.3). · **Demonstração vertical:** testes de isolamento (R/C/U/arquivamento/forjado) passando.

**Acceptance Criteria:**

**Given** dados de duas Organizações **When** opero no contexto da Org A em leitura **Then** recursos da Org B nunca aparecem.
**Given** o contexto da Org A **When** executo criação, atualização e arquivamento/remoção lógica **Then** cada operação afeta somente dados da Org A (reforçado por RLS).
**Given** um `orgId` forjado **When** usado numa operação **Then** não permite alcançar dados de outra Organização.
**And** a aplicação, com seu papel de banco, não possui `BYPASSRLS`; sem contexto de Organização, o acesso é negado.

### Story 1.3: Propagação segura do contexto de Organização

As a plataforma,
I want resolver e propagar o contexto de Organização no servidor, dentro da transação,
So that nenhuma operação rode sem contexto válido nem confie no cliente.

**Escopo:** resolução da Organização no servidor (a partir da Membership); contexto definido dentro da transação; rejeição de requisição sem contexto organizacional válido; contrato para propagação futura a jobs/eventos/caches; testes cross-tenant.
**Rastreabilidade:** AD-6, AD-7, AD-8; NFR-3.
**Dependências:** 1.2. · **Gates:** implementação concreta em jobs/eventos/caches permanece nos Épicos que os introduzirem (só o contrato aqui). · **Fora do escopo:** login (1.4); autorização por papel (1.6). · **Demonstração vertical:** rejeição de requisição sem contexto + testes cross-tenant.

**Acceptance Criteria:**

**Given** uma requisição autenticada com Membership válida **When** processada **Then** o contexto de Organização é definido no servidor dentro da transação.
**Given** uma requisição sem contexto organizacional válido **When** chega ao servidor **Then** é rejeitada.
**Given** um `orgId` enviado pelo cliente **When** faz parte da rota/requisição e diverge do contexto permitido pela Membership **Then** a operação é rejeitada de forma segura; quando não é necessário ao contrato, é ignorado e substituído pelo contexto resolvido no servidor. O `orgId` do cliente nunca é fonte de autoridade.
**And** há testes cross-tenant automatizados e um contrato documentado de propagação para jobs/eventos/caches.

### Story 1.4: Login e resolução inicial da Organização

As a usuário,
I want autenticar-me e ser colocado numa Organização válida (ou num estado honesto sem Organização),
So that eu opere somente num contexto válido, sem troca silenciosa.

**Escopo:** login real (Better Auth); limitação contra força bruta; resolução inicial da Organização com os casos: sem Membership ativa → estado autenticado sem Organização (não Dashboard); uma Membership ativa → seleciona o contexto permitido; múltiplas → exige seleção explícita quando não houver contexto válido; `activeOrganizationId` inválido/suspenso/inacessível → limpa o contexto e exige nova seleção; nunca troca silenciosa. Dashboard só com contexto válido.
**Rastreabilidade:** FR-1; RN-011; NFR-1/2/3/4; AD-7, AD-9; UX (Login/Estados de sessão).
**Dependências:** 1.2, 1.3. · **Gates:** limite de tentativas e política de rate limit definidos por Segurança antes da implementação. · **Fora do escopo:** logout/proteção de rotas (1.5); troca posterior (1.9); recuperação (1.10). · **Demonstração vertical:** login real com resolução de contexto (após o gate de rate limit).

**Acceptance Criteria:**

**Given** credenciais válidas e uma Membership ativa **When** faz login **Then** entra na Organização permitida e chega ao Dashboard (RN-011).
**Given** credenciais inválidas **When** tenta login **Then** é rejeitado sem revelar se a conta existe.
**Given** um usuário sem Membership ativa **When** autentica **Then** vai a um estado autenticado sem Organização, não ao Dashboard.
**Given** múltiplas Memberships e nenhum contexto válido **When** autentica **Then** o sistema exige seleção explícita, sem escolher silenciosamente.
**And** um `activeOrganizationId` inválido/suspenso/inacessível limpa o contexto e exige nova seleção.

### Story 1.5: Continuidade de sessão, logout e proteção de rotas

As a usuário autenticado,
I want sessão persistente vinculada ao meu contexto e logout imediato,
So that eu opere com continuidade e saia com segurança.

**Escopo:** persistência de sessão vinculada ao contexto permitido; sessão válida não substitui revalidação de Membership; Membership suspensa/encerrada bloqueia novo acesso à Organização; logout invalida somente a sessão corrente; rota protegida sem sessão → Login; sessão expirada → nova autenticação.
**Rastreabilidade:** FR-2; RN-012; NFR-1, NFR-3, NFR-4; AD-7, AD-9.
**Dependências:** 1.4. · **Gates:** expiração por inatividade = Arquitetura. · **Fora do escopo:** revogações globais de sessão (1.10/1.12/1.13). · **Demonstração vertical:** sim.

**Acceptance Criteria:**

**Given** um usuário autenticado **When** navega **Then** a sessão persiste sem novo login.
**Given** uma sessão válida **When** a Membership foi suspensa/encerrada **Then** o acesso à Organização é bloqueado (a sessão não dispensa a revalidação de Membership).
**Given** um usuário autenticado **When** faz logout **Then** apenas a sessão corrente é invalidada imediatamente (RN-012) e ele volta ao Login.
**And** rota protegida sem sessão redireciona ao Login; sessão expirada solicita nova autenticação.

### Story 1.6: Substrato de autorização efetiva

As a plataforma,
I want um substrato CASL por papel efetivo, deny-by-default,
So that cada módulo aplique permissões consistentes e negadas por padrão.

**Escopo:** CASL com `action + subject + conditions`; papel da Organização como limite máximo; deny-by-default; ausência de acesso implícito do Super Admin da Plataforma; contrato e mecanismo de invalidação de abilities em cache ao mudar papel/Membership.
**Rastreabilidade:** NFR-4 (canônico); AD-9; Modelo de Permissões Efetivas; INV-ADMIN-01.
**Dependências:** 1.2, 1.3, 1.4. · **Integração:** a Story 1.6 estabelece o contrato e o mecanismo de invalidação de abilities; o Épico 8 integra as operações reais de alteração/suspensão/reativação/encerramento de Membership a esse contrato, sem recriar o mecanismo de autorização. · **Gates:** matrizes por módulo ficam nos Épicos de domínio; step-up por ação = Produto+Segurança. · **Fora do escopo:** papéis de Pipe/Card/Database; gestão de membros (Épico 8). · **Demonstração vertical:** negação por padrão comprovável.

**Acceptance Criteria:**

**Given** um subject sem regra explícita **When** um principal tenta a ação **Then** o acesso é negado.
**Given** uma checagem de autorização **When** ocorre **Then** acontece dentro do escopo da Organização resolvida, sem herança de outra Organização.
**Given** um Super Admin da Plataforma **When** acessa dados de uma Organização **Then** não recebe acesso automático.
**And** mudança de papel/Membership invalida abilities em cache imediatamente.

### Story 1.7: Casca navegável e design system

As a usuário autenticado,
I want uma casca consistente que respeite minhas permissões e seja responsiva,
So that eu me oriente e navegue em qualquer largura de tela.

**Escopo:** Sidebar; Topbar; rota do Dashboard; tokens visuais (cores/tipografia/spacing/radius/elevation); botões e componentes fundamentais; navegação adaptada às permissões; item ativo com `aria-current`; espaços estruturais reservados; comportamento responsivo da casca. Busca e Notificações não aparecem como controles funcionais (só nos respectivos Épicos); sem botões sem efeito nem dados fictícios; Dashboard entrega só rota e casca (sem indicadores de FR-4). As superfícies de módulo reforçarão responsividade em seus Épicos.
**Rastreabilidade:** UX-DR1, DR2, DR3, DR4, DR17, DR18; NFR-4; parte de FR-4 (rota/casca, não conteúdo).
**Dependências:** 1.4, 1.6. · **Gates:** conteúdo de indicadores = Épico 7; Busca = Épico 7; Notificações = Épico 5. · **Fora do escopo:** estados/acessibilidade transversais (1.8); indicadores do Dashboard. · **Demonstração vertical:** casca navegável, responsiva, adaptada a permissões.

**Acceptance Criteria:**

**Given** um usuário autenticado **When** acessa **Then** vê Sidebar + Topbar e a navegação se adapta às permissões (itens sem acesso ocultos/desabilitados, sem revelar recursos).
**Given** o item de navegação ativo **When** exibido **Then** usa `aria-current` e não depende só de cor.
**Given** áreas ainda não entregues (Busca/Notificações) **When** a casca é exibida **Then** não há controles funcionais falsos nem dados fictícios; a rota do Dashboard renderiza a casca sem indicadores de FR-4.
**And** dados os breakpoints suportados, quando a casca é acessada em diferentes larguras, Sidebar, Topbar, navegação e conteúdo permanecem utilizáveis, sem sobreposição, corte de ações essenciais ou dependência exclusiva de hover.

### Story 1.8: Estados honestos e acessibilidade transversal

As a usuário,
I want estados claros e uma interface acessível em todos os breakpoints,
So that eu entenda o que acontece e opere por qualquer meio.

**Escopo:** estados carregando/vazio útil/erro/indisponibilidade/acesso negado/pendente/aguardando; distinção zero legítimo × falha; estado nunca só por cor (semântica + texto + ícone); foco visível; ordem de teclado; nomes acessíveis; contraste; piso WCAG 2.2 AA. Testável sobre os componentes e a casca do Épico 1.
**Rastreabilidade:** UX-DR6, DR7 (base), DR8, DR9, DR18; NFR-4, NFR-27 (zero×falha); INV-REPORT-01 (não revelar recurso).
**Dependências:** 1.7. · **Gates:** verificação de contraste do `ring #CC5B00` contra todos os fundos (UX-DR9) na implementação. · **Fora do escopo:** estados específicos de domínio (Épicos 2+). · **Demonstração vertical:** estados e a11y testáveis sobre a casca.

**Acceptance Criteria:**

**Given** qualquer estado de sistema **When** exibido **Then** combina cor semântica + texto + ícone (nunca só cor).
**Given** um indicador com valor zero **When** exibido **Then** é distinguível de falha/carregamento.
**Given** um estado "sem permissão" **When** exibido **Then** não revela a existência do recurso não autorizado.
**And** foco, ordem de navegação, nomes acessíveis e acesso às ações permanecem corretos nos breakpoints suportados, atendendo WCAG 2.2 AA.

### Story 1.9: Troca explícita de Organização

As a usuário com mais de uma Membership ativa,
I want trocar de Organização explicitamente,
So that eu opere sempre no contexto certo, sem vazamento.

**Escopo:** Organização atual visível; seletor só com >1 Membership ativa; troca explícita; revalidação no servidor; limpeza de dados e caches da Organização anterior; atualização de navegação e abilities; ausência de troca silenciosa. Não exige reinscrição real em Socket.IO (tempo real ainda não introduzido) — registra apenas o contrato de extensão.
**Rastreabilidade:** UX-DR5; AD-7, AD-8, AD-23; NFR-3; (contrato para AD-21).
**Dependências:** 1.2, 1.3, 1.6, 1.7. · **Demonstração/origem:** pode ser demonstrada com Memberships de fixture ou seed; a entrada orgânica em novas Organizações por convite será entregue no Épico 8 e reutilizará este seletor, sem criar outro mecanismo de troca de contexto. · **Gates:** reinscrição efetiva em tempo real = Épico que introduzir Socket.IO; busca multi-org = OQ-49/Fase 2. · **Fora do escopo:** aceitar convites/entrar em novas Organizações (Épico 8). · **Demonstração vertical:** sim.

**Acceptance Criteria:**

**Given** uma única Membership ativa **When** acessa **Then** nenhum seletor aparece; a Org atual está visível.
**Given** >1 Membership ativa **When** troca de Organização **Then** navegação, dados, caches e abilities refletem somente a nova Organização (NFR-3); o contexto anterior é limpo.
**Given** uma troca **When** ocorre **Then** a Membership é revalidada no servidor e a troca é sempre explícita (nunca silenciosa).
**And** existe um contrato documentado de reinscrição em tempo real, sem implementá-la aqui.

### Story 1.10: Recuperação de senha

As a usuário que esqueceu a senha,
I want recuperá-la por e-mail com segurança,
So that eu volte a acessar minha conta sem vazamento de informação.

**Escopo:** solicitação por e-mail com resposta neutra completa; link uso único/expirável; ao redefinir, revoga todas as sessões e abilities da Account; política única de senha; escopo global da Account (não altera Memberships/papéis); notificação de segurança; sem acesso administrativo; registro sanitizado; falha segura.
**Rastreabilidade:** FR-3; D6.1; NFR-1, NFR-33, NFR-35; AD-7, AD-9, AD-25.
**Dependências:** 1.4, 1.5. · **Gate (bloqueio real):** BLOQUEADA para implementação até: requisitos numéricos de senha, expiração do link, rate limit e proteção antiabuso definidos (Produto+Segurança) E disponibilidade da porta de e-mail transacional (Arquitetura). Estruturável agora; não implementável antes desses parâmetros. · **Fora do escopo:** troca autenticada de senha (1.12); e-mail outbound do CRM (Épico 6). · **Demonstração vertical:** sim, após os gates.

**Acceptance Criteria:**

**Given** um e-mail (existente/inexistente/convite sem Account) **When** solicita recuperação **Then** a resposta e o comportamento são neutros e idênticos.
**Given** um link válido **When** usado uma vez para redefinir **Then** é consumido, todas as sessões da Account são revogadas e o usuário vai ao Login (nenhuma sessão criada pelo fluxo).
**Given** nova solicitação válida ou alteração de e-mail durante a pendência **When** ocorre **Then** invalida os links anteriores.
**And** o evento é registrado sanitizado e uma notificação de segurança é enviada.

### Story 1.11: Perfil básico e contexto próprio

As a usuário autenticado,
I want ver meus dados de conta e meu contexto na Organização atual,
So that eu confira minha identidade e papel com honestidade de dados.

**Escopo:** visualização dos dados globais da Account; edição de nome; preferências com requisito funcional confirmado; papel da Organização atual; acesso ao Perfil mesmo sem Organização ativa; avatar padrão por iniciais; proibição de editar dados de terceiros; papel de Plataforma não exibido.
**Rastreabilidade:** FR-32; D6.2; NFR-31, NFR-32, NFR-34; AD-7, AD-9.
**Dependências:** 1.4, 1.7. · **Gates:** — · **Fora do escopo:** troca de senha (1.12); alteração de e-mail (1.13); upload de avatar (integração E3); dados reais de "Pipes relacionados" antes da existência de Pipes (integração E2). · **Demonstração vertical:** sim.

**Acceptance Criteria:**

**Given** um usuário autenticado **When** abre o Perfil **Then** vê seus dados globais e o papel da Organização atual (dados reais); o papel de Plataforma não é exibido.
**Given** um usuário sem Organização ativa **When** abre o Perfil **Then** o Perfil é acessível, sem exibir papel atual/Pipes relacionados.
**Given** a edição de nome/preferências confirmadas **When** salva **Then** persiste sem permitir administrar terceiros.
**And** o avatar é exibido por iniciais (padrão), sem dado fictício.

### Story 1.12: Troca autenticada de senha

As a usuário autenticado,
I want trocar minha senha com proteção adicional,
So that eu mantenha minha conta segura.

**Escopo:** step-up/reautenticação recente; mesma política da recuperação; manutenção da sessão atual; revogação das demais sessões; invalidação dos links de recuperação pendentes; notificação de segurança; trilha de segurança sanitizada. A implementação estabelece uma capacidade reutilizável de step-up/reautenticação recente para operações sensíveis da própria Account.
**Rastreabilidade:** FR-32; D6.2; NFR-1, NFR-33, NFR-35; AD-7, AD-9.
**Dependências:** 1.5, 1.10 (política única de senha). · **Gate (bloqueio real):** requisitos numéricos de senha definidos antes da implementação; regras de step-up = Produto+Segurança. · **Fora do escopo:** alteração de e-mail (1.13); recuperação não autenticada (1.10). · **Demonstração vertical:** sim, após os gates.

**Acceptance Criteria:**

**Given** um usuário autenticado **When** troca a senha com step-up válido **Then** a política de senha é aplicada, a sessão atual é mantida e as demais são revogadas.
**Given** uma troca de senha concluída **When** ocorre **Then** os links de recuperação pendentes são invalidados e uma notificação de segurança é enviada.
**Given** ausência de step-up válido **When** tenta trocar **Then** a operação é recusada.
**And** o evento é registrado na trilha de segurança sem expor senha/token.

### Story 1.13: Alteração de e-mail em duas etapas

As a usuário autenticado,
I want alterar meu e-mail com verificação em duas etapas,
So that eu atualize minha identidade global com segurança, sem afetar Memberships.

**Escopo:** solicitação da alteração; e-mail atual válido até a confirmação; verificação do novo endereço; colisão tratada com resposta neutra; atualização global da Account; Memberships/papéis preservados; invalidação de links de recuperação; revogação das sessões anteriores preservando apenas a que concluiu o fluxo (após step-up); confirmação no novo endereço; aviso de segurança no anterior; convites antigos não migrados automaticamente. Reutiliza o step-up da Story 1.12, sem implementar segundo fluxo de reautenticação.
**Rastreabilidade:** FR-32; D6.2; NFR-1, NFR-33, NFR-35; AD-7, AD-9, AD-25.
**Dependências:** 1.5, 1.11, 1.12. · **Gate (bloqueio real):** porta de e-mail transacional (Arquitetura) e regras de step-up (Segurança) antes da implementação. · **Fora do escopo:** troca de senha (1.12); e-mail outbound do CRM (Épico 6). · **Demonstração vertical:** sim, após os gates.

**Acceptance Criteria:**

**Given** uma solicitação de alteração de e-mail **When** iniciada **Then** o e-mail atual continua válido para login até a confirmação do novo.
**Given** um novo e-mail já em uso **When** solicitado **Then** a colisão é tratada com resposta neutra.
**Given** a confirmação do novo e-mail com step-up **When** concluída **Then** o login global é atualizado, Memberships/papéis são preservados, links de recuperação invalidados e sessões anteriores revogadas (preserva só a que concluiu).
**And** confirmação ao novo endereço + aviso ao anterior; convites pendentes ao e-mail anterior não migram.

### Integrações futuras de FR-32 (suporte — proprietário principal permanece Épico 1)

- **Épico 2 — "Pipes relacionados":** exibir no Perfil apenas Pipes reais da Organização atual (nome, estado, papel/nível efetivo), respeitando autorização, sem conceder acesso adicional. Até o Épico 2, o Perfil mostra estado honesto de indisponibilidade/ausência, sem dados fictícios.
- **Épico 3 — avatar:** enviar/substituir/remover avatar reutilizando a capacidade compartilhada de arquivos (autorização/validação/segurança + gate AD-28); sem criar segundo mecanismo de upload para o Perfil.

Ambas são contribuições de suporte, não duplicação de propriedade; FR-32 continua com proprietário principal único: Épico 1.

## Épico 8 — Administração da Organização, Membros e Auditoria — Stories

**FR:** FR-33 (único proprietário). **Invariantes:** INV-ADMIN-01/02, INV-AUDIT-01. **ADs:** AD-7, AD-9, AD-10, AD-13, AD-30. **Decisões:** D5.1, D5.3. **Depende do Épico 1.** Sequência `8.1 → 8.8` (paralelização segura no resumo). **Posição na execução:** 2º Épico (os demais consomem Membership/Auditoria).

**Sem Stories na Fase 1 (exclusões preservadas):** Financeiro, Estatísticas, Super Admin operacional, API, Tokens e Webhooks.

**Ciclos canônicos (oficiais):**
- **Convite** — estados `pendente/aceito/expirado/cancelado`: expiração derivada do prazo e confirmada pelo servidor; aceito/expirado/cancelado **não** volta a pendente; reenvio invalida o token anterior e emite novo; cancelamento invalida o token imediatamente; aceite **single-use e idempotente**; sem exclusão definitiva necessária ao fluxo; **no máximo um Convite pendente efetivo** por e-mail normalizado + Organização.
- **Membership** — estados `ativa/suspensa/encerrada`: **não existe `Membership pendente`**; Membership ativa tem **exatamente um papel** (Admin/Membro/Convidado); suspensão reversível; encerramento não é reativação simples; após encerramento, novo ingresso exige **novo Convite + novo aceite**; **no máximo uma Membership efetiva ativa ou suspensa** por Account + Organização (a Arquitetura decide a representação física, sem gerar duas Memberships efetivas simultâneas); histórico de ciclos anteriores preservado; reativação/novo aceite **nunca** restaura automaticamente responsabilidades, papéis de Pipe/Database, concessões de Card, observações ou atribuições anteriores.

**Contrato cross-epic de alteração/encerramento de Membership — consumido por E2/E3/E5 (e E7 para invalidação); mecanismo = AD-13/Arquitetura.** Cobre **rebaixamento, suspensão, remoção, saída voluntária, encerramento** e qualquer transição que invalide responsabilidades/concessões:
- **Preflight:** consumidores reportam (a) **bloqueios** — recursos que exigem Responsável ativo (Tarefas/Solicitações/responsabilidades equivalentes): com bloqueio, a operação **não conclui**, **sem alteração parcial**, a UI lista o que reatribuir, a tentativa é **auditável**, e só repete após resolver; (b) **revogações obrigatórias** — concessões que não podem permanecer (papéis de Pipe/Database incompatíveis, concessões diretas de Card, acessos restritos, observações): numa transição bem-sucedida são **explícitas, atômicas**, sem deixar papel subordinado superior ao da Organização, **auditadas** e **não restauradas** depois.
- **Evento pós-alteração (pós-commit, outbox, idempotente):** `eventId` · `schemaVersion` · `organizationId` · `membershipId` · usuário afetado · estado anterior/posterior · papel anterior/posterior · operação · ator · origem · data/hora · `correlationId` · motivo sanitizado (quando aplicável). Permite aos consumidores invalidar abilities/sessões, revogar canais Socket.IO, limpar/atualizar `activeOrganizationId`, invalidar caches de permissão, atualizar Busca/read-models (E7), remover destinatários futuros de Notificações e impedir novas atribuições (E2/E3/E5). **A autorização principal consulta a fonte atual — não espera só a propagação assíncrona para bloquear acesso.**
- **Não restauração automática:** reativar ou novo aceite não restaura papéis de Pipe/Database, concessões diretas de Card nem atribuições — reconcedidas pelos fluxos normais; o papel organizacional do novo Convite é aplicado normalmente.

### Story 8.1: Casca do Painel Administrativo e guarda de acesso

As a Administrador da Organização,
I want uma área administrativa restrita à minha Organização,
So that eu gerencie apenas o que é meu, com segurança.

**Escopo:** rota/casca do Painel; acesso somente ao **Administrador ativo da Organização atual**; **deny-by-default revalidado no servidor**; Membership suspensa/encerrada não acessa; trocar `activeOrganizationId` **recarrega integralmente** o escopo administrativo; **IDs/`organizationId` do cliente não são confiáveis**; rota/navegação/consultas **não revelam a existência de outra Organização**; ausência de Financeiro, do módulo Estatísticas e de API/Tokens/Webhooks na navegação; sem dados fictícios/persistência simulada; **Super Admin da Plataforma sem acesso operacional implícito**; break-glass/suporte emergencial **fora da Fase 1**. **Estatísticas:** E8 não cria segundo mecanismo — resumo aprovado no Painel, se houver, **consome os read-models de E7** (mesmos filtros/autorização, sem duplicar cálculo nem tornar E8 dono de Relatórios).
**Rastreabilidade:** FR-33; RN-150/151/152/153; NFR-36/37; INV-ADMIN-01/02; D5.3.
**Dependências:** 1.6, 1.7, 1.8. · **Gates:** — · **Fora do escopo:** convites/membros (8.2+); Auditoria (8.8); Super Admin (FR-34); Relatórios/Estatísticas (E7). · **Demonstração vertical:** Painel acessível só ao Admin ativo, isolado.

**Acceptance Criteria:**

**Given** um usuário não Administrador (ou Membership suspensa/encerrada) **When** tenta acessar o Painel **Then** o acesso é negado (deny-by-default, revalidado no servidor), sem revelar conteúdo.
**Given** o Administrador ativo **When** acessa **Then** vê apenas dados da Organização atual (INV-ADMIN-01); trocar de Organização recarrega todo o escopo administrativo.
**Given** as seções não operacionais **When** exibidas **Then** não há Financeiro, "Estatísticas" próprio nem API/Tokens/Webhooks; nenhum dado fictício/persistência simulada (INV-ADMIN-02); resumos, se houver, consomem read-models de E7.
**And** o Super Admin da Plataforma não obtém acesso operacional a este Painel por padrão; IDs do cliente não ampliam escopo.

### Story 8.2: Criar, reenviar, expirar e cancelar Convite (+ write-side da Auditoria)

As a Administrador,
I want criar e gerir Convites seguros com validação de conflito,
So that eu traga pessoas à Organização de forma coerente e auditável.

**Escopo:** criar Convite (e-mail + papel inicial ∈ {Admin da Org, Membro, Convidado}); ciclo `pendente/aceito/expirado/cancelado`; **convidar diretamente como Admin exige step-up**. **E-mail de Convite usa a porta transacional da Plataforma**, separada do Composer outbound de E6 — **não** depende de Template da Organização, identidade remetente do cliente, Composer, histórico outbound por Card nem Ação de Automação. **Token:** aleatório de alta entropia; **armazenar só o hash**; uso único; expiração; comparação segura; invalidação em reenvio/cancelamento/aceite; **nenhum token em logs/Auditoria/URL persistida/resposta administrativa**; URL temporária e segura; rate limit de emissão/reenvio/validação; proteção contra brute force e enumeração. **Criação/conflitos (idempotente, protegida contra concorrência):** normalizar e-mail; validar formato no servidor; conflito na Organização — ativa → bloquear (já é membro); suspensa → bloquear e orientar reativação; pendente → oferecer reenviar/cancelar; encerrada → permitir novo Convite; outra Organização → permitir. **Entrega:** separar **estado do Convite** de **estado da entrega transacional** (`enfileirada/enviada ao provedor/falhou`); não indicar enviado sem aceite do provedor; falha de entrega não cria outro Convite, preserva o pendente, permite reenvio controlado e é auditável. Proprietária das regras de validação (o roster 8.7 apenas as reflete).
**Capacidade compartilhada (write-side da Auditoria):** a Story 8.2 estabelece o **contrato de escrita e a persistência mínima append-only** dos eventos administrativos (tipados/versionados). As Stories 8.3–8.7 e os Épicos consumidores (E4/E2/E3) reutilizam esse contrato. A Story 8.8 entrega o read-side (consulta/filtros/apresentação); **não recria o mecanismo de registro**.
**Rastreabilidade:** FR-33; D5.1; NFR-38/39/40/42; AD-9, AD-25, AD-30; INV-AUDIT-01.
**Dependências:** 8.1 + porta de e-mail transacional da Plataforma. · **Gates:** provedor transacional; identidade remetente da Plataforma; cofre de credenciais; prazo numérico; rate limits; antiabuso; retry e idempotência (todos antes da implementação). · **Fora do escopo:** aceite/criação de Membership (8.3); exibição no roster (8.7); e-mail outbound do CRM (E6). · **Demonstração vertical:** sim, após os gates.

**Acceptance Criteria:**

**Given** o Administrador **When** convida um e-mail com papel válido **Then** um Convite pendente é criado (papel ∈ {Admin, Membro, Convidado}); convidar como Admin exige step-up; o token é armazenado só como hash e nunca aparece em logs/Auditoria/resposta.
**Given** um e-mail com Membership ativa/suspensa/pendente **When** se tenta convidar **Then** bloqueia (ativa), orienta reativar (suspensa) ou oferece reenviar/cancelar (pendente); encerrada/outra Org não conflita; a criação é idempotente e protegida contra concorrência.
**Given** um Convite pendente **When** reenviado **Then** o token anterior é invalidado e um novo é emitido; **When** cancelado **Then** o token é invalidado e nenhum aceite posterior é possível; **When** expira **Then** a origem é o sistema.
**Given** a entrega do e-mail transacional **When** falha **Then** o estado de entrega (`falhou`) é distinto do estado do Convite (segue `pendente`), sem indicar envio; reenvio controlado é permitido.
**And** criar/reenviar/expirar/cancelar persistem eventos administrativos append-only via o contrato de Auditoria (write-side), pela porta transacional da Plataforma (não pelo Composer de E6).

### Story 8.3: Aceite de Convite e ativação da Membership

As a convidado,
I want aceitar um convite verificado de forma idempotente,
So that eu participe da Organização com o papel definido, com segurança.

**Escopo:** aceite **transacional e idempotente**. Antes de ativar: validar token atual; estado pendente; prazo; Organização; e-mail normalizado; verificar se já existe Membership efetiva; impedir aceite concorrente duplicado. **Account existente:** exige autenticação com a Account do e-mail convidado (verificado); sessão de outra Account não aceita silenciosamente; sem trocar Account/Organização sem ação explícita; preserva a Organização ativa atual até escolha do usuário. **Usuário novo:** o Convite conduz à criação/autenticação da Account; a **posse válida do Convite** pode participar da verificação do e-mail conforme contrato de E1; Membership só é criada após concluir as validações de identidade; **sem cadastro público independente do Convite**. **Resultado:** cria uma **única Membership ativa**; registra o papel do Convite; marca o Convite como aceito; invalida o token; emite Evento canônico pós-commit; **não restaura** concessões/responsabilidades antigas; sem "Membership pendente"; reutiliza o seletor de Organização (1.9).
**Notificação "convite aceito" (contrato E5/5.6):** o aceite **registra o tipo `convite aceito` no catálogo de E5 usando a fonte única** — E8 **não** cria Notificação própria; resolução de destinatários/preferências fica em 5.6; sem token/e-mail completo/dados sensíveis; idempotente por Convite + destinatário. Consome 5.6 como contrato, sem dependência circular de implementação.
**Rastreabilidade:** FR-33; D5.1; NFR-38; AD-7, AD-9, AD-30; INV-AUDIT-01. **Contrato consumido:** Notificações (5.6).
**Dependências:** 8.2, 1.4, 1.9, contrato de Notificações (5.6). · **Gates:** — · **Fora do escopo:** alteração de papel (8.4); suspensão/remoção (8.5/8.6); mecanismo de Notificação (E5). · **Demonstração vertical:** sim.

**Acceptance Criteria:**

**Given** um Convite pendente e uma Account com o mesmo e-mail verificado **When** o usuário autenticado aceita **Then** uma única Membership ativa é criada (aceite idempotente); reaceite/token reusado não cria segunda Membership.
**Given** um convidado sem Account **When** aceita **Then** a Account é criada/verificada, a identidade é autenticada e só então a Membership ativa é criada; falha em qualquer etapa não cria Membership; não há cadastro público fora do Convite.
**Given** um Convite expirado/cancelado/consumido/substituído **When** se tenta aceitar **Then** nenhuma Membership é criada; o aceite não altera Memberships em outras Organizações nem troca a Organização ativa silenciosamente.
**And** o aceite gera Evento auditável (usuário como ator) e **registra a Notificação `convite aceito` via a fonte única de E5 (5.6)**, sem token/dados sensíveis; não há "Membership pendente".

### Story 8.4: Alteração de papel da Membership

As a Administrador,
I want alterar papéis com proteção atômica e preflight,
So that eu gerencie a governança sem risco nem inconsistência.

**Escopo:** só Membership **ativa** muda de papel; só **Admin ativo** executa; papel final ∈ {Admin, Membro, Convidado}; mudança **transacional**; **promover ou rebaixar Admin exige step-up**; concorrência usa controle de versão/bloqueio; mudança no próprio papel só se não violar o último Admin; Convites pendentes e Memberships suspensas/encerradas **não contam** como Admin ativo. **Último Admin (atômico):** a Organização deve ter ≥ 1 Admin ativo; a proteção impede que operações concorrentes removam/rebaixem os últimos Admins. **Rebaixamento:** executa o **preflight cross-epic** (bloqueia se houver responsabilidades obrigatórias; lista e **revoga atomicamente** concessões incompatíveis; **não restaura** em promoção futura). Após a mudança: **invalida abilities/caches imediatamente**; revalida sessões; emite Evento pós-alteração; registra Auditoria. Reutiliza step-up de 1.12.
**Rastreabilidade:** FR-33; D5.1; NFR-38; AD-9, AD-13, AD-30; INV-ADMIN-01.
**Dependências:** 8.1, 1.6, 1.12, contrato de preflight/evento (consumido por E2/E3/E5). · **Gates:** step-up; proteção atômica do último Admin (Segurança/Arquitetura). · **Fora do escopo:** suspensão/reativação (8.5); remoção/saída (8.6); efeitos concretos sobre recursos (E2/E3/E5). · **Demonstração vertical:** sim.

**Acceptance Criteria:**

**Given** uma Membership ativa **When** o Administrador altera o papel com step-up válido **Then** o papel é atualizado (transacional) e as abilities/caches são invalidados imediatamente, com sessões revalidadas.
**Given** o último Administrador ativo (sem contar pendentes/suspensas/encerradas) **When** se tenta rebaixá-lo/removê-lo, inclusive por operações concorrentes **Then** a proteção atômica bloqueia.
**Given** um rebaixamento com responsabilidades obrigatórias **When** o preflight reporta bloqueio **Then** a operação não conclui (orienta reatribuir); sem bloqueio, as concessões incompatíveis são revogadas atomicamente e não restauradas em promoção futura.
**And** a alteração e as tentativas bloqueadas são auditadas; emite o Evento canônico pós-alteração (outbox, idempotente).

### Story 8.5: Suspensão e reativação da Membership

As a Administrador,
I want suspender e reativar membros com preflight e sessão org-scoped,
So that eu controle o acesso de forma reversível e segura.

**Escopo — Suspensão:** só **Admin ativo** suspende; usuário **não se suspende** (saída própria = 8.6); **último Admin ativo protegido**; executa **preflight** antes (bloqueia se responsabilidades obrigatórias não reatribuídas); **revoga concessões operacionais/acessos diretos** conforme contrato; **bloqueio imediato só na Organização afetada**; preserva Account/papel/autoria/Histórico; limpa `activeOrganizationId` se apontar para ela; revoga sessões/abilities/canais **da Organização**; **outras Organizações intactas**; sem novo Convite enquanto suspensa. **Reativação:** só **Admin ativo**; **sem novo Convite/aceite**; retorna a ativa com o papel preservado; **não restaura** automaticamente responsabilidades/papéis de Pipe-Database/concessões (reconceder pelos fluxos normais); emite Evento canônico; registra Auditoria. **Suspensão e reativação exigem step-up.**
**Semântica de sessão:** revoga imediatamente acesso/abilities/autorizações **da Organização afetada**; se ativa, limpa o contexto; **sessões/Memberships em outras Organizações permanecem intactas**. Mecanismo de invalidação/rotação = Arquitetura.
**Rastreabilidade:** FR-33; D5.1; NFR-38; AD-9, AD-13, AD-30; INV-ADMIN-01.
**Dependências:** 8.4, 1.5, 1.6, contrato de preflight/evento (E2/E3/E5). · **Gates:** step-up; invalidação/rotação de sessão = Arquitetura. · **Fora do escopo:** remoção/saída voluntária (8.6); efeitos concretos sobre recursos (E2/E5); reativação não restaura atribuições. · **Demonstração vertical:** ciclo + evento canônico.

**Acceptance Criteria:**

**Given** um membro ativo **When** é suspenso (com step-up e preflight sem bloqueio) **Then** perde acesso/abilities/canais da Organização afetada imediatamente, mantendo papel/histórico; sessões/Memberships em outras Organizações intactas; concessões operacionais revogadas.
**Given** responsabilidades obrigatórias não reatribuídas **When** se tenta suspender **Then** o preflight bloqueia (orienta reatribuir), sem alteração parcial.
**Given** a Organização suspensa é a ativa **When** a suspensão ocorre **Then** `activeOrganizationId` é limpo, sem troca silenciosa; **Given** o último Administrador ativo **When** se tenta suspender **Then** é bloqueado.
**Given** uma Membership suspensa **When** reativada por ação administrativa (step-up) **Then** o acesso é retomado sem novo aceite, com papel preservado; atribuições removidas na suspensão não são restauradas; suspensão/reativação geram Auditoria e Evento pós-alteração.

### Story 8.6: Remoção, saída voluntária e impacto sobre recursos

As a Administrador (ou como o próprio usuário),
I want encerrar uma Membership com preflight, step-up e rastreabilidade,
So that eu controle o acesso sem perder histórico nem consistência.

**Escopo — Remoção administrativa:** por **Admin ativo**; **último Admin ativo protegido**; **step-up**; executa **preflight** (bloqueia se responsabilidades obrigatórias); **revoga concessões/acessos atomicamente**; encerra a Membership; **não exclui Account**; preserva autoria/Histórico/comentários/eventos; não afeta outras Organizações. **Saída voluntária:** pelo **próprio usuário autenticado**; **step-up**; **último Admin ativo protegido**; mesmo **preflight**; encerra apenas a Membership da Organização escolhida; não exclui a Account; limpa a Organização ativa; direciona a outra Organização disponível ou ao seletor; preserva as demais Memberships. **Após encerramento:** sessões/canais da Organização revogados; concessões diretas revogadas; **Evento pós-alteração** emitido; Auditoria registrada; novo ingresso exige novo Convite + aceite; **nenhuma atribuição/concessão anterior restaurada**; `creator` mantido como proveniência.
**Semântica de sessão:** o encerramento revoga imediatamente acesso/abilities/autorizações da Organização afetada; se ativa, o contexto é limpo; sessões/Memberships em outras Organizações permanecem intactas. Mecanismo = Arquitetura.
**Rastreabilidade:** FR-33; D5.1; NFR-38; AD-9, AD-10, AD-13, AD-30; INV-ADMIN-01.
**Dependências:** 8.4, 8.5, 1.5, 1.6. **Contrato cross-epic:** preflight + evento consumidos por E2/E3/E5. · **Gates:** step-up (Segurança). · **Fora do escopo:** implementação da reatribuição em Cards/Tarefas/Solicitações (E2/E5). · **Demonstração vertical:** encerramento + preflight/evento (efeito em recursos nos Épicos consumidores).

**Acceptance Criteria:**

**Given** um membro com recursos que exigem Responsável ativo **When** o Administrador tenta removê-lo e o preflight reporta bloqueio **Then** a operação não é concluída, o usuário é orientado a reatribuir, nenhuma alteração parcial é aplicada e a tentativa é auditável.
**Given** um membro sem bloqueios **When** o Administrador o remove (step-up) **Then** o acesso é encerrado, o histórico preservado, concessões diretas revogadas atomicamente e o evento auditado (Administrador como ator); a Account não é excluída.
**Given** o próprio usuário **When** sai voluntariamente (step-up, mesmo preflight) **Then** só a Membership escolhida é encerrada, a Organização ativa é limpa e ele é direcionado a outra Org/seletor; demais Memberships preservadas; evento auditado (próprio usuário como ator).
**And** o último Administrador ativo é protegido nos dois fluxos; um novo Convite futuro não restaura papéis de Pipe/Database, concessões diretas de Card nem antigas atribuições; emite Evento pós-alteração.

### Story 8.7: Roster de membros e Convites

As a Administrador,
I want um roster que mostre membros e convites por estado e ofereça as ações permitidas,
So that eu gerencie a composição da Organização num só lugar.

**Escopo — visão do Admin:** consulta paginada/filtrada de Convites (pendentes/expirados/cancelados) e Memberships (ativas/suspensas/encerradas); filtros mínimos por estado, papel, busca por nome, busca por e-mail (só Admin) e período (quando aplicável). **Visão do Membro:** só Memberships **ativas** (nome/avatar/papel) — sem e-mail/Convites/suspensas/encerradas/histórico administrativo/ações. **Convidado não acessa.** **Ações:** a disponibilidade vem das **capacidades calculadas no servidor** (a UI não infere autorização só pelo papel exibido); cada ação reutiliza a Story proprietária (convite/reenvio 8.2; papel 8.4; suspensão/reativação 8.5; remoção 8.6); estados/mensagens de conflito refletem 8.2 sem duplicar. Aplicar paginação; estados carregando/vazio/erro/sem permissão; nenhuma contagem de outra Organização; **atualização após Evento canônico** de Membership; avatar com fallback por iniciais; **nenhuma exportação de membros na Fase 1**. **E7 consome o contrato estável de Membership — não depende desta interface (8.7).**
**Rastreabilidade:** FR-33; D5.1; NFR-37/40; INV-ADMIN-01.
**Dependências:** 8.2, 8.3, 8.4, 8.5, 8.6. · **Gates:** — · **Fora do escopo:** identidade de participantes vinculados a recursos acessíveis por Convidado (Épicos de domínio); Busca Global (E7). · **Demonstração vertical:** sim.

**Acceptance Criteria:**

**Given** o Administrador **When** abre o roster **Then** vê Convites e Memberships por estado, com filtros (estado/papel/nome/e-mail/período) e paginação; as ações aparecem só quando permitidas para o estado e o ator, com autorização revalidada no disparo.
**Given** uma ação proibida pela proteção do último Administrador **When** o roster é renderizado **Then** ela não é apresentada como executável.
**Given** um Membro comum **When** vê o roster **Then** vê apenas nome/avatar/papel das ativas (avatar com fallback honesto), sem Convites/suspensas/encerradas/e-mail; o Convidado não acessa.
**And** o roster atualiza após Eventos canônicos de Membership; não há contagem de outra Organização nem exportação de membros; mensagens de conflito refletem 8.2.

### Story 8.8: Auditoria administrativa (contrato write-side + consulta)

As a Administrador,
I want um contrato de Auditoria tipado e uma consulta autorizada,
So that eu acompanhe mudanças de acesso e configuração com confiança e sem vazamento.

**Escopo — separação explícita:** Auditoria administrativa ≠ Histórico de Card ≠ Histórico de Registro ≠ Trilha de Execuções de Automação ≠ logs técnicos (Pino/Sentry); nenhum substitui o outro. **Contrato write-side (estabelecido em 8.2, formalizado aqui):** todo Evento administrativo é **tipado e versionado**, registrando no mínimo `auditEventId`, `schemaVersion`, `organizationId`, categoria, operação, **resultado (sucesso/bloqueada/falha)**, ator, Membership do ator, origem, alvo, tipo e ID do recurso, antes/depois minimizados, motivo sanitizado, data/hora, `correlationId`, `causationId` (quando aplicável). **Nunca registrar** senha/token/sessão/segredo/chave de API/payload integral/corpo de e-mail/prompt ou resposta de IA/URL assinada/stack trace/dados pessoais desnecessários. **Consistência:** operações relevantes persistem o Evento na **mesma transação ou por outbox confiável**; se o Evento obrigatório não puder ser persistido, a mutação **não conclui silenciosamente** — **fail-closed** para operações críticas, alerta técnico, sem alteração sem trilha. **Catálogo (produtores registram seus tipos; E8 não reimplementa fluxos):** Convites e Memberships (8.2–8.6); **ciclo de vida de Automação de E4 (criar/editar/ativar/desativar/arquivar/restaurar/duplicar)**; alterações estruturais de Pipe/Database; papéis/concessões de Pipe/Database/Card; configurações estruturais de Formulários; ciclo de vida de Templates; configurações organizacionais futuras aprovadas. **Read-side:** só **Admin ativo** consulta; filtros mínimos período/categoria/operação/resultado/ator-origem/tipo de alvo/alvo — só na Organização atual; paginação; ordenação cronológica determinística; autorização server-side; **sem edição/exclusão** pelo usuário; **correção por novo Evento** (nunca altera o original); referências restritas sem revelar conteúdo inacessível; estados vazio/erro/sem permissão distintos.
**Retenção e LGPD (gate de Governança, antes da produção):** prazo de retenção; descarte; anonimização; tratamento após encerramento de Account; obrigação legal de preservação; acesso administrativo; proteção contra alteração; política de backup — exceções controladas e auditáveis; não bloqueia consulta no uso operacional.
**Rastreabilidade:** FR-33; D5.3; NFR-39/40/42; AD-30; INV-AUDIT-01.
**Dependências:** contrato de eventos administrativos (8.2) usado por 8.2–8.7 e pelos Épicos produtores (E4/E2/E3). · **Gates:** retenção/anonimização/descarte/backup/proteção = Governança/LGPD/Arquitetura; fail-closed de operações críticas. · **Fora do escopo:** logs técnicos/observabilidade e tentativas de login; segurança de conta self-service (recuperação/senha/e-mail = trilha de segurança do Épico 1). · **Demonstração vertical:** sim.

**Acceptance Criteria:**

**Given** eventos persistidos pelos produtores (8.2–8.7 e ciclo de vida de Automação de E4) **When** o Administrador abre a Auditoria **Then** consulta e filtra por período/categoria/operação/resultado/ator-origem/tipo-alvo/alvo, sempre dentro da Organização atual, com paginação e ordem cronológica determinística.
**Given** uma operação administrativa crítica **When** o Evento obrigatório de Auditoria não puder ser persistido **Then** a mutação não conclui silenciosamente (fail-closed), com alerta técnico e sem alteração sem trilha.
**Given** os filtros **When** aplicados **Then** não revelam usuários/recursos de outra Organização; referências restritas não revelam conteúdo inacessível; nenhum segredo/token/payload é exibido.
**Given** um usuário comum (Admin do Pipe/Membro/Convidado) ou o Super Admin **When** tenta acessar **Then** o acesso é negado (só Admin ativo); registros são append-only (correção por novo Evento); eventos self-service de senha/e-mail permanecem na trilha de segurança do Épico 1.

---

## Resumo do Épico 8 (gravado)
- **8 Stories**; **FR-33 proprietário**. **Account global** (E1) × **Membership por Organização** (papel único: Admin/Membro/Convidado).
- **Convite separado de Membership**; ciclos oficiais `Convite: pendente/aceito/expirado/cancelado` e `Membership: ativa/suspensa/encerrada`; **sem `Membership pendente`**.
- **Proteção atômica do último Admin**; **step-up** em ações críticas (papel/suspensão/remoção/saída, convite direto como Admin).
- **Convite** com **token só em hash, single-use e expiração**; **e-mail transacional da Plataforma separado de E6**.
- **Preflight** para rebaixamento/suspensão/remoção/saída; **revogações atômicas**; **nenhuma restauração automática** de atribuições/concessões.
- Transições **invalidam sessões, abilities, canais Socket.IO e caches** (org-scoped); **E7 atualizado por Eventos de Membership**.
- **Notificação `convite aceito` usa a fonte única de E5**; **ciclo de vida de Automação (E4) é auditado**; **Auditoria append-only, tipada e sem segredos**, separada dos Históricos e da Trilha de Execuções.
- **Super Admin sem acesso operacional**; **Financeiro/API/Tokens/Webhooks fora**; **E8 não cria motor de Relatórios/Estatísticas** (consome E7).
- **Gates:** provedor transacional/identidade/cofre/TTL/token/rate limit/antiabuso/idempotência (Convite); step-up + proteção atômica + versão de sessão/abilities + revogações (segurança admin); preflight/revogações/evento/outbox/concorrência (Membership); catálogo tipado/retenção/anonimização/descarte/backup/proteção/fail-closed (Auditoria). Não bloqueiam a gravação; bloqueiam a implementação até fechados na Arquitetura + `pre-implementation-check`.

### Ordem produtiva (paralelização segura)
```text
8.1 ─→ 8.2 ─→ 8.3
 │      └──────────────→ 8.8
 ├──→ 8.4 ─→ 8.5 ─→ 8.6
 │                  └───→ 8.7
 └──────────────────────→ 8.7
```
- 8.1 (superfície/guarda) → 8.2 (Convites + write-side de Auditoria) → 8.3 (ingresso); 8.4→8.5→8.6 (transições); 8.7 integra no roster; **8.8 avança após o write-side de 8.2**; integração final valida preflight/sessão/caches/Notificações/Auditoria. **E8 é o 2º Épico na execução** (demais consomem Membership/Auditoria).

## Épico 2 — Processos de Trabalho: Pipes, Fases, Formulários de Pipe e Cards — Stories

**FRs (proprietário principal):** FR-7 (2.1/2.2) · FR-8 (2.3) · FR-9 (2.7/2.9) · FR-10 (2.11/2.12/2.13) · FR-11 (2.14/2.16) · FR-12 (2.17) · FR-14 (2.4/2.5/2.6) · FR-15 (2.7/2.8) · FR-16 (2.15). **Suporte:** FR-32 (2.18, proprietário principal = E1). Ordem `2.1 → 2.18`.

**Contratos:** Form Builder (2.4 → E3) · write-side do Histórico (2.7 → Stories produtoras) · Membership (E8 → 2.10) · preflight de movimentação (2.14 → 2.15 e consumidores futuros) · evento canônico de movimentação (2.16 → E4/E5).

### Story 2.1: Ciclo de vida e catálogo de Pipes

As a Administrador da Organização,
I want criar, renomear, arquivar e restaurar Pipes,
So that eu modele os processos da minha operação com catálogo consistente.

**Escopo:** Admin da Org cria/renomeia/arquiva/restaura Pipes; catálogo consistente em todas as telas (RN-024); atributos `locked`/`starred`; arquivamento reversível (preserva dados, bloqueado enquanto houver Cards ativos); Admin do Pipe configura o Pipe mas não controla seu ciclo de vida. Fora: exclusão definitiva, duplicação, reordenação global.
**Rastreabilidade:** FR-7; RN-023/024; D2.1; NFR-3/4; AD-10/11. · **Dep.:** 1.6, 1.7. · **Gates:** — · **Fora:** papéis/acesso por Pipe (2.2); Fases (2.3). · **Vertical:** sim.

**Acceptance Criteria:**
**Given** o Administrador da Organização **When** cria/renomeia um Pipe **Then** aparece de forma consistente em toda listagem (RN-024), no escopo da Org atual.
**Given** um Pipe com Cards ativos **When** se tenta arquivá-lo **Then** o arquivamento é bloqueado até não haver Cards ativos.
**Given** um Pipe arquivado **When** restaurado **Then** todos os dados são preservados.
**And** não há exclusão definitiva/duplicação/reordenação global; um Admin do Pipe não cria/arquiva Pipes.

### Story 2.2: Papéis e acesso por Pipe

As a Administrador,
I want conceder papéis por Pipe,
So that cada pessoa acesse apenas os processos autorizados.

**Escopo:** papéis Admin do Pipe / Membro do Pipe / Somente leitura, por concessão explícita por Pipe; Admin da Org acessa todos; Membro/Convidado só onde receberam papel; ausência de papel = sem acesso; no máximo um papel efetivo por Pipe; Admin do Pipe ≠ Admin da Org. "Visão restrita"/"Apenas formulário inicial" são modos condicionais, não papéis.
**Rastreabilidade:** FR-7; D1.4; NFR-4; AD-9. · **Dep.:** 2.1, 1.6. · **Gates:** — · **Fora:** acesso/concessão de Card (2.10). · **Vertical:** sim.

**Acceptance Criteria:**
**Given** um usuário sem papel num Pipe **When** tenta acessá-lo **Then** o acesso é negado, sem revelar o recurso.
**Given** uma concessão de papel de Pipe **When** aplicada **Then** o usuário tem exatamente o poder do papel, no máximo um por Pipe.
**Given** o Administrador da Organização **When** acessa qualquer Pipe **Then** tem acesso sem concessão explícita.
**And** Somente leitura consulta sem editar/mover; Admin do Pipe administra a config conforme aprovado, sem controlar o ciclo de vida do Pipe.

### Story 2.3: Gerenciamento de Fases

As a Admin da Org ou Admin do Pipe,
I want criar, renomear, reordenar, arquivar e restaurar Fases,
So that eu modele o fluxo do processo.

**Escopo:** criar/renomear/reordenar (intra-Pipe)/arquivar/restaurar; todo Pipe mantém ≥1 Fase ativa; arquivar Fase reversível (preserva dados, retira do fluxo, impede novos Cards/movimentações para ela, bloqueado enquanto houver Cards ativos nela); restaurar retorna ao final da ordem ativa; nenhuma Fase migra entre Pipes (RN-030).
**Rastreabilidade:** FR-8; RN-030; D2.2; NFR-3/4. · **Dep.:** 2.1. · **Gates:** — · **Fora:** Formulário de Fase (2.15); movimentação (2.14). · **Vertical:** sim.

**Acceptance Criteria:**
**Given** um Pipe com uma única Fase ativa **When** se tenta arquivá-la **Then** é bloqueado (≥1 Fase ativa).
**Given** uma Fase com Cards ativos **When** se tenta arquivá-la **Then** é bloqueado até não haver Cards ativos nela.
**Given** uma Fase arquivada **When** restaurada **Then** volta ao final da ordem ativa, com dados preservados.
**And** reordenar é intra-Pipe; nenhuma Fase pertence a mais de um Pipe (RN-030).

### Story 2.4: Form Builder e catálogo canônico de Campos

As a usuário autorizado,
I want montar Formulários com um catálogo canônico de campos,
So that eu capture dados de forma consistente e isolada por contexto.

**Escopo:** catálogo canônico (12 tipos): Texto curto/longo, Número, Seleção única/múltipla, Sim/Não, Data, Data e hora, E-mail, Telefone, URL, Arquivo; estrutura comum do Campo (identidade estável, rótulo, tipo, ajuda, config do tipo, valor padrão, posição, ativo/arquivado; opções de Seleção com identidade estável); componentes compartilhados + contrato de contexto (Pipe inicial/Fase/Database); contexto sempre visível; isolamento INV-FORM-01. Neste Épico funcional só para inicial e Fase; contexto Database previsto no contrato (integração no E3, sem 2º builder). Fora da Fase 1: regras condicionais entre campos, validação programável, exibição dinâmica.
**Campo Arquivo (gate):** antes da integração com a capacidade de arquivos do Épico 3, o tipo Arquivo pode existir no contrato e no catálogo, mas **não pode ser apresentado como funcional** — a interface indica indisponibilidade honesta e **impede a publicação de um Formulário com Campo Arquivo ativo sem capacidade de upload habilitada**. Após o Épico 3, o mesmo tipo é ativado, reutilizando o mesmo builder, sem segundo mecanismo de upload; gate AD-28 permanece obrigatório.
**Rastreabilidade:** FR-14; D3.1; INV-FORM-01; AD-11/12/27/28. · **Dep.:** 2.1, 2.3. · **Contrato:** Form Builder reutilizado pelo E3. · **Gates:** Campo Arquivo dependente do storage do E3. · **Fora:** evolução segura de Campos (2.5); publicação (2.6). · **Vertical:** sim.

**Acceptance Criteria:**
**Given** o builder **When** um Campo é adicionado **Then** pertence ao catálogo dos 12 tipos, com estrutura comum e identidade estável.
**Given** dois contextos **When** um é alterado **Then** o outro não muda (INV-FORM-01); o contexto em edição está sempre visível.
**Given** um Formulário com Campo Arquivo ativo e sem capacidade de upload habilitada **When** se tenta publicá-lo **Then** a publicação é impedida e a indisponibilidade é indicada honestamente.
**And** o contexto Database reutiliza este catálogo/estrutura/contrato no E3, sem segundo builder.

### Story 2.5: Ciclo de vida e evolução segura de Campos

As a usuário autorizado,
I want criar/editar/arquivar/restaurar Campos com segurança,
So that eu evolua Formulários sem perda silenciosa de dados.

**Escopo:** criar/editar/arquivar/restaurar Campo (sem exclusão definitiva); mudança de tipo bloqueada quando houver valores/submissões vinculadas (criar novo Campo, preservando o anterior); renomear rótulo/ajuda não altera identidade; arquivar Campo reversível, preserva valores (leitura), bloqueado enquanto for obrigatório em Formulário publicado/requisito de Fase/marco; opções de Seleção removíveis só se nunca publicadas/usadas, senão só arquiváveis (valores antigos mantêm rótulo; restaurar preserva identidade); alterações de validação valem para novas submissões, sem invalidar histórico silenciosamente.
**Rastreabilidade:** FR-14; D3.4; INV-FORM-01; AD-12. · **Dep.:** 2.4 (pré-requisito de 2.6 e das submissões). · **Gates:** limites, formatos, tamanhos e validações numéricas aplicáveis por tipo de Campo devem estar definidos antes da implementação das Stories afetadas (não bloqueia o detalhamento/gravação). · **Fora:** publicação (2.6); submissão (2.7). · **Vertical:** sim.

**Acceptance Criteria:**
**Given** um Campo com valores/submissões **When** se tenta mudar seu tipo **Then** é bloqueado; a alternativa é criar novo Campo, preservando o anterior.
**Given** um Campo obrigatório em Formulário publicado/requisito de Fase/marco **When** se tenta arquivá-lo **Then** é bloqueado até deixar de ser obrigatório.
**Given** uma opção de Seleção já publicada/usada **When** se tenta removê-la **Then** só é possível arquivá-la; valores antigos mantêm o rótulo.
**And** renomear não altera identidade; validações novas valem só para novas submissões; sem exclusão definitiva.

### Story 2.6: Ciclo de publicação dos Formulários

As a usuário autorizado,
I want publicar e despublicar Formulários com versionamento,
So that eu controle quando eles recebem submissões, sem quebrar as em andamento.

**Escopo:** rascunho → salvar → pré-visualizar (simula, sem submissão real) → publicar (versão ativa) → despublicar (bloqueia novas submissões, preserva config/versões/dados); só a versão publicada recebe submissões; após publicar, novas edições vão para novo rascunho; publicar de novo substitui a ativa; Publicar/Despublicar são ações nomeadas; inicial+Fase → Admin da Org/Admin do Pipe.
**Sessões de submissão iniciadas:** a continuidade após republicação/despublicação depende de referência estável à versão de origem — a versão de origem não muda durante o preenchimento; nova publicação não migra silenciosamente uma submissão em andamento; despublicação impede novas sessões; sessões já iniciadas podem ser concluídas somente dentro do prazo técnico definido; sessão expirada não pode ser retomada/convertida usando versão antiga indefinidamente.
**Rastreabilidade:** FR-14; D3.2; AD-12. · **Dep.:** 2.4, 2.5. · **Gates:** prazo da sessão de submissão = Arquitetura/Segurança antes da implementação. · **Fora:** submissão/criação de Card (2.7); público (2.8). · **Vertical:** sim.

**Acceptance Criteria:**
**Given** um Formulário em rascunho **When** é pré-visualizado **Then** simula o preenchimento sem criar submissão real.
**Given** um Formulário publicado **When** recebe novas edições **Then** elas vão para novo rascunho; a versão publicada permanece até nova publicação.
**Given** uma submissão já iniciada **When** o Formulário é republicado/despublicado **Then** permanece vinculada à versão de origem e pode ser concluída dentro do prazo técnico; novas sessões ficam bloqueadas ao despublicar.
**And** sessão expirada não é retomada/convertida usando versão antiga indefinidamente.

### Story 2.7: Submissão interna do Formulário inicial e criação do Card

As a usuário autorizado,
I want submeter o Formulário inicial e criar um Card,
So that eu dê entrada a um item de trabalho no Pipe.

**Escopo:** submissão interna válida cria um novo Card na 1ª Fase ativa, com dados capturados + referência ao Formulário e versão publicada + evento de criação no Histórico; o Formulário inicial nunca preenche Card existente; 1 submissão lógica = no máximo 1 Card (retry não duplica); deduplicação por Campo não automática. FR-9: Card pertence a exatamente 1 Pipe e 1 Fase. Estabelece o contrato de escrita append-only do Histórico (reutilizado por 2.10–2.16).
**Rastreabilidade:** FR-15, FR-9; D3.3; RN-046; AD-11/13; INV-FORM-01. · **Contrato:** write-side do Histórico. · **Dep.:** 2.3, 2.6. · **Gates:** idempotência da submissão e mecanismo técnico do write-side do Histórico = Arquitetura. · **Fora:** submissão pública (2.8); Kanban (2.9); read-side do Histórico (2.17). · **Vertical:** sim.

**Acceptance Criteria:**
**Given** uma submissão interna válida **When** concluída **Then** um novo Card é criado na 1ª Fase ativa, com dados/referência à versão, e um evento de criação é persistido no Histórico.
**Given** a mesma submissão lógica reprocessada **When** ocorre **Then** no máximo um Card é criado (idempotência funcional).
**Given** o Formulário inicial **When** submetido **Then** nunca preenche Card existente (sempre cria).
**And** o Card pertence a exatamente 1 Pipe e 1 Fase; o contrato write-side do Histórico fica disponível.

### Story 2.8: Submissão pública controlada e triagem

As a Organização,
I want um Formulário inicial público controlado com triagem,
So that eu receba entradas externas sem expor dados internos nem conceder acesso.

**Escopo:** público opt-in por Formulário (só o inicial); acesso externo sem autenticação; submissão não concede acesso a Pipe/Card/dados; ator externo vê só confirmação; triagem (padrão) ou criação direta (explícita); triagem não é estado do Card (ciclo da Submissão pública: pendente/aprovada/rejeitada/convertida); aprovar cria exatamente 1 Card (origem registrada); rejeitar não cria (preserva a submissão conforme Governança/LGPD); guardrails obrigatórios (aviso de privacidade, consentimento, identificação da Org, limites de envio, tratamento seguro de Campo Arquivo, mensagens sem dados internos).
**Autorização da triagem:** a capacidade **"Revisar submissões públicas"** é permissão explícita e **negada por padrão** — Admin da Org e Admin do Pipe a possuem conforme a matriz aprovada; Membro do Pipe só revisa quando receber explicitamente essa capacidade; o papel isolado não concede revisão automática quando a matriz não a autorizar.
**Rastreabilidade:** FR-15; D3.2/D3.3; NFR-8; INV-FORM-01. · **Dep.:** 2.7. · **Gates:** Segurança e antiabuso da submissão pública (rate limit/CAPTCHA/análise de arquivo = Segurança/Arquitetura) antes da implementação — sem inventar mecanismo específico. · **Fora:** demais Formulários públicos; acesso externo ao CRM. · **Vertical:** sim, após o gate.

**Acceptance Criteria:**
**Given** um Formulário inicial público em modo triagem **When** um ator externo submete **Then** nenhum Card é criado até aprovação; o ator vê só confirmação, sem qualquer acesso; nenhum dado interno aparece na resposta pública.
**Given** uma submissão pública em triagem **When** um revisor com a capacidade "Revisar submissões públicas" aprova **Then** exatamente 1 Card é criado (origem registrada); **When** rejeita **Then** nenhum Card é criado e a submissão é preservada.
**Given** ações concorrentes de aprovação/conversão **When** ocorrem **Then** são idempotentes: uma submissão convertida não pode ser aprovada de novo e não se criam dois Cards.
**And** em modo criação direta, a submissão válida cria exatamente 1 Card sem duplicação em reprocessamento.

### Story 2.9: Kanban e espaço operacional do Card

As a usuário autorizado,
I want ver os Cards por Fase no Kanban e abrir um Card,
So that eu opere o trabalho com clareza.

**Escopo:** visualizar Cards agrupados por Fase no Kanban; abrir o Card (três painéis Contexto|Execução|Ações); exibir dados e estado atual; Fase visível; apresentar apenas as ações permitidas por autorização (não permitidas ocultas/desabilitadas, sem revelar administrativas); estados honestos (loading/vazio/erro/acesso negado); sem movimentação (2.14). Estabelece a superfície sobre a qual movimentação/Histórico/Formulário de Fase/acesso se integram.
**Rastreabilidade:** FR-9 (superfície); UX (Card três painéis); NFR-3/4; INV-REPORT-01. · **Dep.:** 2.2, 2.7. · **Gates:** — · **Fora:** movimentação (2.14); Formulário de Fase (2.15); Histórico read-side (2.17). · **Vertical:** sim.

**Acceptance Criteria:**
**Given** um usuário com acesso ao Pipe **When** abre o Pipe **Then** vê os Cards agrupados por Fase (Kanban), no escopo da Org atual.
**Given** um Card **When** aberto **Then** exibe dados, estado atual e Fase visível, com apenas as ações permitidas.
**Given** um usuário Somente leitura **When** vê o Card **Then** ações não permitidas ficam ocultas/desabilitadas, sem revelar administrativas.
**And** loading/vazio/erro/acesso negado seguem estados honestos; nenhuma movimentação é executada aqui.

### Story 2.10: Acesso, Responsável e concessões de Card

As a usuário autorizado,
I want atribuir Responsável e conceder acesso a Cards específicos,
So that eu organize a operação sem ampliar acesso indevidamente.

**Escopo (modelo normalizado, sem novos papéis de Card):**
- **Responsável:** atribuição operacional; não é papel; exige acesso operacional prévio; não concede automaticamente acesso a outros Cards.
- **Observador:** concessão direta de leitura; não edita; não movimenta; não altera acesso ou Responsável.
- **Concessão operacional direta:** limitada ao Card indicado; capacidades explicitamente concedidas conforme a matriz; não concede acesso à lista do Pipe, configuração, métricas ou outros Cards; `Mover Card` só existe quando concedido explicitamente.
- **Restrito ao próprio:** modificador do acesso de Membro do Pipe; limita aos Cards em que seja Responsável atual ou possua concessão direta válida; `creator` não concede acesso; Histórico anterior de responsabilidade não concede acesso.
**Contrato de Membership (E8):** preflight (bloquear encerramento quando um Card exige Responsável ativo) e evento pós-alteração (revogar concessões diretas, remover Responsável quando aplicável, sinalizar Card para reatribuição, preservar `creator`, sem restauração automática na reativação/novo aceite).
**Rastreabilidade:** D1.5; NFR-4; AD-9/10/13; INV-ADMIN-01. · **Contrato:** consome Membership (E8). · **Dep.:** 2.2, 2.9, contrato de Membership (E8). · **Gates:** mecanismo do preflight/evento de Membership = Arquitetura; Notificações a Observador dependem de distribuição (E5/OQ-33). · **Fora:** papel Comentador (condicional); movimentação (2.14). · **Vertical:** sim.

**Acceptance Criteria:**
**Given** um usuário sem acesso operacional ao Card **When** se tenta torná-lo Responsável **Then** é bloqueado (Responsável só entre quem já tem acesso operacional).
**Given** uma concessão operacional direta **When** aplicada **Then** o usuário acessa apenas aquele Card, sem lista/config/métricas do Pipe; `Mover Card` só se concedido explicitamente.
**Given** o encerramento de Membership com Card que exige Responsável ativo **When** o preflight é consultado **Then** informa bloqueio até reatribuição; **When** suspensa/encerrada **Then** concessões diretas revogadas, Responsável removido quando aplicável, Card sinalizado para reatribuição, `creator` preservado.
**And** reativação/novo aceite não restauram automaticamente Responsável/concessões; "restrito ao próprio" ignora `creator` e histórico anterior de responsabilidade.

### Story 2.11: Ciclo de vida do Card

As a usuário autorizado,
I want concluir, arquivar, reabrir e restaurar Cards,
So that eu reflita o andamento do trabalho sem perder dados.

**Escopo (três estados canônicos — `reaberto`/`restaurado` são transições, não estados persistentes):** estados `ativo` / `finalizado` / `arquivado`; transições: finalizar (ativo→finalizado), reabrir (finalizado→ativo), arquivar (ativo ou finalizado→arquivado), restaurar (arquivado→estado anterior preservado). O estado anterior ao arquivamento é armazenado de forma confiável. Cada transição gera evento próprio no Histórico, mas o estado final permanece um dos três estados canônicos. Ao reabrir/restaurar para ativo, a saúde é recalculada (2.13).
**Rastreabilidade:** FR-10; D2.3; AD-13. · **Dep.:** 2.7, 2.9, 2.10. · **Gates:** — · **Fora:** saúde temporal (2.13); precedência de apresentação (2.13). · **Vertical:** sim.

**Acceptance Criteria:**
**Given** um Card ativo **When** é finalizado **Then** fica `finalizado`; **When** arquivado **Then** fica `arquivado`, com o estado anterior armazenado de forma confiável.
**Given** um Card finalizado **When** reaberto **Then** volta a `ativo`; **When** arquivado e depois restaurado **Then** volta ao estado anterior preservado.
**Given** qualquer transição de ciclo de vida **When** ocorre **Then** gera evento próprio no Histórico e o estado final é um dos três canônicos.
**And** `reaberto`/`restaurado` não são persistidos como estados.

### Story 2.12: Marcos por Fase e override por Card

As a Admin da Org ou Admin do Pipe,
I want configurar prazos por Fase (com override por Card),
So that o sistema derive a saúde temporal a partir de marcos reais.

**Escopo:** cada Fase pode definir prazo esperado/vencimento/expiração como durações relativas à entrada na Fase (Admin da Org/Admin do Pipe; Membro não configura); override absoluto por Campo Data/Data e hora do Card; precedência valor-do-Card › configuração-da-Fase › ausência; prazo esperado ≤ vencimento ≤ expiração.
**Entrada na Fase como base:** cada entrada efetiva do Card em uma Fase cria uma referência temporal própria — preserva o instante de entrada, a origem da entrada, nova referência em cada reentrada, o histórico das entradas anteriores, marcos calculados a partir da entrada atual, override absoluto por Campo Data/Data-hora, e ausência de alteração retroativa do histórico quando a configuração da Fase mudar.
**Rastreabilidade:** FR-10; D2.7; D3.1 (Campos Data); AD-11. · **Dep.:** 2.3, 2.4, 2.9. · **Gates:** parâmetros numéricos dos marcos, regras de cálculo/agendamento e fuso = Arquitetura; **comportamento de mudanças na configuração** (afetam só entradas futuras OU exigem recálculo explícito dos Cards atuais) definido antes da implementação — **sem recálculo retroativo silencioso**. · **Fora:** derivação da saúde (2.13). · **Vertical:** sim.

**Acceptance Criteria:**
**Given** uma Fase com marcos configurados **When** um Card entra na Fase **Then** cria-se uma referência temporal própria (instante/origem da entrada) e os marcos valem como durações relativas a ela.
**Given** um Card com valor de Campo Data/Data-hora para um marco **When** avaliado **Then** o valor do Card prevalece (override absoluto) sobre a Fase; ausência é ignorada.
**Given** uma reentrada na mesma Fase **When** ocorre **Then** cria nova referência, preservando o histórico das entradas anteriores; a configuração respeita prazo esperado ≤ vencimento ≤ expiração; Membro não configura.
**And** mudança na configuração da Fase não altera retroativamente o histórico nem recalcula silenciosamente os Cards atuais.

### Story 2.13: Saúde temporal derivada do Card

As a usuário,
I want ver a saúde temporal do Card derivada dos prazos reais,
So that eu saiba o que está atrasado/vencido/expirado.

**Escopo (dois eixos preservados — sem estado único combinado):**
- **Eixo de ciclo de vida:** `ativo` / `finalizado` / `arquivado` (de 2.11).
- **Eixo de saúde temporal:** `ok` / `atrasado` / `vencido` / `expirado`, **derivado** (nunca manual) dos marcos reais de 2.12; atrasado após o prazo esperado, vencido após o vencimento, expirado após a expiração; só mudança efetiva emite evento.
A precedência `arquivado > finalizado > expirado > vencido > atrasado > ok` serve **somente para apresentação resumida/indicador dominante** e não substitui os dois valores canônicos. Enquanto finalizado/arquivado: a apresentação prioriza o ciclo de vida e a saúde não continua gerando transições temporais; ao reabrir/restaurar para ativo, a saúde é recalculada a partir dos marcos válidos. Fixtures só em teste, não como solução funcional.
**Rastreabilidade:** FR-10; D2.3; AD-13/14. · **Dep.:** 2.11, 2.12. · **Gates:** regras de cálculo/agendamento/fuso e parâmetros = Arquitetura. · **Fora:** configuração de marcos (2.12); priorização no Dashboard (E7). · **Vertical:** sim.

**Acceptance Criteria:**
**Given** um Card ativo cujo prazo esperado passou **When** a saúde é derivada dos marcos reais **Then** o estado de saúde é `atrasado`; após vencimento `vencido`; após expiração `expirado`; sem o marco, o estado não se aplica.
**Given** um Card **When** exibido **Then** ambos os eixos (ciclo de vida e saúde) são mantidos como valores canônicos distintos; a precedência é usada só para o indicador dominante.
**Given** um Card finalizado/arquivado **When** o tempo passa **Then** a saúde não gera novas transições temporais; a apresentação prioriza o ciclo de vida.
**And** só mudança efetiva de saúde emite evento; reabrir/restaurar/mover recalculam a saúde.

### Story 2.14: Movimentação e regras de transição

As a usuário autorizado,
I want mover um Card para outra Fase,
So that eu faça o trabalho avançar no processo.

**Escopo:** serviço central de movimentação + **contrato de preflight de transição**. O preflight consulta os validadores registrados: autorização; Fase ativa; par origem→destino; confirmação; requisitos de entrada; requisitos de saída; validadores adicionados por capacidades posteriores. Movem: Admin da Org, Admin do Pipe, Membro do Pipe no escopo efetivo, concessão direta com `Mover Card`; não movem: Somente leitura/Observador/leitura; livre entre Fases ativas do mesmo Pipe; não para/de Fase arquivada; nunca entre Pipes; só ciclo aberto move; "restrito ao próprio" limita. **Fluxo:** (1) solicita; (2) preflight consulta validadores; (3) validadores (ex.: Formulário de Fase, 2.15) informam bloqueios; (4) havendo bloqueio, nada é movimentado; (5) sem bloqueio, persiste a nova Fase; (6) recalcula marcos/saúde; (7) produz Histórico e evento canônico. **O núcleo de 2.14 não depende da implementação do Formulário de Fase para existir**; E4/E5 registram novos validadores no mesmo contrato, sem recriar a movimentação.
**Rastreabilidade:** FR-11; D2.4; RN-046; AD-13. · **Contrato:** preflight de movimentação (→ 2.15 e consumidores). · **Dep.:** 2.2, 2.3, 2.9, 2.10, 2.11, 2.12, 2.13. · **Gates:** — · **Fora:** evento canônico opt-in (2.16); execução de efeitos (E4/E5). · **Vertical:** sim.

**Acceptance Criteria:**
**Given** um usuário autorizado a mover **When** solicita mover um Card para outra Fase ativa do mesmo Pipe **Then** o preflight consulta os validadores registrados; sem bloqueio, a nova Fase é persistida, marcos/saúde recalculados e o evento é registrado no Histórico.
**Given** um validador que reporta bloqueio **When** o preflight é executado **Then** nada é movimentado.
**Given** um usuário Somente leitura/Observador ou uma Fase arquivada/outro Pipe **When** se tenta mover **Then** é negado/bloqueado; só Cards de ciclo aberto movem.
**And** o núcleo de movimentação existe sem a implementação do Formulário de Fase; E4/E5 podem registrar validadores sem recriar a movimentação.

### Story 2.15: Formulário de Fase e bloqueio de transição

As a usuário autorizado,
I want um Formulário de Fase que possa exigir dados para avançar,
So that eu garanta a qualidade do processo.

**Escopo:** Formulário de Fase configurável como informativo/opcional, requisito de entrada ou requisito de saída (Admin da Org/Admin do Pipe); **integra-se ao preflight de 2.14 como validador** (não recria a movimentação); salvar não movimenta sozinho; valores persistem após a saída (visíveis a autorizados, não descartados ao mover/finalizar/arquivar/reabrir); fora da Fase de origem: leitura no fluxo normal; correção posterior exige ação explícita autorizada e gera evento antes/depois.
**Requisito de entrada:** os campos da Fase de destino são apresentados antes da confirmação final; os valores são validados e persistidos **na mesma operação transacional da movimentação**; falha ao persistir os valores impede a movimentação; falha ao movimentar não pode deixar valores associados como se a entrada tivesse ocorrido; **nenhuma movimentação parcial**. **Requisito de saída:** validar os valores vinculados à Fase atual antes da saída.
**Rastreabilidade:** FR-16; D3.3; INV-FORM-01; AD-12/13. · **Dep.:** 2.5, 2.6, 2.14. · **Gates:** persistência transacional dos valores de Fase = Arquitetura. · **Fora:** Formulário inicial (2.7); Formulário de Database (E3). · **Vertical:** sim.

**Acceptance Criteria:**
**Given** um Formulário de Fase com campos obrigatórios não preenchidos **When** se tenta avançar **Then** o validador reporta bloqueio ao preflight (2.14): a transição é bloqueada, o Card permanece na Fase, requisitos exibidos, nenhum evento de movimentação, valores informados preservados.
**Given** um requisito de entrada **When** a movimentação é confirmada **Then** os valores da Fase de destino são validados e persistidos na mesma transação; falha na persistência impede a movimentação; não há movimentação parcial.
**Given** um requisito de saída **When** o Card sai da Fase **Then** os valores vinculados à Fase atual são validados antes.
**And** salvar não movimenta sozinho; valores persistem após a saída; correção posterior gera evento antes/depois.

### Story 2.16: Evento canônico de movimentação e contrato opt-in

As a plataforma,
I want um evento canônico após cada movimentação persistida,
So that Automações e Notificações possam reagir de forma opt-in, sem efeitos duplicados.

**Escopo:** toda movimentação persistida possui identidade estável e produz no máximo um evento canônico lógico; reprocessamentos técnicos podem reenviar o mesmo evento, mas preservam `eventId`/chave de idempotência para que os consumidores impeçam efeitos duplicados. O evento existe apenas após autorizada, cumpridas as regras, recebida a confirmação humana quando exigida, e persistida. Ponto de extensão opt-in (qualquer movimentação/entrada em Fase/saída de Fase/par origem→destino). **Não executa Automação, não distribui Notificação, não faz integração externa.** O contrato contém no mínimo: `eventId`, `organizationId`, `pipeId`, `cardId`, `sourcePhaseId`, `targetPhaseId`, ator/origem, origem da movimentação, momento efetivo, chave de correlação da operação.
**Rastreabilidade:** FR-11; D2.5; AD-13/18/19. · **Contrato:** consumido por E4 (Automação) e E5 (Notificação). · **Dep.:** 2.14. · **Gates:** mecanismo do evento canônico (formato/entrega) = Arquitetura; motor/prevenção de ciclos = E4/AD-18; distribuição = E5/OQ-33. · **Fora:** seleção/execução de efeitos (E4/E5). · **Vertical:** sim.

**Acceptance Criteria:**
**Given** uma movimentação persistida **When** concluída **Then** um evento canônico é emitido com `eventId`/`organizationId`/`pipeId`/`cardId`/`sourcePhaseId`/`targetPhaseId`/ator-origem/origem/momento/correlação.
**Given** uma movimentação bloqueada/cancelada/aguardando confirmação **When** ocorre **Then** nenhum evento é emitido.
**Given** um reprocessamento técnico **When** reenvia o mesmo evento **Then** preserva `eventId`/chave de idempotência para o consumidor impedir efeitos duplicados (o E2 não controla idempotência de Automação/Notificação — E4/E5 o fazem).
**And** o contrato não executa Automação nem distribui Notificação.

### Story 2.17: Histórico do Card — consulta da timeline

As a usuário autorizado,
I want consultar o Histórico do Card,
So that eu entenda o que aconteceu, por quem e quando.

**Escopo:** read-side da trilha por item (append-only, imutável, não fonte de autorização): timeline, ordenação, ator/origem, antes/depois relevante, máscara de dados sensíveis, autorização de visualização; núcleo já capturado por 2.7/2.10–2.16; condicionais só quando a funcionalidade existir (comentário, arquivo, Tarefa/Solicitação, E-mail, vínculo de Registro, submissão de Formulário, execução de Automação); alterações de uma única ação podem ser agrupadas; **não recria a captura** (usa o write-side de 2.7).
**Correção append-only:** quando uma informação anterior precisar ser corrigida, não alterar o evento original — registrar um novo evento de correção mantendo referência ao evento/alteração corrigida.
**Autorização:** a timeline considera o **acesso atual** ao Card — quem perdeu acesso não consulta mais o Histórico e não o mantém por ter sido ator/Responsável/Observador anteriormente. Retenção/anonimização/descarte só por processos controlados de Governança/LGPD, sem edição comum da timeline.
**Rastreabilidade:** FR-12; D2.6; RN-170; NFR-16; AD-15. · **Consome:** write-side (2.7). · **Dep.:** contrato de escrita da 2.7 + eventos das Stories 2.10–2.16. · **Gates:** estrutura física/versionamento/armazenamento e retenção = Arquitetura/Governança. · **Fora:** Auditoria administrativa (E8); logs técnicos. · **Vertical:** sim.

**Acceptance Criteria:**
**Given** eventos persistidos por 2.7/2.10–2.16 **When** o usuário com acesso atual ao Card abre o Histórico **Then** vê a timeline cronológica (tipo/resumo/data-hora/origem/ator/antes-depois/referência), respeitando a autorização atual e mascarando sensíveis.
**Given** uma correção de informação anterior **When** registrada **Then** o evento original não é alterado; um novo evento de correção referencia o corrigido.
**Given** um usuário que perdeu acesso ao Card **When** tenta consultar o Histórico **Then** o acesso é negado, mesmo tendo sido ator/Responsável/Observador antes.
**And** o Histórico é append-only e não é fonte de autorização; retenção/anonimização só por Governança/LGPD.

### Story 2.18: Integração FR-32 — Pipes relacionados no Perfil

As a usuário,
I want ver no meu Perfil os Pipes da Organização atual a que estou relacionado,
So that eu me situe, sem que isso conceda acesso.

**Escopo:** exibir no Perfil apenas Pipes reais da Organização atual (nome, estado, papel/nível efetivo), somente leitura, respeitando autorização, sem conceder acesso; substitui o estado honesto de indisponibilidade que o Perfil (Story 1.11) exibia antes da existência de Pipes. Contribuição de suporte a FR-32 (proprietário principal: Épico 1).
**Rastreabilidade:** FR-32 (suporte); D6.2; NFR-31; AD-9. · **Dep.:** 2.2, 1.11. · **Gates:** — · **Fora:** edição de Perfil/conta (E1); administração de terceiros. · **Vertical:** sim.

**Acceptance Criteria:**
**Given** um usuário com papéis em Pipes da Org atual **When** abre o Perfil **Then** vê os Pipes relacionados reais (nome/estado/papel efetivo), em leitura.
**Given** um Pipe ao qual o usuário não tem acesso **When** o Perfil é montado **Then** não é listado nem revelado.
**Given** a exibição no Perfil **When** o usuário interage **Then** nenhum acesso adicional é concedido.
**And** enquanto não houver Pipes, mantém-se o estado honesto de ausência, sem dado fictício.

## Épico 3 — Databases, Registros, Vínculos e Arquivos

**Objetivo:** transformar dados estruturados em um recurso de primeira classe — Databases com Registros persistentes, o vínculo Card↔Registro e a capacidade compartilhada de arquivos reutilizada por vários módulos.

**Valor entregue:** a Organização mantém bases de dados estruturadas (separadas dos processos), relaciona processo e dado sem fundi-los e anexa arquivos com segurança onde faz sentido.

**FRs proprietários:** FR-18 (3.1/3.2) · FR-17 (3.3) · FR-19 (3.4/3.6) · FR-20 (3.5) · FR-13 (3.9). **Suporte:** FR-32 avatar (3.10).

**Reutiliza:** Form Builder e catálogo canônico de Campos de E2 (2.4/2.5/2.6). **Estabelece:** a capacidade compartilhada de arquivos (3.7), consumida por E5 (anexos de Tarefa/Solicitação), E6 (anexos de e-mail) e pelo avatar (3.10); o Histórico do Registro (write-side 3.4 → read-side 3.6).

**Depende de:** E1, E2. **Ordem interna:** `3.1 → 3.10` (sem dependência futura).

**Fora do escopo do Épico:** anexo geral em Tarefa/Solicitação (E5); anexo em e-mail (E6); execução de Automações/Notificações (E4/E5); tipo de Campo "Referência" (Non-Goal); permissões por Campo (fora da Fase 1).

### Story 3.1 — Ciclo de vida e catálogo de Databases

**As a** Administrador da Organização, **I want** criar, renomear, arquivar e restaurar Databases, **so that** eu mantenha bases de dados estruturadas, separadas dos processos (Database ≠ Pipe).

- **Objetivo/valor:** organizar bases estruturadas de dados no nível da Organização.
- **Escopo:** Admin da Org cria/renomeia/arquiva/restaura Databases; catálogo real da Org atual (RN-131); Database é distinto de Pipe (RN-061). **Arquivar coloca o Database integralmente em modo somente leitura** (ajuste 1): além de bloquear novos Registros, submissões e vínculos, bloqueia edição de Registros; publicação/despublicação/alteração do Formulário/schema; criação/alteração/remoção de Campos; uploads/substituições/remoções de arquivos; criação/alteração de relacionamentos. Registros, Campos, arquivos, vínculos e Históricos existentes permanecem **consultáveis conforme as permissões atuais**. Arquivar é reversível e **não é bloqueado por Registros vinculados a Cards**. Restaurar reabilita as operações **sem alterar identidades nem referências**.
- **Critérios de aceite:**
  - **Given** o Administrador **When** cria/renomeia um Database **Then** ele aparece no catálogo real da Org atual, distinto de Pipe.
  - **Given** um Database com Registros vinculados a Cards **When** é arquivado **Then** o arquivamento não é bloqueado e o Database entra em modo somente leitura integral (todas as operações de escrita listadas ficam bloqueadas).
  - **Given** um Database arquivado **When** um usuário tenta editar Registro, alterar schema/Campos, enviar arquivo ou criar vínculo **Then** a operação é bloqueada, mas os dados existentes permanecem consultáveis conforme as permissões atuais.
  - **Given** um Database arquivado **When** restaurado **Then** identidade, Registros, Campos, arquivos, vínculos e Históricos são preservados e as operações são reabilitadas sem alterar identidades ou referências.
  - **And** não há exclusão definitiva, duplicação nem transferência entre Organizações.
- **Rastreabilidade:** FR-18; RN-061/131; D3.4; NFR-3/4; AD-10/11.
- **Dependências:** 1.6, 1.7.
- **Gates:** —
- **Fora do escopo:** papéis/acesso (3.2); Registros (3.4).
- **Demonstração vertical:** sim — criar, arquivar (somente leitura) e restaurar um Database real.

### Story 3.2 — Papéis e acesso por Database

**As a** Administrador (da Organização ou do Database), **I want** conceder e revogar papéis por Database, **so that** cada pessoa acesse apenas as bases autorizadas, com o poder correto.

- **Objetivo/valor:** controlar acesso e autoridade por Database, sem ambiguidade sobre quem concede.
- **Escopo:** papéis **Admin do Database / Membro do Database / Somente leitura**, por concessão explícita por Database; Admin da Org acessa todos; ausência de papel = sem acesso (sem revelar o recurso); no máximo um papel efetivo por Database; papel de Database nunca supera o da Organização; **Convidado só recebe Somente leitura** (Fase 1). **Autoridade para conceder** (ajuste 2): Admin da Org concede/altera/revoga qualquer papel de Database; Admin do Database concede/revoga **apenas** `Membro do Database` e `Somente leitura`, exclusivamente para **Memberships ativas da mesma Organização**; **somente Admin da Org** concede/remove `Admin do Database`; Admin do Database **não** cria, convida, remove nem altera Memberships da Organização; revogar o papel **remove o acesso imediatamente**, preservando autoria e Histórico anteriores. **Permissões por Campo estão fora da Fase 1** (declaração explícita).
- **Critérios de aceite:**
  - **Given** um usuário sem papel num Database **When** tenta acessá-lo **Then** o acesso é negado sem revelar o recurso.
  - **Given** um Admin do Database **When** tenta conceder `Admin do Database` ou mexer em Memberships da Org **Then** é bloqueado; ele só concede/revoga `Membro do Database`/`Somente leitura` a Memberships ativas da mesma Org.
  - **Given** um Convidado **When** recebe acesso a um Database **Then** só pode ser Somente leitura (Fase 1).
  - **Given** um papel revogado **When** a revogação é aplicada **Then** o acesso cessa imediatamente e a autoria/Histórico anteriores são preservados.
  - **And** no máximo um papel efetivo por Database; papel de Database não supera o da Organização; permissões por Campo ficam fora da Fase 1.
- **Rastreabilidade:** FR-18; D3.4; NFR-4; AD-9. **Consome:** Membership (E8).
- **Dependências:** 3.1, 1.6.
- **Gates:** —
- **Fora do escopo:** estrutura do Formulário (3.3); permissões por Campo (fora da Fase 1).
- **Demonstração vertical:** sim.

### Story 3.3 — Formulário de Database (schema visual do Registro)

**As a** Admin da Org ou Admin do Database, **I want** definir e publicar o schema visual do Registro reutilizando o Form Builder, **so that** os dados do Database sejam estruturados sem um segundo builder.

- **Objetivo/valor:** estruturar Registros com o mesmo builder canônico dos Pipes.
- **Escopo:** **reutiliza o Form Builder e o catálogo canônico de Campos de E2 (2.4)** — sem segundo builder/catálogo; contexto Database isolado dos demais (INV-FORM-01); ciclo de publicação de 2.6 aplicado ao contexto Database; evolução segura de Campos (2.5) vale aqui; configuram/publicam: Admin da Org / Admin do Database. **Schema publicado é pré-condição** (ajuste 3): sem uma versão publicada do Formulário de Database, submissões e a ação `Novo Registro` ficam indisponíveis; **rascunhos nunca recebem submissões nem criam Registros**.
- **Critérios de aceite:**
  - **Given** o contexto Database no builder **When** um schema é montado **Then** usa o catálogo canônico dos 12 tipos e a estrutura comum de Campo, isolado dos contextos de Pipe (INV-FORM-01), sem segundo builder.
  - **Given** um Formulário de Database em rascunho **When** um usuário tenta submeter ou usar `Novo Registro` **Then** a operação fica indisponível (só a versão publicada recebe Registros).
  - **Given** um Formulário de Database publicado/despublicado **When** o ciclo de 2.6 é aplicado **Then** apenas a versão publicada vigente recebe Registros.
  - **And** mudanças de tipo de Campo com valores/submissões seguem a evolução segura de 2.5.
- **Rastreabilidade:** FR-17; D3.2/D3.5; INV-FORM-01; AD-12. **Consome:** Form Builder (E2/2.4/2.5/2.6).
- **Dependências:** 3.1, 2.4, 2.5, 2.6.
- **Gates:** Campo Arquivo no schema segue o gate de 3.7/3.8 (AD-28).
- **Fora do escopo:** criação de Registro (3.4).
- **Demonstração vertical:** sim.

### Story 3.4 — Ciclo de vida do Registro (+ Histórico write-side)

**As a** usuário autorizado, **I want** criar, editar, arquivar e restaurar Registros de forma idempotente, **so that** os dados do Database sejam mantidos sem perda nem duplicação.

- **Objetivo/valor:** Registros persistentes, com ciclo de vida seguro e trilha própria.
- **Escopo:** estados ativo/arquivado; operações criar/visualizar/editar/arquivar/restaurar; **sem exclusão definitiva** pelo usuário; Registro pertence a exatamente 1 Database (não transferível); criação por **Formulário de Database publicado**, pela ação **`Novo Registro`** e **pela ação de Automação `Criar Registro relacionado`, definida no Épico 4** (ajuste 3 — ação já aprovada no catálogo, não condicional); arquivar reversível (sai das consultas ativas, sem edição/novos vínculos; dados/arquivos/vínculos preservados; não bloqueado por vínculos); restaurar preserva identidade/valores/arquivos/Histórico/vínculos. **Criação idempotente** (ajuste 3): `Novo Registro` e submissão usam **exatamente a versão publicada vigente no início da operação**; cada submissão/comando possui **identificador idempotente**; repetição, duplo clique, timeout ou retry **não pode criar Registros duplicados**; **uma ação lógica cria zero ou um Registro e registra o resultado**. **Estabelece o write-side do Histórico do Registro** (append-only).
- **Critérios de aceite:**
  - **Given** um Formulário de Database publicado (ou `Novo Registro`) **When** submetido/acionado **Then** cria no máximo 1 Registro, com os Campos/validações da versão publicada vigente no início da operação.
  - **Given** uma submissão repetida por duplo clique, timeout ou retry (mesmo identificador idempotente) **When** processada **Then** não cria Registro duplicado; o resultado da ação lógica é registrado.
  - **Given** um Registro **When** arquivado **Then** sai das consultas ativas, sem edição/novos vínculos, mas dados/arquivos/vínculos são preservados e consultáveis; não é bloqueado por vínculos.
  - **Given** um Registro arquivado **When** restaurado **Then** identidade/valores/arquivos/Histórico/vínculos são preservados.
  - **And** não há exclusão definitiva pelo usuário; cada operação persiste um evento no write-side do Histórico do Registro.
- **Rastreabilidade:** FR-19; RN-062/063; D3.5; AD-11/13/15. **Contrato:** write-side do Histórico do Registro; consome a ação de Automação de E4.
- **Dependências:** 3.3, 3.2.
- **Gates:** persistência real, `orgId`/`databaseId`/`recordId` fortes e chave de idempotência = Arquitetura.
- **Fora do escopo:** visualização/navegação (3.5); read-side do Histórico (3.6); arquivos (3.7/3.8).
- **Demonstração vertical:** sim.

### Story 3.5 — Visualização e navegação de Registros

**As a** usuário autorizado, **I want** consultar os Registros de um Database em tabela com filtros e ordenação, **so that** eu encontre os dados que preciso sem vazamento por agregação.

- **Objetivo/valor:** navegação uniforme e segura sobre Registros reais.
- **Escopo:** tabela de Registros; navegação uniforme em todos os Databases ativos (paginação, ordenação por Campo, filtros por tipo, indicação de filtros ativos, limpar filtros, estados carregando/vazio/sem permissão); filtros mínimos (combinação por E; texto contém/igual; número e datas igual/maior/menor/intervalo; seleção contém opção; Sim/Não); **nenhuma consulta revela contagens de Registros inacessíveis** (INV-REPORT-01). **Arquivados e Campo Arquivo** (ajuste 4): Registros **ativos por padrão**; **opção autorizada** para consultar Registros arquivados; **estado claro** quando o Database estiver arquivado; **impossível editar a partir da visualização** quando o Registro ou o Database estiver arquivado; o filtro **`Arquivo possui/não possui` só aparece** quando a capacidade de arquivos e o Campo Arquivo estiverem habilitados (3.7/3.8) — antes disso permanece **oculto, sem simulação**. Fora da Fase 1: grupos E/OU complexos, filtros salvos, visualizações personalizadas, fórmulas, agregações avançadas.
- **Critérios de aceite:**
  - **Given** um Database ativo **When** aberto **Then** exibe os Registros ativos por padrão em tabela com paginação/ordenação/filtros por tipo e estados honestos, com opção autorizada de ver arquivados.
  - **Given** um Registro ou Database arquivado **When** exibido na visualização **Then** não há edição a partir dali; o estado de arquivado é indicado claramente.
  - **Given** a capacidade de arquivos/Campo Arquivo ainda não habilitada (3.7/3.8) **When** o usuário abre os filtros **Then** o filtro `Arquivo possui/não possui` não aparece (oculto, sem simulação).
  - **Given** Registros inacessíveis ao usuário **When** qualquer consulta/contagem é feita **Then** não revela sua existência (INV-REPORT-01).
  - **And** grupos complexos/filtros salvos/visualizações personalizadas/agregações avançadas ficam fora da Fase 1.
- **Rastreabilidade:** FR-20; D3.4; NFR-3/4; INV-REPORT-01.
- **Dependências:** 3.4.
- **Gates:** filtro de arquivo condicionado a 3.7/3.8.
- **Fora do escopo:** Histórico do Registro (3.6); vínculo com Card (3.9).
- **Demonstração vertical:** sim.

### Story 3.6 — Histórico do Registro (read-side)

**As a** usuário autorizado, **I want** consultar o Histórico de um Registro, **so that** eu entenda suas alterações ao longo do tempo, com segurança.

- **Objetivo/valor:** visibilidade cronológica autorizada dos acontecimentos do Registro.
- **Escopo:** **read-side** da trilha própria do Registro (append-only, só a autorizados), **distinta da Auditoria administrativa**: criação, alteração de valores, arquivamento, restauração, inclusão/substituição/remoção lógica de arquivo, vínculo/desvínculo com Card; campos exibidos (tipo, resumo, ator/iniciador, origem, data/hora, antes/depois, referência); autorização de visualização pelo **acesso atual** ao Registro; correção por **novo evento** (não altera o original). **Segurança do Histórico** (ajuste 5): **não persistir binários, chaves de objeto ou URLs temporárias**; para arquivos, registrar **apenas metadados e referência interna segura**; valores **antes/depois respeitam autorização e mascaramento** aplicáveis; correções permanecem como **novos eventos append-only**; eventos de vínculo/desvínculo compartilham um **`correlationId`** (com 3.9). Usa o write-side de 3.4; não recria a captura.
- **Critérios de aceite:**
  - **Given** eventos persistidos por 3.4 (e vínculos de 3.9, arquivos de 3.8) **When** o usuário autorizado abre o Histórico do Registro **Then** vê a timeline com tipo/resumo/ator/origem/data-hora/antes-depois/referência, sem binários/chaves de objeto/URLs temporárias.
  - **Given** um evento de arquivo **When** exibido **Then** mostra apenas metadados e referência interna segura; valores antes/depois respeitam autorização e mascaramento.
  - **Given** um usuário sem acesso atual ao Registro **When** tenta consultar **Then** o acesso é negado.
  - **Given** uma correção **When** registrada **Then** o evento original não é alterado; um novo evento append-only referencia o corrigido.
  - **And** eventos de vínculo/desvínculo compartilham um `correlationId` com os do Card.
- **Rastreabilidade:** FR-19; D3.5; AD-15/30. **Consome:** write-side (3.4).
- **Dependências:** 3.4.
- **Gates:** estrutura/retenção/mascaramento = Arquitetura/Governança/Segurança.
- **Fora do escopo:** Auditoria administrativa (E8).
- **Demonstração vertical:** sim.

### Story 3.7 — Capacidade compartilhada de arquivos

**As a** plataforma, **I want** uma capacidade única e fail-closed de arquivos, **so that** Campos Arquivo, anexos e avatares sejam seguros e reutilizáveis, sem acesso cruzado.

- **Objetivo/valor:** estabelecer, uma única vez, a base segura de arquivos reutilizada por vários recursos.
- **Escopo:** **infraestrutura compartilhada, desacoplada de Card e Registro** (ajuste 6) — Card e Registro são **consumidores integrados em 3.8**, não requisitos-base deste serviço; operações upload/visualizar/baixar/substituir (arquivo único)/adicionar/remover **logicamente**; **permissão herda do recurso** (ver/baixar = leitura; enviar/substituir/remover = edição); acesso a um recurso não libera arquivos de recursos relacionados; **buckets privados**; validação de tamanho/tipo/conteúdo; checksum; **impedir acesso cruzado mesmo conhecendo a chave do objeto**; tipos/limites (bloquear executáveis/scripts/formatos inseguros; tamanho máx por arquivo e limite total por recurso como config operacional global). Reutilizada por E5, E6 e avatar (3.10).
- **Critérios de aceite:**
  - **Given** um arquivo recém-enviado **When** ainda não aprovado na verificação de segurança **Then** permanece em **quarentena e indisponível**; erro, timeout ou indisponibilidade da verificação resulta em **bloqueio fail-closed**; um arquivo rejeitado **nunca** pode ser baixado ou associado como disponível.
  - **Given** um download autorizado **When** solicitado **Then** ocorre por **URL temporária, de curta duração, vinculada ao usuário, ao recurso e à finalidade**; a **chave interna do objeto nunca é usada como autorização**; não há link público permanente.
  - **Given** um usuário sem acesso ao recurso (mesmo conhecendo a chave do objeto) **When** tenta acessar o arquivo **Then** o acesso é negado (buckets privados; sem acesso cruzado).
  - **Given** uma remoção lógica **When** aplicada **Then** é seguida de **expurgo físico conforme a política de retenção**; backups **expiram naturalmente** conforme a política, sem retenção indefinida; retenção excepcional por obrigação legal é **registrada e controlada**.
  - **And** o upload valida tamanho/tipo/conteúdo (bloqueia executáveis/scripts/inseguros) com checksum; limites exibidos antes do envio.
- **Rastreabilidade:** OQ-47; D3.5; NFR-8; AD-27/28/30. **Contrato:** capacidade de arquivos (→ E5, E6, avatar 3.10).
- **Dependências:** autenticação, Organização, tenant e autorização de E1 (1.2/1.3/1.4/1.6) — **não** depende de Card/Registro (ajuste 6).
- **Gates:** **AD-28 (fail-closed):** desabilitada/oculta até storage/segurança prontos; **valores numéricos de limites definidos antes das Stories de upload**; storage/validação/quarentena/antivírus/entrega segura/expurgo = Arquitetura/Segurança.
- **Fora do escopo:** Campo Arquivo/anexo geral por recurso (3.8); limites por Org/Formulário (fora da Fase 1).
- **Demonstração vertical:** sim (após o gate) — arquivo seguro, sem acesso cruzado, com verificação fail-closed.

### Story 3.8 — Campo Arquivo funcional e anexo geral (Card/Registro)

**As a** usuário autorizado, **I want** anexar arquivos a Cards e Registros e usar Campos Arquivo, **so that** eu mantenha documentos no contexto certo, com segurança.

- **Objetivo/valor:** aplicar a capacidade de arquivos aos recursos que a usam, ativando o tipo Arquivo.
- **Escopo:** **ativa o Campo Arquivo** (do catálogo 2.4/2.5) nos Formulários (inicial/Fase/Database), removendo a indisponibilidade de 2.4; **anexo geral** (associado ao recurso, não valor de Campo) para **Card e Registro** (anexo em Tarefa/Solicitação vem em E5); Campo Arquivo único ou múltiplos (identidade, nome original, tipo, tamanho, estado, referência à submissão/alteração); substituir arquivo único não apaga silenciosamente o anterior e gera evento; em Card/Registro arquivado, arquivos existentes visualizáveis/baixáveis, uploads/substituições/remoções bloqueados; **Formulário público recebe arquivo só via Campo Arquivo publicado — não há anexo geral público**. **Upload por Formulário público** (ajuste 7): limite por arquivo; quantidade máxima de arquivos por Campo e por submissão; limite total por submissão; rate limit e proteção contra abuso; validação server-side independente da extensão declarada; arquivo indisponível até concluir a verificação de segurança; nenhuma URL pública permanente; nenhuma possibilidade de contornar autorização por upload direto.
- **Critérios de aceite:**
  - **Given** a capacidade de arquivos habilitada (3.7) **When** um Formulário com Campo Arquivo é publicado **Then** o Campo Arquivo é funcional (a indisponibilidade de 2.4 deixa de se aplicar).
  - **Given** um Card ou Registro **When** um usuário com edição adiciona um anexo geral **Then** o arquivo é associado ao recurso, herdando sua autorização; substituir arquivo único gera evento sem apagar silenciosamente o anterior.
  - **Given** um Formulário público **When** recebe arquivos via Campo Arquivo publicado **Then** aplica limite por arquivo/por Campo/por submissão, rate limit e validação server-side independente da extensão; o arquivo fica indisponível até a verificação; não há URL pública permanente nem contorno de autorização por upload direto.
  - **Given** um Card/Registro arquivado **When** um usuário tenta upload/substituição/remoção **Then** é bloqueado; arquivos existentes permanecem visualizáveis/baixáveis.
  - **And** não há anexo geral público.
- **Rastreabilidade:** OQ-47; D3.5; INV-FORM-01; AD-27/28. **Consome:** capacidade de arquivos (3.7); Form Builder/publicação (2.4/2.5/2.6).
- **Dependências:** 3.7, 3.3, 3.4, 2.9, 2.4, 2.5, 2.6.
- **Gates:** AD-28 e limites numéricos (herdados de 3.7).
- **Fora do escopo:** anexo geral em Tarefa/Solicitação (E5); anexo em e-mail (E6); avatar (3.10).
- **Demonstração vertical:** sim.

### Story 3.9 — Vínculo Card↔Registro (N—N)

**As a** usuário autorizado, **I want** vincular um Card a um Registro, **so that** eu relacione processo e dado sem copiar nem fundir (Card ≠ Registro).

- **Objetivo/valor:** conectar processos e dados preservando a distinção conceitual.
- **Escopo:** Card↔Registro **N—N**; **o mesmo par não se vincula mais de uma vez**; vínculo explícito, não funde nem copia dados, **só dentro da mesma Organização**; autorização = **edição no Card + visualização autorizada do Registro + permissão para executar a ação de relacionamento**; o vínculo **não concede acesso** ao recurso relacionado (interface pode indicar "referência restrita" sem revelar dados); **gera evento nos Históricos do Card (2.17) e do Registro (3.6)**; desvincular só encerra o relacionamento; sem exclusão em cascata; identidade estável; sem cópia automática de dados. **Integridade e correlação** (ajuste 5): garantir **unicidade do par `organizationId + cardId + recordId`** no armazenamento; criação e remoção **idempotentes**; os eventos dos dois Históricos são produzidos de forma **transacional ou por outbox confiável**, compartilhando um `correlationId`; **"recurso ativo"** significa Card e Registro ativos **e também Pipe/Database pais não arquivados**.
- **Critérios de aceite:**
  - **Given** um Card e um Registro da mesma Organização, com Pipe/Database pais ativos **When** um usuário com edição no Card + visualização autorizada do Registro + permissão de relacionamento executa a ação **Then** o vínculo N—N é criado; o par `organizationId+cardId+recordId` é único (o mesmo par não pode ser vinculado duas vezes).
  - **Given** um vínculo Card↔Registro **When** criado/removido (operação idempotente) **Then** gera eventos nos Históricos do Card e do Registro, transacional ou por outbox confiável, com `correlationId` compartilhado; desvincular só encerra o relacionamento.
  - **Given** um usuário sem acesso ao recurso relacionado **When** vê o vínculo **Then** a interface pode indicar "referência restrita" sem revelar dados nem conceder acesso.
  - **Given** um Card/Registro arquivado ou com pai arquivado **When** se tenta criar novo vínculo **Then** é bloqueado (novos vínculos exigem recursos ativos); vínculos existentes são preservados.
  - **And** sem cópia automática de dados nem cascata; identidade estável.
- **Rastreabilidade:** FR-13; RN-073; D3.6; AD-11/13. **Consome:** Card (E2/2.9), Históricos de Card (2.17) e Registro (3.6).
- **Dependências:** 3.4, 2.9, 2.17, 3.6.
- **Gates:** mecanismo de referência tenant-safe e produção transacional/outbox = Arquitetura (AD-11/13).
- **Fora do escopo:** tipo "Referência" como Campo (Non-Goal); Tarefa↔Card / E-mail↔Card (E2/E5/E6).
- **Demonstração vertical:** sim.

### Story 3.10 — Integração FR-32: avatar

**As a** usuário autenticado, **I want** enviar, substituir e remover meu avatar reutilizando a capacidade de arquivos, **so that** eu personalize minha conta com segurança, sem um segundo mecanismo de upload.

- **Objetivo/valor:** completar o Perfil (E1) com avatar seguro, reaproveitando 3.7.
- **Escopo:** enviar/substituir/remover avatar **reutilizando a capacidade compartilhada de arquivos (3.7)** (autorização/validação/segurança + gate AD-28); **sem criar segundo mecanismo de upload**; substitui o avatar padrão por iniciais (Story 1.11) quando houver imagem; dados de avatar são dados pessoais do próprio usuário (LGPD, NFR-32). **Regras específicas do avatar** (ajuste 8): o **avatar original permanece privado**; **somente versões derivadas e seguras** podem ser exibidas a usuários autenticados e autorizados da Organização (onde a identidade do usuário aparece); **nenhuma URL pública permanente**; aceitar **apenas formatos de imagem permitidos**; **validar o conteúdo real** da imagem; **decodificar e reprocessar** a imagem; **remover metadados, incluindo EXIF**; aplicar **dimensões e tamanho máximos próprios de avatar**; **rejeitar SVG ativo** e formatos com conteúdo executável; substituição e remoção **geram evento no fluxo canônico de eventos/auditoria da conta, sem criar um segundo Histórico de Perfil**. Contribuição de suporte a FR-32 (proprietário principal: Épico 1).
- **Critérios de aceite:**
  - **Given** a capacidade de arquivos habilitada (3.7) **When** o usuário envia um avatar **Then** ele é armazenado com a mesma autorização/validação/segurança da capacidade compartilhada, sem segundo mecanismo de upload; a imagem é validada no conteúdo real, reprocessada e tem metadados/EXIF removidos.
  - **Given** um avatar enviado **When** exibido a membros autorizados da Organização **Then** apenas versões derivadas e seguras são exibidas; o original permanece privado; não há URL pública permanente.
  - **Given** um upload de SVG ativo ou formato com conteúdo executável **When** recebido **Then** é rejeitado; só formatos de imagem permitidos, dentro das dimensões/tamanho máximos de avatar, são aceitos.
  - **Given** substituição ou remoção do avatar **When** aplicada **Then** gera evento no fluxo canônico de eventos/auditoria da conta, sem criar um segundo Histórico de Perfil; substitui/retorna ao padrão por iniciais (1.11).
  - **And** com a capacidade desabilitada (AD-28), o upload de avatar fica indisponível de forma honesta, mantendo o avatar padrão por iniciais.
- **Rastreabilidade:** FR-32 (suporte); D6.2; NFR-32; AD-27/28/30. **Consome:** capacidade de arquivos (3.7); Perfil (1.11).
- **Dependências:** 3.7, 1.11.
- **Gates:** AD-28 + limites de arquivo (herdados de 3.7).
- **Fora do escopo:** demais edições de Perfil/conta (E1).
- **Demonstração vertical:** sim.

## Épico 4 — Automações internas (Evento → Condição → Ação)

**Objetivo:** o **núcleo do motor de Automação** — modelagem Quando→Condições→Então ligada a um Pipe, ciclo de vida (ativa/inativa/arquivada + restaurar/duplicar), catálogos canônicos de Eventos/Condições/Ações (D4.1), avaliação AND determinística, disparo pós-transação em fila com entrega at-least-once, idempotência por Execução e por Ação, encadeamento com prevenção robusta de ciclos, trilha de Execuções sanitizada e o **contrato de extensão tipado** que E5 (Tarefa/Notificação) e E6 (E-mail/IA) consomem sem duplicar o motor.

**Valor entregue:** a Organização automatiza reações internas a eventos reais de Card/Registro de forma rastreável, idempotente, sanitizada e sem execução cíclica.

**FRs proprietários:** FR-21 (4.1/4.3/4.5/4.9) · FR-22 (4.2) · FR-23 (4.4/4.6/4.7/4.8). Ações de Tarefa/Solicitação/Notificação (E5) e E-mail/Template/IA (E6) são **pontos de extensão** registrados posteriormente por E5/E6 no contrato de 4.9.

**Depende de:** E1, E2 (evento canônico de movimentação 2.16, serviço de movimentação/preflight 2.14/2.15, Histórico do Card 2.17), E3 (eventos e Ação de Registro; Histórico do Registro 3.6; vínculo Card↔Registro 3.9; ação `Criar Registro relacionado` referenciada por 3.4). **Ordem interna:** `4.1 → 4.9`.

> **Nota de sequência (implementação × detalhamento):** o **núcleo** de E4 é autônomo e está sendo detalhado agora. As **Ações de integração** (Criar Tarefa/Solicitação, Gerar Notificação, Enviar E-mail, IA como Ação) permanecem na fronteira de E5/E6 — E4 entrega o **contrato tipado**, não a implementação delas. Não há dependência de implementação futura de E5/E6 sobre E4.

**Fora do escopo do Épico:** requisição HTTP externa, Webhook, API externa, MCP (Non-Goals); plugins/código do usuário/scripts/handlers externos; implementação das Ações de E5/E6.

**Decisões canônicas preservadas:** R4/D4.1 (catálogos), D4.2 (comportamento do motor: ordem, falha, efeitos parciais), D4.3 (ciclo de vida e acesso), D4.4 (IA como Ação — detalhamento em E6); reconciliação de E-mail/IA da R6.

## Mapa das Stories

| ID | Story | FR/Decisão | Escopo (uma linha) | Dependências |
|---|---|---|---|---|
| 4.1 | Modelo, escopo e referências da Automação | FR-21 · D4.1 | uma Automação por Pipe; referências tenant-safe determinísticas; identidade estável + versões | 2.1, 1.6 |
| 4.2 | Ciclo de vida e gestão da Automação | FR-22 · D4.3 | criar/editar/ativar/desativar/arquivar/restaurar/duplicar; estados ativa/inativa/arquivada; snapshot em edição ativa | 4.1, 2.2, 1.6, 8.2 |
| 4.3 | Catálogo de Eventos (gatilhos) | FR-21 · D4.1 | catálogo completo D4.1 + extensões E5/E6; envelope canônico; emissão opt-in pós-persistência | 4.1, 2.16, 3.4, 3.9 |
| 4.4 | Catálogo de Condições + avaliação AND | FR-23 · D4.2 | domínios Card/Campo/prazo/relacionamento/Fase; operadores do Form Builder; AND; snapshot pós-Evento; fail-closed | 4.3 |
| 4.5 | Catálogo de Ações internas (Card/Registro) | FR-21/23 · D4.1 | mover/atribuir responsável/alterar Campo/finalizar/arquivar Card; criar/editar Registro com alvo determinístico; confirmação humana e revalidação | 4.4, 2.14, 2.15, 2.16, 2.17, 3.4, 3.6, 3.9 |
| 4.6 | Motor de disparo e avaliação | FR-23 · D4.2 | outbox, at-least-once, snapshot da versão, dedup por Execução e Ação, retries e concorrência; ordem/falha/efeitos parciais | 4.3, 4.4, 4.5 |
| 4.7 | Encadeamento e prevenção de ciclos | FR-21/23 · NFR-7 | `executionChainId`/`causationId`, profundidade, assinatura de visita determinística, dedup, timeouts, dead-letter | 4.6 |
| 4.8 | Trilha de Execuções | FR-23 · NFR-6 | aba "Execuções" completa e sanitizada; estados distintos; acesso por papel; filtros/paginação | 4.6, 4.7 |
| 4.9 | Contrato de extensão de Ações e referências | FR-21 · D4.1/D4.4 | registro tipado/versionado de handlers; Ação↔Template (ciclo real); IA como Ação assíncrona com aprovação humana | 4.5, 4.6, 4.7, 4.8 |

---

## Detalhe completo

### Story 4.1 — Modelo, escopo e referências da Automação
1. **ID/Título:** 4.1 — Modelo, escopo e referências da Automação
2. **Objetivo/Valor:** dar forma a uma Automação declarativa presa a um Pipe, com referências determinísticas e tenant-safe.
3. **Narrativa:** Como Administrador, quero modelar uma Automação como Quando→Condições→Então ligada a exatamente um Pipe, para automatizar reações internas daquele processo sem atravessar fronteiras.
4. **Escopo:** cada Automação pertence a **exatamente um Pipe** (RN-100); estrutura declarativa **Quando (Evento) → Condições → Então (Ações)**; ações **internas** apenas (RN-101). Regras explícitas de referência:
   - operações sobre Cards alcançam **apenas Cards do Pipe proprietário** da Automação;
   - **nenhuma referência atravessa Organizações** (NFR-3);
   - Eventos/Ações sobre Registros só usam **Registros da mesma Organização**;
   - como a Automação pertence a um Pipe, um Evento de Registro só a dispara quando o **Registro estiver vinculado a pelo menos um Card daquele Pipe no momento do Evento**;
   - o **mesmo Evento lógico dispara a Automação no máximo uma vez**, mesmo que o Registro tenha vários vínculos com Cards do mesmo Pipe;
   - Ações sobre Registro exigem **alvo determinístico**; não é permitido pesquisar e atualizar indiscriminadamente vários Registros;
   - recursos referenciados usam **IDs estáveis e tenant-safe**;
   - referências inválidas/inacessíveis tornam a configuração **inválida ou bloqueada em modo fail-closed**.
   Cada Automação possui **identidade estável** e **versões/snapshots de configuração** (detalhados em 4.2 e 4.6).
5. **Critérios de aceite:**
   - **Given** um Admin em um Pipe **When** cria uma Automação **Then** ela nasce ligada a exatamente aquele Pipe, com a estrutura Quando→Condições→Então e identidade estável.
   - **Given** um Evento de Registro **When** o Registro não está vinculado a nenhum Card do Pipe proprietário no momento do Evento **Then** a Automação não é disparada; havendo múltiplos vínculos ao mesmo Pipe, dispara no máximo uma vez.
   - **Given** uma Ação sobre Registro **When** o alvo não é determinístico **Then** a configuração é inválida (sem busca/atualização em massa).
   - **Given** uma referência inválida ou inacessível **When** a Automação é ativada ou executada **Then** o comportamento é fail-closed (config inválida/bloqueada), sem atravessar Pipe/Organização.
6. **Rastreabilidade:** FR-21; RN-100/101; D4.1; NFR-3; AD-9/11.
7. **Dependências:** 2.1, 1.6.
8. **Gates:** IDs estáveis/tenant-safe e versionamento de configuração = Arquitetura.
9. **Fora do escopo:** disparo/execução (4.6); catálogos (4.3/4.4/4.5).
10. **Demonstração vertical:** sim.

### Story 4.2 — Ciclo de vida e gestão da Automação
1. **ID/Título:** 4.2 — Ciclo de vida e gestão da Automação
2. **Objetivo/Valor:** governar estados, versões e acesso das Automações ao longo do tempo.
3. **Narrativa:** Como Administrador da Org ou Admin do Pipe, quero criar/editar/ativar/desativar/arquivar/restaurar/duplicar Automações com versionamento, para controlar com segurança o que roda; Membros do Pipe apenas leem.
4. **Escopo:** **estados ativa/inativa/arquivada** (sem `rascunho`); **operações criar/editar/ativar/desativar/arquivar/restaurar/duplicar**. Regras:
   - nova Automação **nasce inativa**; **não há exclusão definitiva**;
   - **arquivar uma Automação ativa implica desativação automática**; **restaurar sempre retorna inativa**;
   - **duplicar** cria nova identidade e nome editável, copia **somente a configuração** (não copia Execuções), a cópia **nasce inativa** e passa novamente por validações de referências/permissões/recursos;
   - ativar/editar **não reprocessa Eventos passados**; desativar/arquivar **impede novas avaliações mas não cancela execuções já iniciadas**; **efeitos já concluídos nunca são revertidos automaticamente**.
   **Edição de Automação ativa** (D4.3): a UX alerta que está ativa; salvar cria **nova versão/snapshot**; novas avaliações usam a nova versão; execuções já iniciadas seguem a versão vigente quando disparadas; cada Execução registra o **`automationVersionId`**; **sem mistura de versões dentro da mesma Execução**.
   **Acesso:** Admin da Organização e Admin do Pipe administram todo o ciclo; **Membro do Pipe só leitura**; **Convidado não acessa** Automações; Membro visualiza apenas resultados de recursos que já pode acessar (visualização **sanitizada**); criar/editar/ativar/desativar/arquivar/restaurar/duplicar **geram evento na Auditoria administrativa**.
5. **Critérios de aceite:**
   - **Given** um Admin da Org/Admin do Pipe **When** cria uma Automação **Then** ela nasce inativa; só as ativas são avaliadas.
   - **Given** uma Automação ativa **When** é arquivada **Then** é automaticamente desativada; **When** restaurada **Then** retorna inativa; execuções já iniciadas não são canceladas e efeitos concluídos não são revertidos.
   - **Given** a duplicação de uma Automação **When** executada **Then** a cópia recebe nova identidade e nome editável, copia só a configuração (sem Execuções), nasce inativa e revalida referências/permissões/recursos.
   - **Given** a edição de uma Automação ativa **When** salva **Then** cria nova versão/snapshot; novas avaliações usam a nova versão e execuções em andamento mantêm a versão disparada (`automationVersionId`), sem mistura de versões.
   - **Given** um Membro do Pipe/Convidado **When** acessa Automações **Then** o Membro só lê resultados sanitizados de recursos autorizados e o Convidado não acessa; toda operação de ciclo gera evento na Auditoria administrativa.
6. **Rastreabilidade:** FR-22; RN-102; D4.3; NFR-4; AD-9/30. **Consome:** write-side da Auditoria (E8/8.2).
7. **Dependências:** 4.1, 2.2, 1.6, 8.2.
8. **Gates:** versionamento/snapshot de configuração = Arquitetura.
9. **Fora do escopo:** catálogos e execução.
10. **Demonstração vertical:** sim.

### Story 4.3 — Catálogo de Eventos (gatilhos)
1. **ID/Título:** 4.3 — Catálogo de Eventos (gatilhos)
2. **Objetivo/Valor:** oferecer o catálogo oficial completo de gatilhos, ancorado em eventos canônicos reais.
3. **Narrativa:** Como Administrador, quero escolher o Evento que dispara a Automação a partir do catálogo aprovado da Fase 1, para reagir a acontecimentos reais e persistidos.
4. **Escopo:** catálogo **fixo e completo da Fase 1** (D4.1). **Eventos núcleo de E4:**
   - **Card criado** (origem interna; submissão pública **aprovada**; triagem pendente **não** dispara);
   - **Card movido** (registra Fase de origem e destino; representa saída e entrada de Fase; qualquer movimentação do Pipe pode disparar se houver Automação inscrita);
   - **mudança efetiva de saúde** (atrasado; vencido; expirado);
   - **Card finalizado**; **Card arquivado**; **Card reaberto**; **Card restaurado**;
   - **Responsável atribuído ou alterado**;
   - **valor de Campo do Card alterado**;
   - **vínculo Card↔Registro criado**; **vínculo Card↔Registro removido**;
   - **Registro criado**; **Registro arquivado**; **Registro restaurado**; **valor de Campo do Registro alterado**;
   - **Formulário de Fase submetido**.
   **Eventos registrados pelas extensões** — E5: Tarefa criada; Tarefa concluída; Tarefa atrasada; demais Eventos de Solicitação **somente se confirmados no catálogo de E5**. E6: E-mail enviado. **`E-mail recebido` permanece indisponível** (recebimento/sincronização fora da Fase 1).
   **Regras de emissão:** Eventos são **opt-in**; só emitidos **após mudança persistida com sucesso**; tentativa rejeitada não gera Evento; retry não gera nova ocorrência lógica; atualização sem mudança efetiva não gera Evento; cada Evento tem **identidade e versão de schema**; o contexto disponível é **declarado por tipo de Evento**; não expor dados de outro Pipe/Organização. **Envelope canônico (mínimo):** `eventId`, `eventType`, `schemaVersion`, `organizationId`, `pipeId` (quando aplicável), IDs dos recursos envolvidos, `occurredAt`, ator e origem, `causationId`, `correlationId`, `executionChainId` (quando originado por Automação), estado anterior e posterior minimizados. **Entrada/saída de Fase derivam do mesmo Evento canônico de movimentação**, sem duplicidade técnica indevida.
5. **Critérios de aceite:**
   - **Given** a modelagem de uma Automação **When** o Admin escolhe o Evento **Then** só aparecem Eventos do catálogo aprovado (núcleo D4.1 + extensões confirmadas de E5/E6), ancorados em eventos canônicos reais.
   - **Given** um Card criado por submissão pública **When** ainda em triagem pendente **Then** não dispara; só a submissão **aprovada** emite "Card criado".
   - **Given** uma mudança sem efeito real, uma tentativa rejeitada ou um retry **When** ocorre **Then** nenhum novo Evento lógico é emitido (opt-in, pós-persistência, sem duplicidade).
   - **Given** qualquer Evento emitido **When** entregue ao motor **Then** carrega o envelope canônico mínimo, com estado anterior/posterior minimizados e sem dados de outro Pipe/Org.
6. **Rastreabilidade:** FR-21; RN-100; D4.1; AD-13/30. **Consome:** evento canônico de movimentação (2.16), eventos de Card (E2), eventos de Registro e vínculo (3.4/3.9).
7. **Dependências:** 4.1, 2.16, 3.4, 3.9.
8. **Gates:** formato/entrega do envelope canônico e versionamento de schema = Arquitetura.
9. **Fora do escopo:** avaliação de Condições (4.4); implementação dos Eventos de E5/E6.
10. **Demonstração vertical:** sim.

### Story 4.4 — Catálogo de Condições + avaliação AND
1. **ID/Título:** 4.4 — Catálogo de Condições e avaliação AND determinística
2. **Objetivo/Valor:** filtrar quando a Automação age, de forma previsível e segura.
3. **Narrativa:** Como Administrador, quero Condições combinadas por AND sobre o estado pós-Evento, para que a Automação só aja quando fizer sentido, sem vazar dados nem gerar efeitos.
4. **Escopo:** domínios oficiais de Condição — **Card; Campo e valor; prazo e marco; relacionamento; Fase**. Operadores **reutilizam o catálogo por tipo de Campo do Form Builder** (sem segundo catálogo incompatível). Regras:
   - combinação **somente `E/AND`**; **ausência de Condições = aprovação direta**; **grupos `OU/OR` e aninhamentos fora da Fase 1**;
   - a avaliação usa o **snapshot pós-Evento persistido**; operadores de mudança podem consultar **valor anterior e posterior** do Evento;
   - **execução tardia na fila não altera retroativamente** o resultado das Condições;
   - **antes de executar uma Ação, o estado atual do recurso é revalidado separadamente** (4.5/4.6);
   - **sem coerção implícita** entre tipos incompatíveis; comportamento **explícito para nulo, vazio e Campo ausente**;
   - datas/prazos usam o **fuso oficial definido pela Arquitetura**;
   - Campo/Fase/responsável/recurso removido ou arquivado **invalida a referência** → **impede ativação ou bloqueia execução fail-closed**;
   - Condições **nunca revelam valores** que o usuário/principal não poderia acessar; **avaliação sem efeitos colaterais nem novos Eventos**.
5. **Critérios de aceite:**
   - **Given** um Evento disparado **When** as Condições são avaliadas **Then** aplica AND sobre o snapshot pós-Evento persistido; só prossegue se todas forem verdadeiras; sem Condições, segue direto.
   - **Given** uma avaliação tardia na fila **When** executada **Then** usa o snapshot do Evento (não muda retroativamente); antes de cada Ação, o estado atual é revalidado separadamente.
   - **Given** valores nulo/vazio/Campo ausente ou tipos incompatíveis **When** avaliados **Then** o comportamento é explícito e sem coerção implícita; datas usam o fuso oficial.
   - **Given** um Campo/Fase/responsável/recurso removido ou arquivado **When** referenciado **Then** a referência é inválida (impede ativação ou bloqueia execução fail-closed); Condições não revelam valores inacessíveis nem produzem efeitos.
6. **Rastreabilidade:** FR-23; RN-103; D4.2; NFR-4/6. **Consome:** catálogo de tipos/operadores do Form Builder (2.4/2.5).
7. **Dependências:** 4.3.
8. **Gates:** fuso oficial e semântica de comparação = Arquitetura.
9. **Fora do escopo:** execução das Ações (4.5/4.6).
10. **Demonstração vertical:** sim.

### Story 4.5 — Catálogo de Ações internas (Card/Registro)
1. **ID/Título:** 4.5 — Catálogo de Ações internas sobre Card e Registro
2. **Objetivo/Valor:** entregar as Ações núcleo respeitando os serviços de domínio, confirmação humana e o principal Automação.
3. **Narrativa:** Como Administrador, quero que a Automação execute Ações internas sobre Card e Registro, para automatizar o trabalho sem contornar regras, confirmações ou permissões.
4. **Escopo:** catálogo núcleo aprovado (RN-101):
   - **Card:** mover Card; atribuir/alterar Responsável; alterar valor de Campo; finalizar Card; arquivar Card.
   - **Registro:** criar Registro; **criar Registro relacionado ao Card de contexto**; editar Registro. **Alvo de edição determinístico:** o Registro que originou o Evento; um Registro vinculado ao Card selecionado por **regra inequívoca**; ou um Registro definido explicitamente na configuração. **Sem atualização ampla, busca aberta ou alteração indeterminada.**
   **Extensões fora desta Story** — E5: criar Tarefa; criar Solicitação (conforme catálogo de E5); gerar Notificação. E6: enviar E-mail usando Template; IA como Ação.
   **Regras de execução:** toda Ação **reutiliza o serviço do domínio** correspondente — mover Card usa **2.14 + preflight 2.15**; alterar Campo usa validações/tipos do Form Builder; criar/editar Registro usa as regras de E3; **criar Registro relacionado cria no máximo um Registro e o vínculo correspondente de forma idempotente**; todas revalidam **regras de negócio, estado e existência do alvo**; **nenhuma Ação contorna confirmação humana** (mover, finalizar, arquivar, alterar dados protegidos e demais operações sensíveis). Quando a confirmação humana for necessária: **não** é falha técnica; usa estado **`aguardando confirmação`/`bloqueada por confirmação humana`**; **não mantém worker/job aberto indefinidamente**; a continuação ocorre por **fluxo separado e rastreável**.
   **Principal Automação:** é um **principal interno próprio** — não impersona permanentemente o criador; escopo restrito à Organização, ao Pipe e aos recursos configurados; a **ativação valida a permissão do Administrador** que configurou os alvos; a **execução revalida o escopo do principal Automação**; a Automação **não amplia poderes** do criador nem do ator do Evento; o Evento preserva quem iniciou a mudança original; a trilha distingue **`ator`, `iniciador` e `principal Automação`**.
5. **Critérios de aceite:**
   - **Given** Condições satisfeitas **When** a Ação "mover Card"/"finalizar"/"arquivar" executa **Then** usa o serviço de domínio (2.14 + preflight 2.15) e não contorna confirmação humana obrigatória.
   - **Given** a Ação "criar Registro relacionado" **When** executa **Then** cria no máximo 1 Registro e o vínculo correspondente de forma idempotente, com alvo determinístico dentro da mesma Organização.
   - **Given** uma Ação que exige confirmação humana **When** alcançada **Then** entra em `aguardando confirmação`/`bloqueada por confirmação humana` (não falha técnica), sem manter o job aberto; a continuação é por fluxo separado e rastreável.
   - **Given** qualquer Ação **When** vai executar **Then** revalida regras de negócio/estado/existência do alvo sob o principal Automação (escopo restrito), sem ampliar poderes; a trilha distingue ator/iniciador/principal.
6. **Rastreabilidade:** FR-21/23; RN-101; D4.1/D4.2; AD-9/13/18. **Consome:** movimentação/preflight (2.14/2.15), evento canônico (2.16), Histórico do Card (2.17), criação/edição de Registro (3.4), Histórico do Registro (3.6), vínculo Card↔Registro (3.9).
7. **Dependências:** 4.4, 2.14, 2.15, 2.16, 2.17, 3.4, 3.6, 3.9.
8. **Gates:** mecanismo do principal Automação e fluxo de confirmação separado = Arquitetura/Segurança.
9. **Fora do escopo:** motor de disparo (4.6); extensões E5/E6 (4.9).
10. **Demonstração vertical:** sim.

### Story 4.6 — Motor de disparo e avaliação
1. **ID/Título:** 4.6 — Motor de disparo, avaliação, ordem e efeitos parciais
2. **Objetivo/Valor:** executar Automações de forma confiável (at-least-once) e idempotente, sem acoplar à transação de origem.
3. **Narrativa:** Como plataforma, quero avaliar/executar Automações após o commit da origem, em fila, com idempotência e sem prometer exatamente-uma-vez, para garantir consistência sem duplicar efeitos.
4. **Escopo:** entrega **at-least-once** (não promete execução física exatamente-uma-vez). Contrato:
   - Evento criado **junto da transação de origem por outbox confiável**; **elegível só após commit**; fila processa **assíncrono**;
   - **uma ocorrência lógica gera no máximo uma Execução lógica por Automação**; **chave de dedup mínima: `eventId` + `automationId` + `automationVersionId`**;
   - cada Ação tem **chave idempotente própria: `executionId` + `actionId`/posição estável**; retry **não repete efeitos concluídos**;
   - a **versão da Automação é capturada quando a Execução lógica é criada**; desativação/arquivamento posterior **não cancela Execução já iniciada**;
   - antes de cada Ação: **estado, referência, autorização e regras de negócio revalidados**; falhas usam **tentativas limitadas e backoff**; **esgotar tentativas → estado final explícito**; **nenhuma falha desaparece silenciosamente**;
   - concorrência sobre o mesmo recurso usa **controle de concorrência/versão**; **não promete ordem global** entre Eventos/Automações; ordem por recurso, quando o domínio exigir, é garantida pela Arquitetura ou tratada como **conflito revalidado**.
   **Ordem, falha e efeitos parciais (D4.2):** Ações de **uma mesma Automação executam na ordem configurada**; **ordem entre Automações diferentes não é garantida** (independentes); ao **falhar uma Ação, as seguintes daquela Automação não executam**; **efeitos anteriores concluídos permanecem**; **sem rollback automático entre Ações**; a Execução indica **sucesso parcial**; a Ação que falhou é registrada e as posteriores ficam **bloqueadas por falha anterior**; outras Automações inscritas no mesmo Evento continuam; a Fase 1 **não identifica automaticamente Ações independentes**; conflitos entre Automações sobre o mesmo recurso **não têm ordem garantida**, mas todas passam pelas regras do domínio e o resultado/conflito fica rastreável.
5. **Critérios de aceite:**
   - **Given** um evento committado **When** o motor processa **Then** ocorre pós-commit, via outbox, em fila assíncrona, avaliando só Automações ativas.
   - **Given** a mesma ocorrência lógica reentregue (at-least-once/retry) **When** consumida **Then** gera no máximo uma Execução lógica por Automação (dedup `eventId`+`automationId`+`automationVersionId`) e não repete efeitos de Ação já concluídos (`executionId`+`actionId`).
   - **Given** uma Automação com várias Ações **When** uma Ação falha **Then** as seguintes daquela Automação não executam, os efeitos anteriores permanecem (sem rollback), a Execução marca sucesso parcial e as posteriores ficam "bloqueadas por falha anterior"; outras Automações do mesmo Evento seguem.
   - **Given** tentativas esgotadas ou concorrência sobre o mesmo recurso **When** ocorrem **Then** há estado final explícito e controle de concorrência/versão, sem falha silenciosa e sem promessa de ordem global.
6. **Rastreabilidade:** FR-23; D4.2; NFR-6; AD-13/18. **Consome:** eventos canônicos e sua chave de idempotência (2.16, 3.4/3.9).
7. **Dependências:** 4.3, 4.4, 4.5.
8. **Gates (Arquitetura):** outbox; fila; retries; backoff; timeout; concorrência; idempotência; recuperação de jobs interrompidos.
9. **Fora do escopo:** encadeamento/ciclos (4.7); trilha (4.8).
10. **Demonstração vertical:** sim.

### Story 4.7 — Encadeamento e prevenção de ciclos
1. **ID/Título:** 4.7 — Encadeamento e prevenção robusta de execução cíclica
2. **Objetivo/Valor:** permitir encadeamento legítimo sem loops (diretos ou indiretos) nem tempestade de execuções.
3. **Narrativa:** Como plataforma, quero controle robusto de encadeamento, para que Ações que geram novos Eventos não causem ciclo direto/indireto nem estouro.
4. **Escopo:** uma Ação pode gerar novo Evento que dispara outra Automação (encadeamento legítimo). Prevenção (NFR-7, AD-18):
   - **propagação de `executionChainId`**; **`causationId` apontando para o Evento/Ação anterior**; **incremento de profundidade**;
   - **assinatura determinística de visita** baseada, no mínimo, em **Automação + Evento + Ação + recurso alvo**; a **mesma assinatura não executa repetidamente na mesma cadeia**;
   - **auto-reentrada direta** da mesma Automação **bloqueada**; **reentrada indireta também detectada**;
   - **dedup por `eventId` continua**, mas **não substitui** a prevenção de ciclos entre novos Eventos;
   - atingir **profundidade/timeout/tentativas/dedup interrompe somente a cadeia afetada**, com **registro do motivo**; **sem loop silencioso**; outras cadeias independentes continuam.
5. **Critérios de aceite:**
   - **Given** uma Ação que gera novo Evento **When** dispara outra Automação **Then** propaga `executionChainId`, define `causationId` e incrementa a profundidade.
   - **Given** uma assinatura de visita (Automação+Evento+Ação+recurso) já executada na cadeia **When** reaparece **Then** não executa novamente (bloqueia auto-reentrada direta e reentrada indireta), sem depender só da dedup por `eventId`.
   - **Given** uma cadeia que atinge profundidade/timeout/tentativas/dedup **When** o limite é alcançado **Then** só a cadeia afetada é interrompida, com motivo registrado (sem loop silencioso); outras cadeias seguem.
6. **Rastreabilidade:** FR-21/23; NFR-7; AD-18/30.
7. **Dependências:** 4.6.
8. **Gates (Arquitetura, antes da implementação; sem inventar números agora):** profundidade máxima; tentativas máximas; timeout por Ação; timeout por Execução; timeout/duração máxima da cadeia; retenção das Execuções; política de dead-letter/reprocessamento autorizado.
9. **Fora do escopo:** trilha (4.8).
10. **Demonstração vertical:** sim.

### Story 4.8 — Trilha de Execuções
1. **ID/Título:** 4.8 — Trilha de Execuções (aba "Execuções") completa e sanitizada
2. **Objetivo/Valor:** visibilidade operacional legível, sanitizada e autorizada do comportamento das Automações.
3. **Narrativa:** Como Administrador, quero uma aba "Execuções" completa e sanitizada, para entender e diagnosticar avaliações, execuções, cadeias e interrupções sem vazar dados sensíveis.
4. **Escopo:** aba **"Execuções"** (UX-DR13; "logs" fica para observabilidade técnica). **Registra, no mínimo:** `executionId`; Automação e **versão utilizada**; Evento e tipo; estado da avaliação; resultado de cada Condição; Ações na ordem configurada; estado individual de cada Ação; tentativa atual e total; sucesso/falha/sucesso parcial; aguardando confirmação; bloqueada por confirmação; bloqueada por falha anterior; interrompida por limite; ator; iniciador; origem; principal Automação; início/fim; duração; `correlationId`; `executionChainId`; código de erro sanitizado; motivo legível. **Distingue claramente:** não satisfeita; sucesso; sucesso parcial; falha; bloqueada; aguardando confirmação; interrompida por limite (estados honestos, UX-DR6). **Não registra/exibe:** payload bruto; senha; token; segredo; chave de API; URL assinada; chave interna de storage; prompt completo; resposta completa de IA; stack trace; conteúdo pessoal desnecessário; valores de Campos sem necessidade operacional (NFR-1/8/16). **Acesso:** Admin da Org e Admin do Pipe veem a trilha sanitizada; **Membro vê só Execuções associadas a recursos que já pode acessar**; referências inacessíveis aparecem **de forma restrita, sem revelar existência/conteúdo**; **Convidado não acessa**; arquivar a Automação **preserva as Execuções**. **Filtros mínimos** por período, estado e Evento, com **paginação**. Separação: `Execuções` = trilha funcional do usuário; **Pino/Sentry/logs técnicos = observabilidade interna**.
5. **Critérios de aceite:**
   - **Given** uma avaliação/execução (inclusive cadeias e interrupções de 4.7) **When** ocorre **Then** registra o conjunto mínimo de campos, com versão da Automação, `executionChainId` e estados distintos (não satisfeita/sucesso/parcial/falha/bloqueada/aguardando/interrompida).
   - **Given** a trilha **When** exibida **Then** nunca mostra payloads/segredos/tokens/URLs assinadas/chaves de storage/prompts/respostas de IA/stack trace/conteúdo pessoal desnecessário (sanitizada).
   - **Given** um Membro do Pipe **When** consulta **Then** só vê Execuções de recursos que já acessa; referências inacessíveis aparecem restritas, sem revelar existência/conteúdo; Convidado não acessa.
   - **And** há filtros por período/estado/Evento com paginação; a área é separada da observabilidade técnica (Pino/Sentry).
6. **Rastreabilidade:** FR-23; NFR-1/6/8/16; UX-DR6/DR13; AD-30. **Consome:** motor (4.6) e prevenção de ciclos (4.7).
7. **Dependências:** 4.6, 4.7.
8. **Gates:** retenção, descarte, proteção e eventual anonimização = Governança/Arquitetura.
9. **Fora do escopo:** observabilidade técnica/Sentry/Pino (transversal).
10. **Demonstração vertical:** sim.

### Story 4.9 — Contrato de extensão de Ações e referências de recursos
1. **ID/Título:** 4.9 — Contrato de extensão de Ações e referências de recursos
2. **Objetivo/Valor:** abrir o motor para E5/E6 por um registro tipado e versionado, com integridade de referência e aprovação humana para IA.
3. **Narrativa:** Como plataforma, quero um contrato tipado de extensão de Ações, para que E5/E6 registrem suas Ações no mesmo motor, com integridade Ação↔Template e IA sob aprovação humana.
4. **Escopo:** **registro interno e versionado de handlers de Ação**, contendo: identificador estável do tipo de Ação; versão do schema; schema de configuração; validador de configuração; verificação de disponibilidade/gate; resolvedor determinístico de alvo; revalidação de autorização; executor idempotente; política de sanitização; descrição dos Eventos que pode produzir; dados permitidos na trilha. **Não permitido na Fase 1:** plugins arbitrários; código do usuário; scripts; handlers externos; execução HTTP. **E5 e E6 registram Ações no mesmo motor, sem motores paralelos.**
   **Ação↔Template:** terminologia do **ciclo real de Template de E6** (criar/editar/arquivar/restaurar — **não** publicado/despublicado/removido); referência por **ID estável**; Template da **mesma Organização**; **integridade referencial**; **Template arquivado/indisponível bloqueia ativação ou execução**; **nenhuma Ação fica órfã**; editar/arquivar Template **não altera silenciosamente uma Execução já iniciada**; a **semântica exata de versão da referência Ação↔Template é fechada na Arquitetura antes da implementação de E6**; **revalidação no momento da execução**; **fail-closed**.
   **IA como Ação (D4.4; detalhamento em E6):** contrato suporta **resultado assíncrono e aprovação humana** — IA pode produzir conteúdo/classificação/sugestão; **nenhuma saída gera efeito operacional automaticamente**; classificação **não grava Campo automaticamente**; efeito operacional gera **comando proposto**; estados **aguardando aprovação/aprovado/rejeitado/expirado/inválido por mudança de contexto**; a **cadeia não pode usar outra Ação para contornar a aprovação**; **aprovação exige usuário com permissão atual** e **não amplia poderes**; antes do efeito, revalidar **aprovador, principal Automação, contexto, alvo e regras de negócio**; **falha/timeout/indisponibilidade da IA não produz comando nem efeito**; o **fluxo manual equivalente permanece disponível** (NFR-14/17, AD-20).
5. **Critérios de aceite:**
   - **Given** o registro tipado de handlers **When** E5/E6 registram Ações **Then** cada handler declara tipo estável/versão/schema/validador/gate/resolvedor de alvo/revalidação/executor idempotente/sanitização/Eventos produzidos/dados de trilha, usando o motor (4.6/4.7/4.8) sem reimplementá-lo; plugins/código/scripts/handlers externos/HTTP não são permitidos.
   - **Given** uma Ação que referencia um Template **When** o Template é arquivado/indisponível **Then** bloqueia ativação ou execução (fail-closed), sem deixar a Ação órfã; editar/arquivar não altera silenciosamente uma Execução já iniciada; revalidação ocorre na execução (semântica de versão fechada na Arquitetura antes de E6).
   - **Given** IA como Ação **When** produz saída **Then** nenhum efeito operacional é automático: gera comando proposto (aguardando aprovação/aprovado/rejeitado/expirado/inválido), a aprovação exige usuário com permissão atual e não amplia poderes; falha/timeout da IA não produz comando; o fluxo manual permanece.
   - **And** a cadeia não pode usar outra Ação para contornar a aprovação humana; antes do efeito, aprovador/principal/contexto/alvo/regras são revalidados.
6. **Rastreabilidade:** FR-21; RN-104; D4.1/D4.4; NFR-14/17; AD-20/28. **Contrato:** consumido por E5 (Tarefa/Solicitação/Notificação) e E6 (E-mail/Template/IA).
7. **Dependências:** 4.5, 4.6, 4.7, 4.8.
8. **Gates:** **OQ-26 (mecanismo Ação↔Template + prevenção de ciclos = Arquitetura, antes das Stories técnicas)**; semântica de versão Ação↔Template fechada antes de E6; AD-28 (fail-closed) para Ações de E-mail/IA.
9. **Fora do escopo:** implementação comportamental das Ações de E5/E6.
10. **Demonstração vertical:** parcial — o contrato é verificável via Ações núcleo (4.5); as extensões demonstram em E5/E6.

---

## Resumo do Épico 4 (gravado)
- **9 Stories**, ordem `4.1 → 4.9`, sem dependência futura interna.
- **Cobertura:** FR-21 (4.1/4.3/4.5/4.9) · FR-22 (4.2) · FR-23 (4.4/4.6/4.7/4.8). **3 FRs proprietários.**
- **Catálogos canônicos preservados:** Eventos (D4.1, lista completa + extensões E5/E6), Condições (5 domínios + operadores do Form Builder), Ações núcleo (Card: mover/responsável/Campo/finalizar/arquivar; Registro: criar/relacionado/editar com alvo determinístico).
- **Motor (D4.2):** at-least-once + outbox; dedup por Execução (`eventId`+`automationId`+`automationVersionId`) e por Ação (`executionId`+`actionId`); ordem intra-Automação, sem ordem global; falha interrompe as Ações seguintes daquela Automação sem rollback; prevenção de ciclos por assinatura de visita determinística + `executionChainId`/`causationId`.
- **Contratos cross-epic consumidos:** 2.14/2.15/2.16/2.17 (E2), 3.4/3.6/3.9 (E3), 8.2 (Auditoria). **Entrega:** contrato tipado + Ação↔Template + IA sob aprovação, consumidos por E5 e E6 (sem dependência de implementação futura sobre E4).
- **Gates reais:** OQ-26; limites numéricos do motor (profundidade/tentativas/timeouts/retenção/dead-letter) antes das Stories técnicas; outbox/fila/idempotência/concorrência/recuperação = Arquitetura (AD-18); AD-28 (fail-closed) para E-mail/IA; fuso oficial e semântica de comparação = Arquitetura.
- **Fronteiras/Non-Goals mantidos:** HTTP/Webhook/API/MCP fora; plugins/código do usuário fora; IA sem efeito direto (AD-20/NFR-17); `E-mail recebido` indisponível (fora da Fase 1).

## Épico 5 — Tarefas, Solicitações e Notificações

**Objetivo:** entregar o trabalho operacional — Tarefas (prazo, "atrasada" derivada) e Solicitações (com Responsável) — e o sistema de Notificações in-app de **fonte única** (badge/popover/página consistentes), com catálogo e distribuição, preferências por tipo, e as Ações/Eventos que se registram no contrato do motor de E4 (4.9).

**Valor entregue:** as pessoas acompanham pendências reais e recebem avisos consistentes, tenant-safe e autorizados, sem superfícies divergentes.

**FRs proprietários:** FR-27 (5.1) · FR-28 (5.2) · FR-29 (5.3/5.4/5.5) · FR-30 (5.6). Integração com Automação em 5.7.

**Depende de (por contrato, não por implementação futura):** contrato estável de **Membership** (`Account + Membership + activeOrganizationId + Membership ativa`) da fundação (E1: 1.2/1.3/1.4) e da Arquitetura (AD-7) — **não** da interface administrativa de E8; **matriz canônica de autorização** (E1/1.6, AD-9); eventos de Card (2.16) e Tarefa↔Card 0..1 (E2); **capacidade compartilhada de arquivos 3.7** (E3); contrato do motor de Automação 4.9 (E4). *Se o contrato de consulta de Membership ativa ainda não estiver formalizado na fundação, registrá-lo como **contrato arquitetural obrigatório**, sem transferir a propriedade funcional de E8 (convite/aceite/alteração de papel/suspensão/remoção/reatribuição).*

> **Nota de sequência:** o **núcleo** (Tarefas/Solicitações/Notificações + INV-NOTIF-01) é autônomo. A Story **5.7** consome o contrato de E4 (4.9), sem reimplementar o motor. A ordem interna **não é linear** — ver o grafo de paralelização no resumo.

**Fora do escopo do Épico:** motor/scheduler/trilha de Automação (E4); envio de e-mail/IA (E6); relatórios/indicadores (E7); notificação externa (push/e-mail) — **Fase 1 é in-app apenas**.

## Mapa das Stories

| ID | Story | FR/Decisão | Escopo (uma linha) | Dependências |
|---|---|---|---|---|
| 5.1 | Tarefas: ciclo de vida e acompanhamento | FR-27 · D5.2 | Org+Pipe obrigatórios, Card 0..1; ciclo completo (inclui restaurar); "atrasada" derivada + Evento canônico idempotente; Responsável=Membership ativa; anexos; Histórico | contrato Membership, matriz authz, 2.9, 3.7 |
| 5.2 | Solicitações: ciclo de vida e Responsável | FR-28 · D5.2 | Org+Pipe obrigatórios, Card 0..1; ciclo completo (inclui restaurar); reatribuição explícita; anexos; Histórico | contrato Membership, matriz authz, 2.9, 3.7 |
| 5.3 | Fonte única de Notificações (write-side) | FR-29 · AD-22 | evento/conteúdo canônico imutável + registro por destinatário (`readAt`); idempotência; segurança/sanitização | 1.6 |
| 5.4 | Superfícies, leitura e preferências | FR-29 · INV-NOTIF-01 | badge/popover/página da mesma fonte; marcar lida idempotente + cursor; preferências por tipo (R6); alimenta FR-5 | 5.3 |
| 5.5 | Tempo real como invalidação (Socket.IO) | FR-29 · AD-21/23 | Socket.IO comunica mudança, não é fonte de verdade; canal authz+cursor; degrade para consulta canônica | 5.3, 5.4 |
| 5.6 | Catálogo e distribuição de Notificações in-app | FR-30 · D6.3 | catálogo completo (E5 + tipos registrados por E6/E8); distribuição idempotente; preferências; gate OQ-33 fechado na Arquitetura | 5.3, 2.16, contrato Membership, 5.4 |
| 5.7 | Integração com Automação (Eventos/Ações de E5) | FR-27/28/29 · D4.1 | Eventos de Tarefa/Solicitação + Ações Criar Tarefa/Criar Solicitação/Enviar Notificação in-app no contrato 4.9 | 5.1, 5.2, 5.3, 5.6, 4.9 |

---

## Detalhe completo

### Story 5.1 — Tarefas: ciclo de vida e acompanhamento
1. **ID/Título:** 5.1 — Tarefas: ciclo de vida e acompanhamento
2. **Objetivo/Valor:** acompanhar pendências com prazo, status honesto e Responsável válido.
3. **Narrativa:** Como membro atuando sob seu papel efetivo no Pipe, quero criar e acompanhar Tarefas com prazo e Responsável, para conduzir o trabalho operacional sem perder pendências.
4. **Escopo:**
   - **Pertencimento e relacionamentos:** cada Tarefa pertence a **exatamente uma Organização** e a **exatamente um Pipe**; associada a **zero ou um Card**; quando associada, o Card pertence ao **mesmo Pipe e Organização**; a associação **não funde** os recursos; acesso à Tarefa **não** concede acesso ao Card e vice-versa; referências restritas **não revelam** dados do recurso inacessível.
   - **Ciclo de vida:** operações **criar/editar/atribuir ou alterar Responsável/concluir/reabrir/arquivar/restaurar**; estados operacionais persistidos **`aberta`/`concluída`**; **arquivamento tratado separadamente do estado operacional**; nova Tarefa nasce `aberta`; concluir preserva Pipe/Card/anexos/Histórico; reabrir retorna a `aberta`; arquivar impede edição/conclusão/reabertura/troca de Responsável/novos anexos, mas permanece consultável em leitura por autorizados; restaurar preserva identidade/Pipe/Card/Responsável/prazo/anexos/Histórico; **sem exclusão definitiva pelo usuário**.
   - **Estado `atrasada` (derivado):** Tarefa `aberta` + prazo vencido, no **fuso oficial** da Organização/Arquitetura; Tarefa `concluída` **não** aparece como atualmente atrasada (embora o Histórico registre conclusão após o prazo); alterar o prazo **recalcula imediatamente** a condição derivada. O **Evento canônico "Tarefa atrasada"** é tratado com emissão única e idempotente (ver §"Evento canônico" abaixo e 5.7).
   - **Responsável:** referencia **zero ou uma Membership ativa** da mesma Organização; atribuição/troca exigem Membership ativa; **nunca manter silenciosamente referência operacional inválida**; suspensão/remoção de Membership usa o **contrato de reatribuição da Administração** (E8/8.4–8.6); autoria e Responsável histórico preservados; recursos abertos são **reatribuídos ou explicitamente deixados sem Responsável** conforme o fluxo administrativo aprovado.
   - **Anexos:** integram **diretamente a capacidade compartilhada de arquivos (3.7)** (não o mecanismo específico de Card/Registro de 3.8); herdam a autorização da Tarefa; gate **AD-28**.
   - **Autorização:** deriva da **Organização + papel efetivo no Pipe + concessões aplicáveis**; **deny-by-default**; Admin da Org no escopo da Org; Admin do Pipe administra recursos daquele Pipe; Membro atua conforme permissão efetiva; Convidado sem acesso implícito; vínculo com Card **não amplia** permissões; listagens/contagens/buscas **não revelam** recursos inacessíveis; **reutiliza a matriz canônica** (sem nova matriz); revalidação no servidor.
   - **Evento canônico "Tarefa atrasada":** um **mecanismo temporal confiável** (job agendado/delayed job/estratégia equivalente = Arquitetura) identifica quando uma Tarefa aberta ultrapassa o prazo; **não persiste `atrasada`**; persiste a **ocorrência canônica do Evento**; emite **no máximo uma ocorrência por versão relevante do prazo** (chave idempotente mínima **`taskId` + versão/valor do prazo**); alterar o prazo invalida a ocorrência anterior quando aplicável; reabrir Tarefa vencida segue regra determinística; retry não gera novo Evento lógico; concluir antes do processamento impede emissão incorreta; atraso no scheduler **não** gera duplicidade.
   - **Histórico (append-only):** criação; edição relevante; mudança de prazo; atribuição/troca de Responsável; conclusão; reabertura; arquivamento; restauração; vínculo/desvínculo com Card; inclusão/remoção lógica de anexos.
5. **Critérios de aceite:**
   - **Given** um membro autorizado no Pipe **When** cria uma Tarefa **Then** ela nasce `aberta`, pertence a exatamente um Pipe/Organização e pode associar-se a 0..1 Card do mesmo Pipe/Org, sem fundir nem ampliar permissões.
   - **Given** uma Tarefa `aberta` com prazo vencido (fuso oficial) **When** exibida **Then** aparece como `atrasada` (derivada); concluída não aparece atrasada; alterar o prazo recalcula imediatamente.
   - **Given** o Evento "Tarefa atrasada" **When** o mecanismo temporal processa **Then** emite no máximo uma ocorrência por versão do prazo (idempotência `taskId`+prazo), sem persistir `atrasada` e sem duplicar por retry/atraso do scheduler.
   - **Given** o Responsável **When** definido/trocado **Then** só aceita Membership ativa; suspensão/remoção aciona o contrato de reatribuição (E8), sem referência inválida silenciosa, preservando autoria histórica.
   - **Given** arquivar/restaurar **When** aplicado **Then** arquivar bloqueia escrita (mantendo leitura autorizada) e restaurar preserva identidade/Pipe/Card/Responsável/prazo/anexos/Histórico; anexos seguem 3.7 (AD-28); tudo append-only no Histórico.
6. **Rastreabilidade:** FR-27; RN-090/092; D5.2; NFR-3/4; INV-WORK-01/02; AD-9/28/30. **Consome:** contrato de Membership (E8/reatribuição 8.4–8.6), Card (2.9), arquivos (3.7).
7. **Dependências:** contrato de Membership, matriz canônica de autorização (1.6), 2.9, 3.7.
8. **Gates:** anexos = AD-28; **scheduler/delayed jobs, timezone, recuperação após indisponibilidade e idempotência temporal** do Evento "Tarefa atrasada" = Arquitetura.
9. **Fora do escopo:** Notificações (5.3+); registro no motor (5.7).
10. **Demonstração vertical:** sim.

### Story 5.2 — Solicitações: ciclo de vida e Responsável
1. **ID/Título:** 5.2 — Solicitações: ciclo de vida e Responsável
2. **Objetivo/Valor:** encaminhar e resolver demandas internas com responsável válido e rastreável.
3. **Narrativa:** Como membro atuando sob seu papel efetivo no Pipe, quero abrir e acompanhar Solicitações com Responsável, para resolver demandas internas com rastreabilidade.
4. **Escopo:**
   - **Pertencimento:** exatamente uma Organização; **exatamente um Pipe**; associação opcional com **zero ou um Card**; Card associado pertence ao mesmo Pipe/Organização; o vínculo **não concede acesso** automático ao outro recurso.
   - **Ciclo de vida:** operações **criar/editar/atribuir ou alterar Responsável/resolver/reabrir/arquivar/restaurar**; estados persistidos **`aberta`/`resolvida`** (RN-091); arquivamento separado do estado operacional; nova Solicitação nasce `aberta`; resolver → `resolvida`; reabrir → `aberta`; arquivar bloqueia operações de escrita (leitura autorizada preservada); restaurar preserva identidade/Pipe/Card/Responsável/anexos/Histórico; **sem exclusão definitiva pelo usuário**.
   - **Responsável:** referencia **zero ou uma Membership ativa** da mesma Organização; atribuição/troca exigem Membership ativa; **em suspensão/remoção da Membership, o Responsável é reatribuído ou explicitamente esvaziado pelo contrato de reatribuição da Administração (E8/8.4–8.6)** — sem referência inválida silenciosa; autoria/Responsável histórico preservados.
   - **Anexos:** integram **diretamente a capacidade compartilhada de arquivos (3.7)**; herdam a autorização da Solicitação; gate **AD-28**.
   - **Autorização:** mesmo contrato de 5.1 (Organização + papel efetivo no Pipe + concessões; deny-by-default; sem revelar inacessíveis; reutiliza a matriz canônica; revalidação no servidor).
   - **Histórico (append-only):** criação; edição; atribuição/troca de Responsável; resolução; reabertura; arquivamento; restauração; vínculo/desvínculo com Card; alterações de anexos.
5. **Critérios de aceite:**
   - **Given** um membro autorizado **When** abre uma Solicitação **Then** nasce `aberta`, pertence a exatamente um Pipe/Organização, associa-se a 0..1 Card do mesmo Pipe/Org e tem Responsável (Membership ativa).
   - **Given** o ciclo de vida **When** resolver/reabrir/arquivar/restaurar **Then** os estados e a preservação de identidade/Pipe/Card/Responsável/anexos/Histórico seguem as regras; sem exclusão definitiva.
   - **Given** o Responsável **When** sua Membership é suspensa/removida **Then** o contrato de reatribuição da Administração (E8) reatribui ou esvazia explicitamente, sem Responsável inválido silencioso.
   - **And** anexos seguem 3.7 (AD-28); autorização deny-by-default reusa a matriz canônica; Histórico append-only.
6. **Rastreabilidade:** FR-28; RN-091; D5.2; NFR-3/4; INV-WORK-02; AD-9/28/30. **Consome:** contrato de Membership (E8/8.4–8.6), Card (2.9), arquivos (3.7).
7. **Dependências:** contrato de Membership, matriz canônica de autorização (1.6), 2.9, 3.7.
8. **Gates:** anexos = AD-28.
9. **Fora do escopo:** Notificações; registro no motor (5.7).
10. **Demonstração vertical:** sim.

### Story 5.3 — Fonte única de Notificações (write-side)
1. **ID/Título:** 5.3 — Fonte única de Notificações (modelo canônico)
2. **Objetivo/Valor:** uma única verdade para toda Notificação, base do INV-NOTIF-01, tenant-safe e sanitizada.
3. **Narrativa:** Como plataforma, quero um modelo canônico que separe evento/conteúdo do estado de leitura por destinatário, para que todas as superfícies sejam consistentes e seguras.
4. **Escopo:**
   - **Evento/Conteúdo canônico** (imutável, rastreável), mínimo: `notificationId`; `organizationId`; tipo e versão; Evento de origem; referência interna ao recurso; ator/iniciador; data e hora; parâmetros mínimos e **sanitizados** para renderização.
   - **Destinatário** (um registro por destinatário): `notificationId`; `recipientMembershipId`; `recipientUserId`; **`readAt` nulo ou preenchido** (o estado lido/não-lido é **derivado de `readAt`**, não um booleano); data de entrega lógica; estado de disponibilidade; chave de deduplicação.
   - **Idempotência:** unicidade lógica por, no mínimo, **Organização + Evento de origem + tipo de Notificação + destinatário**; retry ou múltiplos papéis que resolvam para a mesma pessoa **não** criam duplicidade.
   - **Segurança:** Notificação **nunca concede acesso** ao recurso de origem; conteúdo e deep-link **revalidam a autorização atual**; perda de acesso **oculta ou sanitiza** a Notificação; **contagens não incluem** itens cujo conteúdo não pode mais ser acessado; **não** armazenar payload bruto, tokens, segredos, URLs temporárias ou dados pessoais desnecessários; conteúdo renderizável **sanitizado** contra HTML/script; referências inacessíveis **não revelam** existência/título/conteúdo.
   - **Separação:** conteúdo/evento = **append-only**; estado de leitura por destinatário = **mutável e auditável**.
5. **Critérios de aceite:**
   - **Given** um evento notificável **When** gera Notificação **Then** grava o conteúdo/evento canônico uma vez (imutável) e um registro por destinatário com `readAt` (estado derivado), respeitando a idempotência lógica (Org+Evento+tipo+destinatário).
   - **Given** o mesmo evento reprocessado ou múltiplos papéis do mesmo destinatário **When** resolvidos **Then** não criam duplicidade.
   - **Given** perda de acesso ao recurso **When** a Notificação é lida ou contada **Then** é ocultada/sanitizada e não entra em contagens; nunca concede acesso nem revela conteúdo inacessível.
   - **And** não há payload bruto/tokens/segredos/URLs temporárias; conteúdo renderizável é sanitizado.
6. **Rastreabilidade:** FR-29; RN-080..085; AD-22/30; NFR-3/8/19/20/22; INV-NOTIF-01.
7. **Dependências:** 1.6.
8. **Gates:** estrutura/retenção/anonimização = Arquitetura/Governança.
9. **Fora do escopo:** superfícies (5.4); distribuição/catálogo (5.6).
10. **Demonstração vertical:** parcial — verificável via 5.4.

### Story 5.4 — Superfícies, leitura e preferências
1. **ID/Título:** 5.4 — Notificações: superfícies, leitura e preferências por tipo
2. **Objetivo/Valor:** entregar badge/popover/página coerentes (INV-NOTIF-01) e preferências pessoais por tipo.
3. **Narrativa:** Como usuário, quero ver notificações consistentes nas três superfícies e controlar preferências por tipo, para confiar na contagem e reduzir ruído.
4. **Escopo:** badge/popover/página usam **exclusivamente a fonte de 5.3** (UX-DR16).
   - **Marcar como lida:** operação **idempotente**; persiste `readAt`; **contagem calculada no servidor** (não no cliente); atualiza todas as superfícies pela mesma invalidação.
   - **Marcar todas como lidas:** usa **corte/cursor do servidor**; notificações criadas **após** o corte não são marcadas acidentalmente por operação concorrente.
   - **Consistência:** badge = contagem autorizada real; popover = subconjunto recente; página = conjunto completo autorizado; paginação/filtros **não alteram a fonte de verdade**; zero legítimo ≠ falha; erro de sincronização exibido honestamente (UX-DR6).
   - **Preferências por tipo (R6):** por **usuário + Organização + tipo**; alteram **entregas futuras**, não apagam Notificações anteriores; cada tipo declara **valor padrão** e **se pode ou não ser desativado**; um tipo só é **obrigatório** por decisão explícita de Produto; badge/popover/página respeitam a mesma preferência; preferências **não contornam** avisos obrigatórios aprovados.
   - **Integra o badge do Dashboard (FR-5).**
5. **Critérios de aceite:**
   - **Given** notificações não lidas **When** exibidas **Then** badge/popover/página derivam da mesma fonte com estado coerente; a contagem é calculada no servidor.
   - **Given** "marcar como lida"/"marcar todas como lidas" **When** acionado **Then** persiste `readAt` (idempotente); "todas" usa cursor do servidor e não marca itens criados após o corte.
   - **Given** preferências por tipo **When** configuradas **Then** afetam entregas futuras (não apagam antigas), respeitam padrão/obrigatoriedade por tipo e valem nas três superfícies, sem contornar avisos obrigatórios.
   - **And** zero legítimo aparece como vazio útil; erro de sincronização é honesto.
6. **Rastreabilidade:** FR-29 (+FR-5); D6.x (preferências R6); NFR-21/26; UX-DR6/DR16; INV-NOTIF-01.
7. **Dependências:** 5.3.
8. **Gates:** —
9. **Fora do escopo:** tempo real (5.5); distribuição (5.6).
10. **Demonstração vertical:** sim.

### Story 5.5 — Tempo real como invalidação (Socket.IO)
1. **ID/Título:** 5.5 — Entrega em tempo real como invalidação, não fonte de verdade
2. **Objetivo/Valor:** atualizar superfícies em tempo real sem divergir da fonte canônica.
3. **Narrativa:** Como usuário, quero novas notificações em tempo real, para reagir rápido sem que o tempo real vire fonte de verdade.
4. **Escopo:** Socket.IO **apenas comunica mudança** ou entrega representação **sanitizada**; a **fonte de verdade continua sendo 5.3**.
   - canal autorizado por **`userId + organizationId`**; **autenticação e autorização no handshake e na reconexão**;
   - **troca de Organização ativa encerra inscrições anteriores**; **suspensão/remoção de Membership revoga o canal**;
   - eventos possuem **identificador e sequência/cursor**; cliente **deduplica** repetidos; **reconexão busca alterações posteriores ao último cursor**;
   - **perda de mensagem não implica perda da Notificação**; mensagem em tempo real **não marca item como lido**; confirmação do cliente **não substitui persistência**;
   - **nenhuma informação de outro usuário/Organização** é transmitida; **limites, backpressure e proteção contra tempestade** de eventos; **falha do canal degrada para consulta normal da fonte canônica**.
5. **Critérios de aceite:**
   - **Given** uma nova Notificação **When** gerada **Then** o Socket.IO comunica a mudança ao canal autorizado (`userId+organizationId`), refletindo as superfícies sem virar fonte de verdade.
   - **Given** troca de Organização ativa ou suspensão/remoção de Membership **When** ocorre **Then** as inscrições anteriores são encerradas e o canal revogado.
   - **Given** reconexão após queda **When** o cliente volta **Then** busca alterações após o último cursor e deduplica; perda de mensagem não perde Notificação; tempo real não marca lido.
   - **And** falha do canal degrada para consulta da fonte canônica; nada de outro usuário/Org é transmitido; há backpressure/limites.
6. **Rastreabilidade:** FR-29; AD-21/23; NFR-3/19/20/21; INV-NOTIF-01.
7. **Dependências:** 5.3, 5.4.
8. **Gates:** canais/handshake/cursor/backpressure/reconexão = Arquitetura (AD-21).
9. **Fora do escopo:** e-mail/push externo (E6/Non-Goal).
10. **Demonstração vertical:** sim.

### Story 5.6 — Catálogo e distribuição de Notificações in-app
1. **ID/Título:** 5.6 — Catálogo e distribuição de Notificações in-app
2. **Objetivo/Valor:** definir o catálogo aprovado de Notificações, alvos e distribuição, com propriedade distribuída entre os Épicos.
3. **Narrativa:** Como plataforma, quero um catálogo de tipos de Notificação e regras de distribuição, para avisar as pessoas certas por evento, sem mecanismos paralelos.
4. **Escopo:** catálogo aprovado, **usando a mesma fonte de 5.3** (sem mecanismos paralelos).
   - **Tipos implementados/integrados por E5:** designação ou alteração de Responsável; Tarefa atrasada; movimentação de Card causada por Automação.
   - **Tipos registrados por outros Épicos** (no mesmo catálogo/fonte): **E6** — comando de IA aguardando aprovação; **E8** — convite aceito.
   - **Tipos associados a Card** (eventos de Card): resolver Responsável; Observadores; concessões aplicáveis; demais alvos definidos no catálogo.
   - **Distribuição:** resolver **somente Memberships ativas**; destinatário precisa ter **acesso atual** ao recurso; o mesmo usuário resolvido por **múltiplos papéis recebe uma única Notificação** (distribuição idempotente); origem/tipo/destinatário/referência rastreáveis; **preferências por tipo aplicadas antes da criação da entrega**; ausência de destinatário válido produz **resultado explícito**, não falha silenciosa; o ator do Evento só é excluído/incluído conforme **regra declarada pelo tipo**; nenhum tipo usa destinatários arbitrários fora da Organização.
5. **Critérios de aceite:**
   - **Given** um evento do catálogo **When** dispara Notificação **Then** usa a fonte de 5.3, resolve só Memberships ativas com acesso atual, aplica preferências antes da entrega e entrega uma única Notificação por pessoa (idempotente), mesmo com múltiplos papéis.
   - **Given** E6/E8 **When** registram seus tipos (IA aguardando aprovação; convite aceito) **Then** usam o mesmo catálogo/fonte, sem mecanismo paralelo.
   - **Given** ausência de destinatário válido **When** a distribuição é resolvida **Then** produz resultado explícito (não falha silenciosa); ninguém fora da Organização recebe.
   - **And** o estado lido/não-lido é por destinatário (5.3) e coerente nas superfícies (5.4).
6. **Rastreabilidade:** FR-30; D6.3; RN-080..085; NFR-19/20/22; INV-NOTIF-01. **Consome:** eventos de Card (2.16), papéis de Card (2.10), contrato de Membership.
7. **Dependências:** 5.3, 2.16, contrato de Membership, 5.4 (preferências).
8. **Gates:** **OQ-33 fechado na Arquitetura antes da implementação** — resolução de destinatários, deduplicação, momento da resolução, comportamento após perda de acesso, aplicação de preferências, fan-out e limites operacionais; após o gate, o recurso funciona real (não simulado).
9. **Fora do escopo:** implementação dos tipos de E6/E8 (registrados por eles); Ações de Automação (5.7).
10. **Demonstração vertical:** sim (após o gate).

### Story 5.7 — Integração com Automação (Eventos/Ações de E5)
1. **ID/Título:** 5.7 — Integração de Tarefa/Solicitação/Notificação com o motor de Automação
2. **Objetivo/Valor:** permitir que Automações reajam a Tarefas/Solicitações e gerem Tarefas/Solicitações/Notificações pelo motor de E4.
3. **Narrativa:** Como Administrador, quero Eventos e Ações de Tarefa/Solicitação/Notificação nas Automações, para automatizar o trabalho operacional sem motor paralelo.
4. **Escopo:** registra no **contrato tipado de E4 (4.9)**:
   - **Eventos de Tarefa:** Tarefa criada; Tarefa concluída; Tarefa reaberta; Tarefa arquivada; Tarefa restaurada; Responsável de Tarefa alterado; Tarefa atrasada.
   - **Eventos de Solicitação:** Solicitação criada; Solicitação resolvida; Solicitação reaberta; Solicitação arquivada; Solicitação restaurada; Responsável de Solicitação alterado.
   - **Ações:** **Criar Tarefa**; **Criar Solicitação**; **Enviar Notificação in-app** (nome canônico único — não alternar "gerar/notificar/enviar").
   - **Ação Criar Tarefa** configura/valida: Pipe alvo; Card opcional; título/conteúdo permitido; prazo opcional; Responsável opcional/exigido conforme regra canônica; **anexos não são produzidos por conteúdo arbitrário da Automação**; alvo e Membership **determinísticos**; criação **idempotente**.
   - **Ação Criar Solicitação** configura/valida: Pipe alvo; Card opcional; conteúdo permitido; Responsável conforme regra canônica; criação idempotente; **nenhuma referência fora da Organização**.
   - **Ação Enviar Notificação in-app** configura: tipo permitido; **seletor determinístico de destinatários**; referência ao recurso; conteúdo parametrizado e sanitizado. **Não permite** destinatário externo arbitrário, HTML/script, segredo, payload bruto, bypass de preferências, nem notificar quem não tem acesso ao recurso.
   - **Integração com E4:** cada handler declara ID estável/versão/schema/validador/disponibilidade/resolvedor de alvo/autorização/executor idempotente/Eventos produzidos/sanitização/dados permitidos na trilha; **consome integralmente** outbox/fila/idempotência/retries/encadeamento/prevenção de ciclos/principal Automação/Trilha de Execuções; **não cria motor, scheduler ou trilha paralela**. O Evento "Tarefa atrasada" reutiliza o mecanismo temporal idempotente definido em 5.1.
5. **Critérios de aceite:**
   - **Given** o contrato 4.9 **When** E5 registra seus Eventos e Ações **Then** usam o motor de E4 (outbox/idempotência/encadeamento/ciclos/trilha/principal Automação) sem motor/scheduler/trilha paralela, com handlers tipados e alvo determinístico.
   - **Given** as Ações "Criar Tarefa"/"Criar Solicitação" **When** executam **Then** criam pelas regras de 5.1/5.2, idempotentes, com alvo e Membership determinísticos, sem referência fora da Organização.
   - **Given** a Ação "Enviar Notificação in-app" **When** executa **Then** usa a fonte de 5.3/5.6, com seletor determinístico, conteúdo sanitizado, respeitando preferências e sem notificar quem não tem acesso.
   - **And** todos os Eventos de Tarefa/Solicitação aprovados estão disponíveis (nenhum condicional).
6. **Rastreabilidade:** FR-27/28/29; D4.1; RN-100..104; NFR-6/7. **Consome:** contrato do motor (4.9), Tarefas (5.1), Solicitações (5.2), Notificações (5.3/5.6).
7. **Dependências:** 5.1, 5.2, 5.3, 5.6, 4.9.
8. **Gates:** herda gates de E4 (OQ-26, limites do motor, AD-18); Evento "Tarefa atrasada" = gate temporal de 5.1.
9. **Fora do escopo:** núcleo do motor (E4); Ações de E-mail/IA (E6).
10. **Demonstração vertical:** sim.

---

## Resumo do Épico 5 (gravado)
- **7 Stories**; **4 FRs proprietários** (FR-27/28/29/30) + integração (5.7).
- **Sem dependência rígida futura de E8:** Membership é consumida por **contrato estável** (`Account + Membership + activeOrganizationId + Membership ativa`); E8 mantém a propriedade funcional dos fluxos administrativos e da reatribuição.
- **Anexos consomem 3.7** (capacidade compartilhada), não 3.8.
- **Tarefa e Solicitação** pertencem a **exatamente um Pipe** e podem relacionar-se com **zero ou um Card**; **ciclo completo inclui restaurar**; reatribuição segura via contrato da Administração; Histórico append-only.
- **`atrasada` é derivada**; o **Evento "Tarefa atrasada" tem ocorrência canônica idempotente** (chave `taskId`+prazo; scheduler = gate de Arquitetura).
- **Notificações usam fonte única** (evento/conteúdo imutável + estado de leitura por destinatário via `readAt`); **preferências por tipo** existem; **Socket.IO não é fonte de verdade** (invalidação/entrega sanitizada, com degradação para consulta canônica).
- **Catálogo** contempla os tipos aprovados da R6; **E4 é o único motor**; **E6 e E8 apenas registram seus tipos** de Notificação no mesmo catálogo/fonte; **nenhuma notificação externa na Fase 1**.
- **Invariantes:** INV-NOTIF-01, INV-WORK-01/02.
- **Gates reais:** OQ-33 (distribuição, fechado na Arquitetura antes de 5.6); AD-28 (anexos, 5.1/5.2); AD-21 (tempo real, 5.5); scheduler/timezone/idempotência temporal (Evento de atraso, 5.1); gates herdados de E4 (5.7).

### Ordem produtiva (paralelização segura, para o Sprint Planning)
- **5.1** e **5.2** podem avançar em paralelo (núcleo de trabalho operacional).
- **5.3** inicia o núcleo de Notificações; **5.4** e **5.6** avançam após 5.3; **5.5** após 5.3 e 5.4.
- **5.7** avança após 5.1, 5.2, 5.3, 5.6 e 4.9.

```text
5.1 ─┐
     ├──────────────→ 5.7
5.2 ─┘

5.3 ─→ 5.4 ─→ 5.5
  └──→ 5.6 ────────→ 5.7
```

## Épico 6 — E-mails, Templates e IA assistiva

**Objetivo:** comunicação **outbound real** (Composer + Templates versionados da Organização + envio assíncrono + histórico geral e por Card) e **IA assistiva mínima** (sugestão de e-mail, resumo de Card, IA como Ação), sempre com **revisão humana** e **sem efeito operacional automático**. Registra no motor de E4 o Evento `E-mail enviado`, a Ação `Enviar E-mail usando Template` e a `IA como Ação`.

**Valor entregue:** a Organização se comunica por e-mail rastreável (sem inbox) e usa IA como apoio, sem que a IA execute efeitos sozinha.

**FRs proprietários:** FR-24 (6.1/6.3/6.4/6.5) · FR-25 (6.2/6.6) · FR-26 (6.7/6.8/6.9).

**Depende de:** E1 (identidade/authz/cofre de credenciais), E2 (Card 2.9/2.16), E3 (capacidade de arquivos 3.7), E4 (contrato do motor 4.9), E5 (fonte única de Notificações 5.6). **Ordem interna:** ver grafo no resumo (não linear).

> **Gate estrutural (AD-28):** e-mail outbound e IA são **MVP obrigatório**, **fail-closed em runtime** até provedor/identidade/segurança (OQ-28) e, para IA, modelo/região/retenção (OQ-32) e LGPD/transferência internacional (OQ-43..46/OQ-44). Estruturáveis agora; ativação produtiva depende desses pré-requisitos. **Não** migram para "capacidade posterior".

**Fora do escopo do Épico:** **inbox / recebimento / sincronização** de e-mail; **campanhas / disparo em massa / e-mail marketing**; **AI Builder**; **IA autônoma / efeito operacional automático**; **ferramentas/HTTP/Webhook/MCP** à IA; motor/scheduler paralelo.

## Mapa das Stories

| ID | Story | FR/Decisão | Escopo (uma linha) | Dependências |
|---|---|---|---|---|
| 6.1 | Modelo canônico de e-mail e Composer | FR-24 · D6.5/D3.6 | e-mail pertence a 1 Org, 0..1 Card; Composer outbound-only; destinatários validados; conteúdo sanitizado/imutável pós-envio | 1.6, 2.9 |
| 6.2 | Administração e versionamento de Templates | FR-25 · D6.5 | Admin da Org administra; `templateId` estável + `templateVersionId` imutável; catálogo tipado de variáveis | 1.6 |
| 6.3 | Aplicação manual de Template | FR-24/25 · RN-111 | resolve variáveis server-side; copia conteúdo (referência não-viva); snapshot no envio | 6.1, 6.2 |
| 6.4 | Envio assíncrono, identidade e estados honestos | FR-24 · D6.5 | outbox/fila/at-least-once idempotente; remetente verificado; "enviado" = aceito pelo provedor; histórico geral + por Card | 6.1, gate provedor |
| 6.5 | Anexos de e-mail | FR-24 · D6.5 | anexa via 3.7 (novo/existente); revalida acesso no envio; snapshot imutável; limites | 6.1, 3.7, 6.4 |
| 6.6 | Integração E-mail ↔ Automação | FR-25 · D4.1 | Ação "Enviar E-mail usando Template" (`templateVersionId` explícito) + Evento "E-mail enviado" no 4.9 | 6.2, 6.4, 4.9 |
| 6.7 | Fundação segura de IA | FR-26 · D6.6/AD-26 | porta de IA; isolamento/minimização/anti-injection; sem ferramentas/autoridade; provedor/LGPD; custo/fallback | 1.6 |
| 6.8 | Sugestão de e-mail e resumo de Card | FR-26 · D6.6 | acionada só por ação explícita; saída rotulada/revisável; aceite não produz efeito | 6.7, 6.1, 2.9 |
| 6.9 | IA como Ação e comando proposto | FR-26 · D4.4 | allowlist de comandos de E4; fluxo assíncrono; aprovação humana ≠ execução | 6.7, 4.9, 5.6 |

---

## Detalhe completo

### Story 6.1 — Modelo canônico de e-mail e Composer
1. **ID/Título:** 6.1 — Modelo canônico de e-mail e Composer
2. **Objetivo/Valor:** compor comunicações outbound no contexto certo, sobre um modelo canônico tenant-safe.
3. **Narrativa:** Como usuário com capacidade de compor e-mail, quero redigir um e-mail associável a um Card, para comunicar-me com o cliente a partir do processo, sem inbox.
4. **Escopo:**
   - **Modelo canônico:** cada e-mail pertence a **exatamente uma Organização**; **identidade estável**; associável a **zero ou um Card**; quando associado, o Card pertence à **mesma Organização**; **vários e-mails podem associar-se ao mesmo Card**; a associação **não concede acesso** ao Card; acesso ao Card **não** concede acesso automático ao e-mail; **visualizar o e-mail exige acesso efetivo ao recurso + permissão de histórico de e-mail**.
   - **Composer/rascunho:** operações iniciar composição / editar destinatários, assunto e corpo / aplicar Template / anexar arquivo (quando 6.5 disponível) / descartar / solicitar envio — **sem módulo de caixa de rascunhos nem inbox**. Se a composição for persistida como rascunho técnico: privado aos autorizados; não aparece no histórico de enviados; não dispara Evento; não é interpretável como enviado; descartar não exclui enviados; deixa de ser editável ao entrar no fluxo de envio. **Não** criar gestão completa de rascunhos.
   - **Destinatários:** ao menos um destinatário principal válido; **normalização/validação server-side**; deduplicação entre campos suportados; **quantidade máxima definida antes da implementação**; nenhum endereço aceito só por validação client-side; **sem disparo em massa/campanha** na Fase 1. Não introduzir CC/BCC se não ancorados no PRD/UX; se previstos, aplicar mesma validação/dedup/limite.
   - **Conteúdo:** assunto e corpo **sanitizados**; **sem HTML/script/conteúdo ativo arbitrário**; conteúdo rico (se suportado) em formato seguro com sanitização server-side; links/variáveis não inserem scripts/esquemas inseguros; **conteúdo enviado é imutável após o envio**.
   - **Autorização por capacidades efetivas:** compor e-mail; enviar e-mail; consultar histórico; acessar o Card opcional. **Deny-by-default**, revalidada no servidor; escopo user+Org (NFR-3).
5. **Critérios de aceite:**
   - **Given** um usuário com capacidade de compor **When** redige um e-mail **Then** cria um e-mail canônico da Organização (identidade estável), associável a 0..1 Card da mesma Org, sem inbox e sem conceder/revelar acesso indevido.
   - **Given** destinatários **When** informados **Then** são normalizados/validados/deduplicados no servidor, respeitam o limite máximo e não permitem disparo em massa.
   - **Given** assunto/corpo **When** compostos **Then** são sanitizados (sem HTML/script arbitrário) e tornam-se imutáveis após o envio.
   - **And** cada capacidade (compor/enviar/consultar/acessar Card) é deny-by-default e revalidada no servidor.
6. **Rastreabilidade:** FR-24; D6.5/D3.6; OQ-29; RN-110; NFR-3/4; UX-DR14; AD-11/25.
7. **Dependências:** 1.6, 2.9.
8. **Gates:** envio real = 6.4 (AD-28/AD-25/OQ-28); limite de destinatários definido pré-implementação.
9. **Fora do escopo:** envio (6.4); Templates (6.2/6.3); anexos (6.5).
10. **Demonstração vertical:** parcial — compor/associar; envio em 6.4.

### Story 6.2 — Administração e versionamento de Templates
1. **ID/Título:** 6.2 — Administração e versionamento de Templates de E-mail
2. **Objetivo/Valor:** reutilizar conteúdo padronizado, versionado e com variáveis seguras.
3. **Narrativa:** Como Admin da Organização, quero administrar Templates versionados com variáveis tipadas, para reaproveitar comunicações com consistência e integridade.
4. **Escopo:**
   - **Propriedade/ciclo:** **Admin da Organização cria/edita/arquiva/restaura** Templates; demais usuários autorizados apenas **consultam e aplicam**; **Admin do Pipe não administra** Templates globais da Org (salvo permissão canônica futura); **sem exclusão definitiva** pelo usuário. Escopo Org (NFR-3).
   - **Versionamento:** cada edição cria **nova versão imutável**; manter `templateId` estável; `templateVersionId` imutável; autor; data/hora; assunto; corpo; definição de variáveis; estado arquivado/restaurado. **E-mails enviados e Execuções já iniciadas nunca são alterados** por edições futuras.
   - **Variáveis:** **catálogo canônico e tipado** de variáveis permitidas — usam apenas fontes explicitamente permitidas; **não** executam scripts/expressões/consultas arbitrárias; não acessam recursos fora da Organização; respeitam a autorização do contexto; são escapadas conforme o local de uso; têm tipo/origem conhecidos; validadas no servidor. Comportamento explícito: **variável obrigatória ausente bloqueia aplicação/envio**; opcional ausente só resulta em vazio quando configurado; **nenhuma variável não resolvida é enviada silenciosamente**; interface permite **pré-visualização com indicação de valores ausentes**.
5. **Critérios de aceite:**
   - **Given** o Admin da Org **When** cria/edita/arquiva/restaura um Template **Then** o ciclo é criar/editar/arquivar/restaurar (sem exclusão definitiva); cada edição gera nova versão imutável (`templateVersionId`) com `templateId` estável.
   - **Given** uma edição futura **When** aplicada **Then** e-mails enviados e Execuções iniciadas não mudam.
   - **Given** uma variável obrigatória ausente **When** aplicar/enviar **Then** bloqueia; nenhuma variável não resolvida é enviada silenciosamente; a pré-visualização indica valores ausentes.
   - **And** variáveis usam só fontes permitidas/tenant-safe, tipadas, escapadas e validadas no servidor.
6. **Rastreabilidade:** FR-25; RN-111; D6.5; NFR-3; AD-25. **Contrato:** referência Ação↔Template versionada (com 4.9/6.6).
7. **Dependências:** 1.6.
8. **Gates:** semântica de versão Ação↔Template fechada na Arquitetura (OQ-26).
9. **Fora do escopo:** aplicação no composer (6.3); Ação de Automação (6.6).
10. **Demonstração vertical:** sim.

### Story 6.3 — Aplicação manual de Template
1. **ID/Título:** 6.3 — Aplicação manual de Template no Composer
2. **Objetivo/Valor:** acelerar a composição reutilizando Templates com controle humano e snapshot.
3. **Narrativa:** Como usuário autorizado, quero aplicar um Template ao compor, para partir de um conteúdo padronizado editável antes de enviar.
4. **Escopo:** ao aplicar manualmente: **selecionar apenas versão disponível e não arquivada**; **resolver variáveis no servidor**; usar **somente dados autorizados**; **copiar assunto e corpo resolvidos** para a composição; permitir **edição humana** antes do envio; **preservar `templateId` e `templateVersionId`** usados; após a aplicação, o conteúdo **deixa de ser referência viva** ao Template. Editar/arquivar o Template depois **não altera** rascunho já preenchido, mensagem enviada nem snapshot histórico. No envio, persistir: Template e versão de origem; **valores resolvidos de forma minimizada**; assunto e corpo finais efetivamente enviados; indicação de **edição manual após aplicar** (quando aplicável). **Não** armazenar variáveis sensíveis desnecessárias só para reconstruir o e-mail.
5. **Critérios de aceite:**
   - **Given** um rascunho e um Template não arquivado **When** o usuário aplica **Then** as variáveis são resolvidas no servidor (só dados autorizados), o conteúdo é copiado (referência não-viva) e permanece editável, preservando `templateId`/`templateVersionId`.
   - **Given** editar/arquivar o Template após aplicar **When** ocorre **Then** não altera rascunho/enviado/snapshot.
   - **Given** o envio **When** ocorre **Then** persiste Template+versão, valores resolvidos minimizados, assunto/corpo finais e indicação de edição manual, sem guardar variáveis sensíveis desnecessárias.
6. **Rastreabilidade:** FR-24/25; RN-111; D6.5; NFR-8; UX-DR14.
7. **Dependências:** 6.1, 6.2.
8. **Gates:** —
9. **Fora do escopo:** envio (6.4); Ação de Automação (6.6).
10. **Demonstração vertical:** sim (com 6.4).

### Story 6.4 — Envio assíncrono, identidade e estados honestos
1. **ID/Título:** 6.4 — Envio outbound assíncrono, identidade verificada e histórico
2. **Objetivo/Valor:** enviar e-mails reais com segurança, semântica honesta e rastreabilidade.
3. **Narrativa:** Como usuário autorizado, quero enviar e-mails e consultar o histórico, para comunicar-me de forma real e auditável, sem afirmações falsas de entrega.
4. **Escopo:**
   - **Fluxo assíncrono confiável:** (1) validar a solicitação; (2) persistir a intenção de envio; (3) registrar na **outbox**; (4) processar em **fila**; (5) chamar a **porta do provedor**; (6) persistir o resultado; (7) atualizar o histórico; (8) emitir o Evento canônico só quando aplicável. **`at-least-once` com idempotência** (não "exatamente uma vez").
   - **Identidade remetente verificada:** usuário **não escolhe remetente arbitrário**; **credenciais só no cofre**; **nenhum segredo** ao cliente/histórico funcional/logs; domínio/endereço **validado**; **SPF/DKIM/DMARC** e requisitos do provedor no **gate OQ-28**; troca/revogação da identidade **bloqueia novos envios fail-closed**.
   - **Estados honestos:** em composição / enfileirado / processando / **aceito pelo provedor** / falhou. **Na Fase 1, "enviado" = aceito pelo provedor para processamento** (explícito na interface). Sem inbox/webhooks/sincronização, **não afirmar** entrega na caixa, leitura, abertura, resposta ou ausência de bounce.
   - **Idempotência/retries:** chave idempotente por solicitação lógica; duplo clique não cria dois envios; retry técnico não duplica; armazenar identificador do provedor quando disponível; retries com limite/backoff; falha definitiva explícita; novo envio após falha definitiva exige **ação explícita e nova intenção lógica**; concorrência não envia duas vezes.
   - **Histórico:** **geral** (e-mails outbound autorizados) + **contextual no Card** (vinculados); **e-mails sem Card ficam no histórico geral** (nenhuma mensagem sem local de consulta). Registrar sanitizado: remetente; destinatários; assunto; estado; ator; origem (manual/Automação); Card opcional; Template e versão; datas/horas; identificador do provedor; tentativas; erro sanitizado; metadados dos anexos. **Aceito pelo provedor ⇒ imutável.** **Não** registrar corpo completo, endereços completos ou anexos em logs técnicos; conteúdo protegido em trânsito/repouso/autorização.
   - **Limites/abuso (antes da ativação produtiva):** limite por usuário/Organização/intervalo; limite de destinatários; proteção contra abuso; bloqueio temporário; alertas de falha/consumo. **Não** virar ferramenta de e-mail marketing em massa.
5. **Critérios de aceite:**
   - **Given** uma solicitação de envio **When** processada **Then** segue o fluxo outbox→fila→porta do provedor (at-least-once, idempotente), com remetente verificado (credenciais no cofre) e sem segredo no cliente/histórico/logs.
   - **Given** o resultado do provedor **When** aceito **Then** o estado é "aceito pelo provedor" (semântica de "enviado" na Fase 1); o sistema não afirma entrega/leitura/abertura/resposta.
   - **Given** duplo clique/retry/concorrência **When** ocorre **Then** não há envio duplicado (chave idempotente); falha definitiva é explícita e reenviar exige nova intenção.
   - **Given** o histórico **When** consultado **Then** e-mails com Card aparecem no contexto e sem Card no histórico geral, sanitizados e imutáveis após aceite; nada em logs técnicos com corpo/endereços/anexos.
   - **And** limites por usuário/Org/intervalo/destinatários e proteção contra abuso são pré-requisito de ativação.
6. **Rastreabilidade:** FR-24; D6.5; RN-110/114; NFR-1/9/10; AD-13/24/25/28; OQ-28.
7. **Dependências:** 6.1, gate de provedor/identidade/segurança. *(Não depende de 6.3 — e-mail manual pode ser enviado sem Template.)*
8. **Gates:** **AD-28/AD-25/OQ-28** (provedor/identidade/SPF-DKIM-DMARC/segurança); outbox/fila/idempotência = Arquitetura; limites de envio = Produto/Segurança.
9. **Fora do escopo:** anexos (6.5); Ação de Automação (6.6); recebimento (Non-Goal).
10. **Demonstração vertical:** sim (após o gate).

### Story 6.5 — Anexos de e-mail
1. **ID/Título:** 6.5 — Anexos de e-mail
2. **Objetivo/Valor:** anexar arquivos com segurança, reusando a capacidade compartilhada.
3. **Narrativa:** Como usuário autorizado, quero anexar arquivos ao e-mail, para enviar documentos com segurança e sem link público.
4. **Escopo:** **arquivo novo** associado à composição; **arquivo existente** só selecionável com **acesso atual**; **anexar não concede acesso** ao recurso original; **acesso revalidado no momento do envio**; arquivo **removido/bloqueado/inacessível impede o envio**; arquivo **em quarentena/não verificado impede o envio**; **rejeitado nunca é anexado**; após o envio, o e-mail mantém **snapshot imutável** do anexo; remover o arquivo original **não altera** silenciosamente o e-mail enviado; **anexos não substituíveis** após o envio. **Segurança herdada de 3.7:** buckets privados; MIME real; validação de conteúdo; checksum; quarentena; verificação de malware; remoção lógica; retenção; **sem URL pública**. **Definir antes da implementação:** tamanho máx por arquivo; quantidade máx de anexos; tamanho total do e-mail; margem para codificação/overhead do provedor; tipos permitidos; timeout de processamento. **Sem** executáveis/scripts/formatos inseguros. **Automação:** **não** adicionar anexos automáticos à Ação 6.6 (salvo âncora explícita no PRD/UX); **IA/Automação não produzem nem anexam arquivos arbitrários**.
5. **Critérios de aceite:**
   - **Given** um e-mail em composição **When** o usuário anexa arquivo novo/existente **Then** usa 3.7, só arquivos com acesso atual, respeitando limites/tipos; anexar não concede acesso ao recurso original.
   - **Given** o envio **When** ocorre **Then** o acesso ao anexo é revalidado; arquivo removido/bloqueado/quarentena/rejeitado impede o envio; após aceite, o anexo vira snapshot imutável (sem substituição, sem URL pública).
   - **And** limites (tamanho/quantidade/total/overhead/timeout) são definidos antes; IA/Automação não anexam arquivos arbitrários.
6. **Rastreabilidade:** FR-24; D6.5; NFR-8/9; AD-27/28. **Consome:** capacidade de arquivos (3.7).
7. **Dependências:** 6.1, 3.7, integração com 6.4.
8. **Gates:** AD-28 + **limites de anexo de e-mail** (numéricos, pré-Story).
9. **Fora do escopo:** recebimento de anexos (Non-Goal).
10. **Demonstração vertical:** sim (integração final de anexos ocorre em 6.4).

### Story 6.6 — Integração E-mail ↔ Automação
1. **ID/Título:** 6.6 — Ação "Enviar E-mail usando Template" e Evento "E-mail enviado"
2. **Objetivo/Valor:** permitir que Automações enviem e-mails por Template versionado, pelo motor de E4.
3. **Narrativa:** Como Administrador, quero uma Ação de Automação de e-mail por Template e o Evento "E-mail enviado", para automatizar comunicações sem motor paralelo e sem referência mutável.
4. **Escopo:**
   - **Handler tipado (no 4.9) declara:** ID e versão estáveis; schema de configuração; validador; gate de disponibilidade; **identidade remetente verificada**; `templateId`; **`templateVersionId`**; fontes permitidas de destinatário; mapeamento de variáveis; resolvedor determinístico; executor idempotente; Eventos produzidos; política de sanitização; dados permitidos na Trilha.
   - **Referência ao Template (versionada):** a Ação referencia **explicitamente um `templateVersionId`**; editar o Template cria nova versão e **não altera** Automações existentes; mudar a versão usada exige **edição explícita da Automação**; Template arquivado/indisponível **bloqueia nova execução fail-closed**; Execução já iniciada usa o **snapshot capturado**; **nenhuma referência órfã**. **Atualizar OQ-26/Arquitetura** para essa decisão versionada (não "latest mutable").
   - **Destinatários (fontes determinísticas aprovadas):** endereço fixo configurado e validado; Campo de e-mail do Card/Registro de contexto; outra fonte canônica suportada. **Não permitir** expressão arbitrária/código/consulta aberta/scraping/endereço de prompt de IA/destinatário ilimitado/derivado de recurso inacessível. Normalizar/validar/limitar/deduplicar antes do envio.
   - **Execução:** antes de enviar, revalidar Organização; Pipe e Card (quando aplicável); identidade remetente; Template e versão; destinatários; valores das variáveis; autorização do **principal Automação**; limites operacionais; regras de comunicação/preferências; gate do provedor. **A Ação reutiliza integralmente 6.4 e não chama o provedor diretamente.**
   - **Evento "E-mail enviado":** emitido só quando o provedor aceitou + resultado persistido + ocorrência ainda não emitida; usa **envelope canônico de E4**; preserva `correlationId`/`causationId`/`executionChainId`; **sem corpo completo/segredo/anexo**; **não** em falha; **idempotente**.
5. **Critérios de aceite:**
   - **Given** o contrato 4.9 **When** E6 registra a Ação **Then** o handler tipado usa `templateVersionId` explícito e fontes de destinatário determinísticas, reutilizando 6.4 (não chama o provedor direto) sob o principal Automação.
   - **Given** edição/arquivamento do Template **When** ocorre **Then** não altera Automações existentes; mudar versão exige edição explícita; arquivado bloqueia nova execução (fail-closed) e Execução iniciada usa o snapshot; sem referência órfã.
   - **Given** um envio por Automação aceito **When** persistido **Then** emite "E-mail enviado" (envelope canônico, idempotente, sem corpo/segredo/anexo), nunca em falha.
   - **And** destinatários arbitrários/de prompt de IA/inacessíveis são rejeitados.
6. **Rastreabilidade:** FR-25; RN-111; D4.1/D6.5; NFR-10; AD-25/28; OQ-26/28. **Consome:** contrato do motor (4.9), Templates (6.2), envio (6.4).
7. **Dependências:** 6.2, 6.4, 4.9.
8. **Gates:** AD-28/OQ-28; **OQ-26 versionado** (Ação↔Template); herda gates de E4.
9. **Fora do escopo:** IA como Ação (6.9); anexos automáticos (fora, salvo âncora).
10. **Demonstração vertical:** sim (após gates).

### Story 6.7 — Fundação segura de IA
1. **ID/Título:** 6.7 — Fundação segura de IA (porta, isolamento e guardrails)
2. **Objetivo/Valor:** base segura, isolada e minimizada da IA, sem ferramentas nem autoridade.
3. **Narrativa:** Como plataforma, quero uma porta de IA com guardrails obrigatórios, para que a IA seja assistiva, tenant-safe e sem poder operacional.
4. **Escopo:**
   - **Isolamento:** cada requisição pertence a uma Organização; **nenhuma entrada/cache/memória/saída cruza Organizações**; o **modelo nunca decide autorização**; o **backend constrói o contexto após autorização**; o cliente **não** fornece IDs confiáveis sem validação server-side.
   - **Minimização:** enviar **apenas os dados necessários** ao caso de uso; **não** enviar automaticamente todos os Campos/Histórico completo/anexos/e-mails anteriores/dados de outros Cards/credenciais/tokens/segredos/dados pessoais desnecessários; cada caso de uso declara uma **allowlist de contexto**.
   - **Prompt injection / prompt leak:** conteúdo de Card/e-mail/Template/arquivo/usuário é **dado não confiável**; instruções nesses conteúdos **não sobrescrevem** regras do sistema; prompts de sistema/configs internas são **versionados e protegidos**; a IA **não revela** prompt de sistema/segredo/chave/regra/config privada; **delimitar instruções vs. dados**; **validar saídas por schema** e **rejeitar off-schema**; **nenhuma ferramenta/DB/HTTP/código/execução operacional** ao modelo na Fase 1.
   - **Provedor e LGPD (fechar antes da ativação):** provedor; modelo; região de processamento; retenção; uso ou não para treinamento; DPA; transferência internacional; suboperadores; descarte; anonimização; base legal e finalidade; processo de direitos do titular. Usar **configuração contratual que impeça treinamento** com dados do cliente quando disponível.
   - **Logs/telemetria (metadados necessários):** Organização; usuário; caso de uso; modelo; versão do prompt; tokens; custo; latência; status; flags de segurança; decisão do usuário; identificador técnico. **Não** registrar integralmente prompts/respostas/segredos/contexto do Card em Pino/Sentry. Saída **aceita** pode virar conteúdo do recurso de destino; **descartadas não são preservadas indefinidamente**.
   - **Custos/disponibilidade:** rate limit; limite por usuário/Organização; orçamento; alerta de consumo; **circuit breaker**; timeout; retries limitados; **fallback manual**. **Falha da IA nunca bloqueia o fluxo principal.**
5. **Critérios de aceite:**
   - **Given** uma requisição de IA **When** processada **Then** pertence a uma Organização (nada cruza), o modelo não decide autorização, o backend monta o contexto após autorização e envia só o allowlisted minimizado.
   - **Given** conteúdo com instruções embutidas (injection) **When** processado **Then** não sobrescreve as regras do sistema; a IA não revela prompt/segredo; saídas fora do schema são rejeitadas; o modelo não recebe ferramentas/HTTP/DB/código.
   - **Given** logs/telemetria **When** gravados **Then** contêm só metadados (sem prompt/resposta/contexto completos/segredos).
   - **And** há rate limit/orçamento/circuit breaker/timeout e fallback manual; falha da IA não bloqueia; o gate provedor/LGPD (OQ-32/OQ-44/OQ-43..46) é pré-requisito de ativação.
6. **Rastreabilidade:** FR-26; D6.6; NFR-1/8/11/13/14/15/16/18; AD-24/26/28; OQ-32/43..46.
7. **Dependências:** 1.6.
8. **Gates:** **AD-28 + OQ-32 + OQ-44 (+OQ-43/45/46)**; provedor/modelo/região/retenção/DPA = Produto/Jurídico/Arquitetura.
9. **Fora do escopo:** casos de uso (6.8); IA como Ação (6.9); AI Builder (Non-Goal).
10. **Demonstração vertical:** parcial — verificável via 6.8 (após gate).

### Story 6.8 — Sugestão de e-mail e resumo de Card
1. **ID/Título:** 6.8 — IA assistiva: sugestão de e-mail e resumo de Card
2. **Objetivo/Valor:** apoiar o usuário com saídas revisáveis, sem executar nada.
3. **Narrativa:** Como usuário autorizado, quero que a IA sugira um e-mail ou resuma um Card quando eu pedir, para trabalhar mais rápido mantendo controle.
4. **Escopo:**
   - **Solicitação explícita:** a IA só é acionada por **ação explícita** do usuário; **não** gera automaticamente ao abrir o Composer ou o Card.
   - **Contexto:** usar **snapshot autorizado** no início da geração; apenas Campos/informações permitidos; **sem anexos/Histórico completo por padrão**; **registrar categorias de contexto usadas**; se o Card mudar durante a geração, **indicar possível desatualização**; nunca usar dados inacessíveis ao usuário.
   - **Qualidade/segurança:** saída **rotulada como IA**; **separar fatos do Card de inferências**; **sinalizar ausência de informação**; **não inventar preço/prazo/garantia/compromisso/condição comercial**; **sem afirmações jurídicas/contratuais sem base**; linguagem **editável**; **sanitizada**; respeita idioma/contexto selecionados.
   - **Sugestão de e-mail:** aceitar **apenas copia o texto** ao rascunho; **não** define destinatário automaticamente sem regra explícita; **não envia**; **não anexa**; **não grava** alteração em Card; **não executa Ação**. O usuário pode editar/descartar/regenerar.
   - **Resumo de Card:** **não altera** o Card; **não vira** nota/Histórico automaticamente; **temporário** até ação explícita; respeita a autorização do Card; descartável sem efeito.
   - **Idempotência/custos:** clique repetido **não** cria requisições concorrentes ilimitadas; regenerar é nova solicitação explícita; rate limit/monitoramento de custo; **timeout mantém o fluxo manual disponível**.
5. **Critérios de aceite:**
   - **Given** o Composer/Card **When** o usuário pede explicitamente **Then** a IA gera (não automático), usando snapshot autorizado/allowlisted, com saída rotulada, separando fatos de inferências e sinalizando lacunas.
   - **Given** aceitar uma sugestão de e-mail **When** acionado **Then** apenas copia o texto ao rascunho (não envia/anexa/define destinatário/grava Card/executa Ação); o resumo de Card não altera o Card.
   - **Given** falha/timeout da IA **When** ocorre **Then** o fluxo manual permanece; clique repetido não gera concorrência ilimitada.
   - **And** a saída não inventa preço/prazo/garantia/compromisso e não faz afirmação jurídica sem base.
6. **Rastreabilidade:** FR-26; D6.6; NFR-11/12/13/14/17; UX-DR15. **Consome:** fundação de IA (6.7), composer (6.1), Card (2.9).
7. **Dependências:** 6.7, 6.1, 2.9.
8. **Gates:** herda AD-28/OQ-32/OQ-44 de 6.7.
9. **Fora do escopo:** IA como Ação (6.9).
10. **Demonstração vertical:** sim (após gate).

### Story 6.9 — IA como Ação e comando proposto
1. **ID/Título:** 6.9 — IA como Ação e comando proposto (aprovação humana)
2. **Objetivo/Valor:** permitir IA em Automações sem jamais executar efeito sozinha.
3. **Narrativa:** Como Administrador, quero IA como Ação com comando proposto e aprovação humana, para automatizar apoio sem abrir mão do guardrail.
4. **Escopo:**
   - **Allowlist de comandos:** o resultado operacional pertence a um **catálogo fechado de comandos de E4**; **não permitir** SQL/código/script/HTTP/alteração livre de banco/handler inventado/parâmetros off-schema/ferramenta arbitrária; a IA produz **saída estruturada e validada**; qualquer saída fora do catálogo/schema é **rejeitada sem efeito**.
   - **Fluxo assíncrono (sem worker aguardando):** (1) a Execução inicia a Ação de IA; (2) a IA gera saída estruturada; (3) o backend valida e persiste a **proposta**; (4) a Execução entra em **espera controlada**; (5) a fonte de Notificações cria "comando de IA aguardando aprovação"; (6) usuário autorizado abre a revisão; (7) aprova ou rejeita; (8) uma **nova operação** revalida e executa; (9) o resultado é ligado à Execução original.
   - **Estados:** gerando; aguardando aprovação; aprovado, aguardando execução; rejeitado; expirado; inválido por mudança de contexto; executado; falha na execução. **Aprovação e execução são estados diferentes.**
   - **Tela de aprovação (legível):** Automação; Evento de origem; recurso alvo; ação proposta; valores atuais; alteração proposta; justificativa/resumo; data de geração; prazo de expiração; aviso de conteúdo gerado por IA. **Não revelar dados inacessíveis.**
   - **Aprovação:** exclusivamente **humana**; **não** por outra Automação; exige usuário autenticado com **permissão atual**; **single-use e idempotente**; registra aprovador/data/decisão/contexto; **não amplia poderes**; **não reutiliza autorização antiga**; controle de concorrência. Antes da execução, revalidar Organização; usuário aprovador; principal Automação; recurso e versão atual; comando; parâmetros; regras de negócio; autorização; gate técnico. Se o contexto mudou: **invalidar a proposta**, não executar, exigir nova geração.
   - **Falhas/retries:** falha da IA **não** produz proposta; resposta inválida **não** produz proposta; timeout **não** produz efeito; retry usa a **mesma chave idempotente**; **não** criar múltiplas propostas para a mesma Ação lógica; falha da execução após aprovação **explícita**; **"aprovado" ≠ "executado"**.
   - **Notificações:** usa a **fonte única de E5 (5.6)**; respeita preferências/regras do tipo; deep-link autorizado; **sem payload sensível**; **abrir não executa o comando**; **não serve como autorização**.
5. **Critérios de aceite:**
   - **Given** IA como Ação **When** gera saída **Then** só produz comando de um catálogo fechado de E4 (estruturado/validado); saída fora do schema/catálogo é rejeitada sem efeito; nenhum SQL/código/HTTP/ferramenta arbitrária.
   - **Given** um comando proposto **When** criado **Then** a Execução entra em espera controlada (sem worker aberto), gera Notificação via 5.6 e distingue "aprovado" de "executado".
   - **Given** a aprovação **When** feita por usuário humano com permissão atual **Then** é single-use/idempotente, não amplia poderes, e a execução revalida contexto/alvo/versão/regras; contexto mudado invalida a proposta.
   - **Given** falha/timeout da IA **When** ocorre **Then** não há proposta nem efeito; retry reusa a chave idempotente (sem propostas múltiplas); abrir a Notificação não executa nem autoriza.
6. **Rastreabilidade:** FR-26; D4.4/D6.6; NFR-13/14/17; AD-18/20/26/28. **Consome:** contrato do motor (4.9), fundação de IA (6.7), catálogo de Notificações (5.6).
7. **Dependências:** 6.7, 4.9, 5.6.
8. **Gates:** AD-28/OQ-32/OQ-44 (IA) + AD-20/NFR-17 (guardrail); herda gates de E4.
9. **Fora do escopo:** casos assistivos sem efeito (6.8); AI Builder (Non-Goal).
10. **Demonstração vertical:** sim (após gates).

---

## Resumo do Épico 6 (gravado)
- **9 Stories**; **3 FRs proprietários** (FR-24/25/26).
- **E-mail:** **outbound-only** (sem inbox/recebimento/sincronização); Composer **sem módulo completo de rascunhos**; **E-mail↔Card 0..1**; **histórico geral + contextual por Card** (e-mail sem Card fica no geral); estado **"enviado" = aceito pelo provedor**; **identidade remetente verificada**; **envio assíncrono, idempotente, via outbox/fila**.
- **Templates:** administrados pelo **Admin da Organização**; **versionados** (`templateId` estável + `templateVersionId` imutável); **aplicação manual cria snapshot**; **Automação referencia versão explícita** (não "latest mutable").
- **Anexos:** usam **3.7**; revalidação de acesso no envio; snapshot imutável; limites numéricos pré-Story.
- **IA:** contexto **allowlisted e tenant-safe**; **modelo sem ferramentas nem autoridade**; **logs sem prompt/contexto completos**; **custos monitorados** por Organização/usuário/caso de uso; **sugestão/resumo não produzem efeitos**; **IA como Ação só produz comando de allowlist**; **aprovação humana separada da execução**; **Notificação de aprovação usa E5 (5.6)**.
- **E4 é o único motor.** **Gates** de provedor (OQ-28), segurança, IA (OQ-32) e LGPD (OQ-43..46/OQ-44) permanecem obrigatórios (AD-28).

### Ordem produtiva (paralelização segura)
```text
E-MAIL
6.1 ─────────────→ 6.4 ─────────→ 6.6
  ├──→ 6.3 ──────┘
  └──→ 6.5 ──────┘
6.2 ─→ 6.3
  └──────────────────────────────→ 6.6

IA
6.7 ─→ 6.8
  └──→ 6.9
```
- 6.1 e 6.2 em paralelo; **6.4 não espera 6.3** (e-mail sem Template é possível); 6.5 avança após 6.1 e 3.7 (integração final em 6.4); bloco de IA em paralelo ao de e-mail; **6.9 depende também de 5.6**.

## Épico 7 — Visibilidade: Dashboard, Busca Global e Relatórios

**Objetivo:** os **read-models derivados** (AD-14) sobre os dados já produzidos — conteúdo funcional do Dashboard (indicadores reais + badge + priorização), Busca Global restrita à Organização e Relatórios agregados com filtros autorizados. Implementa FR-4 **sobre a rota e a casca do Épico 1 (1.7)** — não reconstrói a casca.

**Valor entregue:** a Organização enxerga sua operação com números reais, coerentes e autorizados, sem métricas fictícias e sem vazar recursos inacessíveis.

**FRs proprietários:** FR-4 (7.2) · FR-5 (7.3, superfície) · FR-6 (7.4) · FR-31 (7.1/7.5).

**Depende de (por contrato, não por implementação futura):** E1 (casca 1.7, authz 1.6); **contrato estável de Membership** (`Account + Membership + activeOrganizationId + Membership ativa`, nome/avatar autorizados, papel efetivo quando permitido) — **E7 consome o contrato de Membership; não depende da implementação da interface administrativa de E8**; e os **contratos/fontes** dos módulos produtores (E2 Pipes/Cards/Fases, E3 Databases, E5 Notificações/Tarefas/Solicitações). **Natureza:** somente leitura/derivação — **não produz dado operacional**.

> **Princípio AD-14:** dados operacionais são a **única fonte de verdade**; indicadores/Busca/Relatórios são **read-models/cache derivados, descartáveis e reconstruíveis** — nunca segunda verdade. **INV-REPORT-01** (nunca revelar recurso inacessível), **INV-REPORT-02** (agregações no escopo autorizado, sem dupla contagem), **INV-NOTIF-01** (badge da fonte única), **NFR-27** (zero legítimo ≠ falha).

**Fora do escopo do Épico:** produção de dados operacionais (E2..E6/E8); casca/rota do Dashboard (E1/1.7); BI avançado/exportação/fórmulas configuráveis/relatórios personalizados (Non-Goals).

## Mapa das Stories

| ID | Story | FR/Decisão | Escopo (uma linha) | Dependências |
|---|---|---|---|---|
| 7.1 | Base de read-models derivados | FR-31 · AD-14 | contrato completo de leitura derivada; fonte única; atualização idempotente; autorização no momento da consulta + invalidação | 1.6, contratos de Eventos/fontes dos produtores |
| 7.2 | Conteúdo funcional do Dashboard | FR-4 · D6.4 | catálogo aprovado; priorização determinística; arquivados explícitos; navegação/drill coerente; estados honestos | 7.1, 1.7, contratos dos dados do catálogo |
| 7.3 | Badge de não lidas (integração) | FR-5 · INV-NOTIF-01 | integração visual do badge na casca; consome E5 (5.3/5.4); sem reimplementar Notificações | 1.7, 5.3, 5.4 |
| 7.4 | Busca Global restrita à Organização | FR-6 · RN-140/141 | Pipes/Databases/Cards/Memberships visíveis/Notificações pessoais; sem Registros; índice tenant-safe; deep-links revalidados | 7.1, contratos Pipe/Database/Card/Membership/Notificações pessoais |
| 7.5 | Relatórios e indicadores agregados | FR-31 · D6.4 | catálogo aprovado + filtros Pipe/Fase/Responsável/Período/arquivados; prevenção de dupla contagem; drill-down coerente | 7.1, contratos dos produtores do catálogo |

---

## Detalhe completo

### Story 7.1 — Base de read-models derivados
1. **ID/Título:** 7.1 — Base de read-models derivados (AD-14)
2. **Objetivo/Valor:** um contrato único, confiável e seguro de leitura derivada, base de todo indicador/busca/relatório.
3. **Narrativa:** Como plataforma, quero uma base de read-models derivados dos dados reais, para que Dashboard/Busca/Relatórios sejam coerentes, autorizados e reconstruíveis, nunca uma segunda verdade.
4. **Escopo:**
   - **Contrato do read-model:** cada read-model/cache/índice/materialização possui, quando aplicável — `organizationId`; tipo e versão do read-model; versão da métrica/projeção; checkpoint do Evento processado; `generatedAt`; `sourceUpdatedAt`; estado de atualização; estado de reconstrução; erro sanitizado; **chave de escopo de autorização**; filtros canônicos aplicados.
   - **Fonte de verdade:** dados operacionais continuam a única fonte; **read-model não é autoritativo**; cache/índice/materialização podem ser **descartados e reconstruídos**; **nenhuma escrita funcional depende exclusivamente do read-model**; inconsistência é corrigida por **reconstrução/reconciliação**, nunca editando números derivados à mão.
   - **Atualização confiável (Arquitetura escolhe a tecnologia):** Eventos canônicos ou captura confiável; processamento **idempotente**; retry; replay; **reconstrução completa**; recuperação após indisponibilidade; **checkpoint**; detecção de **lag**; reconciliação com a fonte; **atualização temporal** de condições derivadas (prazo/saúde).
   - **Autorização no momento da leitura:** toda consulta é **autorizada no servidor na leitura** (não confiar só na autorização da indexação); a **chave de cache/materialização não pode ser apenas `organizationId`** — quando o resultado variar por usuário/papel/concessão, incluir usuário/Membership, escopo de permissão, **fingerprint/versionamento das permissões**, filtros e versão da métrica. **Invalidar/tornar inacessível imediatamente** o resultado anterior quando houver: mudança de papel; concessão/revogação de acesso; suspensão/remoção de Membership; troca de Organização ativa; arquivamento/restauração de recurso. **Nenhum cache revela dados após perda de acesso.**
   - **Estados de consistência:** atualizado; atualizando; temporariamente defasado; reconstruindo; indisponível; erro; zero legítimo; sem permissão. Havendo defasagem permitida, a interface é **honesta** (última atualização, estado, aviso de defasagem) — **não mostrar dado antigo como atual sem indicação**.
5. **Critérios de aceite:**
   - **Given** qualquer read-model **When** consultado **Then** deriva da fonte única, com autorização revalidada no servidor **na leitura**, e sua chave de escopo reflete usuário/papel/concessão/filtros/versão (não só `organizationId`).
   - **Given** mudança de papel/acesso/Membership/Organização ativa/arquivamento **When** ocorre **Then** o resultado anterior é invalidado/inacessível de imediato; nenhum cache revela dados após perda de acesso.
   - **Given** indisponibilidade/lag **When** detectados **Then** há checkpoint/reconstrução/reconciliação idempotentes; a interface mostra estado honesto (última atualização/defasagem), sem apresentar antigo como atual.
   - **And** o read-model é descartável/reconstruível e nunca é fonte de verdade autoritativa.
6. **Rastreabilidade:** FR-31; AD-9/14; RN-131; NFR-3/4/24/25/26/27/28; INV-REPORT-01/02.
7. **Dependências:** 1.6; contratos de Eventos/fontes dos módulos produtores (sem exigir suas interfaces).
8. **Gates:** **NFR-28/NFR-29 como gates formais de pré-implementação** (ver bloco abaixo); estratégia consulta direta×projeção×cache×índice×materialização = Arquitetura.
9. **Fora do escopo:** superfícies (7.2–7.5).
10. **Demonstração vertical:** parcial — verificável via 7.2/7.5.

> **Gates formais NFR-28/NFR-29 (não bloqueiam a gravação; bloqueiam a implementação técnica até fechados na Arquitetura + pre-implementation-check).**
> **NFR-28 — Defasagem máxima** (Produto+Arquitetura): defasagem máxima aceitável **por superfície** (Dashboard, Busca, Relatórios, badge); comportamento ao ultrapassar o limite; indicação visual de atualização; estratégia de atualização manual/automática; tolerâncias distintas por superfície.
> **NFR-29 — Desempenho** (Produto+Arquitetura): volume de referência (Organizações, Cards, Registros, Tarefas, Notificações, usuários simultâneos); latência-alvo por superfície; paginação; timeout; limite de agregação; comportamento de degradação. **Não inventar valores nesta etapa.**

### Story 7.2 — Conteúdo funcional do Dashboard
1. **ID/Título:** 7.2 — Conteúdo funcional do Dashboard (ação imediata)
2. **Objetivo/Valor:** preencher a casca do Dashboard com números reais e priorização acionável.
3. **Narrativa:** Como usuário autenticado, quero ver a operação da minha Organização com indicadores reais e priorização, para saber o que precisa de atenção agora.
4. **Escopo:** implementa FR-4 **sobre a casca/rota de 1.7** (não recria a casca); Dashboard é **superfície de ação imediata**, não relatório avançado.
   - **Conteúdo:** usa **apenas o catálogo aprovado em D6.4/R6** — Pipes autorizados; Databases autorizados; indicadores operacionais reais; itens que exigem atenção; **saúde temporal de Cards** (2.13); pendências operacionais aprovadas; ordenação/priorização definidas pelo Produto. **Não criar métricas novas a partir de exemplos** — exemplos escritos na Story não viram requisitos se não estiverem no catálogo.
   - **Priorização:** cada prioridade tem **regra determinística**, fonte identificável, critério de desempate, estado atual, recurso autorizado, deep-link seguro. **Sem pontuação oculta/IA/heurística não documentada** na Fase 1.
   - **Arquivados:** ativos por padrão; arquivados **não entram silenciosamente** nos números ativos; inclusão só por opção **explícita** aprovada, com indicação clara.
   - **Navegação/drill:** clicar em indicador/item/contador preserva Organização, escopo de autorização e filtro relevante, abre a listagem correspondente com **quantidade coerente** com o indicador e **revalida autorização no destino**; o indicador **não revela** quantidade cujo detalhamento o usuário não pode consultar.
   - **Estados honestos:** carregando; vazio legítimo; sem recursos configurados; sem permissão; dado defasado; erro parcial; indisponível. **Falha em um indicador não invalida os demais.**
5. **Critérios de aceite:**
   - **Given** a casca (1.7) **When** carregada **Then** exibe grade real de Pipes/Databases autorizados e indicadores do catálogo aprovado (D6.4), sem placeholders apresentados como reais nem métricas fora do catálogo.
   - **Given** a priorização **When** calculada **Then** usa regra determinística/fonte/desempate documentados (sem pontuação oculta/IA); recursos arquivados não entram nos ativos sem opção explícita.
   - **Given** um clique em indicador/contador **When** navega **Then** abre a listagem coerente com o número, preservando Org/escopo/filtro e revalidando autorização; não revela quantidade não detalhável.
   - **And** os estados são honestos e a falha de um indicador não invalida os outros (INV-REPORT-01; zero≠falha).
6. **Rastreabilidade:** FR-4; D6.4; RN-131; NFR-3/4/26/27; UX-DR6/DR7; INV-REPORT-01. **Consome:** casca (1.7), read-models (7.1), saúde de Card (2.13).
7. **Dependências:** 7.1, 1.7, contratos dos dados exibidos no catálogo.
8. **Gates:** catálogo/ordenação/priorização de indicadores (D6.4) como configuração de Produto; herda NFR-28/29.
9. **Fora do escopo:** badge (7.3); Relatórios (7.5).
10. **Demonstração vertical:** sim.

### Story 7.3 — Badge de não lidas (integração)
1. **ID/Título:** 7.3 — Badge de não lidas no Dashboard (integração, não reimplementação)
2. **Objetivo/Valor:** exibir no Dashboard a contagem real de não lidas, sem recriar Notificações.
3. **Narrativa:** Como usuário, quero ver no Dashboard quantas notificações não lidas tenho, com número coerente com o resto do sistema.
4. **Escopo:** implementa **apenas a integração visual do badge na casca do Dashboard**; a **fonte, leitura e consistência pertencem a E5**. **E7 não recria** tabela de Notificações, estado `readAt`, contagem paralela, marcar como lida/todas, canal Socket.IO nem preferências. Aplica: **consumir exclusivamente a consulta canônica de 5.3/5.4**; atualizar pela **mesma invalidação de E5**; **degradar para consulta normal** se o tempo real falhar; **não calcular a contagem no cliente**; **não contar** Notificações inacessíveis/ocultadas por perda de acesso; **troca de Organização ativa atualiza o badge imediatamente**; zero legítimo ≠ erro de sincronização. **Propriedade de FR-5:** E5 fornece a fonte e a operação; **E7 fornece a superfície no Dashboard**.
5. **Critérios de aceite:**
   - **Given** notificações não lidas **When** o Dashboard carrega **Then** o badge exibe a contagem canônica de 5.4 (calculada no servidor), coerente com popover/página.
   - **Given** "marcar todas como lidas" ou troca de Organização ativa **When** ocorre **Then** o badge reflete imediatamente pela invalidação de E5; falha do tempo real degrada para consulta normal.
   - **And** E7 não reimplementa nenhuma parte de E5; não conta itens inacessíveis; zero é legítimo.
6. **Rastreabilidade:** FR-5; INV-NOTIF-01; NFR-3/21; UX-DR16. **Consome:** fonte única de Notificações (5.3/5.4).
7. **Dependências:** 1.7, 5.3, 5.4.
8. **Gates:** —
9. **Fora do escopo:** modelo/superfícies/operações de Notificação (E5).
10. **Demonstração vertical:** sim.

### Story 7.4 — Busca Global restrita à Organização
1. **ID/Título:** 7.4 — Busca Global restrita à Organização
2. **Objetivo/Valor:** localizar recursos autorizados rapidamente, sem vazar o inacessível.
3. **Narrativa:** Como usuário, quero buscar Pipes, Databases, Cards, Usuários e Notificações da minha Organização, para chegar rápido ao que posso ver.
4. **Escopo:** catálogo **exato**: **Pipes; Databases; Cards; Usuários/Membros; Notificações** (RN-140). **Não** adicionar **Registros** sem alteração formal do PRD. **Databases:** consumir o **catálogo/ciclo de vida de Databases**, sem depender do ciclo de vida de Registro só para buscá-los.
   - **Usuários/Membros:** significa **Memberships visíveis da Organização atual** (não Accounts globais) — usuários de outras Orgs nunca aparecem; **Memberships ativas** aparecem conforme autorização; **suspensas/removidas/históricas não aparecem** na Busca operacional (consulta de suspensos/removidos fica no Painel Administrativo); **não exibir e-mail/papel/dado pessoal** além do necessário e permitido; avatar/nome respeitam o contrato de Perfil/Membership.
   - **Notificações:** somente **entregas do usuário atual**; um Admin **não** pesquisa Notificações pessoais de outros pela Busca Global; aplica preferências/retenção/autorização atuais.
   - **Arquivados (por tipo):** ativos por padrão; arquivados só se o catálogo permitir e por **opção explícita**, com estado claramente indicado; arquivados nunca aparecem como ativos.
   - **Consulta/resultados:** normalização do termo; comprimento mínimo configurável; paginação; limite por categoria; deduplicação; **ordenação determinística**; relevância mínima explicável; estado parcial por categoria; cancelamento/descarte de respostas antigas no cliente; **proteção contra abuso e rate limit**. **Não retornar** contagens de correspondências ocultas; sugestões baseadas em recursos inacessíveis; snippets de Campos não autorizados; títulos/nomes de referências restritas; conteúdo integral de Notificação; dados de outra Organização.
   - **Índice/autorização:** se houver índice — particionar por Organização; chaves tenant-safe; atualização idempotente; **remover/ocultar após arquivamento**; **reagir à perda de acesso**; suportar reconstrução; **presença no índice ≠ autorização**. **Revalidar autorização no recurso de destino** antes de abrir.
   - **Deep-links:** apontam para rota canônica; **revalidam Organização e permissão**; falham **sem revelar** o recurso se o acesso foi removido; não confiam em IDs do cliente.
5. **Critérios de aceite:**
   - **Given** um termo **When** buscado **Then** retorna só Pipes/Databases/Cards/**Memberships visíveis**/**Notificações pessoais** da Organização atual e só os autorizados; **Registros não entram**.
   - **Given** um recurso inacessível/arquivado/uma Membership suspensa **When** casaria com o termo **Then** não aparece (ou aparece só sob opção explícita, com estado claro), sem revelar existência/contagem/snippets não autorizados (INV-REPORT-01).
   - **Given** um resultado **When** aberto **Then** o deep-link revalida Organização/permissão no destino e falha sem revelar o recurso se o acesso foi removido; presença no índice não autoriza.
   - **And** há rate limit/limites por categoria/ordenação determinística; nenhuma busca cross-Organização.
6. **Rastreabilidade:** FR-6; RN-140/141; NFR-3/4; INV-REPORT-01; UX-DR6. **Consome:** read-models (7.1), contrato de Pipe (2.1), Database (3.1), Card (2.9), contrato de Membership, fonte pessoal de Notificações (5.3).
7. **Dependências:** 7.1, contrato de Pipe, contrato de Database, contrato de Card, contrato de Membership, Notificações pessoais (5.3). *(Sem dependência rígida de 8.7; sem dependência do ciclo de Registro salvo uso técnico que não altere o escopo.)*
8. **Gates:** índice/consulta tenant-safe = Arquitetura; herda NFR-28/29.
9. **Fora do escopo:** Registros na Busca (sem alteração de PRD); busca avançada/facetada (Non-Goal).
10. **Demonstração vertical:** sim.

### Story 7.5 — Relatórios e indicadores agregados
1. **ID/Título:** 7.5 — Relatórios e indicadores agregados
2. **Objetivo/Valor:** contadores agregados reais e autorizados, com filtros, sem vazamento nem dupla contagem.
3. **Narrativa:** Como usuário autorizado, quero relatórios com indicadores agregados e filtros, para acompanhar a operação com números confiáveis e coerentes.
4. **Escopo:** referencia **explicitamente o catálogo aprovado em D6.4/R6**; **não** adicionar indicadores/filtros não aprovados.
   - **Filtros aprovados:** Pipe; Fase; Responsável; período; saúde/condição operacional (quando aplicável); inclusão/exclusão explícita de arquivados.
   - **Semântica dos filtros:** fuso oficial; início/fim do período; inclusão/exclusão dos limites; comportamento para recurso sem Responsável; recurso sem Fase aplicável; combinação por **`E/AND`**; valor padrão de cada filtro; limpar filtros; indicação de filtros ativos.
   - **Arquivados:** excluídos por padrão; inclusão explícita; **ativos e arquivados não se misturam silenciosamente**; estado arquivado identificável.
   - **Agregações:** cada indicador declara nome; descrição; fonte; unidade; **fórmula**; dimensão temporal; filtros permitidos; regra para arquivados; regra para nulos; regra de autorização; **regra de deduplicação**; versão. **Sem fórmula configurável pelo usuário** na Fase 1.
   - **Prevenção de dupla contagem:** definir a **chave de agregação** de cada indicador; relacionamentos **N—N (Card↔Registro) não multiplicam contagens**; um recurso é contado pela **identidade canônica** da métrica, não pelo número de joins/vínculos.
   - **Autorização:** toda agregação considera só recursos acessíveis; nenhum agrupamento revela grupo oculto; categorias sem acesso **não** aparecem como zero; **zero autorizado ≠ categoria inexistente/não autorizada**; cache considera o escopo de permissão.
   - **Drill-down:** abre listagem com os mesmos filtros; preserva período/Organização; retorna **exatamente o conjunto autorizado** que compõe o agregado; revalida autorização; indica diferença por atualização entre o agregado e a abertura da lista.
   - **Estados:** zero; sem dados no período; filtro sem correspondência; sem permissão; dado parcial; dado defasado; reconstruindo; erro. **Falha parcial ≠ zero.**
5. **Critérios de aceite:**
   - **Given** um indicador do catálogo (D6.4) com filtros aprovados **When** calculado **Then** deriva de dados reais no escopo autorizado (tenant+papel), sem incluir inacessíveis (INV-REPORT-01) e **sem dupla contagem** em N—N (INV-REPORT-02, chave de agregação canônica).
   - **Given** filtros com período **When** aplicados **Then** usam fuso oficial, limites definidos e AND; arquivados excluídos por padrão (inclusão explícita, sem mistura silenciosa).
   - **Given** um drill-down **When** aberto **Then** retorna exatamente o conjunto autorizado do agregado, com mesmos filtros/período, revalidando autorização e indicando defasagens.
   - **And** zero legítimo ≠ falha ≠ categoria não autorizada; NFR-28/29 são gates de pré-implementação; sem fórmula de usuário/BI/exportação.
6. **Rastreabilidade:** FR-31; D6.4; RN-131/132/133; NFR-24/25/26/27/28/29; INV-REPORT-01/02; AD-14. **Consome:** read-models (7.1) sobre dados de E2/E3/E5.
7. **Dependências:** 7.1, contratos dos módulos cujos dados pertencem ao catálogo aprovado de indicadores.
8. **Gates:** NFR-28/29 (formais); estratégia de agregação/materialização = Arquitetura.
9. **Fora do escopo:** BI/exportação/relatórios personalizados/fórmulas de usuário (Non-Goals).
10. **Demonstração vertical:** sim.

---

## Contrato transversal do Épico 7 — Observabilidade, Segurança e LGPD
- **Observabilidade:** monitorar lag dos read-models; falha de projeção/indexação; tamanho da fila; idade do checkpoint; reconstrução; cache hit/miss; latência; timeout; erro por superfície; divergência na reconciliação; tentativa de acesso fora da Organização. **Não** logar termos de busca com dados pessoais, conteúdo de Notificações, valores integrais de Campos, e-mails, tokens, IDs sensíveis desnecessários ou payloads completos — aplicar minimização/mascaramento/retenção.
- **Segurança:** consultas server-side autorizadas; **filtro do cliente não amplia escopo**; IDs/`organizationId` do cliente não confiáveis; prevenir enumeração por contagem/tempo de resposta/mensagens de erro; rate limit na Busca; limites de consulta/agregação; timeout/cancelamento; queries parametrizadas; **sem expressão arbitrária/fórmula de usuário**.
- **LGPD:** Busca/Relatórios acessam só o necessário; dados pessoais **não duplicados desnecessariamente** em índices; índices/caches seguem retenção/descarte; perda de acesso reflete no resultado; **reconstrução não restaura dados que já deveriam ter sido eliminados/anonimizados**.

## Resumo do Épico 7 (gravado)
- **5 Stories**; **4 FRs proprietários** (FR-4/5/6/31); **natureza somente leitura e derivada**.
- **Nenhuma segunda fonte de verdade;** read-models **descartáveis e reconstruíveis**; atualização **idempotente**; **autorização server-side no momento da consulta**; caches **sensíveis a Organização e escopo de permissão** com **invalidação após mudança de acesso**.
- **Dashboard** baseado apenas no **catálogo aprovado** (D6.4); **badge consome E5** sem reimplementação (E5 = fonte/operação, E7 = superfície).
- **Busca Global** limitada a **Pipes, Databases, Cards, Memberships visíveis e Notificações pessoais** (sem Registros); **sem dependência rígida de 8.7**; deep-links revalidados; índice tenant-safe.
- **Relatórios** com filtros **Pipe/Fase/Responsável/Período** e regras explícitas para arquivados; **prevenção de dupla contagem** (identidade canônica em N—N); **drill-down coerente**; estados **zero/erro/defasado/sem permissão** distintos.
- **NFR-28 e NFR-29 como gates formais de pré-implementação** (não bloqueiam a gravação; bloqueiam a implementação até fechados na Arquitetura + pre-implementation-check).
- **Observabilidade, Segurança e LGPD** aplicadas como contrato transversal.
- **Non-Goals mantidos:** BI avançado, exportações, fórmulas, relatórios personalizados fora da Fase 1.

### Ordem produtiva (paralelização segura)
```text
7.1 ─→ 7.2
  ├──→ 7.4
  └──→ 7.5

1.7 + 5.3 + 5.4 ─→ 7.3
```
- 7.1 inicia primeiro; 7.2/7.4/7.5 avançam em paralelo após o contrato de 7.1; **7.3 avança em paralelo** (consome E1+E5, não precisa de 7.1); integração final valida coerência entre Dashboard/badge/Busca/Relatórios; gates NFR-28/29 fechados antes da implementação técnica.

<!-- Decomposição completa: Épicos 1–8 gravados e validados individualmente (step-03 concluído). Ordem de execução: 1, 8, 2, 3, 4, 5, 6, 7. step-04 (validação final) concluído. -->
