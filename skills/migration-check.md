# Migration Check

## Objetivo

Garantir que toda alteração de schema, estrutura, dados ou infraestrutura persistente do Giraffe CRM seja planejada, executada e validada de forma segura.

Esta skill deve proteger:

* integridade dos dados;
* isolamento multiempresa;
* compatibilidade entre versões;
* disponibilidade do sistema;
* rastreabilidade;
* possibilidade de recuperação;
* conformidade com a LGPD;
* continuidade de APIs, workers, filas, integrações e automações.

Esta skill deve impedir:

* perda ou corrupção de dados;
* migrations destrutivas sem estratégia;
* alterações incompatíveis com o código em produção;
* remoção prematura de colunas ou tabelas;
* locks prolongados;
* indisponibilidade não planejada;
* backfills sem controle;
* mistura de dados entre tenants;
* migrations sem backup;
* migrations sem rollback ou compensação;
* execução direta de alterações não versionadas;
* uso de atalhos inseguros em produção;
* alterações sem validação prévia e posterior.

---

## Quando esta skill deve ser usada

Esta skill deve ser aplicada sempre que houver:

* criação de tabela;
* alteração de tabela;
* remoção de tabela;
* criação de coluna;
* remoção de coluna;
* alteração de tipo;
* alteração de nulabilidade;
* alteração de valor padrão;
* criação ou remoção de índice;
* criação ou alteração de constraint;
* alteração de chave estrangeira;
* alteração de chave primária;
* alteração de enum;
* transformação de dados;
* backfill;
* exclusão em massa;
* importação em massa;
* migração entre tabelas;
* migração entre tenants;
* mudança de ORM;
* mudança de banco;
* mudança de storage;
* migração de arquivos;
* migração de embeddings;
* migração de índices de busca;
* migração de filas;
* alteração relevante na persistência do Redis;
* mudança na estratégia de particionamento;
* atualização da versão principal do PostgreSQL.

A sequência recomendada é:

1. `technical-docs-check.md`;
2. `pre-implementation-check.md`;
3. `safe-implementation.md`;
4. `code-review.md`;
5. `security-check.md`;
6. `lgpd-check.md`;
7. `observability-check.md`;
8. `backup-check.md`;
9. `migration-check.md`.

---

## Regra principal

Nenhuma migration deve ser executada em produção sem:

* objetivo definido;
* escopo documentado;
* análise dos dados existentes;
* impacto avaliado;
* risco classificado;
* backup validado;
* estratégia de compatibilidade;
* plano de execução;
* plano de rollback ou compensação;
* testes em ambiente representativo;
* observabilidade;
* responsável definido;
* critérios de sucesso;
* critérios de interrupção;
* validação pós-execução.

Uma migration não deve ser tratada apenas como um arquivo gerado pelo ORM.

Ela deve ser tratada como uma alteração de produção com impacto potencial sobre dados, disponibilidade, integrações e usuários.

---

# Princípios obrigatórios

Toda migration deve seguir:

* expansão antes de contração;
* compatibilidade progressiva;
* alterações pequenas;
* preservação dos dados;
* idempotência quando aplicável;
* validação antes e depois;
* reversibilidade sempre que possível;
* compensação quando rollback não for possível;
* execução observável;
* isolamento multiempresa;
* redução de locks;
* controle de volume;
* backup prévio;
* documentação;
* separação entre schema e processamento pesado;
* liberação gradual quando necessário.

---

# Classificação de risco

## Baixo risco

Exemplos:

* criação de tabela vazia;
* adição de coluna opcional;
* criação de índice em tabela pequena;
* criação de entidade ainda não utilizada;
* alteração compatível sem dados existentes.

Controles mínimos:

* revisão do SQL;
* teste local;
* validação do schema;
* plano simples de rollback.

---

## Médio risco

Exemplos:

* backfill moderado;
* criação de constraint;
* criação de índice em tabela relevante;
* alteração de relacionamento;
* atualização de dados existentes;
* mudança em tabela utilizada por uma funcionalidade secundária.

Controles obrigatórios:

* backup;
* teste em homologação;
* estimativa de duração;
* validação de volume;
* rollback ou compensação;
* monitoramento.

---

## Alto risco

Exemplos:

* alteração de tipo;
* introdução de coluna obrigatória;
* backfill em tabela grande;
* renomeação utilizada por múltiplos consumidores;
* alteração de enum em produção;
* alteração de relacionamento central;
* criação de índice pesado;
* alteração com lock relevante;
* migração de storage;
* migração de arquivos;
* alteração na tabela de usuários, cards, contatos ou conversas.

Controles obrigatórios:

* execução em fases;
* expand and contract;
* dry run;
* backup validado;
* janela operacional;
* métricas e alertas;
* plano de rollback testado;
* responsável disponível durante a execução.

---

## Crítico

Exemplos:

* remoção de coluna;
* remoção de tabela;
* exclusão em massa;
* mudança de chave primária;
* alteração irreversível;
* migração entre tenants;
* migração entre bancos;
* mudança em dados de autenticação;
* alteração em permissões;
* transformação de dados pessoais em grande volume;
* migration que pode causar indisponibilidade relevante;
* migration sem rollback viável.

Controles obrigatórios:

* aprovação explícita;
* backup testado;
* plano detalhado;
* ambiente equivalente;
* execução controlada;
* estratégia de recuperação;
* validação multiempresa;
* acompanhamento em tempo real;
* critérios automáticos de interrupção.

---

# Processo obrigatório

## Etapa 1 — Identificar a migration

Registrar:

* story;
* tarefa;
* objetivo;
* problema atual;
* schema atual;
* schema desejado;
* dados afetados;
* módulos afetados;
* integrações afetadas;
* risco inicial;
* itens fora do escopo.

---

## Etapa 2 — Mapear consumidores

Identificar todos os consumidores da estrutura alterada:

* backend;
* frontend;
* APIs;
* workers;
* filas;
* automações;
* WebSockets;
* integrações externas;
* webhooks;
* dashboards;
* relatórios;
* importações;
* exportações;
* jobs agendados;
* scripts administrativos;
* ferramentas de suporte;
* consultas manuais;
* índices de busca;
* embeddings;
* versões antigas da aplicação;
* jobs já persistidos.

Nenhuma estrutura deve ser removida antes de confirmar que deixou de ser utilizada.

---

## Etapa 3 — Analisar os dados existentes

Verificar:

* volume de registros;
* crescimento esperado;
* valores nulos;
* duplicidades;
* registros órfãos;
* dados inconsistentes;
* valores inválidos;
* distribuição por tenant;
* registros antigos;
* dados pessoais;
* dados sensíveis;
* tamanho das tabelas;
* índices existentes;
* constraints existentes;
* volume de leitura;
* volume de escrita;
* horário de maior uso;
* dependências externas.

---

## Etapa 4 — Definir a estratégia

Avaliar:

* migration única;
* migration em fases;
* expand and contract;
* dual read;
* dual write;
* shadow column;
* tabela intermediária;
* backfill assíncrono;
* backfill em lotes;
* feature flag;
* migration por tenant;
* janela de manutenção;
* deploy coordenado;
* roll forward;
* rollback;
* script de compensação.

Migrations de risco médio, alto ou crítico devem preferir execução em fases.

---

## Etapa 5 — Validar antes da execução

Confirmar:

* ambiente correto;
* branch correta;
* commit correto;
* migration correta;
* ordem correta;
* backup concluído;
* acesso ao backup;
* espaço em disco;
* saúde do banco;
* replicação;
* workers;
* filas;
* integrações;
* alertas;
* responsáveis;
* janela de execução;
* critérios de interrupção;
* rollback.

---

## Etapa 6 — Executar com observabilidade

Durante a migration, acompanhar:

* tempo decorrido;
* progresso;
* registros processados;
* registros falhos;
* locks;
* conexões;
* CPU;
* memória;
* disco;
* WAL;
* latência;
* erros de aplicação;
* respostas 5xx;
* filas;
* workers;
* replicação;
* integrações.

---

## Etapa 7 — Validar após a execução

Confirmar:

* schema correto;
* migration aplicada;
* aplicação iniciando;
* APIs funcionando;
* autenticação funcionando;
* permissões funcionando;
* isolamento multiempresa;
* dados preservados;
* dados transformados corretamente;
* índices criados;
* constraints ativas;
* workers funcionando;
* filas saudáveis;
* integrações saudáveis;
* automações funcionando;
* métricas normais;
* ausência de aumento anormal de erros.

---

# Expand and Contract

## Fase 1 — Expand

Adicionar a nova estrutura sem remover a anterior.

Exemplos:

* nova coluna opcional;
* nova tabela;
* novo relacionamento;
* nova estrutura de dados;
* novo campo de enum compatível.

O código antigo deve continuar funcionando.

---

## Fase 2 — Transição

Durante a transição, podem ser utilizados:

* dual write;
* dual read;
* backfill;
* feature flag;
* validação de consistência;
* shadow traffic;
* monitoramento comparativo.

A aplicação deve tolerar temporariamente os dois formatos.

---

## Fase 3 — Contract

Remover a estrutura antiga somente após:

* todos os consumidores terem sido atualizados;
* o backfill estar concluído;
* os dados terem sido validados;
* o uso antigo estar zerado;
* o período de estabilização ter terminado;
* o backup estar confirmado;
* o rollback não depender mais da estrutura removida;
* a remoção ter sido planejada para uma release posterior.

---

# Checklist por tipo de alteração

## 1. Criação de tabela

Verificar:

* [ ] A tabela é necessária.
* [ ] O nome segue o padrão.
* [ ] A chave primária foi definida.
* [ ] O tenant foi incluído quando necessário.
* [ ] Datas de criação e atualização foram avaliadas.
* [ ] Soft delete foi avaliado.
* [ ] Índices foram avaliados.
* [ ] Constraints foram avaliadas.
* [ ] Chaves estrangeiras foram avaliadas.
* [ ] Retenção foi definida.
* [ ] Dados pessoais foram classificados.
* [ ] Permissões foram consideradas.
* [ ] Auditoria foi considerada.
* [ ] A tabela pode ser removida com segurança caso o deploy falhe.

---

## 2. Criação de coluna

Verificar:

* [ ] O campo é necessário.
* [ ] O tipo é adequado.
* [ ] A nulabilidade está correta.
* [ ] O valor padrão foi avaliado.
* [ ] O tamanho foi definido.
* [ ] O backfill foi planejado.
* [ ] O índice foi avaliado.
* [ ] A classificação LGPD foi realizada.
* [ ] O código antigo tolera a coluna.
* [ ] O código novo tolera valores ausentes durante a transição.

---

## 3. Coluna obrigatória

Não adicionar diretamente uma coluna obrigatória em tabela populada sem estratégia.

Fluxo recomendado:

1. criar coluna opcional;
2. publicar código que preencha a coluna;
3. executar backfill;
4. validar ausência de nulos;
5. aplicar `NOT NULL`;
6. monitorar;
7. remover compatibilidades temporárias posteriormente.

Verificar:

* [ ] Novas gravações já preenchem o campo.
* [ ] O backfill foi concluído.
* [ ] Nenhum registro permanece nulo.
* [ ] A constraint foi validada.
* [ ] O rollback foi considerado.

---

## 4. Alteração de tipo

Verificar:

* [ ] Todos os valores atuais podem ser convertidos.
* [ ] Não ocorrerá truncamento.
* [ ] Não ocorrerá perda de precisão.
* [ ] Datas e timezone foram considerados.
* [ ] Valores monetários foram considerados.
* [ ] O ORM suporta o tipo.
* [ ] Índices continuam válidos.
* [ ] Queries continuam compatíveis.
* [ ] O tempo de lock foi avaliado.
* [ ] Uma nova coluna seria mais segura.
* [ ] Valores inválidos possuem tratamento.

Estratégia recomendada para alterações de alto risco:

1. criar nova coluna;
2. aplicar dual write;
3. executar backfill;
4. validar equivalência;
5. trocar leitura;
6. desativar escrita antiga;
7. remover coluna anterior em release posterior.

---

## 5. Renomeação de coluna

Renomeações diretas podem quebrar aplicações durante deploy progressivo.

Fluxo recomendado:

1. criar nova coluna;
2. escrever nas duas colunas;
3. copiar os dados;
4. alterar as leituras;
5. validar;
6. encerrar escrita antiga;
7. remover coluna anterior posteriormente.

Verificar:

* [ ] Todos os consumidores foram identificados.
* [ ] Relatórios foram atualizados.
* [ ] Workers foram atualizados.
* [ ] APIs foram avaliadas.
* [ ] O rollback continua possível.
* [ ] A remoção ocorrerá em release separada.

---

## 6. Remoção de coluna ou tabela

Verificar:

* [ ] Não existe consumidor ativo.
* [ ] O uso antigo foi monitorado.
* [ ] O dado não é necessário para auditoria.
* [ ] O dado não possui retenção legal.
* [ ] O dado foi exportado quando necessário.
* [ ] Existe backup.
* [ ] A remoção foi aprovada.
* [ ] O rollback está documentado.
* [ ] Jobs antigos não utilizam a estrutura.
* [ ] Relatórios históricos foram considerados.
* [ ] A remoção ocorrerá apenas após estabilização.

Remoções devem ocorrer somente na fase de contração.

---

## 7. Índices

Verificar:

* [ ] Existe uma query real que justifique o índice.
* [ ] A ordem das colunas é adequada.
* [ ] A seletividade foi avaliada.
* [ ] O tamanho foi estimado.
* [ ] O custo de escrita foi considerado.
* [ ] Não existe índice equivalente.
* [ ] O tenant está incluído quando necessário.
* [ ] A criação concorrente foi avaliada.
* [ ] O espaço em disco foi validado.
* [ ] O tempo de criação foi estimado.
* [ ] A remoção de índices antigos foi avaliada.
* [ ] O plano de execução foi analisado.

Em PostgreSQL, considerar `CREATE INDEX CONCURRENTLY` quando aplicável.

Observar que essa operação possui restrições transacionais e deve ser revisada manualmente.

---

## 8. Constraints

Verificar:

* [ ] Os dados atuais cumprem a constraint.
* [ ] Duplicidades foram tratadas.
* [ ] Registros órfãos foram tratados.
* [ ] O lock foi avaliado.
* [ ] A constraint pode ser validada progressivamente.
* [ ] A mensagem de erro da aplicação foi ajustada.
* [ ] O tenant está incluído em constraints compostas quando necessário.
* [ ] O comportamento de exclusão foi definido.
* [ ] A constraint representa regra real de negócio.
* [ ] O rollback foi planejado.

---

## 9. Chaves estrangeiras

Verificar:

* [ ] A relação está correta.
* [ ] Todos os registros possuem referência válida.
* [ ] As entidades pertencem ao mesmo tenant.
* [ ] `ON DELETE` foi definido.
* [ ] `ON UPDATE` foi definido.
* [ ] Cascades foram analisadas.
* [ ] O índice da chave foi considerado.
* [ ] Locks foram avaliados.
* [ ] Registros órfãos foram tratados.
* [ ] Importações continuam compatíveis.
* [ ] Exclusões em massa não terão efeito inesperado.

---

## 10. Unicidade multiempresa

A regra de unicidade deve refletir se o dado é global ou limitado ao tenant.

Exemplo possivelmente incorreto:

```sql
UNIQUE (email)
```

Exemplo possível em ambiente multiempresa:

```sql
UNIQUE (tenant_id, email)
```

Verificar:

* [ ] A regra é global ou por tenant.
* [ ] A constraint reflete a regra de negócio.
* [ ] Dados atuais não violam a regra.
* [ ] Normalização foi considerada.
* [ ] Maiúsculas e minúsculas foram consideradas.
* [ ] Espaços foram considerados.
* [ ] Valores nulos foram considerados.
* [ ] Soft delete foi considerado.

---

## 11. Enums

Verificar:

* [ ] O novo valor é compatível com versões anteriores.
* [ ] Aplicações antigas toleram valores desconhecidos.
* [ ] A remoção de valores foi evitada.
* [ ] Dados antigos foram migrados.
* [ ] Frontend e backend estão sincronizados.
* [ ] Workers foram atualizados.
* [ ] APIs externas foram avaliadas.
* [ ] O rollback é possível.
* [ ] Uma tabela de domínio seria mais flexível.
* [ ] O SQL gerado pelo ORM foi revisado.

---

## 12. Backfill

Backfills pesados devem ser separados de migrations estruturais.

Verificar:

* [ ] O volume foi estimado.
* [ ] O processamento será feito em lotes.
* [ ] Existe limite de concorrência.
* [ ] Existe checkpoint.
* [ ] O processo pode ser retomado.
* [ ] A operação é idempotente.
* [ ] O tenant é preservado.
* [ ] Existe monitoramento de progresso.
* [ ] O impacto no banco foi estimado.
* [ ] Existe pausa entre lotes quando necessário.
* [ ] Registros falhos são registrados.
* [ ] Registros falhos podem ser reprocessados.
* [ ] A validação final foi definida.
* [ ] O processo não bloqueia o deploy.
* [ ] Existe possibilidade de pausar ou cancelar.

---

## 13. Transformação de dados

Verificar:

* [ ] A regra está documentada.
* [ ] A transformação é determinística.
* [ ] Valores inválidos possuem tratamento.
* [ ] A reversão foi avaliada.
* [ ] O dado original será preservado temporariamente.
* [ ] Datas e timezone foram considerados.
* [ ] Encoding foi considerado.
* [ ] O tenant permanece inalterado.
* [ ] Dados sensíveis não aparecem em logs.
* [ ] A transformação foi testada com dados representativos.
* [ ] Perda de precisão foi avaliada.
* [ ] O resultado pode ser validado automaticamente.

---

## 14. Exclusão de dados

Verificar:

* [ ] A exclusão é necessária.
* [ ] A retenção foi validada.
* [ ] A LGPD foi considerada.
* [ ] O tenant está incluído no filtro.
* [ ] Existe backup.
* [ ] Existe dry run.
* [ ] O volume foi estimado.
* [ ] A exclusão ocorre em lotes.
* [ ] Cascades foram avaliadas.
* [ ] Arquivos relacionados foram avaliados.
* [ ] Índices e embeddings foram avaliados.
* [ ] Jobs não recriarão os dados.
* [ ] A auditoria necessária será preservada.
* [ ] Existe confirmação explícita.
* [ ] O resultado será validado.

---

## 15. Transações

Verificar:

* [ ] A migration pode executar em transação.
* [ ] O tamanho da transação é aceitável.
* [ ] Locks prolongados foram evitados.
* [ ] Operações incompatíveis com transação foram identificadas.
* [ ] Backfills pesados foram separados.
* [ ] O rollback transacional é suficiente.
* [ ] Falhas parciais foram consideradas.
* [ ] Estados intermediários são seguros.
* [ ] Não existe transação longa envolvendo chamadas externas.

---

## 16. Locks

Avaliar:

* tipo do lock;
* tabela afetada;
* tempo esperado;
* volume de escrita;
* volume de leitura;
* queries bloqueadas;
* risco de timeout;
* risco no pool;
* impacto em workers;
* impacto em APIs.

Verificar:

* [ ] O lock foi estimado.
* [ ] A migration pode ser dividida.
* [ ] Existe janela de menor uso.
* [ ] `lock_timeout` foi avaliado.
* [ ] `statement_timeout` foi avaliado.
* [ ] A operação pode ser cancelada.
* [ ] Alertas estão ativos.
* [ ] Existe critério de interrupção.
* [ ] O impacto foi testado.

---

## 17. Performance

Verificar:

* [ ] O volume real foi medido.
* [ ] O crescimento futuro foi considerado.
* [ ] O plano de execução foi analisado.
* [ ] O uso de CPU foi estimado.
* [ ] O uso de memória foi estimado.
* [ ] O uso de disco foi estimado.
* [ ] O WAL gerado foi considerado.
* [ ] A replicação foi considerada.
* [ ] O pool de conexões foi considerado.
* [ ] A duração foi testada.
* [ ] Queries críticas continuam performáticas.
* [ ] Índices novos não prejudicam excessivamente a escrita.
* [ ] O backfill possui limitação de carga.

---

# Isolamento multiempresa

Toda migration deve preservar o tenant.

Verificar:

* [ ] Toda transformação preserva `tenantId`.
* [ ] Relações não cruzam tenants.
* [ ] Backfills filtram corretamente por empresa.
* [ ] Constraints incluem o tenant quando necessário.
* [ ] Chaves compostas foram avaliadas.
* [ ] Registros órfãos não são atribuídos ao tenant incorreto.
* [ ] Scripts não usam tenant padrão.
* [ ] Caches e índices derivados continuam isolados.
* [ ] Embeddings continuam isolados.
* [ ] Arquivos continuam associados ao tenant correto.
* [ ] A validação pós-migration testa acesso entre tenants.
* [ ] A migration por tenant é rastreável.

Qualquer possibilidade de mistura entre empresas deve ser classificada como crítica.

---

# LGPD

Aplicar também a `lgpd-check.md`.

Verificar:

* [ ] A finalidade da transformação é legítima.
* [ ] Dados pessoais não são duplicados sem necessidade.
* [ ] Logs não contêm dados pessoais excessivos.
* [ ] Dados excluídos não serão recriados.
* [ ] A retenção foi respeitada.
* [ ] Dados sensíveis possuem proteção adicional.
* [ ] Dados de teste foram anonimizados.
* [ ] Backups seguem a política de retenção.
* [ ] Índices e embeddings foram atualizados.
* [ ] Direitos dos titulares continuam atendíveis.
* [ ] Transferências internacionais não foram introduzidas sem análise.
* [ ] A migration não altera a finalidade original dos dados.

---

# Segurança

Aplicar também a `security-check.md`.

Verificar:

* [ ] Scripts não contêm segredos.
* [ ] Credenciais são obtidas de forma segura.
* [ ] A migration não reduz controles de acesso.
* [ ] Permissões do banco foram avaliadas.
* [ ] Tabelas temporárias não expõem dados.
* [ ] Dumps intermediários são protegidos.
* [ ] Arquivos temporários são removidos.
* [ ] A execução é restrita.
* [ ] Alterações de permissões são auditadas.
* [ ] Dados não ficam públicos durante a transição.
* [ ] O script não aceita parâmetros arbitrários.
* [ ] Queries utilizam parâmetros seguros.

---

# Prisma

Quando Prisma for utilizado, verificar:

* [ ] O `schema.prisma` reflete a modelagem aprovada.
* [ ] A migration gerada foi revisada manualmente.
* [ ] O SQL gerado é seguro.
* [ ] Não existe `DROP` inesperado.
* [ ] Não existe recriação desnecessária de tabela.
* [ ] Alterações de enum foram revisadas.
* [ ] Índices estão corretos.
* [ ] Constraints compostas estão corretas.
* [ ] O Prisma Client foi regenerado.
* [ ] A compatibilidade entre client e banco foi validada.
* [ ] `prisma migrate deploy` será utilizado em produção.
* [ ] `prisma db push` não será utilizado como substituto de migration em produção.
* [ ] O drift foi verificado.
* [ ] Migrations antigas não foram alteradas após aplicadas.
* [ ] O histórico de migrations permanece consistente.
* [ ] O lock de migration foi considerado.
* [ ] O deploy não depende de execução manual não documentada.

---

# Regras para os arquivos de migration

Verificar:

* [ ] O nome descreve a alteração.
* [ ] A migration é imutável após aplicada.
* [ ] O arquivo foi versionado.
* [ ] O SQL foi revisado.
* [ ] A migration contém apenas alterações relacionadas.
* [ ] A ordem está correta.
* [ ] Dependências estão claras.
* [ ] Não existem dados sensíveis.
* [ ] Não existem credenciais.
* [ ] Comentários explicam decisões relevantes.
* [ ] O rollback ou compensação está documentado.
* [ ] Scripts auxiliares foram versionados.
* [ ] A execução repetida foi avaliada.

---

# Backup obrigatório

Antes de migrations de risco médio, alto ou crítico, aplicar a `backup-check.md`.

Confirmar:

* [ ] Backup criado.
* [ ] Backup íntegro.
* [ ] Backup acessível.
* [ ] Local registrado.
* [ ] Horário registrado.
* [ ] Commit registrado.
* [ ] Versão registrada.
* [ ] Restore testado quando necessário.
* [ ] RPO validado.
* [ ] RTO conhecido.
* [ ] Responsável definido.
* [ ] A restauração não reprocessará ações indevidas.
* [ ] O isolamento multiempresa foi validado no restore.

---

# Deploy com migration

## Ordem recomendada

1. validar o ambiente;
2. criar e validar backup;
3. executar migration de expansão;
4. validar schema;
5. publicar código compatível;
6. ativar gradualmente;
7. executar backfill;
8. validar consistência;
9. monitorar;
10. estabilizar;
11. executar contração em release posterior.

---

## Migration antes do código

Pode ser utilizada quando o schema novo é compatível com o código atual.

Exemplos:

* nova coluna opcional;
* nova tabela ainda não usada;
* novo índice;
* nova constraint não ativa imediatamente.

---

## Código antes da migration

Pode ser utilizado quando o código tolera os dois schemas.

Exemplos:

* leitura com fallback;
* escrita condicional;
* feature flag;
* suporte temporário ao campo antigo e ao novo.

---

## Deploy coordenado

Pode ser necessário quando:

* múltiplos serviços precisam mudar simultaneamente;
* não há compatibilidade progressiva;
* existe alteração crítica;
* a janela intermediária é insegura.

Deploy coordenado deve ser evitado quando uma estratégia progressiva for viável.

---

# Feature flags

Utilizar feature flag quando:

* o schema será ativado gradualmente;
* o backfill ainda não terminou;
* dual read ou dual write está em transição;
* a funcionalidade precisa ser desligada rapidamente;
* a migration afeta muitos tenants;
* o risco operacional é alto.

Verificar:

* [ ] A flag possui responsável.
* [ ] O estado padrão é seguro.
* [ ] A flag pode ser revertida.
* [ ] O código antigo continua disponível.
* [ ] Existe plano para remover a flag.
* [ ] A flag não substitui validação de dados.
* [ ] A ativação é auditada.
* [ ] A ativação pode ocorrer por tenant quando necessário.

---

# Dry run

Para migrations de risco médio, alto ou crítico, executar dry run em ambiente representativo.

Verificar:

* [ ] A versão do banco é equivalente.
* [ ] A versão da aplicação é equivalente.
* [ ] O volume é representativo.
* [ ] A distribuição dos dados é representativa.
* [ ] Dados pessoais foram protegidos.
* [ ] O tempo foi medido.
* [ ] Locks foram observados.
* [ ] Uso de CPU foi observado.
* [ ] Uso de memória foi observado.
* [ ] Uso de disco foi observado.
* [ ] Erros foram registrados.
* [ ] O resultado foi validado.
* [ ] O rollback foi testado quando aplicável.
* [ ] O processo de retomada foi testado.
* [ ] A compatibilidade entre versões foi validada.

---

# Plano de rollback

O plano deve definir:

* gatilho;
* responsável;
* prazo máximo para decisão;
* ações;
* dependências;
* impacto;
* restauração de dados;
* restauração de código;
* restauração de schema;
* comunicação;
* validação final.

---

## Rollback de código

Verificar se a versão anterior da aplicação continua funcionando com o schema novo.

---

## Rollback de schema

Nem toda migration pode ser revertida automaticamente.

Pode exigir:

* restauração de backup;
* restauração de snapshot;
* coluna antiga preservada;
* tabela auxiliar;
* script de compensação;
* reprocessamento;
* roll forward.

---

## Roll forward

Em alguns cenários, aplicar uma correção adicional é mais seguro do que reverter.

Essa decisão deve ser planejada antes da execução, especialmente em alterações irreversíveis.

---

# Observabilidade

Aplicar também a `observability-check.md`.

Toda migration relevante deve registrar:

* início;
* término;
* duração;
* ambiente;
* versão;
* commit;
* responsável;
* migration executada;
* etapas;
* registros processados;
* registros falhos;
* progresso;
* retries;
* locks;
* consumo de recursos;
* resultado;
* rollback ou compensação.

---

## Alertas durante a migration

Monitorar:

* erros 5xx;
* latência;
* conexões;
* locks;
* CPU;
* memória;
* disco;
* WAL;
* replicação;
* filas;
* workers;
* timeouts;
* falhas de integração;
* falhas de autenticação;
* falhas de autorização;
* backlog crescente.

---

# Critérios de interrupção

Interromper a migration quando houver:

* falha no backup;
* lock acima do limite;
* aumento crítico de erros;
* indisponibilidade não planejada;
* perda de conectividade;
* replicação excessivamente atrasada;
* espaço insuficiente;
* corrupção de dados;
* mistura entre tenants;
* taxa de falha acima do limite;
* ausência de progresso;
* duração muito superior ao previsto;
* impacto excessivo sobre APIs;
* filas acumulando rapidamente;
* impossibilidade de rollback;
* divergência entre schema esperado e real.

---

# Validação pré-migration

Antes da execução, confirmar:

* [ ] O ambiente está correto.
* [ ] A branch está correta.
* [ ] O commit está correto.
* [ ] A migration está correta.
* [ ] A ordem está correta.
* [ ] O SQL foi revisado.
* [ ] O backup foi concluído.
* [ ] O backup está acessível.
* [ ] Existe espaço em disco.
* [ ] O banco está saudável.
* [ ] A replicação está saudável.
* [ ] O Redis está saudável.
* [ ] Os workers foram avaliados.
* [ ] As filas foram avaliadas.
* [ ] As integrações foram avaliadas.
* [ ] A janela foi aprovada.
* [ ] Os responsáveis estão disponíveis.
* [ ] Os alertas estão ativos.
* [ ] Os critérios de interrupção estão definidos.
* [ ] O rollback está acessível.
* [ ] A comunicação foi preparada quando necessária.

---

# Validação pós-migration

Após a execução, confirmar:

* [ ] A migration consta como aplicada.
* [ ] O schema está correto.
* [ ] O Prisma está sincronizado.
* [ ] A aplicação inicia.
* [ ] O login funciona.
* [ ] As permissões funcionam.
* [ ] O isolamento entre tenants foi validado.
* [ ] Os dados antigos continuam corretos.
* [ ] Os dados novos são gravados corretamente.
* [ ] O backfill foi validado.
* [ ] As constraints estão ativas.
* [ ] Os índices foram criados.
* [ ] As queries críticas funcionam.
* [ ] A latência foi verificada.
* [ ] A taxa de erros está normal.
* [ ] Os workers estão ativos.
* [ ] As filas estão saudáveis.
* [ ] As integrações estão saudáveis.
* [ ] As automações estão corretas.
* [ ] Os WebSockets continuam funcionando.
* [ ] Os logs não expõem dados.
* [ ] As métricas permanecem normais.
* [ ] O resultado foi documentado.

---

# Testes mínimos

Executar conforme aplicável:

* migration em banco vazio;
* migration em banco populado;
* migration com valores nulos;
* migration com duplicidades;
* migration com dados inválidos;
* migration com registros órfãos;
* migration com alto volume;
* execução repetida;
* interrupção no meio;
* retomada;
* rollback;
* roll forward;
* aplicação antiga com schema novo;
* aplicação nova durante a transição;
* workers antigos;
* jobs antigos;
* isolamento entre tenants;
* integridade referencial;
* performance;
* backup e restore;
* validação de índices;
* validação de constraints;
* validação de backfill;
* validação de retenção e exclusão;
* validação de arquivos relacionados;
* validação de embeddings e índices derivados.

---

# Severidade dos achados

## Crítico

Exemplos:

* perda de dados;
* corrupção de dados;
* mistura entre tenants;
* migration destrutiva sem backup;
* remoção de estrutura ainda utilizada;
* rollback impossível em alteração crítica;
* transformação irreversível incorreta;
* indisponibilidade grave não controlada;
* dados pessoais expostos durante a migration.

Bloqueia imediatamente.

---

## Alto

Exemplos:

* migration não testada;
* backfill sem idempotência;
* lock relevante não avaliado;
* coluna obrigatória sem estratégia;
* incompatibilidade entre versões;
* ausência de validação pós-migration;
* migration pesada em transação única;
* remoção prematura de campo;
* ausência de observabilidade.

Normalmente bloqueia.

---

## Médio

Exemplos:

* documentação incompleta;
* estimativa de duração ausente;
* recuperação parcial;
* índice pouco otimizado;
* validação de volume insuficiente;
* alertas incompletos;
* rollback não testado.

Pode bloquear dependendo do risco.

---

## Baixo

Exemplos:

* nomenclatura pouco clara;
* comentário ausente;
* pequena inconsistência de padrão;
* evidência secundária ausente.

Deve ser corrigido ou registrado.

---

# Condições automáticas de bloqueio

A aprovação deve ser bloqueada quando houver:

* migration destrutiva sem backup;
* perda potencial de dados;
* risco de mistura entre tenants;
* alteração de tipo sem validação;
* backfill sem controle;
* incompatibilidade com deploy progressivo;
* coluna ou tabela ainda utilizada;
* rollback ausente em alteração crítica;
* lock não avaliado;
* migration não testada;
* ausência de validação pós-execução;
* uso de `prisma db push` em produção;
* alteração manual não versionada;
* migration antiga modificada;
* drift não resolvido;
* dados pessoais expostos;
* risco crítico não mitigado.

---

# Checklist final

Antes da aprovação, confirmar:

* [ ] O objetivo está documentado.
* [ ] O risco foi classificado.
* [ ] Os consumidores foram mapeados.
* [ ] Os dados existentes foram analisados.
* [ ] A estratégia foi definida.
* [ ] Expand and contract foi avaliado.
* [ ] A compatibilidade entre versões foi validada.
* [ ] O volume foi estimado.
* [ ] Os locks foram avaliados.
* [ ] Os índices foram avaliados.
* [ ] As constraints foram avaliadas.
* [ ] O isolamento multiempresa foi validado.
* [ ] A LGPD foi considerada.
* [ ] A segurança foi considerada.
* [ ] O backup foi validado.
* [ ] O rollback foi definido.
* [ ] O dry run foi executado quando necessário.
* [ ] O backfill é controlado.
* [ ] A observabilidade foi preparada.
* [ ] Os critérios de interrupção foram definidos.
* [ ] A validação pré-migration foi concluída.
* [ ] A validação pós-migration foi definida.
* [ ] Não existem achados críticos pendentes.
* [ ] Não existem achados altos pendentes.

---

# Formato obrigatório de saída

Ao finalizar esta skill, gerar:

```markdown
# Migration Check Report

## Identificação
- Story:
- Tarefa:
- Branch:
- Commit:
- Ambiente:
- Responsável:

## Objetivo
- problema:
- schema atual:
- schema desejado:
- resultado esperado:

## Classificação
- risco:
- justificativa:
- criticidade dos dados:
- impacto esperado:

## Escopo
- tabelas:
- colunas:
- índices:
- constraints:
- relacionamentos:
- dados:
- arquivos:
- integrações:
- filas:
- aplicações:

## Consumidores
- backend:
- frontend:
- workers:
- jobs:
- automações:
- integrações:
- relatórios:
- scripts:
- versões antigas:

## Análise dos dados
- volume:
- nulos:
- duplicidades:
- órfãos:
- inconsistências:
- dados pessoais:
- tenants afetados:
- observações:

## Estratégia
- tipo:
- expand and contract:
- dual read:
- dual write:
- feature flag:
- backfill:
- execução por tenant:
- janela:
- justificativa:

## Compatibilidade
- código antigo com schema novo:
- código novo durante transição:
- workers:
- jobs antigos:
- APIs:
- rollback de aplicação:
- observações:

## Backup
- data:
- método:
- local:
- integridade:
- restore testado:
- RPO:
- RTO:
- responsável:

## Backfill
- volume:
- lotes:
- idempotência:
- checkpoint:
- limite de concorrência:
- progresso:
- registros falhos:
- retomada:
- observações:

## Locks e performance
- tabelas:
- lock esperado:
- duração:
- CPU:
- memória:
- disco:
- WAL:
- replicação:
- janela:
- critérios de interrupção:

## Segurança e LGPD
- isolamento multiempresa:
- dados pessoais:
- retenção:
- logs:
- acesso:
- observações:

## Plano de execução
1.
2.
3.

## Plano de rollback ou compensação
- gatilho:
- responsável:
- ações:
- recuperação de dados:
- recuperação de código:
- validação:
- tempo estimado:

## Dry run
- ambiente:
- volume:
- data:
- duração:
- resultado:
- problemas:
- rollback testado:

## Validação pré-migration
- ambiente:
- commit:
- backup:
- espaço:
- banco:
- workers:
- filas:
- integrações:
- alertas:
- resultado:

## Execução
- início:
- término:
- duração:
- registros processados:
- registros falhos:
- retries:
- locks:
- interrupções:
- resultado:

## Validação pós-migration
- schema:
- aplicação:
- autenticação:
- permissões:
- tenants:
- dados:
- índices:
- constraints:
- workers:
- filas:
- integrações:
- automações:
- métricas:
- resultado:

## Achados críticos
- achado:

## Achados altos
- achado:

## Achados médios
- achado:

## Achados baixos
- achado:

## Riscos residuais
- risco:
- impacto:
- mitigação:
- responsável:

## Resultado final
- [ ] Aprovado
- [ ] Aprovado com ressalvas
- [ ] Alterações solicitadas
- [ ] Bloqueado

## Justificativa
- decisão:
- ações necessárias:
- prazo:
```

---

## Critérios de aprovação

A migration pode ser aprovada quando:

* o objetivo estiver documentado;
* o risco estiver classificado;
* os consumidores estiverem mapeados;
* os dados existentes tiverem sido analisados;
* a estratégia preservar compatibilidade;
* o isolamento multiempresa estiver comprovado;
* o backup estiver validado;
* o rollback ou compensação estiver definido;
* o dry run tiver sido executado quando necessário;
* locks e desempenho estiverem dentro dos limites;
* backfills forem idempotentes e controlados;
* a observabilidade estiver preparada;
* a validação pós-migration estiver definida;
* não existirem achados críticos ou altos pendentes.

---

## Resultado esperado

A aplicação desta skill deve garantir que toda migration do Giraffe CRM seja:

* planejada;
* versionada;
* compatível;
* incremental;
* observável;
* segura;
* recuperável;
* validada;
* adequada ao ambiente multiempresa;
* compatível com LGPD;
* executável sem perda de dados;
* bloqueada quando houver risco inaceitável.
