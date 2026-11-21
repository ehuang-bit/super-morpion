import type { EloMatchDelta, EloProfile, EloStakes } from './elo.js';
import type { GameState, Player } from './gameEngine.js';

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

/**
 * `aborted` : partie annulée avant que chaque joueur ait joué son premier
 * coup (abandon, temps écoulé ou départ). Elle n'est pas classée.
 */
export type EndReason =
  | 'alignment'
  | 'draw'
  | 'timeout'
  | 'resign'
  | 'abandoned'
  | 'aborted';

export interface RoomPlayer {
  id: string;
  pseudo: string;
  symbol: Player;
  connected: boolean;
  score: number;
  elo: number;
  /** Déviation Glicko du joueur. */
  rd: number;
  provisional: boolean;
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

export type AuthProvider =
  | 'password'
  | 'google'
  | 'apple'
  | 'microsoft'
  | 'email';

export interface AuthUser {
  id: string;
  username: string;
  createdAt: number;
  provider?: AuthProvider;
  avatarUrl?: string | null;
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
  provisional: boolean;
  /** Pourcentage de joueurs classés ayant un classement inférieur. */
  percentile: number | null;
  rankedPlayers: number;
}

export interface LeaderboardEntry {
  rank: number;
  pseudo: string;
  rating: number;
  rd: number;
  provisional: boolean;
  gamesPlayed: number;
  wins: number;
  tier: string;
  isSelf: boolean;
}

export interface LeaderboardPayload {
  entries: LeaderboardEntry[];
  /** Rang du joueur courant s'il n'apparaît pas dans la liste. */
  selfRank: number | null;
  minGames: number;
}

export interface LobbyStats {
  liveGames: number;
  queue: Record<TimeControl, number>;
  playersOnline: number;
}

export interface ActionAck<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}
