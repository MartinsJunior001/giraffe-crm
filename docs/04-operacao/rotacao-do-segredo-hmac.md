# Rotação do segredo HMAC do contador de falhas (G1)

> Procedimento operacional. **Nenhum valor de segredo aparece neste documento, e nenhum deve
> aparecer** — nem em exemplo, nem em comentário, nem em captura de tela de um incidente.

## O que este segredo faz

`LOGIN_HMAC_SECRET` deriva a chave sob a qual as falhas de login são contadas (o G1: 5 falhas por
identificador em 15 minutos). A chave é `HMAC-SHA256(secret, "login:" + e-mail normalizado)`.

Ele existe para que o **e-mail nunca seja gravado em claro** na tabela de contadores. Em claro,
`LoginFailure` seria um segundo cadastro de e-mails fora do `Account`, e um dump dela seria uma lista
de usuários da plataforma.

## Por que a rotação é perigosa se feita ingenuamente

O segredo deriva **todas** as chaves. Trocá-lo muda todas de uma vez.

Se a troca fosse instantânea, os contadores de quem está sob ataque **naquele instante** virariam
órfãos: as linhas antigas continuariam no banco, mas ninguém mais derivaria as chaves delas. Na
prática, **todo atacante em curso ganharia 5 tentativas novas** — durante uma operação de segurança.

Por isso a rotação tem uma **janela de sobreposição**, em que o segredo anterior continua sendo
**lido** (nunca escrito). As falhas antigas seguem contando até expirarem naturalmente.

## Variáveis

| Variável                          | Papel                                                   |
| --------------------------------- | ------------------------------------------------------- |
| `LOGIN_HMAC_SECRET`               | Segredo **atual**. Toda falha nova é gravada sob ele.   |
| `LOGIN_HMAC_KEY_VERSION`          | Versão do segredo atual (inteiro, incrementa a cada rotação). |
| `LOGIN_HMAC_PREVIOUS_SECRET`      | Segredo **anterior**, só durante a sobreposição. Opcional. |
| `LOGIN_HMAC_PREVIOUS_KEY_VERSION` | Versão do segredo anterior. Obrigatória se houver segredo anterior. |

A aplicação **recusa subir** (fail-fast, `ConfigValidationError`) se:

- o segredo atual estiver ausente ou tiver menos de 32 caracteres;
- o segredo anterior estiver definido sem a versão anterior (ou vice-versa) — meia rotação;
- o segredo anterior for **igual** ao atual — derivaria a mesma chave, a linha entraria duas vezes na
  soma e o usuário bloquearia com 3 falhas em vez de 5;
- as duas versões forem iguais — a rotação ficaria irrastreável nos dados.

Os segredos vivem **apenas** em variável de ambiente/cofre. Não há default: um default seria um
segredo público, e as chaves de todos os usuários seriam deriváveis por quem lesse o repositório.

## Janela de sobreposição

**Mínimo: 15 minutos** (a janela do G1) **+ margem operacional**.

Recomendado: **1 hora**. A margem cobre relógio dessincronizado entre réplicas, deploy escalonado
(durante o rollout, réplicas antigas e novas convivem) e o tempo entre aplicar a variável e o
processo efetivamente reiniciar.

Remover o segredo anterior **antes** de a janela decorrer é uma **anistia silenciosa**: os contadores
antigos ainda válidos deixam de ser vistos, e quem estava bloqueado é liberado.

## Procedimento

1. **Gere** um segredo novo, aleatório, com no mínimo 32 caracteres, fora de qualquer log ou
   histórico de shell. Registre-o no cofre.

2. **Promova o atual a anterior** e o novo a atual, em uma **única** atualização de configuração:

   - `LOGIN_HMAC_PREVIOUS_SECRET` ← valor que estava em `LOGIN_HMAC_SECRET`
   - `LOGIN_HMAC_PREVIOUS_KEY_VERSION` ← valor que estava em `LOGIN_HMAC_KEY_VERSION`
   - `LOGIN_HMAC_SECRET` ← segredo novo
   - `LOGIN_HMAC_KEY_VERSION` ← versão anterior + 1

   Fazer isso em duas etapas (primeiro o segredo, depois a versão) faria a aplicação recusar subir no
   intervalo — o que é o comportamento correto, mas é uma indisponibilidade evitável.

3. **Reinicie** os processos. Durante a sobreposição, a aplicação lê as duas chaves e **soma** as
   falhas válidas; grava apenas na atual.

4. **Aguarde a janela** (≥ 15 min + margem; recomendado 1 h).

5. **Aposente** a chave anterior: remova `LOGIN_HMAC_PREVIOUS_SECRET` e
   `LOGIN_HMAC_PREVIOUS_KEY_VERSION` e reinicie.

6. **Revogue** o segredo antigo no cofre.

## Se o segredo vazou

Um segredo vazado permite ao atacante **derivar as chaves** e, com uma lista de e-mails, descobrir
quais têm falhas registradas — um oráculo parcial de existência de conta. Não permite ler senha nem
autenticar.

Nesse caso a sobreposição é um risco, não uma conveniência: ela mantém o segredo comprometido em uso.
Rotacione **sem sobreposição** (defina o novo segredo e não configure o anterior), aceitando
conscientemente que os contadores em curso são zerados, e monitore `auth.login.failed`.

Este é o único caso em que zerar os contadores é a decisão certa.

## Verificação

Depois de rotacionar, confirme:

- a aplicação subiu (se a configuração estivesse incoerente, ela teria recusado);
- `auth.login.failed` continua sendo emitido com `count` — o contador está vivo;
- nenhum e-mail, chave derivada ou segredo aparece nos logs (é invariante testada, mas confirme na
  primeira rotação real).
