/* Panneau d'édition : formulaires des étapes, objets, connaissances, personnages et du scénario. */
(function () {
  const MP = (window.MP = window.MP || {});
  const esc = (s) => MP.escape(s);

  function h(tag, attrs, children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children || [])) if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return e;
  }
  MP.h = h;

  class Form {
    constructor(app, root) {
      this.app = app;
      this.root = root;
    }

    section(title) {
      const s = h('div', { class: 'form-section' }, title ? [h('h3', { text: title })] : []);
      this.root.appendChild(s);
      this.cur = s;
      return s;
    }

    field(label, input, hint) {
      const f = h('label', { class: 'field' }, [h('span', { class: 'field-label', text: label }), input]);
      if (hint) f.appendChild(h('span', { class: 'hint', text: hint }));
      (this.cur || this.root).appendChild(f);
      return f;
    }

    text(label, obj, key, opts = {}) {
      const input = h('input', { type: 'text', value: obj[key] || '', placeholder: opts.placeholder, list: opts.list });
      input.addEventListener('input', () => { obj[key] = input.value; this.app.changed({ soft: true }); });
      return this.field(label, input, opts.hint);
    }

    textarea(label, obj, key, opts = {}) {
      const input = h('textarea', { rows: opts.rows || 3, placeholder: opts.placeholder });
      input.value = obj[key] || '';
      const grow = () => { input.style.height = 'auto'; input.style.height = input.scrollHeight + 2 + 'px'; };
      input.addEventListener('input', () => { grow(); obj[key] = input.value; this.app.changed({ soft: true }); });
      requestAnimationFrame(grow);
      return this.field(label, input, opts.hint);
    }

    select(label, obj, key, options, opts = {}) {
      const input = h('select', {}, Object.entries(options).map(([v, l]) => h('option', { value: v, text: l, selected: obj[key] === v })));
      input.addEventListener('change', () => { obj[key] = input.value; this.app.changed({ panel: opts.rerender }); });
      return this.field(label, input, opts.hint);
    }

    checkbox(label, obj, key, hint) {
      const input = h('input', { type: 'checkbox', checked: !!obj[key] });
      input.addEventListener('change', () => { obj[key] = input.checked; this.app.changed({}); });
      const f = h('label', { class: 'field check' }, [input, h('span', { text: label })]);
      if (hint) f.appendChild(h('span', { class: 'hint', text: hint }));
      this.cur.appendChild(f);
    }

    color(label, obj, key) {
      const input = h('input', { type: 'color', value: obj[key] || '#888888' });
      input.addEventListener('input', () => { obj[key] = input.value; this.app.changed({ soft: true }); });
      return this.field(label, input);
    }

    /* Liste de références (puces) : get() renvoie les ids, set(ids) les enregistre. */
    refs(label, kind, get, set, opts = {}) {
      const sc = this.app.sc;
      const ids = get();
      const wrap = h('div', { class: 'refs' });
      const chips = h('div', { class: 'chips' });
      for (const id of ids) {
        const f = MP.find(sc, id);
        const chip = h('span', { class: 'chip chip-' + kind }, [
          h('button', { class: 'chip-link', type: 'button', text: f ? MP.label(f.obj) : '?', onclick: (ev) => { ev.preventDefault(); this.app.select(id, { center: true }); } }),
          h('button', { class: 'chip-x', type: 'button', title: 'Retirer', text: '×', onclick: (ev) => { ev.preventDefault(); set(ids.filter((x) => x !== id)); this.app.changed({ panel: true }); } }),
        ]);
        if (f && f.obj.color) chip.style.setProperty('--chip', f.obj.color);
        chips.appendChild(chip);
      }
      if (!ids.length) chips.appendChild(h('span', { class: 'muted small', text: opts.empty || 'Aucun' }));
      const choices = sc[kind].filter((e) => !ids.includes(e.id) && !(opts.exclude || []).includes(e.id));
      const sel = h('select', { class: 'ref-add' }, [
        h('option', { value: '', text: '+ Ajouter…' }),
        ...choices.map((e) => h('option', { value: e.id, text: MP.label(e) })),
        opts.noCreate ? null : h('option', { value: '__new', text: '+ Créer ' + MP.KINDS[kind].label.toLowerCase() + '…' }),
      ]);
      sel.addEventListener('change', () => {
        let id = sel.value;
        if (!id) return;
        if (id === '__new') {
          const name = prompt('Nom du nouvel élément (' + MP.KINDS[kind].label.toLowerCase() + ') :');
          if (!name) { sel.value = ''; return; }
          const e = MP.create(sc, kind, kind === 'steps' ? { title: name } : { name });
          id = e.id;
        }
        set(ids.concat(id));
        this.app.changed({ panel: true });
      });
      wrap.appendChild(chips);
      wrap.appendChild(sel);
      return this.field(label, wrap, opts.hint);
    }

    /* Références « inverses » : quelles entités ont cet id dans leur champ. */
    reverseRefs(label, kind, field, id, opts) {
      const sc = this.app.sc;
      return this.refs(label, kind,
        () => sc[kind].filter((e) => e[field].includes(id)).map((e) => e.id),
        (ids) => {
          for (const e of sc[kind]) {
            const has = e[field].includes(id);
            if (ids.includes(e.id) && !has) e[field].push(id);
            if (!ids.includes(e.id) && has) e[field] = e[field].filter((x) => x !== id);
          }
        }, opts);
    }

    issues(id) {
      const list = this.app.analysis.issues.filter((i) => i.ref === id);
      if (!list.length) return;
      const box = h('div', { class: 'issues-inline' }, list.map((i) => h('div', { class: 'issue issue-' + i.level, text: i.msg })));
      this.root.appendChild(box);
    }

    actions(id) {
      const bar = h('div', { class: 'panel-actions' }, [
        h('button', { type: 'button', text: 'Dupliquer', onclick: () => { const c = MP.duplicate(this.app.sc, id); this.app.changed({}); this.app.select(c.id); } }),
        h('button', { type: 'button', class: 'danger', text: 'Supprimer', onclick: () => {
          if (!confirm('Supprimer « ' + MP.nameOf(this.app.sc, id) + ' » ? Les liens vers cet élément seront retirés.')) return;
          MP.remove(this.app.sc, id); this.app.select(null); this.app.changed({});
        } }),
      ]);
      this.root.appendChild(bar);
    }
  }

  function header(root, kindLabel, title, color) {
    const hd = h('div', { class: 'panel-head' }, [
      h('span', { class: 'kind-tag', text: kindLabel }),
      h('h2', { text: title }),
    ]);
    if (color) hd.style.setProperty('--accent', color);
    root.appendChild(hd);
  }

  function locations(sc) {
    const set = new Set();
    sc.steps.forEach((s) => s.location && set.add(s.location));
    sc.items.forEach((i) => i.location && set.add(i.location));
    return Array.from(set).sort();
  }

  MP.renderEditor = function (root, app, id) {
    root.textContent = '';
    const sc = app.sc;
    const dl = h('datalist', { id: 'locations' }, locations(sc).map((l) => h('option', { value: l })));
    root.appendChild(dl);

    if (!id || id === '__scenario') return scenarioForm(root, app);
    const found = MP.find(sc, id);
    if (!found) return scenarioForm(root, app);
    const { kind, obj } = found;
    const form = new Form(app, root);

    if (kind === 'steps') {
      const type = MP.STEP_TYPES[obj.type] || MP.STEP_TYPES.action;
      header(root, 'Étape · ' + type.label, obj.title, type.color);
      form.issues(id);
      form.section();
      form.text('Titre', obj, 'title');
      form.select('Type', obj, 'type', Object.fromEntries(Object.entries(MP.STEP_TYPES).map(([k, v]) => [k, v.label])), { rerender: true });
      const row = h('div', { class: 'row3' });
      form.cur.appendChild(row);
      const saved = form.cur; form.cur = row;
      form.text('Acte / phase', obj, 'act', { placeholder: 'Acte 1' });
      form.text('Lieu', obj, 'location', { list: 'locations' });
      form.text('Durée (min)', obj, 'duration');
      form.cur = saved;
      form.refs('Qui peut la réaliser', 'characters', () => obj.who, (v) => { obj.who = v; }, { empty: 'Tout le monde', noCreate: true, hint: 'Vide = n\'importe quel joueur.' });
      form.checkbox('Étape publique', obj, 'public', 'Les connaissances obtenues sont révélées à tous les joueurs (annonce, scène collective).');

      form.section('Prérequis');
      form.refs('Étapes terminées', 'steps', () => obj.reqSteps, (v) => { obj.reqSteps = v; }, { exclude: [obj.id], hint: 'Événements qui doivent avoir eu lieu, sans objet ni connaissance à transmettre.' });
      form.refs('Objets à posséder', 'items', () => obj.reqItems, (v) => { obj.reqItems = v; });
      form.refs('Connaissances à posséder', 'knowledge', () => obj.reqKnow, (v) => { obj.reqKnow = v; });

      form.section('Ce que l\'étape donne');
      form.refs('Objets obtenus', 'items', () => obj.giveItems, (v) => { obj.giveItems = v; });
      form.refs('Connaissances obtenues', 'knowledge', () => obj.giveKnow, (v) => { obj.giveKnow = v; });

      form.section('Contenu');
      form.textarea('Déroulé (pour le maître du jeu)', obj, 'description', { rows: 3 });
      form.textarea('Énoncé pour les joueurs', obj, 'playerText', { rows: 3, hint: 'Imprimé sur la fiche d\'énigme.' });
      form.text('Solution', obj, 'solution');
      form.textarea('Indices progressifs', obj, 'hints', { rows: 3, hint: 'Un indice par ligne, du plus léger au plus direct.' });

      form.section('Liens calculés');
      const edges = MP.dependencyEdges(sc);
      const before = edges.filter((e) => e.to === id).map((e) => e.from);
      const after = edges.filter((e) => e.from === id).map((e) => e.to);
      form.cur.appendChild(linkList(app, 'Débloquée par', before));
      form.cur.appendChild(linkList(app, 'Débloque', after));
      form.actions(id);
    } else if (kind === 'items' || kind === 'knowledge') {
      const isItem = kind === 'items';
      header(root, isItem ? 'Objet' : 'Connaissance', obj.name, isItem ? 'var(--item)' : 'var(--know)');
      form.issues(id);
      form.section();
      form.text('Nom', obj, 'name');
      form.textarea(isItem ? 'Description (texte de la carte)' : 'Contenu (texte de la carte)', obj, 'description', { rows: 3 });
      if (isItem) form.text('Cachette / emplacement de départ', obj, 'location', { list: 'locations', hint: 'Où le maître du jeu le place avant la partie.' });
      form.checkbox('Fausse piste', obj, 'redHerring', 'Volontairement inutile : l\'analyse ne le signalera pas.');
      form.textarea('Notes du maître du jeu', obj, 'notes', { rows: 2 });

      form.section('Circulation');
      const startField = isItem ? 'startItems' : 'startKnow';
      form.reverseRefs('Au départ chez', 'characters', startField, id, { noCreate: true, empty: 'Personne' });
      form.reverseRefs('Obtenu' + (isItem ? '' : 'e') + ' en réalisant', 'steps', isItem ? 'giveItems' : 'giveKnow', id, { empty: 'Aucune étape' });
      form.reverseRefs('Nécessaire pour', 'steps', isItem ? 'reqItems' : 'reqKnow', id, { empty: 'Aucune étape' });
      form.actions(id);
    } else if (kind === 'characters') {
      header(root, obj.player ? 'Personnage joueur' : 'Personnage non joueur', obj.name, obj.color);
      form.issues(id);
      form.section();
      form.text('Nom', obj, 'name');
      form.text('Rôle', obj, 'role', { placeholder: 'Le majordome' });
      form.checkbox('Joué par un joueur', obj, 'player', 'Décochez pour la victime ou un personnage joué par le maître du jeu.');
      form.color('Couleur', obj, 'color');
      form.textarea('Présentation', obj, 'description', { rows: 3 });
      form.textarea('Secret', obj, 'secret', { rows: 2 });
      form.textarea('Objectifs', obj, 'objectives', { rows: 3, hint: 'Un objectif par ligne.' });

      form.section('Au départ');
      form.refs('Objets en sa possession', 'items', () => obj.startItems, (v) => { obj.startItems = v; });
      form.refs('Ce qu\'il ou elle sait', 'knowledge', () => obj.startKnow, (v) => { obj.startKnow = v; });

      form.section('Relations');
      relationsEditor(form, app, obj);

      form.section('Rôle dans le scénario');
      form.cur.appendChild(linkList(app, 'Étapes réservées', sc.steps.filter((s) => s.who.includes(id)).map((s) => s.id)));
      const alone = app.analysis.alone[id];
      if (alone) form.cur.appendChild(h('p', { class: 'muted small', text: `Seul, sans aide des autres joueurs, ce personnage peut réaliser ${alone.size} étape(s) sur ${sc.steps.length}.` }));
      form.actions(id);
    }
  };

  function linkList(app, label, ids) {
    const div = h('div', { class: 'linklist' }, [h('span', { class: 'field-label', text: label })]);
    if (!ids.length) div.appendChild(h('span', { class: 'muted small', text: 'Aucune' }));
    for (const id of ids) {
      div.appendChild(h('button', { type: 'button', class: 'link', text: MP.nameOf(app.sc, id), onclick: () => app.select(id, { center: true }) }));
    }
    return div;
  }

  function relationsEditor(form, app, obj) {
    const sc = app.sc;
    const list = h('div', { class: 'relations-edit' });
    obj.relations.forEach((r, i) => {
      const sel = h('select', {}, sc.characters.filter((c) => c.id !== obj.id).map((c) => h('option', { value: c.id, text: c.name, selected: c.id === r.to })));
      sel.addEventListener('change', () => { r.to = sel.value; app.changed({}); });
      const input = h('input', { type: 'text', value: r.label, placeholder: 'Ce qu\'il en pense' });
      input.addEventListener('input', () => { r.label = input.value; app.changed({ soft: true }); });
      const del = h('button', { type: 'button', class: 'icon', title: 'Retirer', text: '×', onclick: () => { obj.relations.splice(i, 1); app.changed({ panel: true }); } });
      list.appendChild(h('div', { class: 'relation-row' }, [sel, input, del]));
    });
    const others = sc.characters.filter((c) => c.id !== obj.id);
    if (others.length) {
      list.appendChild(h('button', { type: 'button', text: '+ Ajouter une relation', onclick: () => {
        obj.relations.push({ to: others[0].id, label: '' }); app.changed({ panel: true });
      } }));
    } else {
      list.appendChild(h('p', { class: 'muted small', text: 'Créez d\'autres personnages pour définir des relations.' }));
    }
    form.cur.appendChild(list);
  }

  function scenarioForm(root, app) {
    const sc = app.sc;
    header(root, 'Scénario', sc.title);
    const form = new Form(app, root);
    form.section();
    form.text('Titre', sc, 'title');
    form.select('Type', sc, 'type', MP.SCENARIO_TYPES);
    const row = h('div', { class: 'row2' });
    form.cur.appendChild(row);
    const saved = form.cur; form.cur = row;
    form.text('Joueurs', sc, 'players', { placeholder: '6 à 8 joueurs' });
    form.text('Durée', sc, 'duration', { placeholder: '2 h' });
    form.cur = saved;
    form.textarea('Synopsis (lu aux joueurs)', sc, 'synopsis', { rows: 5 });
    form.textarea('La vérité (pour le maître du jeu)', sc, 'truth', { rows: 5 });

    form.section('En bref');
    const a = app.analysis;
    const reach = a.pooled.done.size;
    const stats = [
      [sc.steps.length, 'étapes'], [sc.items.length, 'objets'], [sc.knowledge.length, 'connaissances'],
      [sc.characters.filter((c) => c.player).length, 'personnages joueurs'],
      [reach + ' / ' + sc.steps.length, 'étapes atteignables'],
      [a.minWaves == null ? '–' : a.minWaves, 'vagues minimum jusqu\'à la fin'],
    ];
    form.cur.appendChild(h('div', { class: 'stats' }, stats.map(([v, l]) => h('div', { class: 'stat' }, [h('strong', { text: String(v) }), h('span', { text: l })]))));
    form.cur.appendChild(h('p', { class: 'muted small', text: 'Sélectionnez un élément dans la liste ou le graphe pour le modifier.' }));
  }

  MP.Form = Form;
  MP.escapeHtml = esc;
})();
