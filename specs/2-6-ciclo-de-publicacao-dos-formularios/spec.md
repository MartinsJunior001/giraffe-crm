# Spec — Story 2.6 (ciclo de publicação dos Formulários)

> Rastreabilidade: FR-14; PRD D3.2 (ciclo dos Formulários e publicação); AD-11/AD-12 (identidade estável,
> versionamento); epics.md Story 2.6. Depende da 2.4 (Formulário/Campo) e 2.5 (evolução de Campos).

## Objetivo
Congelar a definição de um Formulário numa **versão publicada imutável** (`FormVersion`) e gerir o ciclo
rascunho → publicar → despublicar. O rascunho continua sendo `Form`+`Field` editável; publicar tira um snapshot
integral e ordenado; editar depois não toca versões publicadas.

## Escopo
- Publicar o Formulário (inicial e de Fase): valida o rascunho, monta o snapshot, cria `FormVersion` numerada.
- Despublicar: zera o ponteiro da versão ativa, preservando versões e dados.
- Ler estado de publicação + histórico e o snapshot de uma versão.
- Isolamento por RLS; imutabilidade pelo GRANT; autorização "config do Pipe".

## Fora de escopo
Submissão/Card (2.7+), referência de resposta a `formVersionId`, mudança de tipo de Campo, travas de
arquivamento sob uso, pré-visualização com submissão simulada, atributo de obrigatoriedade em `Field`.

## Decisão de modelo
SNAPSHOT JSON IMUTÁVEL VERSIONADO (baseline adotado — ver `gate_arquitetura` da Story e a decisão do
Architecture Agent). Nova tabela `FormVersion`; sem linhas versionadas por Campo.
