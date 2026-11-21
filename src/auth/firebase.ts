/**
 * Connexion via Google, Apple, Microsoft ou lien magique par e-mail
 * (n'importe quelle adresse : Gmail, iCloud, Outlook…), grâce à Firebase Auth.
 *
 * Firebase ne sert qu'à prouver l'identité : on récupère un jeton signé par
 * Google, que le serveur vérifie avant d'ouvrir sa propre session de jeu.
 * La session Firebase est fermée aussitôt après.
 *
 * Tout est désactivé tant que les variables VITE_FIREBASE_* ne sont pas
 * définies (voir README) : les boutons n'apparaissent alors simplement pas.
 */
import type { Auth } from 'firebase/auth';

export type SocialProvider = 'google' | 'apple' | 'microsoft';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const firebaseEnabled = Boolean(
  config.apiKey && config.authDomain && config.projectId,
);

const ALL_PROVIDERS: SocialProvider[] = ['google', 'apple', 'microsoft'];

/** Fournisseurs activés (VITE_AUTH_PROVIDERS="google,apple,microsoft"). */
export const enabledSocialProviders: SocialProvider[] = firebaseEnabled
  ? String(import.meta.env.VITE_AUTH_PROVIDERS ?? 'google')
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter((p): p is SocialProvider =>
        (ALL_PROVIDERS as string[]).includes(p),
      )
  : [];

/** Lien magique par e-mail (désactivable avec VITE_AUTH_EMAIL_LINK=false). */
export const emailLinkEnabled =
  firebaseEnabled && import.meta.env.VITE_AUTH_EMAIL_LINK !== 'false';

const EMAIL_FOR_LINK_KEY = 'sm_email_for_link';

let authPromise: Promise<Auth> | null = null;

async function getFirebaseAuth(): Promise<Auth> {
  if (!firebaseEnabled) {
    throw new Error('Connexion externe non configurée.');
  }
  if (!authPromise) {
    authPromise = (async () => {
      const [{ initializeApp, getApps }, { getAuth }] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
      ]);
      const app =
        getApps()[0] ??
        initializeApp({
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
          appId: config.appId,
        });
      const auth = getAuth(app);
      auth.languageCode = 'fr';
      return auth;
    })();
  }
  return authPromise;
}

function friendlyFirebaseError(err: unknown): Error {
  const code =
    typeof err === 'object' && err && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  const messages: Record<string, string> = {
    'auth/popup-closed-by-user': 'Connexion annulée.',
    'auth/cancelled-popup-request': 'Connexion annulée.',
    'auth/popup-blocked':
      'La fenêtre de connexion a été bloquée. Autorisez les pop-ups pour ce site.',
    'auth/network-request-failed': 'Réseau indisponible, réessayez.',
    'auth/unauthorized-domain':
      'Ce domaine n’est pas autorisé dans la configuration Firebase.',
    'auth/operation-not-allowed':
      'Ce mode de connexion n’est pas activé dans Firebase.',
    'auth/invalid-email': 'Adresse e-mail invalide.',
    'auth/invalid-action-code': 'Ce lien a expiré ou a déjà été utilisé.',
    'auth/expired-action-code': 'Ce lien a expiré. Demandez-en un nouveau.',
    'auth/account-exists-with-different-credential':
      'Cette adresse est déjà liée à un autre mode de connexion.',
    'auth/too-many-requests': 'Trop de tentatives. Patientez un instant.',
  };
  return new Error(messages[code] ?? 'Connexion impossible pour le moment.');
}

/** Ouvre la fenêtre du fournisseur et renvoie un jeton d'identité vérifiable. */
export async function signInWithSocial(provider: SocialProvider): Promise<string> {
  const auth = await getFirebaseAuth();
  const mod = await import('firebase/auth');
  let authProvider;
  if (provider === 'google') {
    const p = new mod.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    authProvider = p;
  } else if (provider === 'apple') {
    const p = new mod.OAuthProvider('apple.com');
    p.addScope('email');
    p.addScope('name');
    p.setCustomParameters({ locale: 'fr_FR' });
    authProvider = p;
  } else {
    const p = new mod.OAuthProvider('microsoft.com');
    p.setCustomParameters({ prompt: 'select_account' });
    authProvider = p;
  }

  try {
    const cred = await mod.signInWithPopup(auth, authProvider);
    const token = await cred.user.getIdToken();
    void mod.signOut(auth);
    return token;
  } catch (err) {
    throw friendlyFirebaseError(err);
  }
}

/** Envoie un lien de connexion à usage unique par e-mail. */
export async function sendMagicLink(email: string): Promise<void> {
  const auth = await getFirebaseAuth();
  const mod = await import('firebase/auth');
  try {
    await mod.sendSignInLinkToEmail(auth, email, {
      url: `${window.location.origin}/?connexion=email`,
      handleCodeInApp: true,
    });
    try {
      localStorage.setItem(EMAIL_FOR_LINK_KEY, email);
    } catch {
      // Stockage indisponible : l'adresse sera redemandée à l'ouverture du lien
    }
  } catch (err) {
    throw friendlyFirebaseError(err);
  }
}

export function getPendingMagicLinkEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_FOR_LINK_KEY);
  } catch {
    return null;
  }
}

/** L'URL actuelle contient-elle un lien magique à finaliser ? */
export function hasMagicLinkInUrl(): boolean {
  if (!firebaseEnabled || typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'signIn' && params.has('oobCode');
}

function cleanMagicLinkFromUrl(): void {
  try {
    window.history.replaceState({}, '', window.location.pathname || '/');
  } catch {
    // Ignorer
  }
}

/** Finalise la connexion par lien magique et renvoie le jeton d'identité. */
export async function completeMagicLink(email: string): Promise<string> {
  const auth = await getFirebaseAuth();
  const mod = await import('firebase/auth');
  const href = window.location.href;
  if (!mod.isSignInWithEmailLink(auth, href)) {
    throw new Error('Lien de connexion invalide.');
  }
  try {
    const cred = await mod.signInWithEmailLink(auth, email, href);
    const token = await cred.user.getIdToken();
    void mod.signOut(auth);
    try {
      localStorage.removeItem(EMAIL_FOR_LINK_KEY);
    } catch {
      // Ignorer
    }
    cleanMagicLinkFromUrl();
    return token;
  } catch (err) {
    throw friendlyFirebaseError(err);
  }
}
