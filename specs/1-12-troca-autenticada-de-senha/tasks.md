# Tasks — Story 1.12

- [x] T1 — Gate documental (context7-check) Better Auth 1.6.23: verifyPassword, changePassword,
      $context.password.hash, revogação de sessão, convenção de reset-password. (MCP Context7 + fonte.)
- [x] T2 — Política de senha central pura (`password-policy.ts` + `senhas-comuns.ts`): 15..128, sem
      classes, frases-senha, rejeição local de comum. Unit test dos limites 14/15/128/129 + comum.
- [x] T3 — Porta + adapter de notificação de segurança (LOG observável).
- [x] T4 — `StepUpService`: sessão atual (Better Auth), reautenticação (verifyPassword), selo/leitura/
      consumo da janela em `AuthVerification`, rate limit por (Account+IP) via `RateLimiter.contar`.
- [x] T5 — `PasswordChangeService`: gate step-up → política → hash (BA) → transação atômica (troca
      credencial + revoga demais sessões + invalida recuperação + consome janela) → notificação →
      auditoria sanitizada.
- [x] T6 — DTO fail-closed + `PasswordController` (`POST /me/step-up`, `PUT /me/password`), mapeamento
      401/429/403/400. Wiring no `AuthModule`.
- [x] T7 — Testes de integração (HTTP+Postgres+Better Auth reais): gate válido/ausente/expirado/uso
      único; senha incorreta não-enumerante; rate limit 429; política 14/15/128/129 e comum via HTTP;
      preservação da sessão atual + revogação das demais (prova de contagem); invalidação de recuperação
      só do titular; notificação emitida (spy) e em LOG; auditoria sanitizada sem senha/token.
- [x] T8 — Gates locais: typecheck, lint, format:check, suíte da API (`test:ci`) verde.
- [ ] T9 — commit-check → commits atômicos pt-BR → push → PR (base main). (Lane 0 faz merge/closure.)
