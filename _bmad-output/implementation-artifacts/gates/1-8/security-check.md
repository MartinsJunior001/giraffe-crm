# security-check — Story 1.8 (estados honestos e acessibilidade)

## Superfície
Frontend puro (`apps/web`): utilitário de contraste (função pura), componentes de estado e consumo no
Dashboard. **Sem backend, sem migration, sem query, sem PII, sem dependência nova.**

## Verificações

### Nenhuma regra de domínio no frontend (AD-2 / CLAUDE.md)
- Os componentes de estado **renderizam** o modelo já existente (`EstadoOrg`, resolvido no servidor pela
  1.4/1.5). Nenhuma decisão de autorização ou de domínio migra para o cliente.

### "Sem permissão" não revela recurso (INV-REPORT-01 / NFR-4)
- `SemPermissao` usa mensagem **genérica** por padrão; **não recebe nem exibe** nome/rota do recurso e
  **não** renderiza `href` para ele. Provado em `estado.test.tsx` (texto genérico + ausência de `a`).
- Continua valendo o padrão da 1.7: item de nav sem acesso fica **fora do DOM** (não escondido por CSS).

### Estado honesto / sem vazamento
- O ramo "indisponível" do Dashboard mostra falha **sanitizada** ("costuma ser temporário; tente
  novamente"), **sem** URL interna, stack ou segredo — herda o contrato de `lib/api.ts`/`lib/auth.ts`.
- Distinção zero legítimo × falha (AC2): "sem Organização" é `status` (vazio), "indisponível" é `alert`
  (falha) — não confunde ausência com erro, e não inventa dado.

### Sem controle falso (INV-ADMIN-02 em espírito)
- A ação de recuperação do `EstadoErro` é um **link real** (`/painel`, recarrega), não um botão sem
  efeito. Componentes sem ação (`Carregando`, `EstadoVazio`, `SemPermissao`) **não** renderizam controle.

### Dependências
Nenhuma nova. `jest-axe`/axe-core **não** adicionados. Contraste provado por cálculo puro. Trivy no CI
cobre o restante.

## Veredito
**APROVADO** — sem regra de domínio no cliente; estado "sem permissão" não-revelador; falha sanitizada;
sem controle falso; sem dependência nova.
