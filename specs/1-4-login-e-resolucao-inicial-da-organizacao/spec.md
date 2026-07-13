# Spec — Story 1.4: Login e resolução inicial da Organização

## Contexto

A Story 1.3 entregou a propagação de contexto com uma peça deliberadamente vazia: o
`PrincipalProvider`. Hoje a única implementação (`SemSessaoPrincipalProvider`) devolve `null`, e por
isso **toda rota de domínio responde 401**. Esta Story preenche esse buraco com autenticação real.

O que ela **não** faz: mudar o guard, o resolvedor de contexto ou a RLS. A inversão de dependência da
1.3 existia exatamente para que este momento fosse uma substituição, não uma cirurgia.

## Requisitos funcionais

### Autenticação

- **FR-401** — Login por e-mail e senha, com sessão persistida no servidor.
- **FR-402** — Credenciais inválidas ⇒ rejeição **sem revelar se a conta existe** (resposta, status,
  formato **e** tempo equivalentes).
- **FR-403** — A senha **nunca** é registrada em log, erro, métrica ou resposta.
- **FR-404** — A sessão validada é a **única** fonte de identidade do `PrincipalProvider`.

### Antiabuso (gate de Segurança ratificado, G1–G6)

- **FR-405 (G2)** — Máximo de **20 solicitações** de login por **IP** em 15 min ⇒ `429` +
  `X-Retry-After`.
- **FR-406 (G1)** — Máximo de **5 falhas** por **identificador de conta** em 15 min ⇒ `429` +
  `X-Retry-After`. **Apenas falhas incrementam.**
- **FR-407 (G4)** — Login bem-sucedido limpa **somente** o contador de falhas do identificador. **Não**
  limpa o contador de IP.
- **FR-408 (G3)** — Nenhuma conta recebe **bloqueio permanente**.
- **FR-409 (G5)** — O 429 é indistinguível entre conta existente e inexistente.
- **FR-410** — O identificador é armazenado como **HMAC** de um identificador normalizado, com segredo
  de ambiente. **Nenhum e-mail bruto** em tabela, log, erro ou métrica.
- **FR-411** — O IP é derivado **apenas** do proxy confiável, configurado explicitamente por ambiente.
  `X-Forwarded-For` enviado direto pelo cliente **não** é fonte de verdade.
- **FR-412** — Os contadores sobrevivem a **restart** e são compartilhados entre **múltiplas
  instâncias** (storage no banco).
- **FR-413** — O incremento é **atômico**: falhas simultâneas não se perdem.

### Resolução inicial da Organização

- **FR-414** — Zero Membership ativa ⇒ estado autenticado **sem Organização** (não o Dashboard).
- **FR-415** — Exatamente uma Membership ativa ⇒ contexto selecionado.
- **FR-416** — Múltiplas ⇒ **escolha explícita**; nunca escolha silenciosa.
- **FR-417** — Organização suspensa/removida/inacessível ⇒ **não selecionável**; o contexto é limpo e
  nova seleção é exigida.
- **FR-418** — O cliente **não** define arbitrariamente o `activeOrganizationId`: ele é um **pedido**,
  conferido contra a Membership ativa (é o `OrgContextResolver` da 1.3 que decide).

## Critérios de sucesso

- **SC-401** — Login válido + Membership ativa ⇒ 200 e contexto da Organização permitida.
- **SC-402** — Senha errada e conta inexistente produzem resposta **idêntica** (corpo, status, e tempo
  na mesma ordem de grandeza).
- **SC-403** — A 6ª falha no mesmo identificador, dentro da janela, ⇒ 429 — **mesmo com a senha
  correta**.
- **SC-404** — A 21ª solicitação do mesmo IP ⇒ 429, **mesmo variando o identificador**.
- **SC-405** — Após sucesso, o contador do identificador zera; o do IP **não**.
- **SC-406** — Um atacante que estoure o G1 no e-mail de uma vítima **não** a impede de entrar depois
  que a janela expira (sem bloqueio permanente).
- **SC-407** — `X-Forwarded-For` forjado pelo cliente **não** contorna o G2.
- **SC-408** — Reiniciar o processo **não** zera os contadores.
- **SC-409** — Duas instâncias apontando ao mesmo banco compartilham o limite.
- **SC-410** — Nenhum e-mail em claro na tabela de contadores, nos logs ou nas métricas.
- **SC-411** — 5 falhas simultâneas contam 5 (sem *lost update*).
- **SC-412** — Sessão inválida/expirada ⇒ o `PrincipalProvider` devolve `null` ⇒ 401.
- **SC-413** — Conta com 0 / 1 / N Organizações ativas resolve conforme FR-414/415/416.
- **SC-414** — Membership `SUSPENDED`/`REMOVED` não concede contexto (já garantido pela 1.3; aqui é
  regressão).
- **SC-415** — Pedir Organização alheia ⇒ 403 (já garantido pela 1.3; aqui é regressão).

## Fora do escopo

Logout e proteção de rotas (1.5); troca posterior de Organização (1.9); recuperação de senha e
verificação de e-mail (1.10) — **incluindo as regras de rate limit dessas rotas**, que pertencem às
Stories responsáveis (G6). Matriz de permissões por papel (1.6).

## Edge cases

- Identificador com espaços/maiúsculas (`  ANA@Exemplo.TEST `) deve normalizar para a **mesma** chave
  de contador que `ana@exemplo.test` — senão o G1 é contornável só mudando a capitalização.
- Rotação do segredo do HMAC não pode zerar silenciosamente todos os contadores (ver `plan.md`, D6).
- Conta existente **sem** credencial (ex.: criada por seed) não pode vazar essa condição no erro.
- Janela expirada durante uma rajada concorrente.
