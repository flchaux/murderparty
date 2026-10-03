/*
 * Prépare un scénario pour la base en ligne de la page Intrigue publiée.
 * Lit un fichier JSON (format Intrigue, import tolérant), affiche les corrections et l'analyse,
 * puis écrit la version normalisée, datée de maintenant, prête à être envoyée telle quelle
 * comme document « scenarios/<id> » de la page.
 *
 * Usage : node tools/preparer-en-ligne.js <entrée.json> [sortie.json]
 */
const fs = require('fs');
const { summary, analysis, MP } = require('../mcp/tools');

const [input, output] = process.argv.slice(2);
if (!input) { console.error('Usage : node tools/preparer-en-ligne.js <entrée.json> [sortie.json]'); process.exit(1); }
let result;
try {
  result = MP.importData(fs.readFileSync(input, 'utf8'));
} catch (e) {
  console.error('Import impossible : ' + e.message);
  process.exit(1);
}
const sc = result.scenario;
if (!/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(sc.id)) sc.id = MP.uid('sc');
sc.updatedAt = Date.now();
if (result.warnings.length) console.log('Corrections :\n' + result.warnings.map((w) => '- ' + w).join('\n') + '\n');
console.log(analysis(sc));
if (process.argv.includes('--resume')) console.log('\n' + summary(sc));
const out = output && output !== '--resume' ? output : input.replace(/\.json$/, '') + '.en-ligne.json';
fs.writeFileSync(out, JSON.stringify(MP.exportData(sc), null, 2) + '\n');
console.log(`\nDocument prêt : ${out}\nIdentifiant (doc_id) : ${sc.id}`);
