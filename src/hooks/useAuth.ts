import { useCallback, useEffect, useRef, useState } from 'react';
import type { EloProfile } from '@shared/elo';
import type { AccountStreak, AuthUser } from '@shared/protocol';
import {
  completeMagicLink,
  getPendingMagicLinkEmail,
  hasMagicLinkInUrl,
  sendMagicLink,
  signInWithSocial,
  type SocialProvider,
} from '../auth/firebase';
import { DEMO_MODE } from '../dev/demoMode';
import { soundEngine } from '../utils/soundEngine';
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

export interface StreakNotice {
  days: number;
  milestone: number | null;
}

/** Étape « choisis ton pseudo » après une première connexion Google/Apple/e-mail. */
export interface OnboardingState {
  suggestedUsername: string;
  mergedGuest: boolean;
}

async function authFetchJson<T>(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
  token?: string | null,
): Promise<ApiEnvelope<T>> {
  const headers: Record<string, string> = {
    ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const init: RequestInit = {
    method,
    headers,
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  };

  if (import.meta.env.DEV && DEMO_MODE) {
    const { demoApiRequest } = await import('../dev/demoBackend');
    return (await demoApiRequest(path, init)) as ApiEnvelope<T>;
  }

  try {
    const res = await fetch(`/api/game${path}`, init);
    return (await res.json()) as ApiEnvelope<T>;
  } catch {
    return { ok: false, error: 'Connexion au serveur impossible.' };
  }
}

async function postJson<T>(
  path: string,
  body: unknown,
  token?: string | null,
): Promise<ApiEnvelope<T>> {
  return authFetchJson<T>(path, 'POST', body, token);
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
  const [streakNotice, setStreakNotice] = useState<StreakNotice | null>(null);
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

  const refreshSession = useCallback(async (overrideToken?: string | null) => {
    const activeToken = overrideToken !== undefined ? overrideToken : token;
    if (!activeToken) return null;
    const json = await authFetchJson<{ user: AuthUser | null }>(
      '/auth/me',
      'GET',
      undefined,
      activeToken,
    );
    if (json.ok && json.data?.user) {
      setUser((prev) => {
        const nextUser = json.data!.user!;
        if (
          prev?.streak &&
          nextUser.streak &&
          !prev.streak.activeToday &&
          nextUser.streak.activeToday &&
          nextUser.streak.current > 0
        ) {
          setStreakNotice({
            days: nextUser.streak.current,
            milestone: [3, 7, 14, 30, 60, 100].includes(nextUser.streak.current)
              ? nextUser.streak.current
              : null,
          });
          soundEngine.playDailySolved();
        }
        return nextUser;
      });
      return json.data.user;
    }
    return null;
  }, [token]);

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
        const json = await authFetchJson<{
          user: AuthUser | null;
        }>('/auth/me', 'GET', undefined, existingToken);
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
  const clearStreakNotice = useCallback(() => setStreakNotice(null), []);

  /**
   * Enregistre une activité quotidienne (match terminé ou Défi du jour réussi).
   * Strictement réservé aux comptes inscrits (jamais aux invités).
   */
  const recordStreakActivity = useCallback(
    async (source: 'daily' | 'match'): Promise<AccountStreak | null> => {
      if (!token) return null;
      const json = await postJson<{
        streak: AccountStreak;
        incremented?: boolean;
        milestoneReached?: number | null;
      }>('/streak/activity', { source }, token);
      if (!json.ok || !json.data?.streak) return null;
      const nextStreak = json.data.streak;
      setUser((prev) => (prev ? { ...prev, streak: nextStreak } : prev));
      if (json.data.incremented && nextStreak.current > 0) {
        setStreakNotice({
          days: nextStreak.current,
          milestone: json.data.milestoneReached ?? null,
        });
        soundEngine.playDailySolved();
      }
      return nextStreak;
    },
    [token],
  );

  const logout = useCallback(async () => {
    const activeToken = token;
    saveAuthToken(null);
    setToken(null);
    setUser(null);
    setError(null);
    setOnboarding(null);
    setStreakNotice(null);
    markEntryModeChosen();
    setEntryResolved(true);

    if (activeToken) {
      await postJson('/auth/logout', {}, activeToken);
    }
  }, [token]);

  /** Bascule compte démo / invité (développement uniquement, jamais en prod). */
  const toggleDemoAccount = useCallback(async () => {
    if (!(import.meta.env.DEV && DEMO_MODE)) return;
    if (user) {
      await logout();
      return;
    }
    const json = await postJson<AuthApiPayload>('/auth/demo', {
      pseudo: getSavedPseudo() || 'Camille',
    });
    if (json.ok && json.data) {
      applySession(json.data);
    }
  }, [user, logout, applySession]);

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
    streakNotice,
    clearStreakNotice,
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
    recordStreakActivity,
    refreshSession,
    toggleDemoAccount,
    logout,
    continueAsGuest,
  };
}

export type AuthController = ReturnType<typeof useAuth>;
