# Especificação — Integração FR-32: Pipes relacionados no Perfil (Story 2.18)

## Contexto

FR-32 (suporte; proprietário principal = Épico 1). Exibir no Perfil apenas os Pipes reais da Organização atual a que o usuário está relacionado (nome, estado, papel/nível efetivo), somente leitura, respeitando a autorização, **sem conceder acesso**. Substitui o estado honesto de indisponibilidade que o Perfil (1.11) exibia antes de existirem Pipes.

## Requisitos funcionais

- **FR-2.18-1** — Listar os Pipes relacionados reais (nome/estado/papel efetivo), em leitura.
- **FR-2.18-2** — Pipe sem acesso não é listado nem revelado (não-enumeração).
- **FR-2.18-3** — Listar não concede acesso (leitura pura; Pipe fora do acesso segue 404 em `obter`).
- **FR-2.18-4** — Sem Pipes relacionados → lista vazia (ausência honesta), sem dado fictício.

## Critérios de aceite

Ver CA1–CA4 na story md.

## Decisões / invariantes

- **Sem migration, sem GRANT novo.** Reusa `Pipe`/`PipeGrant`/`Membership` e a MESMA resolução de acesso do catálogo (`PipesService.listar`, 2.1/2.2).
- **Papel/nível efetivo** derivado do `PipeGrant.role` (`ADMIN→gerenciar`, `MEMBER→operar`, `VIEWER→ler`), como `resolverPoderNoPipe` — mesma regra, não 2ª verdade.
- **Autorização = catálogo:** Admin da Org vê todos; não-Admin só os com `PipeGrant` ACTIVE. Guarda FINA no serviço.

## Fora de escopo

Edição de Perfil/conta (E1); consumo visual no Perfil (Web, E1); administração de terceiros.

## Assunções

- Contexto organizacional resolvido ⇒ Membership ACTIVE (org-context.resolver). `orgId` fora do payload.
- Endpoint `GET /pipes/related`; consumo visual é do Épico 1.
