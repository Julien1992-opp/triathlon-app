# Plan triathlon Olympic Lausanne 2026

Application web locale destinée à un couple d'amateurs confirmés préparant
le triathlon de Lausanne, format Olympic, le 30 août 2026. Elle génère et
suit deux plans d'entraînement individualisés sur quinze semaines, du
18 mai au 30 août 2026.

## Objectif

Fournir un outil simple, mobile first, utilisable sur téléphone pendant
les séances, pour planifier l'entraînement, calculer des allures cibles
à partir des chronos réels saisis, suivre la réalisation des séances et
disposer de repères généraux sur la nutrition.

## Périmètre fonctionnel

- Deux profils athlètes avec chronos de référence par discipline.
- Plan en quatre phases jusqu'au 30 août 2026 : développement,
  spécifique, affûtage, semaine de course.
- Quatre séances par semaine et par athlète. Une séance combinée vélo
  puis course compte pour deux séances.
- Vue par semaine, détail de chaque séance, statut de réalisation.
- Indicateurs de progression simples.
- Module nutrition strictement informatif, avec rappel visuel quotidien.
- Avatar personnalisable par athlète : personnage SVG par défaut,
  initiale colorée en repli, ou photo personnelle importée depuis un
  fichier local. La photo est redimensionnée localement en carré
  256 par 256 pixels avant stockage.

## Stack technique

- HTML, CSS et JavaScript vanilla.
- Aucune dépendance externe, aucun backend, aucune bibliothèque.
- Persistance dans le localStorage du navigateur.
- Export et import des données au format JSON depuis l'écran Profil.
- Traitement d'image local par canvas pour les avatars photo,
  sans envoi distant et sans bibliothèque tierce.

## Lancement

**Important.** L'application doit toujours s'ouvrir via une adresse
http, jamais par double clic sur `index.html`. En ouverture directe
(protocole `file://`), le navigateur traite le stockage local de
manière inhabituelle (partagé entre tous les fichiers locaux, parfois
vidé sans prévenir, voire bloqué), et la persistance des données
ne serait pas fiable.

Pour lancer l'application dans de bonnes conditions, on passe par un
petit serveur web local. Un script prêt à l'emploi est fourni dans le
dossier du projet : `serveur.ps1`.

### Démarrer le serveur local

1. Ouvrir une console **PowerShell**.
2. Se placer dans le dossier du projet :

   ```powershell
   cd C:\dev\triathlon-app
   ```

3. Lancer le serveur :

   ```powershell
   .\serveur.ps1
   ```

4. La console affiche `Serveur local actif` et l'URL à utiliser.

5. Ouvrir cette adresse dans un navigateur récent :

   ```
   http://localhost:8765/
   ```

### En cas d'erreur de politique d'exécution

Si Windows refuse d'exécuter le script avec un message du type
`Impossible de charger le fichier serveur.ps1, l'exécution de scripts
est désactivée sur ce système`, utiliser la variante :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\serveur.ps1
```

Cette commande contourne la politique uniquement pour cette session,
sans modifier les paramètres globaux de la machine.

### Arrêter le serveur

Dans la console PowerShell où il tourne, appuyer sur `Ctrl C`, ou
fermer la fenêtre. Le navigateur affichera alors une erreur de
connexion sur `localhost:8765` jusqu'au prochain redémarrage du
serveur. Les données restent intactes dans le navigateur.

## À propos de serveur.ps1

`serveur.ps1` est un **outil de confort**, indépendant de
l'application. C'est un mini serveur HTTP statique écrit en PowerShell
pur, qui utilise le module natif `System.Net.HttpListener` de Windows.
Il ne nécessite aucune installation, aucun runtime supplémentaire
(pas de Python, pas de Node.js).

L'application elle même reste 100 % HTML, CSS et JavaScript vanilla,
sans dépendance. Si vous préférez utiliser un autre serveur statique
(`python -m http.server`, `npx http-server`, extension VS Code, etc.),
cela fonctionne aussi. Le script est juste là pour rendre le démarrage
immédiat sur une machine Windows sans rien installer.

## Sauvegarde des données

Les données (profils, chronos, plans, statuts, notes, nutrition) sont
stockées dans le localStorage du navigateur que vous utilisez, lié
au domaine `localhost:8765`. Elles persistent entre les sessions tant
que vous restez sur le même navigateur et le même port.

Pour conserver une copie ou changer d'appareil, utiliser le bouton
**Exporter en JSON** dans la section Sauvegarde de l'écran Profil.
Vous obtenez un fichier `triathlon_lausanne_export_AAAA_MM_JJ.json`
téléchargé localement. Sur l'appareil cible, utiliser **Importer
depuis JSON** pour recharger l'état complet. L'import est un
remplacement complet des données, jamais une fusion : tout le
contenu présent dans le navigateur cible est écrasé par celui du
fichier importé.

Les photos d'avatar importées sont conservées comme les autres
données et incluses dans les exports JSON. Le traitement
(redimensionnement carré 256 par 256 pixels, encodage JPEG)
est entièrement local : aucune image n'est envoyée nulle part.

Effacer les données du navigateur, ou changer de port, supprime aussi
les données de l'application. Penser à exporter régulièrement.

## Arborescence du projet

```
triathlon-app/
├── index.html
├── README.md
├── .gitignore
├── serveur.ps1            outil de confort, serveur local Windows
├── css/
│   └── styles.css
├── js/
│   ├── app.js             point d'entrée, navigation entre onglets
│   ├── storage.js         lecture écriture localStorage, export import JSON
│   ├── profils.js         profils athlètes, saisie chronos
│   ├── allures.js         calcul des zones d'allure
│   ├── plan.js            génération du plan par phases
│   ├── seances.js         vue semaine, détail séance, suivi de statut
│   ├── progression.js     indicateurs de volume et de réalisation
│   └── nutrition.js       repères compléments, rappels visuels
└── data/
    └── reference.js       données fixes : phases, types de séance, repères
```

## Avertissement santé

Cet outil ne remplace pas un avis médical ou l'accompagnement d'un
professionnel. Consulter un médecin ou un nutritionniste avant toute
montée en charge importante ou avant de commencer la prise d'un
complément. Les allures cibles sont calculées uniquement à partir des
chronos saisis ; aucune garantie de résultat ou de temps de course
n'est fournie.
