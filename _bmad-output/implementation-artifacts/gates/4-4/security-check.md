# security-check — Story 4.4

**Status:** APROVADO
**Risco:** ALTO.

## Superfície de ataque
A 4.4 é núcleo PURO + enforcement de configuração. Não abre rota nova, não lê banco, não persiste nada.

## Multi-tenant / isolamento (invariante-mãe)
- O avaliador **não** lê estado — opera sobre o `SnapshotAvaliacao` em memória. O isolamento vive em quem MONTA
  o snapshot (motor 4.6, sob `withTenantContext`) e nas referências (`revalidarReferencias`, sob RLS, 4.1/4.2).
- **Fail-closed cross-tenant provado** (`condition-eval` (f)): referência a Campo/Fase ausente do snapshot ⇒
  falso; o avaliador NUNCA avalia contra dado alheio. Um id de outra Org não entra no snapshot (a policy o
  esconde na montagem).
- `orgId` no snapshot é carimbo de origem; o avaliador não autoriza por ele. Nenhuma entrada aceita `orgId` do
  cliente (o enforcement de config reusa `validarConfiguracao` da 4.1, que já rejeita chave desconhecida).

## Fail-closed (deny-by-default)
- Condição/operador/valor desconhecido, malformado, tipo incompatível ou não-avaliável ⇒ **falso**, nunca disparo.
- Cada Condição é ISOLADA em try/catch: qualquer exceção interna vira `false`; o avaliador **nunca lança**
  (`condition-eval` (c)). Erro jamais "vira verdadeiro por omissão".
- `FILE` gated (AD-28) ⇒ falso.

## Injeção / comparação segura
- Sem SQL no avaliador (comparação em memória). Metacaracteres SQL num valor são comparados como TEXTO literal
  (`condition-eval` (d)) — sem interpretação. Data malformada ⇒ fail-closed (sem cast custoso — herda 3.5).
- Número validado (sem coerção de string). Limites de payload da config herdados da 4.1 (`LIMITE_CONDICOES`,
  `LIMITE_REFS_TOTAL`) — barram amplificação.

## PII / vazamento
- O avaliador devolve `ResultadoCondicao` com **só metadados** (`tipo`/`operador`/`resultado`/`motivo`) — NUNCA
  o valor comparado (possível PII). Coerente com NFR-1/8/16 e com o log sanitizado da 4.1.
- Enforcement de config traduz falhas em 400 sanitizado (`CONDICAO_FORA_DO_CATALOGO` + motivo estrutural), sem
  eco do payload — mesmo padrão de `EVENTO_FORA_DO_CATALOGO` (4.3).

## Veredito
APROVADO — 0 achados CRITICAL/HIGH. O isolamento cross-tenant e o fail-closed são provados por unidade; a
montagem do snapshot sob RLS é da 4.6 (DEB-4-4-SNAPSHOT-BUILDER).
