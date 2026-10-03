/*
 * Outils du serveur MCP : lire, créer, modifier et analyser des scénarios Intrigue.
 * Chaque scénario est un fichier .json au format d'export de l'outil web, directement importable.
 * Les modules du navigateur (js/model.js, js/engine.js, js/io.js) sont réutilisés tels quels.
 */
const fs = require('fs');
const path = require('path');

global.window = global;
for (const f of ['model', 'engine', 'io']) require(path.join(__dirname, '..', 'js', f + '.js'));
const MP = global.MP;

const ROOT = path.join(__dirname, '..');

class ToolError extends Error {}

/* ---------- Stockage sur disque ---------- */

function dir() {
  const d = process.env.INTRIGUE_DIR ? path.resolve(process.env.INTRIGUE_DIR) : path.join(ROOT, 'scenarios');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function readAll() {
  const d = dir();
  return fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort().map((file) => {
    try {
      const { scenario, warnings } = MP.importData(fs.readFileSync(path.join(d, file), 'utf8'));
      return { file, scenario, warnings };
    } catch (e) {
      return { file, error: e.message };
    }
  });
}

/* Retrouve un scénario par identifiant, nom de fichier ou titre exact. */
function load(ref) {
  if (!ref) throw new ToolError('Paramètre « scenario » manquant : identifiant, nom de fichier ou titre.');
  const key = String(ref).trim().toLowerCase();
  const all = readAll().filter((x) => x.scenario);
  const hit = all.find((x) => x.scenario.id.toLowerCase() === key)
    || all.find((x) => x.file.toLowerCase() === key || x.file.toLowerCase() === key + '.json')
    || all.find((x) => x.scenario.title.trim().toLowerCase() === key);
  if (!hit) {
    const known = all.map((x) => `${x.scenario.id} (« ${x.scenario.title} »)`).join(', ') || 'aucun';
    throw new ToolError(`Scénario « ${ref} » introuvable. Scénarios disponibles : ${known}.`);
  }
  return hit;
}

function save(sc, file) {
  sc.updatedAt = Date.now();
  const target = path.join(dir(), file);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(MP.exportData(sc), null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, target);
  return target;
}

function freeFileFor(id) {
  const used = new Set(readAll().map((x) => x.file));
  let file = id + '.json';
  for (let i = 2; used.has(file); i++) file = `${id}_${i}.json`;
  return file;
}

/* ---------- Éléments ---------- */

const GENRES = {
  personnage: 'characters', personnages: 'characters', character: 'characters', characters: 'characters',
  objet: 'items', objets: 'items', item: 'items', items: 'items',
  connaissance: 'knowledge', connaissances: 'knowledge', knowledge: 'knowledge', indice: 'knowledge',
  etape: 'steps', 'étape': 'steps', etapes: 'steps', 'étapes': 'steps', step: 'steps', steps: 'steps',
};

const FIELDS = {
  steps: Object.keys(MP.defaults.steps()),
  items: Object.keys(MP.defaults.items()),
  knowledge: Object.keys(MP.defaults.knowledge()),
  characters: Object.keys(MP.defaults.characters()),
};

function kindOf(genre) {
  const k = GENRES[String(genre || '').trim().toLowerCase()];
  if (!k) throw new ToolError(`Genre « ${genre} » inconnu : utilisez personnage, objet, connaissance ou etape.`);
  return k;
}

function checkFields(kind, fields, where) {
  const bad = Object.keys(fields).filter((f) => !FIELDS[kind].includes(f) && !f.startsWith('_'));
  if (bad.length) {
    throw new ToolError(`${where} : champ(s) ${bad.map((f) => `« ${f} »`).join(', ')} inconnu(s) pour ${MP.KINDS[kind].label.toLowerCase()}. Champs possibles : ${FIELDS[kind].join(', ')}.`);
  }
}

/* Retrouve un élément par identifiant ou par nom exact, dans toutes les listes. */
function findElement(sc, ref) {
  const key = String(ref || '').trim();
  const byId = MP.find(sc, key);
  if (byId) return byId;
  const low = key.toLowerCase();
  for (const kind of Object.keys(MP.KINDS)) {
    const obj = sc[kind].find((e) => MP.label(e).trim().toLowerCase() === low);
    if (obj) return { kind, obj };
  }
  throw new ToolError(`Élément « ${ref} » introuvable dans « ${sc.title} ». Donnez son identifiant ou son nom exact.`);
}

function allIds(sc) {
  const ids = new Set();
  for (const kind of Object.keys(MP.KINDS)) sc[kind].forEach((e) => ids.add(e.id));
  return ids;
}

function readableId(kind, name, used) {
  const base = MP.KINDS[kind].prefix + '_' + (slug(name).slice(0, 30).replace(/_$/, '') || 'element');
  let id = base;
  for (let i = 2; used.has(id); i++) id = `${base}_${i}`;
  used.add(id);
  return id;
}

/*
 * Applique une modification aux données brutes (références par nom permises), puis repasse
 * par l'import tolérant pour résoudre les références et normaliser. Renvoie les avertissements.
 */
function commit(hit, mutate) {
  const raw = JSON.parse(JSON.stringify(MP.exportData(hit.scenario)));
  mutate(raw);
  const { scenario, warnings } = MP.importData(raw);
  save(scenario, hit.file);
  return { scenario, warnings };
}

/* ---------- Mise en forme ---------- */

const yes = (b) => (b ? 'oui' : 'non');

function names(sc, ids) {
  return ids.length ? ids.map((id) => `${MP.nameOf(sc, id)} [${id}]`).join(', ') : '';
}

function summary(sc) {
  const L = [];
  L.push(`# ${sc.title} [${sc.id}]`);
  L.push(`Type : ${MP.SCENARIO_TYPES[sc.type] || sc.type}${sc.players ? ' | Joueurs : ' + sc.players : ''}${sc.duration ? ' | Durée : ' + sc.duration : ''}`);
  if (sc.synopsis) L.push(`Synopsis : ${sc.synopsis}`);
  if (sc.truth) L.push(`Vérité (MJ) : ${sc.truth}`);

  L.push('', `## Personnages (${sc.characters.length})`);
  for (const c of sc.characters) {
    L.push(`- ${c.name} [${c.id}]${c.role ? ', ' + c.role : ''}${c.player ? '' : ' (non joueur)'}`);
    if (c.description) L.push(`  Présentation : ${c.description}`);
    if (c.secret) L.push(`  Secret : ${c.secret}`);
    if (c.objectives) L.push(`  Objectifs : ${c.objectives.replace(/\n/g, ' / ')}`);
    if (c.startItems.length) L.push(`  Objets au départ : ${names(sc, c.startItems)}`);
    if (c.startKnow.length) L.push(`  Sait au départ : ${names(sc, c.startKnow)}`);
    for (const r of c.relations) L.push(`  Relation avec ${MP.nameOf(sc, r.to)} : ${r.label}`);
  }

  for (const [kind, title] of [['items', 'Objets'], ['knowledge', 'Connaissances']]) {
    L.push('', `## ${title} (${sc[kind].length})`);
    for (const e of sc[kind]) {
      L.push(`- ${e.name} [${e.id}]${e.redHerring ? ' (fausse piste)' : ''}${e.location ? ', lieu : ' + e.location : ''}`);
      if (e.description) L.push(`  ${e.description}`);
      if (e.notes) L.push(`  Notes MJ : ${e.notes}`);
    }
  }

  L.push('', `## Étapes (${sc.steps.length})`);
  for (const s of sc.steps) {
    const meta = [MP.STEP_TYPES[s.type] ? MP.STEP_TYPES[s.type].label : s.type, s.act, s.location, s.duration && s.duration + ' min', s.public && 'publique']
      .filter(Boolean).join(', ');
    L.push(`- ${s.title} [${s.id}] (${meta})`);
    if (s.who.length) L.push(`  Réservée à : ${names(sc, s.who)}`);
    const req = [names(sc, s.reqSteps), names(sc, s.reqItems), names(sc, s.reqKnow)].filter(Boolean).join(', ');
    if (req) L.push(`  Exige : ${req}`);
    const give = [names(sc, s.giveItems), names(sc, s.giveKnow)].filter(Boolean).join(', ');
    if (give) L.push(`  Donne : ${give}`);
    if (s.description) L.push(`  Déroulé MJ : ${s.description}`);
    if (s.playerText) L.push(`  Énoncé joueurs : ${s.playerText}`);
    if (s.solution) L.push(`  Solution : ${s.solution}`);
    if (s.hints) L.push(`  Indices : ${s.hints.replace(/\n/g, ' / ')}`);
  }
  return L.join('\n');
}

function analysis(sc) {
  const a = MP.analyze(sc);
  const L = [];
  L.push(`Analyse de « ${sc.title} » : ${a.counts.error} erreur(s), ${a.counts.warning} avertissement(s), ${a.counts.info} remarque(s).`);
  const tag = { error: 'ERREUR', warning: 'ATTENTION', info: 'info' };
  for (const i of a.issues) L.push(`- ${tag[i.level]} : ${i.ref ? MP.nameOf(sc, i.ref) + ` [${i.ref}] : ` : ''}${i.msg}`);

  const waves = {};
  for (const [id, w] of Object.entries(a.pooled.wave)) (waves[w] = waves[w] || []).push(MP.nameOf(sc, id));
  if (a.pooled.rounds) {
    L.push('', 'Déroulé au plus court (toutes les possessions réunies), par vagues d\'étapes faisables en parallèle :');
    for (let w = 1; w <= a.pooled.rounds; w++) L.push(`  ${w}. ${waves[w].join(' ; ')}`);
  }
  L.push(a.minWaves ? `Première fin atteignable à la vague ${a.minWaves}.` : 'Aucune fin atteignable.');
  if (a.coop.length) L.push(`Étapes qui exigent une coopération entre joueurs : ${a.coop.map((id) => MP.nameOf(sc, id)).join(' ; ')}.`);

  const players = sc.characters.filter((c) => c.player);
  if (players.length && sc.steps.length) {
    L.push('Autonomie (étapes faisables seul, avec ses seules possessions de départ) :');
    for (const c of players) L.push(`  - ${c.name} : ${a.alone[c.id].size} / ${sc.steps.length}`);
  }
  return L.join('\n');
}

function withWarnings(text, warnings) {
  if (!warnings || !warnings.length) return text;
  return text + '\n\nCorrections appliquées :\n' + warnings.map((w) => '- ' + w).join('\n');
}

function fileNote(file) {
  return `Fichier : ${path.join(dir(), file)} (à importer dans Intrigue avec le bouton « Importer »).`;
}

/* ---------- Outils ---------- */

const REF_HELP = 'Les références (who, reqSteps, reqItems, reqKnow, giveItems, giveKnow, startItems, startKnow, relations[].to) acceptent un identifiant ou le nom exact de l\'élément.';

const ELEMENT_HELP = [
  'Champs par genre :',
  `- personnage : ${FIELDS.characters.join(', ')}. relations = [{ "to": personnage, "label": texte }].`,
  `- objet : ${FIELDS.items.join(', ')}.`,
  `- connaissance : ${FIELDS.knowledge.join(', ')}.`,
  `- etape : ${FIELDS.steps.join(', ')}. type = ${Object.keys(MP.STEP_TYPES).join(', ')}.`,
  'Facultatif : "id" lisible (préfixes c_, i_, k_, s_), généré à partir du nom sinon.',
  REF_HELP,
].join('\n');

const scenarioParam = { type: 'string', description: 'Identifiant, nom de fichier ou titre exact du scénario.' };
const scenarioFields = {
  title: { type: 'string', description: 'Titre.' },
  type: { type: 'string', enum: Object.keys(MP.SCENARIO_TYPES), description: 'murder (murder party), escape (escape game) ou chasse (chasse au trésor).' },
  players: { type: 'string', description: 'Nombre de joueurs, texte libre.' },
  duration: { type: 'string', description: 'Durée de la partie, texte libre.' },
  synopsis: { type: 'string', description: 'Histoire racontée aux joueurs.' },
  truth: { type: 'string', description: 'Solution complète, pour le maître du jeu.' },
};

const definitions = [
  {
    name: 'lister_scenarios',
    title: 'Lister les scénarios',
    description: 'Liste les scénarios enregistrés, avec leur identifiant, leur type et leur taille.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'lire_scenario',
    title: 'Lire un scénario',
    description: 'Renvoie un scénario complet : résumé lisible avec tous les identifiants (par défaut), ou JSON au format d\'import Intrigue.',
    inputSchema: {
      type: 'object',
      properties: { scenario: scenarioParam, format: { type: 'string', enum: ['resume', 'json'], description: 'resume (par défaut) ou json.' } },
      required: ['scenario'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'creer_scenario',
    title: 'Créer un scénario vide',
    description: 'Crée un nouveau scénario vide, à remplir ensuite avec ajouter_elements. Pour écrire un scénario complet d\'un coup, préférer ecrire_scenario.',
    inputSchema: {
      type: 'object',
      properties: Object.assign({ id: { type: 'string', description: 'Identifiant lisible facultatif (ex. sc_manoir). Généré depuis le titre sinon.' } }, scenarioFields),
      required: ['title'],
    },
  },
  {
    name: 'ecrire_scenario',
    title: 'Écrire un scénario complet',
    description: 'Enregistre un scénario entier au format JSON Intrigue (voir aide_format), puis l\'analyse. L\'import est tolérant : identifiants facultatifs, références par nom, corrections signalées. ' + REF_HELP,
    inputSchema: {
      type: 'object',
      properties: {
        contenu: { type: ['object', 'string'], description: 'Le scénario : objet JSON ou texte JSON, avec title, type, synopsis, truth, characters, items, knowledge, steps.' },
        remplacer: { type: 'boolean', description: 'true pour écraser un scénario existant de même identifiant. Sinon une erreur est renvoyée.' },
      },
      required: ['contenu'],
    },
  },
  {
    name: 'modifier_scenario',
    title: 'Modifier les informations générales',
    description: 'Modifie le titre, le type, le nombre de joueurs, la durée, le synopsis ou la vérité d\'un scénario.',
    inputSchema: {
      type: 'object',
      properties: { scenario: scenarioParam, champs: { type: 'object', properties: scenarioFields, additionalProperties: false } },
      required: ['scenario', 'champs'],
    },
  },
  {
    name: 'ajouter_elements',
    title: 'Ajouter des éléments',
    description: 'Ajoute en une fois des personnages, objets, connaissances et étapes. Les éléments d\'un même appel peuvent se référencer entre eux par leur nom.\n' + ELEMENT_HELP,
    inputSchema: {
      type: 'object',
      properties: {
        scenario: scenarioParam,
        elements: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: { genre: { type: 'string', enum: ['personnage', 'objet', 'connaissance', 'etape'] } },
            required: ['genre'],
            additionalProperties: true,
          },
          description: 'Liste d\'éléments, chacun avec "genre" et ses champs.',
        },
      },
      required: ['scenario', 'elements'],
    },
  },
  {
    name: 'modifier_element',
    title: 'Modifier un élément',
    description: 'Modifie les champs d\'un personnage, objet, connaissance ou étape. Les listes fournies remplacent les anciennes : relire l\'élément avant pour les compléter.\n' + ELEMENT_HELP,
    inputSchema: {
      type: 'object',
      properties: {
        scenario: scenarioParam,
        element: { type: 'string', description: 'Identifiant ou nom exact de l\'élément.' },
        champs: { type: 'object', description: 'Champs à modifier.' },
      },
      required: ['scenario', 'element', 'champs'],
    },
  },
  {
    name: 'supprimer_element',
    title: 'Supprimer un élément',
    description: 'Supprime un élément et retire toutes les références vers lui (prérequis, possessions, relations).',
    inputSchema: {
      type: 'object',
      properties: { scenario: scenarioParam, element: { type: 'string', description: 'Identifiant ou nom exact de l\'élément.' } },
      required: ['scenario', 'element'],
    },
    annotations: { destructiveHint: true },
  },
  {
    name: 'analyser_scenario',
    title: 'Analyser un scénario',
    description: 'Vérifie la logique : étapes inatteignables, objets sans source ou inutilisés, déroulé au plus court par vagues, étapes qui exigent une coopération, autonomie de chaque personnage.',
    inputSchema: { type: 'object', properties: { scenario: scenarioParam }, required: ['scenario'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'supprimer_scenario',
    title: 'Supprimer un scénario',
    description: 'Supprime définitivement le fichier d\'un scénario.',
    inputSchema: { type: 'object', properties: { scenario: scenarioParam }, required: ['scenario'] },
    annotations: { destructiveHint: true },
  },
  {
    name: 'aide_format',
    title: 'Documentation du format',
    description: 'Renvoie la documentation complète du format JSON Intrigue (champs, règles de logique, exemple). Avec modele=true, renvoie aussi le modèle complet.',
    inputSchema: { type: 'object', properties: { modele: { type: 'boolean' } } },
    annotations: { readOnlyHint: true },
  },
];

const handlers = {
  lister_scenarios() {
    const all = readAll();
    if (!all.length) return `Aucun scénario dans ${dir()}. Créez-en un avec creer_scenario ou ecrire_scenario.`;
    return `Dossier : ${dir()}\n` + all.map((x) => {
      if (x.error) return `- ${x.file} : illisible (${x.error})`;
      const sc = x.scenario;
      return `- ${sc.title} [${sc.id}] : ${MP.SCENARIO_TYPES[sc.type]}, ${sc.characters.length} personnages, ${sc.items.length} objets, ${sc.knowledge.length} connaissances, ${sc.steps.length} étapes (${x.file})`;
    }).join('\n');
  },

  lire_scenario({ scenario, format }) {
    const hit = load(scenario);
    if (format === 'json') return JSON.stringify(MP.exportData(hit.scenario), null, 2);
    return summary(hit.scenario) + '\n\n' + fileNote(hit.file);
  },

  creer_scenario(args) {
    const id = args.id ? String(args.id).trim() : 'sc_' + (slug(args.title) || 'scenario');
    if (readAll().some((x) => x.scenario && x.scenario.id === id)) throw new ToolError(`Un scénario d'identifiant « ${id} » existe déjà. Choisissez un autre id ou un autre titre.`);
    const sc = MP.newScenario(args.type);
    sc.id = id;
    for (const f of Object.keys(scenarioFields)) if (args[f] !== undefined) sc[f] = String(args[f]);
    const file = freeFileFor(id);
    save(sc, file);
    return `Scénario « ${sc.title} » créé [${sc.id}].\n${fileNote(file)}`;
  },

  ecrire_scenario({ contenu, remplacer }) {
    let result;
    try {
      result = MP.importData(contenu);
    } catch (e) {
      throw new ToolError(e.message);
    }
    const { scenario: sc, warnings } = result;
    const raw = typeof contenu === 'string' ? JSON.parse(contenu) : contenu;
    if (!(raw.scenario || raw).id) sc.id = 'sc_' + (slug(sc.title) || 'scenario');
    const existing = readAll().find((x) => x.scenario && x.scenario.id === sc.id);
    if (existing && !remplacer) {
      throw new ToolError(`Le scénario « ${existing.scenario.title} » porte déjà l'identifiant « ${sc.id} ». Passez remplacer=true pour l'écraser, ou changez l'id.`);
    }
    const file = existing ? existing.file : freeFileFor(sc.id);
    save(sc, file);
    return withWarnings(`Scénario « ${sc.title} » enregistré [${sc.id}].\n${fileNote(file)}\n\n${analysis(sc)}`, warnings);
  },

  modifier_scenario({ scenario, champs }) {
    const hit = load(scenario);
    const bad = Object.keys(champs || {}).filter((f) => !scenarioFields[f]);
    if (bad.length) throw new ToolError(`Champ(s) inconnu(s) : ${bad.join(', ')}. Champs possibles : ${Object.keys(scenarioFields).join(', ')}.`);
    if (champs.type && !MP.SCENARIO_TYPES[champs.type]) throw new ToolError(`Type « ${champs.type} » inconnu : ${Object.keys(MP.SCENARIO_TYPES).join(', ')}.`);
    const { scenario: sc, warnings } = commit(hit, (raw) => { for (const [k, v] of Object.entries(champs)) raw[k] = String(v); });
    return withWarnings(`Scénario « ${sc.title} » mis à jour.`, warnings);
  },

  ajouter_elements({ scenario, elements }) {
    const hit = load(scenario);
    if (!Array.isArray(elements) || !elements.length) throw new ToolError('« elements » doit être une liste non vide.');
    const used = allIds(hit.scenario);
    const added = [];
    const prepared = elements.map((e, i) => {
      if (!e || typeof e !== 'object') throw new ToolError(`Élément n°${i + 1} : objet attendu.`);
      const { genre, ...fields } = e;
      const kind = kindOf(genre);
      const label = fields.title || fields.name;
      checkFields(kind, Object.fromEntries(Object.entries(fields).filter(([k]) => k !== 'id')), `Élément n°${i + 1}${label ? ` (${label})` : ''}`);
      if (kind === 'steps' && fields.type && !MP.STEP_TYPES[fields.type]) {
        throw new ToolError(`Élément n°${i + 1} : type d'étape « ${fields.type} » inconnu. Types : ${Object.keys(MP.STEP_TYPES).join(', ')}.`);
      }
      if (fields.id) {
        fields.id = String(fields.id).trim();
        if (used.has(fields.id)) throw new ToolError(`Élément n°${i + 1} : l'identifiant « ${fields.id} » est déjà utilisé.`);
        used.add(fields.id);
      } else {
        fields.id = readableId(kind, label || MP.defaults[kind]().title || MP.defaults[kind]().name, used);
      }
      added.push({ kind, id: fields.id });
      return { kind, fields };
    });
    const { scenario: sc, warnings } = commit(hit, (raw) => { for (const p of prepared) raw[p.kind].push(p.fields); });
    const lines = added.map((a) => `- ${MP.KINDS[a.kind].label} « ${MP.nameOf(sc, a.id)} » [${a.id}]`);
    return withWarnings(`${added.length} élément(s) ajouté(s) à « ${sc.title} » :\n${lines.join('\n')}`, warnings);
  },

  modifier_element({ scenario, element, champs }) {
    const hit = load(scenario);
    const { kind, obj } = findElement(hit.scenario, element);
    if (!champs || typeof champs !== 'object') throw new ToolError('« champs » doit être un objet.');
    if ('id' in champs && champs.id !== obj.id) throw new ToolError('L\'identifiant d\'un élément ne peut pas être modifié.');
    checkFields(kind, Object.fromEntries(Object.entries(champs).filter(([k]) => k !== 'id')), `${MP.KINDS[kind].label} « ${MP.label(obj)} »`);
    if (kind === 'steps' && champs.type && !MP.STEP_TYPES[champs.type]) {
      throw new ToolError(`Type d'étape « ${champs.type} » inconnu. Types : ${Object.keys(MP.STEP_TYPES).join(', ')}.`);
    }
    const { scenario: sc, warnings } = commit(hit, (raw) => {
      const target = raw[kind].find((e) => e.id === obj.id);
      Object.assign(target, champs, { id: obj.id });
    });
    return withWarnings(`${MP.KINDS[kind].label} « ${MP.nameOf(sc, obj.id)} » [${obj.id}] modifié${kind === 'knowledge' || kind === 'steps' ? 'e' : ''}.`, warnings);
  },

  supprimer_element({ scenario, element }) {
    const hit = load(scenario);
    const { kind, obj } = findElement(hit.scenario, element);
    MP.remove(hit.scenario, obj.id);
    save(hit.scenario, hit.file);
    return `${MP.KINDS[kind].label} « ${MP.label(obj)} » [${obj.id}] supprimé${kind === 'knowledge' || kind === 'steps' ? 'e' : ''}, ainsi que les références vers ${kind === 'knowledge' || kind === 'steps' ? 'elle' : 'lui'}.`;
  },

  analyser_scenario({ scenario }) {
    return analysis(load(scenario).scenario);
  },

  supprimer_scenario({ scenario }) {
    const hit = load(scenario);
    fs.unlinkSync(path.join(dir(), hit.file));
    return `Scénario « ${hit.scenario.title} » supprimé (${hit.file}).`;
  },

  aide_format({ modele }) {
    let text = fs.readFileSync(path.join(ROOT, 'docs', 'FORMAT-JSON.md'), 'utf8');
    if (modele) text += '\n\n# Modèle complet (modeles/modele-complet.json)\n\n```json\n' + fs.readFileSync(path.join(ROOT, 'modeles', 'modele-complet.json'), 'utf8') + '\n```';
    return text;
  },
};

function call(name, args) {
  const h = handlers[name];
  if (!h) return null;
  try {
    return { text: h(args || {}), isError: false };
  } catch (e) {
    if (e instanceof ToolError) return { text: e.message, isError: true };
    return { text: 'Erreur inattendue : ' + e.message, isError: true };
  }
}

module.exports = { definitions, call, dir };
