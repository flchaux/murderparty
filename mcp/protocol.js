/* Protocole MCP (JSON-RPC 2.0), commun aux deux transports : stdio (mcp/server.js) et web (serveur/serveur.js). */
const tools = require('./tools');

const SERVER_INFO = { name: 'intrigue', title: 'Intrigue, atelier de scénarios', version: '1.1.0' };
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = [
  'Ce serveur conçoit des murder parties, escape games et chasses au trésor au format Intrigue.',
  'Un scénario relie personnages, objets, connaissances et étapes : chaque étape exige des étapes, objets et connaissances, et en donne.',
  'Pour écrire un scénario entier, lire aide_format puis appeler ecrire_scenario. Pour le construire pas à pas : creer_scenario puis ajouter_elements.',
  'Après chaque série de modifications, appeler analyser_scenario et corriger les erreurs (étapes inatteignables, objets sans source).',
  'Les scénarios enregistrés apparaissent dans l\'outil web Intrigue.',
].join('\n');

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

/* Traite un message ; renvoie la réponse, ou null pour une notification ou une réponse du client. */
function handle(msg) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    if (msg && msg.id !== undefined && msg.method === undefined) return null;
    return fail(msg && msg.id !== undefined ? msg.id : null, -32600, 'Requête JSON-RPC invalide.');
  }
  if (msg.id === undefined || msg.id === null) return null;

  const params = msg.params || {};
  try {
    switch (msg.method) {
      case 'initialize': {
        const asked = params.protocolVersion;
        return ok(msg.id, {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        });
      }
      case 'ping':
        return ok(msg.id, {});
      case 'tools/list':
        return ok(msg.id, { tools: tools.definitions });
      case 'tools/call': {
        const out = tools.call(params.name, params.arguments);
        if (!out) return fail(msg.id, -32602, `Outil inconnu : ${params.name}`);
        return ok(msg.id, { content: [{ type: 'text', text: out.text }], isError: out.isError });
      }
      default:
        return fail(msg.id, -32601, `Méthode non prise en charge : ${msg.method}`);
    }
  } catch (e) {
    process.stderr.write('[intrigue] ' + e.stack + '\n');
    return fail(msg.id, -32603, 'Erreur interne : ' + e.message);
  }
}

module.exports = { handle, PROTOCOL_VERSIONS };
