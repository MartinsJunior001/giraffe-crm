# backup-check — Story 2.1 (ciclo de vida e catálogo de Pipes)

## O que muda no substrato de dados
Uma tabela nova (`Pipe`), um tipo novo (`PipeState`), um índice e uma FK para `Organization` com
`ON DELETE CASCADE`. **Nenhuma** tabela existente é alterada; **nenhum** dado existente é migrado ou
destruído (AD-17).

## Impacto no backup
- **Baixo e aditivo.** `Pipe` é tabela comum no mesmo schema `public`, capturada por qualquer `pg_dump`
  lógico ou snapshot físico do banco — não exige rotina, dump seletivo nem storage à parte.
- **O tipo `PipeState` faz parte do backup.** Restaurar só a tabela sem o enum falha. Restauração deve ser
  do schema completo, não por tabela avulsa — vale a pena dizer porque uma restauração parcial "só do que
  faltou" é exatamente o atalho que alguém tenta às pressas.
- **Volume desprezível**: catálogo de processos por Organização (dezenas de linhas por tenant), não dado
  transacional. Não muda a janela de backup nem o custo de retenção.
- **RLS e GRANT não estão no `pg_dump` de dados**: eles vivem no DDL. Uma restauração que recrie o schema
  a partir das **migrations** (caminho oficial) traz policies e GRANT junto. Uma restauração de dump
  lógico feita por um papel errado pode recriar a tabela com **dono errado** — e dono errado, sem `FORCE`,
  significa RLS contornada. **Verificar `relowner`, `relrowsecurity` e `relforcerowsecurity` após qualquer
  restauração** é parte do procedimento, não zelo excessivo.

## Restauração
O caminho oficial é o mesmo do resto da base: bootstrap de papéis (`00-roles.sql`) → `db:migrate` (deploy)
→ restauração dos dados. O SC-206 exercitou justamente esse caminho num banco limpo e descartável, e
confirmou que a tabela volta com **ENABLE + FORCE**, as 4 policies, o GRANT correto e **sem DELETE**
(ver `migration-check.md`).

## Dependência do rollback (ponto crítico)
**Reverter a migration `20260713120000_pipes` APAGA todos os Pipes.** O `.down.sql` faz `DROP TABLE`; a
reaplicação recria a tabela **vazia** (confirmado no SC-206). Isto é próprio de rollback de schema — não é
defeito desta migration —, mas tem uma consequência operacional que precisa estar escrita:

> Em ambiente com dados reais, o rollback desta migration é uma operação **com perda de dados** e exige
> **backup verificado imediatamente antes**. "Verificado" significa restauração testada, não a existência
> de um arquivo de dump.

O rollback é **manual e administrativo** (`pnpm --filter @giraffe/api db:rollback`), nunca automático e
nunca no boot de container.

## Validação necessária antes do staging
1. Backup completo (schema + dados) **antes** de aplicar a migration em ambiente com dados.
2. Restauração testada em ambiente descartável — e, na cópia restaurada, conferir dono da tabela,
   `ENABLE`/`FORCE` e o GRANT sem DELETE.
3. Só então considerar o rollback uma opção disponível.

## Relação com os débitos do L6
Os débitos abertos do **L6 — Hardening de staging** são **CR-09** (proteção de borda), **D-01** (IPs do
proxy Coolify), **D-02** (CIDR), **D-05** (agendador do `db:cleanup`) e **D-06** (rate limiter transacional
sob rajada). **Nenhum deles é um débito de backup/restore** — e esta Story **não** resolve nenhum deles.
Nada aqui deve ser lido como fechamento de item do L6.

O que esta Story faz é acrescentar um **requisito de verificação** (o passo 2 acima: conferir dono/RLS/GRANT
após restauração) que hoje não tem dono automatizado. Não estou criando um débito novo por conta própria —
apenas registrando que a validação de restore permanece **procedimento manual**, e que é no L6 (hardening
operacional de staging) que ela naturalmente se encaixaria, caso a equipe decida promovê-la a item próprio.

## Veredito

**APROVADO.** Impacto aditivo e de baixo risco. As duas coisas que precisam sobreviver a esta Story estão
registradas: (a) rollback desta migration **destrói dados de Pipe**; (b) restauração precisa reconferir
dono, `FORCE` e GRANT — onde a RLS não alcança, é o GRANT que nega. Débitos do L6 permanecem **abertos**.
