/**
 * Connexion via Google, Apple, Microsoft ou lien magique par e-mail
 * (n'importe quelle adresse : Gmail, iCloud, Outlook…), grâce à Firebase Auth.
 *
 * Firebase ne sert qu'à prouver l'identité : on récupère un jeton signé par
 * Google, que le serveur vérifie avant d'ouvrir sa propre session de jeu.
 * La session Firebase est fermée aussitôt après.
 */
import type { Auth } from 'firebase/auth';
import {
  DEFAULT_AUTH_PROVIDERS,
  FIREBASE_PUBLIC_CONFIG,
} from '@shared/firebasePublicConfig';

export type SocialProvider = 'google' | 'apple' | 'microsoft';

export type SocialSignInResult =
  | { kind: 'token'; idToken: string }
  | { kind: 'redirecting' };

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || FIREBASE_PUBLIC_CONFIG.apiKey,
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || FIREBASE_PUBLIC_CONFIG.authDomain,
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID || FIREBASE_PUBLIC_CONFIG.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || FIREBASE_PUBLIC_CONFIG.appId,
};

export const firebaseEnabled = Boolean(
  config.apiKey && config.authDomain && config.projectId,
);

const ALL_PROVIDERS: SocialProvider[] = ['google', 'apple', 'microsoft'];

/** Fournisseurs activés (VITE_AUTH_PROVIDERS="google,apple,microsoft"). */
export const enabledSocialProviders: SocialProvider[] = firebaseEnabled
  ? String(import.meta.env.VITE_AUTH_PROVIDERS || DEFAULT_AUTH_PROVIDERS)
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
const SOCIAL_REDIRECT_KEY = 'sm_social_redirect_pending';

let authPromise: Promise<Auth> | null = null;

function mapFirebaseLocale(locale?: string): string {
  if (!locale) return 'fr';
  if (locale === 'zh') return 'zh-CN';
  return locale;
}

async function getFirebaseAuth(locale?: string): Promise<Auth> {
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
      auth.languageCode = mapFirebaseLocale(locale);
      return auth;
    })();
  }
  const auth = await authPromise;
  if (locale) {
    auth.languageCode = mapFirebaseLocale(locale);
  }
  return auth;
}

function getFirebaseErrorCode(err: unknown): string {
  return typeof err === 'object' && err && 'code' in err
    ? String((err as { code: unknown }).code)
    : '';
}

function friendlyFirebaseError(err: unknown): Error {
  const code = getFirebaseErrorCode(err);
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const messages: Record<string, string> = {
    'auth/popup-closed-by-user': 'Connexion annulée.',
    'auth/cancelled-popup-request': 'Connexion annulée.',
    'auth/popup-blocked':
      'La fenêtre de connexion a été bloquée. Autorisez les pop-ups pour ce site.',
    'auth/network-request-failed': 'Réseau indisponible, réessayez.',
    'auth/unauthorized-domain': host
      ? `Le domaine « ${host} » doit être ajouté dans Firebase → Authentication → Domaines autorisés.`
      : 'Ce domaine n’est pas autorisé dans la configuration Firebase.',
    'auth/operation-not-allowed':
      'Ce mode de connexion n’est pas activé dans Firebase.',
    'auth/invalid-email': 'Adresse e-mail invalide.',
    'auth/invalid-action-code': 'Ce lien a expiré ou a déjà été utilisé.',
    'auth/expired-action-code': 'Ce lien a expiré. Demandez-en un nouveau.',
    'auth/account-exists-with-different-credential':
      'Cette adresse est déjà liée à un autre mode de connexion.',
    'auth/too-many-requests': 'Trop de tentatives. Patientez un instant.',
  };
  const friendly = new Error(
    messages[code] ?? 'Connexion impossible pour le moment.',
  ) as Error & { firebaseCode?: string };
  if (code) friendly.firebaseCode = code;
  return friendly;
}

function buildAuthProvider(
  mod: typeof import('firebase/auth'),
  provider: SocialProvider,
  locale?: string,
) {
  if (provider === 'google') {
    const p = new mod.GoogleAuthProvider();
    p.addScope('email');
    p.addScope('profile');
    p.setCustomParameters({ prompt: 'select_account' });
    return p;
  }
  if (provider === 'apple') {
    const p = new mod.OAuthProvider('apple.com');
    p.addScope('email');
    p.addScope('name');
    p.setCustomParameters({ locale: locale === 'en' ? 'en_US' : 'fr_FR' });
    return p;
  }
  const p = new mod.OAuthProvider('microsoft.com');
  p.setCustomParameters({ prompt: 'select_account' });
  return p;
}

/**
 * Ouvre la fenêtre du fournisseur et renvoie un jeton d'identité vérifiable.
 * Si la pop-up est bloquée (ex. navigateur mobile intégré), bascule automatiquement
 * sur une redirection OAuth sécurisée.
 */
export async function signInWithSocial(
  provider: SocialProvider,
  locale?: string,
): Promise<SocialSignInResult> {
  const auth = await getFirebaseAuth(locale);
  const mod = await import('firebase/auth');
  const authProvider = buildAuthProvider(mod, provider, locale);

  try {
    const cred = await mod.signInWithPopup(auth, authProvider);
    const idToken = await cred.user.getIdToken();
    void mod.signOut(auth);
    return { kind: 'token', idToken };
  } catch (err) {
    const code = getFirebaseErrorCode(err);
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      try {
        sessionStorage.setItem(SOCIAL_REDIRECT_KEY, provider);
      } catch {
        // Ignorer si sessionStorage est indisponible
      }
      try {
        await mod.signInWithRedirect(auth, authProvider);
        return { kind: 'redirecting' };
      } catch (redirectErr) {
        try {
          sessionStorage.removeItem(SOCIAL_REDIRECT_KEY);
        } catch {
          // Ignorer
        }
        throw friendlyFirebaseError(redirectErr);
      }
    }
    throw friendlyFirebaseError(err);
  }
}

/** Vérifie si un retour de redirection Google/OAuth est en attente. */
export function hasPendingSocialRedirect(): boolean {
  if (!firebaseEnabled || typeof window === 'undefined') return false;
  try {
    return Boolean(sessionStorage.getItem(SOCIAL_REDIRECT_KEY));
  } catch {
    return false;
  }
}

/** Finalise une connexion OAuth par redirection si elle vient de se terminer. */
export async function consumeSocialRedirectResult(): Promise<string | null> {
  if (!hasPendingSocialRedirect()) return null;
  try {
    sessionStorage.removeItem(SOCIAL_REDIRECT_KEY);
  } catch {
    // Ignorer
  }
  const auth = await getFirebaseAuth();
  const mod = await import('firebase/auth');
  try {
    const cred = await mod.getRedirectResult(auth);
    if (!cred?.user) return null;
    const idToken = await cred.user.getIdToken();
    void mod.signOut(auth);
    return idToken;
  } catch (err) {
    throw friendlyFirebaseError(err);
  }
}

/** Envoie un lien de connexion à usage unique par e-mail. */
export async function sendMagicLink(email: string, locale?: string): Promise<void> {
  const auth = await getFirebaseAuth(locale);
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
