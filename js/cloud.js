/*
 * Enregistrement partagé des scénarios, selon l'endroit où la page tourne :
 * - publiée sur claude.ai : base de données de la page (collection « scenarios ») ;
 * - servie par serveur/serveur.js (votre serveur) : API du serveur, après connexion par mot de passe.
 * Dans les deux cas, Claude peut lire et modifier les scénarios, et la page se met à jour toute seule.
 * Ouverte en local (fichier), la page garde le stockage du navigateur.
 */
(function () {
  const MP = (window.MP = window.MP || {});
  const COLLECTION = 'scenarios';
  const VALID_ID = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
  const DELETE = {};
  const CLIENT = Math.random().toString(36).slice(2, 12);

  const cloud = {
    on: false,
    mode: null, // 'artifact' ou 'server'
    readOnly: false,
    onError: null,
    pending: {},
    busy: {},
    backend: null,
  };

  cloud.validId = (id) => VALID_ID.test(String(id)) && id !== '.' && id !== '..';

  function err(code, message) { const e = new Error(message || code); e.code = code; return e; }

  /* ---------- Base de la page publiée sur claude.ai ---------- */
  function artifactBackend(db) {
    return {
      subscribe(onChanges, onFail) {
        return db.collection(COLLECTION).onSnapshot((snap) => {
          onChanges(snap.docChanges().map((c) => ({ type: c.type, id: c.doc.id, data: c.doc.data() })));
        }, onFail);
      },
      set: (id, body) => db.collection(COLLECTION).doc(id).set(body),
      del: (id) => db.collection(COLLECTION).doc(id).delete(),
    };
  }

  /* ---------- API de votre serveur ---------- */
  async function api(method, url, body) {
    let res;
    try {
      res = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: Object.assign({ 'X-Intrigue-Client': CLIENT }, body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw err('unavailable', 'Serveur injoignable.');
    }
    const data = await res.json().catch(() => null);
    if (res.status === 401) throw err('unauthenticated', 'Connexion expirée.');
    if (res.status === 413) throw err('quota_exceeded', 'Scénario trop volumineux.');
    if (!res.ok) throw err(res.status >= 500 ? 'unavailable' : 'invalid_argument', (data && data.error) || 'Erreur ' + res.status);
    return data;
  }

  function serverBackend() {
    const known = new Set();
    return {
      subscribe(onChanges, onFail) {
        let source = null;
        let stopped = false;
        // Recharge la liste complète : au départ, puis à chaque (re)connexion du flux d'événements.
        const sync = async (first) => {
          const list = await api('GET', 'api/scenarios');
          const seen = new Set(list.map((d) => d.id));
          const changes = list.map((d) => ({ type: first || !known.has(d.id) ? 'added' : 'modified', id: d.id, data: d }));
          for (const id of known) if (!seen.has(id)) changes.push({ type: 'removed', id, data: null });
          known.clear();
          seen.forEach((id) => known.add(id));
          if (first || changes.length) onChanges(changes);
        };
        const listen = () => {
          if (stopped) return;
          source = new EventSource('api/events');
          source.addEventListener('change', (ev) => {
            let c;
            try { c = JSON.parse(ev.data); } catch (e) { return; }
            if (c.type === 'removed') known.delete(c.id); else known.add(c.id);
            if (c.source === CLIENT) return;
            onChanges([{ type: c.type, id: c.id, data: c.data }]);
          });
          source.addEventListener('open', () => { sync(false).catch(() => {}); });
          source.addEventListener('error', async () => {
            // Le navigateur se reconnecte seul ; on vérifie seulement que la session est toujours valide.
            try { await api('GET', 'api/session'); } catch (e) {
              if (e.code === 'unauthenticated' && cloud.onError) cloud.onError(e, 'session');
            }
          });
        };
        sync(true).then(listen, (e) => onFail(e));
        return () => { stopped = true; if (source) source.close(); };
      },
      async set(id, body, sc) {
        const r = await api('PUT', 'api/scenarios/' + encodeURIComponent(id), body);
        // L'heure du serveur fait foi, pour comparer avec les modifications faites par Claude.
        if (sc && r && r.updatedAt && sc.updatedAt === body.updatedAt) sc.updatedAt = r.updatedAt;
      },
      del: (id) => api('DELETE', 'api/scenarios/' + encodeURIComponent(id)),
    };
  }

  /* Page servie par serveur/serveur.js ? Demande le mot de passe si besoin. Renvoie true si connecté. */
  async function connectServer() {
    let res;
    try {
      res = await fetch('api/session', { credentials: 'same-origin' });
    } catch (e) {
      return false;
    }
    const info = await res.json().catch(() => null);
    if (!info || !info.intrigue) return false;
    if (res.ok) return true;
    let message = 'Mot de passe de l\'outil :';
    for (;;) {
      const password = await MP.dialog({
        title: 'Connexion à Intrigue', message, input: true, password: true,
        okLabel: 'Se connecter', cancelLabel: 'Continuer sans connexion',
      });
      if (password == null) return false;
      const r = await fetch('api/login', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      }).catch(() => null);
      if (r && r.ok) return true;
      const d = r ? await r.json().catch(() => null) : null;
      message = (d && d.error) || 'Mot de passe incorrect. Réessayez :';
    }
  }

  /* Renvoie true quand un enregistrement partagé est disponible. */
  cloud.connect = async function () {
    if (MP.isHosted()) {
      let db = null;
      try { db = await window.claude.use('db'); } catch (e) { db = null; }
      if (db) { cloud.backend = artifactBackend(db); cloud.mode = 'artifact'; }
    } else if (/^https?:$/.test(location.protocol) && await connectServer()) {
      cloud.backend = serverBackend();
      cloud.mode = 'server';
    }
    cloud.on = !!cloud.backend;
    return cloud.on;
  };

  cloud.reconnect = connectServer;

  /* onChanges reçoit [{ type: added|modified|removed, id, data }]. Abonnement unique. */
  cloud.subscribe = (onChanges, onFail) => cloud.backend.subscribe(onChanges, onFail);

  /* Une seule écriture à la fois par scénario ; seule la dernière version en attente est envoyée. */
  async function flush(id) {
    cloud.busy[id] = true;
    while (cloud.pending[id] !== undefined) {
      const { body, sc } = cloud.pending[id];
      delete cloud.pending[id];
      const run = () => (body === DELETE ? cloud.backend.del(id) : cloud.backend.set(id, body, sc));
      try {
        try {
          await run();
        } catch (e) {
          if (!e || e.code !== 'unavailable') throw e;
          await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));
          await run();
        }
      } catch (e) {
        if (cloud.mode === 'artifact' && e && e.code === 'invalid_argument' && body !== DELETE && JSON.stringify(body).length < 250000) cloud.readOnly = true;
        if (cloud.onError) cloud.onError(e, body === DELETE ? 'delete' : 'write');
      }
    }
    cloud.busy[id] = false;
  }

  function queue(id, body, sc) {
    if (!cloud.on || cloud.readOnly) return;
    cloud.pending[id] = { body, sc };
    if (!cloud.busy[id]) flush(id);
  }

  cloud.write = (sc) => queue(sc.id, JSON.parse(JSON.stringify(MP.exportData(sc))), sc);
  cloud.remove = (id) => queue(id, DELETE);

  /* Transforme un document reçu en scénario, avec l'import tolérant ; null s'il est inexploitable. */
  cloud.toScenario = function (id, data) {
    try {
      const sc = MP.importData(JSON.parse(JSON.stringify(data))).scenario;
      sc.id = id;
      return sc;
    } catch (e) {
      console.warn('Scénario en ligne illisible :', id, e.message);
      return null;
    }
  };

  MP.cloud = cloud;
})();
