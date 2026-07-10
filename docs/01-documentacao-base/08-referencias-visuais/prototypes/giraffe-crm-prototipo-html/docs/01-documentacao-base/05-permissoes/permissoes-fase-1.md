# Permissões — Giraffe CRM · Fase 1

> Modelo **oficial e conceitual** de permissões da Fase 1. Sem backend, sem
> banco, sem tela nova, sem sistema granular. As matrizes aqui são
> **referência inicial de produto** — não um sistema implementado.
>
> **Marcações:** `CONFIRMADO` · `NÃO CONFIRMADO` · `PENDENTE DE DECISÃO` · `FORA DA FASE 1`.
>
> **Aviso de fidelidade ao protótipo:** o `giraffe-state.js` traz valores que são
> **nomes legados/técnicos do seed**, não a nomenclatura oficial:
> - Plataforma (`role`): `Super Admin` (oficial) e `Membro` (valor técnico do seed —
>   **não** é papel oficial da Fase 1; ver §5).
> - Organização (`orgRole`): `Administrador da Organização` (oficial), `Editor` e
>   `Visualizador` (**nomes legados/técnicos**, mapeados para a oficial em §6).
>
> A **nomenclatura oficial dos papéis** (Plataforma, Organização, Pipe e Card)
> está `CONFIRMADO` por decisão de produto. O que ainda não está refletido no
> protótipo permanece `PENDENTE DE DECISÃO` **apenas** quanto à implementação/
> mapeamento seguro, nunca quanto ao nome oficial. Nada aqui altera o protótipo.

---

## 1. Objetivo do documento

Definir, de forma conceitual, **quem pode fazer o quê** na Fase 1, separando os
quatro níveis de escopo — **Plataforma, Organização, Pipe e Card** — e
registrando o que já está confirmado no protótipo e o que ainda depende de
decisão. O documento serve de base para a futura implementação de controle de
acesso, sem antecipá-la.

---

## 2. Princípios de permissão

1. **Separação de escopos.** Permissão sempre existe dentro de um escopo:
   Plataforma, Organização, Pipe ou Card. Um papel de um escopo não concede
   poder em outro. `CONFIRMADO` (princípio; deriva de RN-001/003/RN-200).
2. **Menor privilégio.** O padrão é o acesso mais restrito; poderes são
   concedidos explicitamente. `PENDENTE DE DECISÃO` (a definir na implementação).
3. **Plataforma acima da Organização.** Super Admin (plataforma) é distinto e
   superior em escopo ao Administrador da Organização. `CONFIRMADO`.
4. **"Total" é relativo ao escopo.** "Total" na Organização significa total
   **dentro da própria organização**, nunca na plataforma inteira. `CONFIRMADO`.
5. **Serviço ativo ≠ serviço validado.** Aparecer na UI não significa que a
   permissão está implementada/validada. `CONFIRMADO` (RN-200).
6. **Sem granularidade extrema na Fase 1.** Nada de editor avançado de
   permissões por campo/ação. `FORA DA FASE 1`.

---

## 3. Diferença entre Papel, Permissão e Escopo

- **Papel (Role):** rótulo atribuído a um usuário dentro de um escopo (ex.:
  *Administrador da Organização*, *Responsável* de um card). Um usuário pode ter
  papéis diferentes em escopos diferentes. `CONFIRMADO` (dois eixos no seed).
- **Permissão (Permission):** a capacidade concreta de executar uma ação
  (Visualizar / Editar / Administrar). É consequência do papel + escopo.
  `PENDENTE DE DECISÃO` (o conjunto exato de permissões não está no seed).
- **Escopo (Scope):** o contexto onde papel e permissão valem — Plataforma,
  Organização, Pipe ou Card. `CONFIRMADO` (os quatro escopos existem
  conceitualmente).

> Regra: **papel não vale fora do seu escopo.** Um "Responsável" é papel **do
> Card**, não da Organização; "Somente leitura" é papel **do Pipe**, não da
> Organização.

---

## 4. Níveis de permissão

```
PLATAFORMA        (mais amplo)
  └── ORGANIZAÇÃO
        └── PIPE / PROCESSO
              └── CARD   (mais específico)
```

- **Plataforma** — administração global do Giraffe. `CONFIRMADO` (existe como
  papel; área dedicada `NÃO CONFIRMADO`).
- **Organização** — escopo de todo o trabalho de um cliente. `CONFIRMADO`.
- **Pipe / Processo** — acesso a um processo específico e suas fases/cards.
  `PENDENTE DE DECISÃO` (papéis de pipe não existem no seed).
- **Card** — acesso a um item específico. `PENDENTE DE DECISÃO` (papéis de card
  não existem no seed).

---

## 5. Papéis da Plataforma

```
PLATAFORMA
└── Super Admin
```

- **Super Admin** — administra a plataforma. `CONFIRMADO` como papel oficial e
  como valor de `role` no seed; **área dedicada** `NÃO CONFIRMADO`.

> **"Membro da Plataforma" não é papel oficial da Fase 1.** O valor `Membro` que
> aparece em `role` no seed é um **nome legado/técnico**, não um papel oficial da
> Plataforma, e foi **removido** da lista de papéis oficiais. Não confundir com o
> **Membro da Organização** (§6), que é papel oficial de outro escopo.

> Ver §11 para as regras do Super Admin.

---

## 6. Papéis da Organização

**Modelo oficial:**

```
ORGANIZAÇÃO
├── Administrador da Organização
├── Membro
└── Convidado
```

**Estado no protótipo:** o seed usa `orgRole` com **Administrador da
Organização**, **Editor** e **Visualizador**. `Editor` e `Visualizador` são
**nomes legados/técnicos** e devem ser mapeados para a nomenclatura oficial.

| Papel oficial | Existe no seed? | Nome legado/técnico | Mapeamento |
|---|---|---|---|
| Administrador da Organização | Sim | Administrador da Organização | `CONFIRMADO` |
| Membro | Via legado | Editor | Editor → Membro. `CONFIRMADO` |
| Convidado | Via legado | Visualizador | Visualizador → Convidado **ou** Somente leitura, conforme contexto. `CONFIRMADO` (regra); `PENDENTE DE DECISÃO` quando o contexto não permitir mapear com segurança |

> **Nomenclatura oficial:** decidida — Administrador da Organização / Membro /
> Convidado. Os nomes `Editor` e `Visualizador` **só existem como legado/técnico**
> no seed/protótipo e devem ser lidos como Membro e Convidado (ou Somente leitura,
> conforme contexto). Quando o contexto de `Visualizador` não permitir decidir com
> segurança entre **Convidado** (Organização) e **Somente leitura** (Pipe), o
> mapeamento fica `PENDENTE DE DECISÃO`.

- **Administrador da Organização** — administra a própria organização. `CONFIRMADO`.
- **Membro** — usuário operacional dentro dos contextos permitidos. `CONFIRMADO` (nome oficial); legado = `Editor`.
- **Convidado** — acesso limitado. `CONFIRMADO` (nome oficial); legado = `Visualizador` (conforme contexto).

---

## 7. Papéis do Pipe

```
PIPE / PROCESSO
├── Admin do Pipe
├── Membro do Pipe
├── Somente leitura
├── Visão restrita
└── Apenas formulário inicial
```

**Status geral: `PENDENTE DE DECISÃO`** — o seed **não** possui papéis por pipe;
existe apenas o atributo `locked` (pipe bloqueado) e `starred` (favorito), que
**não são permissões de usuário**. Estes papéis são proposta de produto.

- **Admin do Pipe** — configura o pipe (fases, formulários, automações). `PENDENTE DE DECISÃO`.
- **Membro do Pipe** — opera cards do pipe. `PENDENTE DE DECISÃO`.
- **Somente leitura** — vê, não edita. **Papel de Pipe, não da Organização.** `PENDENTE DE DECISÃO`.
- **Visão restrita** — vê um subconjunto (ex.: só seus cards/fases). `PENDENTE DE DECISÃO`.
- **Apenas formulário inicial** — só pode submeter a entrada do pipe. `PENDENTE DE DECISÃO`.

---

## 8. Papéis do Card

```
CARD
├── Responsável
├── Observador
├── Comentador
└── Restrito ao próprio
```

**Status geral: `PENDENTE DE DECISÃO`** — o seed só guarda `creator` (criador do
card); não há papéis de card. O criador ≠ responsável necessariamente.

- **Responsável** — dono da execução do card. **Papel do Card, não da Organização.** `PENDENTE DE DECISÃO`.
- **Observador** — acompanha sem editar. `PENDENTE DE DECISÃO`.
- **Comentador** — comenta, não altera estrutura. `PENDENTE DE DECISÃO`.
- **Restrito ao próprio** — só acessa cards em que está envolvido. `PENDENTE DE DECISÃO`.

---

## 9. Matriz resumida de permissões da Organização — Administrador

> "Total" = total **dentro da própria organização** (não na plataforma).
> Referência de produto; `PENDENTE DE DECISÃO` como sistema implementado.
> Escopo administrativo do Administrador dentro da org: `CONFIRMADO` como intenção.

| Módulo | Visualizar | Editar | Administrar |
|---|---|---|---|
| Dashboard | Total | Total | Total |
| Pipes | Total | Total | Total |
| Cards | Total | Total | Total |
| Database | Total | Total | Total |
| Automações | Total | Total | Total |
| E-mails | Total | Total | Total |
| IA | Total | Total | **Parcial** |
| Administração (da Org) | Total | Total | Total |

Observações:
- IA "Administrar Parcial" reflete que a IA da Fase 1 é básica/demonstrativa (RN-120/123). `CONFIRMADO` (escopo limitado).
- Nenhuma linha concede poder de **plataforma** — isso é Super Admin (§11).

---

## 10. Matriz resumida de permissões do Membro

> "Total" para Membro = ação permitida **dentro dos contextos concedidos**, não
> acesso irrestrito à organização inteira. `PENDENTE DE DECISÃO` como sistema.

| Módulo | Visualizar | Editar | Administrar |
|---|---|---|---|
| Dashboard | Total | — | — |
| Pipes | Total | Total | — |
| Cards | Total | Total | — |
| Database | Total | Total | — |
| Automações | Total | **Parcial** | — |
| E-mails | Total | Total | — |
| IA | Total | Total | — |
| Administração (da Org) | — | — | — |

Observações:
- Membro **não** administra (não configura a organização). `CONFIRMADO` (nome oficial "Membro"; legado no seed = "Editor").
- "Editar Parcial" em Automações: pode operar automações existentes, sem administrar o catálogo. `PENDENTE DE DECISÃO`.

### 10.1 Matriz do Convidado (conservadora)

> Referência conservadora; `PENDENTE DE DECISÃO` (Convidado não existe no seed).

| Módulo | Visualizar | Editar | Administrar |
|---|---|---|---|
| Dashboard | Parcial | — | — |
| Pipes | Parcial | — | — |
| Cards | Parcial | Parcial | — |
| Database | — | — | — |
| Automações | — | — | — |
| E-mails | — | — | — |
| IA | — | — | — |
| Administração (da Org) | — | — | — |

---

## 11. Regras do Super Admin

**Status atual:** `NÃO INTEGRADO AO PROTÓTIPO UNIFICADO · REFERÊNCIA SEPARADA`.

- Pertence à **Plataforma**. `CONFIRMADO` (como papel).
- **Não** é papel comum da Organização. `CONFIRMADO` (RN-161/162).
- **Não** deve aparecer no seletor comum de função da Organização. `PENDENTE DE DECISÃO` (UI a definir).
- Pode administrar: contas, organizações, usuários globais, configurações da
  plataforma e logs administrativos. `PENDENTE DE DECISÃO` (área não integrada).
- **Não** deve acessar silenciosamente dados operacionais de clientes sem uma
  futura regra de suporte/auditoria. `PENDENTE DE DECISÃO` (regra de suporte é
  `FORA DA FASE 1`, ver §18).

---

## 12. Regras do Administrador da Organização

- Administra **somente a própria organização** (RN-005/RN-150). `CONFIRMADO`.
- **Não** administra a plataforma (isso é Super Admin). `CONFIRMADO`.
- Tem acesso Total (dentro da org) aos módulos operacionais e à Administração da
  Organização, com IA em nível parcial (§9). `PENDENTE DE DECISÃO` como sistema;
  intenção `CONFIRMADO`.
- **Administrador da Organização ≠ Super Admin.** `CONFIRMADO` (RN-161).

---

## 13. Regras do Membro

- Usuário **operacional** dentro dos contextos permitidos. `CONFIRMADO` (nome oficial).
- Opera pipes, cards, database, e-mails e IA; **não** administra a organização (§10).
- No protótipo, aparece como `orgRole: Editor` (**nome legado/técnico**). Mapeamento oficial: **Editor → Membro**. `CONFIRMADO`.

---

## 14. Regras do Convidado

- Acesso **limitado** (§10.1). `CONFIRMADO` (nome oficial).
- No protótipo, aparece como `orgRole: Visualizador` (**nome legado/técnico**). Mapeamento oficial: **Visualizador → Convidado** (Organização) **ou Somente leitura** (Pipe), conforme contexto; `PENDENTE DE DECISÃO` quando o contexto não permitir mapear com segurança.
- Não acessa Database, Automações, E-mails, IA nem Administração.

---

## 15. Regras de acesso ao Pipe

- Acesso a um pipe é governado por **papéis de pipe** (§7), independentes do
  papel de organização. `PENDENTE DE DECISÃO`.
- `locked` (pipe bloqueado) e `starred` (favorito) são **atributos do pipe**, não
  permissões de usuário. `CONFIRMADO` (existem no seed) — não confundir com controle de acesso.
- "Somente leitura", "Visão restrita" e "Apenas formulário inicial" pertencem a
  este nível, **não** ao da Organização. `PENDENTE DE DECISÃO`.

---

## 16. Regras de acesso ao Card

- Acesso a um card é governado por **papéis de card** (§8). `PENDENTE DE DECISÃO`.
- "Responsável", "Observador", "Comentador" e "Restrito ao próprio" pertencem a
  este nível. `PENDENTE DE DECISÃO`.
- O seed só registra `creator`; criador não implica responsável. `CONFIRMADO`
  (existe `creator`); papel "Responsável" `PENDENTE DE DECISÃO`.

---

## 17. Ações permitidas por módulo

> Resumo por módulo, do mais permissivo (Admin da Org) ao mais restrito
> (Convidado). Referência de produto; `PENDENTE DE DECISÃO` como implementação.

- **Dashboard** — Admin Org: Total · Membro: ver · Convidado: parcial. `CONFIRMADO` que o dashboard é somente-visualização de agregados.
- **Pipes** — Admin Org: administrar/editar/ver · Membro: editar/ver · Convidado: ver parcial. `PENDENTE DE DECISÃO`.
- **Cards** — Admin Org: total · Membro: editar/ver · Convidado: parcial (ver/editar limitado). `PENDENTE DE DECISÃO`.
- **Database** — Admin Org: total · Membro: editar/ver · Convidado: sem acesso. `PENDENTE DE DECISÃO`.
- **Automações** — Admin Org: total · Membro: editar parcial · Convidado: sem acesso. Ação HTTP externa `FORA DA FASE 1` (RN-102).
- **E-mails** — Admin Org: total · Membro: editar/ver · Convidado: sem acesso. Envio real inexistente no protótipo (RN-113).
- **IA** — Admin Org: administrar parcial · Membro: editar/ver · Convidado: sem acesso. Escopo básico (RN-120/123).
- **Administração da Organização** — só Admin da Org. `CONFIRMADO` (RN-150).
- **Super Admin** — só Super Admin da plataforma. `NÃO CONFIRMADO` como área integrada.

---

## 18. O que fica fora da Fase 1

Marcados `FORA DA FASE 1` (não documentar como funcional):

- Permissões extremamente granulares (por campo/ação).
- Editor avançado de permissões.
- Acesso de suporte com *impersonation*.
- SAML/SSO avançado.
- Marketplace de permissões.
- Billing enterprise.
- API externa · Webhooks · MCP (RN-180).

---

## 19. Pendências de decisão

1. **Nomenclatura da Organização:** `CONFIRMADO` — oficial é Administrador da Organização / Membro / Convidado. `Editor`/`Visualizador` são nomes legados/técnicos do seed (Editor → Membro; Visualizador → Convidado ou Somente leitura). Resta `PENDENTE DE DECISÃO` apenas o mapeamento de `Visualizador` quando o contexto não permitir decidir entre Convidado e Somente leitura.
2. **Papéis de Pipe** (Admin do Pipe, Somente leitura, Visão restrita, Apenas formulário inicial) — não existem no seed. `PENDENTE DE DECISÃO`.
3. **Papéis de Card** (Responsável, Observador, Comentador, Restrito ao próprio) — não existem no seed. `PENDENTE DE DECISÃO`.
4. **"Membro da Plataforma" removido:** não é papel oficial da Fase 1. O valor `role: Membro` no seed é nome legado/técnico e não deve ser confundido com o **Membro da Organização**. `CONFIRMADO` (remoção); semântica do valor legado no seed `PENDENTE DE DECISÃO`.
5. **Área de Super Admin** integrada e suas permissões concretas. `NÃO CONFIRMADO`.
6. **Regra de suporte/auditoria** para Super Admin acessar dados de cliente. `FORA DA FASE 1` / `PENDENTE DE DECISÃO`.
7. **Conjunto exato de permissões** (o que "Editar" e "Administrar" incluem por módulo). `PENDENTE DE DECISÃO`.

---

## 20. Resumo final

- **Confirmado pelo protótipo:** dois eixos de papel no seed — Plataforma
  (`Super Admin` oficial; `Membro` é valor legado/técnico, **não** papel oficial) e
  Organização (`Administrador da Organização` oficial; `Editor` e `Visualizador`
  são legados/técnicos); separação Plataforma × Organização; Administrador administra
  só a própria org; atributos `locked`/`starred` do pipe não são permissões;
  `creator` no card.
- **Nomenclatura oficial (confirmada):** Plataforma → Super Admin; Organização →
  Administrador da Organização / Membro / Convidado; Pipe → Admin do Pipe / Membro
  do Pipe / Somente leitura / Visão restrita / Apenas formulário inicial; Card →
  Responsável / Observador / Comentador / Restrito ao próprio. Legados: Editor →
  Membro; Visualizador → Convidado ou Somente leitura, conforme contexto.
- **Pendente (implementação):** papéis de Pipe e de Card ainda não existem no seed;
  matrizes Visualizar/Editar/Administrar por módulo; mapeamento de `Visualizador`
  quando o contexto não permitir escolher entre Convidado e Somente leitura.
- **Fora da Fase 1:** granularidade extrema, editor de permissões, impersonation,
  SSO avançado, marketplace, billing, API/Webhooks/MCP.
- **Super Admin:** área da Plataforma, distinta do Administrador da Organização;
  status `NÃO INTEGRADO AO PROTÓTIPO UNIFICADO · REFERÊNCIA SEPARADA`.

> Regra final deste documento: as matrizes são um **ponto de partida**, não um
> sistema implementado. Nenhuma pendência foi convertida em certeza.
