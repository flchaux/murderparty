/* Tests du serveur MCP : node tests/mcp.test.js */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'intrigue-mcp-'));
const server = spawn(process.execPath, [path.join(root, 'mcp', 'server.js')], { env: Object.assign({}, process.env, { INTRIGUE_DIR: tmp }) });

let buffer = '';
const pending = new Map();
server.stdout.on('data', (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf('\n')) >= 0) {
    const msg = JSON.parse(buffer.slice(0, i));
    buffer = buffer.slice(i + 1);
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

let next = 1;
function request(method, params) {
  const id = next++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
async function tool(name, args, expectError) {
  const r = await request('tools/call', { name, arguments: args });
  const text = r.result.content[0].text;
  assert.strictEqual(r.result.isError, !!expectError, `${name} : ${text}`);
  return text;
}

(async () => {
  // 1. Protocole.
  const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.strictEqual(init.result.protocolVersion, '2025-06-18');
  assert.strictEqual(init.result.serverInfo.name, 'intrigue');
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const list = await request('tools/list', {});
  const names = list.result.tools.map((t) => t.name);
  console.log('outils', names.join(', '));
  assert.ok(names.includes('ecrire_scenario') && names.includes('ajouter_elements'));
  assert.strictEqual((await request('ping')).result && true, true);
  assert.strictEqual((await request('inconnu')).error.code, -32601);
  assert.strictEqual((await request('tools/call', { name: 'nope', arguments: {} })).error.code, -32602);

  // 2. Construction pas à pas, références par nom au sein d'un même appel.
  assert.match(await tool('lister_scenarios', {}), /Aucun scénario/);
  await tool('creer_scenario', { title: 'Le trésor du jardin', type: 'chasse', players: '4 enfants' });
  assert.ok(fs.existsSync(path.join(tmp, 'sc_le_tresor_du_jardin.json')));
  await tool('creer_scenario', { title: 'Le trésor du jardin' }, true);
  const added = await tool('ajouter_elements', {
    scenario: 'sc_le_tresor_du_jardin',
    elements: [
      { genre: 'etape', title: 'Déterrer le coffre', type: 'fin', reqItems: ['Carte au trésor'], reqKnow: 'Code du cadenas' },
      { genre: 'objet', name: 'Carte au trésor' },
      { genre: 'connaissance', name: 'Code du cadenas', id: 'k_code' },
      { genre: 'personnage', name: 'Léa', startKnow: ['Code du cadenas'] },
      { genre: 'etape', title: 'Fouiller le banc', type: 'fouille', giveItems: ['Carte au trésor'] },
    ],
  });
  console.log(added);
  assert.match(added, /\[s_deterrer_le_coffre\]/);
  await tool('ajouter_elements', { scenario: 'Le trésor du jardin', elements: [{ genre: 'objet', name: 'X', couleur: 'rouge' }] }, true);
  await tool('ajouter_elements', { scenario: 'Le trésor du jardin', elements: [{ genre: 'etape', type: 'danse' }] }, true);

  let a = await tool('analyser_scenario', { scenario: 'sc_le_tresor_du_jardin' });
  console.log(a);
  assert.match(a, /0 erreur\(s\)/);
  assert.match(a, /vague 2/);

  // 3. Modifications et suppression.
  const mod = await tool('modifier_element', { scenario: 'sc_le_tresor_du_jardin', element: 'Fouiller le banc', champs: { giveItems: [], location: 'Jardin', reqSteps: ['Introuvable'] } });
  assert.match(mod, /Introuvable/);
  a = await tool('analyser_scenario', { scenario: 'sc_le_tresor_du_jardin' });
  assert.match(a, /ERREUR/);
  await tool('modifier_element', { scenario: 'sc_le_tresor_du_jardin', element: 's_fouiller_le_banc', champs: { id: 'autre' } }, true);
  await tool('supprimer_element', { scenario: 'sc_le_tresor_du_jardin', element: 'k_code' });
  const json = JSON.parse(await tool('lire_scenario', { scenario: 'sc_le_tresor_du_jardin', format: 'json' }));
  assert.strictEqual(json.format, 'intrigue-scenario');
  assert.deepStrictEqual(json.steps.find((s) => s.id === 's_deterrer_le_coffre').reqKnow, []);
  assert.deepStrictEqual(json.characters[0].startKnow, []);
  await tool('modifier_scenario', { scenario: 'sc_le_tresor_du_jardin', champs: { synopsis: 'Un pirate a caché son trésor.' } });
  assert.match(await tool('lire_scenario', { scenario: 'sc_le_tresor_du_jardin' }), /Un pirate a caché/);
  await tool('modifier_scenario', { scenario: 'sc_le_tresor_du_jardin', champs: { auteur: 'moi' } }, true);

  // 4. Scénario complet d'un coup : le modèle doit passer sans correction ni erreur.
  const modele = fs.readFileSync(path.join(root, 'modeles', 'modele-complet.json'), 'utf8');
  const w = await tool('ecrire_scenario', { contenu: JSON.parse(modele) });
  assert.doesNotMatch(w, /Corrections/);
  assert.match(w, /0 erreur\(s\), 0 avertissement/);
  await tool('ecrire_scenario', { contenu: modele }, true);
  await tool('ecrire_scenario', { contenu: modele, remplacer: true });
  await tool('ecrire_scenario', { contenu: '{ "title": ' }, true);
  assert.match(await tool('lister_scenarios', {}), /sc_modele_labo/);

  // 5. Le fichier écrit s'importe dans l'outil web.
  global.window = global;
  for (const f of ['model', 'engine', 'io']) require(path.join(root, 'js', f + '.js'));
  const back = MP.importData(fs.readFileSync(path.join(tmp, 'sc_modele_labo.json'), 'utf8'));
  assert.strictEqual(back.warnings.length, 0);

  await tool('supprimer_scenario', { scenario: 'sc_modele_labo' });
  assert.ok(!fs.existsSync(path.join(tmp, 'sc_modele_labo.json')));
  assert.match(await tool('aide_format', {}), /Format JSON des scénarios Intrigue/);

  server.stdin.end();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('TOUS LES TESTS MCP PASSENT');
})().catch((e) => { console.error(e); server.kill(); process.exit(1); });
