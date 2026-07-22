# Analyze — Story 4.5 (consistência cross-artefato)

Sem contradições entre spec/plan/tasks/checklist e a fonte (`epics.md` §4.5). Pontos verificados:

- **Alvo determinístico (§1381)** ↔ catálogo (`RECORD_EDIT` modos EVENTO/VINCULO/EXPLICITO; refs exatas) e
  `resolverAlvoDeterministico` (ambiguidade ⇒ nulo). Coerente com §1286/§1293 da 4.1 ("sem busca/atualização em massa").
- **Principal Automação (§1384)** ↔ AD-9 (principal distinto com Org/permissões) e AD-18 (capacidades explícitas
  deny-by-default; não herda do criador; versionado). Derivação registrada em `decisions/automation-principal-4-5.md`;
  **sem escolha nova** ⇒ sem `EXTERNAL_BLOCKER`.
- **Confirmação humana (§1383/§1388)** ↔ `exigeConfirmacaoHumana` no catálogo e no veredito da revalidação; a 4.5
  REGISTRA o requisito, a máquina de estados é da 4.6 (fronteira explícita, AD-11).
- **Reuso de serviços de domínio (§1383)** ↔ a 4.5 não reimplementa mutação; `revalidarAcao` é pré-checagem
  fail-closed, o serviço de domínio é a autoridade final na 4.6.
- **Isolamento (NFR-3)** ↔ núcleo puro; cross-tenant provado (`FORA_DA_ORG`); refs sob RLS já em 4.1/4.2.
- **Regressão E4:** o enforcement do catálogo quebra fixtures HTTP que usavam placeholders (`MOVER_CARD`/`A`/
  `FINALIZAR_CARD`); corrigidas para tipos válidos. Testes que inserem via Prisma direto (RLS/log/snapshot) não
  passam por `validar` e ficam intactos.

## Riscos residuais
- `membershipId` de `CARD_ASSIGN_RESPONSIBLE` vive em `parametros` (não em `refs`), então não é revalidado por
  `revalidarReferencias` em config-time; a existência/alcance da Membership e "o alvo já tem acesso operacional"
  (SC-2101) são revalidados na EXECUÇÃO (4.6/2.10) sob RLS. Registrado como `DEB-4-5-MEMBERSHIP-REF` (baixo — o
  vocabulário de refs da 4.1 não inclui MEMBERSHIP; estender exigiria consumidor concreto, que é a 4.6).
