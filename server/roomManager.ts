import {
  getEloStakes,
  getEloTier,
  type EloMatchDelta,
  type EloProfile,
} from '../shared/elo.js';
import {
  applyMove,
  createInitialState,
  getOpponent,
  type GameState,
  type Move,
  type MoveErrorCode,
  type Player,
} from '../shared/gameEngine.js';
import {
  TIME_CONTROL_MS,
  type EndReason,
  type RoomPeekInfo,
  type RoomPlayer,
  type RoomSnapshot,
  type TimeControl,
} from '../shared/protocol.js';
import { EloStore, makeProfileKey } from './eloStore.js';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DEFAULT_DISCONNECT_GRACE_MS = 60_000;
const DEFAULT_STALE_ROOM_MS = 60 * 60 * 1000;

interface InternalPlayer extends RoomPlayer {
  socketId: string;
  profileKey: string;
}

interface InternalRoom {
  code: string;
  phase: 'waiting' | 'playing' | 'finished';
  timeControl: TimeControl;
  initialTimeMs: number | null;
  players: {
    X: InternalPlayer | null;
    O: InternalPlayer | null;
  };
  gameState: GameState;
  clocks: {
    X: number;
    O: number;
  } | null;
  turnStartedAt: number | null;
  endReason: EndReason | null;
  matchWinner: Player | null;
  rematchVotes: Set<string>;
  gameNumber: number;
  eloResult: {
    X: EloMatchDelta;
    O: EloMatchDelta;
  } | null;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  disconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  lastActivityAt: number;
}

interface MatchmakingEntry {
  socketId: string;
  playerId: string;
  profileId?: string;
  pseudo: string;
  joinedAt: number;
}

export interface RoomManagerOptions {
  now?: () => number;
  disconnectGraceMs?: number;
  staleRoomMs?: number;
  eloStore?: EloStore;
  onRoomUpdated?: (snapshot: RoomSnapshot) => void;
  onProfileUpdated?: (
    socketId: string,
    payload: { profile: EloProfile; tier: string },
  ) => void;
}

export function normalizeRoomCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function sanitizePseudo(pseudo: string): string {
  const cleaned = pseudo.replace(/\s+/g, ' ').trim().slice(0, 20);
  return cleaned.length > 0 ? cleaned : 'Joueur';
}

const MOVE_ERROR_MESSAGES: Record<MoveErrorCode, string> = {
  GAME_OVER: 'La partie est déjà terminée.',
  NOT_YOUR_TURN: 'Ce n’est pas votre tour.',
  OUT_OF_BOUNDS: 'Coordonnées invalides.',
  WRONG_SUBBOARD: 'Vous devez jouer dans la sous-grille active.',
  SUBBOARD_LOCKED: 'Cette sous-grille est déjà verrouillée.',
  CELL_OCCUPIED: 'Cette case est déjà occupée.',
};

export class RoomManager {
  private readonly rooms = new Map<string, InternalRoom>();
  private readonly socketBindings = new Map<string, { roomCode: string; playerId: string }>();
  private readonly queues: Record<TimeControl, MatchmakingEntry[]> = {
    unlimited: [],
    rapid: [],
    blitz: [],
  };
  private readonly now: () => number;
  private readonly disconnectGraceMs: number;
  private readonly staleRoomMs: number;
  private readonly eloStore: EloStore;
  private readonly onRoomUpdated?: (snapshot: RoomSnapshot) => void;
  private readonly onProfileUpdated?: (
    socketId: string,
    payload: { profile: EloProfile; tier: string },
  ) => void;

  constructor(options: RoomManagerOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.disconnectGraceMs = options.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS;
    this.staleRoomMs = options.staleRoomMs ?? DEFAULT_STALE_ROOM_MS;
    this.eloStore = options.eloStore ?? new EloStore({ filePath: null });
    this.onRoomUpdated = options.onRoomUpdated;
    this.onProfileUpdated = options.onProfileUpdated;
  }

  public getPlayerProfile(
    profileId: string | undefined,
    pseudo: string,
  ): { profile: EloProfile; tier: string } {
    const cleanPseudo = sanitizePseudo(pseudo);
    const key = makeProfileKey(profileId, cleanPseudo);
    const profile = this.eloStore.getProfile(key);
    return {
      profile,
      tier: getEloTier(profile.rating).label,
    };
  }

  private createInternalPlayer(params: {
    socketId: string;
    playerId: string;
    profileId?: string;
    pseudo: string;
    symbol: Player;
  }): InternalPlayer {
    const cleanPseudo = sanitizePseudo(params.pseudo);
    const profileKey = makeProfileKey(
      params.profileId ?? params.playerId,
      cleanPseudo,
    );
    const profile = this.eloStore.getProfile(profileKey);

    return {
      id: params.playerId,
      pseudo: cleanPseudo,
      symbol: params.symbol,
      connected: true,
      score: 0,
      elo: profile.rating,
      gamesPlayed: profile.gamesPlayed,
      tier: getEloTier(profile.rating).label,
      socketId: params.socketId,
      profileKey,
    };
  }

  private generateCode(): string {
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) {
        return code;
      }
    }
    throw new Error('Impossible de générer un code de salon unique.');
  }

  private toSnapshot(room: InternalRoom): RoomSnapshot {
    const stripSocket = (player: InternalPlayer | null): RoomPlayer | null => {
      if (!player) return null;
      return {
        id: player.id,
        pseudo: player.pseudo,
        symbol: player.symbol,
        connected: player.connected,
        score: player.score,
        elo: player.elo,
        gamesPlayed: player.gamesPlayed,
        tier: player.tier,
      };
    };

    const eloStakes =
      room.players.X && room.players.O
        ? getEloStakes(
            {
              rating: room.players.X.elo,
              gamesPlayed: room.players.X.gamesPlayed,
            },
            {
              rating: room.players.O.elo,
              gamesPlayed: room.players.O.gamesPlayed,
            },
          )
        : null;

    return {
      code: room.code,
      phase: room.phase,
      timeControl: room.timeControl,
      initialTimeMs: room.initialTimeMs,
      players: {
        X: stripSocket(room.players.X),
        O: stripSocket(room.players.O),
      },
      gameState: room.gameState,
      clocks: room.clocks ? { ...room.clocks } : null,
      turnStartedAt: room.turnStartedAt,
      serverNow: this.now(),
      endReason: room.endReason,
      matchWinner: room.matchWinner,
      rematchVotes: Array.from(room.rematchVotes),
      gameNumber: room.gameNumber,
      eloStakes,
      eloResult: room.eloResult,
    };
  }

  private clearTimeoutTimer(room: InternalRoom): void {
    if (room.timeoutTimer !== null) {
      clearTimeout(room.timeoutTimer);
      room.timeoutTimer = null;
    }
  }

  private clearDisconnectTimer(room: InternalRoom, playerId: string): void {
    const timer = room.disconnectTimers.get(playerId);
    if (timer !== undefined) {
      clearTimeout(timer);
      room.disconnectTimers.delete(playerId);
    }
  }

  private clearAllRoomTimers(room: InternalRoom): void {
    this.clearTimeoutTimer(room);
    for (const timer of room.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    room.disconnectTimers.clear();
  }

  private scheduleTimeoutTimer(room: InternalRoom): void {
    this.clearTimeoutTimer(room);
    if (
      room.phase !== 'playing' ||
      room.clocks === null ||
      room.turnStartedAt === null
    ) {
      return;
    }

    const activeSymbol = room.gameState.currentPlayer;
    const remainingMs = Math.max(0, room.clocks[activeSymbol]);

    room.timeoutTimer = setTimeout(() => {
      this.handleTimeout(room.code, activeSymbol);
    }, remainingMs);
  }

  private finalizeMatch(
    room: InternalRoom,
    winner: Player | null,
    endReason: EndReason,
  ): void {
    if (room.phase !== 'playing') return;

    this.clearTimeoutTimer(room);
    room.phase = 'finished';
    room.endReason = endReason;
    room.matchWinner = winner;
    room.turnStartedAt = null;

    if (winner && room.players[winner]) {
      room.players[winner]!.score += 1;
    }

    if (room.players.X && room.players.O) {
      const outcomeX: 1 | 0.5 | 0 =
        winner === 'X' ? 1 : winner === 'O' ? 0 : 0.5;
      const recorded = this.eloStore.recordMatch(
        room.players.X.profileKey,
        room.players.O.profileKey,
        outcomeX,
      );

      room.players.X.elo = recorded.profileX.rating;
      room.players.X.gamesPlayed = recorded.profileX.gamesPlayed;
      room.players.X.tier = recorded.resultX.tier;

      room.players.O.elo = recorded.profileO.rating;
      room.players.O.gamesPlayed = recorded.profileO.gamesPlayed;
      room.players.O.tier = recorded.resultO.tier;

      room.eloResult = {
        X: recorded.resultX,
        O: recorded.resultO,
      };

      this.onProfileUpdated?.(room.players.X.socketId, {
        profile: recorded.profileX,
        tier: recorded.resultX.tier,
      });
      this.onProfileUpdated?.(room.players.O.socketId, {
        profile: recorded.profileO,
        tier: recorded.resultO.tier,
      });
    }

    room.lastActivityAt = this.now();
  }

  private handleTimeout(code: string, timedOutSymbol: Player): void {
    const room = this.rooms.get(code);
    if (!room || room.phase !== 'playing' || room.clocks === null) {
      return;
    }
    if (room.gameState.currentPlayer !== timedOutSymbol) {
      return;
    }

    room.clocks[timedOutSymbol] = 0;
    const winner = getOpponent(timedOutSymbol);
    this.finalizeMatch(room, winner, 'timeout');
    this.onRoomUpdated?.(this.toSnapshot(room));
  }

  private findSeatedPlayer(
    room: InternalRoom,
    playerId: string,
  ): InternalPlayer | null {
    if (room.players.X?.id === playerId) return room.players.X;
    if (room.players.O?.id === playerId) return room.players.O;
    return null;
  }

  private cleanupStaleRooms(): void {
    const cutoff = this.now() - this.staleRoomMs;
    for (const [code, room] of this.rooms.entries()) {
      const bothDisconnected =
        (!room.players.X || !room.players.X.connected) &&
        (!room.players.O || !room.players.O.connected);
      if (bothDisconnected && room.lastActivityAt < cutoff) {
        this.clearAllRoomTimers(room);
        this.rooms.delete(code);
      }
    }
  }

  public createRoom(params: {
    socketId: string;
    playerId: string;
    profileId?: string;
    pseudo: string;
    timeControl: TimeControl;
  }): RoomSnapshot {
    this.cleanupStaleRooms();
    this.cancelMatchmaking({ socketId: params.socketId, playerId: params.playerId });

    const code = this.generateCode();
    const initialTimeMs = TIME_CONTROL_MS[params.timeControl];
    const now = this.now();

    const room: InternalRoom = {
      code,
      phase: 'waiting',
      timeControl: params.timeControl,
      initialTimeMs,
      players: {
        X: this.createInternalPlayer({
          socketId: params.socketId,
          playerId: params.playerId,
          profileId: params.profileId,
          pseudo: params.pseudo,
          symbol: 'X',
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
      rematchVotes: new Set(),
      gameNumber: 1,
      eloResult: null,
      timeoutTimer: null,
      disconnectTimers: new Map(),
      lastActivityAt: now,
    };

    this.rooms.set(code, room);
    this.socketBindings.set(params.socketId, { roomCode: code, playerId: params.playerId });

    return this.toSnapshot(room);
  }

  public peekRoom(
    rawCode: string,
  ): { ok: true; info: RoomPeekInfo } | { ok: false; error: string } {
    const code = normalizeRoomCode(rawCode);
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Salon introuvable ou expiré.' };
    }

    return {
      ok: true,
      info: {
        code: room.code,
        phase: room.phase,
        timeControl: room.timeControl,
        hostPseudo: room.players.X?.pseudo ?? room.players.O?.pseudo ?? null,
        isFull: Boolean(room.players.X && room.players.O),
      },
    };
  }

  public joinRoom(params: {
    code: string;
    socketId: string;
    playerId: string;
    profileId?: string;
    pseudo: string;
  }):
    | { ok: true; snapshot: RoomSnapshot; reconnected: boolean }
    | { ok: false; error: string } {
    const code = normalizeRoomCode(params.code);
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Ce salon n’existe pas ou a expiré.' };
    }

    this.cancelMatchmaking({ socketId: params.socketId, playerId: params.playerId });

    const existing = this.findSeatedPlayer(room, params.playerId);
    const now = this.now();

    if (existing) {
      this.clearDisconnectTimer(room, existing.id);
      existing.socketId = params.socketId;
      existing.connected = true;
      const trimmed = params.pseudo.trim();
      if (trimmed.length > 0 && existing.pseudo === 'Joueur') {
        existing.pseudo = sanitizePseudo(trimmed);
      }
      room.lastActivityAt = now;
      this.socketBindings.set(params.socketId, { roomCode: code, playerId: existing.id });
      return { ok: true, snapshot: this.toSnapshot(room), reconnected: true };
    }

    const openSlot: Player | null =
      room.players.X === null ? 'X' : room.players.O === null ? 'O' : null;
    if (openSlot === null) {
      return { ok: false, error: 'Ce salon est déjà complet.' };
    }

    room.players[openSlot] = this.createInternalPlayer({
      socketId: params.socketId,
      playerId: params.playerId,
      profileId: params.profileId,
      pseudo: params.pseudo,
      symbol: openSlot,
    });

    this.socketBindings.set(params.socketId, {
      roomCode: code,
      playerId: params.playerId,
    });

    if (room.players.X && room.players.O && room.phase === 'waiting') {
      room.phase = 'playing';
      if (room.clocks !== null) {
        room.turnStartedAt = now;
        this.scheduleTimeoutTimer(room);
      }
    }

    room.lastActivityAt = now;
    return { ok: true, snapshot: this.toSnapshot(room), reconnected: false };
  }

  public handleMove(params: {
    code: string;
    socketId: string;
    playerId: string;
    move: Move;
  }):
    | { ok: true; snapshot: RoomSnapshot }
    | { ok: false; error: string; snapshot?: RoomSnapshot } {
    const code = normalizeRoomCode(params.code);
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Salon introuvable.' };
    }

    const player = this.findSeatedPlayer(room, params.playerId);
    if (!player || player.socketId !== params.socketId) {
      return { ok: false, error: 'Action non autorisée dans ce salon.' };
    }

    if (room.phase !== 'playing') {
      return { ok: false, error: 'La partie n’est pas active.' };
    }

    const now = this.now();
    const activeSymbol = room.gameState.currentPlayer;

    if (room.clocks !== null && room.turnStartedAt !== null) {
      const elapsed = Math.max(0, now - room.turnStartedAt);
      const remaining = room.clocks[activeSymbol] - elapsed;
      if (remaining <= 0) {
        this.handleTimeout(code, activeSymbol);
        return {
          ok: false,
          error: 'Temps écoulé.',
          snapshot: this.toSnapshot(room),
        };
      }

      const result = applyMove(room.gameState, params.move, player.symbol);
      if (!result.ok) {
        return { ok: false, error: MOVE_ERROR_MESSAGES[result.error] };
      }

      room.clocks[activeSymbol] = remaining;
      room.gameState = result.state;
    } else {
      const result = applyMove(room.gameState, params.move, player.symbol);
      if (!result.ok) {
        return { ok: false, error: MOVE_ERROR_MESSAGES[result.error] };
      }
      room.gameState = result.state;
    }

    this.clearTimeoutTimer(room);

    if (room.gameState.status === 'won' && room.gameState.winner) {
      this.finalizeMatch(room, room.gameState.winner, 'alignment');
    } else if (room.gameState.status === 'draw') {
      this.finalizeMatch(room, null, 'draw');
    } else if (room.clocks !== null) {
      room.turnStartedAt = now;
      this.scheduleTimeoutTimer(room);
    }

    room.lastActivityAt = now;
    return { ok: true, snapshot: this.toSnapshot(room) };
  }

  public resign(params: {
    code: string;
    socketId: string;
    playerId: string;
  }): { ok: true; snapshot: RoomSnapshot } | { ok: false; error: string } {
    const code = normalizeRoomCode(params.code);
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Salon introuvable.' };
    }

    const player = this.findSeatedPlayer(room, params.playerId);
    if (!player || player.socketId !== params.socketId) {
      return { ok: false, error: 'Action non autorisée.' };
    }

    if (room.phase !== 'playing') {
      return { ok: false, error: 'La partie n’est pas en cours.' };
    }

    const now = this.now();
    if (room.clocks !== null && room.turnStartedAt !== null) {
      const active = room.gameState.currentPlayer;
      const elapsed = Math.max(0, now - room.turnStartedAt);
      room.clocks[active] = Math.max(0, room.clocks[active] - elapsed);
    }

    const winner = getOpponent(player.symbol);
    this.finalizeMatch(room, winner, 'resign');
    return { ok: true, snapshot: this.toSnapshot(room) };
  }

  public requestRematch(params: {
    code: string;
    socketId: string;
    playerId: string;
  }):
    | { ok: true; snapshot: RoomSnapshot; restarted: boolean }
    | { ok: false; error: string } {
    const code = normalizeRoomCode(params.code);
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Salon introuvable.' };
    }

    const player = this.findSeatedPlayer(room, params.playerId);
    if (!player || player.socketId !== params.socketId) {
      return { ok: false, error: 'Action non autorisée.' };
    }

    if (room.phase !== 'finished') {
      return { ok: false, error: 'La partie n’est pas terminée.' };
    }

    if (!room.players.X || !room.players.O) {
      return { ok: false, error: 'Adversaire absent du salon.' };
    }

    room.rematchVotes.add(player.id);
    const now = this.now();
    room.lastActivityAt = now;

    const bothVoted =
      room.rematchVotes.has(room.players.X.id) &&
      room.rematchVotes.has(room.players.O.id);

    if (!bothVoted) {
      return { ok: true, snapshot: this.toSnapshot(room), restarted: false };
    }

    const prevX = room.players.X;
    const prevO = room.players.O;

    room.players.X = { ...prevO, symbol: 'X' };
    room.players.O = { ...prevX, symbol: 'O' };
    room.gameState = createInitialState('X');
    room.clocks =
      room.initialTimeMs !== null
        ? { X: room.initialTimeMs, O: room.initialTimeMs }
        : null;
    room.phase = 'playing';
    room.endReason = null;
    room.matchWinner = null;
    room.eloResult = null;
    room.rematchVotes.clear();
    room.gameNumber += 1;

    if (room.clocks !== null) {
      room.turnStartedAt = now;
      this.scheduleTimeoutTimer(room);
    } else {
      room.turnStartedAt = null;
    }

    return { ok: true, snapshot: this.toSnapshot(room), restarted: true };
  }

  public leaveRoom(params: {
    code: string;
    socketId: string;
    playerId: string;
  }): { snapshot?: RoomSnapshot; deleted: boolean } {
    const code = normalizeRoomCode(params.code);
    this.socketBindings.delete(params.socketId);
    const room = this.rooms.get(code);
    if (!room) {
      return { deleted: false };
    }

    const player = this.findSeatedPlayer(room, params.playerId);
    if (!player) {
      return { deleted: false };
    }

    this.clearDisconnectTimer(room, player.id);
    player.connected = false;
    room.rematchVotes.delete(player.id);

    if (room.phase === 'waiting') {
      this.clearAllRoomTimers(room);
      this.rooms.delete(code);
      return { deleted: true };
    }

    if (room.phase === 'playing') {
      const winner = getOpponent(player.symbol);
      this.finalizeMatch(room, winner, 'abandoned');
    }

    room.lastActivityAt = this.now();
    return { snapshot: this.toSnapshot(room), deleted: false };
  }

  public handleDisconnect(socketId: string): {
    roomCode?: string;
    snapshot?: RoomSnapshot;
    leftQueue?: { timeControl: TimeControl; queueSize: number; remainingSockets: string[] };
  } {
    const leftQueue = this.cancelMatchmaking({ socketId });
    const binding = this.socketBindings.get(socketId);
    if (!binding) {
      return { leftQueue };
    }

    this.socketBindings.delete(socketId);
    const room = this.rooms.get(binding.roomCode);
    if (!room) {
      return { leftQueue };
    }

    const player = this.findSeatedPlayer(room, binding.playerId);
    if (!player || player.socketId !== socketId) {
      return { leftQueue };
    }

    player.connected = false;
    room.lastActivityAt = this.now();

    if (room.phase === 'waiting' || room.phase === 'playing') {
      this.clearDisconnectTimer(room, player.id);
      const timer = setTimeout(() => {
        const currentRoom = this.rooms.get(room.code);
        if (!currentRoom) return;
        const seated = this.findSeatedPlayer(currentRoom, player.id);
        if (!seated || seated.connected) return;

        if (currentRoom.phase === 'waiting') {
          this.clearAllRoomTimers(currentRoom);
          this.rooms.delete(currentRoom.code);
          return;
        }

        if (currentRoom.phase === 'playing') {
          const winner = getOpponent(seated.symbol);
          this.finalizeMatch(currentRoom, winner, 'abandoned');
          this.onRoomUpdated?.(this.toSnapshot(currentRoom));
        }
      }, this.disconnectGraceMs);

      room.disconnectTimers.set(player.id, timer);
    }

    return {
      roomCode: room.code,
      snapshot: this.toSnapshot(room),
      leftQueue,
    };
  }

  public joinMatchmaking(params: {
    socketId: string;
    playerId: string;
    profileId?: string;
    pseudo: string;
    timeControl: TimeControl;
  }):
    | {
        matched: true;
        code: string;
        snapshot: RoomSnapshot;
        participants: [
          { socketId: string; playerId: string },
          { socketId: string; playerId: string },
        ];
      }
    | {
        matched: false;
        timeControl: TimeControl;
        queueSize: number;
        waitingSockets: string[];
      } {
    this.cancelMatchmaking({ socketId: params.socketId, playerId: params.playerId });

    const queue = this.queues[params.timeControl];
    const opponentIndex = queue.findIndex((entry) => entry.playerId !== params.playerId);

    if (opponentIndex !== -1) {
      const [opponent] = queue.splice(opponentIndex, 1);
      this.createRoom({
        socketId: opponent.socketId,
        playerId: opponent.playerId,
        profileId: opponent.profileId,
        pseudo: opponent.pseudo,
        timeControl: params.timeControl,
      });

      const code = this.socketBindings.get(opponent.socketId)!.roomCode;
      const joined = this.joinRoom({
        code,
        socketId: params.socketId,
        playerId: params.playerId,
        profileId: params.profileId,
        pseudo: params.pseudo,
      });

      if (!joined.ok) {
        throw new Error(`Matchmaking failed to seat second player: ${joined.error}`);
      }

      return {
        matched: true,
        code,
        snapshot: joined.snapshot,
        participants: [
          { socketId: opponent.socketId, playerId: opponent.playerId },
          { socketId: params.socketId, playerId: params.playerId },
        ],
      };
    }

    queue.push({
      socketId: params.socketId,
      playerId: params.playerId,
      profileId: params.profileId,
      pseudo: sanitizePseudo(params.pseudo),
      joinedAt: this.now(),
    });

    return {
      matched: false,
      timeControl: params.timeControl,
      queueSize: queue.length,
      waitingSockets: queue.map((entry) => entry.socketId),
    };
  }

  public cancelMatchmaking(params: {
    socketId?: string;
    playerId?: string;
  }):
    | { timeControl: TimeControl; queueSize: number; remainingSockets: string[] }
    | undefined {
    const cadences: TimeControl[] = ['unlimited', 'rapid', 'blitz'];
    for (const cadence of cadences) {
      const queue = this.queues[cadence];
      const before = queue.length;
      const filtered = queue.filter((entry) => {
        if (params.socketId && entry.socketId === params.socketId) return false;
        if (params.playerId && entry.playerId === params.playerId) return false;
        return true;
      });
      if (filtered.length !== before) {
        this.queues[cadence] = filtered;
        return {
          timeControl: cadence,
          queueSize: filtered.length,
          remainingSockets: filtered.map((e) => e.socketId),
        };
      }
    }
    return undefined;
  }

  public getRoomSnapshot(rawCode: string): RoomSnapshot | null {
    const room = this.rooms.get(normalizeRoomCode(rawCode));
    return room ? this.toSnapshot(room) : null;
  }

  public dispose(): void {
    for (const room of this.rooms.values()) {
      this.clearAllRoomTimers(room);
    }
    this.rooms.clear();
    this.socketBindings.clear();
    this.queues.unlimited = [];
    this.queues.rapid = [];
    this.queues.blitz = [];
  }
}
