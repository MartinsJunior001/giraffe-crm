# Story 3.9 — Vínculo Card↔Registro N–N

## Objetivo
Materializar o **vínculo explícito N–N entre Card e Registro** (`CardRecordLink`), com criação idempotente, desvínculo determinístico, atomicidade (vínculo + eventos de histórico dos dois lados na mesma transação, com `correlationId` comum), e autorização derivada dos **dois** recursos — sem que o vínculo jamais conceda acesso.

## Escopo
- Nova entidade org-scoped `CardRecordLink` (twin estrutural das entidades de vínculo; entidade DISTINTA — `Card ≠ Registro`).
- Vincular (idempotente), desvincular (idempotente, soft — `state`), listar vínculos de um Card e de um Registro.
- Eventos `LINKED`/`UNLINKED` no `CardHistory` **e** no `RecordHistory`, na MESMA tx, com o mesmo `correlationId` (nova coluna nas duas trilhas, aditiva).

## Fora de escopo
- Automação "Criar Registro relacionado" (E4). Navegação/UX de vínculos. Vínculo Card↔Card ou Registro↔Registro. Cascata de arquivamento entre lados.

## Critérios de aceite (contrato do dono — 18 pontos)
1. Um Card possui vários Registros; um Registro pertence a vários Cards. 2. Vínculo explícito. 3–5. Card e Registro na **mesma Organization**; o mesmo par não duplica. 6. Unicidade `(orgId, cardId, recordId)` (índice único parcial `WHERE state='ACTIVE'`). 7. Criar idempotente. 8. Desvincular determinístico e idempotente. 9. Concorrência não cria duplicata (constraint do banco → P2002 → idempotente/409, nunca 500). 10. Operação atômica. 11. Falha parcial não deixa vínculo sem histórico, histórico sem vínculo, nem um lado sem o outro (tx única). 12. Vincular/desvincular geram evento no histórico de Card **e** de Registro. 13. Eventos correlacionados usam o mesmo `correlationId`. 14–15. Vínculo **nunca concede acesso** (Card↔Registro↔Histórico independentes; cada recurso mantém autz canônica; consultar vínculo não vaza dado do relacionado sem acesso atual). 16. Cross-tenant bloqueado não-enumerante (404). 17. Arquivamento/indisponibilidade segue o contrato existente, sem exclusão definitiva. 18. Não expor payload interno/secrets/PII desnecessária.

## Autorização (derivada dos autorizadores canônicos)
- **Criar/remover vínculo:** exige **operar o Card** (`exigirOperarCard`, pipe-authz 2.10) **E** **operar o Database do Registro** (`exigirOperarDatabase`, database-authz 3.4). Ambos → 404 não-enumerante sem acesso, 403 só-lê. Precisa dos DOIS (a operação toca os dois recursos).
- **Listar vínculos de um Card:** exige **ler o Card**; cada linha expõe só o `recordId` (referência), não conteúdo do Registro.
- **Listar vínculos de um Registro:** exige **ler o Database** dono; cada linha expõe só o `cardId`.
- O vínculo **não** é usado como autorização. RLS ENABLE+FORCE é defesa adicional. Sem bypass administrativo.

## Modelo de dados
Ver `data-model.md`. Migration NECESSÁRIA (aditiva): tabela `CardRecordLink` + coluna `correlationId` (nullable) em `CardHistory`/`RecordHistory`. RLS ENABLE+FORCE + 4 policies (WITH CHECK insert/update); GRANT `SELECT/INSERT/UPDATE` (sem DELETE — desvincular é `state=REMOVED`); índice único parcial `(orgId, cardId, recordId) WHERE state='ACTIVE'`. Rollback = DROP TABLE + DROP COLUMN (aditivo, reversível). Em `MODELOS_AUDITADOS`.

## Idempotência / concorrência
- **Criar:** INSERT do vínculo; colisão do índice único parcial ativo (P2002) ou timeout (P2028) → devolve o vínculo ativo existente (idempotente) ou 409. Nunca 2º vínculo ativo, nunca 500.
- **Desvincular:** `updateMany where (cardId, recordId, state='ACTIVE')` → REMOVED; `count=0` → já removido/inexistente = idempotente (resposta determinística); reconflito P2002/P2028 → 409.

## Eventos / observabilidade
`LINKED`/`UNLINKED` em `CardHistory` e `RecordHistory` na MESMA transação interativa (client raiz, `definirContextoOrg` — AD-13), ambos com o mesmo `correlationId` (gerado server-side por operação). Sem PII no summary (só as referências `cardId`/`recordId`). Auditoria manual (FR-214). Logs estruturados sem PII.

## Segurança / LGPD
Isolamento pelo banco (RLS+FORCE+WITH CHECK); `orgId` nunca do cliente. Sem exclusão definitiva (soft `state`). Projeções por allowlist; nunca vazar conteúdo do recurso relacionado sem acesso atual. Cross-tenant → 404 uniforme.

## Testes obrigatórios
Ver `tasks.md` (20 provas do dono): vínculo válido; Card com N Registros; Registro em N Cards; par não duplica; idempotência sequencial; concorrência sem duplicata; desvincular; desvincular idempotente; cross-tenant bloqueado; sem permissão bloqueado; acesso só-Card não lê Registro nem seu Histórico; vínculo não altera grants; evento no Histórico do Card; evento no Histórico do Registro; mesmo `correlationId`; falha na gravação de um evento desfaz tudo; projeções não vazam payload; RLS bloqueia acesso direto; regressão 2.7/2.9/2.17/3.4/3.6 verde.

## Rollback
Migration aditiva reversível (DROP TABLE CardRecordLink + DROP COLUMN correlationId das trilhas). Sem perda de dado existente.

## Definition of Done
Aceite comprovado por teste; suíte serial verde; CI verde; 0 CRITICAL/HIGH; impl + testes obrigatórios no MESMO PR; merge da impl; closure posterior; `sprint-status` 3-9→done; checkpoint durável com SHA final.
