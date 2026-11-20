import type { EloMatchDelta, EloProfile, EloStakes } from './elo.js';
import type { GameState, Move, Player } from './gameEngine.js';

export type TimeControl = 'unlimited' | 'rapid' | 'blitz';

export const TIME_CONTROL_MS: Record<TimeControl, number | null> = {
  unlimited: null,
  rapid: 180_000,
  blitz: 90_000,
};

export const TIME_CONTROL_LABELS: Record<TimeControl, string> = {
  unlimited: 'Illimité',
  rapid: 'Rapide · 3 min',
  blitz: 'Blitz · 1:30',
};

export type EndReason = 'alignment' | 'draw' | 'timeout' | 'resign' | 'abandoned';

export interface RoomPlayer {
  id: string;
  pseudo: string;
  symbol: Player;
  connected: boolean;
  score: number;
  elo: number;
  gamesPlayed: number;
  tier: string;
}

export interface RoomSnapshot {
  code: string;
  phase: 'waiting' | 'playing' | 'finished';
  timeControl: TimeControl;
  initialTimeMs: number | null;
  players: {
    X: RoomPlayer | null;
    O: RoomPlayer | null;
  };
  gameState: GameState;
  clocks: {
    X: number;
    O: number;
  } | null;
  turnStartedAt: number | null;
  serverNow: number;
  endReason: EndReason | null;
  matchWinner: Player | null;
  rematchVotes: string[];
  gameNumber: number;
  eloStakes: EloStakes | null;
  eloResult: {
    X: EloMatchDelta;
    O: EloMatchDelta;
  } | null;
}

export interface RoomPeekInfo {
  code: string;
  phase: 'waiting' | 'playing' | 'finished';
  timeControl: TimeControl;
  hostPseudo: string | null;
  isFull: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  createdAt: number;
}

export interface MatchHistoryItem {
  id: number;
  roomCode: string;
  opponentPseudo: string;
  opponentElo: number;
  playerSymbol: Player;
  result: 'win' | 'draw' | 'loss';
  endReason: EndReason;
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
  movesCount: number;
  timeControl: TimeControl;
  playedAt: number;
}

export interface PlayerStatsPayload {
  profile: EloProfile;
  tier: string;
  nextTier: { label: string; min: number } | null;
  winRate: number;
  matches: MatchHistoryItem[];
  eloHistory: { rating: number; playedAt: number }[];
}

export interface ActionAck<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ClientToServerEvents {
  'room:create': (
    payload: {
      playerId: string;
      profileId?: string;
      pseudo: string;
      timeControl: TimeControl;
    },
    ack?: (res: ActionAck<{ snapshot: RoomSnapshot }>) => void,
  ) => void;
  'room:join': (
    payload: {
      code: string;
      playerId: string;
      profileId?: string;
      pseudo: string;
    },
    ack?: (res: ActionAck<{ snapshot: RoomSnapshot }>) => void,
  ) => void;
  'room:peek': (
    payload: { code: string },
    ack?: (res: ActionAck<{ info: RoomPeekInfo }>) => void,
  ) => void;
  'room:move': (
    payload: { code: string; playerId: string; move: Move },
    ack?: (res: ActionAck) => void,
  ) => void;
  'room:resign': (
    payload: { code: string; playerId: string },
    ack?: (res: ActionAck) => void,
  ) => void;
  'room:rematch': (
    payload: { code: string; playerId: string },
    ack?: (res: ActionAck) => void,
  ) => void;
  'room:leave': (
    payload: { code: string; playerId: string },
    ack?: (res: ActionAck) => void,
  ) => void;
  'matchmaking:join': (
    payload: {
      playerId: string;
      profileId?: string;
      pseudo: string;
      timeControl: TimeControl;
    },
    ack?: (res: ActionAck<{ queueSize: number }>) => void,
  ) => void;
  'matchmaking:cancel': (
    payload: { playerId: string },
    ack?: (res: ActionAck) => void,
  ) => void;
  'profile:fetch': (
    payload: { profileId: string; pseudo: string },
    ack?: (res: ActionAck<{ profile: EloProfile; tier: string }>) => void,
  ) => void;
}

export interface ServerToClientEvents {
  'room:state': (snapshot: RoomSnapshot) => void;
  'room:error': (payload: { message: string }) => void;
  'matchmaking:status': (payload: {
    searching: boolean;
    timeControl?: TimeControl;
    queueSize: number;
  }) => void;
  'matchmaking:matched': (payload: {
    code: string;
    snapshot: RoomSnapshot;
  }) => void;
  'profile:updated': (payload: { profile: EloProfile; tier: string }) => void;
}
