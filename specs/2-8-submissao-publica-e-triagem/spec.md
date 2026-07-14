# Spec — Story 2.8 (submissão pública controlada e triagem)

> Rastreabilidade: FR-15; PRD D3.2 (acesso público do Formulário inicial) / D3.3 (submissão e triagem); NFR-8
> (LGPD); INV-FORM-01. AD-6/10/11/13/24/27/28/31. epics.md Story 2.8. Depende da 2.7 (Card/CardHistory).

## Objetivo
Permitir que um **ator externo não autenticado** submeta o **Formulário inicial publicado** de um Pipe, quando a
Organização habilitar o acesso público **por Formulário**, sem conceder nenhum acesso ao CRM. A submissão pública
segue um ciclo próprio (**pendente → aprovada/rejeitada → convertida**); em **triagem** (padrão) nenhum Card é
criado até aprovação; em **criação direta** (explícita) cria 1 Card. Aprovar cria exatamente 1 Card (origem
registrada, idempotente); rejeitar preserva a submissão (LGPD).

## Escopo
- Opt-in público por Formulário (só o inicial); bloqueio ao despublicar/revogar.
- Endpoint **público sem autenticação** de submissão: resolve a Org pelo Formulário público alvo; valida contra o
  snapshot; resposta **só confirmação** (sem dado interno).
- Entidade `SubmissaoPublica` (org-scoped) com ciclo pendente/aprovada/rejeitada/convertida.
- Triagem: aprovar (→ 1 Card atômico, reusa 2.7; origem registrada) e rejeitar (→ preserva).
- Capacidade **"Revisar submissões públicas"** deny-by-default (Admin da Org/Admin do Pipe; Membro só com concessão).
- Antiabuso (gate resolvido): **rate limit por IP+Formulário** (infra existente); **Arquivo gated no canal
  público** (sem upload); **CAPTCHA deferido**. Guardrails de Produto (privacidade/consentimento/limites).

## Fora de escopo
Demais Formulários públicos (Fase/Database nunca são públicos); acesso externo ao CRM; CAPTCHA; upload/análise de
Arquivo no canal público (Arquivo permanece gated — AD-28); ciclo de vida do Card (2.11); dedup por Campo (futuro).

## Decisão de modelo
`SubmissaoPublica` é entidade **distinta do Card** (ciclo próprio; triagem ≠ estado do Card). `valores` em JSONB
por `Field.id`, validados contra o snapshot da `FormVersion` (reusa `submission.ts` da 2.7). Conversão
aprovação→Card reusa a criação atômica da 2.7 (Card + `CardHistory` CREATED). Idempotência da conversão por
ponteiro `cardId`/UNIQUE (uma submissão convertida não reconverte). Sem DELETE (preserva por LGPD).

## Gate de Segurança/Arquitetura (RESOLVIDO)
Antiabuso do endpoint público (rate limit/CAPTCHA/análise de Arquivo) era decisão obrigatória de Segurança/
Arquitetura, deferida pelos artefatos. **Decisão do dono (2026-07-14):** baseline — rate limit IP+Formulário
reusando a infra existente; Arquivo permanece gated (sem upload público); CAPTCHA deferido. Registrado na Story.
