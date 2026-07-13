# Tasks — Story 1.8: Estados honestos e acessibilidade transversal

> Fonte: `spec.md` + `plan.md`. Todas independentes de contrato novo (podem iniciar já).

## Phase 1: Contraste e componentes (paralelas)

- [ ] **T001** Utilitário puro de razão de contraste WCAG em `lib/contraste.ts` (sRGB→linear→L;
  `(L1+0.05)/(L2+0.05)`), sem dependência externa. [FR-801]
- [ ] **T002** `test/contraste.test.ts` (`environment: node`): `ring #CC5B00` ≥ 3:1 contra
  `#FFFFFF`/`#FFF3E8`/`#F5F5F5`; `destructive/warning/success/info` texto ≥ 4,5:1 sobre `#FFFFFF`;
  **fase vermelha** com par forçado abaixo do piso. [SC-801]
- [ ] **T003** `components/ui/estado.tsx`: base `Estado` + `EstadoVazio`/`EstadoErro`/`SemPermissao`/
  `Carregando`, cada um com ícone `aria-hidden` (lucide) + texto + token semântico; ação de
  recuperação do erro via `Botao`. Nunca hex cru; nunca só cor. [FR-802/FR-803/FR-804]
- [ ] **T004** `test/estado.test.tsx` (`jsdom`): por variante prova ícone+texto+token (AC1); `role`
  `status`/`alert` correto e `EstadoVazio`≠`EstadoErro`≠`Carregando` (AC2); `SemPermissao` sem nome de
  recurso e sem `href` (AC3); "vazio/aguardando" sem token `success`. [SC-802/SC-803/SC-804]

## Phase 2: Consumo e a11y transversal

- [ ] **T005** `app/painel/page.tsx`: os três ramos honestos passam a usar `Estado*`. [FR-805]
- [ ] **T006** Teste sobre o Dashboard real: "sem-organizacao" (zero legítimo) distinguível de
  "indisponivel" (falha) por `role`/texto. [SC-805]
- [ ] **T007** `test/acessibilidade.test.tsx`: todo controle interativo da casca tem
  `focus-visible:ring-*`; `Navegacao` em ambas as orientações com nome acessível; controles só-ícone
  com nome; ordem de foco = ordem de DOM; sem `tabindex` positivo. [FR-806/SC-806]

## Phase 3: Gates

- [ ] **T008** `pre-implementation-check` (NORMAL; sem dependência nova, sem backend) e
  `context7-check` (Tailwind 4 tokens; WCAG 2.2 critérios 1.4.3/1.4.11/2.4.7 como baseline).
- [ ] **T009** `security-check` leve (estado "sem permissão" não-revelador; sem regra de domínio no
  frontend), reexecução de qualidade (format/lint/typecheck/test/build) e `commit-check`.
