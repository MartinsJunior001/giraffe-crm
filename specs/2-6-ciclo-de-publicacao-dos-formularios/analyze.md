# Analyze — Story 2.6

## Cobertura dos critérios
- **SC-261** (publicar/despublicar/ler) — `publication-http`: 1ª/2ª publicação, estado, despublicar idempotente. ✅
- **SC-262** (imutabilidade) — `publication-http` (editar rascunho não muda versão 1) + `publication-rls`
  (runtime sem UPDATE/DELETE em `FormVersion` → permission denied). ✅
- **SC-263** (numeração/concorrência) — `publication-http` (201-ou-409, numeração 1..n) + `publication-rls`
  (UNIQUE barra número duplicado). ✅
- **SC-264** (validações) — `snapshot` (unidade) + `publication-http` (sem Campo ativo, Seleção sem opção, gate de
  Arquivo, form não materializado → 400/404). ✅
- **SC-265** (autorização/isolamento) — `publication-authz` (gerenciar publica; MEMBER/VIEWER 403; sem acesso 404)
  + `publication-rls` (cross-tenant, sem contexto, WITH CHECK). ✅

## Divergências / riscos residuais
- **D-R1 — atomicidade cross-tabela:** publicar toca INSERT `FormVersion` + UPDATE ponteiro `Form`. Resolvida por
  transação interativa com contexto no client RAIZ (`set_config(..., true)`), o mesmo primitivo interno de
  `withTenantContext`; publicar é o consumidor concreto previsto pela nota da Story 1.3. Não é bypass de RLS: o
  contexto é definido dentro da transação; WITH CHECK/USING valem. A auditoria é emitida à mão (o caminho não
  passa pela extensão) — `FormVersion` também está em `MODELOS_AUDITADOS` para qualquer escrita via extensão.
- **D-R2 — Spine desatualizado:** o Spine lista "ciclo de publicação do Formulário" em Deferred (Produto), mas o
  PRD D3.2 já o resolve (estados definidos). Autoridade = PRD D3.2. Registrado; não bloqueia. Não editamos o
  Spine (artefato autoritativo).
- **D-R3 — obrigatoriedade no snapshot:** o usuário pediu "obrigatoriedade" no snapshot, mas `Field` não tem esse
  atributo na 2.4/2.5. NÃO materializado (Constitution II) — o snapshot captura o que a definição tem. Quando um
  atributo de obrigatoriedade for adicionado ao Campo, o snapshot passa a capturá-lo.
- **D-R4 — ponteiro por número, não FK:** `Form.publishedVersion` é `Int?`, não FK a `FormVersion`. Evita ciclo de
  FK e não há risco de ponteiro pendente (versões nunca são deletadas; o ponteiro só é gravado para uma versão
  criada na mesma transação). Integridade da versão em si é garantida por `@@unique` + FKs de `FormVersion`.
- **D-R5 — pré-visualização:** PRD D3.2 cita "pré-visualizar (simular sem submissão)". Como não há submissão
  (2.7+), a simulação não é materializada aqui; ler o snapshot de uma versão cobre a inspeção da definição.
- **D-R6 — captura point-in-time (achado Edge Case Hunter):** a leitura dos Campos e a validação/`montarSnapshot`
  rodam ANTES da transação atômica de INSERT (transações distintas). O snapshot é internamente coerente (uma
  única leitura consistente), mas uma edição do rascunho comitada ENTRE a validação e o INSERT é captura de
  "última leitura" — não há guarda "rascunho inalterado desde a validação". É **seam intencional** de captura
  point-in-time: publicar tira uma foto do rascunho válido no instante; não há submissão em curso (2.7+) para
  exigir atomicidade validação↔captura. Se um dia se quiser a garantia estrita, re-ler e revalidar dentro de
  `publicarAtomico` (ou guarda otimista por revisão do rascunho). Registrado como escolha consciente.

## Regressão
2.1–2.5 intocadas (só adições + `MODELOS_AUDITADOS` += `FormVersion` e o ponteiro em `Form`). Suíte cheia verde.
