# Checklist — Story 4.4: Catálogo de Condições + avaliação AND

## Catálogo (fechado, 5 domínios)
- [x] Cobre os 5 domínios oficiais: Card, Campo e valor, prazo e marco, relacionamento, Fase.
- [x] Fechado/fail-closed: tipo/operador/valor fora do catálogo → rejeitado na configuração (400).
- [x] Ausência de Condição é legítima (aprovação direta) — array vazio não é erro.
- [x] Operadores de Campo reusam a categoria do Form Builder (fonte única `categoriaDeCampo`) — sem 2º catálogo.
- [x] `OU/OR`/aninhamento fora da Fase 1 — não há tipo "grupo" nem operador lógico.

## Avaliação AND (pura, determinística)
- [x] AND: todas verdadeiras ⇒ aprovado; qualquer falsa ⇒ reprovado; vazio ⇒ aprovado.
- [x] Determinismo: única fonte de tempo = `snapshot.avaliadoEm`; sem `Date.now()`/aleatório na comparação.
- [x] Sem efeitos colaterais, sem novos Eventos, sem I/O — função pura do snapshot.

## Fail-closed (o coração do risco ALTO)
- [x] Tipo/operador/valor desconhecido ou malformado ⇒ falso.
- [x] Tipo de Campo incompatível com o operador ⇒ falso.
- [x] Campo/Fase/recurso ausente do snapshot ⇒ falso (nunca "verdadeiro por omissão").
- [x] Erro de avaliação capturado ⇒ falso; o avaliador NUNCA lança.
- [x] `FILE` gated (AD-28) ⇒ falso.

## Comparação segura (semântica de Arquitetura)
- [x] Valor comparado como literal — metacaracteres SQL não são interpretados (não há SQL; prova de literalidade).
- [x] Data por instante absoluto UTC (fuso oficial); data malformada ⇒ fail-closed (sem cast DoS).
- [x] Número validado (sem coerção de string); nulo/vazio/ausente explícitos.

## Multi-tenant
- [x] Avaliador não lê banco; isolamento vive na montagem do snapshot (4.6, sob RLS) e em `revalidarReferencias`.
- [x] Referência a recurso de outra Org ⇒ ausente do snapshot ⇒ falso.
- [x] `orgId` do snapshot é carimbo; o avaliador não autoriza por ele; nenhuma entrada aceita `orgId` do cliente.

## Escopo (AD-11)
- [x] Sem motor de disparo (4.6), sem Ações (4.5), sem encadeamento (4.7), sem trilha (4.8).
- [x] Sem migration, sem GRANT novo, guard/`ability.ts` intocado (C3 congelado).
- [x] Sem abstração especulativa: o consumidor concreto (4.6) definirá a montagem do snapshot e a persistência.

## Gates
- [x] context7-check (Prisma 6.19.3 / NestJS 11) — sem nova superfície de API na 4.4 pura.
- [x] security-check, observability-check, migration-check (N/A) registrados.
- [ ] lint / typecheck / test (integração real) / build verdes → PR.
