/*
 * Enregistrement en ligne. Quand la page est publiée sur claude.ai, les scénarios sont rangés
 * dans la base de données de la page (collection « scenarios », un document par scénario,
 * au format d'export). Claude peut ainsi les lire et les modifier directement, et la page
 * se met à jour toute seule. Ouverte en local, la page garde le stockage du navigateur.
 */
(function () {
  const MP = (window.MP = window.MP || {});
  const COLLECTION = 'scenarios';
  const VALID_ID = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
  const DELETE = {};

  const cloud = {
    db: null,
    readOnly: false,
    onError: null,
    pending: {},
    busy: {},
  };

  cloud.validId = (id) => VALID_ID.test(String(id)) && id !== '.' && id !== '..';

  /* Renvoie la base, ou null (page locale, visiteur non connecté, capacité refusée). */
  cloud.connect = async function () {
    if (!MP.isHosted()) return null;
    try {
      cloud.db = await window.claude.use('db');
    } catch (e) {
      cloud.db = null;
    }
    return cloud.db;
  };

  /* onChanges reçoit [{ type: added|modified|removed, id, data }]. Abonnement unique. */
  cloud.subscribe = function (onChanges, onFail) {
    return cloud.db.collection(COLLECTION).onSnapshot((snap) => {
      onChanges(snap.docChanges().map((c) => ({ type: c.type, id: c.doc.id, data: c.doc.data() })));
    }, onFail);
  };

  /* Une seule écriture à la fois par scénario ; seule la dernière version en attente est envoyée. */
  async function flush(id) {
    cloud.busy[id] = true;
    while (cloud.pending[id] !== undefined) {
      const body = cloud.pending[id];
      delete cloud.pending[id];
      const ref = cloud.db.collection(COLLECTION).doc(id);
      const run = () => (body === DELETE ? ref.delete() : ref.set(body));
      try {
        try {
          await run();
        } catch (e) {
          if (!e || e.code !== 'unavailable') throw e;
          await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));
          await run();
        }
      } catch (e) {
        if (e && e.code === 'invalid_argument' && body !== DELETE && JSON.stringify(body).length < 250000) cloud.readOnly = true;
        if (cloud.onError) cloud.onError(e, body === DELETE ? 'delete' : 'write');
      }
    }
    cloud.busy[id] = false;
  }

  function queue(id, body) {
    if (!cloud.db || cloud.readOnly) return;
    cloud.pending[id] = body;
    if (!cloud.busy[id]) flush(id);
  }

  cloud.write = (sc) => queue(sc.id, JSON.parse(JSON.stringify(MP.exportData(sc))));
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
