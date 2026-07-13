# Quebras de linha (EOL) — defeito encontrado, reproduzido e corrigido

Story 1.3 · 2026-07-12 · Status: **CORRIGIDO**

Este achado não estava no escopo da Story. Ele apareceu porque um gate ficou vermelho, e a causa
real era pior do que o gate indicava.

## Como apareceu

Ao rodar a bateria de gates da Story:

```
$ pnpm format:check
[warn] Code style issues found in 47 files.
```

47 arquivos — incluindo `.prettierrc.json` e `apps/api/test/rls.test.ts`, que estão **commitados** e
estavam verdes na Story 1.2. Quando um gate reprova arquivos que ninguém tocou, a hipótese "o código
está mal formatado" é a errada.

## Diagnóstico

O conteúdo estava impecável. Isolando a variável:

```
$ cp apps/api/src/main.ts /tmp/main-crlf.ts
$ tr -d '\r' < apps/api/src/main.ts > /tmp/main-lf.ts

$ prettier --config .prettierrc.json --check /tmp/main-crlf.ts
[warn] main-crlf.ts                    ← reprovado

$ prettier --config .prettierrc.json --check /tmp/main-lf.ts
All matched files use Prettier code style!   ← aprovado
```

A **única** diferença é a quebra de linha. Causa:

- `core.autocrlf=true` (padrão do Git for Windows) → o checkout materializa **CRLF** no disco;
- o repositório **não tinha `.gitattributes`** → nada contradizia essa configuração local;
- o Prettier usa `endOfLine: "lf"` por padrão → reprova CRLF.

Os blobs no repositório sempre estiveram em LF. O que produzia CRLF era o *checkout*.

## O que isso realmente significava

Um gate vermelho por motivo alheio ao código é ruim por si só: ele deixa de significar "o código
está formatado" e passa a significar "você clonou no sistema certo". A reação natural da equipe a um
gate assim é aprender a ignorá-lo — que é o pior hábito possível num projeto governado por gates.

Mas a consequência séria era outra: **`docker/db/init/01-roles.sh` é executado dentro do container
Postgres**, e estava em CRLF no working tree. Isso não foi deduzido — foi reproduzido:

```
$ sed -i 's/$/\r/' docker/db/init/01-roles.sh    # reintroduz CRLF
$ docker compose down -v && docker compose up -d db

db-1 | /usr/local/bin/docker-entrypoint.sh: running /docker-entrypoint-initdb.d/01-roles.sh
db-1 | /usr/local/bin/docker-entrypoint.sh: /docker-entrypoint-initdb.d/01-roles.sh:
       /bin/bash^M: bad interpreter: No such file or directory

$ docker compose ps
service "db" is not running
```

O container do banco **morre no boot**. Os papéis `giraffe_migrator` e `giraffe_app` nunca são
criados. Um desenvolvedor que clonasse o repositório no Windows e rodasse `pnpm compose:up` receberia
um banco morto, sem nenhuma pista de que a causa é um caractere invisível.

E o CI **nunca acusaria**: ele roda em Linux, onde `autocrlf` é `false` e o arquivo chega em LF. É a
classe de bug que só existe na máquina de quem acabou de entrar no time — exatamente o lugar onde
ninguém tem contexto para diagnosticá-lo.

## Correção

`.gitattributes` na raiz, com `* text=auto eol=lf`:

- `text=auto` deixa o Git detectar binários sozinho;
- `eol=lf` garante LF **no working tree** mesmo com `autocrlf=true`, porque o `.gitattributes` tem
  precedência sobre a configuração local do desenvolvedor.

A alternativa — pedir a cada dev que ajuste seu `core.autocrlf` — conserta uma máquina e deixa a
armadilha armada para todas as outras. O `.gitattributes` viaja com o repositório.

Os 127 arquivos do working tree foram normalizados para LF. **Nenhuma mudança de conteúdo**: como os
blobs já eram LF, `git diff HEAD` não registra nenhum dos 127 — só as edições reais da Story.

## Verificação após a correção

| Verificação                                        | Resultado |
| -------------------------------------------------- | --------- |
| `pnpm format:check`                                 | exit 0    |
| `01-roles.sh` em LF, volume novo → papéis criados   | `giraffe_migrator`, `giraffe_app` |
| `docker compose up` do zero → db/api/web            | 3× healthy |
| `git diff HEAD` após normalizar 127 arquivos        | 0 arquivos de conteúdo alterado |
