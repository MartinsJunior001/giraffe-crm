---
story_key: 2-6-ciclo-de-publicacao-dos-formularios
epic: 2
status: done
release: CORE (bloco 2.4–2.6; Sprint S5 do roadmap)
risco: ALTO
baseline_commit: empilha sobre a 2.5 (evolução segura de Campos; `option-config.ts`, `file-gate.ts`, guarda otimista)
gate_arquitetura: |
  Modelo de versionamento decidido por Architecture Agent read-only sobre os artefatos: SNAPSHOT JSON IMUTÁVEL
  VERSIONADO. Semântica determinada pelos artefatos (AD-12 "execução/leitura registra a versão da definição
  utilizada"; PRD D3.2 estados rascunho→publicar→despublicar, versão publicada imutável, novas edições em novo
  rascunho, submissões vinculadas à versão de origem); forma física DEFERIDA pelo Spine (Deferred) + AD-11 (não
  materializar relação para preparar o futuro) → baseline adotado. NENHUM gatilho relacional presente (edição
  parcial de versão é explicitamente vedada pelo PRD → reforça snapshot). Nova tabela `FormVersion` org-scoped;
  imutabilidade pelo GRANT (runtime só SELECT+INSERT, sem UPDATE/DELETE); RLS ENABLE+FORCE. Atomicidade da
  publicação (INSERT versão + UPDATE ponteiro) por transação interativa com contexto no client RAIZ — o
  `withTenantContext` recusa `$transaction` no client estendido, mas o raiz roda o mesmo primitivo
  (`set_config(..., true)`); publicar é o consumidor concreto previsto pela nota da Story 1.3. Numeração
  monotônica servida pelo banco (`@@unique([orgId, formId, version])`) → 409 em concorrência. Escopo congelado:
  publicar/despublicar + ler estado/histórico + snapshot imutável. Submissão/Card = 2.7+; mudança de tipo de
  Campo e travas de arquivamento sob uso = fora.
---

# Story 2.6 — Ciclo de publicação dos Formulários

**Como** administrador (Org ou Pipe), **quero** publicar um Formulário como versão imutável **para que** as
submissões futuras (2.7+) usem uma definição estável e o histórico seja preservado.

## Critérios de aceite (SC-26x)
- **SC-261** — Publicar o Formulário cria uma `FormVersion` imutável, numerada monotonicamente; despublicar zera
  a versão ativa preservando o histórico; ler devolve estado e versões.
- **SC-262** — Editar o rascunho (2.4/2.5) NUNCA altera versões já publicadas (imutabilidade); o runtime não tem
  GRANT de UPDATE/DELETE em `FormVersion`.
- **SC-263** — Numeração monotônica por Formulário; concorrência não cria número duplicado nem versão parcial
  (UNIQUE + rollback → 409).
- **SC-264** — Validação de publicabilidade determinística: sem Campo ativo, Seleção sem opção ativa, gate de
  Arquivo (AD-28) e `typeConfig` malformado → 400; snapshot só do rascunho validado.
- **SC-265** — Publicar/despublicar exige gerenciar (config do Pipe); MEMBER/VIEWER leem mas não publicam (403);
  sem acesso → 404. Cross-tenant negado pelo banco; contexto ausente falha fechado.

## Não-objetivos (registrados)
Submissão/Card (2.7+); referência de resposta a `formVersionId` (contrato futuro); mudança de tipo de Campo;
travas de arquivamento de Campo sob publicação em uso; atributo de obrigatoriedade em `Field` (não existe — o
snapshot não o inventa). Pré-visualização (simular submissão) não é materializada aqui (não há submissão ainda).
