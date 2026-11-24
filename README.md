# Super Morpion — Duel stratégique 1v1 en ligne

Application web **Super Morpion (Ultimate Tic-Tac-Toe)** 1v1 compétitive en ligne, hébergée sur **Netlify** (React 18 + TypeScript + Tailwind CSS + Framer Motion + Netlify Functions + Netlify Database Postgres).

- **Application en ligne** : [https://super-morpion-duel.netlify.app](https://super-morpion-duel.netlify.app)

---

## Fonctionnalités principales

- **Plateau prêt à jouer dès l’entrée**, barre latérale, console de lancement et activité en direct (joueurs en ligne, parties en cours, file d’attente par cadence).
- **Tutoriel en 3 étapes** sur le plateau d’essai (proposé à la première visite, relançable depuis « Règles ») et **barre d’onglets en bas d’écran** sur téléphone (Jouer, Stats, Classement, Menu).
- **100 % multijoueur en ligne** :
  - **Matchmaking par niveau** (l’adversaire au classement le plus proche est privilégié) par cadence : *Classique*, *Rapide · 3 min*, *Blitz · 1:30*.
  - **25 secondes par coup**, dans toutes les cadences : un liséré se vide autour du plateau. Au dépassement, un coup aléatoire est joué d’office ; deux dépassements d’affilée font perdre au temps.
  - **Duel privé** par code à 6 caractères ou lien d’invitation (`/room/ABCDEF`), avec partage natif (WhatsApp, SMS…).
  - **Coups instantanés** : le coup est validé localement par le même moteur que le serveur et affiché tout de suite, puis confirmé par le serveur.
  - Pendule serveur autoritaire, présence, revanche avec inversion des rôles, onglet « À toi de jouer ».
- **Classement Glicko-2 (comme Lichess)** :
  - Classement + **déviation** (incertitude) + **volatilité** : les premières parties font beaucoup bouger le classement (affiché « 1350? » tant qu’il est provisoire), puis il se stabilise ; la déviation remonte doucement en cas d’inactivité.
  - **Partie annulée** si un joueur n’a pas encore joué son premier coup (abandon, temps, départ) : aucun effet sur le classement.
  - Impossible de jouer contre soi-même (même compte / même profil invité).
  - **Classement général** des comptes (3 parties minimum), percentile dans *Mes statistiques*.
- **Comptes** :
  - **Google, Apple, Microsoft** et **lien magique par e-mail** (Gmail, iCloud, Outlook…) via Firebase Auth, ou pseudo + mot de passe (`scrypt`).
  - **Mode invité** en un clic ; sa progression est **transférée** au compte créé ensuite.
- **Fin de partie animée** : confettis, compteur de classement, promotion de rang, partage du résultat.
- **PWA installable** (écran d’accueil iOS / Android), aperçu riche des liens partagés (Open Graph).
- **Personnalisation** : 8 palettes, 4 styles de pièces, 3 matières, 2 géométries d’angles. Son Web Audio et vibrations.

---

## Connexion Google / Apple / Microsoft / e-mail

- **E-mail + mot de passe** : natif sur Postgres (`/api/game/auth/register` et `/api/game/auth/login`), fonctionne immédiatement sans configuration externe.
- **Google & lien magique par e-mail** : configuré avec le projet Firebase `super-morpion` (`shared/firebasePublicConfig.ts`).
  Pour activer Google et le lien magique sur Vercel, ajouter `super-morpion.vercel.app` dans **Firebase Console → Authentication → Settings → Domaines autorisés**.

Pour la refaire sur un autre projet :

1. Créer un projet sur [console.firebase.google.com](https://console.firebase.google.com) (gratuit), puis **Ajouter une application Web** et copier sa configuration.
2. **Authentication → Sign-in method** : activer **Google** ; activer **E-mail/Mot de passe** avec l’option **Lien envoyé par e-mail (connexion sans mot de passe)**. Microsoft et Apple sont optionnels (Apple exige un compte Apple Developer payant).
3. **Authentication → Settings → Domaines autorisés** : ajouter `super-morpion-duel.netlify.app`.
4. Mettre la configuration dans `shared/firebasePublicConfig.ts`, ou bien dans Netlify (**Project configuration → Environment variables**) :

   | Variable | Valeur |
   | --- | --- |
   | `VITE_FIREBASE_API_KEY` | `apiKey` de la config Firebase |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` (ex. `mon-projet.firebaseapp.com`) |
   | `VITE_FIREBASE_PROJECT_ID` | `projectId` |
   | `VITE_FIREBASE_APP_ID` | `appId` |
   | `VITE_AUTH_PROVIDERS` | `google` (ou `google,microsoft,apple`) |

5. Redéployer. Le serveur vérifie les jetons Firebase avec `VITE_FIREBASE_PROJECT_ID` (ou `FIREBASE_PROJECT_ID`).

---

## Architecture technique

- `shared/gameEngine.ts` : moteur pur des règles (81 cases, renvoi, coup libre, victoire locale/globale).
- `shared/elo.ts` : Glicko-2 (validé sur l’exemple de référence de Glickman), enjeux pré-match, paliers.
- `shared/onlineRoomLogic.ts` : transitions des salons (coups, pendules, abandon, annulation, revanche).
- `netlify/functions/game.mts` : API serverless `/api/game/*` sur **Netlify Database (Postgres)** : salons, matchmaking, comptes, OAuth, classement général, activité en direct.
- `netlify/database/migrations/` : migrations SQL appliquées au déploiement.
- `src/auth/firebase.ts` : connexion Firebase chargée à la demande.
- `public/` : manifest PWA, service worker, icônes, image de partage.

---

## Développement & tests

```bash
npm install
npm test
npm run typecheck
npm run build
```

`npm run dev` lance l’interface seule ; `npm run dev:netlify` lance l’interface et les fonctions via Netlify CLI.

### Mode démo (développement uniquement)

Avec `npm run dev`, ouvrir `http://localhost:5173/?demo` : un faux serveur en mémoire (`src/dev/`) remplace l’API et fait jouer un adversaire simulé, avec la même logique de salon que le vrai serveur. Un panneau permet de choisir son comportement (`facile`, `fort`, `absent`) et de forcer une victoire, une défaite, un nul ou une promotion. `?demo=off` le désactive. Ce code n’est pas inclus dans la version de production.
