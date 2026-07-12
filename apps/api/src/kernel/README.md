# Kernel transversal (esqueleto — Story 1.1)

Fronteira técnica mínima do backend (AD-4/AD-5). Concentra **apenas** capacidades
transversais realmente necessárias; **regra de negócio vive nos domínios**, não aqui.

## Conteúdo concreto nesta Story

- `config/` — carregamento e validação de variáveis de ambiente (fail-fast). É o
  único conteúdo com consumidor real (`main.ts`, `app.module.ts`) nesta Story.

## Reservado para Stories posteriores (NÃO implementar agora)

- identidade/sessão (Story 1.4/1.5) · contexto de Organização (Story 1.3) ·
  autorização/CASL (Story 1.6) · observabilidade avançada.

Nenhuma pasta/abstração especulativa deve existir aqui sem consumidor concreto
(proibição registrada na Story 1.1).
