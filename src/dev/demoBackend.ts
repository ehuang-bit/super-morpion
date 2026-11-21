/**
 * Faux serveur du mode démo (développement uniquement).
 *
 * Il répond aux mêmes routes que `netlify/functions/game.mts`, en mémoire,
 * avec la même logique de salon partagée (`shared/onlineRoomLogic.ts`) et des
 * joueurs simulés (1v1, 2v2 en équipes AB vs CD, mode spectateur et emotes).
 * Le client passe donc par son vrai chemin : envoi des coups, synchronisation
 * périodique, pendules, fin de partie, classement.
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
  findPlayerInRoom,
  generateRoomCode,
  getRoomActiveSeat,
  getRoomMode,
  joinStoredRoom,
  leaveStoredRoom,
  resignStoredRoom,
  sendEmoteStoredRoom,
  settleTimeoutsAndAbandonment,
  switchSeatStoredRoom,
  toRoomPeekInfo,
  toRoomSnapshot,
  touchPlayerPresence,
  voteRematchStoredRoom,
  type StoredPlayer,
  type StoredRoom,
} from '@shared/onlineRoomLogic';
import type {
  AuthUser,
  EmoteId,
  LeaderboardPayload,
  LobbyStats,
  MatchHistoryItem,
  PlayerStatsPayload,
  RoomMode,
  TeamSeat,
  TimeControl,
} from '@shared/protocol';
import {
  presentAccountStreak,
  recordStreakActivity,
  shiftUtcDateKey,
  toUtcDateKey,
  type StoredStreakState,
} from '@shared/streak';
import { getInitialDemoBotMode, saveDemoBotMode, type DemoBotMode } from './demoMode';

interface DemoResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}

const BOT_ID = 'demo-bot';
const BOT_PROFILE_KEY = 'demo-bot';
const HUMAN_PROFILE_KEY = 'demo-human';
const DEMO_AUTH_TOKEN = 'demo-account-token';
const BOT_NAMES = ['Camille', 'Sacha', 'Noa', 'Élise', 'Malo', 'Inès'];
const DAY_MS = 86_400_000;

interface PendingBotJoin {
  id: string;
  profileKey: string;
  pseudo: string;
  at: number;
}

interface PendingBotEmote {
  botId: string;
  emote: EmoteId;
  at: number;
}

function createInitialDemoStreak(now: number): StoredStreakState {
  // Démarre avec 4 jours consécutifs terminant hier : la prochaine partie ou le défi allume le jour 5 !
  const today = toUtcDateKey(now);
  const d4 = shiftUtcDateKey(today, -4);
  const d3 = shiftUtcDateKey(today, -3);
  const d2 = shiftUtcDateKey(today, -2);
  const d1 = shiftUtcDateKey(today, -1);
  return {
    current: 4,
    best: 9,
    lastActiveDate: d1,
    totalActiveDays: 22,
    recentDates: [shiftUtcDateKey(today, -6), d4, d3, d2, d1],
  };
}

const state = {
  room: null as StoredRoom | null,
  version: 0,
  humanId: '',
  humanPseudo: 'Joueur',
  botMode: getInitialDemoBotMode(),
  botName: BOT_NAMES[0],
  botMoveAt: null as number | null,
  botJoins: [] as PendingBotJoin[],
  botRematchAt: null as number | null,
  botEmote: null as PendingBotEmote | null,
  queue: null as { joinedAt: number; timeControl: TimeControl } | null,
  script: null as { move: Move; byPlayerId: string; at: number } | null,
  profiles: new Map<string, EloProfile>(),
  matches: [] as MatchHistoryItem[],
  matchId: 100,
  account: null as {
    id: string;
    username: string;
    createdAt: number;
    streak: StoredStreakState;
  } | null,
  accountToken: null as string | null,
};

function isBotId(id: string | undefined): boolean {
  return Boolean(id && id.startsWith(BOT_ID));
}

function getAllBots(room: StoredRoom): StoredPlayer[] {
  if (getRoomMode(room) === '2v2' && room.seats) {
    return (['A', 'B', 'C', 'D'] as const)
      .map((s) => room.seats![s])
      .filter((p): p is StoredPlayer => Boolean(p && isBotId(p.id)));
  }
  return [room.players.X, room.players.O].filter(
    (p): p is StoredPlayer => Boolean(p && isBotId(p.id)),
  );
}

function getActiveMover(room: StoredRoom): StoredPlayer | null {
  if (getRoomMode(room) === '2v2' && room.seats) {
    const seat = getRoomActiveSeat(room);
    return seat ? room.seats[seat] : null;
  }
  return room.players[room.gameState.currentPlayer];
}

/* ---------- Profils et historique fictifs ---------- */

function seedProfiles(): void {
  if (state.profiles.size > 0) return;
  const now = Date.now();

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
  if (state.profiles.has(key)) return state.profiles.get(key)!;
  if (key.startsWith(BOT_PROFILE_KEY)) {
    const base = state.profiles.get(BOT_PROFILE_KEY)!;
    const offset = ((key.charCodeAt(key.length - 1) || 0) % 5) * 18 - 30;
    return { ...base, rating: base.rating + offset };
  }
  return createDefaultEloProfile();
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
    const asOpp: GameState = { ...gameState, currentPlayer: opp };
    if (capturesBoard(asOpp, move, opp)) score += 25;
    if (move.cellIndex === 4) score += 2;
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

function scheduleBotEmote(room: StoredRoom, emote: EmoteId, now: number, delayMs = 700): void {
  if (state.botEmote) return;
  const bots = getAllBots(room);
  if (bots.length === 0) return;
  const bot = bots[Math.floor(Math.random() * bots.length)];
  state.botEmote = { botId: bot.id, emote, at: now + delayMs };
}

function commitElo(room: StoredRoom, now: number): StoredRoom {
  if (room.phase !== 'finished' || room.eloResult !== null) return room;
  if (room.phase === 'finished' && room.endReason !== 'aborted' && state.account) {
    const humanParticipated = Boolean(findPlayerInRoom(room, state.humanId));
    if (humanParticipated) {
      const updatedStreak = recordStreakActivity(state.account.streak, now);
      state.account.streak = updatedStreak.next;
    }
  }
  if (getRoomMode(room) === '2v2') return room;
  if (!room.players.X || !room.players.O) return room;
  const humanInRoom =
    room.players.X.id === state.humanId || room.players.O.id === state.humanId;
  if (!humanInRoom) return room;

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

  // Maintient la présence en ligne de tous les bots
  for (const bot of getAllBots(room)) {
    bot.lastSeenAt = now;
  }

  if (room.phase === 'waiting') {
    while (state.botJoins.length > 0 && now >= state.botJoins[0].at) {
      const nextBot = state.botJoins.shift()!;
      const joined = joinStoredRoom(room, {
        playerId: nextBot.id,
        profileKey: nextBot.profileKey,
        pseudo: nextBot.pseudo,
        eloProfile: profileOf(nextBot.profileKey),
        now,
      });
      if (joined.ok) {
        bump(joined.room);
        room = joined.room;
      }
    }
    return;
  }

  if (room.phase === 'playing') {
    const settled = settleTimeoutsAndAbandonment(room, now);
    if (settled.changed) {
      bump(settled.room);
      room = settled.room;
      state.botMoveAt = null;
    }

    // Emote programmé d'un bot
    if (room.phase === 'playing' && state.botEmote && now >= state.botEmote.at) {
      const pending = state.botEmote;
      state.botEmote = null;
      const sent = sendEmoteStoredRoom(room, {
        playerId: pending.botId,
        emote: pending.emote,
        now,
      });
      if (sent.ok) {
        bump(sent.room);
        room = sent.room;
      }
    }

    const activeMover = getActiveMover(room);
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
      activeMover &&
      isBotId(activeMover.id) &&
      state.botMode !== 'absent' &&
      room.turnStartedAt !== null &&
      now >= room.turnStartedAt
    ) {
      if (state.botMoveAt === null) {
        const delay = getRoomMode(room) === '2v2' ? 850 + Math.random() * 1050 : 900 + Math.random() * 1400;
        state.botMoveAt = now + delay;
      } else if (now >= state.botMoveAt) {
        state.botMoveAt = null;
        const move = chooseBotMove(room.gameState, state.botMode);
        if (move) {
          const moved = applyMoveToStoredRoom(room, {
            playerId: activeMover.id,
            move,
            now,
          });
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
    // Les bots acceptent la revanche peu après le vote du joueur
    const bots = getAllBots(room);
    const pendingBots = bots.filter((b) => !room!.rematchVotes.includes(b.id));
    if (room.rematchVotes.includes(state.humanId) && pendingBots.length > 0) {
      if (state.botRematchAt === null) {
        state.botRematchAt = now + 1000;
      } else if (now >= state.botRematchAt) {
        state.botRematchAt = null;
        let current = room;
        for (const bot of pendingBots) {
          const voted = voteRematchStoredRoom(current, { playerId: bot.id, now });
          if (voted.ok) current = voted.room;
        }
        bump(current);
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
  mode: RoomMode = '1v1',
): StoredRoom {
  state.humanId = playerId;
  state.humanPseudo = pseudo;
  const shuffled = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  state.botName = shuffled[0];
  state.botMoveAt = null;
  state.botRematchAt = null;
  state.botEmote = null;
  state.botJoins = [];
  state.script = null;

  let room = createStoredRoom({
    code: generateRoomCode(),
    playerId,
    profileKey: HUMAN_PROFILE_KEY,
    pseudo,
    timeControl,
    mode,
    eloProfile: profileOf(HUMAN_PROFILE_KEY),
    now,
  });

  if (mode === '2v2') {
    // 3 partenaires/adversaires simulés rejoignent le salon 2v2 à tour de rôle
    state.botJoins = [
      { id: `${BOT_ID}-1`, profileKey: `${BOT_PROFILE_KEY}-1`, pseudo: shuffled[0], at: now + 1800 },
      { id: `${BOT_ID}-2`, profileKey: `${BOT_PROFILE_KEY}-2`, pseudo: shuffled[1], at: now + 3200 },
      { id: `${BOT_ID}-3`, profileKey: `${BOT_PROFILE_KEY}-3`, pseudo: shuffled[2], at: now + 4600 },
    ];
  } else if (withBot) {
    const joined = joinStoredRoom(room, {
      playerId: BOT_ID,
      profileKey: BOT_PROFILE_KEY,
      pseudo: state.botName,
      eloProfile: profileOf(BOT_PROFILE_KEY),
      now,
    });
    if (joined.ok) room = joined.room;
  } else {
    state.botJoins = [
      { id: BOT_ID, profileKey: BOT_PROFILE_KEY, pseudo: state.botName, at: now + 3500 },
    ];
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

function buildDemoAuthUser(now: number): AuthUser | null {
  if (!state.account) return null;
  return {
    id: state.account.id,
    username: state.account.username,
    createdAt: state.account.createdAt,
    provider: 'password',
    avatarUrl: null,
    streak: presentAccountStreak(state.account.streak, now),
  };
}

function ensureDemoAccount(username: string, now: number) {
  const clean = username.trim().slice(0, 20) || 'Camille';
  if (!state.account) {
    state.account = {
      id: 'demo-user-1',
      username: clean,
      createdAt: now - 14 * DAY_MS,
      streak: createInitialDemoStreak(now),
    };
  } else if (clean) {
    state.account.username = clean;
  }
  state.accountToken = DEMO_AUTH_TOKEN;
  state.humanPseudo = state.account.username;
  return state.account;
}

function isAuthedDemoRequest(authHeader: string | null): boolean {
  if (!authHeader || !state.account || !state.accountToken) return false;
  return authHeader === `Bearer ${state.accountToken}`;
}

function statsPayload(now: number, isAuthed: boolean): PlayerStatsPayload {
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
    accountStreak:
      isAuthed && state.account
        ? presentAccountStreak(state.account.streak, now)
        : null,
  };
}

function leaderboardPayload(now: number, isAuthed: boolean): LeaderboardPayload {
  const me = profileOf(HUMAN_PROFILE_KEY);
  const names = [
    'Aurèle', 'Maëlle', 'Tiago', 'Yuna', 'Basile', 'Capucine', 'Ilyès', 'Romy', 'Octave',
    'Salomé', 'Gaspard', 'Louison', 'Nour', 'Côme', 'Apolline', 'Swann', 'Zélie', 'Marius',
  ];
  const sampleStreaks = [14, 9, 6, 0, 11, 4, 2, 0, 7, 3, 0, 5, 2, 0, 8, 3, 0, 2];
  const others = names.map((pseudo, index) => ({
    pseudo,
    rating: 2040 - index * 43,
    rd: 60 + ((index * 13) % 50),
    gamesPlayed: 180 - index * 7,
    wins: 120 - index * 5,
    isSelf: false,
    dailyStreak: sampleStreaks[index % sampleStreaks.length],
  }));
  const selfDailyStreak =
    isAuthed && state.account
      ? presentAccountStreak(state.account.streak, now).current
      : 0;
  const all = [
    ...others,
    {
      pseudo: state.humanPseudo,
      rating: me.rating,
      rd: me.rd,
      gamesPlayed: me.gamesPlayed,
      wins: me.wins,
      isSelf: true,
      dailyStreak: selfDailyStreak,
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
      dailyStreak: entry.dailyStreak,
    })),
    selfRank: null,
    minGames: 3,
  };
}

/* ---------- Routes ---------- */

function route(
  method: string,
  url: URL,
  body: Record<string, unknown>,
  authHeader: string | null,
  now: number,
): DemoResponse {
  const path = url.pathname;
  const isAuthed = isAuthedDemoRequest(authHeader);
  const playerId =
    (typeof body.playerId === 'string' ? body.playerId : null) ??
    url.searchParams.get('playerId') ??
    state.humanId;
  const pseudo =
    (typeof body.pseudo === 'string' ? body.pseudo : null) ??
    url.searchParams.get('pseudo') ??
    state.humanPseudo;

  if (path === '/health') return { ok: true, data: { serverNow: now } };

  // Routes d'authentification démo (permettent de tester le streak réservé aux comptes)
  if (path === '/auth/demo' && method === 'POST') {
    const requested = typeof body.pseudo === 'string' ? body.pseudo : state.humanPseudo;
    ensureDemoAccount(requested || 'Camille', now);
    const profile = profileOf(HUMAN_PROFILE_KEY);
    return {
      ok: true,
      data: {
        token: state.accountToken!,
        user: buildDemoAuthUser(now)!,
        profile,
        tier: getEloTier(profile.rating).label,
      },
    };
  }
  if ((path === '/auth/login' || path === '/auth/register') && method === 'POST') {
    const username =
      typeof body.username === 'string' && body.username.trim().length >= 3
        ? body.username.trim()
        : '';
    if (!username) {
      return { ok: false, error: 'Le pseudo doit contenir au moins 3 caractères.' };
    }
    ensureDemoAccount(username, now);
    const profile = profileOf(HUMAN_PROFILE_KEY);
    return {
      ok: true,
      data: {
        token: state.accountToken!,
        user: buildDemoAuthUser(now)!,
        profile,
        tier: getEloTier(profile.rating).label,
        isNew: path === '/auth/register',
      },
    };
  }
  if (path === '/auth/me' && method === 'GET') {
    if (!isAuthed) {
      // Si le navigateur avait gardé le jeton démo dans localStorage, on restaure le compte démo
      if (authHeader === `Bearer ${DEMO_AUTH_TOKEN}`) {
        ensureDemoAccount(state.humanPseudo || 'Camille', now);
      } else {
        return { ok: true, data: { user: null } };
      }
    }
    const profile = profileOf(HUMAN_PROFILE_KEY);
    return {
      ok: true,
      data: {
        user: buildDemoAuthUser(now),
        profile,
        tier: getEloTier(profile.rating).label,
      },
    };
  }
  if (path === '/auth/username' && method === 'POST') {
    if (!isAuthed || !state.account) {
      return { ok: false, error: 'Connexion requise.' };
    }
    const nextName = typeof body.username === 'string' ? body.username.trim() : '';
    if (nextName.length < 3) {
      return { ok: false, error: 'Le pseudo doit contenir au moins 3 caractères.' };
    }
    state.account.username = nextName;
    state.humanPseudo = nextName;
    return { ok: true, data: { user: buildDemoAuthUser(now) } };
  }
  if (path === '/auth/logout' && method === 'POST') {
    state.accountToken = null;
    return { ok: true };
  }
  if (path === '/streak/activity' && method === 'POST') {
    if (!isAuthed || !state.account) {
      return {
        ok: false,
        error: 'La flamme quotidienne est réservée aux comptes inscrits.',
      };
    }
    const res = recordStreakActivity(state.account.streak, now);
    state.account.streak = res.next;
    return {
      ok: true,
      data: {
        streak: presentAccountStreak(res.next, now),
        incremented: res.incremented,
        started: res.started,
        milestoneReached: res.milestoneReached,
      },
    };
  }

  if (path === '/profile') {
    if (pseudo) state.humanPseudo = pseudo;
    const profile = profileOf(HUMAN_PROFILE_KEY);
    return { ok: true, data: { profile, tier: getEloTier(profile.rating).label } };
  }
  if (path === '/stats') {
    if (pseudo) state.humanPseudo = pseudo;
    return { ok: true, data: statsPayload(now, isAuthed) };
  }
  if (path === '/leaderboard') return { ok: true, data: leaderboardPayload(now, isAuthed) };
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
    startRoom(timeControl, state.humanPseudo, state.humanId, now, true, '1v1');
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
    const mode: RoomMode = body.mode === '2v2' ? '2v2' : '1v1';
    startRoom(timeControl, pseudo, playerId, now, false, mode);
    return snapshotResponse(now);
  }

  const match = path.match(/^\/rooms\/([^/]+)\/([a-z]+)$/);
  if (!match) return { ok: false, error: 'Route inconnue (mode démo).' };
  const [, code, action] = match;
  const room = state.room;
  if (!room || room.code !== code.toUpperCase()) {
    return { ok: false, error: 'Ce salon n’existe plus.' };
  }

  if (action === 'peek') return { ok: true, data: { info: toRoomPeekInfo(room, now) } };

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

  if (action === 'seat') {
    const switched = switchSeatStoredRoom(room, {
      playerId,
      targetSeat: body.targetSeat as TeamSeat,
      now,
    });
    if (!switched.ok) return { ok: false, error: switched.error };
    bump(switched.room);
    return snapshotResponse(now);
  }

  if (action === 'emote') {
    const sent = sendEmoteStoredRoom(room, {
      playerId,
      emote: body.emote as EmoteId,
      now,
    });
    if (!sent.ok) return { ok: false, error: sent.error };
    bump(sent.room);
    // Le bot répond parfois avec un tampon sympa
    const replyMap: Record<EmoteId, EmoteId> = {
      fire: 'clap',
      clap: 'gg',
      oops: 'fire',
      mindblown: 'fire',
      clock: 'oops',
      gg: 'gg',
    };
    scheduleBotEmote(sent.room, replyMap[body.emote as EmoteId] ?? 'clap', now, 900);
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
    const committed = commitElo(moved.room, now);
    const last = committed.gameState.moveHistory[committed.gameState.moveHistory.length - 1];
    if (last?.capturedBoard && committed.phase === 'playing') {
      scheduleBotEmote(committed, Math.random() < 0.5 ? 'clap' : 'mindblown', now, 750);
    }
    bump(committed);
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
    state.botJoins = [];
    state.botEmote = null;
    return { ok: true };
  }

  return { ok: false, error: 'Route inconnue (mode démo).' };
}

export async function demoApiRequest(
  path: string,
  options: RequestInit = {},
): Promise<DemoResponse> {
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
  let authHeader: string | null = null;
  if (options.headers instanceof Headers) {
    authHeader = options.headers.get('Authorization');
  } else if (Array.isArray(options.headers)) {
    const found = options.headers.find(([k]) => k.toLowerCase() === 'authorization');
    authHeader = found ? found[1] : null;
  } else if (options.headers && typeof options.headers === 'object') {
    const rec = options.headers as Record<string, string>;
    authHeader = rec.Authorization ?? rec.authorization ?? null;
  }
  const response = route(method, url, body, authHeader, now);
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
   * Prépare un match en cours entre deux bots et renvoie son code à 6 caractères
   * pour tester le mode spectateur (3e personne qui rejoint via le code).
   */
  prepareSpectatorMatch(): string {
    const now = Date.now();
    const shuffled = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    let room = createStoredRoom({
      code: generateRoomCode(),
      playerId: `${BOT_ID}-x`,
      profileKey: `${BOT_PROFILE_KEY}-x`,
      pseudo: shuffled[0],
      timeControl: 'rapid',
      mode: '1v1',
      eloProfile: profileOf(`${BOT_PROFILE_KEY}-x`),
      now,
    });
    const joined = joinStoredRoom(room, {
      playerId: `${BOT_ID}-o`,
      profileKey: `${BOT_PROFILE_KEY}-o`,
      pseudo: shuffled[1],
      eloProfile: profileOf(`${BOT_PROFILE_KEY}-o`),
      now,
    });
    if (joined.ok) room = joined.room;
    // Démarre déjà 4 coups dans le duel pour un spectacle immédiat
    const opening: Move[] = [
      { boardIndex: 4, cellIndex: 0 },
      { boardIndex: 0, cellIndex: 4 },
      { boardIndex: 4, cellIndex: 8 },
      { boardIndex: 8, cellIndex: 4 },
    ];
    for (const move of opening) {
      const mover = room.players[room.gameState.currentPlayer]!;
      const res = applyMoveToStoredRoom(room, { playerId: mover.id, move, now });
      if (res.ok) room = res.room;
    }
    state.botJoins = [];
    state.botMoveAt = now + 900;
    state.botRematchAt = null;
    state.botEmote = null;
    state.script = null;
    state.version = 1;
    state.room = room;
    return room.code;
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
    const found = findPlayerInRoom(room, state.humanId);
    const humanSym: Player = found?.symbol ?? 'X';
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

    if (options.promotion && result === 'win' && getRoomMode(room) === '1v1') {
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

    const activeMover = getActiveMover(next);
    if (!activeMover) return false;
    state.script = {
      move: generated.lastMove,
      byPlayerId: activeMover.id,
      at: now + 1100,
    };
    state.botMoveAt = null;
    bump(next);
    return true;
  },
};
