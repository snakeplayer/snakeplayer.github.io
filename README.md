# Échecs en ligne — Firebase (v4.1.2)

Correctifs et UX multi :
- Attribution **atomique** des couleurs via `runTransaction` (impossible d’être deux fois Blancs).
- Ecoute `onValue` avec logs → visibilité sur la room et l’état.
- Bordure **verte** quand c’est votre tour, **jaune** sinon.
- Rôle affiché clairement + plateau auto-retourné pour les Noirs.
- Promo en ligne = Dame auto.

## Setup rapide
1. Firebase → Auth → activer **Anonyme** + ajouter `snakeplayer.github.io` aux **Domaines autorisés**.
2. Realtime Database → créer DB → **Rules** = `firebase.rules.json` → **Publish**.
3. `js/firebaseConfig.js` → colle ta config (apiKey, authDomain, databaseURL, etc.).
4. Déploie tout à la **racine** du repo `snakeplayer.github.io`.

## Debug
Ouvre la **console** : tu verras les logs `[AUTH]`, `[ROOM]`, `[STATE]`, `[MOVE]`.


Hotfix v4.1.2a: remove updateTurnInfo refs; add hidden #turnInfo; guard listener.

Hotfix v4.1.2d: allow selection always; block only on move; add [SELECT]/[MOVE] logs.
