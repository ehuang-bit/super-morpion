import type { EloMatchDelta, EloProfile, EloStakes } from './elo.js';
import type { GameState, Player } from './gameEngine.js';

export type TimeControl = 'unlimited' | 'rapid' | 'blitz';

export const TIME_CONTROL_MS: Record<TimeControl, number | null> = {
  unlimited: null,
  rapid: 180_000,
  blitz: 90_000,
};

export const TIME_CONTROL_LABELS: Record<TimeControl, string> = {
  unlimited: 'Classique',
  rapid: 'Rapide · 3 min',
  blitz: 'Blitz · 1:30',
};

/**
 * Temps maximal pour jouer un coup, quelle que soit la cadence. Il s'ajoute
 * à la pendule globale (Rapide, Blitz) : le premier des deux qui expire
 * s'applique.
 */
export const MOVE_TIME_LIMIT_MS = 25_000;

/**
 * Tolérance réseau : un coup parti juste avant la limite reste accepté
 * s'il arrive au serveur avec ce léger retard.
 */
export const MOVE_TIMEOUT_GRACE_MS = 600;

/**
 * Au-delà de la limite, un coup aléatoire est joué d'office. Après ce nombre
 * de dépassements d'affilée pour un même joueur, il perd au temps.
 */
export const MAX_CONSECUTIVE_MOVE_TIMEOUTS = 2;

/**
 * Délai entre le début de la partie et le démarrage du premier chrono,
 * le temps de présenter les deux joueurs.
 */
export const MATCH_INTRO_MS = 3_000;

/**
 * Délai avant le lancement d'un salon privé une fois que tous les joueurs
 * ont confirmé leur présence (« Prêt »).
 */
export const ROOM_READY_COUNTDOWN_MS = 3_500;

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

export type RoomMode = '1v1' | '2v2';

/** Sièges en mode 2v2 : équipe X = A & B, équipe O = C & D. */
export type TeamSeat = 'A' | 'B' | 'C' | 'D';

export const TEAM_SEAT_SYMBOL: Record<TeamSeat, Player> = {
  A: 'X',
  B: 'X',
  C: 'O',
  D: 'O',
};

/** Ordre de remplissage naturel pour équilibrer les deux équipes. */
export const TEAM_SEAT_FILL_ORDER: readonly TeamSeat[] = ['A', 'C', 'B', 'D'];

/** Ordre des tours en 2v2 : A puis C puis B puis D (ou C → A → D → B si O ouvre). */
export function getTurnSeatOrder(startingPlayer: Player = 'X'): readonly TeamSeat[] {
  return startingPlayer === 'X' ? ['A', 'C', 'B', 'D'] : ['C', 'A', 'D', 'B'];
}

export type EmoteId = 'fire' | 'clap' | 'oops' | 'mindblown' | 'clock' | 'gg';

export const EMOTE_IDS: readonly EmoteId[] = [
  'fire',
  'clap',
  'oops',
  'mindblown',
  'clock',
  'gg',
];

export interface RoomEmote {
  id: string;
  emote: EmoteId;
  senderId: string;
  senderPseudo: string;
  senderSymbol: Player;
  senderSeat?: TeamSeat | null;
  sentAt: number;
}

export interface RoomPlayer {
  id: string;
  pseudo: string;
  symbol: Player;
  /** Siège en 2v2 (A/B pour X, C/D pour O). */
  seat?: TeamSeat;
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
  /** Mode du salon : 1v1 classique ou 2v2 en équipes (AB vs CD). */
  mode: RoomMode;
  phase: 'waiting' | 'playing' | 'finished';
  /** Vrai pour un salon créé manuellement : attend que tous confirment + décompte avant de lancer. */
  requireConfirm: boolean;
  /** Identifiants des joueurs ayant confirmé (« Prêt ») en salle d'attente. */
  readyPlayerIds: string[];
  /** Horodatage serveur (ms) de fin du compte à rebours une fois tous prêts, sinon null. */
  countdownEndsAt: number | null;
  timeControl: TimeControl;
  initialTimeMs: number | null;
  players: {
    X: RoomPlayer | null;
    O: RoomPlayer | null;
  };
  /** En 2v2, détail des 4 sièges (A/B = équipe X, C/D = équipe O). */
  seats: Record<TeamSeat, RoomPlayer | null> | null;
  /** En 2v2 pendant la partie, siège dont c'est exactement le tour. */
  activeSeat: TeamSeat | null;
  /** Nombre de spectateurs connectés en direct. */
  spectatorCount: number;
  /** Dernier tampon / emote envoyé dans le salon. */
  lastEmote: RoomEmote | null;
  gameState: GameState;
  clocks: {
    X: number;
    O: number;
  } | null;
  turnStartedAt: number | null;
  /** Temps accordé pour chaque coup (voir `MOVE_TIME_LIMIT_MS`). */
  moveTimeLimitMs: number;
  /** Dépassements d'affilée de la limite par coup, pour chaque joueur/équipe. */
  moveTimeouts: {
    X: number;
    O: number;
  };
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
  /** Présent si ce salon appartient à un tournoi à élimination directe. */
  tournament?: RoomTournamentMeta | null;
}

export type TournamentSize = 4 | 8 | 16;

export type TournamentPhase = 'lobby' | 'running' | 'finished';

/** Clé de phase du tableau (traduite côté interface). */
export type TournamentRoundKey = 'r16' | 'qf' | 'sf' | 'final';

export interface RoomTournamentMeta {
  code: string;
  name: string;
  matchId: string;
  roundKey: TournamentRoundKey;
}

export interface TournamentParticipant {
  id: string;
  profileKey: string;
  pseudo: string;
  elo: number;
  tier: string;
  seed: number;
  joinedAt: number;
}

export type TournamentMatchStatus =
  | 'pending'
  | 'ready'
  | 'live'
  | 'finished'
  | 'bye';

export interface TournamentMatch {
  id: string;
  roundIndex: number;
  matchIndex: number;
  roundKey: TournamentRoundKey;
  playerA: TournamentParticipant | null;
  playerB: TournamentParticipant | null;
  status: TournamentMatchStatus;
  roomCode: string | null;
  winnerId: string | null;
  endReason: EndReason | 'forfeit' | 'bye' | null;
  needsTiebreak?: boolean;
  finishedAt: number | null;
}

export interface TournamentRound {
  roundIndex: number;
  roundKey: TournamentRoundKey;
  matches: TournamentMatch[];
}

export interface TournamentSnapshot {
  code: string;
  name: string;
  size: TournamentSize;
  timeControl: TimeControl;
  phase: TournamentPhase;
  hostId: string;
  participants: TournamentParticipant[];
  rounds: TournamentRound[];
  championId: string | null;
  runnerUpId: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  serverNow: number;
}

export interface RoomPeekInfo {
  code: string;
  mode: RoomMode;
  phase: 'waiting' | 'playing' | 'finished';
  timeControl: TimeControl;
  hostPseudo: string | null;
  isFull: boolean;
  playerCount: number;
  maxPlayers: number;
  spectatorCount: number;
}

export type AuthProvider =
  | 'password'
  | 'google'
  | 'apple'
  | 'microsoft'
  | 'email';

export interface AccountStreak {
  /** Série actuelle en jours consécutifs (0 si rompue ou jamais commencée). */
  current: number;
  /** Meilleure série historique du compte. */
  best: number;
  /** Dernier jour d'activité validé (YYYY-MM-DD UTC), ou null. */
  lastActiveDate: string | null;
  /** Indique si la journée en cours est déjà validée. */
  activeToday: boolean;
  /** Vrai si une série est en cours mais pas encore validée aujourd'hui. */
  atRisk: boolean;
  /** Nombre total de jours distincts avec activité. */
  totalActiveDays: number;
  /** Activité des 7 derniers jours (du plus ancien à aujourd'hui). */
  recentDays: { date: string; active: boolean }[];
}

export interface AuthUser {
  id: string;
  /** Pseudo du compte : unique, sert à se connecter et figure au classement. */
  username: string;
  /** Nom affiché en partie, choisi librement. Absent ou null : `username`. */
  gameName?: string | null;
  /** Adresse e-mail associée au compte (visible uniquement par son propriétaire). */
  email?: string | null;
  createdAt: number;
  provider?: AuthProvider;
  avatarUrl?: string | null;
  /** Flamme quotidienne réservée aux comptes inscrits (jamais aux invités). */
  streak?: AccountStreak;
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
  /** Flamme quotidienne du compte (null pour les invités). */
  accountStreak?: AccountStreak | null;
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
  /** Série quotidienne active du compte (jours consécutifs). */
  dailyStreak?: number;
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
