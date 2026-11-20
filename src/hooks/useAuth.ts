import { useCallback, useEffect, useState } from 'react';
import type { EloProfile } from '@shared/elo';
import type { AuthUser } from '@shared/protocol';
import {
  getSavedAuthToken,
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
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => getSavedAuthToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(() => Boolean(getSavedAuthToken()));
  const [error, setError] = useState<string | null>(null);
  const [entryResolved, setEntryResolved] = useState<boolean>(() =>
    hasChosenEntryMode(),
  );

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
          headers: {
            Authorization: `Bearer ${existingToken}`,
          },
        });
        const json = (await res.json()) as ApiEnvelope<{
          user: AuthUser | null;
          profile?: EloProfile;
          tier?: string;
        }>;
        if (!active) return;

        if (json.ok && json.data?.user) {
          setUser(json.data.user);
          setToken(existingToken);
          savePseudo(json.data.user.username);
          markEntryModeChosen();
          setEntryResolved(true);
        } else {
          saveAuthToken(null);
          setToken(null);
          setUser(null);
        }
      } catch {
        // Keep token for next network recovery
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void verifySession();
    return () => {
      active = false;
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const register = useCallback(
    async (
      username: string,
      password: string,
    ): Promise<{ ok: boolean; user?: AuthUser; profile?: EloProfile; tier?: string }> => {
      setError(null);
      setLoading(true);
      try {
        const res = await fetch('/api/game/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const json = (await res.json()) as ApiEnvelope<AuthApiPayload>;
        setLoading(false);

        if (!json.ok || !json.data) {
          setError(json.error ?? 'Impossible de créer le compte.');
          return { ok: false };
        }

        saveAuthToken(json.data.token);
        savePseudo(json.data.user.username);
        markEntryModeChosen();
        setToken(json.data.token);
        setUser(json.data.user);
        setEntryResolved(true);
        return {
          ok: true,
          user: json.data.user,
          profile: json.data.profile,
          tier: json.data.tier,
        };
      } catch {
        setLoading(false);
        setError('Connexion au serveur impossible.');
        return { ok: false };
      }
    },
    [],
  );

  const login = useCallback(
    async (
      username: string,
      password: string,
    ): Promise<{ ok: boolean; user?: AuthUser; profile?: EloProfile; tier?: string }> => {
      setError(null);
      setLoading(true);
      try {
        const res = await fetch('/api/game/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const json = (await res.json()) as ApiEnvelope<AuthApiPayload>;
        setLoading(false);

        if (!json.ok || !json.data) {
          setError(json.error ?? 'Identifiants invalides.');
          return { ok: false };
        }

        saveAuthToken(json.data.token);
        savePseudo(json.data.user.username);
        markEntryModeChosen();
        setToken(json.data.token);
        setUser(json.data.user);
        setEntryResolved(true);
        return {
          ok: true,
          user: json.data.user,
          profile: json.data.profile,
          tier: json.data.tier,
        };
      } catch {
        setLoading(false);
        setError('Connexion au serveur impossible.');
        return { ok: false };
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    const activeToken = token;
    saveAuthToken(null);
    setToken(null);
    setUser(null);
    setError(null);
    markEntryModeChosen();
    setEntryResolved(true);

    if (activeToken) {
      try {
        await fetch('/api/game/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${activeToken}`,
          },
        });
      } catch {
        // Ignore network errors on logout
      }
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
    entryResolved,
    register,
    login,
    logout,
    continueAsGuest,
  };
}
