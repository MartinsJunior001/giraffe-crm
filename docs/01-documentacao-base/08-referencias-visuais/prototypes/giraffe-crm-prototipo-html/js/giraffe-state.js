/* =====================================================================
   GIRAFFE CRM — SEED CENTRAL / FONTE ÚNICA DE VERDADE (Fase 1)
   ---------------------------------------------------------------------
   Todas as telas do protótipo leem deste objeto. Não invente listas
   locais de pipes, usuários, notificações, cards ou databases: use
   window.GIRAFFE.state.
   Persistência leve em localStorage para o "lido/não lido" das
   notificações sobreviver à navegação entre páginas.
   ===================================================================== */
(function () {
  "use strict";

  var LS_KEY = "giraffe.state.v1";

  /* ---------- ORGANIZAÇÃO & USUÁRIOS ---------- */
  var currentOrganization = {
    id: "org-giraffe",
    name: "Giraffe Marketing",
    initials: "GM"
  };

  var organizations = [
    currentOrganization,
    { id: "org-contratos", name: "Giraffe Contratos", initials: "GC" }
  ];

  var currentUser = {
    id: "u-martins",
    name: "Martins Júnior",
    initials: "MJ",
    email: "martinsjunior089@gmail.com",
    username: "martins_junior",
    role: "Super Admin",            // papel na plataforma
    orgRole: "Administrador da Organização" // papel na organização atual
  };

  var users = [
    currentUser,
    { id: "u-jhenipher", name: "Jhenipher martins", initials: "JM", email: "jhenipher.giraffe@gmail.com", role: "Membro", orgRole: "Editor" },
    { id: "u-alex", name: "Alexsandro Ignacio", initials: "AI", email: "alexsandro@giraffe.com", role: "Membro", orgRole: "Editor" },
    { id: "u-lucas", name: "Lucas Andrade", initials: "LA", email: "lucas@giraffe.com", role: "Membro", orgRole: "Editor" },
    { id: "u-hiago", name: "Hiago Ferreira", initials: "HF", email: "hiago@giraffe.com", role: "Membro", orgRole: "Visualizador" }
  ];

  /* ---------- CATÁLOGO ÚNICO DE PIPES ---------- */
  // href aponta para o protótipo navegável; null = "Em breve neste protótipo"
  var pipes = [
    { id: "p-contratos", name: "Contratos e Juridicos", color: "#3A3A3D", tone: "dark",  count: 2,  countLabel: "solicitações", locked: true,  starred: true,  href: "pipe-kanban.html" },
    { id: "p-artes",     name: "Criação de Artes Giraffe", color: "#FF7200", tone: "orange", count: 35, countLabel: "tarefas", locked: true, starred: true, href: null },
    { id: "p-site",      name: "Criação de Site e Manutenção", color: "#5B7A2E", tone: "green", count: 1, countLabel: "cards", locked: false, starred: false, href: null },
    { id: "p-implement", name: "Estrutura de Implementação", color: "#E5326F", tone: "pink", count: 7, countLabel: "campanhas", locked: true, starred: false, href: null },
    { id: "p-trafego6666", name: "ESTRUTURA TRÁFEGO 6666", color: "#E5326F", tone: "pink2", count: 2, countLabel: "campanhas", locked: true, starred: false, href: null },
    { id: "p-so",        name: "[SO] Solicitação de Orçamento", color: "#F5A623", tone: "orange", count: 12, countLabel: "cards", locked: false, starred: false, href: null },
    { id: "p-tp-lucas",  name: "[TP] Tráfego - Lucas", color: "#E5527E", tone: "pink", count: 9, countLabel: "cards", locked: false, starred: false, href: null },
    { id: "p-tp-hiago",  name: "[TP] Tráfego - Hiago", color: "#E5527E", tone: "pink", count: 6, countLabel: "cards", locked: false, starred: false, href: null },
    { id: "p-tp-matheus",name: "[TP] Tráfego - Matheus", color: "#E5527E", tone: "pink", count: 4, countLabel: "cards", locked: false, starred: false, href: null },
    { id: "p-trafego",   name: "Estrutura do Tráfego", color: "#5CB85C", tone: "green", count: 8, countLabel: "cards", locked: false, starred: false, href: null }
  ];

  /* ---------- FASES (do pipe navegável: Contratos e Juridicos) ---------- */
  var phases = [
    { id: "ph-1", pipeId: "p-contratos", name: "Caixa de Entrada", color: "yellow" },
    { id: "ph-2", pipeId: "p-contratos", name: "Preparação do Contrato", color: "blue" },
    { id: "ph-3", pipeId: "p-contratos", name: "Enviado ao cliente", color: "orange" },
    { id: "ph-4", pipeId: "p-contratos", name: "Pagamento Realizado", color: "blue" },
    { id: "ph-5", pipeId: "p-contratos", name: "Fase de implementação", color: "green", done: true }
  ];

  /* ---------- CATÁLOGO ÚNICO DE DATABASES ---------- */
  var databases = [
    { id: "db-parceiras", name: "1.Empresas Parceiras e contratos", color: "#5B7A2E", tone: "green",  records: 4, locked: false, href: "database-empresas-parceiras.html" },
    { id: "db-acessos",   name: "2.Acesso e Senhas",               color: "#C1440E", tone: "orange", records: 4, locked: true,  href: null },
    { id: "db-info",      name: "3.Informações da Empresa",        color: "#E5326F", tone: "pink",   records: 5, locked: true,  href: null },
    { id: "db-material",  name: "4.Material Empresarial",          color: "#7B4DD8", tone: "purple", records: 5, locked: true,  href: null }
  ];

  /* ---------- CARDS (fonte única) ---------- */
  // status: ok | atrasado | expirado | vencido | finalizado | arquivado
  var cards = [
    { id: "c-msilva",   title: "MSILVA",         pipeId: "p-artes", phase: "Enviar ao cliente", status: "expirado",  creator: "u-jhenipher", createdAt: "2025-04-16" },
    { id: "c-picarras", title: "MUNIZ PIÇARRAS", pipeId: "p-artes", phase: "Enviar ao cliente", status: "atrasado",  creator: "u-jhenipher", createdAt: "2025-08-11" },
    { id: "c-itapema",  title: "MUNIZ ITAPEMA",  pipeId: "p-artes", phase: "Enviar ao cliente", status: "atrasado",  creator: "u-jhenipher", createdAt: "2025-08-19" },
    { id: "c-guaxupe",  title: "INOVA GUAXUPE",  pipeId: "p-artes", phase: "Enviar ao cliente", status: "atrasado",  creator: "u-alex",      createdAt: "2025-11-05" },
    { id: "c-jundiai",  title: "MUNIZ JUNDIAI",  pipeId: "p-artes", phase: "Arquivado",         status: "finalizado",creator: "u-jhenipher", createdAt: "2025-06-05" },
    { id: "c-veneza",   title: "VENEZA",         pipeId: "p-artes", phase: "Arquivado",         status: "finalizado",creator: "u-jhenipher", createdAt: "2025-09-10" },
    { id: "c-blackline",title: "BLACKLINE",      pipeId: "p-artes", phase: "Arquivado",         status: "finalizado",creator: "u-alex",      createdAt: "2025-10-02" },
    { id: "c-elitecar", title: "ELITE CAR",      pipeId: "p-artes", phase: "Enviar ao cliente", status: "ok",        creator: "u-jhenipher", createdAt: "2025-06-11" },
    { id: "c-tres",     title: "TRES ESTRELAS",  pipeId: "p-artes", phase: "Arquivado",         status: "arquivado", creator: "u-jhenipher", createdAt: "2024-04-16" },
    { id: "c-91",       title: "91",             pipeId: "p-artes", phase: "Arquivado",         status: "arquivado", creator: "u-jhenipher", createdAt: "2025-10-20" },
    { id: "c-91auto",   title: "91 AUTO CENTER", pipeId: "p-artes", phase: "Arquivado",         status: "arquivado", creator: "u-jhenipher", createdAt: "2025-05-05" },
    { id: "c-ct-abc",   title: "Contrato ABC Ltda", pipeId: "p-contratos", phase: "Preparação do Contrato", status: "ok", creator: "u-martins", createdAt: "2026-06-28" },
    { id: "c-ct-xyz",   title: "Contrato XYZ",   pipeId: "p-contratos", phase: "Caixa de Entrada", status: "vencido", creator: "u-martins", createdAt: "2026-07-01" }
  ];

  /* ---------- NOTIFICAÇÕES (fonte única) ---------- */
  // kind: alarm | done | move ; read: bool
  var notifications = [
    { id: "n1",  kind: "alarm", cardId: "c-msilva",   text: 'O card <b>"MSILVA"</b> está expirado', at: "2026-07-07T13:48:00", rel: "há 7 minutos", read: false },
    { id: "n2",  kind: "alarm", cardId: "c-picarras", text: 'O card <b>"MUNIZ PIÇARRAS"</b> está atrasado', at: "2026-07-07T13:12:00", rel: "há 42 minutos", read: false },
    { id: "n3",  kind: "alarm", cardId: "c-itapema",  text: 'O card <b>"MUNIZ ITAPEMA"</b> está atrasado', at: "2026-07-07T13:04:00", rel: "há uma hora", read: false },
    { id: "n4",  kind: "alarm", cardId: "c-guaxupe",  text: 'O card <b>"INOVA GUAXUPE"</b> está atrasado', at: "2026-07-07T12:56:00", rel: "há uma hora", read: false },
    { id: "n5",  kind: "alarm", cardId: "c-msilva",   text: 'O card <b>"MSILVA"</b> está atrasado', at: "2026-07-07T12:48:00", rel: "há uma hora", read: false },
    { id: "n6",  kind: "done", cardId: "c-jundiai",  text: 'O card <b>"MUNIZ JUNDIAI"</b> foi finalizado no pipe "Criação de Artes Giraffe"', at: "2026-07-07T11:15:00", rel: "há 3 horas", read: false },
    { id: "n7",  kind: "move", cardId: "c-jundiai",  text: 'O card <b>"MUNIZ JUNDIAI"</b> foi movido para a fase "Arquivado"', at: "2026-07-07T10:52:00", rel: "há 3 horas", read: false },
    { id: "n8",  kind: "done", cardId: "c-veneza",   text: 'O card <b>"VENEZA"</b> foi finalizado no pipe "Criação de Artes Giraffe"', at: "2026-07-07T10:40:00", rel: "há 3 horas", read: true },
    { id: "n9",  kind: "move", cardId: "c-veneza",   text: 'O card <b>"VENEZA"</b> foi movido para a fase "Arquivado"', at: "2026-07-07T10:38:00", rel: "há 3 horas", read: true },
    { id: "n10", kind: "move", cardId: "c-picarras", text: 'O card <b>"MUNIZ PIÇARRAS"</b> foi movido para a fase "Enviar ao cliente"', at: "2026-07-07T10:30:00", rel: "há 3 horas", read: true },
    { id: "n11", kind: "move", cardId: "c-itapema",  text: 'O card <b>"MUNIZ ITAPEMA"</b> foi movido para a fase "Enviar ao cliente"', at: "2026-07-07T10:22:00", rel: "há 3 horas", read: true },
    { id: "n12", kind: "done", cardId: "c-blackline",text: 'O card <b>"BLACKLINE"</b> foi finalizado no pipe "Criação de Artes Giraffe"', at: "2026-07-07T10:10:00", rel: "há 3 horas", read: true },
    { id: "n13", kind: "move", cardId: "c-blackline",text: 'O card <b>"BLACKLINE"</b> foi movido para a fase "Arquivado"', at: "2026-07-07T10:05:00", rel: "há 3 horas", read: true },
    { id: "n14", kind: "move", cardId: "c-elitecar", text: 'O card <b>"ELITE CAR"</b> foi movido para a fase "Enviar ao cliente"', at: "2026-07-07T09:58:00", rel: "há 3 horas", read: true },
    { id: "n15", kind: "move", cardId: "c-blackline",text: 'O card <b>"BLACKLINE"</b> foi movido para a fase "Enviar ao cliente"', at: "2026-07-07T09:50:00", rel: "há 3 horas", read: true }
  ];

  /* ---------- TAREFAS & SOLICITAÇÕES ---------- */
  // Coerentes com os cards/notificações: há itens pendentes e atrasados.
  var tasks = [
    { id: "t1", title: "Revisar contrato ABC Ltda", pipeId: "p-contratos", status: "aberta", receivedAt: "2026-07-06", dueAt: "2026-07-09" },
    { id: "t2", title: "Reenviar arte MSILVA (expirada)", pipeId: "p-artes", status: "atrasada", receivedAt: "2026-07-01", dueAt: "2026-07-05" },
    { id: "t3", title: "Aprovar peça MUNIZ PIÇARRAS", pipeId: "p-artes", status: "aberta", receivedAt: "2026-07-07", dueAt: "2026-07-10" },
    { id: "t4", title: "Fechar campanha ELITE CAR", pipeId: "p-artes", status: "concluida", receivedAt: "2026-06-28", dueAt: "2026-07-02" }
  ];

  var requests = [
    { id: "r1", title: "Solicitação de orçamento — Loja Norte", pipeId: "p-so", status: "aberta", updatedAt: "2026-07-07" },
    { id: "r2", title: "Novo contrato — Muniz Itapema", pipeId: "p-contratos", status: "aberta", updatedAt: "2026-07-06" },
    { id: "r3", title: "Alteração de escopo — Blackline", pipeId: "p-implement", status: "resolvida", updatedAt: "2026-07-04" }
  ];

  /* ---------- AUTOMAÇÕES / TEMPLATES / IA / LOGS ---------- */
  var automations = [
    { id: "a1", event: "Card movido para fase", action: "Enviar template de email", pipeId: "p-contratos", status: "ativo", updatedAt: "2026-06-28", updatedBy: "u-alex" },
    { id: "a2", event: "Card criado", action: "Notificar responsável", pipeId: "p-contratos", status: "ativo", updatedAt: "2026-05-16", updatedBy: "u-martins" }
  ];

  var emailTemplates = [
    { id: "et1", name: "Exemplo de Template de Email" },
    { id: "et2", name: "[Caixa de entrada] Solicitação recebida" }
  ];

  var aiAgents = []; // Fase 1: IA básica — nenhum agente autônomo criado por padrão

  var logs = []; // preenchido pelas telas de Logs/Auditoria conforme necessário

  /* ---------- MONTAGEM DO STATE ---------- */
  var state = {
    currentUser: currentUser,
    currentOrganization: currentOrganization,
    organizations: organizations,
    users: users,
    pipes: pipes,
    phases: phases,
    cards: cards,
    databases: databases,
    records: [],
    notifications: notifications,
    tasks: tasks,
    requests: requests,
    automations: automations,
    emailTemplates: emailTemplates,
    aiAgents: aiAgents,
    logs: logs
  };

  /* ---------- PERSISTÊNCIA LEVE (só flags de leitura das notificações) ---------- */
  try {
    var saved = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (saved && saved.readIds) {
      state.notifications.forEach(function (n) {
        n.read = saved.readIds.indexOf(n.id) !== -1;
      });
    }
  } catch (e) {}

  function persist() {
    try {
      var readIds = state.notifications.filter(function (n) { return n.read; }).map(function (n) { return n.id; });
      localStorage.setItem(LS_KEY, JSON.stringify({ readIds: readIds }));
    } catch (e) {}
  }

  /* ---------- HELPERS DE CONSULTA ---------- */
  var api = {
    state: state,
    persist: persist,
    unreadCount: function () { return state.notifications.filter(function (n) { return !n.read; }).length; },
    markAllRead: function () { state.notifications.forEach(function (n) { n.read = true; }); persist(); },
    pipeById: function (id) { return state.pipes.filter(function (p) { return p.id === id; })[0] || null; },
    pipeByName: function (name) { return state.pipes.filter(function (p) { return p.name === name; })[0] || null; },
    userById: function (id) { return state.users.filter(function (u) { return u.id === id; })[0] || null; },
    // busca global simples sobre o seed
    search: function (q) {
      q = (q || "").trim().toLowerCase();
      if (!q) return [];
      var out = [];
      state.pipes.forEach(function (p) { if (p.name.toLowerCase().indexOf(q) !== -1) out.push({ type: "Pipe", label: p.name, href: p.href }); });
      state.databases.forEach(function (d) { if (d.name.toLowerCase().indexOf(q) !== -1) out.push({ type: "Database", label: d.name, href: d.href }); });
      state.cards.forEach(function (c) { if (c.title.toLowerCase().indexOf(q) !== -1) { var p = api.pipeById(c.pipeId); out.push({ type: "Card", label: c.title, href: p && p.href }); } });
      state.users.forEach(function (u) { if (u.name.toLowerCase().indexOf(q) !== -1) out.push({ type: "Usuário", label: u.name, href: null }); });
      state.notifications.forEach(function (n) { var t = n.text.replace(/<[^>]+>/g, ""); if (t.toLowerCase().indexOf(q) !== -1) out.push({ type: "Notificação", label: t, href: "minhas-notificacoes.html" }); });
      return out.slice(0, 12);
    }
  };

  window.GIRAFFE = api;
})();
