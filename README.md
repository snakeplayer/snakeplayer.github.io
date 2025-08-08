# Échecs en ligne — Firebase (v4.1)

Améliorations multijoueur : gestion de tour fiable, interface claire, orientation auto selon la couleur, blocage propre quand ce n’est pas ton tour, synchro robuste.

## Setup rapide
1. Firebase → Authentication → activer **Anonyme** (+ ajouter `snakeplayer.github.io` dans **Domaines autorisés**).
2. Realtime Database → créer DB → **Rules** = `firebase.rules.json` → **Publish**.
3. `js/firebaseConfig.js` → colle TA config (apiKey, authDomain, databaseURL, etc.).
4. Déploie sur GitHub Pages ou ouvre via un petit serveur local.

## Notes
- En **ligne** : pas d’undo/redo (réintroduire plus tard avec une demande d’annulation).
- **Promotion online** : auto-dame pour éviter les boîtes de dialogue divergentes.
- **Orientation** : plateau auto-retourné pour les noirs.
