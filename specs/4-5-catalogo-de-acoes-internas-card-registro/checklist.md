# Checklist — Story 4.5

## Config-time (catálogo)
- [x] 8 Ações fixas cobrindo Card e Registro; catálogo FECHADO (fora → 400 `ACAO_FORA_DO_CATALOGO`).
- [x] Alvo determinístico garantido em config-time (refs exatas; `RECORD_EDIT` explícito exige 1 ref; modos
  derivados do Evento sem ref; sem busca/atualização em massa).
- [x] Parâmetros com allowlist (anti-mass-assignment); `membershipId` UUID; `valor` presente para set-field.
- [x] Confirmação humana marcada nas Ações sensíveis (mover/finalizar/arquivar/set-field/record-edit).

## Principal Automação (RISCO ALTO)
- [x] `PrincipalAutomacao` derivado de AD-9/AD-18 (Org+Pipe+recursos+capacidades, deny-by-default; versionado).
- [x] Escopo é do principal, não do criador (não-ampliação provada).
- [x] Trilha distingue ator/iniciador/principal (nenhum fundido).

## Revalidação (fail-closed)
- [x] Alvo inexistente/estado inválido/fora do escopo/sem capacidade → recusa (nunca executa).
- [x] Cross-tenant (outra Org) → recusa.
- [x] Alvo indeterminado → recusa; motivos sanitizados (sem id/valor/PII).

## Isolamento / segurança
- [x] Núcleo puro; não lê estado nem muta; `orgId` nunca do cliente.
- [x] Sem migration/GRANT/RLS nova; guard/`ability.ts` intocado (C3).
- [x] Enforcement nos DOIS serviços (criar 4.1 + editar/duplicar/ativar 4.2).

## Escopo (AD-11)
- [x] Sem motor/execução/confirmação-máquina (4.6); sem encadeamento (4.7)/trilha (4.8); sem extensões E5/E6.
- [x] Não reimplementa mutação de domínio (mover/Responsável/ciclo de vida/valores).
