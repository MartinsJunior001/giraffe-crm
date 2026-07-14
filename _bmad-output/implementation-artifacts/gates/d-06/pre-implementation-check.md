# Pre-Implementation Check Report

> Gate `skills/pre-implementation-check.md` aplicado ao débito **D-06** (rate limiter transacional de
> autenticação pode retornar 500 sob rajada a `/api/auth/*`). Produzido pelo Planejador L6 em worktree
> isolado, **sem escrever código de aplicação**. Data: 2026-07-13.

## Identificacao da tarefa

Débito **D-06** — o rate limiter do Better Auth configurado com `storage: 'database'`
(`apps/api/src/kernel/auth/auth.factory.ts` §119) abre **uma transação por requisição** a `/api/auth/*`
(`incrementOne` → `_transactionWithCallback`). Sob rajada **concorrente**, as transações competem pelo
pool de conexões e parte das requisições retorna **HTTP 500** em vez de **429**. Correção pertence ao
**L6 — Hardening de staging**. Bloqueia `STAGING APPROVED`.

## Fase e etapa atual

- Fase 1 (Core MVP). Lote **L6 — Recuperação e Observabilidade** (cross-cutting P0), trilha de hardening.
- L1 fechado e `done`; Épico 2 CORE em andamento (2.1/2.2 done) em trilha paralela.
- Tarefa **liberada** como trilha independente de L6 (`l1-contratos-congelados.md` §4), **desde que** não
  haja trabalho ativo de autenticação/migration em conflito. Hoje não há. Não antecipa Fase 2.

## Objetivo

Eliminar o **500 indevido** sob rajada concorrente a `/api/auth/*`, preservando o comportamento
**fail-closed**: todo excesso recebe **429**, nenhum acesso é concedido indevidamente, o contador
permanece consistente sob concorrência e a observabilidade separa **bloqueio legítimo (429)** de **falha
interna (500)**.

## Escopo incluido

- Correção/reconfiguração do rate limiter de `/api/auth/*` para não abrir uma transação por requisição
  concorrente sob carga (uma das opções da §"Plano mínimo").
- Teste de carga **HTTP concorrente com PostgreSQL real** que reproduz a rajada (fase vermelha real).
- Observabilidade que distingue 429 de 500 no limiter.

## Fora do escopo

- **CR-09** (rate limiting de borda do `/ready`) — débito separado, Coolify-dependente. Não misturar sem
  justificativa arquitetural (restrição ratificada pelo usuário).
- **D-01/D-02** (IPs/CIDR do proxy) — configuração de borda, Coolify-dependente.
- **D-05** (agendador do `db:cleanup`) — débito separado do L6.
- Alterar o modelo de identidade/sessão, `disableSignUp`, ou o caminho de resolução de IP
  (`client-ip.ts`) — não é o defeito de D-06.
- Qualquer superfície de API pública nova.

## Documentacao consultada

- `gates/1-5/summary.md` — registro formal de D-06, realocação para o L6 e os **8 critérios de aceite**.
- `gates/1-4/summary.md` §11 — origem histórica do débito na 1.4.
- `mvp-core-triage.md`, `l1-contratos-congelados.md` §3–§4 — L6 e regra de antecipação.
- `apps/api/src/kernel/auth/auth.factory.ts` (§119 `rateLimit`) e `login-failure.service.ts` — código real
  do limiter e da coleta.
- `apps/api/package.json` — baseline de versões: `better-auth ^1.6.23`, `@prisma/client 6.19.3`,
  `@nestjs/* ^11`. **Não há `@nestjs/throttler`** no projeto.
- **Context7** (`/better-auth/better-auth`, doc de rate-limit) — confirmado: `storage` aceita
  `"memory" | "database" | "secondary-storage"`; existe `customStorage` com `get`/`set` e um método
  **atômico opcional `consume(key, {window, max}) → {allowed, retryAfter}`**; a doc marca a tabela de banco
  como **não recomendada** onde há requisito de consumo atômico. Fonte registrada; nenhuma assinatura
  inventada.

## Story e criterios de aceite

Não é Story de produto; é débito de staging com **especificação equivalente** (os 8 critérios de
`gates/1-5/summary.md`, aqui adotados como critério de conclusão):

1. Sob **N≥16** concorrentes a `/api/auth/*`, **zero 500** indevido.
2. Todo excesso recebe **429**; nenhum caminho escapa da contagem.
3. Contador **consistente** sob concorrência (sem perda/duplicação de incremento).
4. Falha do backing store segue **fail-closed** (nega, nunca concede).
5. **Sem PII** em respostas/logs do limiter.
6. **Teste HTTP concorrente com PostgreSQL real** (não mock) reproduz a rajada.
7. **Fase vermelha real** (hoje falha) + **mutação** que prova que o teste pega a regressão.
8. Observabilidade **separa 429 de 500**.

## Regras de negocio afetadas

Nenhuma regra de domínio. O débito é de **robustez/disponibilidade** da borda de autenticação. Invariantes
de isolamento/authz **não** são tocados (o defeito é fail-closed; não há concessão indevida).

## Permissoes afetadas

`PERMISSAO = ACAO + ESCOPO`: inalterado. `/api/auth/*` não passa por `@Requer`/CASL (é a borda de
autenticação, anterior ao contexto). O limiter não concede acesso — só nega mais cedo. Deny-by-default
preservado.

## Dados e entidades afetados

- **`RateLimit`** (modelo do Better Auth, `storage: 'database'`) — fonte de verdade da contagem por IP.
  Se a mitigação trocar o backing store (ex.: `secondary-storage`/Redis ou `customStorage` atômico), muda
  **onde** o contador vive; se mantiver a tabela, pode exigir índice/ajuste.
- **`LoginFailure`** — anti-abuso correlato; não é o alvo, mas compartilha a coleta (`limparExpirados`).
- Isolamento multi-tenant: `RateLimit`/`LoginFailure` são **globais** (por IP, pré-contexto) — sem `orgId`,
  fora da RLS organizacional. Não introduzir `orgId` aqui.
- Retenção/coleta: já coberta por `db:cleanup` (o **agendamento** é o D-05, não D-06).

## Arquitetura e modulos afetados

- `apps/api/src/kernel/auth/auth.factory.ts` — configuração `rateLimit`.
- Possivelmente novo `customStorage` **atômico** dentro de `kernel/auth/` (regra de negócio **não** vive no
  kernel; isto é fronteira técnica, permitido em `kernel/`).
- Se optar por `secondary-storage` (Redis): nova dependência de infra + variáveis de ambiente validadas por
  Zod (`kernel/config/env.ts`) — decisão de stack que exige registro arquitetural.
- Se mantiver banco: possível **migration** (índice) — serializar com outras migrations (uma verdade só).

## Dependencias tecnicas

- `better-auth ^1.6.23` — API de rate limit confirmada no Context7 (storage/customStorage/consume).
- `@prisma/client 6.19.3`, PostgreSQL 16 — pool de conexões é a raiz da contenção.
- **Não** adotar `@nestjs/throttler` sem decisão arquitetural (não está no projeto; duplicaria o limiter do
  Better Auth). Se for a escolha, registrar como mudança de stack.

## Skills obrigatorias para esta tarefa

- **context7-check** — **obrigatória** (feita nesta análise; refazer no início da implementação com a
  versão instalada).
- **security-check** — **obrigatória** (toca a borda de autenticação e anti-abuso).
- **observability-check** — **obrigatória** (critério 8: distinguir 429 de 500).
- **performance-check** — **obrigatória** (o débito é de comportamento sob carga concorrente).
- **migration-check** — **obrigatória se** a mitigação criar/alterar tabela ou índice.
- **backup-check** — aplicável se mudar o backing store persistente.
- **lgpd-check** — leve: garantir que IP nos logs/contadores siga a política de PII já vigente.
- **safe-implementation** — após este gate, antes de codificar.

## Riscos identificados

- **R1 — troca de store amplia escopo:** migrar para Redis introduz infra nova e ponto de falha; precisa de
  fail-closed provado (critério 4) e de decisão arquitetural. Mitigação: preferir `customStorage.consume`
  atômico sobre a mesma infra, se resolver, antes de introduzir Redis.
- **R2 — corrigir o sintoma e não a causa:** só aumentar o pool "esconde" o 500 sob carga maior. Mitigação:
  o critério exige teste concorrente **vermelho→verde** + mutação, não ausência de erro anedótica.
- **R3 — falso 429 para usuário legítimo:** endurecer demais pode negar login válido. Mitigação: critério 2
  fala de **excesso**; o teste deve provar que a requisição legítima **não** é negada indevidamente.
- **R4 — conflito com auth ativa:** coordenar com qualquer trilha que altere `/api/auth/*` ou migrations
  (`l1-contratos-congelados.md` §4).
- **R5 — vazamento de PII (IP) em log:** manter sanitização Pino já vigente (critério 5).

## Plano minimo de implementacao

Opções mutuamente comparáveis (escolher **uma** no `plan` do Spec Kit, com evidência):

1. **`customStorage` atômico** (`consume`): implementar o store de rate limit com um `consume` atômico
   (ex.: `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` numa única instrução, **sem** transação
   por requisição), preservando persistência entre restarts e réplicas. Menor mudança de infra.
2. **`secondary-storage` (Redis):** mover o contador para um store atômico em memória distribuída. Resolve
   contenção do pool, mas adiciona infra/dependência — exige decisão arquitetural + env validada.
3. **Pool + backpressure:** dimensionar o pool e adicionar backpressure/enfileiramento. Menos invasivo,
   maior risco de só empurrar o limite (ver R2) — aceitável só se o teste concorrente comprovar.

Ordem sugerida: (a) escrever o teste de carga concorrente que **falha hoje** (fase vermelha real); (b)
implementar a opção escolhida; (c) provar verde + mutação; (d) rodar security/observability/performance
checks; (e) migration-check se houver DDL.

**Não alterar:** modelo de identidade/sessão, `disableSignUp`, `client-ip.ts`, e a semântica de
`/health`/`/ready`.

## Estrategia de testes

- Teste **HTTP concorrente com PostgreSQL real** (AppModule em porta efêmera), N≥16 requisições paralelas a
  `POST /api/auth/sign-in/email` (ou rota de auth equivalente), pool restrito para reproduzir a contenção —
  a variante que ataca `/api/auth/*` que `sessao.test.ts::TS-10` originalmente exercia.
- Fase vermelha comprovada (o teste falha na config atual), depois verde após a mitigação.
- **Mutação:** desligar a mitigação e confirmar que o teste volta a falhar.
- Asserções separadas para **429** (excesso) e ausência de **500**; asserção de que a requisição legítima
  passa; asserção fail-closed quando o backing store cai.
- Escrever em **Org C** se tocar dados organizacionais (não deve tocar — `RateLimit` é global).

## Estrategia de rollback

- Config-only (opções 1/3 sem DDL): reverter é reverter o commit; sem migração de dados.
- Se adotar Redis (opção 2): rollback volta a config para o store anterior; documentar o passo operacional
  de desprovisionar o Redis. Nenhuma perda de dado de domínio (contador é efêmero por natureza).
- Se houver migration (índice): garantir `.down.sql` reversível e testado (relaciona-se ao DBT-ROLLBACK-CI).

## Decisoes pendentes

1. **Qual das três opções** de mitigação — decisão da Trilha A / Backend no `plan` do Spec Kit, com
   evidência de que fecha os 8 critérios sem ampliar escopo desnecessariamente.
2. **Adotar Redis (`secondary-storage`)?** Se sim, é **mudança de stack** — exige decisão arquitetural
   registrada (AD) e variáveis de ambiente validadas.
3. **Coordenação com CR-09:** a proteção de borda pode reduzir a pressão sobre `/api/auth/*`; decidir se
   D-06 é resolvido no app independentemente da borda (recomendado, pois CR-09 é Coolify-dependente e não
   deve bloquear o code-advanceable).

## Status final

**APROVADO COM RESSALVAS**

Justificativa: a tarefa pertence à fase/lote atual (L6), tem especificação equivalente com critérios de
aceite objetivos (8 critérios), não antecipa Fase 2, não toca regra de domínio nem invariantes de
isolamento/authz (defeito é fail-closed), e tem caminho de rollback. As **ressalvas** — que não afetam
regra de negócio, segurança-concessão, dados de domínio nem permissões, e têm mitigação documentada — são:
(a) a **escolha da opção de mitigação** e a eventual **adoção de Redis** exigem decisão arquitetural
registrada antes de codificar (não pode ser assumida); (b) **migration-check** torna-se obrigatório se
houver DDL; (c) coordenar com qualquer trilha ativa de autenticação/migration. Não há bloqueio: com essas
decisões registradas no `plan`, a implementação pode prosseguir sem retrabalho estrutural.
