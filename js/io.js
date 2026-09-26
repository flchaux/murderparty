/* Import et export des scénarios au format JSON, avec validation et messages lisibles. */
(function () {
  const MP = (window.MP = window.MP || {});

  MP.FORMAT = 'intrigue-scenario';
  MP.FORMAT_VERSION = 1;

  const SCENARIO_FIELDS = ['id', 'title', 'type', 'players', 'duration', 'synopsis', 'truth', 'positions', 'updatedAt'];
  const LISTS = ['characters', 'items', 'knowledge', 'steps'];

  /* Champs de chaque entité : texte, booléen, liste de références (avec le type visé). */
  const SCHEMA = {
    steps: {
      text: ['title', 'type', 'act', 'location', 'description', 'playerText', 'solution', 'hints', 'duration'],
      bool: ['public'],
      refs: { who: 'characters', reqSteps: 'steps', reqItems: 'items', reqKnow: 'knowledge', giveItems: 'items', giveKnow: 'knowledge' },
    },
    items: { text: ['name', 'description', 'location', 'notes'], bool: ['redHerring'], refs: {} },
    knowledge: { text: ['name', 'description', 'notes'], bool: ['redHerring'], refs: {} },
    characters: {
      text: ['name', 'role', 'color', 'description', 'secret', 'objectives'],
      bool: ['player'],
      refs: { startItems: 'items', startKnow: 'knowledge' },
      other: ['relations'],
    },
  };

  const LIST_LABEL = { steps: 'Étape', items: 'Objet', knowledge: 'Connaissance', characters: 'Personnage' };

  /* ---------- Export ---------- */
  MP.exportData = function (sc) {
    const out = { format: MP.FORMAT, version: MP.FORMAT_VERSION, exportedAt: new Date().toISOString() };
    for (const f of SCENARIO_FIELDS) if (sc[f] !== undefined) out[f] = sc[f];
    for (const l of LISTS) out[l] = sc[l];
    return out;
  };

  MP.exportFileName = function (sc) {
    return (sc.title || 'scenario').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.json';
  };

  /* ---------- Import ---------- */
  function ImportError(msg) { const e = new Error(msg); e.isImportError = true; return e; }

  const toText = (v) => {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map(toText).join('\n');
    if (typeof v === 'object') return '';
    return String(v);
  };

  /*
   * Lit un texte JSON et renvoie { scenario, warnings }.
   * Tolérant : identifiants absents générés, références acceptées par identifiant ou par nom exact,
   * listes écrites comme simple texte, champs inconnus ignorés (les champs commençant par « _ » servent de commentaires).
   * Lève une erreur au message lisible si le fichier est inexploitable.
   */
  MP.importData = function (text) {
    let data;
    try {
      data = typeof text === 'string' ? JSON.parse(text) : text;
    } catch (e) {
      const m = /position (\d+)/.exec(e.message);
      let where = '';
      if (m) {
        const before = text.slice(0, Number(m[1]));
        where = ` (ligne ${before.split('\n').length})`;
      }
      throw ImportError('Le fichier n\'est pas du JSON valide' + where + '. Vérifiez les virgules, guillemets et accolades.');
    }
    if (data && typeof data === 'object' && !Array.isArray(data) && data.scenario && typeof data.scenario === 'object') data = data.scenario;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw ImportError('Le fichier doit contenir un objet JSON { … } décrivant un scénario.');
    if (data.format && data.format !== MP.FORMAT) throw ImportError(`Format « ${data.format} » inconnu : ce fichier ne vient pas d'Intrigue.`);
    if (data.version && Number(data.version) > MP.FORMAT_VERSION) {
      throw ImportError(`Ce fichier utilise la version ${data.version} du format, plus récente que cet outil (version ${MP.FORMAT_VERSION}).`);
    }
    for (const l of LISTS) if (data[l] != null && !Array.isArray(data[l])) throw ImportError(`« ${l} » doit être une liste [ … ].`);
    if (!LISTS.some((l) => Array.isArray(data[l]))) {
      throw ImportError('Aucune liste « steps », « items », « knowledge » ou « characters » trouvée : ce n\'est pas un scénario.');
    }

    const warnings = [];
    const warn = (msg) => warnings.push(msg);
    const sc = {};
    for (const f of SCENARIO_FIELDS) if (data[f] !== undefined) sc[f] = data[f];
    for (const f of ['title', 'players', 'duration', 'synopsis', 'truth']) sc[f] = toText(sc[f]);
    if (sc.type && !MP.SCENARIO_TYPES[sc.type]) { warn(`Type de scénario « ${sc.type} » inconnu, remplacé par « murder ».`); sc.type = 'murder'; }
    if (sc.positions && (typeof sc.positions !== 'object' || Array.isArray(sc.positions))) sc.positions = {};
    for (const k of Object.keys(data)) {
      if (!k.startsWith('_') && !SCENARIO_FIELDS.includes(k) && !LISTS.includes(k) && !['format', 'version', 'exportedAt'].includes(k)) {
        warn(`Champ « ${k} » inconnu au niveau du scénario, ignoré.`);
      }
    }

    // 1. Entités : identifiants et champs simples.
    const seen = new Set();
    for (const list of LISTS) {
      const raw = data[list];
      if (raw == null) { sc[list] = []; continue; }
      if (!Array.isArray(raw)) throw ImportError(`« ${list} » doit être une liste [ … ].`);
      const schema = SCHEMA[list];
      sc[list] = [];
      raw.forEach((e, i) => {
        const where = `${LIST_LABEL[list]} n°${i + 1}`;
        if (!e || typeof e !== 'object' || Array.isArray(e)) { warn(`${where} n'est pas un objet { … }, ignoré${list === 'knowledge' || list === 'steps' ? 'e' : ''}.`); return; }
        const out = {};
        let id = e.id == null ? '' : String(e.id).trim();
        if (!id) id = MP.uid(MP.KINDS[list].prefix);
        else if (seen.has(id)) {
          const fresh = MP.uid(MP.KINDS[list].prefix);
          warn(`${where} : identifiant « ${id} » déjà utilisé, remplacé par « ${fresh} ». Les références à « ${id} » visent le premier élément.`);
          id = fresh;
        }
        seen.add(id);
        out.id = id;
        for (const f of schema.text) if (e[f] !== undefined) out[f] = toText(e[f]);
        for (const f of schema.bool) if (e[f] !== undefined) out[f] = e[f] === true || e[f] === 'true' || e[f] === 1 || e[f] === 'oui';
        for (const f of Object.keys(schema.refs)) out[f] = e[f];
        if (list === 'characters') out.relations = e.relations;
        const known = ['id'].concat(schema.text, schema.bool, Object.keys(schema.refs), schema.other || []);
        for (const k of Object.keys(e)) if (!k.startsWith('_') && !known.includes(k)) warn(`${where} (${out.title || out.name || id}) : champ « ${k} » inconnu, ignoré.`);
        if (list === 'steps' && out.type && !MP.STEP_TYPES[out.type]) {
          warn(`Étape « ${out.title || id} » : type « ${out.type} » inconnu, remplacé par « action ».`);
          out.type = 'action';
        }
        sc[list].push(out);
      });
    }

    // 2. Résolution des références : par identifiant, sinon par nom ou titre exact.
    const resolver = {};
    for (const list of LISTS) {
      const byId = new Map(); const byName = new Map();
      for (const e of sc[list]) {
        byId.set(e.id, e.id);
        const n = (e.title || e.name || '').trim().toLowerCase();
        if (n && !byName.has(n)) byName.set(n, e.id);
      }
      resolver[list] = (ref) => {
        const key = String(ref).trim();
        return byId.get(key) || byName.get(key.toLowerCase()) || null;
      };
    }
    const resolveList = (value, target, where, field) => {
      if (value == null || value === '') return [];
      const arr = Array.isArray(value) ? value : [value];
      const out = [];
      for (const ref of arr) {
        if (typeof ref !== 'string' && typeof ref !== 'number') { warn(`${where} : valeur invalide dans « ${field} », ignorée.`); continue; }
        const id = resolver[target](ref);
        if (!id) warn(`${where} : « ${ref} » introuvable parmi les ${MP.KINDS[target].plural.toLowerCase()} (champ « ${field} »), référence retirée.`);
        else if (!out.includes(id)) out.push(id);
      }
      return out;
    };
    for (const list of LISTS) {
      for (const e of sc[list]) {
        const where = `${LIST_LABEL[list]} « ${e.title || e.name || e.id} »`;
        for (const [field, target] of Object.entries(SCHEMA[list].refs)) e[field] = resolveList(e[field], target, where, field);
        if (list === 'characters') {
          const rels = e.relations == null ? [] : Array.isArray(e.relations) ? e.relations : [];
          if (e.relations != null && !Array.isArray(e.relations)) warn(`${where} : « relations » doit être une liste, ignorée.`);
          e.relations = [];
          for (const r of rels) {
            if (!r || typeof r !== 'object' || r.to == null) { warn(`${where} : relation sans champ « to », ignorée.`); continue; }
            const to = resolver.characters(r.to);
            if (!to) { warn(`${where} : relation vers « ${r.to} » introuvable, ignorée.`); continue; }
            if (to === e.id) { warn(`${where} : relation vers soi-même, ignorée.`); continue; }
            e.relations.push({ to, label: toText(r.label) });
          }
        }
        if (list === 'steps' && e.reqSteps.includes(e.id)) {
          e.reqSteps = e.reqSteps.filter((x) => x !== e.id);
          warn(`${where} : une étape ne peut pas dépendre d'elle-même, prérequis retiré.`);
        }
      }
    }

    return { scenario: MP.normalize(sc), warnings };
  };
})();
