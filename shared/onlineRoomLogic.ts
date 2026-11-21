import {
  INITIAL_RD,
  INITIAL_VOLATILITY,
  applyOutcomeToProfile,
  calculateRatingUpdate,
  getEloStakes,
  getEloTier,
  inflateDeviation,
  isProvisional,
  type EloMatchDelta,
  type EloProfile,
} from './elo.js';
import {
  applyMove,
  createInitialState,
  getLegalMoves,
  getOpponent,
  type GameState,
  type Move,
  type MoveErrorCode,
  type Player,
} from './gameEngine.js';
import {
  EMOTE_IDS,
  MATCH_INTRO_MS,
  MAX_CONSECUTIVE_MOVE_TIMEOUTS,
  MOVE_TIMEOUT_GRACE_MS,
  MOVE_TIME_LIMIT_MS,
  TEAM_SEAT_FILL_ORDER,
  TEAM_SEAT_SYMBOL,
  TIME_CONTROL_MS,
  getTurnSeatOrder,
  type EmoteId,
  type EndReason,
  type RoomEmote,
  type RoomMode,
  type RoomPeekInfo,
  type RoomPlayer,
  type RoomSnapshot,
  type TeamSeat,
  type TimeControl,
} from './protocol.js';

export const PRESENCE_ONLINE_MS = 12_000;
export const DISCONNECT_FORFEIT_MS = 60_000;
export const PRESENCE_HEARTBEAT_WRITE_MS = 3_500;
export const SPECTATOR_TTL_MS = 25_000;
export const EMOTE_COOLDOWN_MS = 1_800;
export const EMOTE_VISIBLE_MS = 6_000;

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ALL_SEATS: readonly TeamSeat[] = ['A', 'B', 'C', 'D'];

export interface StoredPlayer extends RoomPlayer {
  profileKey: string;
  lastSeenAt: number;
  volatility?: number;
}

export interface StoredSpectator {
  id: string;
  pseudo: string;
  lastSeenAt: number;
}

/**
 * Nombre minimal de coups pour qu'une partie soit classée : comme aux échecs
 * en ligne, si l'un des joueurs n'a pas encore joué son premier coup,
 * la partie est annulée au lieu d'être perdue.
 *
 * Les coups joués d'office (temps par coup dépassé) ne comptent pas : chaque
 * joueur doit avoir joué lui-même au moins une fois.
 */
export const MIN_MOVES_FOR_RATED_GAME = 2;

function bothPlayersHavePlayed(gameState: GameState): boolean {
  let x = false;
  let o = false;
  for (const record of gameState.moveHistory) {
    if (record.auto) continue;
    if (record.player === 'X') x = true;
    else o = true;
  }
  return x && o;
}

export interface StoredRoom {
  code: string;
  /** Mode du salon : 1v1 (par défaut) ou 2v2 en équipes (AB vs CD). */
  mode?: RoomMode;
  phase: 'waiting' | 'playing' | 'finished';
  timeControl: TimeControl;
  initialTimeMs: number | null;
  players: {
    X: StoredPlayer | null;
    O: StoredPlayer | null;
  };
  /** En 2v2, les 4 sièges A/B (équipe X) et C/D (équipe O). */
  seats?: Record<TeamSeat, StoredPlayer | null>;
  /** Spectateurs ayant rejoint le salon via le code après qu'il soit complet. */
  spectators?: Record<string, StoredSpectator>;
  /** Dernier emote / tampon envoyé dans le salon. */
  lastEmote?: RoomEmote | null;
  /** Horodatage du dernier emote par joueur (anti-spam). */
  lastEmoteByPlayer?: Record<string, number>;
  gameState: GameState;
  clocks: {
    X: number;
    O: number;
  } | null;
  /**
   * Début du chrono du coup en cours. Peut être dans le futur juste après
   * le lancement de la partie (présentation des joueurs).
   */
  turnStartedAt: number | null;
  /**
   * Dépassements d'affilée de la limite par coup. Absent des salons créés
   * avant l'introduction de cette règle.
   */
  moveTimeouts?: {
    X: number;
    O: number;
  };
  endReason: EndReason | null;
  matchWinner: Player | null;
  rematchVotes: string[];
  gameNumber: number;
  eloResult: {
    X: EloMatchDelta;
    O: EloMatchDelta;
  } | null;
  lastActivityAt: number;
}

const MOVE_ERROR_MESSAGES: Record<MoveErrorCode, string> = {
  GAME_OVER: 'La partie est déjà terminée.',
  NOT_YOUR_TURN: 'Ce n’est pas votre tour.',
  OUT_OF_BOUNDS: 'Coordonnées invalides.',
  WRONG_SUBBOARD: 'Vous devez jouer dans la sous-grille active.',
  SUBBOARD_LOCKED: 'Cette sous-grille est déjà verrouillée.',
  CELL_OCCUPIED: 'Cette case est déjà occupée.',
};

export function normalizeRoomCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export function sanitizePseudo(pseudo: string): string {
  const cleaned = pseudo.replace(/\s+/g, ' ').trim().slice(0, 20);
  return cleaned.length > 0 ? cleaned : 'Joueur';
}

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function makeProfileKey(
  profileId: string | undefined,
  pseudo: string,
): string {
  const cleanId =
    (profileId ?? 'anon').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'anon';
  const cleanPseudo = sanitizePseudo(pseudo).toLowerCase();
  return `${cleanId}:${cleanPseudo}`;
}

export function getRoomMode(room: StoredRoom): RoomMode {
  return room.mode === '2v2' ? '2v2' : '1v1';
}

export function getRoomActiveSeat(room: StoredRoom): TeamSeat | null {
  if (getRoomMode(room) !== '2v2') return null;
  if (room.phase !== 'playing') return null;
  const order = getTurnSeatOrder(room.gameState.startingPlayer);
  return order[room.gameState.moveHistory.length % 4];
}

export function findPlayerInRoom(
  room: StoredRoom,
  playerId: string,
): { symbol: Player; seat: TeamSeat | null; player: StoredPlayer } | null {
  if (getRoomMode(room) === '2v2' && room.seats) {
    for (const seat of ALL_SEATS) {
      const p = room.seats[seat];
      if (p && p.id === playerId) {
        return { symbol: TEAM_SEAT_SYMBOL[seat], seat, player: p };
      }
    }
    return null;
  }
  if (room.players.X?.id === playerId) {
    return { symbol: 'X', seat: null, player: room.players.X };
  }
  if (room.players.O?.id === playerId) {
    return { symbol: 'O', seat: null, player: room.players.O };
  }
  return null;
}

function getAllSeatedPlayers(room: StoredRoom): StoredPlayer[] {
  if (getRoomMode(room) === '2v2' && room.seats) {
    return ALL_SEATS.map((s) => room.seats![s]).filter(
      (p): p is StoredPlayer => p !== null,
    );
  }
  return [room.players.X, room.players.O].filter(
    (p): p is StoredPlayer => p !== null,
  );
}

function syncTeamRepresentatives(room: StoredRoom): void {
  if (getRoomMode(room) !== '2v2' || !room.seats) return;
  room.players.X = room.seats.A ?? room.seats.B ?? null;
  room.players.O = room.seats.C ?? room.seats.D ?? null;
}

function awardWinScore(room: StoredRoom, winner: Player): void {
  if (getRoomMode(room) === '2v2' && room.seats) {
    const teamSeats: readonly TeamSeat[] = winner === 'X' ? ['A', 'B'] : ['C', 'D'];
    for (const seat of teamSeats) {
      if (room.seats[seat]) {
        room.seats[seat]!.score += 1;
      }
    }
    syncTeamRepresentatives(room);
    return;
  }
  if (room.players[winner]) {
    room.players[winner]!.score += 1;
  }
}

function activeSpectatorCount(room: StoredRoom, now: number): number {
  if (!room.spectators) return 0;
  let count = 0;
  for (const spec of Object.values(room.spectators)) {
    if (now - spec.lastSeenAt < SPECTATOR_TTL_MS) {
      count += 1;
    }
  }
  return count;
}

function pruneStaleSpectators(room: StoredRoom, now: number): void {
  if (!room.spectators) return;
  for (const [id, spec] of Object.entries(room.spectators)) {
    if (now - spec.lastSeenAt >= SPECTATOR_TTL_MS) {
      delete room.spectators[id];
    }
  }
}

function cloneRoom(room: StoredRoom): StoredRoom {
  const clonedSeats = room.seats
    ? {
        A: room.seats.A ? { ...room.seats.A } : null,
        B: room.seats.B ? { ...room.seats.B } : null,
        C: room.seats.C ? { ...room.seats.C } : null,
        D: room.seats.D ? { ...room.seats.D } : null,
      }
    : undefined;

  const clonedSpectators = room.spectators
    ? Object.fromEntries(
        Object.entries(room.spectators).map(([id, s]) => [id, { ...s }]),
      )
    : undefined;

  return {
    ...room,
    players: {
      X: room.players.X ? { ...room.players.X } : null,
      O: room.players.O ? { ...room.players.O } : null,
    },
    ...(clonedSeats ? { seats: clonedSeats } : {}),
    ...(clonedSpectators ? { spectators: clonedSpectators } : {}),
    ...(room.lastEmote ? { lastEmote: { ...room.lastEmote } } : {}),
    ...(room.lastEmoteByPlayer
      ? { lastEmoteByPlayer: { ...room.lastEmoteByPlayer } }
      : {}),
    clocks: room.clocks ? { ...room.clocks } : null,
    ...(room.moveTimeouts ? { moveTimeouts: { ...room.moveTimeouts } } : {}),
    rematchVotes: [...room.rematchVotes],
    eloResult: room.eloResult
      ? {
          X: { ...room.eloResult.X },
          O: { ...room.eloResult.O },
        }
      : null,
  };
}

function buildStoredPlayer(params: {
  playerId: string;
  profileKey: string;
  pseudo: string;
  symbol: Player;
  seat?: TeamSeat;
  eloProfile: EloProfile;
  now: number;
}): StoredPlayer {
  const rd = inflateDeviation(params.eloProfile, params.now);
  return {
    id: params.playerId,
    pseudo: sanitizePseudo(params.pseudo),
    symbol: params.symbol,
    ...(params.seat ? { seat: params.seat } : {}),
    connected: true,
    score: 0,
    elo: params.eloProfile.rating,
    rd,
    provisional: isProvisional(rd),
    volatility: params.eloProfile.volatility,
    gamesPlayed: params.eloProfile.gamesPlayed,
    tier: getEloTier(params.eloProfile.rating).label,
    profileKey: params.profileKey,
    lastSeenAt: params.now,
  };
}

/**
 * Termine la partie au profit de `winner`, ou l'annule si l'un des joueurs
 * n'a pas encore joué (abandon, temps ou départ avant le 2e coup).
 */
function finishRoom(
  next: StoredRoom,
  winner: Player,
  reason: 'timeout' | 'resign' | 'abandoned',
  now: number,
): { endedWinner: Player | null; endReason: EndReason } {
  next.phase = 'finished';
  next.turnStartedAt = null;
  next.lastActivityAt = now;

  if (
    next.gameState.moveHistory.length < MIN_MOVES_FOR_RATED_GAME ||
    !bothPlayersHavePlayed(next.gameState)
  ) {
    next.endReason = 'aborted';
    next.matchWinner = null;
    return { endedWinner: null, endReason: 'aborted' };
  }

  next.endReason = reason;
  next.matchWinner = winner;
  awardWinScore(next, winner);
  return { endedWinner: winner, endReason: reason };
}

/**
 * Après un coup (joué par le joueur ou d'office) : termine la partie si elle
 * est gagnée ou nulle, sinon lance le chrono du coup suivant à `turnStart`.
 */
function concludeAfterMove(
  next: StoredRoom,
  turnStart: number,
): { endedWinner: Player | null; endReason: EndReason | null } {
  const state = next.gameState;

  if (state.status === 'won' && state.winner) {
    const winner = state.winner;
    next.phase = 'finished';
    next.endReason = 'alignment';
    next.matchWinner = winner;
    next.turnStartedAt = null;
    awardWinScore(next, winner);
    return { endedWinner: winner, endReason: 'alignment' };
  }

  if (state.status === 'draw') {
    next.phase = 'finished';
    next.endReason = 'draw';
    next.matchWinner = null;
    next.turnStartedAt = null;
    return { endedWinner: null, endReason: 'draw' };
  }

  next.turnStartedAt = turnStart;
  return { endedWinner: null, endReason: null };
}

export function createStoredRoom(params: {
  code: string;
  playerId: string;
  profileKey: string;
  pseudo: string;
  timeControl: TimeControl;
  mode?: RoomMode;
  eloProfile: EloProfile;
  now: number;
}): StoredRoom {
  const mode: RoomMode = params.mode === '2v2' ? '2v2' : '1v1';
  const initialTimeMs = TIME_CONTROL_MS[params.timeControl];
  const host = buildStoredPlayer({
    playerId: params.playerId,
    profileKey: params.profileKey,
    pseudo: params.pseudo,
    symbol: 'X',
    seat: mode === '2v2' ? 'A' : undefined,
    eloProfile: params.eloProfile,
    now: params.now,
  });

  const room: StoredRoom = {
    code: normalizeRoomCode(params.code),
    mode,
    phase: 'waiting',
    timeControl: params.timeControl,
    initialTimeMs,
    players: {
      X: host,
      O: null,
    },
    ...(mode === '2v2'
      ? {
          seats: {
            A: host,
            B: null,
            C: null,
            D: null,
          },
        }
      : {}),
    spectators: {},
    lastEmote: null,
    lastEmoteByPlayer: {},
    gameState: createInitialState('X'),
    clocks:
      initialTimeMs !== null
        ? { X: initialTimeMs, O: initialTimeMs }
        : null,
    turnStartedAt: null,
    moveTimeouts: { X: 0, O: 0 },
    endReason: null,
    matchWinner: null,
    rematchVotes: [],
    gameNumber: 1,
    eloResult: null,
    lastActivityAt: params.now,
  };
  return room;
}

export function toRoomPeekInfo(room: StoredRoom, now = Date.now()): RoomPeekInfo {
  const mode = getRoomMode(room);
  const seated = getAllSeatedPlayers(room);
  const maxPlayers = mode === '2v2' ? 4 : 2;
  return {
    code: room.code,
    mode,
    phase: room.phase,
    timeControl: room.timeControl,
    hostPseudo:
      (mode === '2v2' ? room.seats?.A?.pseudo : null) ??
      room.players.X?.pseudo ??
      room.players.O?.pseudo ??
      seated[0]?.pseudo ??
      null,
    isFull: seated.length >= maxPlayers || room.phase !== 'waiting',
    playerCount: seated.length,
    maxPlayers,
    spectatorCount: activeSpectatorCount(room, now),
  };
}

export function toRoomSnapshot(room: StoredRoom, now: number): RoomSnapshot {
  const mode = getRoomMode(room);
  const toPublicPlayer = (p: StoredPlayer | null): RoomPlayer | null => {
    if (!p) return null;
    const rd = typeof p.rd === 'number' ? p.rd : INITIAL_RD;
    return {
      id: p.id,
      pseudo: p.pseudo,
      symbol: p.symbol,
      ...(p.seat ? { seat: p.seat } : {}),
      connected: now - p.lastSeenAt < PRESENCE_ONLINE_MS,
      score: p.score,
      elo: p.elo,
      rd: Math.round(rd),
      provisional: isProvisional(rd),
      gamesPlayed: p.gamesPlayed,
      tier: p.tier,
    };
  };

  // En 2v2 les duels amicaux ne sont pas classés Elo
  const eloStakes =
    mode === '1v1' && room.players.X && room.players.O
      ? getEloStakes(
          {
            rating: room.players.X.elo,
            rd: room.players.X.rd ?? INITIAL_RD,
            volatility: room.players.X.volatility ?? INITIAL_VOLATILITY,
          },
          {
            rating: room.players.O.elo,
            rd: room.players.O.rd ?? INITIAL_RD,
            volatility: room.players.O.volatility ?? INITIAL_VOLATILITY,
          },
          now,
        )
      : null;

  const publicSeats =
    mode === '2v2' && room.seats
      ? {
          A: toPublicPlayer(room.seats.A),
          B: toPublicPlayer(room.seats.B),
          C: toPublicPlayer(room.seats.C),
          D: toPublicPlayer(room.seats.D),
        }
      : null;

  const visibleEmote =
    room.lastEmote && now - room.lastEmote.sentAt < EMOTE_VISIBLE_MS
      ? { ...room.lastEmote }
      : null;

  return {
    code: room.code,
    mode,
    phase: room.phase,
    timeControl: room.timeControl,
    initialTimeMs: room.initialTimeMs,
    players: {
      X: toPublicPlayer(room.players.X),
      O: toPublicPlayer(room.players.O),
    },
    seats: publicSeats,
    activeSeat: getRoomActiveSeat(room),
    spectatorCount: activeSpectatorCount(room, now),
    lastEmote: visibleEmote,
    gameState: room.gameState,
    clocks: room.clocks ? { ...room.clocks } : null,
    turnStartedAt: room.turnStartedAt,
    moveTimeLimitMs: MOVE_TIME_LIMIT_MS,
    moveTimeouts: room.moveTimeouts ? { ...room.moveTimeouts } : { X: 0, O: 0 },
    serverNow: now,
    endReason: room.endReason,
    matchWinner: room.matchWinner,
    rematchVotes: [...room.rematchVotes],
    gameNumber: room.gameNumber,
    eloStakes,
    eloResult: room.eloResult,
  };
}

export function touchPlayerPresence(
  room: StoredRoom,
  playerId: string,
  now: number,
): { room: StoredRoom; changed: boolean } {
  const found = findPlayerInRoom(room, playerId);
  if (found) {
    if (now - found.player.lastSeenAt < PRESENCE_HEARTBEAT_WRITE_MS) {
      return { room, changed: false };
    }
    const next = cloneRoom(room);
    if (found.seat && next.seats?.[found.seat]) {
      next.seats[found.seat]!.lastSeenAt = now;
      syncTeamRepresentatives(next);
    } else if (next.players[found.symbol]) {
      next.players[found.symbol]!.lastSeenAt = now;
    }
    return { room: next, changed: true };
  }

  // Présence des spectateurs
  const spec = room.spectators?.[playerId];
  if (spec) {
    if (now - spec.lastSeenAt < PRESENCE_HEARTBEAT_WRITE_MS) {
      return { room, changed: false };
    }
    const next = cloneRoom(room);
    next.spectators ??= {};
    next.spectators[playerId] = { ...spec, lastSeenAt: now };
    pruneStaleSpectators(next, now);
    return { room: next, changed: true };
  }

  return { room, changed: false };
}

/**
 * Applique tout ce que le temps écoulé implique, dans l'ordre chronologique :
 * pendule globale épuisée, coups joués d'office après dépassement de la
 * limite par coup, défaite au temps après trop de dépassements d'affilée,
 * puis abandon par déconnexion prolongée.
 *
 * `rng` choisit le coup joué d'office (injectable pour les tests).
 */
export function settleTimeoutsAndAbandonment(
  room: StoredRoom,
  now: number,
  rng: () => number = Math.random,
): {
  room: StoredRoom;
  changed: boolean;
  endedWinner: Player | null;
  endReason: EndReason | null;
} {
  if (room.phase !== 'playing') {
    return { room, changed: false, endedWinner: null, endReason: null };
  }

  let current = room;
  let changed = false;

  // 1. Pendule globale et limite par coup
  while (current.phase === 'playing' && current.turnStartedAt !== null) {
    const active = current.gameState.currentPlayer;
    const activeSeat = getRoomActiveSeat(current);
    const startedAt = current.turnStartedAt;
    const elapsed = now - startedAt;
    const clockLeft = current.clocks !== null ? current.clocks[active] : null;

    // La pendule globale s'épuise avant la limite par coup
    if (clockLeft !== null && clockLeft <= MOVE_TIME_LIMIT_MS + MOVE_TIMEOUT_GRACE_MS) {
      if (elapsed < clockLeft) break;
      const next = cloneRoom(current);
      next.clocks![active] = 0;
      const ended = finishRoom(next, getOpponent(active), 'timeout', now);
      return {
        room: next,
        changed: true,
        endedWinner: ended.endedWinner,
        endReason: ended.endReason,
      };
    }

    if (elapsed < MOVE_TIME_LIMIT_MS + MOVE_TIMEOUT_GRACE_MS) break;

    // Limite par coup dépassée
    const next = cloneRoom(current);
    const deadline = startedAt + MOVE_TIME_LIMIT_MS;
    if (next.clocks !== null) {
      next.clocks[active] = Math.max(0, next.clocks[active] - MOVE_TIME_LIMIT_MS);
    }
    const timeouts = next.moveTimeouts ?? { X: 0, O: 0 };
    timeouts[active] += 1;
    next.moveTimeouts = timeouts;

    if (timeouts[active] >= MAX_CONSECUTIVE_MOVE_TIMEOUTS) {
      const ended = finishRoom(next, getOpponent(active), 'timeout', now);
      return {
        room: next,
        changed: true,
        endedWinner: ended.endedWinner,
        endReason: ended.endReason,
      };
    }

    const legalMoves = getLegalMoves(next.gameState);
    if (legalMoves.length === 0) break;
    const picked =
      legalMoves[Math.min(legalMoves.length - 1, Math.floor(rng() * legalMoves.length))];
    const moveRes = applyMove(next.gameState, picked, active);
    if (!moveRes.ok) break;

    const history = moveRes.state.moveHistory;
    next.gameState = {
      ...moveRes.state,
      moveHistory: history.map((record, index) =>
        index === history.length - 1
          ? { ...record, auto: true, ...(activeSeat ? { seat: activeSeat } : {}) }
          : record,
      ),
    };
    next.lastActivityAt = now;

    const ended = concludeAfterMove(next, deadline);
    current = next;
    changed = true;
    if (ended.endReason !== null) {
      return {
        room: next,
        changed: true,
        endedWinner: ended.endedWinner,
        endReason: ended.endReason,
      };
    }
  }

  // 2. Abandon par déconnexion prolongée
  if (getRoomMode(current) === '2v2' && current.seats) {
    const teamX = [current.seats.A, current.seats.B].filter(
      (p): p is StoredPlayer => p !== null,
    );
    const teamO = [current.seats.C, current.seats.D].filter(
      (p): p is StoredPlayer => p !== null,
    );
    const xOnline = teamX.some((p) => now - p.lastSeenAt < PRESENCE_ONLINE_MS);
    const oOnline = teamO.some((p) => now - p.lastSeenAt < PRESENCE_ONLINE_MS);
    const xAllTimedOut =
      teamX.length > 0 &&
      teamX.every((p) => now - p.lastSeenAt >= DISCONNECT_FORFEIT_MS);
    const oAllTimedOut =
      teamO.length > 0 &&
      teamO.every((p) => now - p.lastSeenAt >= DISCONNECT_FORFEIT_MS);

    let winner: Player | null = null;
    if (xAllTimedOut && oOnline) winner = 'O';
    else if (oAllTimedOut && xOnline) winner = 'X';

    if (winner !== null) {
      const next = cloneRoom(current);
      if (next.clocks !== null && next.turnStartedAt !== null) {
        const active = next.gameState.currentPlayer;
        const elapsed = Math.max(0, now - next.turnStartedAt);
        next.clocks[active] = Math.max(0, next.clocks[active] - elapsed);
      }
      const ended = finishRoom(next, winner, 'abandoned', now);
      return {
        room: next,
        changed: true,
        endedWinner: ended.endedWinner,
        endReason: ended.endReason,
      };
    }
  } else if (current.players.X && current.players.O) {
    const xOnline = now - current.players.X.lastSeenAt < PRESENCE_ONLINE_MS;
    const oOnline = now - current.players.O.lastSeenAt < PRESENCE_ONLINE_MS;
    const xTimedOut = now - current.players.X.lastSeenAt >= DISCONNECT_FORFEIT_MS;
    const oTimedOut = now - current.players.O.lastSeenAt >= DISCONNECT_FORFEIT_MS;

    let winner: Player | null = null;
    if (xTimedOut && oOnline) {
      winner = 'O';
    } else if (oTimedOut && xOnline) {
      winner = 'X';
    }

    if (winner !== null) {
      const next = cloneRoom(current);
      if (next.clocks !== null && next.turnStartedAt !== null) {
        const active = next.gameState.currentPlayer;
        const elapsed = Math.max(0, now - next.turnStartedAt);
        next.clocks[active] = Math.max(0, next.clocks[active] - elapsed);
      }
      const ended = finishRoom(next, winner, 'abandoned', now);
      return {
        room: next,
        changed: true,
        endedWinner: ended.endedWinner,
        endReason: ended.endReason,
      };
    }
  }

  return { room: current, changed, endedWinner: null, endReason: null };
}

export function joinStoredRoom(
  room: StoredRoom,
  params: {
    playerId: string;
    profileKey: string;
    pseudo: string;
    eloProfile: EloProfile;
    now: number;
  },
):
  | { ok: true; room: StoredRoom; reconnected: boolean; role: 'player' | 'spectator' }
  | { ok: false; error: string } {
  const existing = findPlayerInRoom(room, params.playerId);
  if (existing) {
    const next = cloneRoom(room);
    const player = existing.seat
      ? next.seats![existing.seat]!
      : next.players[existing.symbol]!;
    player.lastSeenAt = params.now;
    player.connected = true;
    const trimmed = params.pseudo.trim();
    if (trimmed.length > 0 && player.pseudo === 'Joueur') {
      player.pseudo = sanitizePseudo(trimmed);
    }
    if (existing.seat) syncTeamRepresentatives(next);
    next.lastActivityAt = params.now;
    return { ok: true, room: next, reconnected: true, role: 'player' };
  }

  const mode = getRoomMode(room);

  // Mode 2v2 : remplit les 4 sièges A → C → B → D, puis passe en spectateur
  if (mode === '2v2' && room.seats) {
    const openSeat =
      room.phase === 'waiting'
        ? TEAM_SEAT_FILL_ORDER.find((seat) => room.seats![seat] === null) ?? null
        : null;

    if (openSeat === null) {
      // Salon complet ou déjà lancé : la personne rejoint en spectateur
      const next = cloneRoom(room);
      next.spectators ??= {};
      const alreadySpec = Boolean(next.spectators[params.playerId]);
      next.spectators[params.playerId] = {
        id: params.playerId,
        pseudo: sanitizePseudo(params.pseudo),
        lastSeenAt: params.now,
      };
      pruneStaleSpectators(next, params.now);
      next.lastActivityAt = params.now;
      return { ok: true, room: next, reconnected: alreadySpec, role: 'spectator' };
    }

    const seated = getAllSeatedPlayers(room);
    if (seated.some((p) => p.profileKey === params.profileKey)) {
      return {
        ok: false,
        error: 'Vous occupez déjà une place dans ce salon : ouvrez le lien sur un autre appareil.',
      };
    }

    const next = cloneRoom(room);
    const symbol = TEAM_SEAT_SYMBOL[openSeat];
    next.seats![openSeat] = buildStoredPlayer({
      playerId: params.playerId,
      profileKey: params.profileKey,
      pseudo: params.pseudo,
      symbol,
      seat: openSeat,
      eloProfile: params.eloProfile,
      now: params.now,
    });
    syncTeamRepresentatives(next);

    if (ALL_SEATS.every((s) => next.seats![s] !== null) && next.phase === 'waiting') {
      next.phase = 'playing';
      next.turnStartedAt = params.now + MATCH_INTRO_MS;
      next.moveTimeouts = { X: 0, O: 0 };
    }

    next.lastActivityAt = params.now;
    return { ok: true, room: next, reconnected: false, role: 'player' };
  }

  // Mode 1v1
  const openSlot: Player | null =
    room.phase === 'waiting'
      ? room.players.X === null
        ? 'X'
        : room.players.O === null
          ? 'O'
          : null
      : null;

  if (openSlot === null) {
    // 3e personne (ou plus) rejoignant via le code : mode spectateur en direct
    const next = cloneRoom(room);
    next.spectators ??= {};
    const alreadySpec = Boolean(next.spectators[params.playerId]);
    next.spectators[params.playerId] = {
      id: params.playerId,
      pseudo: sanitizePseudo(params.pseudo),
      lastSeenAt: params.now,
    };
    pruneStaleSpectators(next, params.now);
    next.lastActivityAt = params.now;
    return { ok: true, room: next, reconnected: alreadySpec, role: 'spectator' };
  }

  const host = openSlot === 'X' ? room.players.O : room.players.X;
  if (host && host.profileKey === params.profileKey) {
    return {
      ok: false,
      error: 'Impossible de jouer contre vous-même : ouvrez le lien sur un autre compte.',
    };
  }

  const next = cloneRoom(room);
  next.players[openSlot] = buildStoredPlayer({
    playerId: params.playerId,
    profileKey: params.profileKey,
    pseudo: params.pseudo,
    symbol: openSlot,
    eloProfile: params.eloProfile,
    now: params.now,
  });

  if (next.players.X && next.players.O && next.phase === 'waiting') {
    next.phase = 'playing';
    next.turnStartedAt = params.now + MATCH_INTRO_MS;
    next.moveTimeouts = { X: 0, O: 0 };
  }

  next.lastActivityAt = params.now;
  return { ok: true, room: next, reconnected: false, role: 'player' };
}

/** Permet à un joueur en salle d'attente 2v2 de changer de place / d'équipe. */
export function switchSeatStoredRoom(
  room: StoredRoom,
  params: { playerId: string; targetSeat: TeamSeat; now: number },
): { ok: true; room: StoredRoom } | { ok: false; error: string } {
  if (getRoomMode(room) !== '2v2' || !room.seats) {
    return { ok: false, error: 'Changement de place réservé au mode 2v2.' };
  }
  if (room.phase !== 'waiting') {
    return { ok: false, error: 'La partie a déjà commencé.' };
  }
  const found = findPlayerInRoom(room, params.playerId);
  if (!found || !found.seat) {
    return { ok: false, error: 'Vous n’êtes pas joueur dans ce salon.' };
  }
  if (found.seat === params.targetSeat) {
    return { ok: true, room };
  }
  if (room.seats[params.targetSeat] !== null) {
    return { ok: false, error: 'Cette place est déjà occupée.' };
  }

  const next = cloneRoom(room);
  const moving = next.seats![found.seat]!;
  next.seats![found.seat] = null;
  next.seats![params.targetSeat] = {
    ...moving,
    seat: params.targetSeat,
    symbol: TEAM_SEAT_SYMBOL[params.targetSeat],
    lastSeenAt: params.now,
  };
  syncTeamRepresentatives(next);
  next.lastActivityAt = params.now;
  return { ok: true, room: next };
}

/** Envoie un tampon / emote expressif dans le salon (avec anti-spam). */
export function sendEmoteStoredRoom(
  room: StoredRoom,
  params: { playerId: string; emote: EmoteId; now: number },
): { ok: true; room: StoredRoom } | { ok: false; error: string } {
  if (!EMOTE_IDS.includes(params.emote)) {
    return { ok: false, error: 'Réaction inconnue.' };
  }
  const found = findPlayerInRoom(room, params.playerId);
  if (!found) {
    return { ok: false, error: 'Seuls les joueurs peuvent envoyer une réaction.' };
  }
  const lastAt = room.lastEmoteByPlayer?.[params.playerId] ?? 0;
  if (params.now - lastAt < EMOTE_COOLDOWN_MS) {
    return { ok: false, error: 'Un instant avant la prochaine réaction.' };
  }

  const next = cloneRoom(room);
  if (found.seat && next.seats?.[found.seat]) {
    next.seats[found.seat]!.lastSeenAt = params.now;
  } else if (next.players[found.symbol]) {
    next.players[found.symbol]!.lastSeenAt = params.now;
  }
  next.lastEmoteByPlayer ??= {};
  next.lastEmoteByPlayer[params.playerId] = params.now;
  next.lastEmote = {
    id: `${params.now}-${params.playerId.slice(0, 8)}-${params.emote}`,
    emote: params.emote,
    senderId: params.playerId,
    senderPseudo: found.player.pseudo,
    senderSymbol: found.symbol,
    senderSeat: found.seat,
    sentAt: params.now,
  };
  next.lastActivityAt = params.now;
  return { ok: true, room: next };
}

export function applyMoveToStoredRoom(
  room: StoredRoom,
  params: { playerId: string; move: Move; now: number; rng?: () => number },
):
  | {
      ok: true;
      room: StoredRoom;
      endedWinner: Player | null;
      endReason: EndReason | null;
    }
  | {
      ok: false;
      error: string;
      settledRoom?: StoredRoom;
      endedWinner?: Player | null;
      endReason?: EndReason | null;
    } {
  const settled = settleTimeoutsAndAbandonment(room, params.now, params.rng);
  if (settled.changed && settled.room.phase !== 'playing') {
    return {
      ok: false,
      error:
        settled.endReason === 'timeout'
          ? 'Temps écoulé.'
          : 'La partie est terminée.',
      settledRoom: settled.room,
      endedWinner: settled.endedWinner,
      endReason: settled.endReason,
    };
  }

  // Si des coups ont été joués d'office entre-temps, on repart de cet état
  // et on le renvoie pour qu'il soit enregistré même si le coup est refusé.
  const base = settled.room;
  const settledExtras = settled.changed
    ? { settledRoom: base, endedWinner: null, endReason: null }
    : {};

  const found = findPlayerInRoom(base, params.playerId);
  if (!found) {
    return { ok: false, error: 'Action non autorisée dans ce salon.', ...settledExtras };
  }

  if (base.phase !== 'playing') {
    return { ok: false, error: 'La partie n’est pas active.' };
  }

  const playerSymbol = found.symbol;
  const activeSeat = getRoomActiveSeat(base);

  if (activeSeat !== null) {
    if (found.seat !== activeSeat) {
      if (settled.changed) {
        return {
          ok: false,
          error: 'Temps écoulé : un coup a été joué à votre place.',
          ...settledExtras,
        };
      }
      return {
        ok: false,
        error:
          found.symbol === base.gameState.currentPlayer
            ? 'C’est le tour de votre coéquipier.'
            : 'Ce n’est pas votre tour.',
        ...settledExtras,
      };
    }
  } else if (settled.changed && base.gameState.currentPlayer !== playerSymbol) {
    return {
      ok: false,
      error: 'Temps écoulé : un coup a été joué à votre place.',
      ...settledExtras,
    };
  }

  const next = cloneRoom(base);
  if (found.seat && next.seats?.[found.seat]) {
    next.seats[found.seat]!.lastSeenAt = params.now;
    syncTeamRepresentatives(next);
  } else if (next.players[playerSymbol]) {
    next.players[playerSymbol]!.lastSeenAt = params.now;
  }

  if (next.clocks !== null && next.turnStartedAt !== null) {
    const active = next.gameState.currentPlayer;
    const elapsed = Math.max(0, params.now - next.turnStartedAt);
    next.clocks[active] = Math.max(0, next.clocks[active] - elapsed);
  }

  const moveRes = applyMove(next.gameState, params.move, playerSymbol);
  if (!moveRes.ok) {
    return { ok: false, error: MOVE_ERROR_MESSAGES[moveRes.error], ...settledExtras };
  }

  const history = moveRes.state.moveHistory;
  next.gameState = found.seat
    ? {
        ...moveRes.state,
        moveHistory: history.map((record, index) =>
          index === history.length - 1 ? { ...record, seat: found.seat! } : record,
        ),
      }
    : moveRes.state;
  next.lastActivityAt = params.now;

  // Le joueur a joué lui-même : ses dépassements d'affilée repartent de zéro
  const timeouts = next.moveTimeouts ?? { X: 0, O: 0 };
  timeouts[playerSymbol] = 0;
  next.moveTimeouts = timeouts;

  const ended = concludeAfterMove(next, params.now);
  return {
    ok: true,
    room: next,
    endedWinner: ended.endedWinner,
    endReason: ended.endReason,
  };
}

export function resignStoredRoom(
  room: StoredRoom,
  params: { playerId: string; now: number },
):
  | {
      ok: true;
      room: StoredRoom;
      endedWinner: Player | null;
      endReason: EndReason;
    }
  | { ok: false; error: string } {
  const found = findPlayerInRoom(room, params.playerId);
  if (!found) {
    return { ok: false, error: 'Action non autorisée.' };
  }
  if (room.phase !== 'playing') {
    return { ok: false, error: 'La partie n’est pas en cours.' };
  }

  const next = cloneRoom(room);
  if (found.seat && next.seats?.[found.seat]) {
    next.seats[found.seat]!.lastSeenAt = params.now;
    syncTeamRepresentatives(next);
  } else if (next.players[found.symbol]) {
    next.players[found.symbol]!.lastSeenAt = params.now;
  }

  if (next.clocks !== null && next.turnStartedAt !== null) {
    const active = next.gameState.currentPlayer;
    const elapsed = Math.max(0, params.now - next.turnStartedAt);
    next.clocks[active] = Math.max(0, next.clocks[active] - elapsed);
  }

  const ended = finishRoom(next, getOpponent(found.symbol), 'resign', params.now);

  return {
    ok: true,
    room: next,
    endedWinner: ended.endedWinner,
    endReason: ended.endReason,
  };
}

export function voteRematchStoredRoom(
  room: StoredRoom,
  params: { playerId: string; now: number },
): { ok: true; room: StoredRoom; restarted: boolean } | { ok: false; error: string } {
  const found = findPlayerInRoom(room, params.playerId);
  if (!found) {
    return { ok: false, error: 'Action non autorisée.' };
  }
  if (room.phase !== 'finished') {
    return { ok: false, error: 'La partie n’est pas terminée.' };
  }

  const mode = getRoomMode(room);
  if (mode === '2v2') {
    if (!room.seats || ALL_SEATS.some((s) => room.seats![s] === null)) {
      return { ok: false, error: 'Tous les joueurs doivent être présents.' };
    }
    const next = cloneRoom(room);
    next.seats![found.seat!]!.lastSeenAt = params.now;
    if (!next.rematchVotes.includes(params.playerId)) {
      next.rematchVotes.push(params.playerId);
    }
    next.lastActivityAt = params.now;

    const allVoted = ALL_SEATS.every((s) =>
      next.rematchVotes.includes(next.seats![s]!.id),
    );
    if (!allVoted) {
      return { ok: true, room: next, restarted: false };
    }

    // Inversion des équipes : C & D deviennent A & B (X), A & B deviennent C & D (O)
    const prevA = next.seats!.A!;
    const prevB = next.seats!.B!;
    const prevC = next.seats!.C!;
    const prevD = next.seats!.D!;
    next.seats = {
      A: { ...prevC, symbol: 'X', seat: 'A' },
      B: { ...prevD, symbol: 'X', seat: 'B' },
      C: { ...prevA, symbol: 'O', seat: 'C' },
      D: { ...prevB, symbol: 'O', seat: 'D' },
    };
    syncTeamRepresentatives(next);
    next.gameState = createInitialState('X');
    next.clocks =
      next.initialTimeMs !== null
        ? { X: next.initialTimeMs, O: next.initialTimeMs }
        : null;
    next.phase = 'playing';
    next.endReason = null;
    next.matchWinner = null;
    next.eloResult = null;
    next.rematchVotes = [];
    next.gameNumber += 1;
    next.turnStartedAt = params.now + MATCH_INTRO_MS;
    next.moveTimeouts = { X: 0, O: 0 };
    return { ok: true, room: next, restarted: true };
  }

  if (!room.players.X || !room.players.O) {
    return { ok: false, error: 'Adversaire absent du salon.' };
  }

  const next = cloneRoom(room);
  next.players[found.symbol]!.lastSeenAt = params.now;
  if (!next.rematchVotes.includes(params.playerId)) {
    next.rematchVotes.push(params.playerId);
  }
  next.lastActivityAt = params.now;

  const bothVoted =
    next.rematchVotes.includes(next.players.X!.id) &&
    next.rematchVotes.includes(next.players.O!.id);

  if (!bothVoted) {
    return { ok: true, room: next, restarted: false };
  }

  const prevX = next.players.X!;
  const prevO = next.players.O!;

  next.players.X = { ...prevO, symbol: 'X' };
  next.players.O = { ...prevX, symbol: 'O' };
  next.gameState = createInitialState('X');
  next.clocks =
    next.initialTimeMs !== null
      ? { X: next.initialTimeMs, O: next.initialTimeMs }
      : null;
  next.phase = 'playing';
  next.endReason = null;
  next.matchWinner = null;
  next.eloResult = null;
  next.rematchVotes = [];
  next.gameNumber += 1;
  next.turnStartedAt = params.now + MATCH_INTRO_MS;
  next.moveTimeouts = { X: 0, O: 0 };

  return { ok: true, room: next, restarted: true };
}

export function leaveStoredRoom(
  room: StoredRoom,
  params: { playerId: string; now: number },
): {
  deleted: boolean;
  room: StoredRoom;
  endedWinner: Player | null;
  endReason: EndReason | null;
} {
  // Départ d'un spectateur : n'interrompt jamais la partie
  if (room.spectators?.[params.playerId]) {
    const next = cloneRoom(room);
    delete next.spectators![params.playerId];
    return { deleted: false, room: next, endedWinner: null, endReason: null };
  }

  const found = findPlayerInRoom(room, params.playerId);
  if (!found) {
    return { deleted: false, room, endedWinner: null, endReason: null };
  }

  const mode = getRoomMode(room);

  if (room.phase === 'waiting') {
    if (mode === '2v2' && room.seats && found.seat) {
      const next = cloneRoom(room);
      next.seats![found.seat] = null;
      syncTeamRepresentatives(next);
      const remaining = getAllSeatedPlayers(next);
      if (remaining.length === 0) {
        return { deleted: true, room: next, endedWinner: null, endReason: null };
      }
      next.lastActivityAt = params.now;
      return { deleted: false, room: next, endedWinner: null, endReason: null };
    }
    return { deleted: true, room, endedWinner: null, endReason: null };
  }

  const next = cloneRoom(room);
  if (found.seat && next.seats?.[found.seat]) {
    next.seats[found.seat]!.lastSeenAt = 0;
    next.seats[found.seat]!.connected = false;
    syncTeamRepresentatives(next);
  } else if (next.players[found.symbol]) {
    next.players[found.symbol]!.lastSeenAt = 0;
    next.players[found.symbol]!.connected = false;
  }
  next.rematchVotes = next.rematchVotes.filter((id) => id !== params.playerId);
  next.lastActivityAt = params.now;

  if (room.phase === 'playing') {
    if (next.clocks !== null && next.turnStartedAt !== null) {
      const active = next.gameState.currentPlayer;
      const elapsed = Math.max(0, params.now - next.turnStartedAt);
      next.clocks[active] = Math.max(0, next.clocks[active] - elapsed);
    }
    const ended = finishRoom(next, getOpponent(found.symbol), 'abandoned', params.now);
    return {
      deleted: false,
      room: next,
      endedWinner: ended.endedWinner,
      endReason: ended.endReason,
    };
  }

  return { deleted: false, room: next, endedWinner: null, endReason: null };
}

export function applyEloOutcomeToRoom(
  room: StoredRoom,
  profileX: EloProfile,
  profileO: EloProfile,
  now: number,
): {
  room: StoredRoom;
  nextProfileX: EloProfile;
  nextProfileO: EloProfile;
  rated: boolean;
} {
  // Les matchs 2v2 sont amicaux (non classés Glicko-2)
  if (getRoomMode(room) === '2v2') {
    return { room, nextProfileX: profileX, nextProfileO: profileO, rated: false };
  }

  if (!room.players.X || !room.players.O) {
    return { room, nextProfileX: profileX, nextProfileO: profileO, rated: false };
  }

  // Partie annulée : aucun effet sur le classement, mais on marque le
  // résultat comme traité pour ne pas le recalculer à chaque requête.
  if (room.endReason === 'aborted') {
    const next = cloneRoom(room);
    const unrated = (profile: EloProfile): EloMatchDelta => ({
      before: profile.rating,
      after: profile.rating,
      delta: 0,
      tier: getEloTier(profile.rating).label,
      rd: Math.round(profile.rd),
      provisional: isProvisional(profile.rd),
      rated: false,
    });
    next.eloResult = { X: unrated(profileX), O: unrated(profileO) };
    return { room: next, nextProfileX: profileX, nextProfileO: profileO, rated: false };
  }

  const outcomeX: 1 | 0.5 | 0 =
    room.matchWinner === 'X' ? 1 : room.matchWinner === 'O' ? 0 : 0.5;
  const outcomeO = (1 - outcomeX) as 1 | 0.5 | 0;

  const update = calculateRatingUpdate(profileX, profileO, outcomeX, now);
  const nextProfileX = applyOutcomeToProfile(profileX, update.nextA, outcomeX, now);
  const nextProfileO = applyOutcomeToProfile(profileO, update.nextB, outcomeO, now);

  const tierX = getEloTier(nextProfileX.rating).label;
  const tierO = getEloTier(nextProfileO.rating).label;

  const next = cloneRoom(room);
  const syncPlayer = (p: StoredPlayer, profile: EloProfile, tier: string) => {
    p.elo = profile.rating;
    p.rd = profile.rd;
    p.provisional = isProvisional(profile.rd);
    p.volatility = profile.volatility;
    p.gamesPlayed = profile.gamesPlayed;
    p.tier = tier;
  };
  syncPlayer(next.players.X!, nextProfileX, tierX);
  syncPlayer(next.players.O!, nextProfileO, tierO);

  next.eloResult = {
    X: {
      before: profileX.rating,
      after: nextProfileX.rating,
      delta: nextProfileX.rating - profileX.rating,
      tier: tierX,
      rd: Math.round(nextProfileX.rd),
      provisional: isProvisional(nextProfileX.rd),
      rated: true,
    },
    O: {
      before: profileO.rating,
      after: nextProfileO.rating,
      delta: nextProfileO.rating - profileO.rating,
      tier: tierO,
      rd: Math.round(nextProfileO.rd),
      provisional: isProvisional(nextProfileO.rd),
      rated: true,
    },
  };

  return { room: next, nextProfileX, nextProfileO, rated: true };
}
