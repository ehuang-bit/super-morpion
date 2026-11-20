import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  createDefaultEloProfile,
  getEloTier,
  type EloProfile,
} from '@shared/elo';
import type { Move } from '@shared/gameEngine';
import type {
  ClientToServerEvents,
  RoomPeekInfo,
  RoomSnapshot,
  ServerToClientEvents,
  TimeControl,
} from '@shared/protocol';
import { haptics } from '../utils/haptics';
import { soundEngine } from '../utils/soundEngine';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_URL = import.meta.env.VITE_SERVER_URL?.trim() || undefined;

export type ConnectionStatus = 'connecting' | 'connected' | 'offline';

export interface MatchmakingState {
  searching: boolean;
  timeControl: TimeControl | null;
  queueSize: number;
}

export function useSocketGame(playerId: string, profileId: string) {
  const socketRef = useRef<TypedSocket | null>(null);
  const prevSnapshotRef = useRef<RoomSnapshot | null>(null);
  const activeSeatRef = useRef<{ code: string; pseudo: string } | null>(null);

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

  const handleIncomingSnapshot = useCallback(
    (next: RoomSnapshot) => {
      const prev = prevSnapshotRef.current;

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
      setError(null);
    },
    [playerId],
  );

  useEffect(() => {
    const socket: TypedSocket = io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: SERVER_URL ? Infinity : 5,
      reconnectionDelay: 700,
      reconnectionDelayMax: 3000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setConnectionStatus('connected');
      const seat = activeSeatRef.current;
      if (seat) {
        socket.emit(
          'room:join',
          { code: seat.code, playerId, profileId, pseudo: seat.pseudo },
          (res) => {
            if (res.ok && res.data) {
              handleIncomingSnapshot(res.data.snapshot);
            }
          },
        );
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setConnectionStatus('connecting');
    });

    socket.on('connect_error', () => {
      setConnected(false);
      setConnectionStatus('offline');
    });

    socket.io.on('reconnect_failed', () => {
      setConnected(false);
      setConnectionStatus('offline');
    });

    socket.on('room:state', (nextSnapshot) => {
      handleIncomingSnapshot(nextSnapshot);
    });

    socket.on('room:error', (payload) => {
      setError(payload.message);
    });

    socket.on('profile:updated', (payload) => {
      setPlayerElo(payload);
    });

    socket.on('matchmaking:status', (status) => {
      setMatchmaking({
        searching: status.searching,
        timeControl: status.timeControl ?? null,
        queueSize: status.queueSize,
      });
    });

    socket.on('matchmaking:matched', (payload) => {
      const seatedPlayer =
        payload.snapshot.players.X?.id === playerId
          ? payload.snapshot.players.X
          : payload.snapshot.players.O;
      activeSeatRef.current = {
        code: payload.code,
        pseudo: seatedPlayer?.pseudo ?? 'Joueur',
      };
      setMatchmaking({ searching: false, timeControl: null, queueSize: 0 });
      handleIncomingSnapshot(payload.snapshot);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [playerId, profileId, handleIncomingSnapshot]);

  const fetchProfile = useCallback(
    (pseudo: string) => {
      const socket = socketRef.current;
      if (!socket || !socket.connected) return;
      socket.emit('profile:fetch', { profileId, pseudo }, (res) => {
        if (res.ok && res.data) {
          setPlayerElo(res.data);
        }
      });
    },
    [profileId],
  );

  const clearError = useCallback(() => setError(null), []);

  const createRoom = useCallback(
    (params: { pseudo: string; timeControl: TimeControl }): Promise<RoomSnapshot | null> => {
      const socket = socketRef.current;
      if (!socket) return Promise.resolve(null);
      setIsBusy(true);
      setError(null);

      return new Promise((resolve) => {
        socket.emit(
          'room:create',
          {
            playerId,
            profileId,
            pseudo: params.pseudo,
            timeControl: params.timeControl,
          },
          (res) => {
            setIsBusy(false);
            if (!res.ok || !res.data) {
              setError(res.error ?? 'Impossible de créer le salon.');
              resolve(null);
              return;
            }
            activeSeatRef.current = {
              code: res.data.snapshot.code,
              pseudo: params.pseudo,
            };
            handleIncomingSnapshot(res.data.snapshot);
            resolve(res.data.snapshot);
          },
        );
      });
    },
    [playerId, profileId, handleIncomingSnapshot],
  );

  const peekRoom = useCallback((code: string): Promise<RoomPeekInfo | null> => {
    const socket = socketRef.current;
    if (!socket) return Promise.resolve(null);
    setPeekError(null);

    return new Promise((resolve) => {
      socket.emit('room:peek', { code }, (res) => {
        if (!res.ok || !res.data) {
          setPeekInfo(null);
          setPeekError(res.error ?? 'Salon introuvable ou expiré.');
          resolve(null);
          return;
        }
        setPeekInfo(res.data.info);
        setPeekError(null);
        resolve(res.data.info);
      });
    });
  }, []);

  const joinRoom = useCallback(
    (params: { code: string; pseudo: string }): Promise<RoomSnapshot | null> => {
      const socket = socketRef.current;
      if (!socket) return Promise.resolve(null);
      setIsBusy(true);
      setError(null);

      return new Promise((resolve) => {
        socket.emit(
          'room:join',
          {
            code: params.code,
            playerId,
            profileId,
            pseudo: params.pseudo,
          },
          (res) => {
            setIsBusy(false);
            if (!res.ok || !res.data) {
              setError(res.error ?? 'Impossible de rejoindre ce salon.');
              resolve(null);
              return;
            }
            activeSeatRef.current = {
              code: res.data.snapshot.code,
              pseudo: params.pseudo,
            };
            setPeekInfo(null);
            setPeekError(null);
            handleIncomingSnapshot(res.data.snapshot);
            resolve(res.data.snapshot);
          },
        );
      });
    },
    [playerId, profileId, handleIncomingSnapshot],
  );

  const playMove = useCallback(
    (move: Move) => {
      const socket = socketRef.current;
      const current = prevSnapshotRef.current;
      if (!socket || !current) return;

      socket.emit(
        'room:move',
        {
          code: current.code,
          playerId,
          move,
        },
        (res) => {
          if (!res.ok && res.error) {
            setError(res.error);
          }
        },
      );
    },
    [playerId],
  );

  const resign = useCallback(() => {
    const socket = socketRef.current;
    const current = prevSnapshotRef.current;
    if (!socket || !current) return;

    socket.emit('room:resign', { code: current.code, playerId });
  }, [playerId]);

  const requestRematch = useCallback(() => {
    const socket = socketRef.current;
    const current = prevSnapshotRef.current;
    if (!socket || !current) return;

    socket.emit('room:rematch', { code: current.code, playerId });
  }, [playerId]);

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    const current = prevSnapshotRef.current;
    activeSeatRef.current = null;
    prevSnapshotRef.current = null;
    setSnapshot(null);
    setPeekInfo(null);
    setPeekError(null);
    setError(null);

    if (socket && current) {
      socket.emit('room:leave', { code: current.code, playerId });
    }
  }, [playerId]);

  const joinMatchmaking = useCallback(
    (params: { pseudo: string; timeControl: TimeControl }) => {
      const socket = socketRef.current;
      if (!socket) return;
      setError(null);
      setMatchmaking({
        searching: true,
        timeControl: params.timeControl,
        queueSize: 1,
      });

      socket.emit('matchmaking:join', {
        playerId,
        profileId,
        pseudo: params.pseudo,
        timeControl: params.timeControl,
      });
    },
    [playerId, profileId],
  );

  const cancelMatchmaking = useCallback(() => {
    const socket = socketRef.current;
    setMatchmaking({ searching: false, timeControl: null, queueSize: 0 });
    if (socket) {
      socket.emit('matchmaking:cancel', { playerId });
    }
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
    fetchProfile,
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
