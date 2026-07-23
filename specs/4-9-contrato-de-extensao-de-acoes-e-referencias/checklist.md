# Checklist — Story 4.9

## Anti-especulação (o gate central desta Story)
- [ ] Nenhum handler/módulo/entidade especulativo de Tarefa/Notificação/E-mail/IA/Template.
- [ ] Consumidor concreto do contrato = os 8 handlers 4.5/4.6 (formalização, não invenção).
- [ ] Sem migration/tabela/GRANT/RLS novos (contrato é código, não dado de tenant). `prisma generate` sem diff.
- [ ] Sem motor paralelo; o dispatch do motor 4.6 permanece intocado; regressão verde.
- [ ] `TIPOS_DE_REFERENCIA` **não** ganha `TEMPLATE` (sem consumidor).

## Contrato tipado (§1459)
- [ ] `HandlerDeAcao` declara as 11 facetas (variáveis por tipo; uniformes por binding do módulo).
- [ ] Registro FECHADO dos 8 núcleo; bijeção com `ACOES_CATALOGO`.
- [ ] `ExecutorKind` é enum fechado — sem função/URL/script/handler externo (proibições por construção).
- [ ] `ACOES_EXTENSAO` (E5/E6) declaradas `origem=EXTENSION`, sem executor, provisórias.

## Fail-closed / autz preservada
- [ ] Config com tipo de extensão → 400 `ACAO_DE_EXTENSAO_INDISPONIVEL`; desconhecido → `ACAO_FORA_DO_CATALOGO`.
- [ ] Não-ampliação e revalidação-na-execução preservadas (`revalidarAcao`); `PrincipalAutomacao` intocado.
- [ ] C3 congelado: `kernel/authz/ability.ts` **não** é tocado.

## Conformação provada por teste
- [ ] `eventosProduzidos` declarados batem com a emissão real do motor (E2E) para os 3 executáveis; `[]` para os 5 gated.
- [ ] `dadosDeTrilha` = allowlist `{type,summary,actorId}`; executores não gravam fora dela.
- [ ] Fase vermelha demonstrada (quebrar eventosProduzidos ⇒ teste falha).

## Decisões registradas (contrato-futuro E6)
- [ ] `action-extension-contract-4-9.md`: recorte Fase-1×E6; semântica Ação↔Template (snapshot-na-execução, pendente ratificação
      de Arquitetura antes de E6); IA como Ação (AD-20, embrião = confirmação humana); débitos DEB-4-9-*.
- [ ] ARCHITECTURE-SPINE/epics/PRD/UX/sprint-status **não** editados manualmente.

## Gates (risco ALTO)
- [ ] prettier · lint · typecheck · build · suíte API completa (PG real) verde · `prisma generate` sem diff.
- [ ] Regressão 4.5/4.6/4.7/4.8 + http + trilha verde (comportamento observável do motor inalterado).
