/* Moteur logique : accessibilité des étapes, vérifications, simulation. */
(function () {
  const MP = (window.MP = window.MP || {});

  /* Qui produit, qui consomme, qui possède au départ chaque objet ou connaissance. */
  MP.index = function (sc) {
    const producers = {};
    const consumers = {};
    const holders = {};
    const add = (map, key, val) => { (map[key] = map[key] || []).push(val); };
    for (const s of sc.steps) {
      for (const r of s.giveItems.concat(s.giveKnow)) add(producers, r, s.id);
      for (const r of s.reqItems.concat(s.reqKnow)) add(consumers, r, s.id);
    }
    for (const c of sc.characters) {
      for (const r of c.startItems.concat(c.startKnow)) add(holders, r, c.id);
    }
    return { producers, consumers, holders };
  };

  MP.missingFor = function (step, done, items, know) {
    return []
      .concat(step.reqSteps.filter((x) => !done.has(x)))
      .concat(step.reqItems.filter((x) => !items.has(x)))
      .concat(step.reqKnow.filter((x) => !know.has(x)));
  };

  /*
   * Point fixe : on réalise toutes les étapes possibles jusqu'à ce que plus rien ne bouge.
   * Chaque « vague » regroupe les étapes réalisables en parallèle.
   * actorId restreint aux étapes que ce personnage a le droit de faire (champ « qui »).
   */
  MP.fixpoint = function (sc, startItems, startKnow, actorId) {
    const done = new Set();
    const items = new Set(startItems);
    const know = new Set(startKnow);
    const wave = {};
    let round = 0;
    for (;;) {
      const batch = sc.steps.filter((s) =>
        !done.has(s.id) &&
        (!actorId || !s.who.length || s.who.includes(actorId)) &&
        MP.missingFor(s, done, items, know).length === 0);
      if (!batch.length) break;
      round += 1;
      for (const s of batch) {
        done.add(s.id);
        wave[s.id] = round;
        s.giveItems.forEach((x) => items.add(x));
        s.giveKnow.forEach((x) => know.add(x));
      }
    }
    return { done, items, know, wave, rounds: round };
  };

  const allStart = (sc, field) => sc.characters.reduce((acc, c) => acc.concat(c[field]), []);

  MP.analyze = function (sc) {
    const idx = MP.index(sc);
    const issues = [];
    const push = (level, msg, ref) => issues.push({ level, msg, ref });
    const name = (id) => MP.nameOf(sc, id);

    const pooled = MP.fixpoint(sc, allStart(sc, 'startItems'), allStart(sc, 'startKnow'));

    // Étapes inatteignables, avec la raison.
    for (const s of sc.steps) {
      if (pooled.done.has(s.id)) continue;
      const missing = MP.missingFor(s, pooled.done, pooled.items, pooled.know);
      const why = missing.length ? 'il manque : ' + missing.map(name).join(', ') : 'restriction « qui peut la faire »';
      push('error', `Étape inatteignable, ${why}.`, s.id);
    }

    // Ressources sans source, inutilisées, orphelines.
    for (const [kind, list] of [['items', sc.items], ['knowledge', sc.knowledge]]) {
      const noun = kind === 'items' ? 'Objet' : 'Connaissance';
      const e = kind === 'items' ? '' : 'e';
      for (const r of list) {
        const prod = idx.producers[r.id] || [];
        const cons = idx.consumers[r.id] || [];
        const hold = idx.holders[r.id] || [];
        if (cons.length && !prod.length && !hold.length) {
          push('error', `${noun} nécessaire mais jamais obtenu${e} (aucune étape ne le donne, personne ne l'a au départ).`, r.id);
        } else if (!cons.length && prod.length && !r.redHerring) {
          push('warning', `${noun} obtenu${e} mais jamais utilisé${e}. Cochez « fausse piste » si c'est voulu.`, r.id);
        } else if (!cons.length && !prod.length && !hold.length) {
          push('warning', `${noun} ${e ? 'orpheline' : 'orphelin'} : ni obtenu${e}, ni détenu${e}, ni utilisé${e}.`, r.id);
        }
        if (prod.length && hold.length) {
          push('info', `${noun} détenu${e} dès le départ par ${hold.map(name).join(', ')} et aussi donné${e} par une étape.`, r.id);
        }
        if (prod.length > 1) {
          push('info', `${noun} donné${e} par plusieurs étapes (${prod.map(name).join(', ')}).`, r.id);
        }
      }
    }

    // Structure du scénario.
    const endings = sc.steps.filter((s) => s.type === 'fin');
    if (sc.steps.length && !endings.length) push('warning', "Aucune étape de type « Fin » : l'outil ne peut pas mesurer la durée du parcours.", null);
    for (const s of sc.steps) {
      if (s.type === 'enigme' && !s.solution) push('warning', 'Énigme sans solution renseignée.', s.id);
      if (s.type === 'enigme' && !s.playerText) push('info', "Énigme sans énoncé pour les joueurs : rien à imprimer.", s.id);
      if (s.reqSteps.includes(s.id)) push('error', 'Étape qui dépend d\'elle-même.', s.id);
      const own = s.giveItems.concat(s.giveKnow).filter((r) => s.reqItems.includes(r) || s.reqKnow.includes(r));
      if (own.length) push('warning', `Étape qui donne ce qu'elle exige déjà : ${own.map(name).join(', ')}.`, s.id);
      for (const w of s.who) {
        const c = sc.characters.find((x) => x.id === w);
        if (c && !c.player) push('warning', `Réservée à ${c.name}, qui n'est pas joué par un joueur.`, s.id);
      }
    }
    if (sc.type === 'murder') {
      for (const c of sc.characters.filter((x) => x.player)) {
        if (!c.secret) push('info', 'Personnage sans secret.', c.id);
        if (!c.objectives) push('info', 'Personnage sans objectif.', c.id);
      }
    }

    // Ce que chaque personnage peut faire seul, et ce qui exige une coopération.
    const alone = {};
    const aloneUnion = new Set();
    for (const c of sc.characters.filter((x) => x.player)) {
      const r = MP.fixpoint(sc, c.startItems, c.startKnow, c.id);
      alone[c.id] = r.done;
      r.done.forEach((x) => aloneUnion.add(x));
    }
    const coop = sc.steps.filter((s) => pooled.done.has(s.id) && !aloneUnion.has(s.id)).map((s) => s.id);

    // Ascendance de chaque fin : les étapes qui y contribuent.
    const contributes = new Set();
    const graph = MP.dependencyEdges(sc);
    const preds = {};
    for (const e of graph) (preds[e.to] = preds[e.to] || []).push(e.from);
    const stack = endings.map((s) => s.id);
    while (stack.length) {
      const id = stack.pop();
      if (contributes.has(id)) continue;
      contributes.add(id);
      (preds[id] || []).forEach((p) => stack.push(p));
    }
    for (const s of sc.steps) {
      if (endings.length && !contributes.has(s.id) && pooled.done.has(s.id)) {
        push('info', "Étape qui ne mène à aucune fin (impasse ou fausse piste).", s.id);
      }
    }

    const order = { error: 0, warning: 1, info: 2 };
    issues.sort((a, b) => order[a.level] - order[b.level]);

    const endingWaves = endings.filter((s) => pooled.wave[s.id]).map((s) => pooled.wave[s.id]);
    return {
      issues, idx, pooled, alone, coop,
      contributes,
      minWaves: endingWaves.length ? Math.min(...endingWaves) : null,
      counts: {
        error: issues.filter((i) => i.level === 'error').length,
        warning: issues.filter((i) => i.level === 'warning').length,
        info: issues.filter((i) => i.level === 'info').length,
      },
    };
  };

  /* Liens étape → étape : prérequis directs, et étape qui fournit une ressource à une autre. */
  MP.dependencyEdges = function (sc) {
    const idx = MP.index(sc);
    const map = new Map();
    const add = (from, to, kind, res) => {
      const key = from + '>' + to;
      if (!map.has(key)) map.set(key, { from, to, kinds: new Set(), res: [] });
      const e = map.get(key);
      e.kinds.add(kind);
      if (res) e.res.push(res);
    };
    for (const s of sc.steps) {
      for (const p of s.reqSteps) add(p, s.id, 'step');
      for (const r of s.reqItems) (idx.producers[r] || []).forEach((p) => add(p, s.id, 'item', r));
      for (const r of s.reqKnow) (idx.producers[r] || []).forEach((p) => add(p, s.id, 'know', r));
    }
    return Array.from(map.values());
  };

  /* ---------------- Simulation ---------------- */
  const TEAM = '__team';

  MP.Simulation = class {
    constructor(sc, mode) {
      this.sc = sc;
      this.mode = mode || (sc.type === 'murder' && sc.characters.some((c) => c.player) ? 'individual' : 'team');
      this.reset();
    }

    get actors() {
      if (this.mode === 'team') return [{ id: TEAM, name: 'Équipe', color: '#475569' }];
      return this.sc.characters.filter((c) => c.player);
    }

    reset() {
      this.done = [];
      this.log = [];
      this.history = [];
      this.inv = {};
      if (this.mode === 'team') {
        this.inv[TEAM] = { items: allStart(this.sc, 'startItems'), know: allStart(this.sc, 'startKnow') };
      } else {
        for (const c of this.sc.characters.filter((x) => x.player)) {
          this.inv[c.id] = { items: c.startItems.slice(), know: c.startKnow.slice() };
        }
      }
      for (const a of Object.keys(this.inv)) this.dedupe(a);
    }

    dedupe(a) {
      this.inv[a].items = Array.from(new Set(this.inv[a].items));
      this.inv[a].know = Array.from(new Set(this.inv[a].know));
    }

    snapshot() {
      this.history.push(JSON.stringify({ done: this.done, inv: this.inv, log: this.log }));
    }

    undo() {
      const prev = this.history.pop();
      if (!prev) return;
      const s = JSON.parse(prev);
      this.done = s.done; this.inv = s.inv; this.log = s.log;
    }

    step(id) { return this.sc.steps.find((s) => s.id === id); }

    /* Pour qui une étape est-elle faisable maintenant ? */
    whoCan(step) {
      if (this.done.includes(step.id)) return [];
      const done = new Set(this.done);
      return this.actors.filter((a) => {
        if (this.mode !== 'team' && step.who.length && !step.who.includes(a.id)) return false;
        const inv = this.inv[a.id];
        return MP.missingFor(step, done, new Set(inv.items), new Set(inv.know)).length === 0;
      }).map((a) => a.id);
    }

    status(id) {
      const s = this.step(id);
      if (!s) return 'locked';
      if (this.done.includes(id)) return 'done';
      return this.whoCan(s).length ? 'available' : 'locked';
    }

    /* Ce qu'il manque globalement (toutes les possessions réunies) pour une étape. */
    missingGlobal(step) {
      const items = new Set(); const know = new Set();
      for (const inv of Object.values(this.inv)) { inv.items.forEach((x) => items.add(x)); inv.know.forEach((x) => know.add(x)); }
      return MP.missingFor(step, new Set(this.done), items, know);
    }

    perform(stepId, actorId) {
      const s = this.step(stepId);
      if (!s || !this.whoCan(s).includes(actorId)) return false;
      this.snapshot();
      this.done.push(stepId);
      // Les objets vont à celui qui agit ; une étape publique révèle ses connaissances à tous.
      this.inv[actorId].items.push(...s.giveItems);
      const targets = s.public ? Object.keys(this.inv) : [actorId];
      for (const t of targets) {
        this.inv[t].know.push(...s.giveKnow);
        this.dedupe(t);
      }
      this.dedupe(actorId);
      this.log.push({ text: `${this.actorName(actorId)} : ${s.title}`, step: stepId });
      return true;
    }

    give(itemId, from, to) {
      if (!this.inv[from] || !this.inv[to] || !this.inv[from].items.includes(itemId)) return;
      this.snapshot();
      this.inv[from].items = this.inv[from].items.filter((x) => x !== itemId);
      this.inv[to].items.push(itemId);
      this.dedupe(to);
      this.log.push({ text: `${this.actorName(from)} donne « ${MP.nameOf(this.sc, itemId)} » à ${this.actorName(to)}` });
    }

    share(knowId, from, to) {
      if (!this.inv[from] || !this.inv[from].know.includes(knowId)) return;
      const targets = to === '*' ? Object.keys(this.inv).filter((x) => x !== from) : [to];
      this.snapshot();
      for (const t of targets) { this.inv[t].know.push(knowId); this.dedupe(t); }
      this.log.push({ text: `${this.actorName(from)} révèle « ${MP.nameOf(this.sc, knowId)} » à ${to === '*' ? 'tout le monde' : this.actorName(to)}` });
    }

    actorName(id) {
      if (id === TEAM) return 'Équipe';
      return MP.nameOf(this.sc, id);
    }

    /* Réalise automatiquement tout ce qui est possible (utile pour avancer vite). */
    autoplay() {
      let progressed = true;
      while (progressed) {
        progressed = false;
        for (const s of this.sc.steps) {
          const who = this.whoCan(s);
          if (who.length) { this.perform(s.id, who[0]); progressed = true; }
        }
      }
    }
  };

  MP.Simulation.TEAM = TEAM;
})();
