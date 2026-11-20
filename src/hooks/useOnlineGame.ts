import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createDefaultEloProfile,
  getEloTier,
  type EloProfile,
} from '@shared/elo';
import type { Move } from '@shared/gameEngine';
import type {
  PlayerStatsPayload,
  RoomPeekInfo,
  RoomSnapshot,
  TimeControl,
} from '@shared/protocol';
import { haptics } from '../utils/haptics';
import { soundEngine } from '../utils/soundEngine';

export type ConnectionStatus = 'connecting' | 'connected' | 'offline';

export interface MatchmakingState {
  searching: boolean;
  timeControl: TimeControl | null;
  queueSize: number;
}

interface ApiResponse<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  authToken?: string | null,
): Promise<ApiResponse<T>> {
  try {
    const authHeaders: Record<string, string> = authToken
      ? { Authorization: `Bearer ${authToken}` }
      : {};
    const res = await fetch(`/api/game${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...(options.headers ?? {}),
      },
    });
    const json = (await res.json()) as ApiResponse<T>;
    return json;
  } catch {
    return { ok: false, error: 'Connexion au serveur impossible.' };
  }
}

export function useOnlineGame(
  playerId: string,
  profileId: string,
  authToken: string | null = null,
) {
  const prevSnapshotRef = useRef<RoomSnapshot | null>(null);
  const versionRef = useRef<number>(0);
  const lastPseudoRef = useRef<string>('Joueur 1');
  const moveInFlightRef = useRef(false);
  const authTokenRef = useRef<string | null>(authToken);
  authTokenRef.current = authToken;

  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('connecting');
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [peekInfo, setPeekInfo] = useState<RoomPeekInfo | null>(null);
  const [peekError, setPeekError] = useState<string | null>(null);
  const [matchmaking, setMatchmaking] = useState<MatchmakingState>({
    searching: false,
    timeControl: null,
    queueSize: 0,
  });
  const [playerElo, setPlayerElo] = useState<{
    profile: EloProfile;
    tier: string;
  }>(() => {
    const def = createDefaultEloProfile();
    return { profile: def, tier: getEloTier(def.rating).label };
  });
  const [stats, setStats] = useState<PlayerStatsPayload | null>(null);
  const [statsLoading, setStatsLoading] = useState<boolean>(false);

  const fetchProfile = useCallback(
    async (pseudo: string) => {
      const clean = pseudo.trim() || 'Joueur 1';
      lastPseudoRef.current = clean;
      const res = await apiRequest<{ profile: EloProfile; tier: string }>(
        `/profile?profileId=${encodeURIComponent(profileId)}&pseudo=${encodeURIComponent(clean)}`,
        { method: 'GET' },
        authTokenRef.current,
      );
      if (res.ok && res.data) {
        setPlayerElo(res.data);
      }
    },
    [profileId],
  );

  const fetchStats = useCallback(
    async (pseudo: string) => {
      const clean = pseudo.trim() || lastPseudoRef.current || 'Joueur 1';
      lastPseudoRef.current = clean;
      setStatsLoading(true);
      const res = await apiRequest<PlayerStatsPayload>(
        `/stats?profileId=${encodeURIComponent(profileId)}&pseudo=${encodeURIComponent(clean)}`,
        { method: 'GET' },
        authTokenRef.current,
      );
      setStatsLoading(false);
      if (res.ok && res.data) {
        setStats(res.data);
        setPlayerElo({
          profile: res.data.profile,
          tier: res.data.tier,
        });
      }
    },
    [profileId],
  );

  const handleIncomingSnapshot = useCallback(
    (next: RoomSnapshot, version?: number) => {
      const prev = prevSnapshotRef.current;
      if (typeof version === 'number') {
        versionRef.current = version;
      }

      if (
        prev &&
        prev.code === next.code &&
        prev.gameNumber === next.gameNumber
      ) {
        const localSymbol =
          next.players.X?.id === playerId
            ? 'X'
            : next.players.O?.id === playerId
              ? 'O'
              : null;

        if (prev.phase === 'playing' && next.phase === 'finished') {
          if (next.matchWinner) {
            soundEngine.playVictory();
            if (localSymbol === null || localSymbol === next.matchWinner) {
              haptics.victory();
            } else {
              haptics.defeat();
            }
          } else {
            soundEngine.playDraw();
            haptics.draw();
          }
          void fetchProfile(lastPseudoRef.current);
          void fetchStats(lastPseudoRef.current);
        } else if (
          next.gameState.moveHistory.length > prev.gameState.moveHistory.length
        ) {
          const lastRecord =
            next.gameState.moveHistory[next.gameState.moveHistory.length - 1];
          if (lastRecord) {
            if (lastRecord.capturedBoard) {
              soundEngine.playCapture(lastRecord.player);
              haptics.capture();
            } else {
              soundEngine.playMove(lastRecord.player);
              if (lastRecord.triggeredFreeMove) {
                haptics.freeMove();
              } else if (lastRecord.player === localSymbol) {
                haptics.move();
              } else {
                haptics.opponentMove();
              }
            }
          }
        }
      }

      prevSnapshotRef.current = next;
      setClockOffsetMs(next.serverNow - Date.now());
      setSnapshot(next);
      setConnected(true);
      setConnectionStatus('connected');
      setError(null);
    },
    [playerId, fetchProfile, fetchStats],
  );

  // Initial health check
  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      const res = await apiRequest<{ serverNow: number }>('/health', {
        method: 'GET',
      });
      if (!active) return;
      if (res.ok) {
        setConnected(true);
        setConnectionStatus('connected');
      } else {
        setConnected(false);
        setConnectionStatus('offline');
      }
    };
    void checkHealth();
    return () => {
      active = false;
    };
  }, []);

  // Poll room state at 650ms while in a room
  const activeRoomCode = snapshot?.code ?? null;
  useEffect(() => {
    if (!activeRoomCode) return;

    let cancelled = false;
    let inFlight = false;

    const pollRoom = async () => {
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const res = await apiRequest<{
          unchanged?: boolean;
          serverNow?: number;
          snapshot?: RoomSnapshot;
          version?: number;
        }>(
          `/rooms/${encodeURIComponent(activeRoomCode)}/state?playerId=${encodeURIComponent(playerId)}&version=${versionRef.current}`,
          { method: 'GET' },
        );

        if (cancelled) return;
        if (res.ok && res.data) {
          if (res.data.snapshot) {
            handleIncomingSnapshot(res.data.snapshot, res.data.version);
          } else if (typeof res.data.serverNow === 'number') {
            setClockOffsetMs(res.data.serverNow - Date.now());
            setConnected(true);
            setConnectionStatus('connected');
          }
        } else if (res.error) {
          setError(res.error);
        }
      } finally {
        inFlight = false;
      }
    };

    const interval = window.setInterval(() => {
      void pollRoom();
    }, 650);

    const onVisibility = () => {
      if (!document.hidden) {
        void pollRoom();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [activeRoomCode, playerId, handleIncomingSnapshot]);

  // Poll matchmaking queue while searching
  useEffect(() => {
    if (!matchmaking.searching) return;

    let cancelled = false;
    let inFlight = false;

    const pollMatchmaking = async () => {
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const res = await apiRequest<{
          matched: boolean;
          code?: string;
          snapshot?: RoomSnapshot;
          version?: number;
          queueSize?: number;
          expired?: boolean;
        }>('/matchmaking/poll', {
          method: 'POST',
          body: JSON.stringify({ playerId }),
        });

        if (cancelled || !res.ok || !res.data) return;

        if (res.data.matched && res.data.snapshot) {
          setMatchmaking({ searching: false, timeControl: null, queueSize: 0 });
          handleIncomingSnapshot(res.data.snapshot, res.data.version);
        } else if (res.data.expired) {
          setMatchmaking({ searching: false, timeControl: null, queueSize: 0 });
        } else if (typeof res.data.queueSize === 'number') {
          setMatchmaking((prev) => ({
            ...prev,
            queueSize: res.data!.queueSize!,
          }));
        }
      } finally {
        inFlight = false;
      }
    };

    const interval = window.setInterval(() => {
      void pollMatchmaking();
    }, 900);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [matchmaking.searching, playerId, handleIncomingSnapshot]);

  const clearError = useCallback(() => setError(null), []);

  const createRoom = useCallback(
    async (params: {
      pseudo: string;
      timeControl: TimeControl;
    }): Promise<RoomSnapshot | null> => {
      setIsBusy(true);
      setError(null);
      lastPseudoRef.current = params.pseudo.trim() || 'Joueur 1';

      const res = await apiRequest<{ snapshot: RoomSnapshot; version: number }>(
        '/rooms',
        {
          method: 'POST',
          body: JSON.stringify({
            playerId,
            profileId,
            pseudo: params.pseudo,
            timeControl: params.timeControl,
          }),
        },
        authTokenRef.current,
      );
      setIsBusy(false);

      if (!res.ok || !res.data) {
        setError(res.error ?? 'Impossible de créer le salon.');
        return null;
      }
      handleIncomingSnapshot(res.data.snapshot, res.data.version);
      return res.data.snapshot;
    },
    [playerId, profileId, handleIncomingSnapshot],
  );

  const peekRoom = useCallback(async (code: string): Promise<RoomPeekInfo | null> => {
    setPeekError(null);
    const res = await apiRequest<{ info: RoomPeekInfo }>(
      `/rooms/${encodeURIComponent(code)}/peek`,
      { method: 'GET' },
    );
    if (!res.ok || !res.data) {
      setPeekInfo(null);
      setPeekError(res.error ?? 'Salon introuvable ou expiré.');
      return null;
    }
    setPeekInfo(res.data.info);
    setPeekError(null);
    return res.data.info;
  }, []);

  const joinRoom = useCallback(
    async (params: {
      code: string;
      pseudo: string;
    }): Promise<RoomSnapshot | null> => {
      setIsBusy(true);
      setError(null);
      lastPseudoRef.current = params.pseudo.trim() || 'Joueur 2';

      const res = await apiRequest<{ snapshot: RoomSnapshot; version: number }>(
        `/rooms/${encodeURIComponent(params.code)}/join`,
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
      setIsBusy(false);

      if (!res.ok || !res.data) {
        setError(res.error ?? 'Impossible de rejoindre ce salon.');
        return null;
      }
      setPeekInfo(null);
      setPeekError(null);
      handleIncomingSnapshot(res.data.snapshot, res.data.version);
      return res.data.snapshot;
    },
    [playerId, profileId, handleIncomingSnapshot],
  );

  const playMove = useCallback(
    async (move: Move) => {
      const current = prevSnapshotRef.current;
      if (!current || moveInFlightRef.current) return;

      moveInFlightRef.current = true;
      try {
        const res = await apiRequest<{
          snapshot?: RoomSnapshot;
          version?: number;
        }>(`/rooms/${encodeURIComponent(current.code)}/move`, {
          method: 'POST',
          body: JSON.stringify({ playerId, move }),
        });

        if (res.data?.snapshot) {
          handleIncomingSnapshot(res.data.snapshot, res.data.version);
        }
        if (!res.ok && res.error) {
          setError(res.error);
        }
      } finally {
        moveInFlightRef.current = false;
      }
    },
    [playerId, handleIncomingSnapshot],
  );

  const resign = useCallback(async () => {
    const current = prevSnapshotRef.current;
    if (!current) return;

    const res = await apiRequest<{ snapshot: RoomSnapshot; version: number }>(
      `/rooms/${encodeURIComponent(current.code)}/resign`,
      {
        method: 'POST',
        body: JSON.stringify({ playerId }),
      },
    );
    if (res.ok && res.data) {
      handleIncomingSnapshot(res.data.snapshot, res.data.version);
    } else if (res.error) {
      setError(res.error);
    }
  }, [playerId, handleIncomingSnapshot]);

  const requestRematch = useCallback(async () => {
    const current = prevSnapshotRef.current;
    if (!current) return;

    const res = await apiRequest<{ snapshot: RoomSnapshot; version: number }>(
      `/rooms/${encodeURIComponent(current.code)}/rematch`,
      {
        method: 'POST',
        body: JSON.stringify({ playerId }),
      },
    );
    if (res.ok && res.data) {
      handleIncomingSnapshot(res.data.snapshot, res.data.version);
    } else if (res.error) {
      setError(res.error);
    }
  }, [playerId, handleIncomingSnapshot]);

  const leaveRoom = useCallback(() => {
    const current = prevSnapshotRef.current;
    prevSnapshotRef.current = null;
    versionRef.current = 0;
    setSnapshot(null);
    setPeekInfo(null);
    setPeekError(null);
    setError(null);

    if (current) {
      void apiRequest(`/rooms/${encodeURIComponent(current.code)}/leave`, {
        method: 'POST',
        keepalive: true,
        body: JSON.stringify({ playerId }),
      });
    }
  }, [playerId]);

  const joinMatchmaking = useCallback(
    async (params: { pseudo: string; timeControl: TimeControl }) => {
      setError(null);
      lastPseudoRef.current = params.pseudo.trim() || 'Joueur';
      setMatchmaking({
        searching: true,
        timeControl: params.timeControl,
        queueSize: 1,
      });

      const res = await apiRequest<{
        matched: boolean;
        code?: string;
        snapshot?: RoomSnapshot;
        version?: number;
        queueSize?: number;
      }>(
        '/matchmaking/join',
        {
          method: 'POST',
          body: JSON.stringify({
            playerId,
            profileId,
            pseudo: params.pseudo,
            timeControl: params.timeControl,
          }),
        },
        authTokenRef.current,
      );

      if (!res.ok || !res.data) {
        setMatchmaking({ searching: false, timeControl: null, queueSize: 0 });
        setError(res.error ?? 'Impossible de rejoindre le matchmaking.');
        return;
      }

      if (res.data.matched && res.data.snapshot) {
        setMatchmaking({ searching: false, timeControl: null, queueSize: 0 });
        handleIncomingSnapshot(res.data.snapshot, res.data.version);
      } else if (typeof res.data.queueSize === 'number') {
        setMatchmaking((prev) => ({
          ...prev,
          queueSize: res.data!.queueSize!,
        }));
      }
    },
    [playerId, profileId, handleIncomingSnapshot],
  );

  const cancelMatchmaking = useCallback(() => {
    setMatchmaking({ searching: false, timeControl: null, queueSize: 0 });
    void apiRequest('/matchmaking/cancel', {
      method: 'POST',
      keepalive: true,
      body: JSON.stringify({ playerId }),
    });
  }, [playerId]);

  return {
    connected,
    connectionStatus,
    snapshot,
    clockOffsetMs,
    error,
    clearError,
    isBusy,
    peekInfo,
    peekError,
    matchmaking,
    playerElo,
    stats,
    statsLoading,
    fetchProfile,
    fetchStats,
    createRoom,
    peekRoom,
    joinRoom,
    playMove,
    resign,
    requestRematch,
    leaveRoom,
    joinMatchmaking,
    cancelMatchmaking,
  };
}
