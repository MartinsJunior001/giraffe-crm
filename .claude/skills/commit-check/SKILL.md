---
name: commit-check
description: >
  Gate obrigatório imediatamente anterior a qualquer git commit. Invoque
  antes da skill `commit`, e automaticamente ao concluir uma seção, etapa ou
  Story que produziu entrega versionável. Valida branch, escopo, segredos,
  artefatos de build, lockfile, gates de qualidade, agrupamento atômico e
  mensagem. Emite APPROVED FOR COMMIT / CHANGES REQUIRED / BLOCKED — só o
  primeiro autoriza o commit.
user-invocable: true
---

# commit-check (adaptador)

Este arquivo é apenas o ponto de entrada do Claude Code. A **fonte canônica** da
skill é `skills/commit-check.md`, na raiz do projeto, junto dos demais checks
(`security-check`, `observability-check`, `pre-implementation-check`, …).

## Instruções

1. Leia integralmente `{project-root}/skills/commit-check.md`.
2. Siga o processo obrigatório, o checklist e as condições de bloqueio descritos lá.
3. Produza a saída no formato obrigatório definido na seção 10 daquele arquivo.
4. Emita um dos três vereditos permitidos: `APPROVED FOR COMMIT`,
   `CHANGES REQUIRED` ou `BLOCKED`.
5. Somente com `APPROVED FOR COMMIT`, execute a skill `commit`.

Não duplique aqui o conteúdo da fonte canônica: se as regras mudarem, elas mudam
em `skills/commit-check.md`, e este adaptador continua válido sem edição.

## Restrições

- Nunca execute `git push`, `git merge`, deploy ou troca de branch sem autorização
  explícita do usuário.
- Nunca use `--no-verify` nem desabilite hooks.
- Não commite trabalho parcial, bloqueado, com gates vermelhos ou sem alteração
  versionável.
