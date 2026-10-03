#!/usr/bin/env node
/*
 * Serveur MCP Intrigue : permet à Claude de créer, modifier et analyser des scénarios.
 * Transport stdio (JSON-RPC, un message par ligne), sans dépendance : Node.js suffit.
 *
 *   node mcp/server.js
 *
 * Les scénarios sont enregistrés dans le dossier scenarios/ du projet,
 * ou dans le dossier indiqué par la variable d'environnement INTRIGUE_DIR.
 */
const readline = require('readline');
const tools = require('./tools');

const SERVER_INFO = { name: 'intrigue', title: 'Intrigue, atelier de scénarios', version: '1.0.0' };
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = [
  'Ce serveur conçoit des murder parties, escape games et chasses au trésor au format Intrigue.',
  'Un scénario relie personnages, objets, connaissances et étapes : chaque étape exige des étapes, objets et connaissances, et en donne.',
  'Pour écrire un scénario entier, lire aide_format puis appeler ecrire_scenario. Pour le construire pas à pas : creer_scenario puis ajouter_elements.',
  'Après chaque série de modifications, appeler analyser_scenario et corriger les erreurs (étapes inatteignables, objets sans source).',
  'Le fichier produit s\'importe tel quel dans l\'outil web Intrigue (bouton « Importer »).',
].join('\n');

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function reply(id, result) { send({ jsonrpc: '2.0', id, result }); }
function fail(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }

function handle(msg) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    if (msg && msg.id !== undefined && msg.method === undefined) return; // réponse du client : rien à faire
    return fail(msg && msg.id !== undefined ? msg.id : null, -32600, 'Requête JSON-RPC invalide.');
  }
  const isRequest = msg.id !== undefined && msg.id !== null;
  if (!isRequest) return; // notifications (initialized, cancelled…) : rien à faire

  const params = msg.params || {};
  switch (msg.method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      return reply(msg.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return reply(msg.id, {});
    case 'tools/list':
      return reply(msg.id, { tools: tools.definitions });
    case 'tools/call': {
      const out = tools.call(params.name, params.arguments);
      if (!out) return fail(msg.id, -32602, `Outil inconnu : ${params.name}`);
      return reply(msg.id, { content: [{ type: 'text', text: out.text }], isError: out.isError });
    }
    default:
      return fail(msg.id, -32601, `Méthode non prise en charge : ${msg.method}`);
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    return fail(null, -32700, 'Message JSON illisible.');
  }
  for (const m of Array.isArray(msg) ? msg : [msg]) {
    try {
      handle(m);
    } catch (e) {
      process.stderr.write('[intrigue] ' + e.stack + '\n');
      if (m && m.id != null) fail(m.id, -32603, 'Erreur interne : ' + e.message);
    }
  }
});
rl.on('close', () => process.exit(0));

process.stderr.write(`[intrigue] serveur MCP prêt, scénarios dans ${tools.dir()}\n`);
