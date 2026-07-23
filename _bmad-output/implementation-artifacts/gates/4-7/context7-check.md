# context7-check — Story 4.7

**Fonte:** MCP Context7 `/prisma/web` (redirecionado de `/prisma/docs`). Baseline: `package.json` — Prisma 6.19.3, NestJS 11.

## APIs verificadas (nenhuma inventada — todas confirmadas + já em uso na base)
- **`aggregate({ where, _min: { createdAt: true } })`** — confirmado (`avg()/min()/max()` sobre `createdAt`).
  Usado em `inicioDaCadeia` para o início da cadeia (timeout). Padrão idêntico ao já usado na base.
- **Tratamento de `P2002`** — confirmado: `err.code === 'P2002'` (`PrismaClientKnownRequestError`). Usado em
  `registrarVisita`/`enfileirarUmaExecucao`/executores. **Nota crítica** (comportamento do PostgreSQL, não da
  API): um erro dentro de uma tx interativa ABORTA a tx — por isso `registrarVisita` LÊ antes de inserir e a
  criação da Execução é passo separado (não se captura P2002 no meio da tx da Execução para continuar).
- **`findFirst({ where })`** — confirmado (checagem de existência eficiente). Usado no dedup e na leitura da visita.
- **`$transaction(async (tx) => …)`** + `$queryRaw`/`FOR UPDATE SKIP LOCKED` — reuso do padrão 4.6 (já validado).
- **`ALTER TYPE ... ADD VALUE`** — precedente nas migrations `..._membership_state_events`/`..._membership_removal`.

## NestJS 11
- Nenhum provider/módulo/controller/decorator novo. O motor 4.6 já é `@Injectable`; a 4.7 é edição aditiva do
  serviço + núcleo puro + migration. Sem superfície de framework nova a verificar.

**Veredito:** APROVADO — nenhuma assinatura/opção/versão inventada; documentação atual não contradiz o plano.
