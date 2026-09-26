# Intrigue, atelier de scénarios

Outil web pour concevoir des **murder parties**, **escape games** et **chasses au trésor**.
Il fonctionne entièrement dans le navigateur : aucun serveur, aucune installation.

## Démarrer

- **En ligne** : https://claude.ai/artifact/XgfZbSy34VprYpuSUg2J2F (privé, à partager depuis le menu Partager de la page).
- **En local** : ouvrir `index.html` dans un navigateur (double-clic suffit).

Pour republier après une modification : `python3 tools/build-artifact.py <sortie>.html`,
puis publier ce fichier avec les dossiers `css/` et `js/` à côté.
En ligne, l'impression passe par le bouton « Télécharger pour imprimer », qui enregistre
un fichier HTML ouvrant la fenêtre d'impression. Un scénario d'exemple, *Le dernier toast du comte*, est chargé au premier lancement.

Les scénarios sont enregistrés automatiquement dans le navigateur. Utilisez **Exporter**
pour obtenir un fichier `.json` (sauvegarde, envoi à un co-auteur) et **Importer**, ou un
glisser-déposer du fichier sur la page, pour le recharger.

## Format JSON

- [`docs/FORMAT-JSON.md`](docs/FORMAT-JSON.md) : description de chaque champ, règles de logique,
  exemple minimal, conseils pour écrire ou faire générer un scénario.
- [`modeles/modele-complet.json`](modeles/modele-complet.json) : modèle qui utilise tous les champs,
  prêt à être copié, modifié et importé.
- `node tests/import-export.test.js` vérifie le format.

## Le modèle

- **Étapes** : énigme, fouille, interrogatoire, révélation, action, fin. Chaque étape a des
  *prérequis* (étapes terminées, objets possédés, connaissances acquises) et *donne* des objets
  et des connaissances. Elle peut être réservée à certains personnages, ou être *publique*
  (ses connaissances sont révélées à tous).
- **Objets** : physiques, ils se donnent d'un joueur à l'autre et ne sont jamais consommés.
- **Connaissances** : informations, indices, codes. Elles se partagent.
- **Personnages** : présentation, secret, objectifs, objets et connaissances de départ, relations.

## Les vues

| Vue | Rôle |
| --- | --- |
| Graphe | Enchaînement des étapes. *Compact* : liens étiquetés par l'objet ou l'information transmise. *Détaillé* : objets, connaissances et personnages comme nœuds. Cliquer un nœud met en évidence tout ce qui mène à lui et en découle. |
| Simulation | Jouer le scénario pas à pas, par joueur ou en équipe, avec échanges d'objets et d'informations. |
| Relations | Carte des relations entre personnages. |
| Ressources | D'où vient et où sert chaque objet et connaissance. |
| Analyse | Étapes inatteignables, objets sans source ou inutilisés, étapes qui exigent une coopération, autonomie de chaque personnage, déroulé au plus court par vagues. |
| Impression | Fiches personnages, cartes objets et indices à découper, fiches d'énigmes, guide du maître du jeu. |

## Structure

```
index.html
docs/FORMAT-JSON.md
modeles/modele-complet.json
tests/import-export.test.js
tools/build-artifact.py
css/style.css
js/model.js     modèle de données et stockage local
js/example.js   scénario d'exemple
js/engine.js    vérifications et simulation
js/io.js        import et export JSON
js/platform.js  boîtes de dialogue, téléchargement, impression (local ou en ligne)
js/graph.js     mise en page et rendu du graphe
js/editor.js    formulaires d'édition
js/views.js     relations, ressources, analyse, simulation, impression
js/app.js       application
```
