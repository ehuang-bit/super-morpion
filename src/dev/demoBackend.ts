/**
 * Faux serveur du mode démo (développement uniquement).
 *
 * Il répond aux mêmes routes que `netlify/functions/game.mts`, en mémoire,
 * avec la même logique de salon partagée (`shared/onlineRoomLogic.ts`) et un
 * adversaire simulé. Le client passe donc par son vrai chemin : envoi des
 * coups, synchronisation périodique, pendules, fin de partie, classement.
 *
 * Ce fichier n'est chargé que si `DEMO_MODE` est vrai (voir `demoMode.ts`).
 */
import {
  createDefaultEloProfile,
  getEloTier,
  getNextEloTier,
  type EloProfile,
} from '@shared/elo';
import {
  applyMove,
  createInitialState,
  getLegalMoves,
  getOpponent,
  type GameState,
  type Move,
  type Player,
} from '@shared/gameEngine';
import {
  applyEloOutcomeToRoom,
  applyMoveToStoredRoom,
  createStoredRoom,
  generateRoomCode,
  joinStoredRoom,
  leaveStoredRoom,
  resignStoredRoom,
  settleTimeoutsAndAbandonment,
  toRoomPeekInfo,
  toRoomSnapshot,
  touchPlayerPresence,
  voteRematchStoredRoom,
  type StoredRoom,
} from '@shared/onlineRoomLogic';
import type {
  LeaderboardPayload,
  LobbyStats,
  MatchHistoryItem,
  PlayerStatsPayload,
  TimeControl,
} from '@shared/protocol';
import { getInitialDemoBotMode, saveDemoBotMode, type DemoBotMode } from './demoMode';

interface DemoResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}

const BOT_ID = 'demo-bot';
const BOT_PROFILE_KEY = 'demo-bot';
const HUMAN_PROFILE_KEY = 'demo-human';
const BOT_NAMES = ['Camille', 'Sacha', 'Noa', 'Élise', 'Malo', 'Inès'];
const DAY_MS = 86_400_000;

const state = {
  room: null as StoredRoom | null,
  version: 0,
  humanId: '',
  humanPseudo: 'Joueur',
  botMode: getInitialDemoBotMode(),
  botName: BOT_NAMES[0],
  botMoveAt: null as number | null,
  botJoinAt: null as number | null,
  botRematchAt: null as number | null,
  queue: null as { joinedAt: number; timeControl: TimeControl } | null,
  script: null as { move: Move; byPlayerId: string; at: number } | null,
  profiles: new Map<string, EloProfile>(),
  matches: [] as MatchHistoryItem[],
  matchId: 100,
};

/* ---------- Profils et historique fictifs ---------- */

function seedProfiles(): void {
  if (state.profiles.size > 0) return;
  const now = Date.now();

  // Quatorze parties passées, pour que les statistiques aient de la matière
  const deltas = [22, 18, -15, 16, 14, -13, 12, -12, 11, 0, 10, -10, 9, 8];
  let rating = 1270;
  const matches: MatchHistoryItem[] = [];
  let wins = 0;
  let draws = 0;
  let losses = 0;
  deltas.forEach((delta, index) => {
    const result = delta > 0 ? 'win' : delta < 0 ? 'loss' : 'draw';
    if (result === 'win') wins += 1;
    else if (result === 'loss') losses += 1;
    else draws += 1;
    matches.push({
      id: index + 1,
      roomCode: generateRoomCode(),
      opponentPseudo: BOT_NAMES[index % BOT_NAMES.length],
      opponentElo: rating + ((index * 37) % 90) - 45,
      playerSymbol: index % 2 === 0 ? 'X' : 'O',
      result,
      endReason: result === 'draw' ? 'draw' : index % 5 === 0 ? 'timeout' : 'alignment',
      eloBefore: rating,
      eloAfter: rating + delta,
      eloDelta: delta,
      movesCount: 28 + ((index * 11) % 30),
      timeControl: (['unlimited', 'rapid', 'blitz'] as const)[index % 3],
      playedAt: now - (deltas.length - index) * DAY_MS,
    });
    rating += delta;
  });
  state.matches = matches.reverse();

  state.profiles.set(HUMAN_PROFILE_KEY, {
    ...createDefaultEloProfile(),
    rating,
    rd: 95,
    gamesPlayed: deltas.length,
    wins,
    draws,
    losses,
    peakRating: rating,
    streak: 2,
    lastPlayedAt: now - DAY_MS,
  });
  state.profiles.set(BOT_PROFILE_KEY, {
    ...createDefaultEloProfile(),
    rating: rating + 28,
    rd: 90,
    gamesPlayed: 40,
    wins: 21,
    draws: 3,
    losses: 16,
    peakRating: rating + 60,
    lastPlayedAt: now - DAY_MS,
  });
}

function profileOf(key: string): EloProfile {
  seedProfiles();
  return state.profiles.get(key) ?? createDefaultEloProfile();
}

/* ---------- Adversaire simulé ---------- */

function capturesBoard(gameState: GameState, move: Move, player: Player): boolean {
  const res = applyMove(gameState, move, player);
  return res.ok && res.capturedBoard;
}

function chooseBotMove(gameState: GameState, mode: DemoBotMode): Move | null {
  const moves = getLegalMoves(gameState);
  if (moves.length === 0) return null;
  const random = () => moves[Math.floor(Math.random() * moves.length)];
  if (mode !== 'fort') return random();

  const me = gameState.currentPlayer;
  const opp = getOpponent(me);
  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const res = applyMove(gameState, move, me);
    if (!res.ok) continue;
    let score = Math.random();
    if (res.state.status === 'won') score += 1000;
    if (res.capturedBoard) score += 60;
    // Bloquer une prise adverse dans cette zone
    const asOpp: GameState = { ...gameState, currentPlayer: opp };
    if (capturesBoard(asOpp, move, opp)) score += 25;
    if (move.cellIndex === 4) score += 2;
    // Éviter d'offrir une prise ou un coup libre
    if (res.state.status === 'playing') {
      if (res.state.isFreeMove) score -= 20;
      const replies = getLegalMoves(res.state);
      if (replies.some((reply) => capturesBoard(res.state, reply, opp))) score -= 30;
    }
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best ?? random();
}

/**
 * Partie complète jouée par deux politiques simples, pour produire une fin
 * de partie réaliste : `target` gagne (ou match nul si `null`).
 */
function generateFinishedGame(
  target: Player | null,
): { before: GameState; lastMove: Move } | null {
  for (let attempt = 0; attempt < 600; attempt++) {
    let game = createInitialState('X');
    let before = game;
    let lastMove: Move | null = null;
    while (game.status === 'playing') {
      const mover = game.currentPlayer;
      const strong = target !== null && mover === target;
      const move = chooseBotMove(game, strong ? 'fort' : 'facile');
      if (!move) break;
      const res = applyMove(game, move, mover);
      if (!res.ok) break;
      before = game;
      lastMove = move;
      game = res.state;
    }
    if (!lastMove) continue;
    const matches =
      target === null ? game.status === 'draw' : game.status === 'won' && game.winner === target;
    if (matches) return { before, lastMove };
  }
  return null;
}

/* ---------- Vie du salon ---------- */

function bump(room: StoredRoom): void {
  state.room = room;
  state.version += 1;
}

function botSymbol(room: StoredRoom): Player | null {
  if (room.players.X?.id === BOT_ID) return 'X';
  if (room.players.O?.id === BOT_ID) return 'O';
  return null;
}

function commitElo(room: StoredRoom, now: number): StoredRoom {
  if (room.phase !== 'finished' || room.eloResult !== null) return room;
  if (!room.players.X || !room.players.O) return room;
  const keyX = room.players.X.profileKey;
  const keyO = room.players.O.profileKey;
  const updated = applyEloOutcomeToRoom(room, profileOf(keyX), profileOf(keyO), now);
  if (!updated.rated) return updated.room;

  state.profiles.set(keyX, updated.nextProfileX);
  state.profiles.set(keyO, updated.nextProfileO);

  const humanSym: Player = room.players.X.id === state.humanId ? 'X' : 'O';
  const mine = updated.room.eloResult![humanSym];
  const opponent = updated.room.players[getOpponent(humanSym)]!;
  state.matchId += 1;
  state.matches.unshift({
    id: state.matchId,
    roomCode: room.code,
    opponentPseudo: opponent.pseudo,
    opponentElo: opponent.elo,
    playerSymbol: humanSym,
    result:
      room.matchWinner === null ? 'draw' : room.matchWinner === humanSym ? 'win' : 'loss',
    endReason: room.endReason ?? 'alignment',
    eloBefore: mine.before,
    eloAfter: mine.after,
    eloDelta: mine.delta,
    movesCount: room.gameState.moveHistory.length,
    timeControl: room.timeControl,
    playedAt: now,
  });
  return updated.room;
}

function tick(now: number): void {
  let room = state.room;
  if (!room) return;

  if (room.phase === 'waiting') {
    if (state.botJoinAt !== null && now >= state.botJoinAt) {
      state.botJoinAt = null;
      const joined = joinStoredRoom(room, {
        playerId: BOT_ID,
        profileKey: BOT_PROFILE_KEY,
        pseudo: state.botName,
        eloProfile: profileOf(BOT_PROFILE_KEY),
        now,
      });
      if (joined.ok) bump(joined.room);
    }
    return;
  }

  const bot = botSymbol(room);

  if (room.phase === 'playing') {
    // L'adversaire simulé reste « en ligne »
    if (bot && room.players[bot]) room.players[bot]!.lastSeenAt = now;

    const settled = settleTimeoutsAndAbandonment(room, now);
    if (settled.changed) {
      bump(settled.room);
      room = settled.room;
      state.botMoveAt = null;
    }

    if (room.phase === 'playing' && state.script && now >= state.script.at) {
      const { move, byPlayerId } = state.script;
      state.script = null;
      const moved = applyMoveToStoredRoom(room, { playerId: byPlayerId, move, now });
      if (moved.ok) {
        bump(moved.room);
        room = moved.room;
      }
    } else if (
      room.phase === 'playing' &&
      !state.script &&
      bot &&
      room.gameState.currentPlayer === bot &&
      state.botMode !== 'absent' &&
      room.turnStartedAt !== null &&
      now >= room.turnStartedAt
    ) {
      if (state.botMoveAt === null) {
        state.botMoveAt = now + 900 + Math.random() * 1500;
      } else if (now >= state.botMoveAt) {
        state.botMoveAt = null;
        const move = chooseBotMove(room.gameState, state.botMode);
        if (move) {
          const moved = applyMoveToStoredRoom(room, { playerId: BOT_ID, move, now });
          if (moved.ok) {
            bump(moved.room);
            room = moved.room;
          }
        }
      }
    }
  }

  if (room.phase === 'finished') {
    state.script = null;
    state.botMoveAt = null;
    if (room.eloResult === null) {
      const committed = commitElo(room, now);
      if (committed !== room) {
        bump(committed);
        room = committed;
      }
    }
    // Le bot accepte la revanche peu après la demande du joueur
    if (room.rematchVotes.includes(state.humanId) && !room.rematchVotes.includes(BOT_ID)) {
      if (state.botRematchAt === null) {
        state.botRematchAt = now + 1200;
      } else if (now >= state.botRematchAt) {
        state.botRematchAt = null;
        const voted = voteRematchStoredRoom(room, { playerId: BOT_ID, now });
        if (voted.ok) bump(voted.room);
      }
    }
  }
}

function startRoom(
  timeControl: TimeControl,
  pseudo: string,
  playerId: string,
  now: number,
  withBot: boolean,
): StoredRoom {
  state.humanId = playerId;
  state.humanPseudo = pseudo;
  state.botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  state.botMoveAt = null;
  state.botRematchAt = null;
  state.script = null;
  let room = createStoredRoom({
    code: generateRoomCode(),
    playerId,
    profileKey: HUMAN_PROFILE_KEY,
    pseudo,
    timeControl,
    eloProfile: profileOf(HUMAN_PROFILE_KEY),
    now,
  });
  if (withBot) {
    const joined = joinStoredRoom(room, {
      playerId: BOT_ID,
      profileKey: BOT_PROFILE_KEY,
      pseudo: state.botName,
      eloProfile: profileOf(BOT_PROFILE_KEY),
      now,
    });
    if (joined.ok) room = joined.room;
    state.botJoinAt = null;
  } else {
    // Duel privé : l'« ami » rejoint après quelques secondes
    state.botJoinAt = now + 3500;
  }
  state.version = 1;
  state.room = room;
  return room;
}

function snapshotResponse(now: number): DemoResponse {
  return {
    ok: true,
    data: { snapshot: toRoomSnapshot(state.room!, now), version: state.version },
  };
}

/* ---------- Statistiques et classement fictifs ---------- */

function statsPayload(now: number): PlayerStatsPayload {
  const profile = profileOf(HUMAN_PROFILE_KEY);
  const chronological = [...state.matches].reverse();
  const next = getNextEloTier(profile.rating);
  return {
    profile,
    tier: getEloTier(profile.rating).label,
    nextTier: next ? { label: next.label, min: next.min } : null,
    winRate:
      profile.gamesPlayed > 0 ? Math.round((profile.wins / profile.gamesPlayed) * 100) : 0,
    matches: state.matches,
    eloHistory:
      chronological.length > 0
        ? [
            { rating: chronological[0].eloBefore, playedAt: chronological[0].playedAt },
            ...chronological.map((m) => ({ rating: m.eloAfter, playedAt: m.playedAt })),
          ]
        : [{ rating: profile.rating, playedAt: now }],
    provisional: false,
    percentile: 71,
    rankedPlayers: 184,
  };
}

function leaderboardPayload(): LeaderboardPayload {
  const me = profileOf(HUMAN_PROFILE_KEY);
  const names = [
    'Aurèle', 'Maëlle', 'Tiago', 'Yuna', 'Basile', 'Capucine', 'Ilyès', 'Romy', 'Octave',
    'Salomé', 'Gaspard', 'Louison', 'Nour', 'Côme', 'Apolline', 'Swann', 'Zélie', 'Marius',
  ];
  const others = names.map((pseudo, index) => ({
    pseudo,
    rating: 2040 - index * 43,
    rd: 60 + ((index * 13) % 50),
    gamesPlayed: 180 - index * 7,
    wins: 120 - index * 5,
    isSelf: false,
  }));
  const all = [
    ...others,
    {
      pseudo: state.humanPseudo,
      rating: me.rating,
      rd: me.rd,
      gamesPlayed: me.gamesPlayed,
      wins: me.wins,
      isSelf: true,
    },
  ].sort((a, b) => b.rating - a.rating);
  return {
    entries: all.map((entry, index) => ({
      rank: index + 1,
      pseudo: entry.pseudo,
      rating: Math.round(entry.rating),
      rd: Math.round(entry.rd),
      provisional: false,
      gamesPlayed: entry.gamesPlayed,
      wins: entry.wins,
      tier: getEloTier(entry.rating).label,
      isSelf: entry.isSelf,
    })),
    selfRank: null,
    minGames: 3,
  };
}

/* ---------- Routes ---------- */

function route(method: string, url: URL, body: Record<string, unknown>, now: number): DemoResponse {
  const path = url.pathname;
  const playerId =
    (typeof body.playerId === 'string' ? body.playerId : null) ??
    url.searchParams.get('playerId') ??
    state.humanId;
  const pseudo =
    (typeof body.pseudo === 'string' ? body.pseudo : null) ??
    url.searchParams.get('pseudo') ??
    state.humanPseudo;

  if (path === '/health') return { ok: true, data: { serverNow: now } };

  if (path === '/profile') {
    if (pseudo) state.humanPseudo = pseudo;
    const profile = profileOf(HUMAN_PROFILE_KEY);
    return { ok: true, data: { profile, tier: getEloTier(profile.rating).label } };
  }
  if (path === '/stats') {
    if (pseudo) state.humanPseudo = pseudo;
    return { ok: true, data: statsPayload(now) };
  }
  if (path === '/leaderboard') return { ok: true, data: leaderboardPayload() };
  if (path === '/lobby') {
    const lobby: LobbyStats = {
      liveGames: 6,
      queue: { unlimited: 2, rapid: 1, blitz: 0 },
      playersOnline: 17,
    };
    return { ok: true, data: lobby };
  }

  if (path === '/matchmaking/join') {
    const timeControl = (body.timeControl as TimeControl) ?? 'unlimited';
    state.humanId = playerId;
    state.humanPseudo = pseudo;
    state.queue = { joinedAt: now, timeControl };
    return { ok: true, data: { matched: false, queueSize: 1 } };
  }
  if (path === '/matchmaking/poll') {
    if (!state.queue) return { ok: true, data: { matched: false, expired: true } };
    if (now - state.queue.joinedAt < 2200) {
      return { ok: true, data: { matched: false, queueSize: 2 } };
    }
    const { timeControl } = state.queue;
    state.queue = null;
    startRoom(timeControl, state.humanPseudo, state.humanId, now, true);
    return {
      ok: true,
      data: {
        matched: true,
        code: state.room!.code,
        snapshot: toRoomSnapshot(state.room!, now),
        version: state.version,
      },
    };
  }
  if (path === '/matchmaking/cancel') {
    state.queue = null;
    return { ok: true };
  }

  if (path === '/rooms' && method === 'POST') {
    const timeControl = (body.timeControl as TimeControl) ?? 'unlimited';
    startRoom(timeControl, pseudo, playerId, now, false);
    return snapshotResponse(now);
  }

  const match = path.match(/^\/rooms\/([^/]+)\/([a-z]+)$/);
  if (!match) return { ok: false, error: 'Route inconnue (mode démo).' };
  const [, code, action] = match;
  const room = state.room;
  if (!room || room.code !== code.toUpperCase()) {
    return { ok: false, error: 'Ce salon n’existe plus.' };
  }

  if (action === 'peek') return { ok: true, data: { info: toRoomPeekInfo(room) } };

  if (action === 'state') {
    const clientVersion = Number(url.searchParams.get('version') ?? '0');
    const touched = touchPlayerPresence(room, playerId, now);
    if (touched.changed) state.room = touched.room;
    tick(now);
    if (clientVersion === state.version) {
      return { ok: true, data: { unchanged: true, serverNow: now } };
    }
    return snapshotResponse(now);
  }

  if (action === 'join') {
    const joined = joinStoredRoom(room, {
      playerId,
      profileKey: HUMAN_PROFILE_KEY,
      pseudo,
      eloProfile: profileOf(HUMAN_PROFILE_KEY),
      now,
    });
    if (!joined.ok) return { ok: false, error: joined.error };
    bump(joined.room);
    return snapshotResponse(now);
  }

  if (action === 'move') {
    tick(now);
    const moved = applyMoveToStoredRoom(state.room!, {
      playerId,
      move: body.move as Move,
      now,
    });
    if (!moved.ok) {
      if (moved.settledRoom) {
        bump(commitElo(moved.settledRoom, now));
        return { ...snapshotResponse(now), ok: false, error: moved.error };
      }
      return { ok: false, error: moved.error };
    }
    state.botMoveAt = null;
    bump(commitElo(moved.room, now));
    return snapshotResponse(now);
  }

  if (action === 'resign') {
    const resigned = resignStoredRoom(room, { playerId, now });
    if (!resigned.ok) return { ok: false, error: resigned.error };
    bump(commitElo(resigned.room, now));
    return snapshotResponse(now);
  }

  if (action === 'rematch') {
    const voted = voteRematchStoredRoom(room, { playerId, now });
    if (!voted.ok) return { ok: false, error: voted.error };
    bump(voted.room);
    return snapshotResponse(now);
  }

  if (action === 'leave') {
    const left = leaveStoredRoom(room, { playerId, now });
    if (!left.deleted) commitElo(left.room, now);
    state.room = null;
    state.version = 0;
    state.script = null;
    return { ok: true };
  }

  return { ok: false, error: 'Route inconnue (mode démo).' };
}

export async function demoApiRequest(
  path: string,
  options: RequestInit = {},
): Promise<DemoResponse> {
  // Petite latence, comme un vrai aller-retour réseau
  await new Promise((resolve) => window.setTimeout(resolve, 40 + Math.random() * 70));
  const now = Date.now();
  const method = (options.method ?? 'GET').toUpperCase();
  const url = new URL(path, 'http://demo.local');
  let body: Record<string, unknown> = {};
  if (typeof options.body === 'string') {
    try {
      body = JSON.parse(options.body) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }
  const response = route(method, url, body, now);
  // Copie profonde : le client ne doit pas partager d'objets avec le « serveur »
  return JSON.parse(JSON.stringify(response)) as DemoResponse;
}

/* ---------- Commandes du panneau de démo ---------- */

export interface DemoFinishOptions {
  /** Place le joueur juste sous le palier suivant, pour voir la promotion. */
  promotion?: boolean;
}

export const demoControls = {
  getBotMode(): DemoBotMode {
    return state.botMode;
  },

  setBotMode(mode: DemoBotMode): void {
    state.botMode = mode;
    state.botMoveAt = null;
    saveDemoBotMode(mode);
  },

  isPlaying(): boolean {
    return state.room?.phase === 'playing';
  },

  /**
   * Avance la partie en cours jusqu'à un coup de la fin souhaitée, puis joue
   * ce dernier coup une seconde plus tard pour laisser voir les animations.
   */
  finish(result: 'win' | 'loss' | 'draw', options: DemoFinishOptions = {}): boolean {
    const room = state.room;
    if (!room || room.phase !== 'playing' || !room.players.X || !room.players.O) {
      return false;
    }
    const now = Date.now();
    const humanSym: Player = room.players.X.id === state.humanId ? 'X' : 'O';
    const target = result === 'draw' ? null : result === 'win' ? humanSym : getOpponent(humanSym);
    const generated = generateFinishedGame(target);
    if (!generated) return false;

    const next: StoredRoom = {
      ...room,
      players: { X: { ...room.players.X }, O: { ...room.players.O } },
      gameState: generated.before,
      turnStartedAt: now,
      moveTimeouts: { X: 0, O: 0 },
      lastActivityAt: now,
    };

    if (options.promotion && result === 'win') {
      const profile = profileOf(HUMAN_PROFILE_KEY);
      const nextTier = getNextEloTier(profile.rating);
      if (nextTier) {
        const boosted: EloProfile = { ...profile, rating: nextTier.min - 3, rd: 95 };
        state.profiles.set(HUMAN_PROFILE_KEY, boosted);
        const mine = next.players[humanSym]!;
        mine.elo = boosted.rating;
        mine.rd = boosted.rd;
        mine.tier = getEloTier(boosted.rating).label;
      }
    }

    const mover = generated.before.currentPlayer;
    state.script = {
      move: generated.lastMove,
      byPlayerId: next.players[mover]!.id,
      at: now + 1100,
    };
    state.botMoveAt = null;
    bump(next);
    return true;
  },
};
