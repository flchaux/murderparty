# Installer Intrigue sur un serveur et le relier à Claude

Une fois installé :

- l'outil s'ouvre à votre adresse, avec un mot de passe ;
- les scénarios sont enregistrés sur le serveur, et vous les retrouvez sur tous vos appareils ;
- Claude, sur claude.ai ou sur l'application mobile, crée et modifie les scénarios ;
- une page ouverte se met à jour toute seule.

Il faut un serveur Linux avec **Node.js 18 ou plus**, **nginx**, et un nom de domaine qui pointe
vers le serveur. Dans les commandes ci-dessous, remplacez `intrigue.example.fr` par votre adresse.

## 1. Installer le programme

```
sudo apt install -y nodejs nginx certbot python3-certbot-nginx   # si ce n'est pas déjà fait
node --version                                                    # doit afficher v18 ou plus
sudo git clone https://github.com/flchaux/murderparty.git /opt/intrigue
sudo useradd --system --home /var/lib/intrigue intrigue
sudo mkdir -p /var/lib/intrigue && sudo chown intrigue: /var/lib/intrigue
```

## 2. Régler le mot de passe et l'adresse

```
sudo cp /opt/intrigue/serveur/intrigue.env.exemple /etc/intrigue.env
sudo chmod 600 /etc/intrigue.env
sudo nano /etc/intrigue.env      # mot de passe et adresse publique
```

## 3. Démarrer le service

```
sudo cp /opt/intrigue/serveur/intrigue.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now intrigue
sudo systemctl status intrigue
```

## 4. Brancher nginx et le https

```
sudo cp /opt/intrigue/serveur/nginx.conf.exemple /etc/nginx/sites-available/intrigue
sudo nano /etc/nginx/sites-available/intrigue      # mettre votre adresse
sudo ln -s /etc/nginx/sites-available/intrigue /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d intrigue.example.fr
```

Si nginx servait déjà les fichiers de l'outil à cette adresse, remplacez l'ancien bloc par celui-ci :
c'est désormais le programme Intrigue qui sert la page.

Ouvrez votre adresse : l'outil demande le mot de passe, puis affiche « ● Enregistré sur le serveur ».
Les scénarios déjà créés dans ce navigateur sont copiés sur le serveur à la première connexion.

## 5. Relier Claude

Récupérez l'adresse du connecteur :

```
sudo journalctl -u intrigue | grep connecteur
```

Elle ressemble à `https://intrigue.example.fr/mcp/XXXXXXXX`. Puis, sur claude.ai :
**Paramètres > Connecteurs > Ajouter un connecteur personnalisé**, nom « Intrigue », coller l'adresse.

Dans une conversation, activez le connecteur Intrigue (menu des outils), puis demandez par exemple :
« Crée une murder party pour 8 joueurs dans un château en 1925, et vérifie-la. »

**Cette adresse est une clé** : quiconque la connaît peut modifier vos scénarios. Ne la partagez pas.
Pour en changer, supprimez la ligne `mcpToken` de `/var/lib/intrigue/.secrets.json`, redémarrez
(`sudo systemctl restart intrigue`) et remplacez l'adresse dans claude.ai.

## Mettre à jour

```
cd /opt/intrigue && sudo git pull && sudo systemctl restart intrigue
```

## Sauvegarder

Tous les scénarios sont dans `/var/lib/intrigue`, un fichier `.json` par scénario.
Copier ce dossier suffit.
