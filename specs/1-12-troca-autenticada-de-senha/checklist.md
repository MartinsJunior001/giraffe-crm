# Checklist de aceite — Story 1.12

## D-1 (step-up + política)
- [x] Reautenticação reusa Better Auth (`verifyPassword`), sem sessão nova nem 2º sistema de auth.
- [x] Estado de step-up server-side, ligado a Account+sessão, nunca em log.
- [x] Janela de 10 min; ausente/expirado → 403 `STEP_UP_REQUIRED`.
- [x] Senha atual incorreta → 401 não-enumerante (sem revelar que foi a senha).
- [x] Rate limit reusa `RateLimiter.contar`; ≤5 falhas (Account+IP)/15min → 429. Sem duplicação.
- [x] Política: min 15 / max 128; frases-senha e espaços; sem mistura de classes; rejeição local de
      senha comum; sem troca periódica; não invalida senhas existentes; validador único.

## Troca (FR-6)
- [x] Após step-up válido, valida nova senha pela política central.
- [x] Troca só a própria Account.
- [x] Preserva a sessão atual; revoga todas as demais (prova de contagem em teste).
- [x] Invalida recuperação pendente (convenção real do Better Auth; só do titular).
- [x] Emite notificação de segurança (porta + adapter de LOG).
- [x] Registra auditoria sanitizada (sem senha/hash/token).

## Segurança / invariantes
- [x] NUNCA senha/hash/token em log/evento/resposta (provado por captura de stdout).
- [x] Escrita em entidades globais pela fronteira do GRANT (sem RLS); sem novo GRANT.
- [x] Sem migration (menor mudança correta).
- [x] Guard/CASL não tocados (C3 congelado); rotas globais dispensadas de contexto mas autenticadas.

## Gates
- [x] typecheck / lint / format:check verdes.
- [x] Suíte da API (`test:ci`, serial) verde. 29 testes novos (12 unit + 17 integração).

## Contratos parciais reportados à Lane 0
- [~] Recuperação (1.10) não fiada: invalidação REAL sobre o store REAL, 0 linhas hoje. Reconciliado,
      não fingido.
- [~] Notificação E5/1.13 em backlog: adapter de LOG observável (não finge entrega).
