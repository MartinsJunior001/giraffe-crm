---
story_key: tech-d01-hop-web-api-autenticado
epic: tech
status: backlog
release: L6 / Staging (débito D-01)
risco: ALTO
origem: Decisão do dono 2026-07-17 — ao adotar o padrão nativo do Coolify (sem rede customizada, sem IP fixo da Web), a confiança da API não pode mais depender de um endereço estático em `TRUSTED_PROXY_IPS`. Esta tech story substitui essa dependência por um hop Web→API autenticado, compatível com rede dinâmica.
---

# Tech Story D-01 — Hop Web→API autenticado (substituir a dependência de IP estático)

**As a** plataforma atrás do proxy do Coolify (rede gerenciada, IP de container dinâmico),
**I want** que a API estabeleça a confiança no peer Web por uma prova criptográfica por requisição, não por um IP fixo,
**So that** o G2 (rate limit por IP real do cliente) e a resolução de IP permaneçam corretos sem depender de um endereço que muda a cada redeploy, e sem confiar cegamente no `X-Forwarded-For`.

## Contexto e motivação

No padrão nativo do Coolify (decisão 2026-07-17) não há rede customizada nem IP fixo da Web — o
container muda de endereço a cada recriação. O desenho anterior (D-01 via `TRUSTED_PROXY_IPS` = IP
estático da Web) deixa de ser durável. Sem substituto, restariam duas saídas ruins: (a) confiar
cegamente no `X-Forwarded-For` (qualquer container comprometido forja o IP do cliente → G2 colapsa
ou é envenenado), ou (b) usar o IP do socket (a Web), colapsando o rate limit por IP num balde
único. A solução é o hop **autenticado**: a Web assina, por requisição, um cabeçalho interno que a
API verifica antes de aceitar qualquer `X-Forwarded-For`.

## Escopo

**Dentro:**
- **Cabeçalho interno assinado (HMAC)** emitido pela Web em cada chamada BFF→API, cobrindo, no
  mínimo: um **timestamp** (janela curta de validade), o **IP do cliente já validado pela Web**
  (última entrada do XFF anexada pelo Traefik) e **dados da requisição** (ex.: método + caminho)
  para amarrar a assinatura àquela chamada e barrar replay cruzado.
- **Verificação server-side na API**: rejeita (401/403, fail-closed) requisição com cabeçalho
  **ausente**, **expirado** (fora da janela), **com assinatura inválida** ou **replay** (timestamp
  reusado além da janela / nonce repetido).
- **Segredo separado** do `BETTER_AUTH_SECRET`/`LOGIN_HMAC_SECRET`, **rotacionável** (suporte a
  chave anterior durante a janela de sobreposição, como o HMAC de login já faz), **nunca exposto ao
  browser** (variável de servidor da Web + variável da API; jamais `NEXT_PUBLIC_`).
- Uma vez confiável o peer pela assinatura, a API usa o **IP do cliente carregado no cabeçalho
  assinado** como IP real (para o G2), tornando `TRUSTED_PROXY_IPS` por IP estático dispensável no
  caminho Web→API.

**Fora:**
- Autenticação de usuário (é o Better Auth, já existente) — este hop é **serviço→serviço**.
- mTLS / malha de serviço (custo desproporcional à Fase 1; reavaliar se o cenário crescer).
- Alterar o canal público (o endpoint público continua com sua própria proteção antiabuso).

## Critérios de aceite

- **AC1:** Given uma chamada BFF→API com cabeçalho interno **válido** (assinatura correta, dentro da
  janela) When a API a processa Then aceita e usa o IP do cliente do cabeçalho como IP real (G2).
- **AC2:** Given uma chamada **sem** o cabeçalho interno When chega à API por qualquer caminho Then
  é rejeitada (fail-closed) — nenhuma rota interna confia em `X-Forwarded-For` sem a assinatura.
- **AC3 (XFF forjado):** Given um cliente/container que injeta um `X-Forwarded-For` arbitrário **sem**
  a assinatura válida When atinge a API Then o header é ignorado/rejeitado — não envenena o G2.
- **AC4 (chamada direta):** Given uma chamada direta à API (contornando a Web) sem o cabeçalho
  assinado When recebida Then é rejeitada.
- **AC5 (replay):** Given uma requisição assinada **capturada e reenviada** fora da janela (ou com
  timestamp/nonce reusado) When reenviada Then é rejeitada.
- **AC6 (rotação):** Given a rotação do segredo com janela de sobreposição When ambas as chaves estão
  ativas Then requisições assinadas por qualquer uma das duas são aceitas; fora da janela, só a atual.
- **AC7:** Given o segredo When qualquer artefato de cliente (bundle do browser, resposta HTTP) é
  inspecionado Then o segredo **não** aparece (nunca `NEXT_PUBLIC_`; nunca em log — redaction).

## Gates obrigatórios

- **Regressão de segurança obrigatória** cobrindo: **XFF forjado**, **chamada direta** à API e
  **replay** (os três acima) — em teste de integração real, não mock.
- **Revisão de Segurança + Rede antes do merge** (exigência explícita do dono).
- context7-check da lib de HMAC/crypto usada (reusar `node:crypto`, como o evento canônico 2.16 e o
  HMAC de login já fazem — sem dependência nova, se possível).
- security-check, observability-check (segredo fora de log), lgpd-check (N/A — sem PII nova).

## Dependências e sequência

- **Depende de:** o padrão nativo do Coolify já no ar (esta é a razão de existir do débito).
- **Bloqueia:** o veredito final de staging (o D-01 precisa fechar antes de "STAGING APPROVED").
- **Relaciona:** `kernel/auth/client-ip.ts` (resolução de IP atual), rotação do HMAC de login
  (`docs/04-operacao/rotacao-do-segredo-hmac.md`) como precedente de rotação.

## Notas

Débito aberto por decisão do dono em 2026-07-17, ao rejeitar a topologia multi-rede (PR #84,
supersedido) em favor do padrão nativo documentado do Coolify. O risco residual aceito no compose
(proxy com conectividade de rede até db/api, sem rota pública) está documentado no
`docker-compose.yml`; este hop fecha a lacuna de confiança do caminho Web→API que o IP fixo cobria.
