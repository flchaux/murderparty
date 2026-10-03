/* Application : état, bibliothèque de scénarios, liaison entre les vues. */
(function () {
  const MP = window.MP;
  const h = MP.h;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const app = {
    lib: MP.storage.load(),
    sc: null,
    analysis: null,
    selected: null,
    view: 'graph',
    listKind: 'steps',
    search: '',
    graphMode: 'compact',
    labels: true,
    simOn: false,
    sim: null,
    printOpts: { sheets: true, items: true, knowledge: true, puzzles: true, guide: true, npc: false },
  };
  window.intrigue = app;

  /* ---------- Bibliothèque ---------- */
  let saveTimer = null;
  let saveWarned = false;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 300);
  }

  function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    app.sc.updatedAt = Date.now();
    app.lib.scenarios[app.sc.id] = app.sc;
    app.lib.current = app.sc.id;
    if (MP.cloud.on) MP.cloud.write(app.sc);
    if (!MP.storage.save(app.lib) && !saveWarned && !MP.cloud.on) {
      saveWarned = true;
      MP.notify('Enregistrement impossible', 'Ce navigateur refuse l\'enregistrement local (navigation privée ?). Pensez à exporter votre scénario en JSON.');
    }
  }

  /* persist=false : scénario affiché sans être réenregistré (déjà enregistré, ou exemple du premier lancement). */
  function open(sc, persist = true) {
    if (saveTimer) flushSave();
    app.sc = MP.normalize(sc);
    if (!MP.cloud.validId(app.sc.id)) app.sc.id = MP.uid('sc');
    app.lib.scenarios[app.sc.id] = app.sc;
    app.lib.current = app.sc.id;
    app.selected = null;
    app.sim = null;
    app.simOn = false;
    if (persist) save();
    else MP.storage.save(app.lib);
    app.refresh();
    requestAnimationFrame(() => graphView.fit());
  }

  /* ---------- Enregistrement en ligne ---------- */
  let cloudWarned = false;
  let relogging = false;
  async function cloudError(e, op) {
    // Session expirée sur votre serveur : on redemande le mot de passe, puis on renvoie le scénario ouvert.
    if (e && e.code === 'unauthenticated') {
      if (relogging) return;
      relogging = true;
      const back = await MP.cloud.reconnect();
      relogging = false;
      if (back) { save(); return; }
    }
    if (cloudWarned) return;
    cloudWarned = true;
    if (MP.cloud.readOnly) {
      MP.notify('Lecture seule', 'Vous pouvez consulter ces scénarios mais pas les modifier en ligne. Vos changements restent dans ce navigateur.');
    } else if (e && e.code === 'quota_exceeded') {
      MP.notify('Espace en ligne plein', 'Le scénario n\'a pas pu être enregistré en ligne. Supprimez des scénarios inutiles ou exportez-les.');
    } else if (op === 'subscribe') {
      MP.notify('Serveur injoignable', 'Les scénarios du serveur n\'ont pas pu être chargés. Vos changements restent dans ce navigateur ; rechargez la page plus tard.');
    } else {
      MP.notify('Enregistrement en ligne impossible', (op === 'delete' ? 'La suppression' : 'L\'enregistrement') + ' n\'a pas abouti. Vos changements restent dans ce navigateur ; exportez le scénario par précaution.');
    }
  }

  /* Changements venus d'ailleurs (Claude, un autre onglet, un co-auteur) : on les affiche. */
  function applyRemote(changes) {
    let currentTouched = false;
    let listTouched = false;
    for (const c of changes) {
      const local = app.lib.scenarios[c.id];
      if (c.type === 'removed') {
        if (!local || MP.cloud.pending[c.id] !== undefined) continue;
        delete app.lib.scenarios[c.id];
        listTouched = true;
        if (app.sc && app.sc.id === c.id) currentTouched = 'removed';
        continue;
      }
      const remote = MP.cloud.toScenario(c.id, c.data);
      if (!remote) continue;
      if (local && (Number(remote.updatedAt) || 0) <= (Number(local.updatedAt) || 0)) continue;
      app.lib.scenarios[c.id] = remote;
      listTouched = true;
      if (app.sc && app.sc.id === c.id) currentTouched = 'updated';
    }
    if (!listTouched) return;
    MP.storage.save(app.lib);
    if (currentTouched === 'removed') {
      const rest = Object.values(app.lib.scenarios).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      open(rest[0] || MP.exampleScenario(), !!rest[0]);
    } else if (currentTouched === 'updated') {
      // Le formulaire ouvert pointe vers l'ancienne version : on le reconstruit.
      if (document.activeElement && $('#panel').contains(document.activeElement)) document.activeElement.blur();
      app.sc = app.lib.scenarios[app.sc.id];
      if (app.selected && !MP.find(app.sc, app.selected)) app.selected = null;
      if (app.simOn) app.sim = new MP.Simulation(app.sc);
      app.refresh();
    } else {
      renderHeader();
    }
  }

  function renderSync() {
    const el = $('#sync-status');
    if (!MP.cloud.on) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = MP.cloud.readOnly ? 'En ligne, lecture seule' : MP.cloud.mode === 'server' ? 'Enregistré sur le serveur' : 'Enregistré en ligne';
    el.title = 'Vos scénarios sont enregistrés en ligne : Claude peut les lire et les modifier, et cette page se met à jour toute seule.';
  }

  /* ---------- Rendu ---------- */
  app.analyze = function () { app.analysis = MP.analyze(app.sc); };

  let graphView;
  let softTimer = null;

  app.changed = function (opts = {}) {
    save();
    app.analyze();
    renderHeader();
    renderList();
    renderBadge();
    if (opts.soft) {
      clearTimeout(softTimer);
      softTimer = setTimeout(renderView, 250);
    } else {
      renderView();
    }
    if (opts.panel || !opts.soft) renderPanel();
  };

  app.refresh = function () {
    app.analyze();
    renderHeader();
    renderList();
    renderBadge();
    renderView();
    renderPanel();
    $('#sim-toggle').classList.toggle('on', app.simOn);
    $('#sim-toggle').textContent = app.simOn ? '■ Arrêter la simulation' : '▶ Simulation';
  };

  app.select = function (id, opts = {}) {
    app.selected = id;
    const f = id && MP.find(app.sc, id);
    if (f && f.kind !== app.listKind && !opts.keepList) {
      app.listKind = f.kind;
      $$('#list-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.list === f.kind));
    }
    if (opts.view) setView(opts.view);
    renderList();
    renderView();
    renderPanel();
    if (opts.center && app.view === 'graph') graphView.centerOn(id);
    const li = document.querySelector(`#entity-list li[data-id="${id}"]`);
    if (li) li.scrollIntoView({ block: 'nearest' });
  };

  function renderHeader() {
    const sc = app.sc;
    $('#scenario-title').textContent = sc.title || 'Sans titre';
    $('#scenario-type').textContent = MP.SCENARIO_TYPES[sc.type] || '';
    document.title = (sc.title || 'Sans titre') + ' · Intrigue';
    const lib = $('#library');
    lib.textContent = '';
    Object.values(app.lib.scenarios)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .forEach((s) => lib.appendChild(h('option', { value: s.id, text: s.title || 'Sans titre', selected: s.id === sc.id })));
  }

  function renderBadge() {
    const c = app.analysis.counts;
    const b = $('#issue-badge');
    b.textContent = c.error || c.warning || '';
    b.className = 'badge' + (c.error ? ' error' : c.warning ? ' warning' : '');
  }

  function renderList() {
    const sc = app.sc;
    const kind = app.listKind;
    const q = app.search.trim().toLowerCase();
    const ul = $('#entity-list');
    ul.textContent = '';
    const errs = new Set(app.analysis.issues.filter((i) => i.level === 'error').map((i) => i.ref));
    const warns = new Set(app.analysis.issues.filter((i) => i.level === 'warning').map((i) => i.ref));
    const idx = app.analysis.idx;
    const list = sc[kind].filter((e) => !q || MP.label(e).toLowerCase().includes(q));
    for (const e of list) {
      let color = '';
      let sub = '';
      if (kind === 'steps') {
        const t = MP.STEP_TYPES[e.type] || MP.STEP_TYPES.action;
        color = t.color;
        sub = [t.label, e.location].filter(Boolean).join(' · ');
      } else if (kind === 'characters') {
        color = e.color;
        sub = e.role + (e.player ? '' : ' (non joueur)');
      } else {
        color = kind === 'items' ? 'var(--item)' : 'var(--know)';
        const parts = [];
        if ((idx.holders[e.id] || []).length) parts.push('au départ');
        if ((idx.producers[e.id] || []).length) parts.push('obtenu' + (kind === 'items' ? '' : 'e'));
        if ((idx.consumers[e.id] || []).length) parts.push('utilisé' + (kind === 'items' ? '' : 'e') + ' ×' + idx.consumers[e.id].length);
        if (e.redHerring) parts.push('fausse piste');
        sub = parts.join(' · ');
      }
      const li = h('li', { 'data-id': e.id, class: app.selected === e.id ? 'selected' : '', style: '--accent:' + color }, [
        h('span', { class: 'li-dot' }),
        h('span', { class: 'li-text' }, [h('span', { class: 'li-name', text: MP.label(e) }), sub ? h('span', { class: 'li-sub', text: sub }) : null]),
        errs.has(e.id) ? h('span', { class: 'li-flag error', title: 'Erreur', text: '!' }) : warns.has(e.id) ? h('span', { class: 'li-flag warning', title: 'Avertissement', text: '!' }) : null,
      ]);
      li.addEventListener('click', () => app.select(e.id, { center: true, keepList: true }));
      ul.appendChild(li);
    }
    if (!list.length) ul.appendChild(h('li', { class: 'empty', text: q ? 'Aucun résultat.' : 'Rien pour l\'instant. Cliquez sur « + Ajouter ».' }));
  }

  function renderLegend() {
    const lg = $('#legend');
    lg.textContent = '';
    for (const t of Object.values(MP.STEP_TYPES)) {
      lg.appendChild(h('span', { class: 'lg', style: '--accent:' + t.color }, [h('i'), t.label]));
    }
    lg.appendChild(h('span', { class: 'lg lg-item' }, ['◆ Objet']));
    lg.appendChild(h('span', { class: 'lg lg-know' }, ['● Connaissance']));
  }

  function renderView() {
    const v = app.view;
    if (v === 'graph') {
      let sim = null; let owned = null;
      if (app.simOn && app.sim) {
        sim = {};
        app.sc.steps.forEach((s) => { sim[s.id] = app.sim.status(s.id); });
        owned = new Set();
        Object.values(app.sim.inv).forEach((inv) => inv.items.concat(inv.know).forEach((x) => owned.add(x)));
      }
      graphView.render(app.sc, {
        mode: app.graphMode,
        labels: app.labels,
        selected: app.selected,
        sim, owned,
        errors: new Set(app.analysis.issues.filter((i) => i.level === 'error').map((i) => i.ref)),
      });
    } else if (v === 'relations') {
      MP.renderRelations($('#relations'), app);
    } else if (v === 'resources') {
      MP.renderResources($('#resources-view'), app);
    } else if (v === 'analysis') {
      MP.renderAnalysis($('#analysis-view'), app);
    } else if (v === 'print') {
      MP.renderPrintToolbar($('#print-toolbar'), app);
      MP.renderPrint($('#print-area'), app);
    }
  }

  function renderPanel() {
    const panel = $('#panel');
    if (app.simOn && app.sim) MP.renderSimulation(panel, app);
    else {
      // Ne pas reconstruire le formulaire sous le curseur de l'utilisateur.
      const active = document.activeElement;
      if (active && panel.contains(active) && active.matches('input[type=text], textarea') && panel.dataset.id === String(app.selected)) return;
      MP.renderEditor(panel, app, app.selected);
    }
    panel.dataset.id = String(app.selected);
  }

  function setView(v) {
    app.view = v;
    $$('#view-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    $$('.view').forEach((s) => s.classList.toggle('active', s.dataset.view === v));
    document.body.dataset.view = v;
  }

  /* ---------- Import / export ---------- */
  function exportScenario() {
    const json = JSON.stringify(MP.exportData(app.sc), null, 2);
    MP.saveFile(MP.exportFileName(app.sc), json, 'application/json');
  }

  async function importText(text) {
    let result;
    try {
      result = MP.importData(String(text).replace(/^\uFEFF/, ''));
    } catch (e) {
      MP.notify('Import impossible', e.isImportError ? e.message : 'Ce contenu est illisible.');
      return false;
    }
    const sc = result.scenario;
    if (app.lib.scenarios[sc.id] && !(await MP.dialog({
      title: 'Scénario déjà présent',
      message: `« ${app.lib.scenarios[sc.id].title} » existe déjà dans votre bibliothèque. Le remplacer par le fichier importé, ou importer une copie à côté ?`,
      okLabel: 'Remplacer', cancelLabel: 'Importer une copie',
    }))) {
      sc.id = MP.uid('sc');
      sc.title = (sc.title || 'Sans titre') + ' (import)';
    }
    open(sc);
    const w = result.warnings;
    if (w.length) {
      const shown = w.slice(0, 15);
      if (w.length > 15) shown.push(`… et ${w.length - 15} autre(s).`);
      MP.notify('Scénario importé', `${w.length} correction(s) apportée(s) au fichier :`, shown);
    }
    return true;
  }

  function importScenario(file) {
    const reader = new FileReader();
    reader.onload = () => importText(reader.result);
    reader.onerror = () => MP.notify('Import impossible', 'Le fichier n\'a pas pu être lu.');
    reader.readAsText(file, 'utf-8');
  }

  /*
   * Fenêtre d'import. Le choix de fichier passe par un vrai <label> relié au champ fichier :
   * un clic simulé sur un champ caché est refusé quand la page est publiée en ligne.
   * Coller le texte JSON reste possible si le sélecteur de fichiers est indisponible.
   */
  function openImportDialog() {
    const close = () => { document.removeEventListener('keydown', onKey, true); back.remove(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    const file = h('input', { type: 'file', id: 'import-file', accept: '.json,application/json,text/plain', class: 'visually-hidden' });
    file.addEventListener('change', () => {
      const f = file.files[0];
      if (!f) return;
      close();
      importScenario(f);
    });
    const text = h('textarea', { id: 'import-text', rows: 7, placeholder: '{ "title": "…", "steps": [ … ] }', spellcheck: 'false' });
    const pasteBtn = h('button', { type: 'button', text: 'Importer le texte collé', onclick: async () => {
      if (!text.value.trim()) { text.focus(); return; }
      close();
      await importText(text.value);
    } });
    const back = h('div', { class: 'modal-back' }, h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [
      h('h2', { text: 'Importer un scénario' }),
      h('p', { text: 'Choisissez un fichier .json exporté par Intrigue ou écrit d\'après le modèle. Vous pouvez aussi déposer le fichier sur la page.' }),
      h('div', { class: 'modal-actions start' }, [file, h('label', { for: 'import-file', class: 'btn primary', tabindex: '0', text: 'Choisir un fichier .json' })]),
      h('p', { class: 'small', text: 'Ou collez ici le contenu du fichier :' }),
      text,
      h('div', { class: 'modal-actions' }, [h('button', { type: 'button', text: 'Annuler', onclick: close }), pasteBtn]),
    ]));
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    back.querySelector('label.btn').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    back.querySelector('label.btn').focus();
  }

  /* ---------- Événements ---------- */
  function bind() {
    $$('#view-tabs button').forEach((b) => b.addEventListener('click', () => {
      setView(b.dataset.view);
      renderView();
      renderPanel();
      if (b.dataset.view === 'graph') requestAnimationFrame(() => graphView.applyView());
    }));

    $$('#list-tabs button').forEach((b) => b.addEventListener('click', () => {
      app.listKind = b.dataset.list;
      $$('#list-tabs button').forEach((x) => x.classList.toggle('active', x === b));
      renderList();
    }));

    $('#list-search').addEventListener('input', (e) => { app.search = e.target.value; renderList(); });

    $('#list-add').addEventListener('click', () => {
      const kind = app.listKind;
      const e = MP.create(app.sc, kind);
      app.changed({});
      app.select(e.id, { center: true });
      const first = $('#panel input[type=text]');
      if (first) { first.focus(); first.select(); }
    });

    $$('#graph-mode button').forEach((b) => b.addEventListener('click', () => {
      app.graphMode = b.dataset.mode;
      $$('#graph-mode button').forEach((x) => x.classList.toggle('active', x === b));
      renderView();
      graphView.fit();
    }));
    $('#graph-labels').addEventListener('change', (e) => { app.labels = e.target.checked; renderView(); });
    $('#graph-fit').addEventListener('click', () => graphView.fit());
    $('#graph-relayout').addEventListener('click', () => {
      if (app.sc.positions[app.graphMode]) delete app.sc.positions[app.graphMode];
      save();
      renderView();
      graphView.fit();
    });

    $('#sim-toggle').addEventListener('click', () => {
      app.simOn = !app.simOn;
      if (app.simOn && (!app.sim || app.sim.sc !== app.sc)) app.sim = new MP.Simulation(app.sc);
      if (app.view !== 'graph') setView('graph');
      app.refresh();
    });

    $('#scenario-title').addEventListener('click', () => {
      app.simOn = false;
      app.select(null);
      app.refresh();
    });

    $('#library').addEventListener('change', (e) => open(app.lib.scenarios[e.target.value], false));

    $$('[data-action]').forEach((b) => b.addEventListener('click', async () => {
      const act = b.dataset.action;
      if (act === 'new') {
        const title = await MP.dialog({ title: 'Nouveau scénario', message: 'Titre du scénario :', input: true, defaultValue: 'Nouveau scénario', okLabel: 'Créer' });
        if (title == null) return;
        const sc = MP.newScenario('murder');
        sc.title = title || 'Nouveau scénario';
        open(sc);
      } else if (act === 'example') {
        open(MP.exampleScenario());
      } else if (act === 'import') {
        openImportDialog();
      } else if (act === 'export') {
        exportScenario();
      } else if (act === 'delete') {
        if (!(await MP.dialog({ title: 'Supprimer le scénario', message: `Supprimer définitivement « ${app.sc.title} »${MP.cloud.on ? '' : ' de ce navigateur'} ? Exportez-le d'abord si vous voulez le garder.`, okLabel: 'Supprimer', danger: true }))) return;
        delete app.lib.scenarios[app.sc.id];
        if (MP.cloud.on) MP.cloud.remove(app.sc.id);
        const rest = Object.values(app.lib.scenarios).sort((a, c) => (c.updatedAt || 0) - (a.updatedAt || 0));
        open(rest[0] || MP.newScenario());
      }
    }));

    // Glisser-déposer un fichier .json n'importe où dans la page pour l'importer.
    document.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); document.body.classList.add('dropping'); }
    });
    document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
    document.addEventListener('drop', (e) => {
      document.body.classList.remove('dropping');
      const file = e.dataTransfer && e.dataTransfer.files[0];
      if (!file) return;
      e.preventDefault();
      importScenario(file);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.target.matches('input, textarea, select') && !document.querySelector('.modal-back')) app.select(null);
    });
    window.addEventListener('resize', () => graphView.applyView());
  }

  /* ---------- Démarrage ---------- */
  async function start() {
    graphView = new MP.GraphView($('#graph'), {
      onSelect: (id) => app.select(id),
      onMove: (id, x, y) => {
        const mode = app.graphMode;
        app.sc.positions[mode] = app.sc.positions[mode] || {};
        app.sc.positions[mode][id] = { x, y };
        save();
      },
      onActivate: (id) => {
        if (!app.simOn || !app.sim) return;
        const s = app.sc.steps.find((x) => x.id === id);
        const who = s ? app.sim.whoCan(s) : [];
        if (who.length === 1) { app.sim.perform(id, who[0]); app.refresh(); }
      },
    });
    bind();
    renderLegend();
    setView('graph');
    const current = app.lib.current && app.lib.scenarios[app.lib.current];
    const first = current || Object.values(app.lib.scenarios)[0];
    open(first || MP.exampleScenario(), false);

    // En ligne : la bibliothèque devient celle de la base partagée.
    if (!(await MP.cloud.connect())) return;
    MP.cloud.onError = (e, op) => { cloudError(e, op); renderSync(); };
    let firstSnapshot = true;
    MP.cloud.subscribe((changes) => {
      if (!firstSnapshot) { applyRemote(changes); return; }
      firstSnapshot = false;
      const local = app.lib.scenarios;
      const remote = {};
      for (const c of changes) {
        const sc = MP.cloud.toScenario(c.id, c.data);
        if (sc) remote[c.id] = sc;
      }
      // Premier passage en ligne : on y range, une seule fois, les scénarios créés dans ce navigateur.
      if (!app.lib.migrated && !MP.cloud.readOnly) {
        for (const sc of Object.values(local)) {
          if (remote[sc.id] || (!first && sc === app.sc) || !MP.cloud.validId(sc.id)) continue;
          remote[sc.id] = sc;
          MP.cloud.write(sc);
        }
        app.lib.migrated = true;
      }
      app.lib.scenarios = remote;
      const keep = app.sc && remote[app.sc.id];
      const next = keep || (app.lib.current && remote[app.lib.current])
        || Object.values(remote).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
      if (next) open(next, false);
      else open(MP.exampleScenario(), false);
      MP.storage.save(app.lib);
      renderSync();
    }, (e) => {
      MP.cloud.on = false;
      renderSync();
      if (MP.cloud.mode === 'server') cloudError(e, 'subscribe');
    });
    renderSync();
  }

  start();
})();
