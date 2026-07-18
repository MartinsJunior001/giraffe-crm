# Checklist de Qualidade de Requisitos: Segurança/Isolamento + Aceite — Story 3.8

**Propósito**: validar a QUALIDADE dos requisitos de segurança/isolamento e de aceite (completude, clareza,
consistência, mensurabilidade, cobertura) ANTES da implementação. São "testes unitários para o inglês da spec" —
avaliam o que está escrito, não o comportamento do código.
**Criado**: 2026-07-18 · **Foco**: Segurança + Aceite · **Profundidade**: gate de release · **Público**: revisor (PR)
**Feature**: [spec.md](../spec.md)

## Isolamento e acesso cruzado

- [ ] CHK001 — O requisito de "sem acesso cruzado mesmo conhecendo a chave" está definido como checagem por
  `(resourceType, resourceId)` pela camada autorizada, e não só por RLS? [Clareza, Spec §4 INV-3.8-03]
- [ ] CHK002 — Está especificado que RLS é **necessária e insuficiente** para o caso cross-recurso intra-tenant
  (dois usuários da mesma Org)? [Completude, Spec §4 / ADR T2]
- [ ] CHK003 — O requisito de prova exige a autorização de aplicação **neutralizada** para isolar a guarda fina
  (não deixar a RLS "passar por cima" do teste)? [Mensurabilidade, Spec §5 AC8 / ADR AC-4]
- [ ] CHK004 — A resposta a "sem acesso ao recurso" está definida como **404 não-enumerante** (nunca 403/oráculo de
  existência)? [Consistência, Spec §4 INV-3.8-02]
- [ ] CHK005 — Está especificado que `orgId`/`bucketKey`/`resourceId` do cliente nunca são confiados? [Completude, Spec §4]

## Herança de permissão (INV-FILE-03)

- [ ] CHK006 — O mapeamento ver/baixar=leitura e enviar/substituir/remover=edição está definido para Card
  (`exigirLerCard`/`exigirOperarCard`) e Registro (`exigirLer/OperarDatabase`)? [Completude, Spec §4 INV-3.8-02]
- [ ] CHK007 — Está claro que a capacidade **não inventa papéis próprios** e o binding é injetado pelo consumidor
  (AD-5, sem ciclo)? [Clareza, Spec §4]
- [ ] CHK008 — O requisito de "ler-sem-operar ao mutar → 403" está distinto do "sem acesso → 404"? [Consistência, Spec §5 AC8]

## Fail-closed e gate de consumo (AD-28 / ADR AC-2)

- [ ] CHK009 — O 409 `CAPACIDADE_ARQUIVO_INDISPONIVEL` está definido como resposta ao **uso** de `FormVersion`
  publicada com Campo Arquivo sob capacidade desligada (não erro opaco, não aceite silencioso)? [Clareza, Spec §3 RF-3]
- [ ] CHK010 — Está especificada a **mutação obrigatória** do teste (deletar o gate → vermelho), tornando o AC
  reprovável? [Mensurabilidade, Spec §5 AC2]
- [ ] CHK011 — O requisito deixa explícito que a 3.8 **satisfaz** o gate existente (`file-gate.ts`) e **não o
  reescreve**? [Consistência, Spec §3 RF-3]
- [ ] CHK012 — Está definido o comportamento fail-closed do valor referencial: `fileId` `QUARANTINED` ou de outro
  recurso → rejeitado (400/409)? [Cobertura, Spec §Clarifications Q1 / RF-2]

## Canal público

- [ ] CHK013 — Os limites do canal público (por arquivo/Campo/submissão/total) estão definidos como requisito com
  origem (variáveis de ambiente fail-closed), mesmo sem os valores finais? [Completude, Spec §3 RF-6 / Q4]
- [ ] CHK014 — A chave do rate limit está especificada como `<orgId>` (compondo com IP+publicId), evitando o
  multiplicador por ator/recurso? [Clareza, Spec §3 RF-6 / ADR §12 HIGH-2]
- [ ] CHK015 — Está definido que a validação é por **magic-bytes** independente da extensão declarada? [Consistência, Spec §3 RF-6]
- [ ] CHK016 — O requisito "arquivo indisponível até verificar" cobre a proibição de converter (2.8) referenciando
  `QUARANTINED`? [Cobertura, Spec §3 RF-6]
- [ ] CHK017 — Está explícito que **não há anexo geral público** e **não há download público**? [Completude, Spec §5 AC6 / Q8]

## LGPD / PII / observabilidade

- [ ] CHK018 — Está definido que a remoção é **lógica** (sem DELETE físico de linha) + expurgo do binário pela 3.7?
  [Completude, Spec §4 INV-3.8-08]
- [ ] CHK019 — O requisito proíbe `nomeOriginal` cru em log/evento (só metadado/`fileId`/referência interna segura)?
  [Clareza, Spec §3 RF-9 / §5 AC9]
- [ ] CHK020 — A taxonomia de eventos (`FILE_ATTACHED`/`FILE_REPLACED`/`FILE_REMOVED`) está definida e alinhada ao
  read-side (2.17/3.6) sem antecipá-lo? [Consistência, Spec §Clarifications Q6]

## Integridade / entrega / substituição

- [ ] CHK021 — Está especificado que a entrega é **sempre** por stream sob sessão (Opção A), só `AVAILABLE`, sem URL
  pré-assinada nem link público permanente? [Completude, Spec §3 RF-8]
- [ ] CHK022 — O requisito de substituição garante que o anterior só sai **após** o novo `AVAILABLE` e gera evento na
  mesma transação (sem perda silenciosa)? [Clareza, Spec §3 RF-5 / §4 INV-3.8-06]
- [ ] CHK023 — O read-only sob arquivamento cobre o **pai** (Pipe/Database) além do filho (Card/Registro)?
  [Cobertura, Spec §3 RF-7 / Q7]

## Escopo, dependências e consistência

- [ ] CHK024 — As exclusões (E5/E6/avatar/cota por tenant/limites por Org) estão declaradas explicitamente para
  impedir scope creep (Constitution II)? [Cobertura, Spec §2]
- [ ] CHK025 — A dependência **dura** da 3.7 mergeada está registrada como bloqueio, com os pontos que só fecham com
  ela (assinatura do contrato, baseline, forma do `FileObject`)? [Assumption, Spec §7 R6 / plan §NEEDS-3.7]
- [ ] CHK026 — O requisito de migration/GRANT está definido como **mínimo** (meta: nenhum GRANT novo), com fase
  vermelha exigida se houver coluna nova? [Consistência, Spec §4 / data-model]
- [ ] CHK027 — Cada AC (AC1–AC10) tem um requisito funcional rastreável (RF↔AC) e é objetivamente verificável?
  [Rastreabilidade, Spec §5]
- [ ] CHK028 — Os defaults conservadores do planner (Q1–Q8) estão marcados como **a validar** na abertura, sem serem
  tratados como decisão final? [Ambiguity, Spec §Clarifications]

## Notas

- Itens marcados como não resolvidos exigem ajuste da spec antes de `speckit-plan`/implementação. Aqui a spec já
  passou por clarify (defaults conservadores) — os itens `[Assumption]`/`[Ambiguity]` (CHK025/CHK028) permanecem
  **abertos por dependência da 3.7**, não por deficiência de redação.
