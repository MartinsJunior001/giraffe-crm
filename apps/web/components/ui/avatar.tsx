'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Avatar do usuário (Story 3.10, FR-32) com **fallback por iniciais**.
 *
 * A imagem é servida pela API, sob sessão (`/me/avatar/download`) — **nunca** por URL presigned. Por isso o
 * `src` é uma rota da própria aplicação, não um link para o storage: um link assinado sobreviveria à perda de
 * acesso e continuaria entregando o dado pessoal a quem tivesse a URL.
 *
 * O fallback não é decoração: ele cobre TODOS os caminhos em que não há imagem servível — sem avatar na
 * Organização ativa, fora de uma Organização válida, capacidade de arquivos desligada (`FILE_UPLOAD_ENABLED`),
 * arquivo removido/bloqueado, ou falha de carregamento (`onError`). Em nenhum deles a UI pode quebrar ou
 * mostrar um ícone de imagem partida.
 *
 * Nota de escopo: este componente é a peça que a 3.10 precisa. Tornar o espaço de **Perfil** da Topbar
 * funcional é escopo declarado da Story 1.11 (hoje em backlog), e não é antecipado aqui.
 */

/**
 * Iniciais a partir do nome. Função **pura** e exportada para ser testável sem renderizar.
 *
 * Primeira letra do primeiro e do último nome (uma só quando há um nome apenas). Entrada vazia, em branco ou
 * sem letra alguma cai em `?` — nunca uma caixa vazia, que o usuário leria como "carregando para sempre".
 * `Intl`-safe o bastante para acentos porque opera sobre o texto original, sem normalizar para ASCII.
 */
export function iniciaisDe(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (partes.length === 0) return '?';
  const primeira = partes[0]!.charAt(0);
  const ultima = partes.length > 1 ? partes[partes.length - 1]!.charAt(0) : '';
  const iniciais = `${primeira}${ultima}`.toUpperCase();
  return iniciais.trim() === '' ? '?' : iniciais;
}

interface AvatarProps {
  /** Nome do titular — origem das iniciais e do rótulo acessível. */
  nome: string;
  /** Rota da API que serve a imagem. Ausente ⇒ iniciais direto, sem tentar carregar nada. */
  src?: string | null;
  className?: string;
}

export function Avatar({ nome, src, className }: AvatarProps) {
  // Uma falha de carregamento é definitiva para esta renderização: sem isto, o React tentaria a mesma URL
  // repetidamente a cada re-render e o usuário veria a imagem piscar entre quebrada e iniciais.
  const [falhou, setFalhou] = useState(false);
  const mostrarImagem = Boolean(src) && !falhou;

  return (
    <span
      // O rótulo vive no contêiner (não na imagem), para que o leitor de tela anuncie a mesma coisa nos dois
      // caminhos — a pessoa não deve perceber se houve fallback.
      role="img"
      aria-label={`Avatar de ${nome}`}
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-medium text-muted-foreground select-none',
        className,
      )}
    >
      {mostrarImagem ? (
        <img
          src={src!}
          alt=""
          aria-hidden
          className="size-full object-cover"
          onError={() => setFalhou(true)}
        />
      ) : (
        <span aria-hidden data-testid="avatar-iniciais">
          {iniciaisDe(nome)}
        </span>
      )}
    </span>
  );
}
