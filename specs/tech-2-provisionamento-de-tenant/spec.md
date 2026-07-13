# Spec — tech-2: Provisionamento seguro do primeiro tenant

> Risco **CRÍTICO** (identidade + credencial + invariante-mãe de isolamento). Spec completo.
> Fonte: `_bmad-output/implementation-artifacts/tech-2-provisionamento-de-tenant.md`.

## Contexto e problema
Não há autocadastro (`disableSignUp: true`) e o painel de convites é WAVE 2 (Épico 8). Sem um caminho
controlado, não existe como criar a **primeira** Organização e seu **primeiro** Admin — a jornada
operacional fica travada. A solução é uma **rotina de ops versionada** (como `db:seed`, mas para um
tenant real), executada deliberadamente pelo operador, com o papel `migrator`.

## Requisitos funcionais
- **FR-T201** — A rotina cria uma **Organization** (raiz do tenant) idempotentemente (chave: `slug`).
- **FR-T202** — A rotina cria a **Account** global do Admin idempotentemente (chave: `email`).
- **FR-T203** — A rotina cria a **Membership** ADMIN ACTIVE ligando Account↔Organization
  idempotentemente (chave: `accountId+orgId`); papel único (AD-7).
- **FR-T204** — A rotina cria a **AuthCredential** (`providerId: 'credential'`, `accountId = userId`)
  com hash gerado por `ctx.password.hash` do Better Auth; **não** sobrescreve credencial existente.
- **FR-T205** — Inserções em `Organization`/`Membership` ocorrem **com contexto de RLS**
  (`set_config('app.current_org_id', orgId, true)`), em transação, pelo papel **migrator**. Nenhum
  caminho de bypass de RLS é criado; o papel de runtime **não** é usado para criar Organization.
- **FR-T206** — Validação de entrada **antes de qualquer escrita**: campos obrigatórios presentes;
  senha ≥ 12 e ≤ 128; e-mail válido; slug válido (kebab, derivado do nome se ausente).
- **FR-T207** — **Nenhuma senha padrão.** Se a senha não for fornecida, a rotina **gera uma forte
  aleatória** e a imprime **uma única vez** (para o operador trocar), sem persisti-la em log.
- **FR-T208** — Sanitização: nenhuma mensagem/log/erro contém senha, hash ou `DATABASE_URL`; e-mail é
  minimizado (mascarado) em saída; erros citam só nome de variável/host.
- **FR-T209** — A rotina é um script de ops (`db:*`), **não** alcançável pela superfície HTTP em runtime.

## Critérios de sucesso (verificáveis, PostgreSQL real)
- **SC-T201** — Após rodar numa Org nova e única: existem Organization, Account, Membership
  (ADMIN/ACTIVE) e AuthCredential; o Admin **autentica** (`ctx.password.verify(hash, senha) === true`).
  (FR-T201..204)
- **SC-T202** — A inserção passa pela policy: com o contexto **errado/ausente**, o INSERT de
  Organization/Membership é **negado** (prova de que o contexto é o que habilita, não um bypass).
  (FR-T205)
- **SC-T203** — Rodar a rotina **duas vezes** com as mesmas entradas não duplica nenhuma das 4 entidades
  e termina sem erro. (FR-T201..204, idempotência)
- **SC-T204** — Senha ausente (sem geração) e senha curta (<12) **lançam antes de qualquer escrita**;
  nenhuma linha é criada nesse caminho. (FR-T206, fail-closed)
- **SC-T205** — A credencial existente **não** é sobrescrita numa 2ª execução (o hash permanece o
  mesmo). (FR-T204)
- **SC-T206** — Erros/saída **não contêm** a senha nem a `DATABASE_URL` (só host/nome de variável); o
  e-mail aparece mascarado. (FR-T208)

## Não-objetivos
UI de convites/aceite (E8); autocadastro; D-06/CR-09/borda (L6); verificação de e-mail (1.10);
provisionamento em massa; múltiplos tenants numa execução.

## Segurança e observabilidade
Papel migrator (ops), nunca runtime. Sem bypass de RLS (AD-6). Credencial via Better Auth (sem
reimplementar hash). Sem segredo em log (senha/hash/DSN). E-mail é PII (minimizar). Idempotência evita
tenant duplicado. **Sem nova migration/DDL.**

## Backup / reversão
A rotina só **cria**. Reversão do 1º tenant (se necessário) é operação manual controlada (apagar
Organization cascateia Membership; Account é global). Registrar o procedimento no gate `backup-check`;
não implementar um "desprovisionamento" automático (fora de escopo, sem consumidor).
