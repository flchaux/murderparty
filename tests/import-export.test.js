/* Tests du format JSON : node tests/import-export.test.js */
global.window = global;
const path = require('path');
const root = path.join(__dirname, '..');
for (const f of ['model','example','engine','io']) require(path.join(root, 'js', f + '.js'));
const fs = require('fs');
const assert = require('assert');
// 1. Modèle complet : import sans correction, analyse sans erreur.
const txt = fs.readFileSync(path.join(root, 'modeles', 'modele-complet.json'),'utf8');
const r = MP.importData(txt);
console.log('modele warnings', r.warnings);
assert.strictEqual(r.warnings.length, 0);
const a = MP.analyze(r.scenario);
console.log('modele analyse', a.counts, a.issues.map(i=>i.level+': '+MP.nameOf(r.scenario,i.ref)+' '+i.msg));
assert.strictEqual(a.counts.error, 0); assert.strictEqual(a.counts.warning, 0);
const types = new Set(r.scenario.steps.map(s=>s.type)); assert.strictEqual(types.size, 6);
// 2. Aller-retour de l'exemple : export puis import identique.
const ex = MP.exampleScenario();
const back = MP.importData(JSON.stringify(MP.exportData(ex)));
assert.strictEqual(back.warnings.length, 0);
assert.deepStrictEqual(JSON.parse(JSON.stringify(back.scenario.steps)), JSON.parse(JSON.stringify(ex.steps)));
assert.deepStrictEqual(JSON.parse(JSON.stringify(back.scenario.characters)), JSON.parse(JSON.stringify(ex.characters)));
// 3. Fichier écrit à la main : sans id, références par nom, texte au lieu de liste.
const hand = MP.importData(JSON.stringify({
  title: 'Main', type: 'chasse',
  items: [{ name: 'Carte' }],
  knowledge: [{ name: 'Code' }],
  characters: [{ name: 'Alice', startKnow: 'Code', relations: [{ to: 'Bob' }, { to: 'Alice' }] }],
  steps: [{ title: 'Départ', giveItems: 'Carte' }, { title: 'Arrivée', type: 'fin', reqItems: ['carte'], reqSteps: ['Départ', 'Inconnue'], hints: ['a','b'], foo: 1 }],
}));
console.log('hand warnings', hand.warnings);
const s2 = hand.scenario.steps[1];
assert.deepStrictEqual(s2.reqItems, [hand.scenario.items[0].id]);
assert.deepStrictEqual(s2.reqSteps, [hand.scenario.steps[0].id]);
assert.strictEqual(s2.hints, 'a\nb');
assert.strictEqual(hand.scenario.characters[0].startKnow.length, 1);
assert.strictEqual(hand.warnings.length, 4);
// 4. Erreurs bloquantes.
for (const bad of ['{ "title": "x", ', '[1,2]', '{"title":"x"}', '{"format":"autre","steps":[]}', '{"version":9,"steps":[]}', '{"steps":"abc"}']) {
  try { MP.importData(bad); console.log('PAS D ERREUR', bad); process.exit(1); } catch (e) { console.log('OK erreur :', e.message); }
}
console.log('TOUS LES TESTS PASSENT');
