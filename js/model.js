/* Modèle de données : scénario, étapes, objets, connaissances, personnages. */
(function () {
  const MP = (window.MP = window.MP || {});

  MP.SCENARIO_TYPES = {
    murder: 'Murder party',
    escape: 'Escape game',
    chasse: 'Chasse au trésor',
  };

  MP.STEP_TYPES = {
    enigme: { label: 'Énigme', color: '#7c3aed' },
    fouille: { label: 'Fouille', color: '#d97706' },
    dialogue: { label: 'Interrogatoire', color: '#2563eb' },
    revelation: { label: 'Révélation', color: '#0d9488' },
    action: { label: 'Action', color: '#64748b' },
    fin: { label: 'Fin', color: '#dc2626' },
  };

  MP.CHARACTER_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777', '#4f46e5', '#65a30d'];

  MP.KINDS = {
    steps: { label: 'Étape', plural: 'Étapes', prefix: 's' },
    items: { label: 'Objet', plural: 'Objets', prefix: 'i' },
    knowledge: { label: 'Connaissance', plural: 'Connaissances', prefix: 'k' },
    characters: { label: 'Personnage', plural: 'Personnages', prefix: 'c' },
  };

  MP.uid = function (prefix) {
    return prefix + '_' + Math.random().toString(36).slice(2, 8);
  };

  MP.newScenario = function (type) {
    return MP.normalize({ title: 'Nouveau scénario', type: type || 'murder' });
  };

  MP.defaults = {
    steps: () => ({
      title: 'Nouvelle étape', type: 'enigme', act: '', location: '', public: false,
      who: [], reqSteps: [], reqItems: [], reqKnow: [], giveItems: [], giveKnow: [],
      description: '', playerText: '', solution: '', hints: '', duration: '',
    }),
    items: () => ({ name: 'Nouvel objet', description: '', location: '', redHerring: false, notes: '' }),
    knowledge: () => ({ name: 'Nouvelle connaissance', description: '', redHerring: false, notes: '' }),
    characters: () => ({
      name: 'Nouveau personnage', role: '', player: true, color: '', description: '',
      secret: '', objectives: '', startItems: [], startKnow: [], relations: [],
    }),
  };

  MP.normalize = function (sc) {
    const out = Object.assign({
      id: MP.uid('sc'), title: 'Sans titre', type: 'murder', synopsis: '', truth: '',
      players: '', duration: '', positions: {}, updatedAt: Date.now(),
    }, sc);
    for (const kind of Object.keys(MP.KINDS)) {
      out[kind] = (out[kind] || []).map((e) => Object.assign(MP.defaults[kind](), e, { id: e.id || MP.uid(MP.KINDS[kind].prefix) }));
    }
    out.characters.forEach((c, i) => { if (!c.color) c.color = MP.CHARACTER_COLORS[i % MP.CHARACTER_COLORS.length]; });
    out.positions = out.positions || {};
    return out;
  };

  MP.create = function (sc, kind, fields) {
    const e = Object.assign(MP.defaults[kind](), fields || {}, { id: MP.uid(MP.KINDS[kind].prefix) });
    if (kind === 'characters' && !e.color) e.color = MP.CHARACTER_COLORS[sc.characters.length % MP.CHARACTER_COLORS.length];
    sc[kind].push(e);
    return e;
  };

  MP.find = function (sc, id) {
    for (const kind of Object.keys(MP.KINDS)) {
      const obj = sc[kind].find((e) => e.id === id);
      if (obj) return { kind, obj };
    }
    return null;
  };

  MP.label = function (e) {
    return e ? e.title || e.name || '(sans nom)' : '(supprimé)';
  };

  MP.nameOf = function (sc, id) {
    const f = MP.find(sc, id);
    return f ? MP.label(f.obj) : '(supprimé)';
  };

  /* Champs de référence : quelle liste de quel type d'entité pointe vers quoi. */
  const REF_FIELDS = {
    steps: { who: 'characters', reqSteps: 'steps', reqItems: 'items', reqKnow: 'knowledge', giveItems: 'items', giveKnow: 'knowledge' },
    characters: { startItems: 'items', startKnow: 'knowledge' },
  };

  MP.remove = function (sc, id) {
    const f = MP.find(sc, id);
    if (!f) return;
    sc[f.kind] = sc[f.kind].filter((e) => e.id !== id);
    for (const [kind, fields] of Object.entries(REF_FIELDS)) {
      for (const e of sc[kind]) {
        for (const field of Object.keys(fields)) e[field] = e[field].filter((x) => x !== id);
      }
    }
    for (const c of sc.characters) c.relations = c.relations.filter((r) => r.to !== id);
    for (const mode of Object.keys(sc.positions)) delete sc.positions[mode][id];
  };

  MP.duplicate = function (sc, id) {
    const f = MP.find(sc, id);
    if (!f) return null;
    const copy = JSON.parse(JSON.stringify(f.obj));
    copy.id = MP.uid(MP.KINDS[f.kind].prefix);
    if (copy.title) copy.title += ' (copie)';
    if (copy.name) copy.name += ' (copie)';
    sc[f.kind].push(copy);
    return copy;
  };

  /* ---------- Bibliothèque locale (navigateur) ---------- */
  const KEY = 'intrigue.library.v1';

  MP.storage = {
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const lib = JSON.parse(raw);
          if (lib && lib.scenarios) return lib;
        }
      } catch (e) { /* stockage indisponible : on repart d'une bibliothèque vide */ }
      return { current: null, scenarios: {} };
    },
    save(lib) {
      try {
        localStorage.setItem(KEY, JSON.stringify(lib));
        return true;
      } catch (e) {
        return false;
      }
    },
  };

  MP.escape = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };
})();
