/* ============================================================
   Field Config Modal — motor reutilizável de tipos de campo
   Reproduz os modais de configuração de campo (Pipefy-style),
   adaptado à identidade laranja do projeto Giraffe.
   Cada formulário tem sua própria lista de campos (estado por card).
   ============================================================ */
(function () {
  if (window.__fieldConfigInit) return;
  window.__fieldConfigInit = true;

  /* ---------- CSS ---------- */
  var CSS = `
  .fcm-ov{position:fixed;inset:0;z-index:5000;display:none;align-items:stretch;justify-content:flex-start;background:rgba(17,17,17,.28)}
  .fcm-ov.open{display:flex}
  .fcm-modal{display:flex;background:#fff;width:min(1180px,94vw);max-width:1180px;margin:auto;border-radius:3px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.28);max-height:92vh;position:relative}
  .fcm-left{width:520px;flex:0 0 520px;display:flex;flex-direction:column;background:#fff}
  .fcm-left-scroll{overflow-y:auto;overflow-x:hidden;padding:26px 30px 12px;flex:1}
  .fcm-right{flex:1;background:linear-gradient(180deg,#EEF2FB,#E9EEFA);padding:26px 30px;display:flex;flex-direction:column;gap:26px;overflow-y:auto}
  .fcm-close{position:absolute;top:16px;right:18px;background:none;border:none;cursor:pointer;color:#9A9AA0;padding:4px;border-radius:3px;z-index:3}
  .fcm-close:hover{background:#F0F0F0;color:#444}
  .fcm-h{font-family:'Inter Tight',system-ui,sans-serif;font-size:22px;font-weight:700;color:#111;margin:0 0 5px;letter-spacing:-.01em}
  .fcm-sub{font-size:13px;color:#6C6C70;margin:0 0 20px;line-height:1.45}
  .fcm-lbl{font-size:13.5px;font-weight:600;color:#1c1c1e;margin:0 0 4px}
  .fcm-sublbl{font-size:12px;color:#8A8A8E;margin:0 0 7px}
  .fcm-input{width:100%;box-sizing:border-box;border:1.5px solid #E3E3E6;border-radius:3px;padding:11px 13px;font-size:14px;color:#111;background:#F6F6F7;outline:none;font-family:inherit}
  .fcm-input:focus{border-color:#FF7200;background:#fff;box-shadow:0 0 0 3px rgba(255,114,0,.13)}
  .fcm-field{margin-bottom:18px}
  .fcm-select{position:relative}
  .fcm-select select{width:100%;box-sizing:border-box;border:1.5px solid #E3E3E6;border-radius:3px;padding:11px 34px 11px 13px;font-size:14px;color:#111;background:#F6F6F7;outline:none;appearance:none;font-family:inherit;cursor:pointer}
  .fcm-select select:focus{border-color:#FF7200;background:#fff}
  .fcm-select .fcm-chev{position:absolute;right:12px;top:50%;transform:translateY(-50%);pointer-events:none;color:#7a7a7e}
  .fcm-opts{display:flex;flex-direction:column;gap:9px;margin-bottom:6px}
  .fcm-opt{display:flex;align-items:center;gap:12px}
  .fcm-opt .fcm-onum{font-size:13px;color:#8A8A8E;width:10px;text-align:center}
  .fcm-opt .fcm-input{flex:1}
  .fcm-optdel{background:none;border:none;cursor:pointer;color:#9A9AA0;padding:4px;border-radius:3px}
  .fcm-optdel:hover{color:#D33;background:#FBE9E9}
  .fcm-optsrow{display:flex;align-items:center;justify-content:space-between;margin:2px 0 8px}
  .fcm-optmulti{background:none;border:none;color:#2160E8;font-size:13px;font-weight:600;cursor:pointer;padding:0}
  .fcm-optadd{border:1.5px solid #C9D6F5;background:#fff;color:#2160E8;font-size:12.5px;font-weight:600;border-radius:3px;padding:7px 12px;cursor:pointer}
  .fcm-optadd:hover{background:#F2F6FF}
  .fcm-div{height:1px;background:#EDEDEF;margin:16px 0}
  .fcm-tg{display:flex;align-items:center;gap:11px;padding:7px 0;cursor:pointer;user-select:none}
  .fcm-tg .fcm-sw{flex:0 0 auto;width:34px;height:19px;border-radius:20px;background:#D2D2D6;position:relative;transition:background .15s}
  .fcm-tg .fcm-sw::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#fff;transition:transform .15s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
  .fcm-tg.on .fcm-sw{background:#FF7200}
  .fcm-tg.on .fcm-sw::after{transform:translateX(15px)}
  .fcm-tg .fcm-tglbl{font-size:13.5px;color:#2a2a2c;line-height:1.35}
  .fcm-tg .fcm-help{color:#B4B4B8;display:inline-flex;vertical-align:-2px;margin-left:4px}
  .fcm-foot{display:flex;align-items:center;gap:12px;padding:16px 30px;border-top:1px solid #EDEDEF;background:#fff}
  .fcm-dep{display:inline-flex;align-items:center;gap:7px;color:#2160E8;font-size:13px;font-weight:600;background:none;border:none;cursor:pointer;padding:0}
  .fcm-foot .sp{flex:1}
  .fcm-btn{border:none;border-radius:3px;padding:9px 20px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
  .fcm-cancel{background:#EDEDEF;color:#3a3a3c}
  .fcm-cancel:hover{background:#E2E2E4}
  .fcm-save{background:#FF7200;color:#fff}
  .fcm-save:hover{background:#E5670A}
  /* radios */
  .fcm-radios{display:flex;flex-direction:column;gap:11px;margin:8px 0 4px}
  .fcm-radio{display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:13.5px;color:#2a2a2c;line-height:1.35}
  .fcm-radio .fcm-rc{flex:0 0 auto;width:17px;height:17px;border-radius:50%;border:1.6px solid #C4C4C8;margin-top:1px;position:relative}
  .fcm-radio.on .fcm-rc{border-color:#FF7200}
  .fcm-radio.on .fcm-rc::after{content:"";position:absolute;inset:3px;border-radius:50%;background:#FF7200}
  .fcm-adv{border:1px solid #E7E7EA;border-radius:3px;padding:14px 15px;margin:14px 0 4px}
  .fcm-adv-h{display:flex;align-items:center;justify-content:space-between;font-size:13.5px;font-weight:600;color:#1c1c1e;margin-bottom:4px}
  .fcm-adv-row{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:9px 0;border-top:1px solid #F0F0F2}
  .fcm-adv-row:first-of-type{border-top:none}
  .fcm-adv-row .txt{font-size:12.5px;color:#2160E8;line-height:1.4;font-weight:500}
  /* rich text editor */
  .fcm-rte{border:1px solid #E3E3E6;border-radius:3px;overflow:hidden;margin-bottom:8px}
  .fcm-rte-bar{display:flex;align-items:center;gap:4px;padding:9px 11px;border-bottom:1px solid #EDEDEF;color:#5a5a5e}
  .fcm-rte-bar button{background:none;border:none;cursor:pointer;color:inherit;padding:5px;border-radius:3px;display:inline-flex}
  .fcm-rte-bar button:hover{background:#F2F2F4}
  .fcm-rte-area{min-height:230px;padding:13px;font-size:14px;color:#111;outline:none}
  .fcm-rte-area:empty::before{content:attr(data-ph);color:#A6A6AA}
  /* preview panel */
  .fcm-prevbar{border:1px dashed #C6CEE0;border-radius:3px;background:rgba(255,255,255,.5);padding:11px;text-align:center;font-size:13px;color:#5c6470;display:flex;align-items:center;justify-content:center;gap:8px}
  .fcm-prevcard{background:#fff;border-radius:3px;padding:40px 34px;flex:1;box-shadow:0 1px 3px rgba(0,0,0,.05)}
  .fcm-pv-lblrow{display:flex;align-items:center;gap:10px;margin-bottom:12px}
  .fcm-pv-ic{color:#3a3a3c;display:inline-flex}
  .fcm-pv-lbl{font-size:15px;font-weight:600;color:#1c1c1e}
  .fcm-pv-box{border:1px solid #E3E3E6;border-radius:3px;background:#F1F1F3;padding:12px 13px;font-size:14px;color:#9a9a9e}
  .fcm-pv-box.tall{min-height:88px}
  .fcm-pv-box.sel{display:flex;align-items:center;justify-content:space-between}
  .fcm-pv-phone{display:flex;gap:9px}
  .fcm-pv-flag{border:1px solid #E3E3E6;border-radius:3px;background:#fff;padding:10px 12px;font-size:16px}
  .fcm-pv-phone .fcm-pv-box{flex:1}
  .fcm-pv-link{color:#2160E8;font-size:14px;font-weight:600;display:inline-flex;align-items:center;gap:6px;margin-top:4px}
  .fcm-pv-id{font-size:15px;color:#3a3a3c;margin-top:2px}
  .fcm-pv-rte{font-size:15px;color:#3a3a3c}
  .fcm-pv-people{display:flex;flex-direction:column;gap:14px;margin-top:6px}
  .fcm-pv-person{display:flex;align-items:center;gap:11px;font-size:14.5px;color:#2a2a2c}
  .fcm-pv-ava{width:26px;height:26px;border-radius:50%;color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center}
  .fcm-pv-radio{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600;color:#1c1c1e}
  .fcm-pv-radio .rc{width:18px;height:18px;border-radius:50%;border:2px solid #7a7a7e;position:relative}
  .fcm-pv-radio .rc::after{content:"";position:absolute;inset:3px;border-radius:50%;background:#7a7a7e}
  @media(max-width:900px){.fcm-modal{flex-direction:column;width:96vw}.fcm-left{width:100%;flex:1 1 auto}.fcm-right{display:none}}
  `;

  /* ---------- Icons ---------- */
  function svg(inner, fill) {
    return '<svg width="17" height="17" viewBox="0 0 24 24" fill="' + (fill || 'none') + '" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }
  var IC = {
    text: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 15l2.5-7 2.5 7M10 12.5h3"/>'),
    longtext: svg('<path d="M4 7h16M4 12h16M4 17h10"/>'),
    email: svg('<circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.4 2.4 0 0 0 4.3 1.5A8 8 0 1 0 17 18.6"/>'),
    phone: svg('<path d="M5 4h3l2 5-2 1.5a12 12 0 0 0 5 5L18 13l3 1v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>'),
    select: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m9 11 3 3 3-3"/>'),
    date: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>'),
    time: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    numeric: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10.5 9.5 12 8.5V16"/>'),
    currency: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 7.5v9M14.3 9.6A2.2 2.2 0 0 0 12 8.4c-1.3 0-2.2.7-2.2 1.7s.9 1.5 2.2 1.5 2.2.6 2.2 1.6-.9 1.7-2.2 1.7a2.2 2.2 0 0 1-2.3-1.3"/>'),
    attach: svg('<path d="M21 12.5 12.5 21a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7.5-7.5"/>'),
    check: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 2.5 2.5L16 9"/>'),
    person: svg('<circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c0-3.4 3-5.4 6.5-5.4s6.5 2 6.5 5.4"/>'),
    tag: svg('<path d="M20.6 13.4 12 22l-8-8V4h10l6.6 6.6a2 2 0 0 1 0 2.8Z"/><circle cx="8.5" cy="8.5" r="1.4"/>'),
    conn: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 9l3 3-3 3"/>'),
    doc: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>')
  };

  /* ---------- Field definitions ----------
     controls: array of control descriptors, rendered in order.
     types: {c:'title'|'type'|'options'|'currency'|'richtext'|'connection'|'toggle'|'div'}
     preview: {kind, ic}  */
  var D = {}; // dividers helper as string 'div'

  function tg(label, on, help) { return { c: 'toggle', label: label, on: !!on, help: !!help }; }
  var STD_TAIL = ['div', tg('Visualização compacta'), tg('Este campo é editável em outras fases', true), tg('Este campo deve ter valor único')];
  var STD_HEAD = [tg('Descrição'), tg('Texto de ajuda'), tg('Este campo é obrigatório')];

  var DEFS = {
    'Texto curto': {
      sub: 'Peça por uma entrada de textos curtos',
      controls: [{ c: 'title' }, { c: 'type', opts: ['Texto curto'] }].concat(STD_HEAD, ['div', tg('Validação customizada', false, true), tg('Visualização compacta'), tg('Este campo é editável em outras fases', true), tg('Este campo deve ter valor único')]),
      preview: { kind: 'input', ic: IC.text }
    },
    'Texto longo': {
      sub: 'Peça por uma entrada de textos longos',
      controls: [{ c: 'title' }, { c: 'type', opts: ['Texto longo'] }].concat(STD_HEAD, ['div', tg('Visualização compacta'), tg('Este campo é editável em outras fases', true)]),
      preview: { kind: 'textarea', ic: IC.longtext }
    },
    'Conteúdo dinâmico': {
      sub: 'Adicione textos e conteúdo dinâmico, como títulos, descrições ou explicações.',
      controls: [{ c: 'richtext' }],
      noDep: true,
      preview: { kind: 'richtext' }
    },
    'Anexo': {
      sub: 'Peça por arquivos anexos em uma determinada fase',
      controls: [{ c: 'title' }].concat(STD_HEAD, ['div', tg('Validação customizada', false, true), tg('Visualização compacta'), tg('Este campo é editável em outras fases', true)]),
      preview: { kind: 'attachment', ic: IC.attach }
    },
    'Checkbox': {
      sub: 'Adicione uma lista de opções a serem escolhidas',
      controls: [{ c: 'title' }, { c: 'type', opts: ['Checklist vertical', 'Checklist horizontal'] }, { c: 'options' }].concat(STD_HEAD, ['div', tg('Visualização compacta'), tg('Este campo é editável em outras fases', true)]),
      preview: { kind: 'checklist', ic: IC.check }
    },
    'Responsável': {
      sub: 'Adicione a lista dos membros do seu Pipe a serem selecionados como responsáveis pelo card',
      controls: [{ c: 'title' }].concat(STD_HEAD, ['div', tg('Visualização compacta'), tg('Este campo é editável em outras fases', true), tg('Sincronizar campos do card com este campo fixo', true)]),
      preview: { kind: 'responsavel', ic: IC.person }
    },
    'Data': {
      sub: 'Aceita apenas datas como entradas',
      controls: [{ c: 'title' }, { c: 'type', opts: ['Data', 'Data e hora', 'Data de vencimento'] }].concat(STD_HEAD, STD_TAIL),
      preview: { kind: 'date', ic: IC.date }
    },
    'Data e hora': {
      sub: 'Aceita apenas datas e horas como entradas',
      controls: [{ c: 'title' }, { c: 'type', opts: ['Data', 'Data e hora', 'Data de vencimento'], def: 'Data e hora' }].concat(STD_HEAD, STD_TAIL),
      preview: { kind: 'datetime', ic: IC.date }
    },
    'Data de vencimento': {
      sub: 'Peça pela data de vencimento do card',
      controls: [{ c: 'title' }, { c: 'type', opts: ['Data', 'Data e hora', 'Data de vencimento'], def: 'Data de vencimento' }].concat(STD_HEAD, ['div', tg('Visualização compacta'), tg('Este campo é editável em outras fases', true), tg('Sincronizar campos do card com este campo fixo', true), tg('Este campo deve ter valor único')]),
      preview: { kind: 'datetime', ic: IC.date }
    },
    'Etiquetas': {
      sub: 'Adicione uma lista de opções na qual várias opções podem ser escolhidas',
      controls: [{ c: 'title' }, { c: 'options' }].concat(STD_HEAD, ['div', tg('Visualização compacta'), tg('Este campo é editável em outras fases', true)]),
      preview: { kind: 'select', ic: IC.tag }
    },
    'Email': {
      sub: 'Aceita apenas emails como entradas',
      controls: [{ c: 'title' }].concat(STD_HEAD, STD_TAIL),
      preview: { kind: 'email', ic: IC.email, ph: 'email@email.com' }
    },
    'Número de telefone': {
      sub: 'Peça por um número de telefone com o código do país',
      controls: [{ c: 'title' }].concat(STD_HEAD, STD_TAIL),
      preview: { kind: 'phone', ic: IC.phone }
    },
    'Seleção de lista': {
      sub: 'Adicione uma lista de opções na qual somente uma opção pode ser escolhida',
      controls: [{ c: 'title' }, { c: 'options' }].concat(STD_HEAD, ['div', tg('Visualização compacta'), tg('Este campo é editável em outras fases', true)]),
      preview: { kind: 'select', ic: IC.select }
    },
    'Seleção de única opção': {
      sub: 'Aceita apenas a seleção de uma única opção em um grupo de itens',
      controls: [{ c: 'title' }, { c: 'type', opts: ['Seleção de única opção vertical', 'Seleção de única opção horizontal'] }, { c: 'options' }].concat(STD_HEAD, ['div', tg('Visualização compacta'), tg('Este campo é editável em outras fases', true)]),
      preview: { kind: 'radio' }
    },
    'Tempo': {
      sub: 'Peça por uma entrada no formato de horas',
      controls: [{ c: 'title' }].concat(STD_HEAD, ['div', tg('Visualização compacta'), tg('Este campo é editável em outras fases', true)]),
      preview: { kind: 'time', ic: IC.time, ph: '00:00' }
    },
    'Numérico': {
      sub: 'Aceita apenas números como entradas',
      controls: [{ c: 'title' }].concat(STD_HEAD, STD_TAIL),
      preview: { kind: 'numeric', ic: IC.numeric, ph: '0' }
    },
    'Moeda': {
      sub: 'Peça por uma quantidade de uma moeda',
      controls: [{ c: 'title' }, { c: 'currency' }].concat(STD_HEAD, STD_TAIL),
      preview: { kind: 'currency', ic: IC.currency, ph: '0,00' }
    },
    'Documentos': {
      sub: 'Peça por um número de documento brasileiro',
      controls: [{ c: 'title' }, { c: 'type', opts: ['CPF', 'CNPJ'] }].concat(STD_HEAD, STD_TAIL),
      preview: { kind: 'input', ic: IC.doc, ph: '999.999.999-99' }
    },
    'ID': {
      sub: 'Exibe um ID único automaticamente gerado para um card',
      controls: [{ c: 'title' }, tg('Descrição'), tg('Texto de ajuda')],
      preview: { kind: 'id' }
    },
    'Conexão de pipe': {
      sub: 'Crie conexões entre cards a partir de um campo específico do seu processo',
      controls: [{ c: 'connection', entity: 'pipe' }],
      preview: { kind: 'connection', ic: IC.conn }
    },
    'Conexão de database': {
      sub: 'Crie conexões de database a partir de um campo específico do seu processo',
      controls: [{ c: 'connection', entity: 'database' }],
      preview: { kind: 'connection', ic: IC.conn }
    }
  };

  var CURRENCIES = ['USD - US Dollar', 'BRL - Real brasileiro', 'EUR - Euro', 'GBP - Libra esterlina'];
  var PIPES = ['[SO] Solicitação de Orçamento', '[TP] Tráfego - Lucas', 'Criação de Artes Giraffe', 'Contratos e Jurídicos'];
  var TABLES = ['1.Empresas Parceiras e contratos', '2.Clientes ativos', '3.Informações da Empresa'];
  var AVA = [['Employee A', '#F5A623'], ['Employee B', '#25B39A'], ['Employee C', '#9B59D0']];

  /* ---------- Build modal DOM ---------- */
  var ov, modal, leftScroll, rightPanel, footEl;
  var current = { name: null, def: null, target: null, mode: null };

  function ensureDOM() {
    if (ov) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    ov = document.createElement('div'); ov.className = 'fcm-ov';
    ov.innerHTML =
      '<div class="fcm-modal">' +
        '<button class="fcm-close" aria-label="Fechar"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18" stroke-linecap="round"/></svg></button>' +
        '<div class="fcm-left"><div class="fcm-left-scroll"></div><div class="fcm-foot"></div></div>' +
        '<div class="fcm-right"></div>' +
      '</div>';
    document.body.appendChild(ov);
    modal = ov.querySelector('.fcm-modal');
    leftScroll = ov.querySelector('.fcm-left-scroll');
    rightPanel = ov.querySelector('.fcm-right');
    footEl = ov.querySelector('.fcm-foot');
    ov.querySelector('.fcm-close').addEventListener('click', close);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ov.classList.contains('open')) close(); });
  }

  function chev() { return '<span class="fcm-chev"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'; }
  function swSvg() { return '<span class="fcm-sw"></span>'; }
  function helpSvg() { return '<span class="fcm-help"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 0 1 4.5 1.4c0 1.6-2 1.9-2 3.4"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/></svg></span>'; }

  /* ---------- Render controls ---------- */
  function renderControls(name, def) {
    var h = '<h2 class="fcm-h">' + name + '</h2><p class="fcm-sub">' + def.sub + '</p>';
    def.controls.forEach(function (ctl) {
      if (ctl === 'div') { h += '<div class="fcm-div"></div>'; return; }
      if (ctl.c === 'toggle') { h += toggleHTML(ctl); return; }
      switch (ctl.c) {
        case 'title':
          h += '<div class="fcm-field"><div class="fcm-lbl">Título do campo</div>' +
               (name.indexOf('Conexão') === 0 ? '<div class="fcm-sublbl">Dê um nome para esta conexão</div>' : '') +
               '<input class="fcm-input fcm-title-input" type="text" placeholder="' + name + '"></div>';
          break;
        case 'type':
          h += '<div class="fcm-field"><div class="fcm-lbl">Escolha o tipo</div><div class="fcm-select"><select class="fcm-type-select">' +
               ctl.opts.map(function (o) { return '<option' + ((ctl.def || ctl.opts[0]) === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') +
               '</select>' + chev() + '</div></div>';
          break;
        case 'currency':
          h += '<div class="fcm-field"><div class="fcm-lbl">Escolha o tipo</div><div class="fcm-select"><select>' +
               CURRENCIES.map(function (o) { return '<option>' + o + '</option>'; }).join('') +
               '</select>' + chev() + '</div></div>';
          break;
        case 'options':
          h += '<div class="fcm-field"><div class="fcm-lbl">Adicione as opções</div><div class="fcm-opts"></div>' +
               '<div class="fcm-optsrow"><button class="fcm-optmulti" type="button">Adicionar vários</button><button class="fcm-optadd" type="button">Adicionar opção +</button></div></div>';
          break;
        case 'richtext':
          h += '<div class="fcm-rte"><div class="fcm-rte-bar">' +
               '<button type="button" style="font-weight:700">B</button>' +
               '<button type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 20 12 6l5 14M9 15h6"/></svg></button>' +
               '<button type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 12h12M4 18h16"/></svg></button>' +
               '<button type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg></button>' +
               '<button type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 15a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M15 9a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg></button>' +
               '<button type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>' +
               '</div><div class="fcm-rte-area" contenteditable="true" data-ph="Digite aqui ..."></div></div>';
          break;
        case 'connection':
          h += connectionHTML(ctl.entity);
          break;
      }
    });
    leftScroll.innerHTML = h;
    // options list init
    var optsHost = leftScroll.querySelector('.fcm-opts');
    if (optsHost) {
      addOptRow(optsHost);
      leftScroll.querySelector('.fcm-optadd').addEventListener('click', function () { addOptRow(optsHost); syncPreview(); });
      leftScroll.querySelector('.fcm-optmulti').addEventListener('click', function () { addOptRow(optsHost); addOptRow(optsHost); syncPreview(); });
    }
    // toggles
    leftScroll.querySelectorAll('.fcm-tg').forEach(function (t) {
      t.addEventListener('click', function () { t.classList.toggle('on'); });
    });
    // type select updates preview icon/kind + title placeholder
    var ts = leftScroll.querySelector('.fcm-type-select');
    if (ts) ts.addEventListener('change', syncPreview);
    // title input live
    var ti = leftScroll.querySelector('.fcm-title-input');
    if (ti) ti.addEventListener('input', syncPreview);
    // rich text live
    var rte = leftScroll.querySelector('.fcm-rte-area');
    if (rte) rte.addEventListener('input', syncPreview);
    // connection radios
    leftScroll.querySelectorAll('.fcm-radio').forEach(function (r) {
      r.addEventListener('click', function () {
        r.parentNode.querySelectorAll('.fcm-radio').forEach(function (x) { x.classList.remove('on'); });
        r.classList.add('on');
      });
    });
    // advanced toggle collapse
    var advH = leftScroll.querySelector('.fcm-adv-h');
    if (advH) advH.addEventListener('click', function () {
      var b = advH.parentNode.querySelector('.fcm-adv-body');
      if (b) b.style.display = b.style.display === 'none' ? '' : 'none';
    });
  }

  function toggleHTML(t) {
    return '<div class="fcm-tg' + (t.on ? ' on' : '') + '">' + swSvg() +
      '<span class="fcm-tglbl">' + t.label + (t.help ? helpSvg() : '') + '</span></div>';
  }

  function addOptRow(host) {
    var n = host.children.length + 1;
    var row = document.createElement('div');
    row.className = 'fcm-opt';
    row.innerHTML = '<span class="fcm-onum">' + n + '</span><input class="fcm-input" type="text" placeholder=""><button class="fcm-optdel" type="button" aria-label="Remover"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5h6v2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    row.querySelector('input').addEventListener('input', syncPreview);
    row.querySelector('.fcm-optdel').addEventListener('click', function () {
      if (host.children.length > 1) { row.remove(); renumber(host); syncPreview(); }
    });
    host.appendChild(row);
  }
  function renumber(host) { Array.prototype.forEach.call(host.children, function (r, i) { r.querySelector('.fcm-onum').textContent = i + 1; }); }

  function connectionHTML(entity) {
    var isPipe = entity === 'pipe';
    var list = isPipe ? PIPES : TABLES;
    var selLbl = isPipe ? 'Selecione o pipe que deseja conectar' : 'Selecione a tabela que deseja conectar';
    var selSub = isPipe ? 'Pipe conectado' : 'Tabela conectada';
    var thing = isPipe ? 'cards' : 'cards ou registros';
    function radio(label, on) { return '<div class="fcm-radio' + (on ? ' on' : '') + '"><span class="fcm-rc"></span><span>' + label + '</span></div>'; }
    function advRow(txt) { return '<div class="fcm-adv-row"><span class="txt">' + txt + '</span>' + '<div class="fcm-tg"><span class="fcm-sw"></span></div></div>'; }
    return '<div class="fcm-field"><div class="fcm-lbl">Título do campo</div><div class="fcm-sublbl">Dê um nome para esta conexão</div><input class="fcm-input fcm-title-input" type="text" placeholder="' + (isPipe ? 'Conexão de pipe' : 'Conexão de database') + '"></div>' +
      '<div class="fcm-field"><div class="fcm-lbl">' + selLbl + '</div><div class="fcm-sublbl">' + selSub + '</div><div class="fcm-select"><select>' + list.map(function (o) { return '<option>' + o + '</option>'; }).join('') + '</select>' + chev() + '</div></div>' +
      '<div class="fcm-field"><div class="fcm-lbl">Função do campo</div><div class="fcm-radios">' +
        radio('Pesquisar ' + thing + ' existentes na conexão') +
        radio('Criar novos ' + thing + ' na conexão', true) +
        radio('Pesquisar e criar ' + thing + ' na conexão') +
      '</div></div>' +
      '<div class="fcm-field"><div class="fcm-lbl">Número de cards ou registros que podem ser conectados</div><div class="fcm-sublbl">Selecione se deseja que um único card/registro seja conectado ao card pai ou vários.</div><div class="fcm-radios">' +
        radio('Um único card ou registro por card principal') +
        radio('Vários cards ou registros por card principal', true) +
      '</div></div>' +
      '<div class="fcm-adv"><div class="fcm-adv-h">Opções avançadas <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 15 6-6 6 6" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="fcm-adv-body">' +
        advRow('Um card conectado deve ser criado para que o card pai possa ser movido para a fase final') +
        advRow('O card pai não pode ser movido para a próxima fase até que todos os card conectados tenham atingido a fase final') +
        advRow('O card pai não pode ser movido para a fase final até que todos os cards conectados tenham atingido a fase final') +
        advRow('Preencher automaticamente os campos de um card com informações do card conectado') +
      '</div></div>' +
      toggleHTML(tg('Descrição')) + toggleHTML(tg('Texto de ajuda')) + toggleHTML(tg('Este campo é obrigatório')) +
      '<div class="fcm-div"></div>' + toggleHTML(tg('Visualização compacta')) + toggleHTML(tg('Este campo é editável em outras fases', true));
  }

  /* ---------- Preview ---------- */
  function getTitle() { var ti = leftScroll.querySelector('.fcm-title-input'); return ti && ti.value.trim(); }
  function getType() { var ts = leftScroll.querySelector('.fcm-type-select'); return ts && ts.value; }
  function getOpts() {
    var host = leftScroll.querySelector('.fcm-opts'); if (!host) return [];
    return Array.prototype.map.call(host.querySelectorAll('input'), function (i) { return i.value.trim(); });
  }

  function renderPreview() {
    var def = current.def, name = current.name, p = def.preview;
    var label = getTitle() || name;
    var kind = p.kind;
    var t = getType();
    // date type switches kind
    if (t === 'Data') kind = 'date';
    else if (t === 'Data e hora') kind = 'datetime';
    else if (t === 'Data de vencimento') kind = 'datetime';
    var horiz = t && t.indexOf('horizontal') >= 0;
    var lblRow = function (ic) { return '<div class="fcm-pv-lblrow">' + (ic ? '<span class="fcm-pv-ic">' + ic + '</span>' : '') + '<span class="fcm-pv-lbl">' + label + '</span></div>'; };
    var body = '';
    switch (kind) {
      case 'input': body = lblRow(p.ic) + '<div class="fcm-pv-box">' + (p.ph || '') + '</div>'; break;
      case 'textarea': body = lblRow(p.ic) + '<div class="fcm-pv-box tall"></div>'; break;
      case 'email': body = lblRow(p.ic) + '<div class="fcm-pv-box">' + p.ph + '</div>'; break;
      case 'phone': body = lblRow(p.ic) + '<div class="fcm-pv-phone"><span class="fcm-pv-flag">🇧🇷</span><div class="fcm-pv-box">(99) 99999-9999</div></div>'; break;
      case 'numeric': body = lblRow(p.ic) + '<div class="fcm-pv-box">' + p.ph + '</div>'; break;
      case 'currency': body = lblRow(p.ic) + '<div class="fcm-pv-box" style="color:#111">' + p.ph + '</div>'; break;
      case 'time': body = lblRow(p.ic) + '<div class="fcm-pv-box">' + p.ph + '</div>'; break;
      case 'date': body = lblRow(p.ic) + '<div class="fcm-pv-box">Selecione uma data</div>'; break;
      case 'datetime': body = lblRow(p.ic) + '<div class="fcm-pv-box">Selecione uma data e hora</div>'; break;
      case 'select': body = lblRow(p.ic) + '<div class="fcm-pv-box sel"><span></span>' + chev().replace('fcm-chev', 'fcm-chev-p') + '</div>'; break;
      case 'attachment': body = lblRow(p.ic) + '<a class="fcm-pv-link"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>Upload file</a>'; break;
      case 'id': body = '<div class="fcm-pv-lblrow"><span class="fcm-pv-lbl">' + label + '</span></div><div class="fcm-pv-id">#9999</div>'; break;
      case 'richtext': body = '<div class="fcm-pv-rte">' + (getRTE() || 'Seu texto vai ser mostrado aqui ...') + '</div>'; break;
      case 'connection': body = '<div class="fcm-pv-lblrow"><span class="fcm-pv-ic">' + p.ic + '</span><span class="fcm-pv-lbl">' + label + '</span></div><a class="fcm-pv-link"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>Criar novo card</a>'; break;
      case 'responsavel':
        body = lblRow(p.ic) + '<div class="fcm-pv-people">' + AVA.map(function (a) {
          return '<div class="fcm-pv-person"><span class="fcm-pv-ava" style="background:' + a[1] + '">' + a[0].slice(-1) + '</span>' + a[0] + '</div>';
        }).join('') + '</div>'; break;
      case 'checklist': {
        var o1 = getOpts().filter(function (x) { return x; });
        var rows = (o1.length ? o1 : ['']).map(function (x) { return '<div class="fcm-pv-person"><span class="fcm-pv-ic">' + IC.check + '</span>' + (x || '') + '</div>'; }).join('');
        body = lblRow(p.ic) + '<div class="fcm-pv-people"' + (horiz ? ' style="flex-direction:row;flex-wrap:wrap;gap:20px"' : '') + '>' + rows + '</div>'; break;
      }
      case 'radio': {
        var o2 = getOpts().filter(function (x) { return x; });
        if (!o2.length) o2 = [label];
        var rr = o2.map(function (x) { return '<div class="fcm-pv-radio"><span class="rc"></span>' + x + '</div>'; }).join('');
        body = '<div class="fcm-pv-people"' + (horiz ? ' style="flex-direction:row;flex-wrap:wrap;gap:26px"' : '') + '>' + rr + '</div>'; break;
      }
      default: body = lblRow(p.ic) + '<div class="fcm-pv-box"></div>';
    }
    rightPanel.innerHTML = '<div class="fcm-prevbar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="2.6"/></svg>Esta é uma prévia do seu campo</div>' +
      '<div class="fcm-prevcard">' + body + '</div>';
  }
  function getRTE() { var r = leftScroll.querySelector('.fcm-rte-area'); return r && r.innerHTML && r.textContent.trim() ? r.innerHTML : ''; }
  function syncPreview() { renderPreview(); }

  /* ---------- Footer ---------- */
  function renderFoot(def) {
    footEl.innerHTML =
      '<span class="sp"></span><button class="fcm-btn fcm-cancel" type="button">Cancelar</button><button class="fcm-btn fcm-save" type="button">Salvar</button>';
    footEl.querySelector('.fcm-cancel').addEventListener('click', close);
    footEl.querySelector('.fcm-save').addEventListener('click', save);
  }

  /* ---------- Add to form ---------- */
  function iconForPreview(p, kind) { return (p && p.ic) || IC.text; }

  function save() {
    var def = current.def, name = current.name, target = current.target;
    var label = getTitle() || name;
    if (target) {
      if (target.matches('.cs-form-card')) appendPipeField(target, label, def);
      else if (target.matches('.cfg-sheet')) appendDbField(target, label, def);
    }
    close();
  }

  function appendPipeField(card, label, def) {
    var p = def.preview, ic = p.ic || '';
    var kind = p.kind, t = getType();
    if (t === 'Data') kind = 'date'; else if (t === 'Data e hora' || t === 'Data de vencimento') kind = 'datetime';
    var actions = '<span class="fh-act"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4L18 10l-4-4L4 16v4Z" stroke-linejoin="round"/></svg><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg></span>';
    var inner = '';
    if (kind === 'attachment') inner = '<div class="cs-fld-input" style="color:#2160E8">+ Upload file</div>';
    else if (kind === 'connection') inner = '<div class="cs-fld-input" style="color:#2160E8">+ Criar novo card</div>';
    else if (kind === 'id') inner = '<div class="cs-fld-input">#9999</div>';
    else if (kind === 'textarea') inner = '<div class="cs-fld-input tall">&nbsp;</div>';
    else if (kind === 'date') inner = '<div class="cs-fld-input">Selecione uma data</div>';
    else if (kind === 'datetime') inner = '<div class="cs-fld-input">Selecione uma data e hora</div>';
    else if (kind === 'phone') inner = '<div class="cs-fld-input">🇧🇷 (99) 99999-9999</div>';
    else if (kind === 'email') inner = '<div class="cs-fld-input">email@email.com</div>';
    else if (kind === 'currency') inner = '<div class="cs-fld-input">0,00</div>';
    else if (kind === 'numeric') inner = '<div class="cs-fld-input">0</div>';
    else if (kind === 'time') inner = '<div class="cs-fld-input">00:00</div>';
    else if (kind === 'richtext') inner = '<p class="cs-fld-hint">' + (getRTE() || 'Texto dinâmico') + '</p>';
    else if (kind === 'checklist' || kind === 'radio') {
      inner = getOpts().filter(function (x) { return x; }).map(function (x) { return '<div class="cs-fld-check"><span class="box"></span>' + x + '</div>'; }).join('') || '<div class="cs-fld-check"><span class="box"></span>Opção 1</div>';
    } else inner = '<div class="cs-fld-input">&nbsp;</div>';

    var el = document.createElement('div');
    el.className = 'cs-fld';
    el.style.paddingTop = '20%'; el.style.paddingBottom = '20%';
    el.innerHTML = '<div class="cs-fld-head"><span class="fh-ic">' + ic + '</span><span class="fh-title">' + label + '</span><span class="spacer"></span>' + actions + '</div>' + inner;
    card.appendChild(el);
    el.scrollIntoView ? el.scrollIntoView({ block: 'nearest' }) : 0;
  }

  function appendDbField(sheet, label, def) {
    var p = def.preview, ic = p.ic || '';
    var kind = p.kind, t = getType();
    if (t === 'Data') kind = 'date'; else if (t === 'Data e hora' || t === 'Data de vencimento') kind = 'datetime';
    var act = '<span class="cfg-pf-act"><button class="cfg-pf-btn" aria-label="Editar campo"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="cfg-pf-btn" aria-label="Mais opções"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg></button></span>';
    var inner;
    if (kind === 'attachment') inner = '<div class="cfg-pf-upload"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>Upload file</div>';
    else if (kind === 'connection') inner = '<div class="cfg-pf-upload"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>Criar novo card</div>';
    else if (kind === 'id') inner = '<div class="cfg-pf-input disabled">#9999</div>';
    else if (kind === 'textarea') inner = '<textarea class="cfg-pf-input disabled" readonly></textarea>';
    else if (kind === 'phone') inner = '<div class="cfg-pf-phone"><span class="cfg-pf-flag">🇧🇷</span><div class="cfg-pf-input disabled">(99) 99999-9999</div></div>';
    else if (kind === 'email') inner = '<div class="cfg-pf-input disabled">email@email.com</div>';
    else if (kind === 'date') inner = '<div class="cfg-pf-input disabled">Selecione uma data</div>';
    else if (kind === 'datetime') inner = '<div class="cfg-pf-input disabled">Selecione uma data e hora</div>';
    else if (kind === 'currency') inner = '<div class="cfg-pf-input disabled">0,00</div>';
    else if (kind === 'numeric') inner = '<div class="cfg-pf-input disabled">0</div>';
    else if (kind === 'time') inner = '<div class="cfg-pf-input disabled">00:00</div>';
    else if (kind === 'richtext') inner = '<div class="cfg-pf-input disabled" style="min-height:auto;padding:8px 0">' + (getRTE() || 'Texto dinâmico') + '</div>';
    else if (kind === 'checklist' || kind === 'radio') {
      inner = '<div class="cfg-pf-input disabled">' + (getOpts().filter(function (x) { return x; })[0] || 'Opção 1') + '</div>';
    } else inner = '<div class="cfg-pf-input disabled"></div>';

    var el = document.createElement('div');
    el.className = 'cfg-pf';
    el.style.paddingTop = '20%'; el.style.paddingBottom = '20%';
    el.innerHTML = '<div class="cfg-pf-top"><span class="cfg-pf-ic">' + ic + '</span><span class="cfg-pf-label">' + label + '</span>' + act + '</div>' + inner;
    sheet.appendChild(el);
    el.scrollIntoView ? el.scrollIntoView({ block: 'nearest' }) : 0;
  }

  /* ---------- open/close ---------- */
  function open(name, target) {
    var def = DEFS[name];
    if (!def) return;
    ensureDOM();
    current = { name: name, def: def, target: target };
    renderControls(name, def);
    renderFoot(def);
    renderPreview();
    ov.classList.add('open');
  }
  function close() { if (ov) ov.classList.remove('open'); }

  /* ---------- Wiring ---------- */
  function labelOf(btn) {
    // text nodes only (skip inner spans/svg)
    var t = '';
    btn.childNodes.forEach ? btn.childNodes.forEach(fn) : Array.prototype.forEach.call(btn.childNodes, fn);
    function fn(n) { if (n.nodeType === 3) t += n.textContent; }
    return t.trim();
  }

  function wire() {
    document.querySelectorAll('.cs-field-type, .cfg-ftype').forEach(function (btn) {
      if (btn.__fcWired) return; btn.__fcWired = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var name = labelOf(btn);
        if (!DEFS[name]) return;
        var target = null;
        if (btn.classList.contains('cs-field-type')) {
          var pane = btn.closest('.cs-panes');
          target = pane && pane.querySelector('.cs-form-card');
        } else {
          target = document.querySelector('.cfg-sheet');
        }
        open(name, target);
      });
    });
  }

  window.FieldConfig = { open: open, wire: wire };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
  // re-wire when config panels are opened dynamically
  document.addEventListener('click', function () { setTimeout(wire, 50); }, true);
})();
