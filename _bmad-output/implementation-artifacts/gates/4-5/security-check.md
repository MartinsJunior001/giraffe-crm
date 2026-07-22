# security-check — Story 4.5

**Status:** APROVADO
**Risco:** ALTO (modelo de autorização do principal Automação).

## Superfície de ataque
A 4.5 é núcleo PURO (catálogo + contrato do principal + revalidação) + enforcement de configuração. Não abre rota
nova, não lê banco, não persiste nem muta nada. A execução real é a 4.6.

## Principal Automação — não-ampliação de poder (o ponto ALTO)
- O principal é INTERNO próprio, com escopo RESTRITO (Org + Pipe + recursos configurados) e **capacidades explícitas
  deny-by-default** (AD-18) — derivadas da definição VERSIONADA, **não** das permissões do criador.
- **Não-ampliação provada** (`action-revalidation.core` (c) + `automation-principal.core`): recurso fora da allowlist →
  `FORA_DO_ESCOPO`; Card de outro Pipe → `FORA_DO_ESCOPO`; tipo de Ação sem capacidade → `SEM_CAPACIDADE` — mesmo que o
  criador, como pessoa, pudesse a Ação. O escopo é do principal.
- A capacidade é checada ANTES do alvo: um principal sem a capacidade nunca sequer inspeciona o recurso.

## Multi-tenant / isolamento (invariante-mãe)
- O núcleo **não** lê estado — opera sobre `AlvoAcaoSnapshot`/`ContextoEvento` em memória. O isolamento vive em quem
  MONTA o snapshot (motor 4.6, sob `withTenantContext`) e nas referências (`revalidarReferencias`, sob RLS, 4.1/4.2).
- **Cross-tenant fail-closed provado** (`action-revalidation.core` (d)): `alvo.orgId !== principal.orgId` → `FORA_DA_ORG`;
  alvo de outra Org não entra no snapshot (a policy o esconde na montagem) → `NAO_ENCONTRADO`. `orgId` nunca do cliente.

## Fail-closed (deny-by-default) + alvo determinístico
- Ação/refs/parâmetros/alvo fora do catálogo → 400 `ACAO_FORA_DO_CATALOGO` (config-time). Allowlist de parâmetros
  anti-mass-assignment; `membershipId`/refs exigidos como UUID (tenant-safe).
- Alvo determinístico garantido: `RECORD_EDIT` explícito exige 1 referência; modos derivados do Evento sem referência;
  `VINCULO` com 0 ou >1 vínculos → ambíguo → **nenhum alvo** (`resolverAlvoDeterministico` → null → recusa). Sem busca
  aberta, sem atualização em massa (§1381).
- `revalidarAcao` é total e fail-closed: tipo desconhecido → `ACAO_DESCONHECIDA`; alvo indeterminado/inexistente/estado
  inválido → recusa. Nunca "permite por omissão".

## Confirmação humana
- Ações sensíveis (mover/finalizar/arquivar/set-field/record-edit) carregam `exigeConfirmacaoHumana: true`, propagado no
  veredito para o motor (4.6) entrar em `aguardando confirmação` — a 4.5 não contorna a confirmação (§1383).

## PII / vazamento
- Motivos de recusa são enum estrutural SANITIZADO (`FORA_DA_ORG`/`SEM_CAPACIDADE`/…), NUNCA um id ou valor (possível
  PII). O enforcement de config traduz falhas em 400 sanitizado (`ACAO_FORA_DO_CATALOGO` + motivo estrutural), sem eco
  do payload — mesmo padrão de `CONDICAO_FORA_DO_CATALOGO` (4.4). Config não vai a log (herda 4.1, provado em log-test).

## Veredito
APROVADO — 0 achados CRITICAL/HIGH. Não-ampliação, isolamento cross-tenant, alvo determinístico e fail-closed são
provados por unidade; a montagem do snapshot/principal sob RLS e a execução são da 4.6 (`DEB-4-5-ENGINE-CONSUMER`).
