#!/usr/bin/env node
/*
 * Serveur MCP Intrigue en local (transport stdio, un message JSON-RPC par ligne), sans dépendance.
 *
 *   node mcp/server.js
 *
 * Les scénarios sont enregistrés dans le dossier scenarios/ du projet,
 * ou dans le dossier indiqué par la variable d'environnement INTRIGUE_DIR.
 * Pour un serveur en ligne relié à claude.ai, voir serveur/serveur.js.
 */
const readline = require('readline');
const { handle } = require('./protocol');
const tools = require('./tools');

const send = (msg) => { if (msg) process.stdout.write(JSON.stringify(msg) + '\n'); };

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Message JSON illisible.' } });
  }
  for (const m of Array.isArray(msg) ? msg : [msg]) send(handle(m));
});
rl.on('close', () => process.exit(0));

process.stderr.write(`[intrigue] serveur MCP prêt, scénarios dans ${tools.dir()}\n`);
