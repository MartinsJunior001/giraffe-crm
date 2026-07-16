# Checklist de requisitos — Story 3.3

## Funcional
- [ ] Montar (obter/adicionar/reordenar) Campo no contexto DATABASE, catálogo canônico dos 12 tipos.
- [ ] Ler não cria; adicionar o 1º Campo materializa o Form.
- [ ] Evoluir Campo (editar/arquivar/restaurar; opções de Seleção) no contexto DATABASE.
- [ ] Publicar/despublicar/ler estado e versão; snapshot imutável.
- [ ] Contexto DATABASE identificado no payload (context + databaseId).

## Segurança / isolamento
- [ ] RLS prova isolamento por Org (Form/Field/FormVersion do contexto DATABASE).
- [ ] CHECK de coerência: DATABASE exige databaseId; pipeId/phaseId NULL (fase vermelha).
- [ ] FormVersion sem UPDATE/DELETE (permission denied) — imutabilidade do banco.
- [ ] `orgId`/`databaseId` do cliente nunca confiados; owner cross-tenant/cross-database → 404.
- [ ] Só 12 tipos canônicos; `typeConfig` sob allowlist (sem injeção/tipo arbitrário).

## Autorização (guard C3 congelado)
- [ ] Gerenciar Database (Admin da Org / Admin do Database) monta/evolui/publica.
- [ ] MEMBER/VIEWER do Database só leem o schema (403 ao mutar).
- [ ] Sem acesso ao Database → 404 não-enumerante.
- [ ] `ability.ts`/`authz.guard.ts` não tocados.

## Escopo (não antecipar)
- [ ] Sem rota de criação de Registro/`Novo Registro`/submissão (3.4).
- [ ] Campo Arquivo gated (montar ok; publicar gated AD-28).
- [ ] Sem GRANT/coluna nova além de `Form.databaseId`.

## Regressão
- [ ] Suíte de 2.4/2.5/2.6/2.15 (Formulário inicial/de Fase) verde após a generalização.
- [ ] SC-206 (deploy → rollback → reapply) verde.
