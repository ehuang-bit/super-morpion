/**
 * Connexion via Google, Apple, Microsoft ou lien magique par e-mail
 * (n'importe quelle adresse : Gmail, iCloud, Outlook…), grâce à Firebase Auth.
 *
 * IMPORTANT : on précharge le SDK Firebase dès l'ouverture de la fenêtre de
 * connexion (`preloadFirebaseAuth`) pour que `signInWithPopup` soit appelé de
 * façon SYNCHRONE dans le geste utilisateur (clic) — sinon les navigateurs
 * bloquent la pop-up (`auth/popup-blocked`) et une redirection cross-origin
 * vers `*.firebaseapp.com` perd la session à cause du partitionnement des
 * cookies tiers.
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

type FirebaseAuthModule = typeof import('firebase/auth');

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
const CANONICAL_HOST = 'super-morpion.vercel.app';

let authReadyPromise: Promise<{ auth: Auth; mod: FirebaseAuthModule }> | null = null;
let cachedAuth: Auth | null = null;
let cachedAuthMod: FirebaseAuthModule | null = null;

function mapFirebaseLocale(locale?: string): string {
  if (!locale) return 'fr';
  if (locale === 'zh') return 'zh-CN';
  return locale;
}

async function ensureFirebaseAuth(
  locale?: string,
): Promise<{ auth: Auth; mod: FirebaseAuthModule }> {
  if (!firebaseEnabled) {
    throw new Error('Connexion externe non configurée.');
  }
  if (cachedAuth && cachedAuthMod) {
    if (locale) cachedAuth.languageCode = mapFirebaseLocale(locale);
    return { auth: cachedAuth, mod: cachedAuthMod };
  }
  if (!authReadyPromise) {
    authReadyPromise = (async () => {
      const [{ initializeApp, getApps }, mod] = await Promise.all([
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
      const auth = mod.getAuth(app);
      auth.languageCode = mapFirebaseLocale(locale);
      cachedAuth = auth;
      cachedAuthMod = mod;
      return { auth, mod };
    })().catch((err) => {
      authReadyPromise = null;
      throw err;
    });
  }
  const bundle = await authReadyPromise;
  if (locale) {
    bundle.auth.languageCode = mapFirebaseLocale(locale);
  }
  return bundle;
}

/**
 * Précharge Firebase Auth en arrière-plan (à l'ouverture du modal ou au survol
 * du bouton Connexion) afin que le clic sur Google ouvre la pop-up de manière
 * 100 % synchrone sans jamais déclencher le bloqueur de pop-up.
 */
export function preloadFirebaseAuth(locale?: string): void {
  if (!firebaseEnabled || typeof window === 'undefined') return;
  void ensureFirebaseAuth(locale).catch(() => {
    // Erreur silencieuse au préchargement : gérée au moment du clic réel
  });
}

function getFirebaseErrorCode(err: unknown): string {
  return typeof err === 'object' && err && 'code' in err
    ? String((err as { code: unknown }).code)
    : '';
}

function friendlyFirebaseError(err: unknown): Error {
  const code = getFirebaseErrorCode(err);
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isVercelPreviewHost =
    host.endsWith('.vercel.app') && host !== CANONICAL_HOST;
  const messages: Record<string, string> = {
    'auth/popup-closed-by-user': 'Connexion annulée.',
    'auth/cancelled-popup-request': 'Connexion annulée.',
    'auth/popup-blocked':
      'La fenêtre Google a été bloquée par le navigateur. Clique à nouveau sur « Continuer avec Google » ou autorise les pop-ups pour ce site.',
    'auth/network-request-failed': 'Réseau indisponible, réessayez.',
    'auth/unauthorized-domain': isVercelPreviewHost
      ? `Tu es sur un lien temporaire (${host}). Ouvre https://${CANONICAL_HOST} pour te connecter avec Google.`
      : host
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
  mod: FirebaseAuthModule,
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
 * Ouvre la fenêtre Google/OAuth et renvoie un jeton d'identité vérifiable.
 * Si le SDK est déjà préchargé (cas normal dès l'ouverture de AuthModal),
 * `signInWithPopup` est déclenché de façon synchrone dans le tour du clic.
 */
export async function signInWithSocial(
  provider: SocialProvider,
  locale?: string,
): Promise<SocialSignInResult> {
  let auth: Auth;
  let mod: FirebaseAuthModule;

  if (cachedAuth && cachedAuthMod) {
    auth = cachedAuth;
    mod = cachedAuthMod;
    if (locale) auth.languageCode = mapFirebaseLocale(locale);
  } else {
    const bundle = await ensureFirebaseAuth(locale);
    auth = bundle.auth;
    mod = bundle.mod;
  }

  const authProvider = buildAuthProvider(mod, provider, locale);

  try {
    const cred = await mod.signInWithPopup(auth, authProvider);
    const idToken = await cred.user.getIdToken();
    void mod.signOut(auth);
    return { kind: 'token', idToken };
  } catch (err) {
    throw friendlyFirebaseError(err);
  }
}

/** Vérifie si un éventuel retour de redirection OAuth est en attente. */
export function hasPendingSocialRedirect(): boolean {
  if (!firebaseEnabled || typeof window === 'undefined') return false;
  try {
    return Boolean(sessionStorage.getItem(SOCIAL_REDIRECT_KEY));
  } catch {
    return false;
  }
}

/** Finalise une connexion OAuth par redirection si un indicateur existait. */
export async function consumeSocialRedirectResult(): Promise<string | null> {
  if (!hasPendingSocialRedirect()) return null;
  try {
    sessionStorage.removeItem(SOCIAL_REDIRECT_KEY);
  } catch {
    // Ignorer
  }
  const { auth, mod } = await ensureFirebaseAuth();
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
  const { auth, mod } = await ensureFirebaseAuth(locale);
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
  const { auth, mod } = await ensureFirebaseAuth();
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
