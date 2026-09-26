/* Vues secondaires : relations, ressources, analyse, simulation, impression. */
(function () {
  const MP = (window.MP = window.MP || {});
  const h = (...a) => MP.h(...a);
  const NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  }

  const initials = (name) => name.split(/\s+/).filter((w) => /^[A-ZÀ-Ý]/.test(w)).slice(-2).map((w) => w[0]).join('') || name[0] || '?';

  /* ---------------- Relations entre personnages ---------------- */
  MP.renderRelations = function (svg, app) {
    const sc = app.sc;
    svg.textContent = '';
    const chars = sc.characters;
    if (!chars.length) {
      svg.setAttribute('viewBox', '0 0 600 120');
      const t = svgEl('text', { x: 300, y: 60, 'text-anchor': 'middle', class: 'rel-empty' }, svg);
      t.textContent = 'Aucun personnage pour l\'instant.';
      return;
    }
    const n = chars.length;
    const R = Math.max(170, n * 42);
    const W = 2 * R + 360; const H = 2 * R + 200;
    const cx = W / 2; const cy = H / 2;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const defs = svgEl('defs', {}, svg);
    const m = svgEl('marker', { id: 'rel-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto' }, defs);
    svgEl('path', { d: 'M0,0 L10,5 L0,10 z', class: 'rel-arrow' }, m);

    const pos = {};
    chars.forEach((c, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      pos[c.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
    });
    const gE = svgEl('g', {}, svg);
    const gL = svgEl('g', {}, svg);
    const pairs = new Set();
    chars.forEach((c) => c.relations.forEach((r) => pairs.add(c.id + '>' + r.to)));
    const sel = chars.some((c) => c.id === app.selected) ? app.selected : null;
    for (const c of chars) {
      for (const r of c.relations) {
        const a = pos[c.id]; const b = pos[r.to];
        if (!b) continue;
        const dx = b.x - a.x; const dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len; const uy = dy / len;
        const off = pairs.has(r.to + '>' + c.id) ? 28 : 0;
        const x1 = a.x + ux * 30; const y1 = a.y + uy * 30;
        const x2 = b.x - ux * 34; const y2 = b.y - uy * 34;
        const mx = (x1 + x2) / 2 - uy * off; const my = (y1 + y2) / 2 + ux * off;
        const dim = sel && sel !== c.id && sel !== r.to;
        svgEl('path', { d: `M${x1},${y1} Q${mx},${my} ${x2},${y2}`, class: 'rel-edge' + (dim ? ' dim' : ''), style: 'stroke:' + c.color, 'marker-end': 'url(#rel-arrow)' }, gE);
        if (r.label) {
          const lx = (x1 + 2 * mx + x2) / 4; const ly = (y1 + 2 * my + y2) / 4;
          const t = svgEl('text', { x: lx, y: ly + 4, 'text-anchor': 'middle', class: 'rel-label' + (dim ? ' dim' : '') }, gL);
          t.textContent = r.label.length > 38 ? r.label.slice(0, 37) + '…' : r.label;
        }
      }
    }
    for (const c of chars) {
      const p = pos[c.id];
      const g = svgEl('g', { class: 'rel-node' + (sel === c.id ? ' selected' : '') + (c.player ? '' : ' npc'), transform: `translate(${p.x},${p.y})` }, svg);
      svgEl('circle', { r: 28, style: 'fill:' + c.color }, g);
      const t = svgEl('text', { y: 6, 'text-anchor': 'middle', class: 'rel-initials' }, g);
      t.textContent = initials(c.name).slice(0, 2);
      const name = svgEl('text', { y: 48, 'text-anchor': 'middle', class: 'rel-name' }, g);
      name.textContent = c.name;
      const role = svgEl('text', { y: 64, 'text-anchor': 'middle', class: 'rel-role' }, g);
      role.textContent = c.role + (c.player ? '' : ' (non joueur)');
      g.addEventListener('click', () => app.select(c.id));
    }
  };

  /* ---------------- Tableau des ressources ---------------- */
  MP.renderResources = function (root, app) {
    const sc = app.sc;
    const idx = app.analysis.idx;
    root.textContent = '';
    root.appendChild(h('p', { class: 'muted', text: 'Circulation de chaque objet et connaissance : qui l\'a au départ, quelle étape le donne, quelle étape en a besoin.' }));
    const links = (ids) => {
      const td = h('td');
      if (!ids || !ids.length) td.appendChild(h('span', { class: 'muted', text: '–' }));
      (ids || []).forEach((id) => td.appendChild(h('button', { class: 'link', type: 'button', text: MP.nameOf(sc, id), onclick: () => app.select(id) })));
      return td;
    };
    const status = (r) => {
      const prod = idx.producers[r.id]; const cons = idx.consumers[r.id]; const hold = idx.holders[r.id];
      if (cons && !prod && !hold) return ['error', 'Sans source'];
      if (r.redHerring) return ['info', 'Fausse piste'];
      if (!cons && (prod || hold)) return ['warning', 'Inutilisé'];
      if (!cons && !prod && !hold) return ['warning', 'Orphelin'];
      return ['ok', 'OK'];
    };
    for (const [kind, title] of [['items', 'Objets'], ['knowledge', 'Connaissances']]) {
      root.appendChild(h('h2', { text: title + ' (' + sc[kind].length + ')' }));
      const table = h('table', { class: 'grid' });
      table.appendChild(h('thead', {}, h('tr', {}, ['Nom', 'Au départ chez', 'Obtenu à l\'étape', 'Nécessaire pour', kind === 'items' ? 'Cachette' : '', 'État'].filter((x, i) => x || i !== 4).map((t) => h('th', { text: t })))));
      const tb = h('tbody');
      for (const r of sc[kind]) {
        const [lvl, lab] = status(r);
        const tr = h('tr', { class: app.selected === r.id ? 'selected' : '' }, [
          h('td', {}, h('button', { class: 'link strong', type: 'button', text: (kind === 'items' ? '◆ ' : '● ') + r.name, onclick: () => app.select(r.id) })),
          links(idx.holders[r.id]),
          links(idx.producers[r.id]),
          links(idx.consumers[r.id]),
          kind === 'items' ? h('td', { text: r.location || '–' }) : null,
          h('td', {}, h('span', { class: 'tag tag-' + lvl, text: lab })),
        ]);
        tb.appendChild(tr);
      }
      table.appendChild(tb);
      root.appendChild(table);
    }

    // Matrice personnages × ressources de départ.
    const players = sc.characters.filter((c) => c.startItems.length || c.startKnow.length);
    if (players.length) {
      root.appendChild(h('h2', { text: 'Ce que chacun a en main au départ' }));
      const wrap = h('div', { class: 'cards-row' });
      for (const c of players) {
        wrap.appendChild(h('div', { class: 'mini-card', style: '--accent:' + c.color }, [
          h('button', { class: 'link strong', type: 'button', text: c.name, onclick: () => app.select(c.id) }),
          ...c.startItems.map((i) => h('div', { class: 'res res-item', text: '◆ ' + MP.nameOf(sc, i) })),
          ...c.startKnow.map((k) => h('div', { class: 'res res-know', text: '● ' + MP.nameOf(sc, k) })),
        ]));
      }
      root.appendChild(wrap);
    }
  };

  /* ---------------- Analyse ---------------- */
  MP.renderAnalysis = function (root, app) {
    const sc = app.sc;
    const a = app.analysis;
    root.textContent = '';

    const players = sc.characters.filter((c) => c.player);
    const stats = [
      [a.counts.error, 'erreurs', 'error'], [a.counts.warning, 'avertissements', 'warning'], [a.counts.info, 'remarques', 'info'],
      [a.pooled.done.size + ' / ' + sc.steps.length, 'étapes atteignables', ''],
      [a.minWaves == null ? '–' : a.minWaves, 'vagues avant la fin', ''],
      [a.coop.length, 'étapes exigeant une coopération', ''],
    ];
    root.appendChild(h('div', { class: 'stats wide' }, stats.map(([v, l, c]) => h('div', { class: 'stat ' + c }, [h('strong', { text: String(v) }), h('span', { text: l })]))));

    root.appendChild(h('h2', { text: 'Points à vérifier' }));
    if (!a.issues.length) root.appendChild(h('p', { class: 'ok-msg', text: 'Aucun problème détecté. Toutes les étapes sont atteignables.' }));
    const list = h('div', { class: 'issue-list' });
    for (const i of a.issues) {
      list.appendChild(h('div', { class: 'issue issue-' + i.level }, [
        h('span', { class: 'issue-level', text: { error: 'Erreur', warning: 'Attention', info: 'Remarque' }[i.level] }),
        i.ref ? h('button', { class: 'link strong', type: 'button', text: MP.nameOf(sc, i.ref), onclick: () => app.select(i.ref, { view: 'graph', center: true }) }) : null,
        h('span', { text: i.msg }),
      ]));
    }
    root.appendChild(list);

    // Déroulé idéal en vagues : ce qui peut se jouer en parallèle.
    root.appendChild(h('h2', { text: 'Déroulé au plus court, par vagues' }));
    root.appendChild(h('p', { class: 'muted', text: 'Si tous les joueurs mettaient leurs informations en commun, voici les étapes réalisables en parallèle à chaque vague. Beaucoup de vagues = scénario linéaire ; des vagues larges = plusieurs pistes en même temps.' }));
    const waves = [];
    for (const s of sc.steps) {
      const w = a.pooled.wave[s.id];
      if (w) (waves[w - 1] = waves[w - 1] || []).push(s);
    }
    const tl = h('div', { class: 'waves' });
    waves.forEach((L, i) => {
      tl.appendChild(h('div', { class: 'wave' }, [
        h('div', { class: 'wave-head', text: 'Vague ' + (i + 1) }),
        ...L.map((s) => h('button', {
          type: 'button', class: 'wave-step' + (a.coop.includes(s.id) ? ' coop' : ''),
          style: '--accent:' + (MP.STEP_TYPES[s.type] || MP.STEP_TYPES.action).color,
          title: a.coop.includes(s.id) ? 'Exige que plusieurs joueurs mettent en commun ce qu\'ils savent ou possèdent' : '',
          text: s.title, onclick: () => app.select(s.id, { view: 'graph', center: true }),
        })),
      ]));
    });
    root.appendChild(tl);
    if (a.coop.length) root.appendChild(h('p', { class: 'muted small', text: 'Les étapes en pointillés exigent une coopération : aucun joueur ne peut les atteindre seul.' }));

    if (players.length) {
      root.appendChild(h('h2', { text: 'Autonomie de chaque personnage' }));
      root.appendChild(h('p', { class: 'muted', text: 'Nombre d\'étapes qu\'un joueur peut réaliser seul, sans rien recevoir des autres. Un personnage très bas risque de s\'ennuyer en début de partie ; un personnage très haut peut résoudre l\'intrigue sans les autres.' }));
      const bars = h('div', { class: 'bars' });
      for (const c of players) {
        const v = a.alone[c.id] ? a.alone[c.id].size : 0;
        const pct = sc.steps.length ? (100 * v) / sc.steps.length : 0;
        bars.appendChild(h('div', { class: 'bar-row' }, [
          h('button', { class: 'link', type: 'button', text: c.name, onclick: () => app.select(c.id) }),
          h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: `width:${pct}%;background:${c.color}` })),
          h('span', { class: 'bar-val', text: String(v) }),
        ]));
      }
      root.appendChild(bars);
    }
  };

  /* ---------------- Panneau de simulation ---------------- */
  MP.renderSimulation = function (root, app) {
    const sc = app.sc;
    const sim = app.sim;
    root.textContent = '';
    root.appendChild(h('div', { class: 'panel-head', style: '--accent:var(--accent-main)' }, [
      h('span', { class: 'kind-tag', text: 'Simulation' }),
      h('h2', { text: 'Tester le scénario' }),
    ]));

    const mode = h('select', {}, [
      h('option', { value: 'individual', text: 'Chaque joueur a son inventaire', selected: sim.mode === 'individual' }),
      h('option', { value: 'team', text: 'Une seule équipe, tout en commun', selected: sim.mode === 'team' }),
    ]);
    mode.addEventListener('change', () => { app.sim = new MP.Simulation(sc, mode.value); app.refresh(); });
    root.appendChild(h('label', { class: 'field' }, [h('span', { class: 'field-label', text: 'Mode' }), mode]));

    const total = sc.steps.length;
    const endings = sc.steps.filter((s) => s.type === 'fin');
    const reachedEnd = endings.some((s) => sim.done.includes(s.id));
    root.appendChild(h('div', { class: 'sim-progress' }, [
      h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: `width:${total ? (100 * sim.done.length) / total : 0}%` })),
      h('span', { text: `${sim.done.length} / ${total} étapes` + (reachedEnd ? ' · fin atteinte' : '') }),
    ]));
    root.appendChild(h('div', { class: 'panel-actions' }, [
      h('button', { type: 'button', text: 'Annuler', disabled: !sim.history.length, onclick: () => { sim.undo(); app.refresh(); } }),
      h('button', { type: 'button', text: 'Recommencer', onclick: () => { sim.reset(); app.refresh(); } }),
      h('button', { type: 'button', text: 'Tout jouer', title: 'Réalise automatiquement tout ce qui est possible sans échange entre joueurs', onclick: () => { sim.autoplay(); app.refresh(); } }),
    ]));

    // Étape sélectionnée.
    const selStep = sc.steps.find((s) => s.id === app.selected);
    if (selStep) {
      const box = h('div', { class: 'sim-selected' }, [h('h3', { text: selStep.title })]);
      const st = sim.status(selStep.id);
      if (st === 'done') box.appendChild(h('p', { class: 'tag tag-ok', text: 'Réalisée' }));
      else if (st === 'available') {
        box.appendChild(actorButtons(app, selStep));
      } else {
        const miss = sim.missingGlobal(selStep);
        if (miss.length) box.appendChild(h('p', { class: 'muted small', text: 'Il manque : ' + miss.map((x) => MP.nameOf(sc, x)).join(', ') }));
        else if (sim.mode === 'individual') box.appendChild(h('p', { class: 'muted small', text: 'Tout existe, mais réparti entre plusieurs joueurs (ou réservé à un autre) : il faut échanger objets ou informations.' }));
      }
      root.appendChild(box);
    }

    const avail = sc.steps.filter((s) => sim.status(s.id) === 'available');
    root.appendChild(h('h3', { class: 'sim-h', text: `Étapes disponibles (${avail.length})` }));
    if (!avail.length) root.appendChild(h('p', { class: 'muted small', text: reachedEnd ? 'La partie est terminée.' : 'Plus rien n\'est possible sans échange entre joueurs.' }));
    for (const s of avail) {
      root.appendChild(h('div', { class: 'sim-step' }, [
        h('button', { class: 'link strong', type: 'button', text: s.title, onclick: () => app.select(s.id, { center: true }) }),
        actorButtons(app, s),
      ]));
    }

    root.appendChild(h('h3', { class: 'sim-h', text: sim.mode === 'team' ? 'Inventaire de l\'équipe' : 'Inventaires' }));
    for (const actor of sim.actors) {
      const inv = sim.inv[actor.id];
      const card = h('div', { class: 'sim-inv', style: '--accent:' + actor.color }, [h('strong', { text: actor.name })]);
      const chips = h('div', { class: 'chips' });
      inv.items.forEach((i) => chips.appendChild(h('span', { class: 'chip chip-items', text: MP.nameOf(sc, i) })));
      inv.know.forEach((k) => chips.appendChild(h('span', { class: 'chip chip-knowledge', text: MP.nameOf(sc, k) })));
      if (!inv.items.length && !inv.know.length) chips.appendChild(h('span', { class: 'muted small', text: 'Rien' }));
      card.appendChild(chips);
      if (sim.mode === 'individual' && sim.actors.length > 1 && (inv.items.length || inv.know.length)) card.appendChild(exchange(app, actor, inv));
      root.appendChild(card);
    }

    if (sim.log.length) {
      root.appendChild(h('h3', { class: 'sim-h', text: 'Journal' }));
      root.appendChild(h('ol', { class: 'sim-log' }, sim.log.map((l) => h('li', { text: l.text }))));
    }
  };

  function actorButtons(app, step) {
    const sim = app.sim;
    const wrap = h('div', { class: 'actor-buttons' });
    for (const id of sim.whoCan(step)) {
      const actor = sim.actors.find((a) => a.id === id);
      wrap.appendChild(h('button', {
        type: 'button', class: 'actor', style: '--accent:' + actor.color,
        text: sim.mode === 'team' ? 'Réaliser' : actor.name.split(' ').slice(-1)[0],
        title: 'Réaliser en tant que ' + actor.name,
        onclick: () => { sim.perform(step.id, id); app.refresh(); },
      }));
    }
    return wrap;
  }

  function exchange(app, actor, inv) {
    const sim = app.sim;
    const sc = app.sc;
    const res = h('select', {}, [
      ...inv.items.map((i) => h('option', { value: 'i:' + i, text: 'Donner ◆ ' + MP.nameOf(sc, i) })),
      ...inv.know.map((k) => h('option', { value: 'k:' + k, text: 'Révéler ● ' + MP.nameOf(sc, k) })),
    ]);
    const to = h('select', {}, [
      ...sim.actors.filter((a) => a.id !== actor.id).map((a) => h('option', { value: a.id, text: 'à ' + a.name })),
      h('option', { value: '*', text: 'à tout le monde' }),
    ]);
    const go = h('button', { type: 'button', text: 'OK', onclick: () => {
      const [t, id] = res.value.split(':');
      if (t === 'i') {
        if (to.value === '*') { MP.notify('Impossible', 'Un objet ne peut être donné qu\'à une seule personne. Choisissez un destinataire.'); return; }
        sim.give(id, actor.id, to.value);
      } else sim.share(id, actor.id, to.value);
      app.refresh();
    } });
    return h('div', { class: 'exchange' }, [res, to, go]);
  }

  /* ---------------- Impression ---------------- */
  const PRINT_SECTIONS = [
    ['sheets', 'Fiches personnages'],
    ['items', 'Cartes objets'],
    ['knowledge', 'Cartes connaissances'],
    ['puzzles', 'Fiches énigmes'],
    ['guide', 'Guide du maître du jeu'],
  ];

  MP.renderPrintToolbar = function (root, app) {
    root.textContent = '';
    const opts = app.printOpts;
    for (const [key, label] of PRINT_SECTIONS) {
      const cb = h('input', { type: 'checkbox', checked: !!opts[key] });
      cb.addEventListener('change', () => { opts[key] = cb.checked; MP.renderPrint(document.getElementById('print-area'), app); });
      root.appendChild(h('label', { class: 'check' }, [cb, label]));
    }
    const npc = h('input', { type: 'checkbox', checked: !!opts.npc });
    npc.addEventListener('change', () => { opts.npc = npc.checked; MP.renderPrint(document.getElementById('print-area'), app); });
    root.appendChild(h('label', { class: 'check muted' }, [npc, 'inclure les non-joueurs']));
    root.appendChild(h('div', { class: 'spacer' }));
    root.appendChild(h('button', {
      class: 'primary', type: 'button',
      text: MP.isHosted() ? 'Télécharger pour imprimer' : 'Imprimer',
      title: MP.isHosted() ? 'Enregistre un fichier HTML qui ouvre la fenêtre d\'impression' : '',
      onclick: () => MP.printPages(app.sc.title, document.getElementById('print-area').innerHTML),
    }));
  };

  const para = (text) => String(text || '').split(/\n+/).filter(Boolean).map((l) => h('p', { text: l }));
  const lines = (text) => String(text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);

  MP.renderPrint = function (root, app) {
    const sc = app.sc;
    const opts = app.printOpts;
    root.textContent = '';
    const code = {};
    sc.items.forEach((x, i) => { code[x.id] = 'O' + (i + 1); });
    sc.knowledge.forEach((x, i) => { code[x.id] = 'C' + (i + 1); });
    const nm = (id) => MP.nameOf(sc, id);
    const ref = (id) => `${nm(id)} [${code[id] || ''}]`.replace(' []', '');
    const page = (cls, children) => { const p = h('div', { class: 'page ' + (cls || '') }, children); root.appendChild(p); return p; };

    if (opts.sheets) {
      for (const c of sc.characters.filter((x) => x.player || opts.npc)) {
        const others = sc.characters.filter((x) => x.id !== c.id);
        page('sheet', [
          h('div', { class: 'sheet-head', style: '--accent:' + c.color }, [
            h('div', { class: 'sheet-kicker', text: sc.title }),
            h('h1', { text: c.name }),
            c.role ? h('div', { class: 'sheet-role', text: c.role }) : null,
          ]),
          sc.synopsis ? h('div', { class: 'sheet-block synopsis' }, [h('h4', { text: 'L\'histoire' }), ...para(sc.synopsis)]) : null,
          c.description ? h('div', { class: 'sheet-block' }, [h('h4', { text: 'Qui vous êtes' }), ...para(c.description)]) : null,
          c.secret ? h('div', { class: 'sheet-block secret' }, [h('h4', { text: 'Votre secret' }), ...para(c.secret)]) : null,
          c.objectives ? h('div', { class: 'sheet-block' }, [h('h4', { text: 'Vos objectifs' }), h('ul', {}, lines(c.objectives).map((l) => h('li', { text: l })))]) : null,
          c.startKnow.length ? h('div', { class: 'sheet-block' }, [h('h4', { text: 'Ce que vous savez' }), h('ul', {}, c.startKnow.map((k) => {
            const o = sc.knowledge.find((x) => x.id === k);
            return h('li', {}, [h('strong', { text: nm(k) }), o && o.description ? ' : ' + o.description : '']);
          }))]) : null,
          c.startItems.length ? h('div', { class: 'sheet-block' }, [h('h4', { text: 'Ce que vous avez sur vous' }), h('ul', {}, c.startItems.map((i) => h('li', { text: ref(i) })))]) : null,
          others.length ? h('div', { class: 'sheet-block' }, [h('h4', { text: 'Les autres personnages' }), h('ul', {}, others.map((o) => {
            const rel = c.relations.find((r) => r.to === o.id);
            return h('li', {}, [h('strong', { text: o.name }), o.role ? ', ' + o.role : '', rel && rel.label ? h('em', { text: ' : ' + rel.label }) : '']);
          }))]) : null,
        ]);
      }
    }

    const cards = (list, kind, label) => {
      for (let i = 0; i < list.length; i += 9) {
        page('cards', list.slice(i, i + 9).map((r) => h('div', { class: 'card card-' + kind }, [
          h('div', { class: 'card-kind', text: label }),
          h('div', { class: 'card-name', text: r.name }),
          h('div', { class: 'card-desc', text: r.description || '' }),
          h('div', { class: 'card-code', text: code[r.id] }),
        ])));
      }
    };
    if (opts.items) cards(sc.items, 'item', 'Objet');
    // Les connaissances de départ figurent déjà sur les fiches personnages.
    const idx = app.analysis.idx;
    if (opts.knowledge) cards(sc.knowledge.filter((k) => !(idx.holders[k.id] || []).length || (idx.producers[k.id] || []).length), 'know', 'Indice');

    if (opts.puzzles) {
      for (const s of sc.steps.filter((x) => x.playerText)) {
        page('puzzle', [
          h('div', { class: 'sheet-kicker', text: sc.title + (s.location ? ' · ' + s.location : '') }),
          h('h1', { text: s.title }),
          ...para(s.playerText),
        ]);
      }
    }

    if (opts.guide) {
      const a = app.analysis;
      const ordered = sc.steps.slice().sort((x, y) => (a.pooled.wave[x.id] || 999) - (a.pooled.wave[y.id] || 999));
      const guide = page('guide', [
        h('div', { class: 'sheet-kicker', text: 'Guide du maître du jeu · confidentiel' }),
        h('h1', { text: sc.title }),
        h('p', { class: 'meta', text: [MP.SCENARIO_TYPES[sc.type], sc.players, sc.duration].filter(Boolean).join(' · ') }),
        sc.synopsis ? h('div', { class: 'sheet-block' }, [h('h4', { text: 'Synopsis' }), ...para(sc.synopsis)]) : null,
        sc.truth ? h('div', { class: 'sheet-block secret' }, [h('h4', { text: 'La vérité' }), ...para(sc.truth)]) : null,
      ]);
      const placement = [];
      for (const i of sc.items) {
        const holders = sc.characters.filter((c) => c.startItems.includes(i.id)).map((c) => 'Remis à ' + c.name);
        placement.push([ref(i.id), [i.location].concat(holders).filter(Boolean).join(' ; ') || 'Donné par le maître du jeu']);
      }
      if (placement.length) {
        guide.appendChild(h('h4', { text: 'Mise en place du matériel' }));
        guide.appendChild(h('table', { class: 'print-table' }, [
          h('thead', {}, h('tr', {}, [h('th', { text: 'Objet' }), h('th', { text: 'Où / à qui' })])),
          h('tbody', {}, placement.map(([n, w]) => h('tr', {}, [h('td', { text: n }), h('td', { text: w })]))),
        ]));
      }
      const players = sc.characters.filter((c) => c.player);
      if (players.length) {
        guide.appendChild(h('h4', { text: 'Distribution des rôles' }));
        guide.appendChild(h('table', { class: 'print-table' }, [
          h('thead', {}, h('tr', {}, [h('th', { text: 'Personnage' }), h('th', { text: 'Secret' })])),
          h('tbody', {}, players.map((c) => h('tr', {}, [h('td', {}, [h('strong', { text: c.name }), h('br'), c.role]), h('td', { text: c.secret })]))),
        ]));
      }
      guide.appendChild(h('h4', { text: 'Déroulé des étapes' }));
      for (const s of ordered) {
        const w = a.pooled.wave[s.id];
        const row = (label, ids) => (ids.length ? h('div', {}, [h('span', { class: 'lbl', text: label + ' : ' }), ids.map((id) => (code[id] ? ref(id) : nm(id))).join(', ')]) : null);
        guide.appendChild(h('div', { class: 'guide-step' }, [
          h('div', { class: 'guide-step-head' }, [
            h('strong', { text: s.title }),
            h('span', { text: [w ? 'vague ' + w : 'inatteignable', (MP.STEP_TYPES[s.type] || {}).label, s.location, s.duration ? s.duration + ' min' : ''].filter(Boolean).join(' · ') }),
          ]),
          row('Réservée à', s.who),
          row('Prérequis', s.reqSteps.concat(s.reqItems, s.reqKnow)),
          row('Donne', s.giveItems.concat(s.giveKnow)),
          s.description ? h('div', { text: s.description }) : null,
          s.solution ? h('div', {}, [h('span', { class: 'lbl', text: 'Solution : ' }), s.solution]) : null,
          lines(s.hints).length ? h('ol', { class: 'hints' }, lines(s.hints).map((l) => h('li', { text: l }))) : null,
        ]));
      }
    }

    if (!root.children.length) root.appendChild(h('p', { class: 'muted', text: 'Cochez au moins une rubrique à imprimer.' }));
  };
})();
