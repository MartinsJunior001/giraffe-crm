/* ============================================================
   FONTE ÚNICA DEMONSTRATIVA DE TEMPLATES DE E-MAIL (Etapa 3)
   Consumida por:
   - Kanban  -> área de E-mail (lista "Templates de email")
   - Automações -> ação "Envie um template de email"
   Alterar esta lista reflete nos dois pontos.
   ============================================================ */
(function (w) {
  w.EMAIL_TEMPLATES = [
    { id: 'confirmacao-orcamento', name: 'Confirmação da solicitação de orçamento' },
    { id: 'agradecimento-parceria', name: 'Agradecimento pela parceria fechada' },
    { id: 'envio-proposta-fechamento', name: 'E-mail de envio de proposta e fechamento' }
  ];
  // Nomes simples (compatível com quem só precisa da string)
  w.EMAIL_TEMPLATE_NAMES = w.EMAIL_TEMPLATES.map(function (t) { return t.name; });
})(window);
