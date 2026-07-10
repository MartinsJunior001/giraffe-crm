/* =====================================================================
   GIRAFFE CRM — SHELL COMPARTILHADO (Fase 1)
   ---------------------------------------------------------------------
   Roda em TODAS as telas do app (depois de giraffe-state.js). Unifica,
   sem redesenhar:
     • Identidade: usuário (Martins Júnior) x organização (Giraffe Marketing)
     • Notificações: popover + badge dinâmico a partir da fonte única
     • Menus: liga botões antes inertes (Sair, Trocar de empresa,
       Assistentes de IA, Ver todas)
     • Busca global simples sobre o seed
     • Utilitário "Em breve" (toast) para recursos de Fase 2
   Todas as ações são idempotentes e defensivas: se um elemento não
   existir na tela, a etapa é ignorada.
   ===================================================================== */
(function () {
  "use strict";
  if (!window.GIRAFFE) { console.warn("[giraffe-shell] state ausente"); return; }
  var G = window.GIRAFFE, S = G.state;

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  /* ---------- Toast "Em breve" / mensagens ---------- */
  function ensureToast() {
    var t = document.getElementById("giraffeToast");
    if (t) return t;
    t = document.createElement("div");
    t.id = "giraffeToast";
    t.style.cssText = "position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);z-index:100000;background:#14110E;color:#fff;font-family:'Inter Tight',system-ui,sans-serif;font-size:13px;font-weight:600;padding:11px 18px;border-radius:24px;box-shadow:0 12px 34px rgba(0,0,0,.28);opacity:0;pointer-events:none;transition:opacity .18s,transform .18s;display:flex;align-items:center;gap:9px;max-width:calc(100vw - 40px);";
    document.body.appendChild(t);
    return t;
  }
  var toastTimer;
  function toast(msg) {
    var t = ensureToast();
    t.innerHTML = '<span style="display:inline-flex;color:#FF7200"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5" stroke-linecap="round"/><circle cx="12" cy="16.5" r=".5" fill="currentColor"/></svg></span>' + msg;
    requestAnimationFrame(function () { t.style.opacity = "1"; t.style.transform = "translateX(-50%) translateY(0)"; });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.opacity = "0"; t.style.transform = "translateX(-50%) translateY(20px)"; }, 2600);
  }
  G.toast = toast;
  G.soon = function (label) { toast((label ? label + ' — ' : '') + 'disponível em breve (Fase 2)'); };

  /* ---------- 1. IDENTIDADE ---------- */
  function fixIdentity() {
    var u = S.currentUser, org = S.currentOrganization;

    // Gatilho da topbar → USUÁRIO
    document.querySelectorAll(".user-trigger, .user").forEach(function (trg) {
      var nameEl = trg.querySelector("span:not(.avatar)");
      if (nameEl && !nameEl.classList.contains("avatar")) nameEl.textContent = u.name;
      var av = trg.querySelector(".avatar");
      if (av) av.textContent = u.initials;
    });

    // Cabeçalho do menu → USUÁRIO + ORGANIZAÇÃO separados
    document.querySelectorAll(".um-head").forEach(function (head) {
      var name = head.querySelector(".um-name");
      var mail = head.querySelector(".um-mail");
      var role = head.querySelector(".um-role");
      var av = head.querySelector(".um-avatar");
      if (name) name.textContent = u.name;
      if (mail) mail.textContent = u.email;
      if (role) role.textContent = u.role; // "Super Admin"
      if (av) av.textContent = u.initials;
      // linha de organização (inserida uma única vez)
      var info = head.querySelector(".um-info");
      if (info && !info.querySelector(".um-org")) {
        var orgLine = document.createElement("div");
        orgLine.className = "um-org";
        orgLine.style.cssText = "display:flex;align-items:center;gap:6px;font-size:11px;color:#707072;margin:6px 0 2px;";
        orgLine.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 20v-6h8v6M9 8h.01M15 8h.01" stroke-linecap="round"/></svg>' +
          '<span>Organização: <b style="color:#14110E;font-weight:700;">' + org.name + '</b></span>';
        info.appendChild(orgLine);
      }
    });

    // Saudação do dashboard
    var gName = document.querySelector(".greet .g-name");
    if (gName) gName.textContent = u.name;
    var gAv = document.querySelector(".greet .g-avatar");
    if (gAv) gAv.textContent = u.initials;
  }

  /* ---------- 2. NOTIFICAÇÕES (popover + badge) ---------- */
  function iconFor(kind) {
    if (kind === "alarm") return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="13" r="7"/><path d="M12 10v3.5l2 1.5M9 3 5.5 5.5M15 3l3.5 2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    if (kind === "done") return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m5 12.5 4.5 4.5L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"><path d="M5 12h13M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function fmtDate(iso) {
    try { var d = new Date(iso); return String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0") + "/" + d.getFullYear() + " " + String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0"); }
    catch (e) { return ""; }
  }

  function renderNotifs() {
    // Badge dinâmico
    var count = G.unreadCount();
    document.querySelectorAll("#notifBtn .badge, .icon-btn .badge").forEach(function (b) {
      if (count <= 0) { b.style.display = "none"; }
      else { b.style.display = ""; b.textContent = count > 9 ? "9+" : String(count); }
    });

    // Popover no padrão .notif-list (maioria das telas): mostra top 7
    document.querySelectorAll(".notif-list").forEach(function (list) {
      list.innerHTML = S.notifications.slice(0, 7).map(function (n) {
        var plain = n.text.replace(/<[^>]+>/g, "");
        return '<div class="notif-item" data-nid="' + n.id + '"' + (n.read ? '' : ' style="background:#FFFBF6"') + '>' +
          '<div class="ni-text">' + plain + '</div>' +
          '<div class="ni-date">' + fmtDate(n.at) + '</div></div>';
      }).join("");
    });

    // Popover no padrão #notifList (agentes-ia): renderiza se existir
    var np = document.getElementById("notifList");
    if (np) {
      np.innerHTML = S.notifications.slice(0, 7).map(function (n) {
        var plain = n.text.replace(/<[^>]+>/g, "");
        return '<div class="np-item" data-nid="' + n.id + '"><div>' + plain + '</div><div style="font-size:12px;color:#707072;margin-top:3px;">' + fmtDate(n.at) + '</div></div>';
      }).join("");
    }
  }

  function wireNotifs() {
    renderNotifs();
    // "Marcar todas como lidas"
    document.querySelectorAll(".notif-markall, #notifClear").forEach(function (btn) {
      btn.addEventListener("click", function (e) { e.stopPropagation(); G.markAllRead(); renderNotifs(); });
    });
  }

  /* ---------- 3. MENUS antes inertes ---------- */
  function textOf(el) { return (el.textContent || "").trim().toLowerCase(); }

  function wireUserMenu() {
    document.querySelectorAll(".um-item").forEach(function (item) {
      // já é <a href> válido? não mexer
      var isLink = item.tagName === "A" && item.getAttribute("href") && item.getAttribute("href") !== "#";
      var t = textOf(item);
      if (t.indexOf("sair") === 0) {
        item.addEventListener("click", function (e) { e.preventDefault(); location.href = "login.html"; });
      } else if (t.indexOf("trocar de empresa") !== -1) {
        item.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openOrgSwitch(item); });
      } else if (t.indexOf("assistentes de ia") !== -1 && !isLink) {
        item.addEventListener("click", function (e) { e.preventDefault(); location.href = "agentes-ia.html"; });
      }
    });
  }

  // Fluxo demonstrativo simples de troca de empresa
  function openOrgSwitch(anchor) {
    var existing = document.getElementById("orgSwitchPop");
    if (existing) { existing.remove(); return; }
    var pop = document.createElement("div");
    pop.id = "orgSwitchPop";
    pop.style.cssText = "position:fixed;z-index:100001;background:#fff;border:1px solid #E5E5E5;border-radius:12px;box-shadow:0 16px 44px rgba(0,0,0,.18);padding:8px;width:260px;font-family:'Inter Tight',system-ui,sans-serif;";
    pop.innerHTML = '<div style="font-size:11px;font-weight:700;color:#707072;padding:8px 10px 6px;text-transform:uppercase;letter-spacing:.05em;">Trocar de empresa</div>' +
      S.organizations.map(function (o) {
        var cur = o.id === S.currentOrganization.id;
        return '<button data-org="' + o.id + '" style="display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:none;background:none;border-radius:8px;text-align:left;font-family:inherit;font-size:13px;font-weight:500;color:#39393B;cursor:pointer;">' +
          '<span style="width:26px;height:26px;border-radius:7px;background:linear-gradient(135deg,#FF9A4D,#FF7200);color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700;">' + o.initials + '</span>' +
          '<span style="flex:1">' + o.name + '</span>' +
          (cur ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FF7200" stroke-width="2.4"><path d="M5 12l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '') + '</button>';
      }).join("");
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect();
    pop.style.top = Math.min(r.bottom + 6, window.innerHeight - pop.offsetHeight - 12) + "px";
    pop.style.left = Math.max(12, r.left - 60) + "px";
    pop.querySelectorAll("button[data-org]").forEach(function (b) {
      b.addEventListener("click", function () {
        var o = S.organizations.filter(function (x) { return x.id === b.getAttribute("data-org"); })[0];
        if (o) {
          S.currentOrganization = o;
          fixIdentity();
          toast("Organização ativa: " + o.name);
        }
        pop.remove();
      });
    });
    setTimeout(function () {
      document.addEventListener("click", function h(e) {
        if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener("click", h); }
      });
    }, 0);
  }

  /* ---------- 4. BUSCA GLOBAL ---------- */
  function wireSearch() {
    var inputs = document.querySelectorAll(".topbar .search input, .topbar .search-box input, header .search input");
    inputs.forEach(function (input) {
      if (input.dataset.giraffeSearch) return;
      input.dataset.giraffeSearch = "1";
      var wrap = input.closest(".search, .search-box") || input.parentElement;
      wrap.style.position = wrap.style.position || "relative";
      var dd = document.createElement("div");
      dd.style.cssText = "position:absolute;top:calc(100% + 8px);left:0;min-width:280px;max-width:380px;background:#fff;border:1px solid #E5E5E5;border-radius:12px;box-shadow:0 16px 44px rgba(0,0,0,.16);padding:6px;z-index:100002;display:none;max-height:360px;overflow:auto;font-family:'Inter Tight',system-ui,sans-serif;";
      wrap.appendChild(dd);
      function run() {
        var res = G.search(input.value);
        if (!input.value.trim()) { dd.style.display = "none"; return; }
        if (!res.length) {
          dd.innerHTML = '<div style="padding:12px 12px;color:#707072;font-size:13px;">Nenhum resultado para “' + input.value.replace(/</g,"&lt;") + '”.</div>';
        } else {
          dd.innerHTML = res.map(function (r) {
            var soon = !r.href ? ' <span style="font-size:9px;font-weight:700;color:#FF7200;background:#FFF3E8;padding:1px 6px;border-radius:5px;margin-left:auto;">Em breve</span>' : '';
            return '<button data-href="' + (r.href || "") + '" style="display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border:none;background:none;border-radius:8px;text-align:left;font-family:inherit;font-size:13px;color:#39393B;cursor:pointer;">' +
              '<span style="font-size:9px;font-weight:700;color:#707072;background:#F5F5F5;padding:2px 7px;border-radius:5px;min-width:64px;text-align:center;">' + r.type + '</span>' +
              '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + r.label.replace(/</g,"&lt;") + '</span>' + soon + '</button>';
          }).join("");
          dd.querySelectorAll("button[data-href]").forEach(function (b) {
            b.addEventListener("mousedown", function (e) {
              e.preventDefault();
              var h = b.getAttribute("data-href");
              if (h) location.href = h; else { G.soon(); dd.style.display = "none"; }
            });
            b.addEventListener("mouseenter", function () { b.style.background = "#FFF3E8"; });
            b.addEventListener("mouseleave", function () { b.style.background = "none"; });
          });
        }
        dd.style.display = "block";
      }
      input.addEventListener("input", run);
      input.addEventListener("focus", run);
      input.addEventListener("blur", function () { setTimeout(function () { dd.style.display = "none"; }, 150); });
    });
  }

  /* ---------- 4b. Feed completo de notificações (página) ---------- */
  function enhanceFeed() {
    var feed = document.getElementById("feed");
    if (!feed) return;
    feed.innerHTML = S.notifications.map(function (n) {
      var col = n.kind === "alarm" ? "alarm" : (n.kind === "done" ? "done" : "move");
      return '<div class="feed-item"><span class="fi-ic ' + col + '">' + iconFor(n.kind) + '</span>' +
        '<div class="fi-body"><div class="fi-text">' + n.text + '</div><div class="fi-time">' + (n.rel || fmtDate(n.at)) + '</div></div></div>';
    }).join("");
  }

  /* ---------- 4c. Relatórios (números e linhas do seed) ---------- */
  function enhanceReports() {
    var tbody = document.getElementById("repTbody");
    if (!tbody) return;
    var rows = S.cards;
    tbody.innerHTML = rows.map(function (c) {
      var pipe = G.pipeById(c.pipeId); var u = G.userById(c.creator) || {};
      var d = new Date(c.createdAt);
      var dateStr = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      return '<tr><td><a href="' + (pipe && pipe.href ? pipe.href : "#") + '" class="rep-link">' + c.title + '</a></td>' +
        '<td class="rep-cell">' + (c.phase || "—") + '</td>' +
        '<td class="rep-cell">' + (u.name || "—") + '</td>' +
        '<td class="rep-cell">' + (u.email || "—") + '</td>' +
        '<td class="rep-cell">' + dateStr + '</td>' +
        '<td class="rep-cell">' + (pipe ? pipe.name : "—") + '</td></tr>';
    }).join("");
    // Rótulo "N pipes"
    var pipesBtn = document.getElementById("pipesSelBtn");
    if (pipesBtn) pipesBtn.childNodes[0].nodeValue = S.pipes.length + " pipes ";
    // Lista de checkbox de pipes
    var plist = document.querySelector(".pipes-list");
    if (plist) plist.innerHTML = S.pipes.map(function (p) {
      return '<label class="pipes-check"><input type="checkbox" checked />' + p.name + '</label>';
    }).join("");
    // Contadores reais
    var n = rows.length;
    var sub = document.querySelector(".rep-sub");
    if (sub) sub.textContent = n + " resultados — Selecione filtros do lado esquerdo e adicione fórmulas, altere colunas ou exporte dados usando os botões do lado direito.";
    var cnt = document.querySelector(".rep-count");
    if (cnt) cnt.textContent = "1 – " + n + " de " + n + " resultados";
    var pages = document.querySelector(".rep-pages");
    if (pages) pages.innerHTML = '<a href="#" class="current">1</a>';
  }

  /* ---------- 4d. Tarefas & Solicitações (estado preenchido) ---------- */
  function enhanceTasks() {
    var panels = document.querySelectorAll(".content > .panel");
    if (panels.length < 2 || !document.querySelector(".thead")) return;
    if (!/tarefas e solicita/i.test(document.title)) return;

    function pipeName(id) { var p = G.pipeById(id); return p ? p.name : "—"; }
    function statusPill(s) {
      var map = { aberta: ["#B7791F", "#FBF1DC", "Aberta"], atrasada: ["#C0392B", "#FBE9E7", "Atrasada"], concluida: ["#2E7D46", "#E8F3EA", "Concluída"], resolvida: ["#2E7D46", "#E8F3EA", "Resolvida"] };
      var m = map[s] || ["#707072", "#F5F5F5", s];
      return '<span style="font-size:11px;font-weight:700;color:' + m[0] + ';background:' + m[1] + ';padding:3px 10px;border-radius:20px;">' + m[2] + '</span>';
    }
    function fmt(d) { try { return new Date(d).toLocaleDateString("pt-BR"); } catch (e) { return d; } }

    // Painel 1 = Tarefas
    var p1 = panels[0];
    var open1 = S.tasks.filter(function (t) { return t.status !== "concluida"; });
    var h2a = p1.querySelector("h2"); if (h2a) h2a.textContent = open1.length ? open1.length + " tarefas abertas" : "Sem tarefas";
    var es1 = p1.querySelector(".empty-state");
    if (es1 && open1.length) {
      var rows1 = open1.map(function (t) {
        var late = t.status === "atrasada";
        return '<div style="display:grid;grid-template-columns:1fr 200px 220px 180px;padding:13px 4px;border-bottom:1px solid #E5E5E5;font-size:13px;align-items:center;">' +
          '<span style="font-weight:600;color:#14110E;">' + t.title + (late ? ' <span style="font-size:10px;font-weight:700;color:#C0392B;background:#FBE9E7;padding:2px 7px;border-radius:5px;margin-left:6px;">atrasada</span>' : '') + '</span>' +
          '<span style="color:#39393B;">' + pipeName(t.pipeId) + '</span>' +
          '<span style="color:#707072;">' + fmt(t.receivedAt) + '</span>' +
          '<span style="color:' + (late ? '#C0392B' : '#707072') + ';font-weight:' + (late ? '700' : '400') + ';">' + fmt(t.dueAt) + '</span></div>';
      }).join("");
      es1.outerHTML = '<div>' + rows1 + '</div>';
    }

    // Painel 2 = Solicitações
    var p2 = panels[1];
    var open2 = S.requests.filter(function (r) { return r.status === "aberta"; });
    var h2b = p2.querySelector("h2"); if (h2b) h2b.textContent = open2.length ? open2.length + " solicitações abertas" : "Sem solicitações";
    var es2 = p2.querySelector(".empty-state");
    if (es2 && S.requests.length) {
      var rows2 = S.requests.map(function (r) {
        return '<div style="display:grid;grid-template-columns:1fr 200px 240px 140px;padding:13px 4px;border-bottom:1px solid #E5E5E5;font-size:13px;align-items:center;">' +
          '<span style="font-weight:600;color:#14110E;">' + r.title + '</span>' +
          '<span style="color:#39393B;">' + pipeName(r.pipeId) + '</span>' +
          '<span style="color:#707072;">' + fmt(r.updatedAt) + '</span>' +
          '<span>' + statusPill(r.status) + '</span></div>';
      }).join("");
      es2.outerHTML = '<div>' + rows2 + '</div>';
    }
  }

  /* ---------- 4e. Perfil (lista de pipes nas notificações) ---------- */
  function enhanceProfile() {
    var names = document.querySelectorAll(".pipe-notif-name");
    if (!names.length) return;
    S.pipes.slice(0, names.length).forEach(function (p, i) { names[i].textContent = p.name; });
    var owner = document.querySelector(".custom-owner");
    if (owner) owner.textContent = S.currentOrganization.name;
  }

  /* ---------- 4f. Dashboard: grade de pipes/databases do seed ---------- */
  function enhanceDashboard() {
    var pipesGrid = document.getElementById("pipesGrid");
    var dbGrid = document.getElementById("databasesGrid");
    if (!pipesGrid && !dbGrid) return;

    var starSvg = '<span class="star" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.6 5.6 6 .6-4.5 4 1.3 5.9L12 21l-5.4 3.1 1.3-5.9-4.5-4 6-.6L12 3Z"/></svg></span>';
    var lockSvg = '<span class="p-lock"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>';
    var pipeIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10Z" stroke-linejoin="round"/></svg>';
    var dbIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/></svg>';

    if (pipesGrid) {
      var createP = pipesGrid.querySelector(".create");
      var cardsP = S.pipes.map(function (p) {
        var soon = !p.href;
        var attrs = soon
          ? 'class="pipe ' + p.tone + ' soon" href="javascript:void(0)" data-giraffe-soon="' + p.name + '" aria-disabled="true" title="Em breve neste protótipo"'
          : 'class="pipe ' + p.tone + '" href="' + p.href + '"';
        return '<a ' + attrs + ' aria-label="Pipe ' + p.name + '">' +
          '<span class="badge-ic" style="background:' + p.color + ';" aria-hidden="true">' + pipeIcon + '</span>' +
          (p.starred ? starSvg : '') +
          '<span class="p-title">' + p.name + '</span>' +
          '<span class="p-foot"><span class="p-count">' + p.count + ' ' + p.countLabel + '</span>' + (p.locked ? lockSvg : '') + '</span>' +
          (soon ? '<span class="soon-note">Em breve neste protótipo</span>' : '') + '</a>';
      }).join("");
      pipesGrid.innerHTML = "";
      if (createP) pipesGrid.appendChild(createP);
      pipesGrid.insertAdjacentHTML("beforeend", cardsP);
    }

    if (dbGrid) {
      var createD = dbGrid.querySelector(".create");
      var cardsD = S.databases.map(function (d) {
        var soon = !d.href;
        var attrs = soon
          ? 'class="db-card ' + d.tone + ' soon" href="javascript:void(0)" data-giraffe-soon="' + d.name + '" aria-disabled="true" title="Em breve neste protótipo"'
          : 'class="db-card ' + d.tone + '" href="' + d.href + '"';
        return '<a ' + attrs + ' aria-label="Database ' + d.name + '">' +
          '<span class="badge-ic" style="background:' + d.color + ';" aria-hidden="true">' + dbIcon + '</span>' +
          '<span class="p-title">' + d.name + '</span>' +
          '<span class="p-foot"><span class="p-count">' + d.records + ' registros</span>' + (d.locked ? lockSvg : '') + '</span>' +
          (soon ? '<span class="soon-note">Em breve neste protótipo</span>' : '') + '</a>';
      }).join("");
      dbGrid.innerHTML = "";
      if (createD) dbGrid.appendChild(createD);
      dbGrid.insertAdjacentHTML("beforeend", cardsD);
    }
    // religa os cards "soon" recém-criados
    wireSoon();
  }

  /* ---------- 5. Recursos Fase 2 marcados no HTML ---------- */
  function wireSoon() {
    document.querySelectorAll("[data-giraffe-soon]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        G.soon(el.getAttribute("data-giraffe-soon") || "");
      }, true); // fase de captura: bloqueia o handler original da página
    });
  }

  ready(function () {
    try { fixIdentity(); } catch (e) { console.warn(e); }
    try { wireNotifs(); } catch (e) { console.warn(e); }
    try { wireUserMenu(); } catch (e) { console.warn(e); }
    try { wireSearch(); } catch (e) { console.warn(e); }
    try { enhanceFeed(); } catch (e) { console.warn(e); }
    try { enhanceDashboard(); } catch (e) { console.warn(e); }
    try { enhanceReports(); } catch (e) { console.warn(e); }
    try { enhanceTasks(); } catch (e) { console.warn(e); }
    try { enhanceProfile(); } catch (e) { console.warn(e); }
    try { wireSoon(); } catch (e) { console.warn(e); }
  });
})();
