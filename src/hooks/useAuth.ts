import { useCallback, useEffect, useRef, useState } from 'react';
import type { EloProfile } from '@shared/elo';
import type { AuthUser } from '@shared/protocol';
import {
  completeMagicLink,
  getPendingMagicLinkEmail,
  hasMagicLinkInUrl,
  sendMagicLink,
  signInWithSocial,
  type SocialProvider,
} from '../auth/firebase';
import {
  getSavedAuthToken,
  getSavedPseudo,
  hasChosenEntryMode,
  markEntryModeChosen,
  saveAuthToken,
  savePseudo,
} from '../utils/storage';

interface AuthApiPayload {
  token: string;
  user: AuthUser;
  profile: EloProfile;
  tier: string;
  isNew?: boolean;
  mergedGuest?: boolean;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface AuthOutcome {
  ok: boolean;
  isNew?: boolean;
  mergedGuest?: boolean;
}

/** Étape « choisis ton pseudo » après une première connexion Google/Apple/e-mail. */
export interface OnboardingState {
  suggestedUsername: string;
  mergedGuest: boolean;
}

async function postJson<T>(
  path: string,
  body: unknown,
  token?: string | null,
): Promise<ApiEnvelope<T>> {
  try {
    const res = await fetch(`/api/game${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return (await res.json()) as ApiEnvelope<T>;
  } catch {
    return { ok: false, error: 'Connexion au serveur impossible.' };
  }
}

export function useAuth(profileId: string) {
  const [token, setToken] = useState<string | null>(() => getSavedAuthToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(() => Boolean(getSavedAuthToken()));
  const [error, setError] = useState<string | null>(null);
  const [entryResolved, setEntryResolved] = useState<boolean>(() =>
    hasChosenEntryMode(),
  );
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [magicLinkSentTo, setMagicLinkSentTo] = useState<string | null>(null);
  const [magicLinkNeedsEmail, setMagicLinkNeedsEmail] = useState<boolean>(false);
  const magicLinkHandledRef = useRef(false);

  const guestPayload = useCallback(
    () => ({ guestProfileId: profileId, guestPseudo: getSavedPseudo() }),
    [profileId],
  );

  const applySession = useCallback((data: AuthApiPayload) => {
    saveAuthToken(data.token);
    savePseudo(data.user.username);
    markEntryModeChosen();
    setToken(data.token);
    setUser(data.user);
    setEntryResolved(true);
    setError(null);
    setMagicLinkSentTo(null);
    setMagicLinkNeedsEmail(false);
    if (data.mergedGuest) {
      setNotice('Ta progression invité a été transférée sur ton compte.');
    }
    if (data.isNew && data.user.provider && data.user.provider !== 'password') {
      setOnboarding({
        suggestedUsername: data.user.username,
        mergedGuest: Boolean(data.mergedGuest),
      });
    }
  }, []);

  // Vérifie la session enregistrée au chargement
  useEffect(() => {
    const existingToken = getSavedAuthToken();
    if (!existingToken) {
      setLoading(false);
      return;
    }

    let active = true;
    const verifySession = async () => {
      try {
        const res = await fetch('/api/game/auth/me', {
          method: 'GET',
          headers: { Authorization: `Bearer ${existingToken}` },
        });
        const json = (await res.json()) as ApiEnvelope<{
          user: AuthUser | null;
        }>;
        if (!active) return;

        if (json.ok && json.data?.user) {
          setUser(json.data.user);
          setToken(existingToken);
          savePseudo(json.data.user.username);
          markEntryModeChosen();
          setEntryResolved(true);
        } else if (json.ok) {
          saveAuthToken(null);
          setToken(null);
          setUser(null);
        }
      } catch {
        // Réseau indisponible : on garde le jeton pour la prochaine fois
      } finally {
        if (active) setLoading(false);
      }
    };

    void verifySession();
    return () => {
      active = false;
    };
  }, []);

  const exchangeIdToken = useCallback(
    async (idToken: string): Promise<AuthOutcome> => {
      const json = await postJson<AuthApiPayload>('/auth/oauth', {
        idToken,
        ...guestPayload(),
      });
      if (!json.ok || !json.data) {
        setError(json.error ?? 'Connexion impossible.');
        return { ok: false };
      }
      applySession(json.data);
      return { ok: true, isNew: json.data.isNew, mergedGuest: json.data.mergedGuest };
    },
    [applySession, guestPayload],
  );

  const completeEmailLink = useCallback(
    async (email: string): Promise<AuthOutcome> => {
      setError(null);
      setLoading(true);
      try {
        const idToken = await completeMagicLink(email.trim());
        return await exchangeIdToken(idToken);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lien invalide.');
        return { ok: false };
      } finally {
        setLoading(false);
      }
    },
    [exchangeIdToken],
  );

  // Ouverture d'un lien magique reçu par e-mail
  useEffect(() => {
    if (magicLinkHandledRef.current || !hasMagicLinkInUrl()) return;
    magicLinkHandledRef.current = true;
    const pendingEmail = getPendingMagicLinkEmail();
    if (pendingEmail) {
      void completeEmailLink(pendingEmail);
    } else {
      // Lien ouvert sur un autre appareil : on redemande l'adresse
      setMagicLinkNeedsEmail(true);
    }
  }, [completeEmailLink]);

  const clearError = useCallback(() => setError(null), []);
  const clearNotice = useCallback(() => setNotice(null), []);

  const signInSocial = useCallback(
    async (provider: SocialProvider): Promise<AuthOutcome> => {
      setError(null);
      setLoading(true);
      try {
        const idToken = await signInWithSocial(provider);
        return await exchangeIdToken(idToken);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Connexion impossible.');
        return { ok: false };
      } finally {
        setLoading(false);
      }
    },
    [exchangeIdToken],
  );

  const sendEmailLink = useCallback(async (email: string): Promise<boolean> => {
    setError(null);
    setLoading(true);
    try {
      await sendMagicLink(email.trim());
      setMagicLinkSentTo(email.trim());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(
    async (username: string, password: string): Promise<AuthOutcome> => {
      setError(null);
      setLoading(true);
      const json = await postJson<AuthApiPayload>('/auth/register', {
        username,
        password,
        ...guestPayload(),
      });
      setLoading(false);
      if (!json.ok || !json.data) {
        setError(json.error ?? 'Impossible de créer le compte.');
        return { ok: false };
      }
      applySession(json.data);
      return { ok: true, isNew: true, mergedGuest: json.data.mergedGuest };
    },
    [applySession, guestPayload],
  );

  const login = useCallback(
    async (username: string, password: string): Promise<AuthOutcome> => {
      setError(null);
      setLoading(true);
      const json = await postJson<AuthApiPayload>('/auth/login', {
        username,
        password,
      });
      setLoading(false);
      if (!json.ok || !json.data) {
        setError(json.error ?? 'Identifiants invalides.');
        return { ok: false };
      }
      applySession(json.data);
      return { ok: true };
    },
    [applySession],
  );

  const changeUsername = useCallback(
    async (username: string): Promise<boolean> => {
      if (!token) return false;
      setError(null);
      setLoading(true);
      const json = await postJson<{ user: AuthUser }>(
        '/auth/username',
        { username },
        token,
      );
      setLoading(false);
      if (!json.ok || !json.data) {
        setError(json.error ?? 'Impossible de changer de pseudo.');
        return false;
      }
      setUser(json.data.user);
      savePseudo(json.data.user.username);
      return true;
    },
    [token],
  );

  const finishOnboarding = useCallback(() => setOnboarding(null), []);

  const logout = useCallback(async () => {
    const activeToken = token;
    saveAuthToken(null);
    setToken(null);
    setUser(null);
    setError(null);
    setOnboarding(null);
    markEntryModeChosen();
    setEntryResolved(true);

    if (activeToken) {
      await postJson('/auth/logout', {}, activeToken);
    }
  }, [token]);

  const continueAsGuest = useCallback((guestPseudo?: string) => {
    if (guestPseudo && guestPseudo.trim().length > 0) {
      savePseudo(guestPseudo.trim());
    }
    markEntryModeChosen();
    setEntryResolved(true);
    setError(null);
  }, []);

  return {
    user,
    token,
    loading,
    error,
    clearError,
    notice,
    clearNotice,
    entryResolved,
    onboarding,
    finishOnboarding,
    magicLinkSentTo,
    magicLinkNeedsEmail,
    register,
    login,
    signInSocial,
    sendEmailLink,
    completeEmailLink,
    changeUsername,
    logout,
    continueAsGuest,
  };
}

export type AuthController = ReturnType<typeof useAuth>;
