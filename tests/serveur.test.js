/* Tests du serveur pour VPS : node tests/serveur.test.js */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'intrigue-srv-'));
const PORT = 3400 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, [path.join(root, 'serveur', 'serveur.js')], {
  env: Object.assign({}, process.env, { INTRIGUE_PASSWORD: 'secret-de-test', INTRIGUE_DIR: tmp, PORT: String(PORT) }),
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (let i = 0; i < 50 && !fs.existsSync(path.join(tmp, '.secrets.json')); i++) await wait(100);
  await wait(200);
  const token = JSON.parse(fs.readFileSync(path.join(tmp, '.secrets.json'), 'utf8')).mcpToken;
  const json = { 'Content-Type': 'application/json' };

  assert.strictEqual((await fetch(base + '/')).status, 200);
  assert.strictEqual((await fetch(base + '/serveur/serveur.js')).status, 404);
  assert.strictEqual((await fetch(base + '/api/scenarios')).status, 401);
  assert.strictEqual((await fetch(base + '/mcp/mauvais', { method: 'POST', headers: json, body: '{}' })).status, 404);
  assert.strictEqual((await fetch(base + '/api/login', { method: 'POST', headers: json, body: '{"password":"non"}' })).status, 401);
  const login = await fetch(base + '/api/login', { method: 'POST', headers: json, body: '{"password":"secret-de-test"}' });
  assert.strictEqual(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const auth = Object.assign({ Cookie: cookie }, json);

  // Flux d'événements ouvert pendant que Claude écrit.
  const events = [];
  const ctrl = new AbortController();
  fetch(base + '/api/events', { headers: { Cookie: cookie }, signal: ctrl.signal }).then(async (r) => {
    const reader = r.body.getReader();
    for (;;) { const { value, done } = await reader.read(); if (done) break; events.push(Buffer.from(value).toString()); }
  }).catch(() => {});
  await wait(200);

  const call = async (name, args) => (await (await fetch(`${base}/mcp/${token}`, { method: 'POST', headers: json, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })).json()).result;
  const init = await (await fetch(`${base}/mcp/${token}`, { method: 'POST', headers: json, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }) })).json();
  assert.strictEqual(init.result.protocolVersion, '2025-03-26');
  assert.strictEqual((await fetch(`${base}/mcp/${token}`, { method: 'POST', headers: json, body: '{"jsonrpc":"2.0","method":"notifications/initialized"}' })).status, 202);
  const created = await call('creer_scenario', { title: 'Essai' });
  assert.match(created.content[0].text, /Visible dans Intrigue/);
  await wait(200);
  assert.ok(events.join('').includes('"id":"sc_essai"'));

  // La page enregistre : l'heure du serveur est renvoyée, Claude voit le changement.
  const list = await (await fetch(base + '/api/scenarios', { headers: auth })).json();
  const sc = list.find((s) => s.id === 'sc_essai');
  sc.synopsis = 'Écrit depuis la page.';
  const put = await (await fetch(base + '/api/scenarios/sc_essai', { method: 'PUT', headers: auth, body: JSON.stringify(sc) })).json();
  assert.ok(put.updatedAt > 0);
  assert.match((await call('lire_scenario', { scenario: 'sc_essai' })).content[0].text, /Écrit depuis la page/);
  assert.strictEqual((await fetch(base + '/api/scenarios/sc_essai', { method: 'PUT', headers: { Cookie: cookie }, body: '{}' })).status, 415);
  assert.strictEqual((await fetch(base + '/api/scenarios/sc_essai', { method: 'DELETE', headers: auth })).status, 200);
  assert.strictEqual((await (await fetch(base + '/api/scenarios', { headers: auth })).json()).length, 0);

  ctrl.abort();
  srv.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('TOUS LES TESTS SERVEUR PASSENT');
})().catch((e) => { console.error(e); srv.kill(); process.exit(1); });
