# Format JSON des scénarios Intrigue

Ce document décrit le fichier `.json` qu'Intrigue exporte et sait importer.
Il sert à trois choses :

- **sauvegarder** un scénario hors du navigateur (les données de l'outil vivent dans le navigateur de l'ordinateur utilisé) ;
- **transmettre** un scénario à un co-auteur ou à un autre ordinateur ;
- **écrire ou générer** un scénario en dehors de l'outil (à la main, dans un tableur converti, ou en le faisant rédiger par une IA), puis l'importer pour le visualiser et le vérifier.

Le modèle complet se trouve dans [`modeles/modele-complet.json`](../modeles/modele-complet.json) :
un petit escape game qui utilise chaque champ et chaque type d'étape. Le plus simple est de le copier et de le modifier.

---

## 1. Importer et exporter

| Action | Comment |
| --- | --- |
| Exporter | Bouton **Exporter** en haut : télécharge le scénario ouvert, par exemple `le-dernier-toast-du-comte.json`. |
| Importer | Bouton **Importer**, ou **glisser-déposer** le fichier `.json` n'importe où sur la page. |
| Scénario déjà présent | Si le fichier porte le même `id` qu'un scénario de la bibliothèque, l'outil demande : **OK** pour le remplacer, **Annuler** pour importer une copie à côté. |

L'import est tolérant. Il corrige ce qu'il peut et affiche la liste des corrections
(référence introuvable retirée, champ inconnu ignoré, type inconnu remplacé…).
Il refuse seulement un fichier inexploitable (JSON mal formé, pas de liste d'étapes,
d'objets, de connaissances ni de personnages, format d'un autre logiciel) avec un message qui explique pourquoi.

---

## 2. Structure générale

```json
{
  "format": "intrigue-scenario",
  "version": 1,
  "id": "sc_mon_scenario",
  "title": "Titre du scénario",
  "type": "murder",
  "players": "6 joueurs",
  "duration": "2 h",
  "synopsis": "Texte lu aux joueurs.",
  "truth": "La vérité, pour le maître du jeu.",
  "characters": [ ... ],
  "items": [ ... ],
  "knowledge": [ ... ],
  "steps": [ ... ],
  "positions": {}
}
```

Le fichier contient **quatre listes** : personnages, objets, connaissances, étapes.
Les étapes font le lien entre tout le reste : elles **exigent** des objets et des connaissances,
et elles en **donnent**.

### Champs du scénario

| Champ | Type | Obligatoire | Rôle |
| --- | --- | --- | --- |
| `format` | texte | non | Toujours `"intrigue-scenario"`. Ajouté à l'export, sert à reconnaître le fichier. |
| `version` | nombre | non | Version du format, actuellement `1`. |
| `exportedAt` | date | non | Date de l'export, ajoutée automatiquement, ignorée à l'import. |
| `id` | texte | non | Identifiant du scénario dans la bibliothèque. Généré s'il manque. |
| `title` | texte | conseillé | Titre. |
| `type` | texte | non | `"murder"` (murder party), `"escape"` (escape game) ou `"chasse"` (chasse au trésor). Par défaut `"murder"`. |
| `players` | texte | non | Nombre de joueurs, en texte libre. |
| `duration` | texte | non | Durée de la partie, en texte libre. |
| `synopsis` | texte | non | Histoire racontée aux joueurs. Imprimée sur chaque fiche personnage. |
| `truth` | texte | non | Solution complète. Imprimée seulement dans le guide du maître du jeu. |
| `characters` | liste | au moins une des quatre listes | Personnages. |
| `items` | liste | | Objets. |
| `knowledge` | liste | | Connaissances. |
| `steps` | liste | | Étapes. |
| `positions` | objet | non | Positions des boîtes déplacées à la main dans le graphe. Voir la partie 8. |

---

## 3. Étape (`steps`)

```json
{
  "id": "s_coffre",
  "title": "Ouvrir le coffre-fort",
  "type": "enigme",
  "act": "Acte 3",
  "location": "Bureau",
  "duration": "10",
  "public": false,
  "who": [],
  "reqSteps": ["s_bureau"],
  "reqItems": [],
  "reqKnow": ["k_date"],
  "giveItems": ["i_lettre"],
  "giveKnow": [],
  "description": "Consigne pour le maître du jeu.",
  "playerText": "Énoncé imprimé pour les joueurs.",
  "solution": "140702",
  "hints": "Premier indice\nDeuxième indice, plus direct"
}
```

| Champ | Type | Rôle |
| --- | --- | --- |
| `id` | texte | Identifiant unique. Conseil : commencer par `s_`. |
| `title` | texte | Nom de l'étape. |
| `type` | texte | `enigme`, `fouille`, `dialogue` (interrogatoire), `revelation`, `action` ou `fin`. Détermine la couleur. Au moins une étape `fin` permet à l'analyse de mesurer le parcours. |
| `act` | texte | Acte ou phase (texte libre, par exemple `"Acte 1"`). |
| `location` | texte | Lieu où se joue l'étape. |
| `duration` | texte | Durée estimée, en minutes. |
| `public` | vrai / faux | Si `true`, les **connaissances** données sont révélées à tous les joueurs (scène collective, annonce). Les objets vont toujours à celui qui réalise l'étape. |
| `who` | liste de personnages | Seuls ces personnages peuvent réaliser l'étape. Liste vide = n'importe quel joueur. |
| `reqSteps` | liste d'étapes | Étapes qui doivent avoir eu lieu avant. |
| `reqItems` | liste d'objets | Objets que le joueur doit avoir en main. |
| `reqKnow` | liste de connaissances | Informations que le joueur doit connaître. |
| `giveItems` | liste d'objets | Objets obtenus en réalisant l'étape. |
| `giveKnow` | liste de connaissances | Informations apprises en réalisant l'étape. |
| `description` | texte | Déroulé pour le maître du jeu. |
| `playerText` | texte | Énoncé pour les joueurs. S'il est rempli, une fiche d'énigme est imprimée. |
| `solution` | texte | Réponse attendue. |
| `hints` | texte | Indices progressifs, **un par ligne** (séparés par `\n`), du plus léger au plus direct. Une liste `["a", "b"]` est aussi acceptée. |

### Règles de logique

- **Tous** les prérequis sont nécessaires (c'est un « ET ») : étapes faites, objets en main **et** connaissances acquises.
- Un **« OU »** s'obtient en faisant donner la même ressource par plusieurs étapes : si deux étapes donnent la clé, l'une ou l'autre suffit.
- Les **objets ne sont jamais consommés** : utiliser une clé ne la fait pas disparaître.
- Un objet peut **passer de main en main** entre joueurs ; une connaissance peut être **racontée** à d'autres (elle est alors copiée).
- Une étape n'est réalisée qu'une fois.

---

## 4. Objet (`items`)

```json
{
  "id": "i_cle_cave",
  "name": "Clé de la cave",
  "description": "Une lourde clé en fer forgé.",
  "location": "Cuisine, sous le tapis",
  "redHerring": false,
  "notes": "Note privée pour le maître du jeu."
}
```

| Champ | Type | Rôle |
| --- | --- | --- |
| `id` | texte | Identifiant unique. Conseil : commencer par `i_`. |
| `name` | texte | Nom, imprimé en gros sur la carte. |
| `description` | texte | Texte de la carte à découper. |
| `location` | texte | Cachette ou emplacement de départ. Sert au tableau « Mise en place du matériel » du guide. |
| `redHerring` | vrai / faux | Fausse piste volontaire : l'analyse ne signalera pas qu'il ne sert à rien. |
| `notes` | texte | Notes privées du maître du jeu. |

Qui possède l'objet au départ se déclare **dans le personnage** (`startItems`), et
quelle étape le donne **dans l'étape** (`giveItems`).

---

## 5. Connaissance (`knowledge`)

Information, indice, code, témoignage, secret.

```json
{
  "id": "k_date",
  "name": "Date du mariage : 14 juillet 1902",
  "description": "Votre oncle répétait que c'était le plus beau jour de sa vie.",
  "redHerring": false,
  "notes": ""
}
```

| Champ | Type | Rôle |
| --- | --- | --- |
| `id` | texte | Identifiant unique. Conseil : commencer par `k_`. |
| `name` | texte | Résumé court, affiché dans le graphe. |
| `description` | texte | Texte complet, imprimé sur la fiche du personnage (connaissance de départ) ou sur une carte indice. |
| `redHerring` | vrai / faux | Fausse piste volontaire. |
| `notes` | texte | Notes privées du maître du jeu. |

---

## 6. Personnage (`characters`)

```json
{
  "id": "c_victor",
  "name": "Victor Maréchal",
  "role": "Le majordome",
  "player": true,
  "color": "#ea580c",
  "description": "Présentation lue par le joueur.",
  "secret": "Ce que le personnage cache.",
  "objectives": "Premier objectif\nDeuxième objectif",
  "startItems": ["i_cle_cave"],
  "startKnow": ["k_cave21h"],
  "relations": [
    { "to": "c_camille", "label": "Affection paternelle" }
  ]
}
```

| Champ | Type | Rôle |
| --- | --- | --- |
| `id` | texte | Identifiant unique. Conseil : commencer par `c_`. |
| `name` | texte | Nom complet. |
| `role` | texte | Fonction dans l'histoire (« Le majordome »). |
| `player` | vrai / faux | `true` si un joueur l'incarne. `false` pour la victime ou un personnage joué par le maître du jeu : il n'a pas de fiche imprimée par défaut et ne participe pas à la simulation. Par défaut `true`. |
| `color` | texte | Couleur au format `#rrggbb`. Attribuée automatiquement si absente. |
| `description` | texte | Présentation. |
| `secret` | texte | Secret du personnage. |
| `objectives` | texte | Objectifs, **un par ligne**. Une liste est aussi acceptée. |
| `startItems` | liste d'objets | Objets en sa possession au début. |
| `startKnow` | liste de connaissances | Ce qu'il sait au début. |
| `relations` | liste | Ce que ce personnage pense des autres. Chaque relation : `to` (le personnage visé) et `label` (texte libre). Une relation va dans un seul sens ; pour une relation réciproque, la déclarer chez les deux. |

---

## 7. Identifiants et références

Chaque élément a un `id`. Les champs de type « liste de… » contiennent des `id`.

- Un `id` doit être **unique dans tout le fichier**, toutes listes confondues.
- Les préfixes `s_`, `i_`, `k_`, `c_` ne sont pas obligatoires mais rendent le fichier lisible.
- Si un élément n'a pas d'`id`, l'import en crée un.
- **À l'import, une référence peut aussi être le nom exact** de l'élément (sans tenir compte des majuscules) :
  `"reqItems": ["Clé de la cave"]` fonctionne comme `"reqItems": ["i_cle_cave"]`.
  Pratique pour écrire à la main ; l'export réécrit toujours les `id`.
- Une liste d'un seul élément peut s'écrire comme simple texte : `"giveItems": "Carte"`.
- Une référence introuvable est retirée et signalée.

---

## 8. Positions dans le graphe

`positions` mémorise les boîtes déplacées à la main, pour chaque mode d'affichage :

```json
"positions": {
  "compact":  { "s_coffre": { "x": 640, "y": 120 } },
  "detailed": {}
}
```

Ce champ est facultatif. S'il est vide ou absent, l'outil calcule la disposition tout seul.
Le bouton **Réorganiser** efface les positions du mode affiché.

---

## 9. Commentaires

Le JSON n'accepte pas de commentaires. Tout champ dont le nom commence par un tiret bas
(`"_aide"`, `"_note"`…) est **ignoré** à l'import : on peut s'en servir comme commentaire,
à n'importe quel niveau. Les autres champs inconnus sont ignorés et signalés.

---

## 10. Exemple minimal

Le plus petit scénario utile : deux étapes et un objet, références par nom.

```json
{
  "title": "Chasse au trésor du jardin",
  "type": "chasse",
  "items": [
    { "name": "Carte au trésor" }
  ],
  "steps": [
    { "title": "Trouver la carte sous le banc", "type": "fouille", "giveItems": ["Carte au trésor"] },
    { "title": "Déterrer le coffre", "type": "fin", "reqItems": ["Carte au trésor"] }
  ]
}
```

---

## 11. Faire rédiger un scénario par une IA

On peut demander à un assistant IA d'écrire le fichier, puis l'importer pour le vérifier
dans l'onglet **Analyse**. Exemple de consigne :

> Écris un scénario de murder party au format JSON Intrigue, en suivant exactement la structure
> du fichier modèle ci-joint (`modele-complet.json`). 6 personnages joueurs et une victime,
> 15 à 20 étapes réparties en 3 actes, au moins 3 fausses pistes marquées `redHerring: true`.
> Chaque indice décisif doit exiger que deux joueurs mettent en commun ce qu'ils savent.
> Utilise des identifiants lisibles (`s_`, `i_`, `k_`, `c_`). Réponds uniquement avec le JSON.

Après import, l'onglet **Analyse** indique les étapes impossibles à atteindre, les objets
sans source ou inutilisés, et les étapes qui obligent les joueurs à coopérer.

---

## 12. Vérifier le format

Depuis le dossier du projet, avec Node.js installé :

```
node tests/import-export.test.js
```

Le test importe le modèle complet, fait un aller-retour export puis import de l'exemple,
et vérifie les corrections et les refus de l'import.
