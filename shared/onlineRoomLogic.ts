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
  getOpponent,
  type GameState,
  type Move,
  type MoveErrorCode,
  type Player,
} from './gameEngine.js';
import {
  TIME_CONTROL_MS,
  type EndReason,
  type RoomPeekInfo,
  type RoomPlayer,
  type RoomSnapshot,
  type TimeControl,
} from './protocol.js';

export const PRESENCE_ONLINE_MS = 12_000;
export const DISCONNECT_FORFEIT_MS = 60_000;
export const PRESENCE_HEARTBEAT_WRITE_MS = 3_500;

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export interface StoredPlayer extends RoomPlayer {
  profileKey: string;
  lastSeenAt: number;
  volatility?: number;
}

/**
 * Nombre minimal de coups pour qu'une partie soit classée : comme aux échecs
 * en ligne, si l'un des joueurs n'a pas encore joué son premier coup,
 * la partie est annulée au lieu d'être perdue.
 */
export const MIN_MOVES_FOR_RATED_GAME = 2;

export interface StoredRoom {
  code: string;
  phase: 'waiting' | 'playing' | 'finished';
  timeControl: TimeControl;
  initialTimeMs: number | null;
  players: {
    X: StoredPlayer | null;
    O: StoredPlayer | null;
  };
  gameState: GameState;
  clocks: {
    X: number;
    O: number;
  } | null;
  turnStartedAt: number | null;
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

function cloneRoom(room: StoredRoom): StoredRoom {
  return {
    ...room,
    players: {
      X: room.players.X ? { ...room.players.X } : null,
      O: room.players.O ? { ...room.players.O } : null,
    },
    clocks: room.clocks ? { ...room.clocks } : null,
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
  eloProfile: EloProfile;
  now: number;
}): StoredPlayer {
  const rd = inflateDeviation(params.eloProfile, params.now);
  return {
    id: params.playerId,
    pseudo: sanitizePseudo(params.pseudo),
    symbol: params.symbol,
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

  if (next.gameState.moveHistory.length < MIN_MOVES_FOR_RATED_GAME) {
    next.endReason = 'aborted';
    next.matchWinner = null;
    return { endedWinner: null, endReason: 'aborted' };
  }

  next.endReason = reason;
  next.matchWinner = winner;
  if (next.players[winner]) {
    next.players[winner]!.score += 1;
  }
  return { endedWinner: winner, endReason: reason };
}

export function createStoredRoom(params: {
  code: string;
  playerId: string;
  profileKey: string;
  pseudo: string;
  timeControl: TimeControl;
  eloProfile: EloProfile;
  now: number;
}): StoredRoom {
  const initialTimeMs = TIME_CONTROL_MS[params.timeControl];
  return {
    code: normalizeRoomCode(params.code),
    phase: 'waiting',
    timeControl: params.timeControl,
    initialTimeMs,
    players: {
      X: buildStoredPlayer({
        playerId: params.playerId,
        profileKey: params.profileKey,
        pseudo: params.pseudo,
        symbol: 'X',
        eloProfile: params.eloProfile,
        now: params.now,
      }),
      O: null,
    },
    gameState: createInitialState('X'),
    clocks:
      initialTimeMs !== null
        ? { X: initialTimeMs, O: initialTimeMs }
        : null,
    turnStartedAt: null,
    endReason: null,
    matchWinner: null,
    rematchVotes: [],
    gameNumber: 1,
    eloResult: null,
    lastActivityAt: params.now,
  };
}

export function toRoomPeekInfo(room: StoredRoom): RoomPeekInfo {
  return {
    code: room.code,
    phase: room.phase,
    timeControl: room.timeControl,
    hostPseudo: room.players.X?.pseudo ?? room.players.O?.pseudo ?? null,
    isFull: Boolean(room.players.X && room.players.O),
  };
}

export function toRoomSnapshot(room: StoredRoom, now: number): RoomSnapshot {
  const toPublicPlayer = (p: StoredPlayer | null): RoomPlayer | null => {
    if (!p) return null;
    const rd = typeof p.rd === 'number' ? p.rd : INITIAL_RD;
    return {
      id: p.id,
      pseudo: p.pseudo,
      symbol: p.symbol,
      connected: now - p.lastSeenAt < PRESENCE_ONLINE_MS,
      score: p.score,
      elo: p.elo,
      rd: Math.round(rd),
      provisional: isProvisional(rd),
      gamesPlayed: p.gamesPlayed,
      tier: p.tier,
    };
  };

  const eloStakes =
    room.players.X && room.players.O
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

  return {
    code: room.code,
    phase: room.phase,
    timeControl: room.timeControl,
    initialTimeMs: room.initialTimeMs,
    players: {
      X: toPublicPlayer(room.players.X),
      O: toPublicPlayer(room.players.O),
    },
    gameState: room.gameState,
    clocks: room.clocks ? { ...room.clocks } : null,
    turnStartedAt: room.turnStartedAt,
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
  const isX = room.players.X?.id === playerId;
  const isO = room.players.O?.id === playerId;
  if (!isX && !isO) {
    return { room, changed: false };
  }

  const target = isX ? room.players.X! : room.players.O!;
  if (now - target.lastSeenAt < PRESENCE_HEARTBEAT_WRITE_MS) {
    return { room, changed: false };
  }

  const next = cloneRoom(room);
  if (isX && next.players.X) {
    next.players.X.lastSeenAt = now;
  } else if (isO && next.players.O) {
    next.players.O.lastSeenAt = now;
  }
  return { room: next, changed: true };
}

export function settleTimeoutsAndAbandonment(
  room: StoredRoom,
  now: number,
): {
  room: StoredRoom;
  changed: boolean;
  endedWinner: Player | null;
  endReason: EndReason | null;
} {
  if (room.phase !== 'playing') {
    return { room, changed: false, endedWinner: null, endReason: null };
  }

  // 1. Check active chess clock expiration
  if (room.clocks !== null && room.turnStartedAt !== null) {
    const active = room.gameState.currentPlayer;
    const elapsed = Math.max(0, now - room.turnStartedAt);
    if (room.clocks[active] - elapsed <= 0) {
      const next = cloneRoom(room);
      next.clocks![active] = 0;
      const ended = finishRoom(next, getOpponent(active), 'timeout', now);
      return {
        room: next,
        changed: true,
        endedWinner: ended.endedWinner,
        endReason: ended.endReason,
      };
    }
  }

  // 2. Check if one player dropped for >= DISCONNECT_FORFEIT_MS while the other is online
  if (room.players.X && room.players.O) {
    const xOnline = now - room.players.X.lastSeenAt < PRESENCE_ONLINE_MS;
    const oOnline = now - room.players.O.lastSeenAt < PRESENCE_ONLINE_MS;
    const xTimedOut = now - room.players.X.lastSeenAt >= DISCONNECT_FORFEIT_MS;
    const oTimedOut = now - room.players.O.lastSeenAt >= DISCONNECT_FORFEIT_MS;

    let winner: Player | null = null;
    if (xTimedOut && oOnline) {
      winner = 'O';
    } else if (oTimedOut && xOnline) {
      winner = 'X';
    }

    if (winner !== null) {
      const next = cloneRoom(room);
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

  return { room, changed: false, endedWinner: null, endReason: null };
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
  | { ok: true; room: StoredRoom; reconnected: boolean }
  | { ok: false; error: string } {
  const existingSymbol: Player | null =
    room.players.X?.id === params.playerId
      ? 'X'
      : room.players.O?.id === params.playerId
        ? 'O'
        : null;

  if (existingSymbol) {
    const next = cloneRoom(room);
    const player = next.players[existingSymbol]!;
    player.lastSeenAt = params.now;
    player.connected = true;
    const trimmed = params.pseudo.trim();
    if (trimmed.length > 0 && player.pseudo === 'Joueur') {
      player.pseudo = sanitizePseudo(trimmed);
    }
    next.lastActivityAt = params.now;
    return { ok: true, room: next, reconnected: true };
  }

  const openSlot: Player | null =
    room.players.X === null ? 'X' : room.players.O === null ? 'O' : null;
  if (openSlot === null) {
    return { ok: false, error: 'Ce salon est déjà complet.' };
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
    if (next.clocks !== null) {
      next.turnStartedAt = params.now;
    }
  }

  next.lastActivityAt = params.now;
  return { ok: true, room: next, reconnected: false };
}

export function applyMoveToStoredRoom(
  room: StoredRoom,
  params: { playerId: string; move: Move; now: number },
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
  const settled = settleTimeoutsAndAbandonment(room, params.now);
  if (settled.changed) {
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

  const playerSymbol: Player | null =
    room.players.X?.id === params.playerId
      ? 'X'
      : room.players.O?.id === params.playerId
        ? 'O'
        : null;

  if (!playerSymbol) {
    return { ok: false, error: 'Action non autorisée dans ce salon.' };
  }

  if (room.phase !== 'playing') {
    return { ok: false, error: 'La partie n’est pas active.' };
  }

  const next = cloneRoom(room);
  next.players[playerSymbol]!.lastSeenAt = params.now;

  if (next.clocks !== null && next.turnStartedAt !== null) {
    const active = next.gameState.currentPlayer;
    const elapsed = Math.max(0, params.now - next.turnStartedAt);
    next.clocks[active] = Math.max(0, next.clocks[active] - elapsed);
  }

  const moveRes = applyMove(next.gameState, params.move, playerSymbol);
  if (!moveRes.ok) {
    return { ok: false, error: MOVE_ERROR_MESSAGES[moveRes.error] };
  }

  next.gameState = moveRes.state;
  next.lastActivityAt = params.now;

  if (moveRes.state.status === 'won' && moveRes.state.winner) {
    const winner = moveRes.state.winner;
    next.phase = 'finished';
    next.endReason = 'alignment';
    next.matchWinner = winner;
    next.turnStartedAt = null;
    if (next.players[winner]) {
      next.players[winner]!.score += 1;
    }
    return {
      ok: true,
      room: next,
      endedWinner: winner,
      endReason: 'alignment',
    };
  }

  if (moveRes.state.status === 'draw') {
    next.phase = 'finished';
    next.endReason = 'draw';
    next.matchWinner = null;
    next.turnStartedAt = null;
    return {
      ok: true,
      room: next,
      endedWinner: null,
      endReason: 'draw',
    };
  }

  if (next.clocks !== null) {
    next.turnStartedAt = params.now;
  }

  return { ok: true, room: next, endedWinner: null, endReason: null };
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
  const playerSymbol: Player | null =
    room.players.X?.id === params.playerId
      ? 'X'
      : room.players.O?.id === params.playerId
        ? 'O'
        : null;

  if (!playerSymbol) {
    return { ok: false, error: 'Action non autorisée.' };
  }
  if (room.phase !== 'playing') {
    return { ok: false, error: 'La partie n’est pas en cours.' };
  }

  const next = cloneRoom(room);
  next.players[playerSymbol]!.lastSeenAt = params.now;

  if (next.clocks !== null && next.turnStartedAt !== null) {
    const active = next.gameState.currentPlayer;
    const elapsed = Math.max(0, params.now - next.turnStartedAt);
    next.clocks[active] = Math.max(0, next.clocks[active] - elapsed);
  }

  const ended = finishRoom(next, getOpponent(playerSymbol), 'resign', params.now);

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
  const playerSymbol: Player | null =
    room.players.X?.id === params.playerId
      ? 'X'
      : room.players.O?.id === params.playerId
        ? 'O'
        : null;

  if (!playerSymbol) {
    return { ok: false, error: 'Action non autorisée.' };
  }
  if (room.phase !== 'finished') {
    return { ok: false, error: 'La partie n’est pas terminée.' };
  }
  if (!room.players.X || !room.players.O) {
    return { ok: false, error: 'Adversaire absent du salon.' };
  }

  const next = cloneRoom(room);
  next.players[playerSymbol]!.lastSeenAt = params.now;
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
  next.turnStartedAt = next.clocks !== null ? params.now : null;

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
  const playerSymbol: Player | null =
    room.players.X?.id === params.playerId
      ? 'X'
      : room.players.O?.id === params.playerId
        ? 'O'
        : null;

  if (!playerSymbol) {
    return { deleted: false, room, endedWinner: null, endReason: null };
  }

  if (room.phase === 'waiting') {
    return { deleted: true, room, endedWinner: null, endReason: null };
  }

  const next = cloneRoom(room);
  next.players[playerSymbol]!.lastSeenAt = 0;
  next.players[playerSymbol]!.connected = false;
  next.rematchVotes = next.rematchVotes.filter((id) => id !== params.playerId);
  next.lastActivityAt = params.now;

  if (room.phase === 'playing') {
    if (next.clocks !== null && next.turnStartedAt !== null) {
      const active = next.gameState.currentPlayer;
      const elapsed = Math.max(0, params.now - next.turnStartedAt);
      next.clocks[active] = Math.max(0, next.clocks[active] - elapsed);
    }
    const ended = finishRoom(next, getOpponent(playerSymbol), 'abandoned', params.now);
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
