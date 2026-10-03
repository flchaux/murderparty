# Piloter Intrigue depuis Claude (serveur MCP)

Le serveur MCP permet de **commander un scénario à Claude** : il l'écrit, le complète,
le corrige et le vérifie, puis le scénario s'ouvre dans l'outil web avec le bouton **Importer**.

Il suffit de Node.js (version 18 ou plus). Aucune installation de paquet.

## Ce que Claude peut faire

| Outil | Rôle |
| --- | --- |
| `lister_scenarios` | Liste les scénarios enregistrés. |
| `lire_scenario` | Résumé lisible (avec les identifiants) ou JSON complet. |
| `creer_scenario` | Crée un scénario vide (titre, type, joueurs, durée, synopsis, vérité). |
| `ecrire_scenario` | Enregistre d'un coup un scénario complet au format JSON, puis l'analyse. |
| `modifier_scenario` | Change les informations générales. |
| `ajouter_elements` | Ajoute personnages, objets, connaissances et étapes, références par nom permises. |
| `modifier_element` | Modifie un élément. |
| `supprimer_element` | Supprime un élément et toutes les références vers lui. |
| `analyser_scenario` | Étapes inatteignables, objets sans source ou inutilisés, déroulé au plus court, coopération, autonomie de chaque personnage. |
| `supprimer_scenario` | Supprime un scénario. |
| `aide_format` | Documentation du format (et, sur demande, le modèle complet). |

Les scénarios sont des fichiers `.json` au format d'export d'Intrigue, rangés dans le dossier
`scenarios/` du projet. Pour un autre dossier, définir la variable d'environnement `INTRIGUE_DIR`.

## Brancher le serveur

### Claude Code

Dans ce dépôt, rien à faire : le fichier `.mcp.json` déclare le serveur `intrigue`,
Claude Code propose de l'activer à l'ouverture du projet.

Depuis un autre dossier :

```
claude mcp add intrigue -- node /chemin/vers/murderparty/mcp/server.js
```

### Claude Desktop

Menu **Réglages > Développeur > Modifier la configuration**, puis ajouter dans
`claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "intrigue": {
      "command": "node",
      "args": ["/chemin/vers/murderparty/mcp/server.js"],
      "env": { "INTRIGUE_DIR": "/chemin/vers/Documents/Intrigue" }
    }
  }
}
```

Sous Windows, écrire les chemins avec des doubles barres obliques inverses
(`"C:\\Users\\moi\\murderparty\\mcp\\server.js"`). Redémarrer Claude Desktop :
les outils Intrigue apparaissent dans le menu des connecteurs.

## Exemples de commandes

> Écris une murder party pour 8 joueurs dans un château bourguignon en 1925, 2 h 30,
> 3 actes, 20 étapes, au moins 3 fausses pistes. Chaque indice décisif doit obliger deux joueurs
> à mettre en commun ce qu'ils savent. Vérifie-la avec l'analyse et corrige jusqu'à zéro erreur.

> Dans « Le dernier toast du comte », ajoute un personnage de notaire qui détient le testament,
> et une étape où il le lit publiquement à l'acte 3.

> Analyse la chasse au trésor du jardin : quel enfant peut avancer seul, lequel est bloqué ?

## Vérifier

```
node tests/mcp.test.js
```
