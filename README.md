# Échecs en ligne — Firebase (v4.1.1)

Correctif critique : **attribution des couleurs atomique** via `runTransaction` → impossible d’être deux fois Blancs. UI clarifiée (rôle affiché), blocage propre hors tour, orientation auto pour les Noirs.

## Setup rapide
1. Firebase → Authentication → activer **Anonyme** (+ ajouter `snakeplayer.github.io` aux **Domaines autorisés**).
2. Realtime Database → créer DB → **Rules** = `firebase.rules.json` → **Publish**.
3. `js/firebaseConfig.js` → colle ta config (apiKey, authDomain, **databaseURL**, etc.).
4. Déploie sur GitHub Pages (racine du repo utilisateur `snakeplayer.github.io`).

## Notes
- Créateur = **Blanc** par défaut (ou Noir si tu le forces à la création). Rejoindre utilise une **transaction** pour réserver White/Black.
- Undo/Redo désactivés en ligne (à réintroduire plus tard avec demande d’annulation).
- Promotion online = **dame** auto pour garder la synchro simple.
