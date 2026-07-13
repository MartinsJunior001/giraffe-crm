# observability-check — Story 1.5

Gate obrigatório. Data: 2026-07-13. Verificado contra o código real.

## O que a 1.5 altera na observabilidade

Pouco, e de propósito: a 1.5 não introduz novo domínio de eventos — reusa o pipeline de log estruturado
(Pino) e os eventos já emitidos na 1.3/1.4. O foco do gate é garantir que **nada regrediu** e que os
novos caminhos (relay de cookie no BFF, proteção de rota) **não vazam** e **permanecem observáveis**.

| # | Aspecto | Estado | Evidência |
|---|---|---|---|
| O1 | **Redaction de segredos mantida** | ✅ | `authorization`/`cookie`/`set-cookie` redigidos; **TS-11** captura o log real de login/uso/logout e prova que o token de sessão não aparece. |
| O2 | **Negação de contexto observável** | ✅ | O 403 de Membership suspensa/removida (AC2) passa pelo `OrgContextResolver`, que já emite `context.denied` com motivo (visto no log do TS-11 run: `event:context.denied … motivo:"nenhuma Membership ativa"`). Um 403 mudo seria um ataque invisível. |
| O3 | **Sessão expirada/401 rastreável** | ✅ | O guard nega (401) e o request completa com status logado; sem payload sensível. |
| O4 | **Probes sem ruído** | ✅ | `/health`/`/ready`/`/healthz` seguem suprimidos do autoLogging (inalterado). |
| O5 | **BFF/Web — erros sanitizados** | ✅ | `lib/auth.ts` converte falha de rede em `indisponivel` sem logar stack/URL interna; a página degrada honestamente. Nenhum `console.log` de cookie/segredo nas rotas/páginas novas. |
| O6 | **Sem PII nova em log** | ✅ | Nenhum e-mail em claro; o token não é logado (O1). O `activeOrganizationId` é id, não PII. |

## Lacuna conhecida (aceitável no MVP; registrada)

- **Evento de logout não é um evento de domínio próprio.** O sign-out aparece como um `request completed`
  do Better Auth, não como um `auth.logout` semântico. Para o MVP é suficiente (a revogação é provada por
  teste). Se a auditoria de sessão exigir trilha semântica de logout, entra como refinamento (WAVE 2 /
  Épico 8 auditoria) — **não** antecipar escopo agora.
- **D-06** (rate limiter transacional pode 500 sob rajada) precisa de **alerta** no staging (débito de
  observabilidade já registrado em `mutation-evidence.md`), para que um pico de 500 em `/api/auth/*` seja
  visível.

## Veredito

**APROVADO.** Redaction e observabilidade da negação mantidas e provadas; nenhum vazamento novo nos
caminhos da 1.5. Lacunas registradas como refinamento/staging, sem bloquear a Story.
