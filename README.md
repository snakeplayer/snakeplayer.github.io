# Échecs en ligne — Firebase (v4.0)

Multijoueur en temps réel avec **Firebase Realtime Database** + **Auth anonyme**.
Aucun backend à écrire : juste une config Firebase, et c’est parti.

## Installation (10 minutes)
1) Crée un projet sur https://console.firebase.google.com/
2) **Add app → Web** (icône `</>`), copie la config (apiKey, etc.).
3) Dans `js/firebaseConfig.js`, remplace chaque `PASTE_...` par ta config.
4) **Realtime Database** → créer DB en mode *Production*.  
   - Onglet **Rules** → colle le contenu de `firebase.rules.json` → **Publish**.
5) Ouvre `index.html` localement (ou mieux : déploie sur un hébergement statique).

## Utilisation
- **Mode Local** : 2 joueurs sur le même écran (undo/redo autorisés).
- **Mode En ligne** :
  - Clique **Créer une partie** (choisis éventuellement ton côté). Un **code 6 lettres** est généré.
  - Envoie le code (ou copie le **lien**) à l’ami·e. Il/elle **rejoint** en entrant le code.
  - Les coups sont **synchronisés** automatiquement. Undo/Redo **désactivés** côté online (pour rester simple et éviter les conflits).
  - Si une room n’a pas encore d’état, le premier joueur **blanc** connecté initialise le plateau.

## Détails techniques
- **Sync** : après chaque coup légal, on pousse un **instantané complet** `{ S, whiteToMove, lastMove, movesNotation, castleRights, epTarget }`.
- **Attribution des couleurs** : au *join*, si `white` libre ⇒ blanc, sinon si `black` libre ⇒ noir, sinon **spectateur**.
- **Presence** : chaque client écrit `true` sous `/presence/roomId/uid` avec `onDisconnect().remove()`.

## Déploiement
- **GitHub Pages** : pousser le dossier → Settings → Pages.
- **Netlify/Vercel** : glisser-déposer le dossier → URL gratuite.
- **Firebase Hosting** : `npm i -g firebase-tools` → `firebase init hosting` → `firebase deploy`.

## Idées d’améliorations
- Chat & liste des connectés.
- Undo consensuel (demande d’annulation validée par l’adversaire).
- Horloge 3+2 côté serveur (ou avec Cloud Functions).
- Règles plus strictes dans `firebase.rules.json` pour limiter l’écriture de l’état au joueur au trait.
