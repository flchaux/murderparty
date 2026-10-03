# Intrigue : consignes pour Claude

Outil web de conception de murder parties, escape games et chasses au trésor.
Le propriétaire est le maire de Veauche ; il n'est pas développeur. Lui répondre en français simple,
sans jargon technique, et sans tirets cadratins.

## Travailler sur un scénario en ligne

La page publiée est https://claude.ai/artifact/XgfZbSy34VprYpuSUg2J2F.
Ses scénarios vivent dans sa base de données : collection `scenarios`, un document par scénario,
`doc_id` = identifiant du scénario, contenu = export Intrigue (voir `docs/FORMAT-JSON.md`).
La page ouverte se met à jour toute seule quand un document change : rien à importer.

Pour créer ou modifier un scénario quand on le demande :

1. Lire l'existant avec l'outil `ArtifactData` (`list` ou `get` sur `scenarios`, avec `out_dir`
   pour obtenir des fichiers JSON).
2. Écrire ou modifier le fichier JSON localement (références par nom permises).
3. Lancer `node tools/preparer-en-ligne.js <fichier.json>` : corrections, analyse logique
   (étapes inatteignables, objets sans source…) et fichier normalisé `*.en-ligne.json`
   avec `updatedAt` à l'heure actuelle. Corriger jusqu'à zéro erreur.
4. Envoyer avec `ArtifactData` `set`, `file_path` = le fichier préparé, `if_version` = la version lue
   (à omettre pour un nouveau scénario).

`updatedAt` doit toujours être plus récent que la version en ligne, sinon la page ignore le changement.
Ne jamais supprimer un scénario sans confirmation.

## Publier une nouvelle version de la page

`python3 tools/build-artifact.py <dossier>/index.html`, copier `css/` et `js/` à côté,
publier sur la même URL avec ces fichiers et `capabilities: {db: {}, downloads: {}}`.

## Tests

`node tests/import-export.test.js` et `node tests/mcp.test.js`.
