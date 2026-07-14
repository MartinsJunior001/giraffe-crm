# Revisão independente — Story 2.6 (ciclo de publicação dos Formulários)

> Revisão adversarial de **risco ALTO**: quatro revisores read-only em paralelo. CRITICAL/HIGH corrigidos com
> regressão e mutação; MEDIUM que afete aceite/dados/histórico/isolamento bloqueia merge. Evidência real;
> PostgreSQL real.

## Revisores e veredito
- **Blind Security** — sem CRITICAL/HIGH. Transação interativa com contexto no client raiz confirmada SEGURA
  (contexto transaction-local, sem vazamento de pool, sem bypass de RLS); orgId/actorId do servidor;
  anti-mass-assignment; imutabilidade pelo GRANT. **1 MEDIUM** (audit do `Form` no publish).
- **Architecture Reviewer** — modelo compatível (AD-6/10/11/12), sem bloqueio. **1 MEDIUM** (docstring do schema
  inventava "obrigatoriedade"); LOW/MED (2º ponto de `set_config`); LOWs (ponteiro Int, audit).
- **Edge Case Hunter** — sem HIGH. Rollback integral e numeração sem buracos confirmados. **2 MEDIUM** (mapeamento
  409 sem teste determinístico; publish bloqueado podia virar 500 por timeout); LOWs (snapshot lido fora da tx —
  seam intencional; audit; read-after-write).
- **Acceptance Auditor** — todos os SC-261..265 atendidos e cobertos; não-objetivos e deferimentos do PRD (D3.2)
  respeitados. 2 LOW (campo `revision` extra — ok; asserção de GET estado→404).

## Achados e disposição

| # | Sev. | Achado | Disposição |
|---|------|--------|------------|
| Sec-1 | MED | Publish audita só `FormVersion.create`; a mudança do ponteiro em `Form` (na tx raiz) não entrava na trilha — assimétrico ao `despublicar`. | **CORRIGIDO.** `publicarAtomico` emite AGORA dois eventos de auditoria (`FormVersion`/create e `Form`/update). |
| Arch-1 | MED | Docstring de `FormVersion` no schema citava "obrigatoriedade"/"ordem" que o código NÃO grava — contradizia o invariante "não inventar obrigatoriedade". | **CORRIGIDO.** Docstring alinhado ao que `snapshot.ts` realmente captura (id/label/tipo/ajuda/typeConfig na ordem do array). |
| Arch-2 | LOW/MED | `set_config` manual na tx de publicação virava 2ª cópia da fronteira de contexto (chave divergível). | **CORRIGIDO.** Extraído `definirContextoOrg` em `tenant-context.ts` — fonte ÚNICA, usada pela extensão E pela publicação. |
| Edge-1 | MED | Mapeamento erro→409 sem teste determinístico (o burst HTTP pode serializar e nunca tocar o 409). | **CORRIGIDO.** Predicado `isConflitoDePublicacao` exportado e provado em unidade (`publication-conflict`: P2002/P2028→conflito; outros não). Backstop do banco (duplicado→P2002) já determinístico em `publication-rls`. |
| Edge-2 | MED | Publish bloqueado no índice único podia estourar o timeout da tx (P2028) e virar 500 em vez de 409. | **CORRIGIDO.** `isConflitoDePublicacao` mapeia P2002 **e** P2028 → 409 (contenção = retry, não erro interno). |
| Acc-1 | LOW | Faltava asserção direta de GET estado→404 para não-concedido. | **CORRIGIDO.** Adicionada em `publication-authz`. |
| Edge-3 | LOW | Snapshot lido fora da tx atômica (validar→capturar não é atômico). | **ACEITO (seam intencional).** Captura point-in-time; documentado em `analyze` D-R? — sem "draft unchanged" guard, coerente com o escopo (submissão só em 2.7+). |
| LOWs restantes | LOW | Ponteiro Int sem FK (integridade aplicacional, dangling impossível por construção); read-after-write no payload (estado autoritativo é o do banco); tentativa negada teórica no publish. | **ACEITOS**, registrados. Não bloqueiam. |

## Veredito
Nenhum CRITICAL/HIGH; todos os MEDIUM corrigidos (com regressão/mutação onde aplicável). Suíte cheia verde.
Pronto para commit e PR.
