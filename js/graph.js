/* Graphe des étapes : construction, mise en page par couches, rendu SVG, zoom et déplacement. */
(function () {
  const MP = (window.MP = window.MP || {});
  const NS = 'http://www.w3.org/2000/svg';

  const SIZE = {
    step: { w: 210, h: 58 },
    item: { w: 180, h: 30 },
    know: { w: 180, h: 30 },
    char: { w: 180, h: 32 },
  };
  const EDGE_COLORS = { step: 'var(--edge-step)', item: 'var(--item)', know: 'var(--know)', start: 'var(--edge-start)' };
  MP.RES_SYMBOL = { item: '◆', know: '●' };

  /* ---------- Construction du graphe selon le mode d'affichage ---------- */
  MP.buildGraph = function (sc, mode) {
    const nodes = [];
    const edges = [];
    const idx = MP.index(sc);
    const kindOfRes = (id) => (sc.items.some((i) => i.id === id) ? 'item' : 'know');

    for (const s of sc.steps) nodes.push({ id: s.id, kind: 'step', ref: s, ...SIZE.step });

    if (mode === 'compact') {
      for (const e of MP.dependencyEdges(sc)) {
        const kind = e.kinds.has('item') ? 'item' : e.kinds.has('know') ? 'know' : 'step';
        edges.push({
          from: e.from, to: e.to, kind,
          labels: e.res.map((r) => MP.RES_SYMBOL[kindOfRes(r)] + ' ' + MP.nameOf(sc, r)),
        });
      }
      // Ressources nécessaires détenues au départ par des personnages : pastilles sur l'étape.
      for (const n of nodes) {
        const s = n.ref;
        n.starts = [];
        for (const r of s.reqItems.concat(s.reqKnow)) {
          for (const c of idx.holders[r] || []) {
            n.starts.push({ char: sc.characters.find((x) => x.id === c), res: r });
          }
        }
      }
    } else {
      const used = new Set();
      for (const s of sc.steps) {
        s.reqItems.concat(s.reqKnow, s.giveItems, s.giveKnow).forEach((r) => used.add(r));
      }
      for (const c of sc.characters) c.startItems.concat(c.startKnow).forEach((r) => used.add(r));
      for (const i of sc.items) if (used.has(i.id)) nodes.push({ id: i.id, kind: 'item', ref: i, ...SIZE.item });
      for (const k of sc.knowledge) if (used.has(k.id)) nodes.push({ id: k.id, kind: 'know', ref: k, ...SIZE.know });
      for (const c of sc.characters) {
        if (!c.startItems.length && !c.startKnow.length) continue;
        nodes.push({ id: c.id, kind: 'char', ref: c, ...SIZE.char });
        for (const r of c.startItems.concat(c.startKnow)) edges.push({ from: c.id, to: r, kind: 'start', color: c.color });
      }
      for (const s of sc.steps) {
        for (const p of s.reqSteps) edges.push({ from: p, to: s.id, kind: 'step' });
        for (const r of s.reqItems) edges.push({ from: r, to: s.id, kind: 'item' });
        for (const r of s.reqKnow) edges.push({ from: r, to: s.id, kind: 'know' });
        for (const r of s.giveItems) edges.push({ from: s.id, to: r, kind: 'item' });
        for (const r of s.giveKnow) edges.push({ from: s.id, to: r, kind: 'know' });
      }
    }
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes, edges: edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
  };

  /* ---------- Mise en page en couches (de gauche à droite) ---------- */
  MP.layoutGraph = function (graph) {
    const { nodes, edges } = graph;
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const out = {}; const inn = {};
    nodes.forEach((n) => { out[n.id] = []; inn[n.id] = []; });

    // Casser les cycles : les arcs retour sont ignorés pour le calcul des rangs.
    const state = {};
    const back = new Set();
    const adj = {};
    nodes.forEach((n) => { adj[n.id] = []; });
    edges.forEach((e, i) => adj[e.from].push({ to: e.to, i }));
    const dfs = (v) => {
      state[v] = 1;
      for (const { to, i } of adj[v]) {
        if (state[to] === 1) back.add(i);
        else if (!state[to]) dfs(to);
      }
      state[v] = 2;
    };
    nodes.forEach((n) => { if (!state[n.id]) dfs(n.id); });
    edges.forEach((e, i) => {
      e.back = back.has(i);
      if (e.back || e.from === e.to) return;
      out[e.from].push(e.to); inn[e.to].push(e.from);
    });

    // Rang = plus long chemin depuis une source.
    const rank = {};
    const indeg = {};
    nodes.forEach((n) => { indeg[n.id] = inn[n.id].length; rank[n.id] = 0; });
    const queue = nodes.filter((n) => !indeg[n.id]).map((n) => n.id);
    const topo = [];
    while (queue.length) {
      const v = queue.shift();
      topo.push(v);
      for (const w of out[v]) {
        rank[w] = Math.max(rank[w], rank[v] + 1);
        if (--indeg[w] === 0) queue.push(w);
      }
    }
    // Les ressources et personnages sans prédécesseur se placent juste avant leur premier usage.
    for (let pass = 0; pass < 2; pass++) {
      for (const v of topo.slice().reverse()) {
        if (byId[v].kind === 'step' || inn[v].length || !out[v].length) continue;
        rank[v] = Math.max(0, Math.min(...out[v].map((w) => rank[w])) - 1);
      }
    }

    const layers = [];
    for (const n of nodes) (layers[rank[n.id]] = layers[rank[n.id]] || []).push(n.id);
    for (let i = 0; i < layers.length; i++) layers[i] = layers[i] || [];

    // Ordre dans chaque couche : méthode des barycentres.
    const pos = {};
    const renumber = () => layers.forEach((L) => L.forEach((v, i) => { pos[v] = i; }));
    renumber();
    const bary = (v, dir) => {
      const nb = dir === 'down' ? inn[v] : out[v];
      if (!nb.length) return pos[v];
      return nb.reduce((a, w) => a + pos[w], 0) / nb.length;
    };
    for (let it = 0; it < 6; it++) {
      const dir = it % 2 ? 'up' : 'down';
      const seq = dir === 'down' ? layers.slice(1) : layers.slice(0, -1).reverse();
      for (const L of seq) {
        const b = Object.fromEntries(L.map((v) => [v, bary(v, dir)]));
        L.sort((a, c) => b[a] - b[c]);
        L.forEach((v, i) => { pos[v] = i; });
      }
    }

    // Coordonnées.
    const GAP_X = 110; const GAP_Y = 22;
    let x = 0;
    const colX = [];
    layers.forEach((L, i) => {
      colX[i] = x;
      x += Math.max(0, ...L.map((v) => byId[v].w)) + GAP_X;
    });
    const y = {};
    layers.forEach((L) => {
      let cy = 0;
      L.forEach((v) => { y[v] = cy; cy += byId[v].h + GAP_Y; });
      const shift = cy / 2;
      L.forEach((v) => { y[v] -= shift; });
    });
    const center = (v) => y[v] + byId[v].h / 2;
    for (let it = 0; it < 8; it++) {
      const seq = it % 2 ? layers.slice().reverse() : layers;
      for (const L of seq) {
        const want = L.map((v) => {
          const nb = inn[v].concat(out[v]);
          return nb.length ? nb.reduce((a, w) => a + center(w), 0) / nb.length - byId[v].h / 2 : y[v];
        });
        // Placement qui respecte l'ordre et l'espacement minimal, centré sur les positions souhaitées.
        const placed = [];
        L.forEach((v, i) => {
          const min = i ? placed[i - 1] + byId[L[i - 1]].h + GAP_Y : -Infinity;
          placed.push(Math.max(want[i], min));
        });
        const drift = placed.reduce((a, p, i) => a + (p - want[i]), 0) / (L.length || 1);
        L.forEach((v, i) => { y[v] = placed[i] - drift; });
      }
    }
    nodes.forEach((n) => { n.x = colX[rank[n.id]]; n.y = y[n.id]; n.rank = rank[n.id]; });
    return graph;
  };

  /* ---------- Vue SVG interactive ---------- */
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  }

  function truncate(text, px, size) {
    const max = Math.floor(px / (size * 0.56));
    return text.length > max ? text.slice(0, Math.max(1, max - 1)) + '…' : text;
  }

  function initials(name) {
    return name.split(/\s+/).filter((w) => /^[A-ZÀ-Ý]/.test(w)).slice(-2).map((w) => w[0]).join('') || name[0];
  }

  MP.GraphView = class {
    constructor(svg, cb) {
      this.svg = svg;
      this.cb = cb;
      this.view = { x: 40, y: 300, k: 1 };
      this.graph = { nodes: [], edges: [] };
      this.drag = null;
      this.bind();
    }

    bind() {
      const svg = this.svg;
      svg.addEventListener('wheel', (ev) => {
        ev.preventDefault();
        const r = svg.getBoundingClientRect();
        const mx = ev.clientX - r.left; const my = ev.clientY - r.top;
        const f = Math.exp(-ev.deltaY * 0.0015);
        const k = Math.min(2.5, Math.max(0.15, this.view.k * f));
        this.view.x = mx - ((mx - this.view.x) * k) / this.view.k;
        this.view.y = my - ((my - this.view.y) * k) / this.view.k;
        this.view.k = k;
        this.applyView();
      }, { passive: false });

      svg.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        const g = ev.target.closest('.node');
        this.drag = {
          id: g ? g.dataset.id : null, sx: ev.clientX, sy: ev.clientY,
          vx: this.view.x, vy: this.view.y, moved: false,
        };
        if (g) {
          const n = this.graph.nodes.find((x) => x.id === g.dataset.id);
          this.drag.nx = n.x; this.drag.ny = n.y;
        }
        svg.setPointerCapture(ev.pointerId);
      });

      svg.addEventListener('pointermove', (ev) => {
        const d = this.drag;
        if (!d) return;
        const dx = ev.clientX - d.sx; const dy = ev.clientY - d.sy;
        if (!d.moved && Math.hypot(dx, dy) < 4) return;
        d.moved = true;
        if (d.id) {
          const n = this.graph.nodes.find((x) => x.id === d.id);
          n.x = d.nx + dx / this.view.k;
          n.y = d.ny + dy / this.view.k;
          this.draw();
        } else {
          this.view.x = d.vx + dx; this.view.y = d.vy + dy;
          this.applyView();
        }
      });

      svg.addEventListener('pointerup', () => {
        const d = this.drag;
        this.drag = null;
        if (!d) return;
        if (d.moved && d.id) {
          const n = this.graph.nodes.find((x) => x.id === d.id);
          this.cb.onMove(d.id, Math.round(n.x), Math.round(n.y));
        } else if (!d.moved) {
          this.cb.onSelect(d.id);
        }
      });

      svg.addEventListener('dblclick', (ev) => {
        const g = ev.target.closest('.node');
        if (g && this.cb.onActivate) this.cb.onActivate(g.dataset.id);
      });
    }

    applyView() {
      if (this.vp) this.vp.setAttribute('transform', `translate(${this.view.x},${this.view.y}) scale(${this.view.k})`);
    }

    /* opts : { mode, labels, selected, sim (id → statut), owned (Set), errors (Set) } */
    render(sc, opts) {
      this.sc = sc;
      this.opts = opts;
      const graph = MP.layoutGraph(MP.buildGraph(sc, opts.mode));
      const saved = (sc.positions && sc.positions[opts.mode]) || {};
      for (const n of graph.nodes) {
        if (saved[n.id]) { n.x = saved[n.id].x; n.y = saved[n.id].y; }
      }
      this.graph = graph;
      this.draw();
    }

    draw() {
      const { svg, graph, opts } = this;
      svg.textContent = '';
      const defs = el('defs', {}, svg);
      for (const [k, c] of Object.entries({ step: 'var(--edge-step)', item: 'var(--item)', know: 'var(--know)', start: 'var(--edge-start)', back: 'var(--danger)' })) {
        const m = el('marker', { id: 'arrow-' + k, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
        el('path', { d: 'M0,0 L10,5 L0,10 z', style: 'fill:' + c }, m);
      }
      this.vp = el('g', { class: 'viewport' }, svg);
      this.applyView();

      const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
      const focus = this.focusSet(opts.selected);

      const gEdges = el('g', { class: 'edges' }, this.vp);
      const gLabels = el('g', { class: 'edge-labels' }, this.vp);
      for (const e of graph.edges) {
        const a = byId[e.from]; const b = byId[e.to];
        const x1 = a.x + a.w; const y1 = a.y + a.h / 2;
        const x2 = b.x; const y2 = b.y + b.h / 2;
        const bend = x2 > x1 ? Math.max(40, (x2 - x1) / 2) : 90;
        const c1x = x1 + bend; const c2x = x2 - bend;
        const dim = focus && !(focus.has(e.from) && focus.has(e.to));
        const markerKind = e.back ? 'back' : e.kind;
        el('path', {
          d: `M${x1},${y1} C${c1x},${y1} ${c2x},${y2} ${x2},${y2}`,
          class: 'edge edge-' + e.kind + (e.back ? ' edge-back' : '') + (dim ? ' dim' : ''),
          style: 'stroke:' + (e.back ? 'var(--danger)' : e.color || EDGE_COLORS[e.kind]),
          'marker-end': `url(#arrow-${markerKind})`,
        }, gEdges);
        if (opts.labels && e.labels && e.labels.length) {
          const mx = (x1 + 3 * c1x + 3 * c2x + x2) / 8;
          const my = (y1 + 3 * y1 + 3 * y2 + y2) / 8;
          e.labels.forEach((lab, i) => {
            const t = el('text', {
              x: mx, y: my + (i - (e.labels.length - 1) / 2) * 13 + 4,
              class: 'edge-label label-' + e.kind + (dim ? ' dim' : ''), 'text-anchor': 'middle',
            }, gLabels);
            t.textContent = truncate(lab, 170, 11);
          });
        }
      }

      const gNodes = el('g', { class: 'nodes' }, this.vp);
      for (const n of graph.nodes) this.drawNode(gNodes, n, focus);
    }

    drawNode(parent, n, focus) {
      const { opts } = this;
      const classes = ['node', 'node-' + n.kind];
      if (opts.selected === n.id) classes.push('selected');
      if (focus && !focus.has(n.id)) classes.push('dim');
      if (opts.errors && opts.errors.has(n.id)) classes.push('has-error');
      if (opts.sim) {
        if (n.kind === 'step') classes.push('sim-' + (opts.sim[n.id] || 'locked'));
        else if (n.kind !== 'char') classes.push(opts.owned && opts.owned.has(n.id) ? 'sim-owned' : 'sim-missing');
      }
      const g = el('g', { class: classes.join(' '), transform: `translate(${n.x},${n.y})`, 'data-id': n.id }, parent);
      el('title', {}, g).textContent = MP.label(n.ref);

      if (n.kind === 'step') {
        const s = n.ref;
        const type = MP.STEP_TYPES[s.type] || MP.STEP_TYPES.action;
        el('rect', { class: 'box', width: n.w, height: n.h, rx: 9 }, g);
        el('rect', { class: 'bar', width: 7, height: n.h, rx: 3, style: 'fill:' + type.color }, g);
        const right = 14 + (s.who.length ? s.who.length * 17 : 0);
        el('text', { class: 'n-title', x: 16, y: 23 }, g).textContent = truncate(MP.label(s), n.w - 16 - right, 13);
        const sub = [type.label, s.location, s.act].filter(Boolean).join(' · ');
        el('text', { class: 'n-sub', x: 16, y: 43 }, g).textContent = truncate(sub, n.w - 30 - (s.public ? 48 : 0), 11);
        s.who.forEach((cid, i) => {
          const c = this.sc.characters.find((x) => x.id === cid);
          if (!c) return;
          const cx = n.w - 14 - i * 17;
          el('circle', { cx, cy: 15, r: 7.5, style: 'fill:' + c.color }, g);
          const t = el('text', { x: cx, y: 18.5, class: 'n-initials', 'text-anchor': 'middle' }, g);
          t.textContent = initials(c.name).slice(0, 2);
          el('title', {}, t).textContent = 'Réservée à ' + c.name;
        });
        if (s.public) {
          const t = el('text', { x: n.w - 10, y: n.h - 9, class: 'n-flag', 'text-anchor': 'end' }, g);
          t.textContent = 'publique';
        }
        (n.starts || []).forEach((st, i) => {
          if (!st.char) return;
          const cx = 20 + i * 12;
          const c = el('circle', { cx, cy: n.h, r: 5, class: 'start-dot', style: 'fill:' + st.char.color }, g);
          el('title', {}, c).textContent = `${MP.nameOf(this.sc, st.res)} : ${st.char.name} l'a au départ`;
        });
      } else if (n.kind === 'char') {
        el('rect', { class: 'box', width: n.w, height: n.h, rx: n.h / 2, style: 'stroke:' + n.ref.color }, g);
        el('circle', { cx: 16, cy: n.h / 2, r: 7, style: 'fill:' + n.ref.color }, g);
        el('text', { class: 'n-res', x: 30, y: n.h / 2 + 4.5 }, g).textContent = truncate(n.ref.name, n.w - 40, 12);
      } else {
        el('rect', { class: 'box', width: n.w, height: n.h, rx: n.kind === 'item' ? 5 : n.h / 2 }, g);
        const t = el('text', { class: 'n-res', x: 12, y: n.h / 2 + 4.5 }, g);
        t.textContent = MP.RES_SYMBOL[n.kind] + ' ' + truncate(n.ref.name, n.w - 34, 12);
        if (n.ref.redHerring) {
          el('text', { class: 'n-flag', x: n.w - 8, y: 10, 'text-anchor': 'end' }, g).textContent = 'fausse piste';
        }
      }
    }

    /* Ascendants et descendants du nœud sélectionné, pour atténuer le reste. */
    focusSet(id) {
      if (!id || !this.graph.nodes.some((n) => n.id === id)) return null;
      const set = new Set([id]);
      const walk = (dir) => {
        const stack = [id];
        const seen = new Set([id]);
        while (stack.length) {
          const v = stack.pop();
          for (const e of this.graph.edges) {
            const [a, b] = dir === 'down' ? [e.from, e.to] : [e.to, e.from];
            if (a === v && !seen.has(b)) { seen.add(b); set.add(b); stack.push(b); }
          }
        }
      };
      walk('down'); walk('up');
      return set;
    }

    fit() {
      const { nodes } = this.graph;
      const r = this.svg.getBoundingClientRect();
      if (!nodes.length || !r.width) { this.view = { x: 40, y: r.height / 2 || 300, k: 1 }; this.applyView(); return; }
      const minX = Math.min(...nodes.map((n) => n.x)); const maxX = Math.max(...nodes.map((n) => n.x + n.w));
      const minY = Math.min(...nodes.map((n) => n.y)); const maxY = Math.max(...nodes.map((n) => n.y + n.h));
      const pad = 40;
      const fitK = Math.min((r.width - 2 * pad) / (maxX - minX), (r.height - 2 * pad) / (maxY - minY));
      // En dessous de 0,6 le texte devient illisible : on cadre alors sur le début du scénario.
      const k = Math.min(1.1, Math.max(0.6, fitK));
      const tooWide = (maxX - minX) * k > r.width - 2 * pad;
      const tooTall = (maxY - minY) * k > r.height - 2 * pad;
      this.view = {
        k,
        x: tooWide ? pad - minX * k : (r.width - (maxX - minX) * k) / 2 - minX * k,
        y: tooTall ? pad - minY * k : (r.height - (maxY - minY) * k) / 2 - minY * k,
      };
      this.applyView();
    }

    centerOn(id) {
      const n = this.graph.nodes.find((x) => x.id === id);
      if (!n) return;
      const r = this.svg.getBoundingClientRect();
      const p = { x: n.x + n.w / 2, y: n.y + n.h / 2 };
      const sx = p.x * this.view.k + this.view.x; const sy = p.y * this.view.k + this.view.y;
      if (sx > 60 && sx < r.width - 60 && sy > 60 && sy < r.height - 60) return;
      this.view.x = r.width / 2 - p.x * this.view.k;
      this.view.y = r.height / 2 - p.y * this.view.k;
      this.applyView();
    }
  };
})();
