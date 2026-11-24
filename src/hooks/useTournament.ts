import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RoomSnapshot,
  TimeControl,
  TournamentSize,
  TournamentSnapshot,
} from '@shared/protocol';
import { normalizeRoomCode } from '../utils/format';

interface ApiResponse<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

const LAST_TOURNAMENT_KEY = 'sm_last_tournament_code';

export function getSavedTournamentCode(): string | null {
  try {
    const raw = window.sessionStorage.getItem(LAST_TOURNAMENT_KEY);
    if (!raw) return null;
    const norm = normalizeRoomCode(raw);
    return norm.length === 6 ? norm : null;
  } catch {
    return null;
  }
}

export function saveTournamentCode(code: string | null): void {
  try {
    if (!code) window.sessionStorage.removeItem(LAST_TOURNAMENT_KEY);
    else window.sessionStorage.setItem(LAST_TOURNAMENT_KEY, code);
  } catch {
    // ignore
  }
}

async function tournamentRequest<T>(
  path: string,
  options: RequestInit = {},
  authToken?: string | null,
): Promise<ApiResponse<T>> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };
    const res = await fetch(`/api/game${path}`, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers ?? {}),
      },
    });
    return (await res.json()) as ApiResponse<T>;
  } catch {
    return { ok: false, error: 'Connexion au serveur impossible.' };
  }
}

export function useTournament(
  playerId: string,
  profileId: string,
  authToken: string | null,
) {
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyMatchId, setBusyMatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const versionRef = useRef<number>(0);
  const authTokenRef = useRef<string | null>(authToken);
  authTokenRef.current = authToken;

  const applySnapshot = useCallback((next: TournamentSnapshot, version: number) => {
    versionRef.current = version;
    saveTournamentCode(next.code);
    setSnapshot(next);
    setError(null);
  }, []);

  const clearTournament = useCallback(() => {
    versionRef.current = 0;
    saveTournamentCode(null);
    setSnapshot(null);
    setError(null);
  }, []);

  const loadTournament = useCallback(
    async (rawCode: string, silent = false): Promise<TournamentSnapshot | null> => {
      const code = normalizeRoomCode(rawCode);
      if (code.length !== 6) {
        if (!silent) setError('Code de tournoi invalide.');
        return null;
      }
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      const query = silent && versionRef.current > 0 ? `?version=${versionRef.current}` : '';
      const res = await tournamentRequest<{
        unchanged?: boolean;
        snapshot?: TournamentSnapshot;
        version?: number;
      }>(`/tournaments/${code}${query}`, { method: 'GET' }, authTokenRef.current);

      if (!silent) setLoading(false);

      if (!res.ok || !res.data) {
        if (!silent) setError(res.error ?? 'Tournoi introuvable ou expiré.');
        return null;
      }
      if (res.data.unchanged) {
        return null;
      }
      if (res.data.snapshot && typeof res.data.version === 'number') {
        applySnapshot(res.data.snapshot, res.data.version);
        return res.data.snapshot;
      }
      return null;
    },
    [applySnapshot],
  );

  const createTournament = useCallback(
    async (params: {
      name: string;
      size: TournamentSize;
      timeControl: TimeControl;
      pseudo: string;
    }): Promise<TournamentSnapshot | null> => {
      setLoading(true);
      setError(null);
      const res = await tournamentRequest<{
        snapshot: TournamentSnapshot;
        version: number;
      }>(
        '/tournaments',
        {
          method: 'POST',
          body: JSON.stringify({
            playerId,
            profileId,
            pseudo: params.pseudo,
            name: params.name,
            size: params.size,
            timeControl: params.timeControl,
          }),
        },
        authTokenRef.current,
      );
      setLoading(false);
      if (!res.ok || !res.data) {
        setError(res.error ?? 'Création du tournoi impossible.');
        return null;
      }
      applySnapshot(res.data.snapshot, res.data.version);
      return res.data.snapshot;
    },
    [playerId, profileId, applySnapshot],
  );

  const joinTournament = useCallback(
    async (params: {
      code: string;
      pseudo: string;
    }): Promise<TournamentSnapshot | null> => {
      const code = normalizeRoomCode(params.code);
      if (code.length !== 6) {
        setError('Code de tournoi invalide.');
        return null;
      }
      setLoading(true);
      setError(null);
      const res = await tournamentRequest<{
        snapshot: TournamentSnapshot;
        version: number;
      }>(
        `/tournaments/${code}/join`,
        {
          method: 'POST',
          body: JSON.stringify({
            playerId,
            profileId,
            pseudo: params.pseudo,
          }),
        },
        authTokenRef.current,
      );
      setLoading(false);
      if (!res.ok || !res.data) {
        // Si le tournoi est déjà lancé, on bascule en mode observation du tableau !
        const loaded = await loadTournament(code, true);
        if (loaded) {
          setError(res.error ?? null);
          return loaded;
        }
        setError(res.error ?? 'Impossible de rejoindre ce tournoi.');
        return null;
      }
      applySnapshot(res.data.snapshot, res.data.version);
      return res.data.snapshot;
    },
    [playerId, profileId, applySnapshot, loadTournament],
  );

  const leaveOrKick = useCallback(
    async (targetPlayerId?: string): Promise<boolean> => {
      if (!snapshot) return false;
      setLoading(true);
      setError(null);
      const res = await tournamentRequest<{
        deleted: boolean;
        snapshot?: TournamentSnapshot;
        version?: number;
      }>(
        `/tournaments/${snapshot.code}/leave`,
        {
          method: 'POST',
          body: JSON.stringify({
            playerId,
            ...(targetPlayerId ? { targetPlayerId } : {}),
          }),
        },
        authTokenRef.current,
      );
      setLoading(false);
      if (!res.ok || !res.data) {
        setError(res.error ?? 'Action impossible.');
        return false;
      }
      if (res.data.deleted || !targetPlayerId || targetPlayerId === playerId) {
        clearTournament();
      } else if (res.data.snapshot && typeof res.data.version === 'number') {
        applySnapshot(res.data.snapshot, res.data.version);
      }
      return true;
    },
    [snapshot, playerId, applySnapshot, clearTournament],
  );

  const startTournament = useCallback(async (): Promise<boolean> => {
    if (!snapshot) return false;
    setLoading(true);
    setError(null);
    const res = await tournamentRequest<{
      snapshot: TournamentSnapshot;
      version: number;
    }>(
      `/tournaments/${snapshot.code}/start`,
      {
        method: 'POST',
        body: JSON.stringify({ playerId }),
      },
      authTokenRef.current,
    );
    setLoading(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? 'Impossible de lancer le tournoi.');
      return false;
    }
    applySnapshot(res.data.snapshot, res.data.version);
    return true;
  }, [snapshot, playerId, applySnapshot]);

  const playMatch = useCallback(
    async (params: {
      matchId: string;
      pseudo: string;
    }): Promise<{ roomCode: string; snapshot: RoomSnapshot; version: number } | null> => {
      if (!snapshot) return null;
      setBusyMatchId(params.matchId);
      setError(null);
      const res = await tournamentRequest<{
        roomCode: string;
        snapshot: RoomSnapshot;
        version: number;
        tournament: TournamentSnapshot;
        tournamentVersion: number;
      }>(
        `/tournaments/${snapshot.code}/matches/${params.matchId}/play`,
        {
          method: 'POST',
          body: JSON.stringify({
            playerId,
            profileId,
            pseudo: params.pseudo,
          }),
        },
        authTokenRef.current,
      );
      setBusyMatchId(null);
      if (!res.ok || !res.data) {
        setError(res.error ?? 'Impossible de lancer ce match.');
        return null;
      }
      applySnapshot(res.data.tournament, res.data.tournamentVersion);
      return {
        roomCode: res.data.roomCode,
        snapshot: res.data.snapshot,
        version: res.data.version,
      };
    },
    [snapshot, playerId, profileId, applySnapshot],
  );

  const advanceMatchByForfeit = useCallback(
    async (matchId: string, winnerId: string): Promise<boolean> => {
      if (!snapshot) return false;
      setBusyMatchId(matchId);
      setError(null);
      const res = await tournamentRequest<{
        snapshot: TournamentSnapshot;
        version: number;
      }>(
        `/tournaments/${snapshot.code}/matches/${matchId}/advance`,
        {
          method: 'POST',
          body: JSON.stringify({ playerId, winnerId }),
        },
        authTokenRef.current,
      );
      setBusyMatchId(null);
      if (!res.ok || !res.data) {
        setError(res.error ?? 'Action impossible.');
        return false;
      }
      applySnapshot(res.data.snapshot, res.data.version);
      return true;
    },
    [snapshot, playerId, applySnapshot],
  );

  // Synchronisation automatique du lobby et du tableau en direct
  const activeCode = snapshot?.code ?? null;
  const activePhase = snapshot?.phase ?? null;
  useEffect(() => {
    if (!activeCode || activePhase === 'finished') return;
    let cancelled = false;
    let timerId: number | null = null;

    const tick = async () => {
      if (cancelled) return;
      if (!document.hidden) {
        await loadTournament(activeCode, true);
      }
      if (!cancelled) {
        const delay = document.hidden ? 5000 : activePhase === 'lobby' ? 1600 : 1900;
        timerId = window.setTimeout(tick, delay);
      }
    };

    timerId = window.setTimeout(tick, 1800);
    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [activeCode, activePhase, loadTournament]);

  return {
    snapshot,
    loading,
    busyMatchId,
    error,
    clearError: useCallback(() => setError(null), []),
    loadTournament,
    createTournament,
    joinTournament,
    leaveOrKick,
    startTournament,
    playMatch,
    advanceMatchByForfeit,
    clearTournament,
  };
}
