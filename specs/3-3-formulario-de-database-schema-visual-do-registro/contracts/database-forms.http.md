# Contrato HTTP — Formulário de Database (Story 3.3)

Todas sob `@Controller('databases/:databaseId')`, `@Requer('ler','Database')` (guarda grossa; fina no serviço).
`orgId` nunca no payload. Sem rota de exclusão. Sem rota de Registro/submissão (3.4).

## Montagem (2.4)
- `GET  /databases/:databaseId/form` → 200 `FormularioVisao` (id null se não materializado; ler não cria). Poder: ler.
- `POST /databases/:databaseId/form/fields` → **201** `CampoVisao` (materializa o Form no 1º Campo). Poder: gerenciar.
- `POST /databases/:databaseId/form/fields/reorder` → **200** `CampoVisao`. Poder: gerenciar.

## Evolução de Campo (2.5)
- `PATCH /databases/:databaseId/form/fields/:fieldId` → 200 (edita rótulo/ajuda/valor padrão; não `type`). gerenciar.
- `POST  /databases/:databaseId/form/fields/:fieldId/archive` → 200. gerenciar.
- `POST  /databases/:databaseId/form/fields/:fieldId/restore` → 200 (restaura ao fim da ordem ativa). gerenciar.
- Opções de Seleção: `POST .../fields/:fieldId/options`, `PATCH .../options/:optionId`,
  `POST .../options/:optionId/archive|restore`, `POST .../options/reorder` — espelham 2.5. gerenciar.

## Publicação (2.6)
- `POST /databases/:databaseId/form/publish` → 200 `VersaoDetalhe` (snapshot imutável; gate de Arquivo). gerenciar.
- `POST /databases/:databaseId/form/unpublish` → 200 `EstadoPublicacao`. gerenciar.
- `GET  /databases/:databaseId/form/publication` → 200 `EstadoPublicacao`. ler.
- `GET  /databases/:databaseId/form/versions/:version` → 200 `VersaoDetalhe`. ler.

## Status codes
- 201: criar Campo. 200: obter/reorder/editar/arquivar/restaurar/publicar/despublicar/ler.
- 400: entrada inválida (id malformado, `typeConfig` fora da allowlist, publicar rascunho inválido).
- 403: MEMBER/VIEWER do Database ao mutar (só leem). 404: sem acesso ao Database (não-enumerante) / owner inválido.
- 409: conflito de número de versão na publicação (UNIQUE) / guarda otimista de `typeConfig`.
