# Pre-Implementation Check — Story 2.8

**Veredito: APROVADO COM RESSALVAS** (a ressalva — mecanismo antiabuso não definido nos artefatos — foi
**escalada e resolvida** com o dono do produto antes de codificar; ver "Decisão escalada").

## Sequência e artefatos
- BMAD → Spec Kit → implementação respeitada. O domínio (submissão pública + triagem) decorre do PRD D3.3 e do
  Épico 2; os invariantes de isolamento e autorização decorrem da Architecture Spine (AD-6/10/11).

## Decisão escalada (gate resolvido)
- O baseline antiabuso **não estava definido** nos artefatos (PRD §953 e epics §879 deferem a Security/Arquitetura
  "sem inventar mecanismo"; a Spine não resolve). **Escalado ao dono do produto** (proibido inventar). Decisão:
  - **Autorização de revisão:** capacidade explícita `reviewPublicSubmissions` na `PipeGrant` existente (Admin da Org
    implícito; demais só por concessão; reusa CASL/`@Requer`/guard/deny-by-default; sem novo papel/sistema).
  - **Resolução pública de tenant:** registro global mínimo `PublicFormRoute` (sem RLS por definição); só `publicId`
    opaco + `orgId` + `formId`, sem PII; resolver pelo `publicId`, entrar em `withTenantContext(orgId)` e reler o Form
    sob RLS; validar publicação/ativação/versão/destino antes de escrever; 404 uniforme; revogação/rotação.
  - **Baseline antiabuso:** rate limit atômico por IP confiável + `publicId`; fail-closed; upload público bloqueado
    (AD-28); idempotência; sem CAPTCHA no MVP; nenhuma PII em log.

## context7-check
- **Prisma 6.19.3** (instalado): `$transaction` interativa para a conversão; P2002/P2028 no tratamento de conflito;
  `INSERT ... ON CONFLICT ... RETURNING` via `$queryRaw` para o rate limit atômico (mesma tabela `RateLimit`).
- **NestJS 11**: rota pública sem `@Requer` + `@SemContextoOrganizacional()` (endpoint totalmente público); nenhum
  recurso novo de framework.

## Escopo (Constitution II)
- Sem antecipar futuro: submissão pública do Formulário inicial (TRIAGE/DIRECT) + triagem (aprovar/rejeitar) + config
  (habilitar/revogar/rotacionar). NÃO materializa CAPTCHA, movimentação/estado de Card (2.9+/2.14), taxonomia de
  eventos além de `CREATED`, Database (E3) nem upload real de Arquivo (gated — AD-28, só contrato consumido).

## Segurança/isolamento
- `SubmissaoPublica` org-scoped (RLS ENABLE+FORCE, WITH CHECK, sem DELETE). `PublicFormRoute` global (AD-10), sem PII,
  sem DELETE. Nenhum caminho de bypass de RLS (AD-6). Autorização fina no serviço (DBT-AUTHZ-01), C3 congelado.
  Cliente nunca fornece `orgId`/`formId`/`formVersionId`.

## Migration
- Versionada (`20260714150000_public_submissions`), aplicada por `db:migrate`, não no boot. Só adição.

## Riscos
- Endpoint público não autenticado = maior superfície de ataque → revisão adversarial de 4 lentes obrigatória (risco
  ALTO). Concorrência de conversão (P2002/P2028 → 500) e ausência de auditoria na tx raiz identificadas na revisão e
  **corrigidas** com regressão determinística (ver `review.md`/`gates.md`).
