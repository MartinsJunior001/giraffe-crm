# Contrato de reinscrição em tempo real e invalidação de cache (Story 1.9)

> **Este documento é a entrega do AC-4 oficial:** *"existe um contrato documentado de reinscrição em
> tempo real, **sem implementá-la aqui**"* (`epics.md` §1.9). Rastreabilidade: **AD-21** (tempo real),
> **AD-23** (cache), **AD-8** (propagação de contexto).

## Por que é contrato, e não código

Não existe Socket.IO nem Redis no projeto. Implementar reinscrição ou invalidação agora seria criar
abstração sem consumidor — proibido pela Constitution II e pelo `kernel/README.md`. O que a 1.9 deve
garantir é que, **quando** esses mecanismos chegarem, eles não tenham liberdade para reabrir o
isolamento que esta Story fecha.

O ponto de extensão é **um só e já existe**: a troca passa por `OrganizacaoAtivaService.trocar()`.
Qualquer efeito de tempo real ou cache pendura-se ali, depois da persistência bem-sucedida.

## O que a 1.9 já garante — e que o consumidor futuro NÃO precisa refazer

| Garantia | Onde |
|---|---|
| A Organização ativa é resolvida por requisição, contra a Membership **ATIVA** | `OrgContextResolver` |
| Preferência de sessão **nunca** concede acesso | `origem: 'preferencia'` caduca sem conceder |
| Todo dado organizacional passa por RLS com o `orgId` resolvido | `withTenantContext` |
| A ability é reconstruída a cada requisição | `construirAbility` — **não há cache de ability a invalidar** |

## Contrato para o Épico que introduzir Socket.IO (AD-21)

1. **A fonte persistida é a autoridade.** A conexão em tempo real **não** carrega contexto próprio:
   ela reflete o que a sessão e a Membership dizem no momento de cada evento.
2. **Revalidar ao conectar, ao assinar e ao trocar de Organização.** A troca **não** pode reaproveitar
   inscrições anteriores; assinaturas da Organização anterior são encerradas **antes** de qualquer
   assinatura nova.
3. **Uma conexão viva não é permissão viva.** Revogar/suspender a Membership derruba a entrega, mesmo
   sem o cliente reconectar — pelo mesmo motivo que a preferência obsoleta não concede acesso.
4. **Tempo real é best-effort** (AD-21): perder um evento pode degradar a UX, nunca a correção. Nada
   de autorização pode depender da entrega.
5. **Ponto de extensão:** após a persistência em `trocar()`, e **somente** em caso de sucesso — uma
   troca que falhou não pode emitir efeito de troca.

## Contrato para o Épico que introduzir Redis (AD-23)

1. **Cache é derivado, nunca fonte de verdade, nunca base de autorização.**
2. **Chave obrigatoriamente tenant-scoped.** Nenhuma entrada pode ser alcançável a partir de outra
   Organização; o `orgId` faz parte da chave, não do valor.
3. **Invalidação na troca**, e também em mudança de papel ou de estado de Membership.
4. **Falha de cache nunca vira acesso.** Cache indisponível ⇒ recalcula; nunca "assume o último valor".

## Fora deste contrato

Busca multi-org (OQ-49/Fase 2) · entrega de notificações (E5) · reconexão/retry de transporte ·
qualquer decisão de produto sobre o que é notificado.
