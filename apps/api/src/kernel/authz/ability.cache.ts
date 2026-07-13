import { Injectable } from '@nestjs/common';
import type { AppAbility, PapelEfetivo } from './ability';
import { construirAbility } from './ability.factory';

/**
 * Cache de abilities por `(accountId, orgId)` com **invalidação explícita** — o mecanismo que o AD-9
 * exige: *"mudança de papel/Membership invalida abilities em cache imediatamente"*.
 *
 * **A invalidação é a fonte da verdade, não um TTL.** A chave NÃO inclui o papel de propósito: se
 * incluísse, o cache se auto-corrigiria a cada troca de papel e o mecanismo de invalidação seria
 * decorativo — e o AD-9 pede o mecanismo, porque é ele que o Épico 8 dispara ao suspender/reativar/
 * mudar papel. Sem `invalidar()`, uma permissão revogada continuaria valendo até o processo reiniciar.
 *
 * Escopo desta Fase: **in-memory por processo**. O contrato (`obter`/`invalidar`) permite trocar por
 * um store distribuído depois sem tocar em quem consome; a limitação de réplicas (invalidar num
 * processo não limpa os outros) fica registrada como característica conhecida, não como bug oculto.
 */
@Injectable()
export class AbilityCache {
  private readonly cache = new Map<string, AppAbility>();

  private chave(accountId: string, orgId: string): string {
    return `${accountId}|${orgId}`;
  }

  /**
   * Devolve a ability de `(accountId, orgId)`. Constrói e memoiza na primeira vez; nas seguintes
   * devolve a cacheada — **até** alguém invalidar. O `papel` só é consultado na construção.
   */
  obter(accountId: string, orgId: string, papel: PapelEfetivo): AppAbility {
    const chave = this.chave(accountId, orgId);
    const cacheada = this.cache.get(chave);
    if (cacheada) return cacheada;

    const nova = construirAbility(papel, orgId);
    this.cache.set(chave, nova);
    return nova;
  }

  /**
   * Contrato consumido pelo **Épico 8** ao alterar/suspender/reativar/encerrar Membership ou mudar
   * papel. Após a chamada, o próximo `obter` reconstrói com o papel atual — sem janela de cache
   * obsoleto (AC4).
   */
  invalidar(accountId: string, orgId: string): void {
    this.cache.delete(this.chave(accountId, orgId));
  }
}
