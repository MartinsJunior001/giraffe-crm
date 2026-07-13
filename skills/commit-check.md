# commit-check

## 1. Finalidade

A skill `commit-check` é o **gate obrigatório imediatamente anterior a qualquer
commit** do Giraffe CRM. Ela existe porque o commit é o momento em que o trabalho
deixa de ser local e passa a ser história compartilhada: um segredo, um artefato de
build ou uma entrega incompleta que atravessa este ponto custa muito mais caro
depois.

Esta skill deve identificar e bloquear:

- segredo, credencial ou `.env` real prestes a ser versionado;
- artefato de build, cache ou arquivo temporário no staging;
- binário grande ou inesperado;
- lockfile dessincronizado do `package.json`;
- gate vermelho (lint, format, typecheck, teste, build);
- trabalho parcial, bloqueado ou sem alteração versionável;
- commit misturando assuntos não relacionados;
- mensagem de commit fora do padrão do repositório;
- push, merge, deploy ou troca de branch não autorizados;
- divergência entre o que foi entregue e o escopo declarado da Story.

## 2. Quando usar

Aplicar **depois** de `code-review` e **antes** de qualquer `git commit`.

Esta skill é obrigatória sempre que houver intenção de commit, sem exceção,
inclusive em commits de documentação, tooling ou correção pontual.

Sequência recomendada:

1. `pre-implementation-check.md`;
2. `safe-implementation.md`;
3. `code-review.md`;
4. `security-check.md`;
5. `observability-check.md`;
6. checks adicionais aplicáveis (`lgpd`, `migration`, `backup`, `performance`);
7. `commit-check.md`;
8. skill `commit` — **somente** com `APPROVED FOR COMMIT`.

## 3. Regra principal

Nenhum trabalho deve ser considerado pronto para commit apenas porque:

- "está funcionando na minha máquina";
- os testes foram escritos (mas não executados);
- o código foi revisado (mas os gates não foram reexecutados);
- "é só documentação";
- "é um arquivo pequeno";
- "depois eu limpo";
- "o `.gitignore` deve estar cobrindo isso";
- a Story foi aprovada no Code Review.

**Evidência de execução real, nunca afirmação** (Constitution X).

## 4. Automatização por seção versionável

> Ao concluir uma seção, etapa ou Story que tenha produzido uma entrega
> versionável, execute automaticamente o `commit-check`. Somente com
> `APPROVED FOR COMMIT`, execute a skill `commit`. Não crie commit para trabalho
> parcial, bloqueado, com gates vermelhos ou sem alteração versionável. Nunca
> execute push, merge, deploy ou mudança de branch sem autorização explícita.

**"Seção" significa uma unidade de entrega concluída e versionável** — uma Story,
uma etapa fechada de um workflow, um gate de governança implementado. **Não**
significa cada subtítulo, mensagem, checkpoint intermediário ou arquivo salvo.

Não commitar quando:

- o trabalho está no meio de uma tarefa;
- há gate vermelho;
- há finding `CRITICAL` ou `HIGH` em aberto;
- o working tree não tem alteração versionável (só cache, build ou temporário);
- a alteração é experimental e será descartada.

## 5. Processo obrigatório

### Etapa 1 — Situar o repositório

Executar e registrar a saída real:

```bash
git branch --show-current
git status --short
git diff --stat
git diff --cached --stat
git ls-files --others --exclude-standard
git log --oneline -10
```

Confirmar:

- a branch é a esperada para a entrega (nunca commitar direto em `main` sem
  autorização explícita);
- o `HEAD` é o esperado;
- o padrão de mensagens do repositório foi observado no `git log`.

### Etapa 2 — Classificar o escopo da entrega

Enquadrar a alteração como:

- **Aplicação:** código de produto, testes, configuração de build/runtime.
- **Processo:** artefatos BMAD, Spec Kit, documentação de governança.
- **Tooling:** guias de agente, definições de skill, configuração de ferramenta.
- **Misto:** exige agrupamento em commits atômicos separados (ver Etapa 6).

Confirmar que o entregue corresponde ao escopo declarado da Story — nem a menos
(entrega parcial) nem a mais (escopo antecipado, proibido pela Constitution II).

### Etapa 3 — Higiene do working tree

Verificar **todo** arquivo untracked, não apenas os que serão adicionados. Um
arquivo fora do `.gitignore` hoje entra no commit de alguém amanhã.

Comandos úteis:

```bash
git ls-files --others --exclude-standard          # o que NÃO está ignorado
git check-ignore -v <caminho>                     # por que algo está ignorado
git diff --cached --name-only                     # o que exatamente vai no commit
```

### Etapa 4 — Gates de qualidade

Reexecutar, com evidência real (nunca aceitar resultado de rodada anterior quando
o código mudou depois dela):

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Quando a entrega tocar containers, execução ou deploy, executar também o ciclo
completo:

```bash
docker compose config
docker compose build
docker compose up -d
docker compose ps          # api e web devem ficar healthy
pnpm smoke
docker compose down
```

Qualquer gate vermelho é **bloqueio automático**.

### Etapa 5 — Salvaguardas de conteúdo

Inspecionar o diff que efetivamente será commitado, não o working tree inteiro.

### Etapa 6 — Agrupar em commits atômicos

Um commit deve contar **uma história só**. Separar por natureza:

- `feat` / `fix` / `refactor` / `test` — código da aplicação;
- `docs` — documentação e artefatos de processo;
- `chore` / `build` / `ci` — tooling, dependências, infraestrutura de repositório.

Se o working tree mistura assuntos, propor a divisão ao usuário **antes** de
qualquer `git add`, e confirmar o conteúdo de cada grupo com
`git diff --cached --name-only` antes de commitar.

## 6. Checklist de verificação

### Branch e estado

[ ] A branch atual é a correta para a entrega.
[ ] Não é `main` (ou há autorização explícita para commitar nela).
[ ] O `HEAD` é o esperado.
[ ] Não existe rebase, merge ou cherry-pick em andamento.
[ ] O padrão de mensagens do repositório foi identificado no `git log`.

### Escopo

[ ] A entrega está concluída, não parcial.
[ ] O que foi implementado corresponde ao escopo da Story.
[ ] Não há escopo antecipado (Constitution II).
[ ] Não há código morto, comentado ou de depuração esquecido.
[ ] Não há `TODO`/`FIXME` introduzido sem registro em backlog.
[ ] Não há alteração acidental em artefato autoritativo (PRD, UX, Architecture
Spine, épicos, roadmap, Constitution).

### Segredos e credenciais

[ ] Nenhum `.env` real está no staging (apenas `.env.example`).
[ ] `.env` e variantes estão cobertos pelo `.gitignore`.
[ ] O `.env.example` não contém valor sensível real.
[ ] Nenhuma chave privada, certificado ou token no diff.
[ ] Nenhuma string tipo `api_key=`, `secret=`, `password=`, `AWS_SECRET`.
[ ] Nenhuma credencial hardcoded em código, teste, fixture ou comentário.
[ ] Nenhuma URL com credencial embutida.
[ ] Nenhum segredo em arquivo de configuração de container ou Compose.

Se um segredo já foi commitado, removê-lo do arquivo **não é suficiente**: ele
deve ser **revogado e rotacionado**.

### Artefatos de build, cache e temporários

[ ] Nenhum `node_modules/`.
[ ] Nenhum `dist/`, `build/`, `out/`.
[ ] Nenhum `.next/`.
[ ] Nenhum `coverage/`.
[ ] Nenhum `*.tsbuildinfo` (cache incremental do TS).
[ ] Nenhum `*.log`.
[ ] Nenhum arquivo temporário, backup (`*.bak`, `*.orig`, `*~`) ou de editor.
[ ] Nenhum artefato de sistema operacional (`.DS_Store`, `Thumbs.db`).
[ ] Nenhum arquivo gerado por ferramenta que deveria ser reproduzível localmente.
[ ] O `.gitignore` cobre os padrões acima — corrigir o `.gitignore` é preferível a
apenas omitir o arquivo do `git add`.

### Arquivos grandes e binários

[ ] Nenhum arquivo acima de 5 MB sem justificativa explícita.
[ ] Nenhum binário inesperado (executável, imagem de disco, dump, arquivo compactado).
[ ] Assets versionados são realmente necessários ao produto.
[ ] Nenhum dump de banco, backup ou export de dados reais.

### Lockfiles e dependências

[ ] O lockfile está presente e é único (`pnpm-lock.yaml`).
[ ] O lockfile está sincronizado — `pnpm install --frozen-lockfile` passa.
[ ] Toda dependência nova está declarada no `package.json` correto (sem
dependência fantasma herdada do workspace raiz).
[ ] Nenhuma dependência nova entrou sem justificativa.
[ ] Nenhuma versão `latest` ou range aberto indevido.

### Gates de qualidade

[ ] `pnpm install --frozen-lockfile` — exit 0.
[ ] `pnpm format:check` — exit 0.
[ ] `pnpm lint` — exit 0.
[ ] `pnpm typecheck` — exit 0 (cobrindo código **e** testes).
[ ] `pnpm test` — todos verdes, com a contagem registrada.
[ ] `pnpm build` — exit 0, sem artefato de teste na saída de produção.
[ ] Quando aplicável: ciclo Docker completo verde e `smoke` verde.
[ ] Os gates foram **reexecutados** após a última alteração de código.

### Commits atômicos

[ ] Cada commit conta uma história só.
[ ] Assuntos não relacionados foram separados.
[ ] O conteúdo de cada grupo foi conferido com `git diff --cached --name-only`.
[ ] Nenhum arquivo entrou por acidente (`git add .` sem revisão).

### Mensagem de commit

[ ] Segue o padrão do repositório (Conventional Commits: `tipo(escopo): descrição`).
[ ] **Descrição em português** (padrão do projeto).
[ ] Descrição no imperativo, sem ponto final, até ~72 caracteres.
[ ] O corpo explica **o quê** e **por quê**, não apenas o como.
[ ] Breaking change sinalizado com `!` e rodapé `BREAKING CHANGE:`.
[ ] Nenhuma informação sensível na mensagem.

### Push, deploy e branch

[ ] Nenhum `git push` executado sem autorização explícita.
[ ] Nenhum `git merge` executado sem autorização explícita.
[ ] Nenhum deploy disparado.
[ ] Nenhuma troca de branch não solicitada.
[ ] Nenhum hook desabilitado (`--no-verify` é **proibido**).

## 7. Condições automáticas de bloqueio

O commit deve ser bloqueado quando houver:

- segredo, credencial, chave privada ou `.env` real no staging;
- `node_modules/`, `dist/`, `.next/`, `coverage/` ou `*.tsbuildinfo` no staging;
- lockfile dessincronizado (`--frozen-lockfile` falha);
- qualquer gate vermelho (format, lint, typecheck, test, build);
- container que não sobe ou não fica `healthy`, quando a entrega toca containers;
- finding `CRITICAL` ou `HIGH` do Code Review em aberto;
- entrega parcial, incompleta ou bloqueada;
- alteração não autorizada em artefato autoritativo;
- escopo antecipado (Constitution II);
- dump de dados reais ou PII no diff;
- tentativa de `--no-verify` ou de desabilitar hook;
- push, merge ou deploy sem autorização explícita.

## 8. Severidade dos achados

### Crítico

Segredo versionado, credencial exposta, dump de dados reais, PII no diff,
`--no-verify`, push/deploy não autorizado.

**Bloqueia imediatamente.** Segredo exposto exige revogação, não apenas remoção.

### Alto

Gate vermelho, lockfile dessincronizado, artefato de build no staging, entrega
parcial, alteração indevida em artefato autoritativo, escopo antecipado.

**Bloqueia.**

### Médio

Commit misturando assuntos, mensagem fora do padrão, arquivo grande sem
justificativa, `.gitignore` incompleto, `TODO` sem registro.

**Exige correção antes do commit** (`CHANGES REQUIRED`).

### Baixo

Descrição pouco clara, corpo de mensagem ausente onde seria útil, arquivo órfão
sem relação com a entrega.

**Corrigir ou registrar.**

## 9. Formato dos achados

```md
### [ALTO] Cache de build prestes a ser versionado

**Arquivo:** `apps/web/tsconfig.tsbuildinfo`
**Local:** working tree, não coberto pelo `.gitignore`

**Problema:**
Cache de compilação incremental do TypeScript (162 KB), específico da máquina e
regenerado a cada `typecheck`, não está no `.gitignore` e entraria no commit.

**Impacto:**
Conflito de merge em todo PR e poluição do histórico com artefato de máquina.

**Correção recomendada:**
Adicionar `*.tsbuildinfo` ao `.gitignore`. Corrigir o `.gitignore` é preferível a
apenas omitir o arquivo do `git add`, que deixaria o problema para o próximo commit.

**Validação necessária:**
`git check-ignore -v apps/web/tsconfig.tsbuildinfo` deve retornar a regra que o ignora.
```

## 10. Formato obrigatório de saída

```md
# Commit Check Report

## Identificação
- Story:
- Branch:
- HEAD antes do commit:
- Escopo da entrega (aplicação / processo / tooling / misto):

## Estado do repositório
- arquivos modificados:
- arquivos untracked:
- arquivos a commitar:

## Gates executados
- install --frozen-lockfile:
- format:check:
- lint:
- typecheck:
- test:
- build:
- ciclo Docker (quando aplicável):
- smoke (quando aplicável):

## Salvaguardas
- segredos / .env:
- artefatos de build e cache:
- arquivos grandes ou binários:
- lockfile:
- artefatos autoritativos preservados:

## Agrupamento proposto
- commit 1 (tipo): arquivos / justificativa
- commit 2 (tipo): arquivos / justificativa

## Mensagens propostas
- commit 1:
- commit 2:

## Achados críticos
- achado:

## Achados altos
- achado:

## Achados médios
- achado:

## Achados baixos
- achado:

## Fora do commit (decisão registrada)
- arquivo / diretório: motivo

## Veredito
- [ ] APPROVED FOR COMMIT
- [ ] CHANGES REQUIRED
- [ ] BLOCKED

## Justificativa
- decisão:
- ações necessárias:
- confirmação de ausência de push, merge e deploy:
```

## 11. Vereditos

### `APPROVED FOR COMMIT`

Todos os gates verdes, nenhuma salvaguarda violada, escopo íntegro, agrupamento e
mensagens definidos. **Somente com este veredito** a skill `commit` pode ser
executada.

### `CHANGES REQUIRED`

Existem achados médios ou altos corrigíveis nesta mesma rodada (`.gitignore`
incompleto, agrupamento errado, mensagem fora do padrão). Corrigir e reexecutar o
`commit-check`.

### `BLOCKED`

Existe achado crítico, gate vermelho ou entrega incompleta. Não commitar. O
problema volta para implementação ou para o dono da decisão.

## 12. Critérios de aprovação

O commit pode ser aprovado quando:

- a branch e o escopo estiverem corretos;
- todos os gates aplicáveis estiverem verdes, com evidência real;
- nenhum segredo, artefato de build ou binário inesperado estiver no staging;
- o lockfile estiver sincronizado;
- os artefatos autoritativos estiverem preservados;
- os commits estiverem agrupados de forma atômica;
- as mensagens seguirem o padrão do repositório, em português;
- nenhum push, merge ou deploy tiver sido executado sem autorização.

## 13. Resultado esperado

A aplicação desta skill deve garantir que o histórico do repositório:

- nunca contenha segredo, credencial ou dado real;
- nunca contenha artefato de build, cache ou arquivo temporário;
- reflita apenas trabalho concluído e verificado;
- conte uma história legível, com commits atômicos e mensagens honestas;
- preserve os artefatos autoritativos;
- não avance para push, merge ou deploy sem decisão humana explícita.
