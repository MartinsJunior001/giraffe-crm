# Spec — Story 1.12: Troca autenticada de senha (step-up por reautenticação recente)

> Contrato autoritativo: D-1 (`_bmad-output/implementation-artifacts/decisions/epic-8-gate-decisions-d1-d4.md`).
> Épico 1 (Identidade/Autenticação). RISCO: ALTO (superfície de credencial).

## Problema

O titular precisa poder **trocar a própria senha** com segurança. Uma sessão sequestrada não pode
trocar a senha só por estar logada: exige-se **reautenticação recente** (step-up). A troca deve
encerrar o acesso de sessões comprometidas e invalidar qualquer link de recuperação pendente.

## Escopo

DENTRO: política de senha central; capacidade de step-up (reautenticação recente reutilizando Better
Auth); endpoint/serviço de troca autenticada; revogação das demais sessões; invalidação de recuperação
pendente; notificação de segurança; auditoria sanitizada.

FORA: 1.13 (e-mail); 1.10 (recuperação pública não-autenticada); 2FA; segundo sistema de sessões; UI.

## Requisitos funcionais

- **FR-1 (step-up):** revalidar a senha atual do titular reutilizando o Better Auth, sem criar sessão
  nova nem segundo sistema de auth. O estado de step-up é server-side, ligado a Account+sessão atual,
  nunca em log. Janela de **10 min**.
- **FR-2 (gate):** operação sensível sem step-up válido → **403 `STEP_UP_REQUIRED`**.
- **FR-3 (não-enumeração):** senha atual incorreta → resposta sanitizada e não-enumerante (não revela
  que foi a senha).
- **FR-4 (antiabuso):** reusar o primitivo canônico (`RateLimiter.contar`); D-1: **≤5 falhas por
  (Account+IP) em 15 min → 429**. Não duplicar rate limit.
- **FR-5 (política central):** validador ÚNICO — min **15** / max **128**; permite frases-senha e
  espaços; **sem** exigência de mistura de classes; rejeita senha comum/comprometida por mecanismo
  **local/determinístico**; sem troca periódica; não invalida senhas existentes só pela adoção.
- **FR-6 (troca):** após step-up válido, validar a nova senha pela política, trocar **só a própria
  Account**, **preservar a sessão atual**, **revogar todas as demais**, **invalidar recuperação
  pendente**, **emitir notificação de segurança**, **registrar auditoria sanitizada**.

## Requisitos não-funcionais / invariantes

- **NUNCA** senha/hash/token/segredo em log, evento ou resposta (D-4 minimização).
- Account/AuthSession/AuthCredential/AuthVerification são **globais sem RLS** (AD-10) — a fronteira é
  o **GRANT**, não a RLS. Trocar credencial e revogar sessões usa GRANTs já existentes.
- Menor mudança correta, reversível, padrões existentes (Constitution II). **Sem migration** (ver plan).

## Critérios de aceite

1. Step-up válido sela janela de 10 min; ausente/expirado → 403 STEP_UP_REQUIRED.
2. Senha atual incorreta → 401 não-enumerante; ≤5 falhas (Account+IP) → 429.
3. Política valida nos limites 14/15/128/129; rejeita senha comum localmente; aceita frase com espaços;
   não exige classes.
4. Troca preserva a sessão atual e revoga as demais (prova real de contagem de sessões).
5. Recuperação pendente invalidada (só do titular); notificação de segurança emitida; auditoria sem
   senha/token.
