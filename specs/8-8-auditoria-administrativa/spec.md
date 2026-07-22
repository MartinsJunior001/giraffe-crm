# Spec — Story 8.8: Auditoria administrativa (read-side)

> Fonte: `epics.md` §717–733 (Story 8.8), FR-33, D5.3, AD-15, AD-30, INV-AUDIT-01, NFR-39/40/42.
> Decisão de escopo aprovada: **D-4** — entregar o **read-side técnico** agora; retenção/anonimização/
> descarte/backups são **gate de PRODUÇÃO** (Governança/Jurídico), documentado, **não bloqueia** esta impl.

## Problema

O Administrador precisa acompanhar mudanças de acesso e de configuração da **sua** Organização, com
confiança e sem vazamento. O evento canônico de auditoria administrativa **já existe** e é materializado
como `MembershipEvent` (Stories 8.4/8.5/8.6): tabela org-scoped **append-only e imutável** (RLS
ENABLE+FORCE, WITH CHECK no INSERT/UPDATE, GRANT só `SELECT`/`INSERT`, em `MODELOS_AUDITADOS`), com a
taxonomia real `ROLE_CHANGED`/`SUSPENDED`/`REACTIVATED`/`REMOVED` (sem `CREATED`) e envelope minimizado
(`orgId`, `eventId` uuidv5 determinístico, `membershipId`, `actorId`, `fromRole`/`toRole`, `payload`
sanitizado, `occurredAt`, `correlationId`, `version`).

Falta a **consulta**: uma superfície de leitura, autorizada e projetada, para o Administrador.

## Solução (recorte executável)

Um **read-side puro** que **projeta sobre `MembershipEvent`** — sem novo substrato de eventos, sem
migration, sem GRANT novo (o runtime já tem `SELECT`). Módulo novo `apps/api/src/organizations/audit/`.

### Requisitos funcionais

- **RF-1 — Consulta autorizada.** `GET /organizations/audit` lista os eventos de auditoria administrativa
  **da Organização do contexto**. Só **Admin ATIVO** (guard `@Requer('administrar','Organizacao')` +
  defesa em profundidade no serviço). MEMBER/GUEST e o **Super Admin** (sem Membership) → 403. Sem
  principal → 401.
- **RF-2 — Filtros mínimos (fail-closed).** `categoria`, `operacao`, `resultado`, `ator`, `tipoAlvo`,
  `alvo`, intervalo `de`/`ate` (sobre `occurredAt`) — **só na Organização atual**. Valor fora da allowlist
  → 400 (não vira consulta silenciosamente ampla).
- **RF-3 — Paginação + ordem determinística.** Cursor determinístico `[occurredAt DESC, id DESC]` (id
  único desempata); teto rígido `limite ≤ 100`; `proximoCursor` estável.
- **RF-4 — Projeção controlada (allowlist AD-30).** Expõe só: `auditEventId`, `schemaVersion`, `categoria`,
  `operacao`, `resultado`, `ocorridoEm`, `correlationId`, ref mínima do **ator** (`accountId`
  pseudonimizável), ref mínima do **recurso** (`{tipo:'Membership', id}`), `alteracao` (antes/depois
  minimizados: `fromRole`/`toRole` + `fromState`/`toState`). **Proibido** expor `orgId`, chaves internas,
  senha/token/sessão/cookie/id de sessão/corpo HTTP/e-mail/PII sem finalidade. Fail-closed: chave de
  `payload` fora da allowlist não vaza.
- **RF-5 — Auditar o acesso.** Registrar `AUDIT_LOG_VIEWED` **sanitizado** (Pino), com ator, Org, filtros,
  paginação e **contagem** — **nunca** o conteúdo listado.
- **RF-6 — Sem edição/exclusão.** É read-side; nenhuma rota apaga/edita auditoria. Correção = novo Evento
  (write-side dos produtores). O runtime não ganha DELETE/UPDATE em nada de auditoria.

### Requisitos não-funcionais / invariantes

- **Isolamento por Org (invariante-mãe).** Toda query por `withTenantContext()`; nenhum `where orgId`
  manual como defesa única; nenhum `orgId` do cliente. Evento de outra Org invisível (RLS).
- **INV-AUDIT-01 / AD-30.** Append-only, resistente a alteração pelo fluxo comum (garantido pelo banco no
  write-side; o read-side só lê).
- **C3 congelado.** `ability.ts`/`ability.factory.ts` intocados — `administrar Organizacao` já existe (1.6).
- **NFR-3/4.** Teto de página; sem N+1 (uma query paginada).

## Fora do escopo (com justificativa)

- **Substrato de auditoria canônico distinto de `MembershipEvent`** (com `causationId`, `origem`, `motivo`,
  categorias Pipe/Database/Card/Form/Template/Automação). **Não há produtor com tabela própria hoje** além
  do ciclo de Membership; os demais produtores usam suas trilhas (`CardHistory`/`RecordHistory`) ou log
  manual FR-214. Construir o substrato agora seria abstração especulativa sem consumidor (**AD-11**).
  Registrado como **DEB-8-8-AUDIT-SUBSTRATE-AMPLO**.
- **Write-side fail-closed / outbox / `resultado` BLOQUEADA/FALHA persistidos.** Os eventos são escritos na
  mesma transação da mutação bem-sucedida (8.4/8.5/8.6) — só `SUCESSO` é persistido. O read-side aceita o
  filtro `resultado` e devolve vazio para BLOQUEADA/FALHA (contrato futuro). **DEB-8-8-WRITE-SIDE-RESULTADO.**
- **Retenção 24 meses / anonimização / descarte / legal hold / backups.** Gate de **PRODUÇÃO**
  (Governança/Jurídico) — ver `gates/8-8/lgpd-check.md`. Não bloqueia a impl/testes.
- **UI/Painel.** Frontend fora do recorte desta Story de API.

## Critérios de aceite (do épico, mapeados)

- **AC1** consulta/filtra por período/categoria/operação/resultado/ator/tipo-alvo/alvo, na Org atual, com
  paginação e ordem cronológica determinística → RF-1/2/3.
- **AC2** filtros não revelam outra Org; refs restritas não revelam conteúdo inacessível; nenhum
  segredo/token/payload exibido → Isolamento + RF-4.
- **AC3** usuário comum/Super Admin → negado (só Admin ativo); registros append-only (correção por novo
  Evento) → RF-1/6.
- **AC4 (write-side fail-closed)** — do produtor (8.2–8.6), **fora** do read-side; registrado como gate/débito.
