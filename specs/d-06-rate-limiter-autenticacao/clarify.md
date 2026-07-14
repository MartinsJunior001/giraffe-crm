# Clarify — D-06: rate limiter de autenticação sob rajada concorrente

> Registro das ambiguidades resolvidas antes do `plan`. Sem interlocutor humano disponível no worktree;
> as respostas vêm das fontes autoritativas (dossiê L6, pre-implementation-check, os 8 critérios de
> `gates/1-5/summary.md`, Context7 do Better Auth 1.6.23) e ficam registradas para auditoria.

| # | Ambiguidade | Resolução | Fonte |
|---|---|---|---|
| C1 | Qual das 3 opções de mitigação? | **Decisão FINAL: nenhuma — resolvido pelo UPGRADE.** O context7-check contra o 1.6.23 instalado mostrou que o nativo `storage:'database'` já é atômico; o defeito era de versão anterior. `customStorage` **removido**; Redis e pool/backpressure descartados. | `plan.md` §Resolução final; `docs/04-operacao/d-06-rate-limiter-historico.md` |
| C2 | Adotar Redis (`secondary-storage`)? | **Não.** Não está operacional; adotá-lo é mudança de stack que exige AD e antecipa necessidade não comprovada. | pre-check R1/§Decisões; dossiê §3 |
| C3 | D-06 depende de CR-09 (borda)? | **Não.** Resolvido no app, independente do Coolify — CR-09 é Coolify-dependente e não pode bloquear o code-advanceable. | dossiê §1/§4; pre-check §Decisões-3 |
| C4 | Semântica da janela (fixa a partir da 1ª requisição, ou deslizante)? | **Janela fixa**, igual à referência atômica do próprio Better Auth (`secondary-storage.increment`: ttl=window na abertura, nunca estendido). Preserva os invariantes do G2 já testados. | Context7 rate-limit; `login-http.test.ts` (G2) |
| C5 | Store indisponível → 429 ou 500? | **500 (relançar).** É negação (fail-closed) **e** mantém a separação 429/500 do critério 8. Devolver 429 conflataria defesa com defeito. | critérios 4 e 8; `plan.md` §Fail-closed |
| C6 | Precisa de migration/índice? | **Não.** `key @unique` já existe; GRANTs já concedidos. Sem DDL → sem `migration-check`, sem serialização com a Story CORE. | `schema.prisma` §182; migration §125 |
| C7 | Introduzir `orgId` no contador? | **Não.** `RateLimit` é global por IP, pré-contexto, fora da RLS organizacional. | spec.md §Dados; pre-check §Dados |
| C8 | Alterar `client-ip.ts`/resolução de IP? | **Não.** Fora de escopo; o IP já chega saneado (valor único) ao Better Auth. | spec.md §Fora do escopo |

## Não-objetivos confirmados
CR-09, D-01, D-02, D-05, identidade/sessão, `disableSignUp`, superfície pública nova — todos fora.
