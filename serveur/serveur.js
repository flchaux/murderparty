#!/usr/bin/env node
/*
 * Serveur Intrigue pour un VPS : sert l'outil web, enregistre les scénarios sur le disque,
 * prévient les pages ouvertes en direct, et expose le connecteur MCP pour claude.ai.
 * Aucune dépendance : Node.js 18 ou plus suffit.
 *
 * Variables d'environnement (voir serveur/intrigue.env.exemple) :
 *   INTRIGUE_PASSWORD   mot de passe de l'outil web (obligatoire)
 *   INTRIGUE_WEB_URL    adresse publique, par exemple https://intrigue.example.fr/
 *   INTRIGUE_DIR        dossier des scénarios (par défaut : scenarios/ du projet)
 *   INTRIGUE_MCP_TOKEN  clé secrète du connecteur (générée et conservée si absente)
 *   PORT, HOST          écoute (par défaut 3000 sur 127.0.0.1, derrière nginx)
 *
 * Routes :
 *   /                     l'outil web
 *   /api/...              scénarios (connexion par mot de passe)
 *   /mcp/<clé secrète>    connecteur MCP (transport HTTP « streamable »)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tools = require('../mcp/tools');
const { handle } = require('../mcp/protocol');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const PASSWORD = process.env.INTRIGUE_PASSWORD || '';
const SESSION_DAYS = 180;
const MAX_BODY = 2 * 1024 * 1024;
// Les réponses des outils renvoient vers l'outil web plutôt que vers un fichier à importer.
if (!process.env.INTRIGUE_WEB_URL) process.env.INTRIGUE_WEB_URL = `http://${HOST}:${PORT}/`;

if (PASSWORD.length < 8) {
  console.error('[intrigue] Définissez INTRIGUE_PASSWORD (8 caractères au moins) avant de lancer le serveur.');
  process.exit(1);
}

/* ---------- Secrets conservés dans le dossier des scénarios ---------- */
const SECRETS_FILE = path.join(tools.dir(), '.secrets.json');
function loadSecrets() {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8')); } catch (e) { s = {}; }
  let dirty = false;
  if (!s.cookieKey) { s.cookieKey = crypto.randomBytes(32).toString('hex'); dirty = true; }
  if (!s.mcpToken) { s.mcpToken = crypto.randomBytes(24).toString('base64url'); dirty = true; }
  if (dirty) fs.writeFileSync(SECRETS_FILE, JSON.stringify(s, null, 2), { mode: 0o600 });
  return s;
}
const secrets = loadSecrets();
const MCP_TOKEN = process.env.INTRIGUE_MCP_TOKEN || secrets.mcpToken;

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/* ---------- Session : cookie signé, valable SESSION_DAYS jours ---------- */
// Changer le mot de passe invalide toutes les sessions ouvertes.
const sign = (v) => crypto.createHmac('sha256', secrets.cookieKey).update(v + '|' + PASSWORD).digest('base64url');
function newSession() {
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  return exp + '.' + sign(exp);
}
function validSession(req) {
  const m = /(?:^|;\s*)intrigue_session=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  return !!exp && !!sig && Number(exp) > Date.now() && safeEqual(sig, sign(exp));
}
const isHttps = (req) => (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' || /^https:/.test(process.env.INTRIGUE_WEB_URL || '');

/* Limite les essais de mot de passe : 10 échecs par quart d'heure et par adresse. */
const failures = new Map();
function clientIp(req) {
  const fwd = req.socket.remoteAddress === '127.0.0.1' || req.socket.remoteAddress === '::1' ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return fwd || req.socket.remoteAddress || '?';
}
function tooManyFailures(ip) {
  const f = failures.get(ip);
  if (!f || f.until < Date.now()) return false;
  return f.count >= 10;
}
function recordFailure(ip) {
  const f = failures.get(ip);
  if (!f || f.until < Date.now()) failures.set(ip, { count: 1, until: Date.now() + 15 * 60e3 });
  else f.count += 1;
}

/* ---------- Réponses ---------- */
function send(res, status, body, headers) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, Object.assign({
    'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }, headers || {}));
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Trop volumineux.'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      try { resolve(text ? JSON.parse(text) : null); } catch (e) { reject(Object.assign(new Error('JSON illisible.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

/* ---------- Fichiers de l'outil web ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  if (!/^(index\.html|css\/[\w.-]+|js\/[\w.-]+|modeles\/[\w.-]+\.json|favicon\.ico)$/.test(rel)) return send(res, 404, 'Introuvable.');
  const file = path.join(ROOT, rel);
  fs.readFile(file, (e, data) => {
    if (e) return send(res, 404, 'Introuvable.');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

/* ---------- Événements en direct (Server-Sent Events) ---------- */
const streams = new Set();
let currentSource = null;
tools.onChange((type, id, data) => {
  const payload = `event: change\ndata: ${JSON.stringify({ type, id, data: data || null, source: currentSource })}\n\n`;
  for (const res of streams) res.write(payload);
});
setInterval(() => { for (const res of streams) res.write(': ping\n\n'); }, 25e3).unref();

/* ---------- API de l'outil web ---------- */
async function serveApi(req, res, pathname) {
  if (pathname === '/api/session') {
    return validSession(req) ? send(res, 200, { intrigue: true, ok: true }) : send(res, 401, { intrigue: true, login: true });
  }
  if (pathname === '/api/login' && req.method === 'POST') {
    const ip = clientIp(req);
    if (tooManyFailures(ip)) return send(res, 429, { error: 'Trop d\'essais. Réessayez dans un quart d\'heure.' });
    const body = await readBody(req).catch(() => null);
    if (!body || !safeEqual(body.password || '', PASSWORD)) {
      recordFailure(ip);
      await new Promise((r) => setTimeout(r, 800));
      return send(res, 401, { error: 'Mot de passe incorrect. Réessayez :' });
    }
    failures.delete(ip);
    const cookie = `intrigue_session=${newSession()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${isHttps(req) ? '; Secure' : ''}`;
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookie });
  }
  if (pathname === '/api/logout' && req.method === 'POST') {
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'intrigue_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
  }

  if (!validSession(req)) return send(res, 401, { intrigue: true, login: true });

  if (pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    streams.add(res);
    req.on('close', () => streams.delete(res));
    return;
  }
  if (pathname === '/api/scenarios' && req.method === 'GET') return send(res, 200, tools.store.list());

  const m = /^\/api\/scenarios\/([^/]+)$/.exec(pathname);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (!tools.store.validId(id)) return send(res, 400, { error: 'Identifiant invalide.' });
    // Exiger du JSON écarte les formulaires envoyés depuis un autre site.
    if (!/^application\/json/.test(req.headers['content-type'] || '') && req.method === 'PUT') return send(res, 415, { error: 'JSON attendu.' });
    currentSource = String(req.headers['x-intrigue-client'] || '').slice(0, 40) || null;
    try {
      if (req.method === 'PUT') {
        const body = await readBody(req);
        currentSource = String(req.headers['x-intrigue-client'] || '').slice(0, 40) || null;
        const updatedAt = tools.store.put(id, body);
        return send(res, 200, { ok: true, updatedAt });
      }
      if (req.method === 'DELETE') {
        tools.store.remove(id);
        return send(res, 200, { ok: true });
      }
    } catch (e) {
      return send(res, e.status || 400, { error: e.message });
    } finally {
      currentSource = null;
    }
  }
  return send(res, 404, { error: 'Introuvable.' });
}

/* ---------- Connecteur MCP (HTTP « streamable », réponses JSON) ---------- */
async function serveMcp(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Utilisez POST.' }, { Allow: 'POST' });
  let msg;
  try {
    msg = await readBody(req);
  } catch (e) {
    return send(res, e.status === 413 ? 413 : 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: e.message } });
  }
  const batch = Array.isArray(msg);
  const replies = (batch ? msg : [msg]).map(handle).filter(Boolean);
  if (!replies.length) { res.writeHead(202); return res.end(); }
  return send(res, 200, batch ? replies : replies[0]);
}

/* ---------- Aiguillage ---------- */
const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://x').pathname;
  } catch (e) {
    return send(res, 400, 'Adresse invalide.');
  }
  try {
    if (pathname.startsWith('/mcp/')) {
      if (!safeEqual(pathname.slice(5).replace(/\/$/, ''), MCP_TOKEN)) return send(res, 404, 'Introuvable.');
      return await serveMcp(req, res);
    }
    if (pathname.startsWith('/api/')) return await serveApi(req, res, pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Méthode non autorisée.');
    return serveStatic(req, res, pathname);
  } catch (e) {
    console.error('[intrigue]', e);
    if (!res.headersSent) send(res, 500, { error: 'Erreur interne.' });
  }
});

server.listen(PORT, HOST, () => {
  const base = (process.env.INTRIGUE_WEB_URL || `http://${HOST}:${PORT}/`).replace(/\/?$/, '/');
  console.log(`[intrigue] outil web : ${base}`);
  console.log(`[intrigue] scénarios : ${tools.dir()}`);
  console.log(`[intrigue] connecteur à ajouter dans claude.ai : ${base}mcp/${MCP_TOKEN}`);
});
