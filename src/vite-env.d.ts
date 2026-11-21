/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** Liste séparée par des virgules : google,apple,microsoft */
  readonly VITE_AUTH_PROVIDERS?: string;
  /** "false" pour masquer la connexion par lien e-mail */
  readonly VITE_AUTH_EMAIL_LINK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
