# Super Morpion — Duel Stratégique 1v1 en ligne

Application web **Super Morpion (Ultimate Tic-Tac-Toe)** 1v1 compétitive en ligne, hébergée sur **Netlify** (React 18 + TypeScript + Tailwind CSS + Framer Motion + Netlify Functions + Netlify Database Postgres).

- **Application en ligne** : [https://super-morpion-duel.netlify.app](https://super-morpion-duel.netlify.app)

---

## Fonctionnalités principales

- **Plateau prêt à jouer dès l’entrée** : le plateau 9×9 complet est affiché au centre dès l’ouverture du site avec aperçu tactique du renvoi, entouré de la barre latérale de navigation et de la console de lancement de duel.
- **100 % Multijoueur en ligne** :
  - **Matchmaking rapide** par cadence (*Illimité*, *Rapide · 3 min*, *Blitz · 1:30*).
  - **Duel privé par code à 6 caractères** ou lien d’invitation direct (`/room/ABCDEF`).
  - **Pendule serveur autoritaire** sans dérive, détection de présence et revanche instantanée avec inversion des rôles (`X` / `O`).
- **Comptes joueurs & Mode Invité** :
  - **Inscription / Connexion** (`scrypt` + sessions persistantes Postgres) pour synchroniser son classement Elo et son historique sur tous ses appareils.
  - **Accès immédiat en tant qu’invité** en un clic.
- **Classement Elo FIDE & Page Statistiques** :
  - Calcul Elo en temps réel (`1200` initial, facteur `K` dynamique `40 / 24 / 16`, 7 paliers de *Novice* à *Souverain*).
  - Vue **Mes statistiques** dédiée : progression vers le prochain palier, taux de victoire, record Elo, série en cours, courbe SVG d’évolution Elo et historique détaillé des duels récents.
- **Studio de personnalisation du plateau & 8 palettes sophistiquées** :
  - **8 palettes architecturales** : *Atelier*, *Argile & Ardoise*, *Bordeaux & Craie*, *Sauge & Travertin*, *Kyoto*, *Nocturne*, *Club Nuit*, *Obsidienne & Or*.
  - **4 styles de pièces** (*Classique*, *Plume*, *Précision*, *Pions*), **3 matières de surface** (*Papier mat*, *Damier*, *Grain pierre*), **2 géométries d’angles** (*Arrondi doux*, *Architectural*), coordonnées `A1–C3` et projecteur de destination au survol.
- **Audio & Haptique** : synthèse Web Audio API bois/céramique sans fichier externe et retour haptique mobile.

---

## Architecture technique

- `shared/gameEngine.ts` : moteur pur des règles du Super Morpion (81 cases, renvoi directionnel, coup libre sur zone verrouillée, victoire locale/globale).
- `shared/elo.ts` : système Elo, enjeux pré-match et paliers de rang.
- `shared/onlineRoomLogic.ts` : transitions transactionnelles des salons en ligne.
- `netlify/functions/game.mts` : API serverless (`/api/game/*`) connectée à **Netlify Database (Postgres)**.
- `netlify/database/migrations/` : migrations SQL Postgres automatiques (`elo_profiles`, `rooms`, `matchmaking_queue`, `users`, `auth_sessions`, `match_history`).
- `src/` : interface React + Tailwind CSS + Framer Motion.

---

## Développement & Tests

```bash
npm install
npm test
npm run typecheck
npm run build:client
```
