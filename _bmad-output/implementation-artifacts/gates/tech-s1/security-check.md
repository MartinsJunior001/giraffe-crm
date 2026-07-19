# Security Check — TECH-S1 (hardening de cabeçalhos de borda)

Base `origin/main` `3032702`. Diff: `apps/web/{next.config.ts,proxy.ts,lib/cabecalhos-seguranca.ts,test/…}`
+ `scripts/smoke.mjs` + documentação. Evidência de execução: `evidencia-execucao.md`.

## Etapa 1 — Superfície de ataque

| Pergunta | Resposta |
|---|---|
| Quem acessa | qualquer visitante — a Web é a borda pública, e o `matcher` agora cobre também rota não autenticada (`/`, `/login`) |
| Endpoints envolvidos | nenhum novo. O proxy passa a **decorar** respostas de rotas que já existiam |
| Dados recebidos | apenas cabeçalhos já presentes na requisição (`x-forwarded-proto`, `cookie`) |
| Dados retornados | apenas cabeçalhos de política. **Nenhum dado de negócio, de tenant ou de sessão** |
| Recursos alterados | nenhum. Sem escrita, sem banco, sem arquivo, sem estado |
| Permissões exigidas | nenhuma nova. `ability.ts`/CASL **não tocados** |
| Dados pessoais tratados | nenhum |

## Etapa 2 — Classificação de risco

**Médio.** Não cria caminho de dado nem de autorização (o que puxaria para alto/crítico), mas
**altera o alcance de um componente que participa do fluxo de sessão** (`proxy.ts`) — e uma CSP mal
posta pode negar serviço à própria aplicação. É por isso que a validação foi empírica, em runtime de
produção e em browser real, e não só por teste unitário.

## Etapa 3 — Ameaças relevantes (STRIDE aplicável)

| Ameaça | Antes | Depois |
|---|---|---|
| **XSS / injeção de script** | nada impedia execução de inline injetado | CSP enforcing com nonce por requisição + `strict-dynamic`; **sem `unsafe-inline`, sem `unsafe-eval`** |
| **Clickjacking** | página emoldurável | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| **MIME sniffing** | conteúdo podia ser reinterpretado | `nosniff` em toda resposta, inclusive assets |
| **Exfiltração por formulário injetado** | POST podia apontar para fora | `form-action 'self'` |
| **Sequestro de caminho relativo** | `<base>` injetado reescreveria URLs | `base-uri 'self'` |
| **Vazamento de path por Referer** | path completo ia para terceiros | `strict-origin-when-cross-origin` |
| **Downgrade para HTTP** | sem HSTS | HSTS sobre HTTPS (alcance deliberadamente limitado) |
| **Reconhecimento de stack** | `X-Powered-By: Next.js` | removido |

## Etapa 4 — Verificações específicas desta base

- **Isolamento multi-tenant:** não tocado. Nenhuma query, nenhum `orgId`, nenhum contexto de
  Organização. RLS/GRANT intocados — a Story não abre migration.
- **Negação por padrão:** a CSP é allowlist explícita (`default-src 'self'`); o que não está
  listado é negado. `object-src 'none'` fecha `<object>`/`<embed>`.
- **Autorização preservada:** `decidirAcesso` continua governando o redirect; o `matcher` ampliou o
  alcance da **decoração**, não o da **proteção**. Provado por teste (rota pública sem cookie não é
  redirecionada) e em runtime (`/painel` sem sessão → 307).
- **Sessão:** o deslize do cookie continua condicionado a `rotaExigeSessao`. O risco real que isso
  fecha — o proxy re-emitir no `/logout` o cookie que o handler apaga — tem teste dedicado e **fase
  vermelha provada**.
- **Segredos:** nenhum lido, escrito ou logado. O nonce não é segredo persistente (vale uma
  resposta) e não vai para log.
- **Entrada externa:** `x-forwarded-proto` é o único input novo. É *client-controllable* quando não
  há proxy à frente; o pior efeito possível é o cliente induzir um HSTS **para si mesmo**. Nenhuma
  decisão de autorização, sessão ou dado depende dele. Aceito e documentado.
- **Dependências:** nenhuma adicionada. `package.json`/lockfile inalterados.
- **Falha segura:** a política é estática e sem I/O — não há caminho de erro que a desligue
  silenciosamente. Não existe flag que remova a CSP em runtime.

## Etapa 5 — Cláusula de `unsafe-inline` do gate

**Não aplicável: `unsafe-inline` não existe em nenhuma diretiva.** O `next/font` e o Tailwind
recebem o nonce do framework (verificado no HTML servido), então nem `style-src` precisou dele.
Se um consumidor futuro exigir estilo inline, a regra do gate continua valendo: restrito à diretiva,
justificado, com débito de nonce/hash e revisão de segurança.

## Riscos residuais (aceitos, com dono)

1. **`'strict-dynamic'` ignora a allowlist em browsers que a implementam** — é o comportamento
   pretendido; browsers antigos caem no `'self'`. Aceito.
2. **HSTS sem `includeSubDomains`/`preload`** — proteção menor por escolha consciente
   (`DEB-S1-HSTS-SUBDOMAINS`); ampliar exige inventário de domínios de Infra/Ops.
3. **Sem coletor de violações de CSP** — não há `report-uri`/`report-to`; violações em produção não
   serão visíveis. Exige endpoint e decisão de Ops. Não bloqueia esta entrega.
4. **Borda de infra (Traefik) sem cabeçalhos próprios** — esta Story resolve no origin. Defesa em
   profundidade na camada de proxy fica com Ops, ao lado de R1 e M1.

## Veredito

**APROVADO.** Nenhum acesso não autorizado, nenhuma quebra de isolamento, nenhuma exposição de dado
ou credencial, nenhuma dependência nova. A mudança **reduz** superfície de ataque e as ameaças que
ela endereça estão provadas por execução, não por leitura de código.
