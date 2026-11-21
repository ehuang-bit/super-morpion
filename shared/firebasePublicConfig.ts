/**
 * Configuration Web publique de Firebase Auth.
 *
 * Ces valeurs identifient le projet Firebase auprès de Google : elles sont
 * publiques par conception (elles se retrouvent de toute façon dans le code
 * envoyé au navigateur) et ne donnent accès à rien à elles seules. La sécurité
 * repose sur les domaines autorisés côté Firebase et sur la vérification des
 * jetons par le serveur.
 *
 * Les variables d'environnement VITE_FIREBASE_* (et FIREBASE_PROJECT_ID côté
 * serveur) restent prioritaires si elles sont définies.
 */
export const FIREBASE_PUBLIC_CONFIG = {
  apiKey: 'AIzaSyDIIEvpzmEDs6ZHj0L-n4-GEEKq8c9sNBk',
  authDomain: 'super-morpion.firebaseapp.com',
  projectId: 'super-morpion',
  appId: '1:344182057396:web:45e3e1bc0de2c7d9b5eae1',
};

/** Fournisseurs affichés : 'google', 'apple', 'microsoft'. */
export const DEFAULT_AUTH_PROVIDERS = 'google';
