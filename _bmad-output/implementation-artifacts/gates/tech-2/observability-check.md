# observability-check — tech-2 (provisionamento de tenant)

## Superfície
Rotina de ops (`.mjs`) executada deliberadamente pelo operador. **Sem** código de runtime HTTP, **sem**
alteração de probes (`/health`, `/ready`, `/healthz`), **sem** logger da aplicação (Pino).

## Verificações
- **Saída sanitizada:** a rotina imprime só um resumo — slug, `orgId`, e-mail **mascarado**, e o objeto
  `criou`. **Nunca** a senha (salvo a gerada, mostrada UMA vez ao operador, com aviso), o hash ou a
  `DATABASE_URL`.
- **Erros acionáveis e sem segredo:** falhas citam nome de variável/comprimento, nunca valores
  (`MIGRATION_DATABASE_URL ausente`, `adminSenha curta demais (mínimo 12)`).
- **Distinção operador × automação:** a rotina é de ops (não emite telemetria de aplicação); seu
  resultado é observável pelo próprio operador que a executa.
- **Sondas inalteradas.** Nenhum probe é tocado.

## Veredito
**N/A / APROVADO** — sem superfície de observabilidade de runtime; saída e erros da rotina são
sanitizados (sem senha/hash/DSN; e-mail mascarado).
