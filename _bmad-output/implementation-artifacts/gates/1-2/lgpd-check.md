# lgpd-check — Story 1.2

**Status: APROVADO COM RESSALVAS**

Esta é a **primeira PII do projeto**: `Account.email` (e, em menor grau, `Account.name`).

## Inventário de dado pessoal

| Campo            | Classificação | Onde vive            | Quem lê no runtime            |
| ---------------- | ------------- | -------------------- | ----------------------------- |
| `Account.email`  | PII (direta)  | tabela `Account`     | papel `giraffe_app` (`SELECT`)|
| `Account.name`   | PII (direta)  | tabela `Account`     | papel `giraffe_app` (`SELECT`)|
| `Account.id`     | pseudônimo    | tabela `Account`     | idem                          |

Não há, nesta Story: CPF, telefone, endereço, dado sensível, dado de menor, nem qualquer
categoria especial. Não há coleta — o seed usa dados fictícios (`*@exemplo.test`).

## Minimização

- `Account` guarda **apenas** o necessário para identidade: e-mail, nome, id, timestamps.
  Nenhum campo foi adicionado "para o futuro".
- Não há tabela de log/auditoria persistindo PII. A trilha de auditoria (FR-214) registra
  `actor` como **UUID da conta**, nunca e-mail ou nome.

## PII em log — verificado, não presumido

O risco real aqui era o log da camada de banco carregar `args` da query, e `args` de um
`account.findUnique({ where: { email } })` carregam o e-mail.

`tenant-context.ts` **nunca** registra `args`. Há teste dedicado (`rls-observability.test.ts`
→ "o log não carrega PII, argumentos da query nem a string de conexão"): ele executa uma busca
por e-mail e afirma que o e-mail **não** aparece em nenhuma entrada de log, e que nenhuma
entrada tem a chave `args`.

Redaction do Pino cobre `authorization`, `cookie` e `set-cookie` com `remove: true`.

## Alcance da leitura (a ressalva)

`Account` é **global e sem RLS** por decisão de arquitetura (AD-10): a identidade não pertence
a um tenant, e um login precisa encontrar a conta **antes** de existir Organização ativa. A
consequência honesta é que o papel de runtime, com contexto ou sem, **consegue ler o e-mail de
qualquer conta da plataforma**.

Isso é:

- **mitigado** pelo privilégio mínimo — nesta rodada o `GRANT` em `Account` foi reduzido a
  `SELECT` (antes era `SELECT/INSERT/UPDATE/DELETE`), o que elimina alteração e destruição;
- **não mitigado** quanto à leitura, e não pode ser sem quebrar o login;
- **irrelevante hoje na prática**, porque não existe endpoint algum: nenhuma rota expõe
  `Account`. O risco é de projeto, não de exposição.

**O que a Story 1.4 (autenticação) precisa fazer, e está registrado como fronteira:** nenhuma
rota pode devolver `Account` de terceiros. A busca por e-mail no login deve ser um caminho
específico e auditado, não um `findMany` exposto. Enquanto isso não existir, não há superfície.

## Direitos do titular

- **Eliminação (art. 18, VI):** ainda não implementável — não há autenticação nem consumidor.
  A cascata `ON DELETE CASCADE` de `Membership.accountId` está no schema e é o mecanismo que a
  Story de eliminação usará. Note que o runtime **não** pode apagar `Account` (sem `GRANT
  DELETE`) — a eliminação será uma operação administrativa, não um caminho de aplicação, e é
  assim que deve ser.
- **Portabilidade / correção:** fora do escopo desta Story (sem consumidor).

## Retenção

Não há política de retenção definida — não há dado real, nem coleta, nem consumidor. Fica
como item da Story que introduzir cadastro real. Registrado, não esquecido.
