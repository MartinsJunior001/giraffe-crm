# security-check — Story 1.7 (casca e design system)

## Superfície
Frontend (casca + design system) + um campo aditivo no backend (`papel` em `/organizations/current`).
Sem migration, sem nova regra de autorização.

## Verificações

### Nenhuma regra de domínio no frontend (AD-2 / CLAUDE.md)
- A navegação **reflete** permissões vindas do servidor (`papel`), **não as decide**. `itensVisiveis` é
  filtragem de apresentação pura — não há lógica de autorização de domínio no cliente.
- **Esconder item de nav é UX, não fronteira de segurança.** A autorização efetiva permanece no backend
  (1.6 deny-by-default, 1.3 contexto). Mesmo que um item vazasse para o DOM, a ação seria negada no
  servidor. Provado: a rota real `/organizations/current` continua protegida por `@Requer` (1.6) e por
  contexto (1.3).

### Não revelar recurso (INV-REPORT-01)
- Item de nav sem acesso **não é renderizado** (fora do DOM) — não revela existência de recurso. Provado
  em `casca.test.tsx`/`navegacao.test.ts` (item vetado ausente do resultado e do DOM).

### Exposição do `papel`
- `papel` (ADMIN/MEMBER/GUEST) **não é PII** e não concede nada por si — é o papel do próprio
  requisitante na própria Organização, derivado do contexto já resolvido (1.6). O usuário conhecer o
  próprio papel é esperado (UI adaptada). Sem query nova; sem vazamento de dados de terceiros.

### Estado honesto / sem vazamento
- O Dashboard e a casca preservam o **estado honesto** herdado da 1.5: sessão inválida → Login; sem Org
  → mensagem neutra; indisponível → mensagem sanitizada. Nada de URL interna, stack ou segredo alcança
  o cliente (contrato de `lib/api.ts`/`lib/auth.ts` mantido).

### Sem controle falso
- Busca/Notificações/Perfil são **espaços reservados não-interativos** (sem `a`/`button`/`input`,
  provado em `casca.test.tsx`) — nada finge funcionar (INV-ADMIN-02 em espírito).

## Dependências
`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` (base shadcn/ui). Trivy no CI cobre
CVEs. Radix **não** instalado (sem consumidor).

## Veredito
**APROVADO** — nenhuma regra de domínio no frontend; nav é UX (segurança é do servidor); item oculto
fora do DOM; `papel` não é PII; estado honesto preservado; sem controle falso. Nenhum finding CRITICAL/HIGH.
