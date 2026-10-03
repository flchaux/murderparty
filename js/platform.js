/*
 * Adaptation à l'environnement : fenêtres de dialogue dans la page (les alert/confirm/prompt
 * du navigateur sont bloqués quand l'outil est publié sur claude.ai), téléchargement et impression.
 */
(function () {
  const MP = (window.MP = window.MP || {});

  /* Vrai quand la page tourne comme artifact publié sur claude.ai. */
  MP.isHosted = function () {
    return !!(window.claude && typeof window.claude.use === 'function');
  };

  /*
   * Boîte de dialogue dans la page. Renvoie une promesse :
   * - avec `input` : le texte saisi, ou null si annulé ;
   * - sinon : true (bouton principal) ou false (annuler, Échap, clic à côté).
   */
  MP.dialog = function (opts) {
    return new Promise((resolve) => {
      const back = document.createElement('div');
      back.className = 'modal-back';
      const box = document.createElement('div');
      box.className = 'modal';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      if (opts.title) {
        const t = document.createElement('h2');
        t.textContent = opts.title;
        box.appendChild(t);
      }
      if (opts.message) {
        const p = document.createElement('p');
        p.textContent = opts.message;
        box.appendChild(p);
      }
      if (opts.list && opts.list.length) {
        const ul = document.createElement('ul');
        opts.list.forEach((x) => { const li = document.createElement('li'); li.textContent = x; ul.appendChild(li); });
        box.appendChild(ul);
      }
      let input = null;
      if (opts.input) {
        input = document.createElement('input');
        input.type = opts.password ? 'password' : 'text';
        input.id = 'modal-input';
        input.value = opts.defaultValue || '';
        box.appendChild(input);
      }
      const bar = document.createElement('div');
      bar.className = 'modal-actions';
      const done = (val) => {
        document.removeEventListener('keydown', onKey, true);
        back.remove();
        resolve(val);
      };
      const cancelVal = opts.input ? null : false;
      if (opts.cancelLabel !== false) {
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = opts.cancelLabel || 'Annuler';
        cancel.addEventListener('click', () => done(cancelVal));
        bar.appendChild(cancel);
      }
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = opts.danger ? 'danger-solid' : 'primary';
      ok.textContent = opts.okLabel || 'OK';
      const confirmNow = () => {
        if (input) {
          const v = input.value.trim();
          if (!v) { input.focus(); return; }
          done(v);
        } else done(true);
      };
      ok.addEventListener('click', confirmNow);
      bar.appendChild(ok);
      box.appendChild(bar);
      back.appendChild(box);
      back.addEventListener('mousedown', (e) => { if (e.target === back) done(cancelVal); });
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(cancelVal); }
        if (e.key === 'Enter' && (input ? e.target === input : true)) { e.preventDefault(); confirmNow(); }
      };
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(back);
      (input || ok).focus();
      if (input) input.select();
    });
  };

  MP.notify = function (title, message, list) {
    return MP.dialog({ title, message, list, cancelLabel: false });
  };

  /* Propose un fichier à enregistrer. En ligne, le visiteur confirme l'enregistrement. */
  MP.saveFile = async function (filename, text, mime) {
    if (MP.isHosted()) {
      let downloads = null;
      try { downloads = await window.claude.use('downloads'); } catch (e) { downloads = null; }
      if (!downloads) {
        MP.notify('Téléchargement indisponible', 'Cette page ne peut pas proposer de fichier ici. Ouvrez l\'outil dans un navigateur, ou utilisez la version locale.');
        return false;
      }
      try {
        await downloads.save({ filename, data: text });
        return true;
      } catch (e) {
        if (e && (e.code === 'declined' || e.code === 'rate_limited')) return false;
        MP.notify('Téléchargement impossible', (e && e.message) || 'Le fichier n\'a pas pu être proposé.');
        return false;
      }
    }
    const blob = new Blob([text], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return true;
  };

  /*
   * Impression. En local : la boîte d'impression du navigateur.
   * En ligne (impression bloquée) : un fichier HTML autonome qui s'imprime à l'ouverture.
   */
  MP.printPages = async function (title, pagesHtml) {
    if (!MP.isHosted()) { window.print(); return; }
    let css = '';
    try { css = await (await fetch('css/style.css')).text(); } catch (e) { css = ''; }
    const doc = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + MP.escape(title) + '</title>' +
      '<style>' + css + '\nbody{background:#fff}#print-area{display:flex;flex-direction:column;align-items:center;gap:18px;padding:18px 0}' +
      '@media print{#print-area{display:block;padding:0}}</style></head><body data-view="print">' +
      '<div id="print-area">' + pagesHtml + '</div>' +
      '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},300)});<\/script></body></html>';
    const name = MP.exportFileName({ title }).replace(/\.json$/, '') + '-a-imprimer.html';
    const saved = await MP.saveFile(name, doc, 'text/html');
    if (saved) MP.notify('Fichier à imprimer enregistré', 'Ouvrez « ' + name + ' » dans votre navigateur : la fenêtre d\'impression s\'ouvre automatiquement (choisissez A4, marges : aucune).');
  };
})();
