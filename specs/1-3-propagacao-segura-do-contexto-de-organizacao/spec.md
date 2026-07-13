# Spec — Story 1.3: Propagação segura do contexto de Organização

## Contexto

A Story 1.2 tornou o **banco** o guardião do isolamento: RLS `FORCE`, deny-by-default, sem
caminho de bypass. Mas o banco responde à pergunta que lhe fazem. Quem decide **qual
Organização** está no contexto é a aplicação — e hoje ela não decide: `withTenantContext` aceita
qualquer `orgId` que lhe entreguem.

Esta Story faz a aplicação decidir, e decidir **a partir do servidor**.

## Requisitos funcionais

| ID | Requisito |
| --- | --- |
| **FR-301** | O contexto de Organização é **resolvido no servidor**, a partir de uma Membership do principal autenticado. Nenhuma outra fonte é aceita. |
| **FR-302** | Só Membership com `state = ACTIVE` concede contexto. `SUSPENDED` e `REMOVED` **não** concedem. |
| **FR-303** | Requisição sem contexto organizacional válido é **rejeitada** com resposta sanitizada (`401` sem principal; `403` com principal sem Membership ACTIVE na Org pedida). Nunca `500`. Nunca resultado vazio simulando sucesso. |
| **FR-304** | `orgId` recebido do cliente **nunca é fonte de autoridade**. Se o contrato da rota o exige e ele **diverge** do contexto resolvido, a operação é **rejeitada**. Se não é necessário, é **ignorado**. |
| **FR-305** | O contexto vive por requisição, propagado sem passagem manual de parâmetro (`AsyncLocalStorage`), e **não** sobrevive ao fim da requisição. |
| **FR-306** | Ler o contexto **fora** de uma requisição **lança**. Não devolve `undefined` — `undefined` vira "sem contexto", e "sem contexto" vira "qualquer contexto" no primeiro `if` mal escrito. |
| **FR-307** | Toda query organizacional continua passando pela extensão da 1.2, que aplica `set_config(..., true)` **dentro da transação**. O contexto da aplicação **não substitui** o contexto do banco. |
| **FR-308** | Existe **contrato tipado e documentado** (`TenantEnvelope`) de propagação para jobs, filas, eventos e cache (AD-8). Apenas o contrato. |
| **FR-309** | A resolução do contexto é **auditável**: sucesso e rejeição aparecem no log estruturado, sanitizados. |

## Critérios de sucesso (verificáveis)

| ID | Critério |
| --- | --- |
| **SC-301** | Requisição com principal + Membership ACTIVE ⇒ contexto resolvido e query enxerga **apenas** a Org resolvida. |
| **SC-302** | Requisição sem principal ⇒ **401**, corpo sanitizado. |
| **SC-303** | Principal com Membership em Org A pedindo Org B ⇒ **403**. Nenhuma linha da Org B é lida. |
| **SC-304** | Principal com Membership `SUSPENDED`/`REMOVED` ⇒ **403**. |
| **SC-305** | `orgId` forjado divergente do resolvido ⇒ **rejeitado** (não "corrigido em silêncio"). |
| **SC-306** | **Concorrência:** N requisições simultâneas de Organizações diferentes ⇒ **nenhuma** enxerga dado de outra. Teste real, paralelo de verdade. |
| **SC-307** | Ler o contexto fora de requisição ⇒ **lança**. |
| **SC-308** | Contexto **não vaza** entre requisições sequenciais na mesma conexão/worker. |
| **SC-309** | Provider real de principal, em produção, **nega** — não existe backdoor de identidade antes da Story 1.4. |

## Edge cases

- Principal existe, mas **nenhuma** Membership ACTIVE em Organização alguma → rejeitado (a Story
  1.4 é quem tratará o "estado honesto sem Organização" na UX; aqui é rejeição).
- Principal com Memberships em **várias** Organizações e **nenhuma** indicação de qual usar →
  rejeitado. Escolher uma por conta própria seria a plataforma decidindo em nome do usuário; a
  escolha explícita é da Story 1.9.
- `orgId` sintaticamente inválido (não-UUID) → rejeitado como qualquer divergência, sem estourar
  erro de driver.
- Conta cuja Membership é **removida no meio** de uma requisição já iniciada → a requisição
  corrente conclui com o contexto que resolveu; a **próxima** é rejeitada. Revogação imediata de
  sessão é escopo da 1.5/1.6.

## Fora do escopo

Login/sessão (1.4) · autorização por papel (1.6) · troca de Organização (1.9) · implementação de
filas/eventos/cache/WebSocket (Épicos que os introduzirem).
