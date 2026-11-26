import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getPool } from './db.js';
import {
  parseLoginIdentifier,
  suggestUsernameBase,
  validateEmail,
  validateGuestPseudo,
  validatePassword,
  validateUsername,
} from '../shared/authValidation.js';
import {
  createDefaultEloProfile,
  getEloTier,
  getNextEloTier,
  inflateDeviation,
  isProvisional,
  normalizeEloProfile,
  type EloProfile,
} from '../shared/elo.js';
import { FIREBASE_PUBLIC_CONFIG } from '../shared/firebasePublicConfig.js';
import type { Move, Player } from '../shared/gameEngine.js';
import {
  applyEloOutcomeToRoom,
  applyMoveToStoredRoom,
  confirmReadyStoredRoom,
  createStoredRoom,
  findPlayerInRoom,
  generateRoomCode,
  joinStoredRoom,
  leaveStoredRoom,
  makeProfileKey,
  normalizeRoomCode,
  resignStoredRoom,
  sanitizePseudo,
  sendEmoteStoredRoom,
  settleTimeoutsAndAbandonment,
  switchSeatStoredRoom,
  toRoomPeekInfo,
  toRoomSnapshot,
  touchPlayerPresence,
  voteRematchStoredRoom,
  type StoredRoom,
} from '../shared/onlineRoomLogic.js';
import {
  EMOTE_IDS,
  type AuthProvider,
  type AuthUser,
  type EmoteId,
  type EndReason,
  type LeaderboardEntry,
  type LeaderboardPayload,
  type LobbyStats,
  type MatchHistoryItem,
  type PlayerStatsPayload,
  type RoomMode,
  type TeamSeat,
  type TimeControl,
} from '../shared/protocol.js';
import {
  createEmptyStreakState,
  normalizeStoredStreak,
  presentAccountStreak,
  recordStreakActivity,
  type StoredStreakState,
} from '../shared/streak.js';
import {
  createStoredTournament,
  findTournamentMatch,
  isTournamentSize,
  joinStoredTournament,
  leaveOrKickTournament,
  linkRoomToTournamentMatch,
  resolveTournamentMatchWinner,
  startStoredTournament,
  syncTournamentWithRooms,
  toTournamentSnapshot,
  type StoredTournament,
} from '../shared/tournamentLogic.js';

const QUEUE_STALE_MS = 25_000;
const ROOM_CLEANUP_STALE_MS = 2 * 60 * 60 * 1000;
const TOURNAMENT_CLEANUP_STALE_MS = 12 * 60 * 60 * 1000;
const AUTH_SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000;

let tournamentsTableReady: Promise<void> | null = null;
let authEmailIndexReady: Promise<void> | null = null;

async function ensureAuthEmailIndex(): Promise<void> {
  if (!authEmailIndexReady) {
    authEmailIndexReady = (async () => {
      const pool = getPool();
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT');
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_users_email_lower
          ON users (LOWER(email))
          WHERE email IS NOT NULL AND email <> ''
      `);
    })().catch((err) => {
      authEmailIndexReady = null;
      throw err;
    });
  }
  return authEmailIndexReady;
}

async function ensureTournamentsTable(): Promise<void> {
  if (!tournamentsTableReady) {
    tournamentsTableReady = (async () => {
      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tournaments (
          code TEXT PRIMARY KEY,
          state_json JSONB NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          updated_at BIGINT NOT NULL
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_tournaments_updated_at
          ON tournaments (updated_at DESC)
      `);
    })().catch((err) => {
      tournamentsTableReady = null;
      throw err;
    });
  }
  return tournamentsTableReady;
}

function parseStoredTournament(raw: unknown): StoredTournament {
  if (typeof raw === 'string') {
    return JSON.parse(raw) as StoredTournament;
  }
  return raw as StoredTournament;
}

async function generateUniqueTournamentCode(client: PgClientLike): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const code = generateRoomCode();
    const exists = await client.query('SELECT 1 FROM tournaments WHERE code = $1', [code]);
    if (exists.rows.length === 0) {
      return code;
    }
  }
  throw new Error('Impossible de générer un code de tournoi unique.');
}

async function saveTournamentRow(
  client: PgClientLike,
  tournament: StoredTournament,
  nextVersion: number,
  now: number,
): Promise<void> {
  await client.query(
    `UPDATE tournaments
     SET state_json = $2::jsonb, version = $3, updated_at = $4
     WHERE code = $1`,
    [tournament.code, JSON.stringify(tournament), nextVersion, now],
  );
}

async function syncTournamentRowWithRooms(
  client: PgClientLike,
  tournament: StoredTournament,
  version: number,
  now: number,
): Promise<{ tournament: StoredTournament; version: number; changed: boolean }> {
  if (tournament.phase !== 'running') {
    return { tournament, version, changed: false };
  }
  const liveCodes: string[] = [];
  for (const round of tournament.rounds) {
    for (const m of round.matches) {
      if (m.status === 'live' && m.roomCode) {
        liveCodes.push(m.roomCode);
      }
    }
  }
  if (liveCodes.length === 0) {
    return { tournament, version, changed: false };
  }

  const roomsRes = await client.query(
    'SELECT code, state_json, version FROM rooms WHERE code = ANY($1::text[])',
    [liveCodes],
  );
  const roomsByCode = new Map<string, StoredRoom>();
  for (const row of roomsRes.rows) {
    let room = parseStoredRoom(row.state_json);
    const roomVersion = Number(row.version);
    const settled = settleTimeoutsAndAbandonment(room, now);
    if (settled.changed) {
      room = await commitRoomEloIfEnded(client, settled.room, now);
      await saveRoomRow(client, room, roomVersion + 1, now);
    }
    roomsByCode.set(String(row.code), room);
  }

  const synced = syncTournamentWithRooms(tournament, roomsByCode, now);
  if (!synced.changed) {
    return { tournament, version, changed: false };
  }
  const nextVersion = version + 1;
  await saveTournamentRow(client, synced.tournament, nextVersion, now);
  return { tournament: synced.tournament, version: nextVersion, changed: true };
}
const LIVE_ROOM_WINDOW_MS = 30_000;
/** Parties classées minimum pour apparaître au classement général. */
const LEADERBOARD_MIN_GAMES = 1;

const FIREBASE_JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
);
let firebaseJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getFirebaseProjectId(): string {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    FIREBASE_PUBLIC_CONFIG.projectId ||
    ''
  ).trim();
}

interface VerifiedFirebaseIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  provider: AuthProvider;
}

function mapFirebaseProvider(raw: string | undefined): AuthProvider {
  switch (raw) {
    case 'google.com':
      return 'google';
    case 'apple.com':
      return 'apple';
    case 'microsoft.com':
      return 'microsoft';
    default:
      return 'email';
  }
}

/** Vérifie un jeton d'identité Firebase (signature Google, émetteur, audience). */
async function verifyFirebaseIdToken(
  idToken: string,
): Promise<VerifiedFirebaseIdentity> {
  const projectId = getFirebaseProjectId();
  if (!projectId) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }
  firebaseJwks ??= createRemoteJWKSet(FIREBASE_JWKS_URL);
  const { payload } = await jwtVerify(idToken, firebaseJwks, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ['RS256'],
  });
  if (!payload.sub) {
    throw new Error('INVALID_TOKEN');
  }
  const firebaseClaim = payload.firebase as
    | { sign_in_provider?: string }
    | undefined;
  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name : null,
    picture: typeof payload.picture === 'string' ? payload.picture : null,
    provider: mapFirebaseProvider(firebaseClaim?.sign_in_provider),
  };
}

async function findAvailableUsername(
  client: Pick<PgClientLike, 'query'>,
  base: string,
): Promise<string> {
  const candidates = [base];
  for (let i = 0; i < 25; i++) {
    const suffix = String(Math.floor(10 + Math.random() * 9990));
    candidates.push(`${base.slice(0, 20 - suffix.length)}${suffix}`);
  }
  for (const candidate of candidates) {
    const res = await client.query(
      'SELECT 1 FROM users WHERE username_lower = $1',
      [candidate.toLowerCase()],
    );
    if (res.rows.length === 0) {
      return candidate;
    }
  }
  return `Joueur${randomBytes(3).toString('hex')}`.slice(0, 20);
}

interface PgClientLike {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  release: () => void;
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

function isTimeControl(value: unknown): value is TimeControl {
  return value === 'unlimited' || value === 'rapid' || value === 'blitz';
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): boolean {
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Nom affiché en partie : mêmes caractères qu'un pseudo, sans unicité. Vide = aucun. */
function validateGameName(
  raw: string,
): { ok: true; gameName: string | null } | { ok: false; error: string } {
  const cleaned = String(raw).replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return { ok: true, gameName: null };
  if (cleaned.length < 2) {
    return { ok: false, error: 'Le nom en partie doit contenir au moins 2 caractères.' };
  }
  if (cleaned.length > 20) {
    return { ok: false, error: 'Le nom en partie est limité à 20 caractères.' };
  }
  if (!/^[\p{L}\p{N}_ -]{2,20}$/u.test(cleaned)) {
    return {
      ok: false,
      error: 'Utilisez uniquement des lettres, chiffres, espaces, tirets ou _.',
    };
  }
  return { ok: true, gameName: cleaned };
}

function extractBearerToken(req: Request): string | null {
  const raw = req.headers.get('authorization');
  if (!raw) return null;
  const match = raw.match(/^Bearer\s+([A-Za-z0-9._-]+)$/i);
  return match ? match[1] : null;
}

function rowToStoredStreak(row: Record<string, unknown> | undefined): StoredStreakState {
  if (!row) return createEmptyStreakState();
  return normalizeStoredStreak({
    current: numOrUndefined(row.streak_current),
    best: numOrUndefined(row.streak_best),
    lastActiveDate:
      typeof row.streak_last_date === 'string' ? row.streak_last_date : null,
    totalActiveDays: numOrUndefined(row.streak_total_days),
    recentDates: Array.isArray(row.streak_recent_dates)
      ? (row.streak_recent_dates as string[])
      : [],
  });
}

async function recordUserStreakActivity(
  client: Pick<PgClientLike, 'query'>,
  userId: string,
  now: number,
) {
  const res = await client.query(
    `SELECT streak_current, streak_best, streak_last_date,
            streak_total_days, streak_recent_dates
     FROM users
     WHERE id = $1
     FOR UPDATE`,
    [userId],
  );
  if (res.rows.length === 0) return null;
  const prev = rowToStoredStreak(res.rows[0]);
  const updated = recordStreakActivity(prev, now);
  if (updated.changed) {
    await client.query(
      `UPDATE users
       SET streak_current = $2,
           streak_best = $3,
           streak_last_date = $4,
           streak_total_days = $5,
           streak_recent_dates = $6
       WHERE id = $1`,
      [
        userId,
        updated.next.current,
        updated.next.best,
        updated.next.lastActiveDate,
        updated.next.totalActiveDays,
        updated.next.recentDates,
      ],
    );
  }
  return {
    streak: presentAccountStreak(updated.next, now),
    incremented: updated.incremented,
    started: updated.started,
    milestoneReached: updated.milestoneReached,
  };
}

async function recordRoomAccountStreaks(
  client: Pick<PgClientLike, 'query'>,
  room: StoredRoom,
  now: number,
): Promise<void> {
  if (room.phase !== 'finished' || room.endReason === 'aborted') return;
  const userIds = new Set<string>();
  const collect = (profileKey: string | undefined) => {
    if (profileKey && profileKey.startsWith('user:')) {
      const id = profileKey.slice('user:'.length);
      if (id) userIds.add(id);
    }
  };
  if (room.mode === '2v2' && room.seats) {
    for (const seat of ['A', 'B', 'C', 'D'] as const) {
      collect(room.seats[seat]?.profileKey);
    }
  } else {
    collect(room.players.X?.profileKey);
    collect(room.players.O?.profileKey);
  }
  for (const userId of userIds) {
    await recordUserStreakActivity(client, userId, now);
  }
}

async function resolveAuthUser(
  req: Request,
  queryable: Pick<PgClientLike, 'query'>,
  now: number,
): Promise<AuthUser | null> {
  const token = extractBearerToken(req);
  if (!token) return null;
  const res = await queryable.query(
    `SELECT u.id, u.username, u.game_name, u.email, u.created_at, u.auth_provider, u.avatar_url,
            u.streak_current, u.streak_best, u.streak_last_date,
            u.streak_total_days, u.streak_recent_dates
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > $2`,
    [token, now],
  );
  if (res.rows.length === 0) return null;
  return rowToAuthUser(res.rows[0], now);
}

function rowToAuthUser(row: Record<string, unknown>, now = Date.now()): AuthUser {
  const provider = String(row.auth_provider ?? 'password');
  return {
    id: String(row.id),
    username: String(row.username),
    gameName: row.game_name ? String(row.game_name) : null,
    email: row.email ? String(row.email) : null,
    createdAt: Number(row.created_at),
    provider: (['password', 'google', 'apple', 'microsoft', 'email'].includes(provider)
      ? provider
      : 'password') as AuthProvider,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    streak: presentAccountStreak(rowToStoredStreak(row), now),
  };
}

async function createAuthSession(
  client: Pick<PgClientLike, 'query'>,
  userId: string,
  now: number,
): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await client.query(
    `INSERT INTO auth_sessions (token, user_id, created_at, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [token, userId, now, now + AUTH_SESSION_TTL_MS],
  );
  return token;
}

/**
 * Transfère la progression d'un invité (classement + historique) vers un
 * compte tout juste créé, pour ne rien perdre en s'inscrivant.
 */
async function mergeGuestProgressIntoNewAccount(
  client: Pick<PgClientLike, 'query'>,
  guestProfileId: string | undefined,
  guestPseudo: string | undefined,
  userKey: string,
  username: string,
  now: number,
): Promise<EloProfile | null> {
  if (!guestProfileId || !guestPseudo) return null;
  const guestKey = makeProfileKey(guestProfileId, guestPseudo);
  if (guestKey === userKey) return null;

  const guestRes = await client.query(
    `SELECT rating, rd, volatility, games_played, wins, draws, losses,
            peak_rating, streak, last_played_at
     FROM elo_profiles WHERE profile_key = $1`,
    [guestKey],
  );
  const guestRow = guestRes.rows[0];
  if (!guestRow || Number(guestRow.games_played) <= 0) return null;

  const existing = await loadEloProfile(client, userKey);
  if (existing.gamesPlayed > 0) return null;

  const guestProfile = rowToEloProfile(guestRow);
  await saveEloProfile(client, userKey, username, guestProfile, now);
  await client.query(
    'UPDATE match_history SET profile_key = $1 WHERE profile_key = $2',
    [userKey, guestKey],
  );
  await client.query('DELETE FROM elo_profiles WHERE profile_key = $1', [guestKey]);
  return guestProfile;
}

/** Profil présenté au client : la déviation tient compte de l'inactivité. */
function presentProfile(profile: EloProfile, now: number): EloProfile {
  return { ...profile, rd: Math.round(inflateDeviation(profile, now)) };
}

async function resolveIdentity(
  req: Request,
  queryable: Pick<PgClientLike, 'query'>,
  guestProfileId: string | undefined,
  guestPseudo: string | undefined,
  fallbackPseudo: string,
  now: number,
): Promise<{ user: AuthUser | null; pseudo: string; profileKey: string }> {
  const user = await resolveAuthUser(req, queryable, now);
  if (user) {
    return {
      user,
      // En partie, le nom personnalisé prime sur le pseudo du compte
      pseudo: user.gameName || user.username,
      profileKey: `user:${user.id}`,
    };
  }
  const cleanPseudo = sanitizePseudo(guestPseudo ?? fallbackPseudo);
  return {
    user: null,
    pseudo: cleanPseudo,
    profileKey: makeProfileKey(guestProfileId, cleanPseudo),
  };
}

/**
 * Résout l'identité du joueur pour une action multijoueur en exigeant
 * un pseudo invité explicite (>= 2 caractères) si l'utilisateur n'est pas connecté.
 */
async function resolveRequiredIdentity(
  req: Request,
  queryable: Pick<PgClientLike, 'query'>,
  guestProfileId: string | undefined,
  guestPseudo: string | undefined,
  now: number,
): Promise<
  | { ok: true; user: AuthUser | null; pseudo: string; profileKey: string }
  | { ok: false; error: string }
> {
  const user = await resolveAuthUser(req, queryable, now);
  if (user) {
    return {
      ok: true,
      user,
      pseudo: user.gameName || user.username,
      profileKey: `user:${user.id}`,
    };
  }
  const valid = validateGuestPseudo(guestPseudo ?? '');
  if (!valid.ok) {
    return { ok: false, error: valid.error };
  }
  return {
    ok: true,
    user: null,
    pseudo: valid.pseudo,
    profileKey: makeProfileKey(guestProfileId, valid.pseudo),
  };
}

function parseStoredRoom(raw: unknown): StoredRoom {
  if (typeof raw === 'string') {
    return JSON.parse(raw) as StoredRoom;
  }
  return raw as StoredRoom;
}

async function readJsonBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

async function withTx<T>(fn: (client: PgClientLike) => Promise<T>): Promise<T> {
  const client = (await getPool().connect()) as unknown as PgClientLike;
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failure
    }
    throw err;
  } finally {
    client.release();
  }
}

function numOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function rowToEloProfile(row: Record<string, unknown> | undefined): EloProfile {
  if (!row) return createDefaultEloProfile();
  return normalizeEloProfile({
    rating: numOrUndefined(row.rating),
    rd: numOrUndefined(row.rd),
    volatility: numOrUndefined(row.volatility),
    gamesPlayed: numOrUndefined(row.games_played),
    wins: numOrUndefined(row.wins),
    draws: numOrUndefined(row.draws),
    losses: numOrUndefined(row.losses),
    peakRating: numOrUndefined(row.peak_rating),
    streak: numOrUndefined(row.streak),
    lastPlayedAt: numOrUndefined(row.last_played_at) ?? null,
  });
}

async function loadEloProfile(
  client: Pick<PgClientLike, 'query'>,
  profileKey: string,
): Promise<EloProfile> {
  const res = await client.query(
    `SELECT rating, rd, volatility, games_played, wins, draws, losses,
            peak_rating, streak, last_played_at
     FROM elo_profiles
     WHERE profile_key = $1`,
    [profileKey],
  );
  return rowToEloProfile(res.rows[0]);
}

async function saveEloProfile(
  client: Pick<PgClientLike, 'query'>,
  profileKey: string,
  pseudo: string,
  profile: EloProfile,
  now: number,
): Promise<void> {
  await client.query(
    `INSERT INTO elo_profiles
       (profile_key, pseudo, rating, rd, volatility, games_played, wins, draws,
        losses, peak_rating, streak, last_played_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (profile_key) DO UPDATE SET
       pseudo = EXCLUDED.pseudo,
       rating = EXCLUDED.rating,
       rd = EXCLUDED.rd,
       volatility = EXCLUDED.volatility,
       games_played = EXCLUDED.games_played,
       wins = EXCLUDED.wins,
       draws = EXCLUDED.draws,
       losses = EXCLUDED.losses,
       peak_rating = EXCLUDED.peak_rating,
       streak = EXCLUDED.streak,
       last_played_at = EXCLUDED.last_played_at,
       updated_at = EXCLUDED.updated_at`,
    [
      profileKey,
      sanitizePseudo(pseudo),
      Math.round(profile.rating),
      profile.rd,
      profile.volatility,
      profile.gamesPlayed,
      profile.wins,
      profile.draws,
      profile.losses,
      Math.round(profile.peakRating),
      profile.streak,
      profile.lastPlayedAt,
      now,
    ],
  );
}

async function recordMatchHistory(
  client: Pick<PgClientLike, 'query'>,
  room: StoredRoom,
  now: number,
): Promise<void> {
  if (!room.players.X || !room.players.O || !room.eloResult) {
    return;
  }
  const endReason: EndReason = room.endReason ?? 'alignment';
  const movesCount = room.gameState.moveHistory.length;

  for (const symbol of ['X', 'O'] as const) {
    const oppSymbol: Player = symbol === 'X' ? 'O' : 'X';
    const player = room.players[symbol]!;
    const opponent = room.players[oppSymbol]!;
    const deltaInfo = room.eloResult[symbol];
    const oppDeltaInfo = room.eloResult[oppSymbol];
    const result: 'win' | 'draw' | 'loss' =
      room.matchWinner === null
        ? 'draw'
        : room.matchWinner === symbol
          ? 'win'
          : 'loss';

    await client.query(
      `INSERT INTO match_history
         (room_code, profile_key, opponent_pseudo, opponent_elo, player_symbol,
          result, end_reason, elo_before, elo_after, elo_delta, moves_count, time_control, played_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        room.code,
        player.profileKey,
        opponent.pseudo,
        oppDeltaInfo.before,
        symbol,
        result,
        endReason,
        deltaInfo.before,
        deltaInfo.after,
        deltaInfo.delta,
        movesCount,
        room.timeControl,
        now,
      ],
    );
  }
}

async function commitRoomEloIfEnded(
  client: PgClientLike,
  room: StoredRoom,
  now: number,
): Promise<StoredRoom> {
  if (room.phase !== 'finished') {
    return room;
  }

  // Enregistre l'activité quotidienne (flamme) pour tout joueur connecté (1v1 ou 2v2)
  await recordRoomAccountStreaks(client, room, now);

  if (
    room.eloResult !== null ||
    !room.players.X ||
    !room.players.O
  ) {
    return room;
  }

  const profX = await loadEloProfile(client, room.players.X.profileKey);
  const profO = await loadEloProfile(client, room.players.O.profileKey);
  const updated = applyEloOutcomeToRoom(room, profX, profO, now);

  if (!updated.rated) {
    // Partie annulée ou 2v2 amical : rien n'est enregistré au classement ni à l'historique
    return updated.room;
  }

  await saveEloProfile(
    client,
    updated.room.players.X!.profileKey,
    updated.room.players.X!.pseudo,
    updated.nextProfileX,
    now,
  );
  await saveEloProfile(
    client,
    updated.room.players.O!.profileKey,
    updated.room.players.O!.pseudo,
    updated.nextProfileO,
    now,
  );
  await recordMatchHistory(client, updated.room, now);

  return updated.room;
}

async function generateUniqueRoomCode(client: PgClientLike): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const code = generateRoomCode();
    const exists = await client.query('SELECT 1 FROM rooms WHERE code = $1', [code]);
    if (exists.rows.length === 0) {
      return code;
    }
  }
  throw new Error('Impossible de générer un code de salon unique.');
}

async function saveRoomRow(
  client: PgClientLike,
  room: StoredRoom,
  nextVersion: number,
  now: number,
): Promise<void> {
  await client.query(
    `UPDATE rooms
     SET state_json = $2::jsonb, version = $3, updated_at = $4
     WHERE code = $1`,
    [room.code, JSON.stringify(room), nextVersion, now],
  );
}

function resolveSubPath(url: URL): string {
  const fromPath = url.pathname.replace(/^\/api\/game/, '') || '/';
  if (fromPath !== '/' && fromPath !== '') {
    return fromPath;
  }
  const rewritten = url.searchParams.get('__subpath');
  if (rewritten !== null && rewritten !== '') {
    return rewritten.startsWith('/') ? rewritten : `/${rewritten}`;
  }
  return '/';
}

export async function handleGameRequest(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const subPath = resolveSubPath(url);
    const method = req.method.toUpperCase();
    const now = Date.now();

    // GET /api/game/health
    if (method === 'GET' && subPath === '/health') {
      await getPool().query('SELECT 1');
      return jsonResponse({ ok: true, serverNow: now });
    }

    const poolQuery = getPool() as unknown as Pick<PgClientLike, 'query'>;

    // GET /api/game/lobby — activité en direct (preuve sociale sur l'accueil)
    if (method === 'GET' && subPath === '/lobby') {
      const liveRes = await getPool().query(
        `SELECT COUNT(*)::int AS cnt
         FROM rooms
         WHERE updated_at > $1 AND state_json->>'phase' = 'playing'`,
        [now - LIVE_ROOM_WINDOW_MS],
      );
      const queueRes = await getPool().query(
        `SELECT time_control, COUNT(*)::int AS cnt
         FROM matchmaking_queue
         WHERE matched_code IS NULL AND last_seen_at >= $1
         GROUP BY time_control`,
        [now - QUEUE_STALE_MS],
      );
      const queue: Record<TimeControl, number> = { unlimited: 0, rapid: 0, blitz: 0 };
      for (const row of queueRes.rows as Record<string, unknown>[]) {
        if (isTimeControl(row.time_control)) {
          queue[row.time_control] = Number(row.cnt) || 0;
        }
      }
      const liveGames = Number(liveRes.rows[0]?.cnt ?? 0);
      const payload: LobbyStats = {
        liveGames,
        queue,
        playersOnline: liveGames * 2 + queue.unlimited + queue.rapid + queue.blitz,
      };
      return jsonResponse({ ok: true, data: payload });
    }

    // GET /api/game/leaderboard — classement général des comptes
    if (method === 'GET' && subPath === '/leaderboard') {
      const viewer = await resolveAuthUser(req, poolQuery, now);
      const selfKey = viewer ? `user:${viewer.id}` : null;
      const res = await getPool().query(
        `SELECT e.profile_key, COALESCE(u.username, e.pseudo) AS pseudo,
                e.rating, e.rd, e.volatility, e.games_played, e.wins, e.last_played_at,
                u.streak_current, u.streak_best, u.streak_last_date,
                u.streak_total_days, u.streak_recent_dates
         FROM elo_profiles e
         LEFT JOIN users u ON e.profile_key = 'user:' || u.id
         WHERE e.profile_key LIKE 'user:%' AND e.games_played >= $1
         ORDER BY e.rating DESC, e.games_played DESC
         LIMIT 50`,
        [LEADERBOARD_MIN_GAMES],
      );
      const entries: LeaderboardEntry[] = (res.rows as Record<string, unknown>[]).map(
        (row, index) => {
          const profile = rowToEloProfile(row);
          const rd = inflateDeviation(profile, now);
          const dailyStreak = presentAccountStreak(rowToStoredStreak(row), now).current;
          return {
            rank: index + 1,
            pseudo: String(row.pseudo),
            rating: profile.rating,
            rd: Math.round(rd),
            provisional: isProvisional(rd),
            gamesPlayed: profile.gamesPlayed,
            wins: profile.wins,
            tier: getEloTier(profile.rating).label,
            isSelf: selfKey !== null && row.profile_key === selfKey,
            dailyStreak,
          };
        },
      );

      let selfRank: number | null = null;
      if (selfKey && !entries.some((e) => e.isSelf)) {
        const self = await loadEloProfile(poolQuery, selfKey);
        if (self.gamesPlayed >= LEADERBOARD_MIN_GAMES) {
          const rankRes = await getPool().query(
            `SELECT COUNT(*)::int AS cnt
             FROM elo_profiles
             WHERE profile_key LIKE 'user:%' AND games_played >= $1 AND rating > $2`,
            [LEADERBOARD_MIN_GAMES, self.rating],
          );
          selfRank = Number(rankRes.rows[0]?.cnt ?? 0) + 1;
        }
      }

      const payload: LeaderboardPayload = {
        entries,
        selfRank,
        minGames: LEADERBOARD_MIN_GAMES,
      };
      return jsonResponse({ ok: true, data: payload });
    }

    // POST /api/game/auth/oauth — Google / Apple / Microsoft / lien e-mail via Firebase
    if (method === 'POST' && subPath === '/auth/oauth') {
      await ensureAuthEmailIndex();
      const body = await readJsonBody<{
        idToken?: string;
        guestProfileId?: string;
        guestPseudo?: string;
      }>(req);
      if (!body?.idToken || body.idToken.length > 4096) {
        return jsonResponse({ ok: false, error: 'Jeton de connexion manquant.' }, 400);
      }

      let identity: VerifiedFirebaseIdentity;
      try {
        identity = await verifyFirebaseIdToken(body.idToken);
      } catch (err) {
        const notConfigured =
          err instanceof Error && err.message === 'FIREBASE_NOT_CONFIGURED';
        return jsonResponse(
          {
            ok: false,
            error: notConfigured
              ? 'La connexion externe n’est pas encore activée sur ce site.'
              : 'Connexion refusée : jeton invalide ou expiré. Réessayez.',
          },
          notConfigured ? 503 : 401,
        );
      }

      if (identity.provider === 'email' && !identity.emailVerified) {
        return jsonResponse(
          { ok: false, error: 'Adresse e-mail non vérifiée.' },
          401,
        );
      }

      const providerUid = `firebase:${identity.uid}`;
      const normalizedEmail = identity.email
        ? identity.email.trim().toLowerCase()
        : null;
      const data = await withTx(async (client) => {
        await client.query('DELETE FROM auth_sessions WHERE expires_at < $1', [now]);
        let found = await client.query(
          `SELECT id, username, game_name, email, created_at, auth_provider, avatar_url,
                  streak_current, streak_best, streak_last_date,
                  streak_total_days, streak_recent_dates
           FROM users WHERE provider_uid = $1`,
          [providerUid],
        );

        // Liaison automatique si un compte existe déjà avec la même adresse e-mail vérifiée
        if (found.rows.length === 0 && normalizedEmail && identity.emailVerified) {
          const byEmail = await client.query(
            `SELECT id, username, game_name, email, created_at, auth_provider, avatar_url,
                    streak_current, streak_best, streak_last_date,
                    streak_total_days, streak_recent_dates
             FROM users WHERE LOWER(email) = $1 LIMIT 1`,
            [normalizedEmail],
          );
          if (byEmail.rows.length > 0) {
            const linkedId = String(byEmail.rows[0].id);
            await client.query(
              `UPDATE users
               SET provider_uid = COALESCE(provider_uid, $1),
                   avatar_url = COALESCE($2, avatar_url)
               WHERE id = $3`,
              [providerUid, identity.picture, linkedId],
            );
            found = byEmail;
          }
        }

        if (found.rows.length > 0) {
          const user = rowToAuthUser(found.rows[0], now);
          if (identity.picture && identity.picture !== user.avatarUrl) {
            await client.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [
              identity.picture,
              user.id,
            ]);
            user.avatarUrl = identity.picture;
          }
          if (normalizedEmail && !user.email) {
            await client.query('UPDATE users SET email = $1 WHERE id = $2', [
              normalizedEmail,
              user.id,
            ]);
            user.email = normalizedEmail;
          }
          const token = await createAuthSession(client, user.id, now);
          const profile = await loadEloProfile(client, `user:${user.id}`);
          return { token, user, profile, isNew: false, mergedGuest: false };
        }

        const userId = randomUUID();
        const username = await findAvailableUsername(
          client,
          suggestUsernameBase(identity.name, normalizedEmail),
        );
        await client.query(
          `INSERT INTO users
             (id, username, username_lower, password_hash, salt, created_at,
              auth_provider, provider_uid, email, avatar_url)
           VALUES ($1, $2, $3, NULL, NULL, $4, $5, $6, $7, $8)`,
          [
            userId,
            username,
            username.toLowerCase(),
            now,
            identity.provider,
            providerUid,
            normalizedEmail,
            identity.picture,
          ],
        );
        const userKey = `user:${userId}`;
        const merged = await mergeGuestProgressIntoNewAccount(
          client,
          body.guestProfileId,
          body.guestPseudo,
          userKey,
          username,
          now,
        );
        const profile = merged ?? createDefaultEloProfile();
        if (!merged) {
          await saveEloProfile(client, userKey, username, profile, now);
        }
        const token = await createAuthSession(client, userId, now);
        const user: AuthUser = {
          id: userId,
          username,
          email: normalizedEmail,
          createdAt: now,
          provider: identity.provider,
          avatarUrl: identity.picture,
          streak: presentAccountStreak(createEmptyStreakState(), now),
        };
        return { token, user, profile, isNew: true, mergedGuest: Boolean(merged) };
      });

      return jsonResponse({
        ok: true,
        data: {
          token: data.token,
          user: data.user,
          profile: presentProfile(data.profile, now),
          tier: getEloTier(data.profile.rating).label,
          isNew: data.isNew,
          mergedGuest: data.mergedGuest,
        },
      });
    }

    // POST /api/game/auth/username — changer de pseudo (compte connecté)
    if (method === 'POST' && subPath === '/auth/username') {
      const user = await resolveAuthUser(req, poolQuery, now);
      if (!user) {
        return jsonResponse({ ok: false, error: 'Connexion requise.' }, 401);
      }
      const body = await readJsonBody<{ username?: string }>(req);
      const valid = validateUsername(body?.username ?? '');
      if (!valid.ok) {
        return jsonResponse({ ok: false, error: valid.error }, 400);
      }

      const result = await withTx(async (client) => {
        const taken = await client.query(
          'SELECT id FROM users WHERE username_lower = $1 AND id <> $2',
          [valid.usernameLower, user.id],
        );
        if (taken.rows.length > 0) {
          return { ok: false as const, error: 'Ce pseudo est déjà utilisé.' };
        }
        await client.query(
          'UPDATE users SET username = $1, username_lower = $2 WHERE id = $3',
          [valid.username, valid.usernameLower, user.id],
        );
        await client.query(
          'UPDATE elo_profiles SET pseudo = $1 WHERE profile_key = $2',
          [valid.username, `user:${user.id}`],
        );
        return { ok: true as const };
      });

      if (!result.ok) {
        return jsonResponse({ ok: false, error: result.error }, 409);
      }
      return jsonResponse({
        ok: true,
        data: { user: { ...user, username: valid.username } },
      });
    }

    // POST /api/game/auth/game-name — nom affiché en partie (compte connecté).
    // Une valeur vide rétablit le pseudo du compte.
    if (method === 'POST' && subPath === '/auth/game-name') {
      const user = await resolveAuthUser(req, poolQuery, now);
      if (!user) {
        return jsonResponse({ ok: false, error: 'Connexion requise.' }, 401);
      }
      const body = await readJsonBody<{ gameName?: string | null }>(req);
      const valid = validateGameName(body?.gameName ?? '');
      if (!valid.ok) {
        return jsonResponse({ ok: false, error: valid.error }, 400);
      }
      await poolQuery.query('UPDATE users SET game_name = $1 WHERE id = $2', [
        valid.gameName,
        user.id,
      ]);
      return jsonResponse({
        ok: true,
        data: { user: { ...user, gameName: valid.gameName } },
      });
    }

    // POST /api/game/auth/register — e-mail + mot de passe (pseudo optionnel) ou pseudo + mot de passe
    if (method === 'POST' && subPath === '/auth/register') {
      await ensureAuthEmailIndex();
      const body = await readJsonBody<{
        email?: string;
        username?: string;
        password?: string;
        guestProfileId?: string;
        guestPseudo?: string;
      }>(req);

      const rawEmail = (body?.email ?? '').trim();
      const rawUsername = (body?.username ?? '').trim();

      let normalizedEmail: string | null = null;
      if (rawEmail.length > 0) {
        const validEmail = validateEmail(rawEmail);
        if (!validEmail.ok) {
          return jsonResponse({ ok: false, error: validEmail.error }, 400);
        }
        normalizedEmail = validEmail.email;
      }

      let explicitUser: { username: string; usernameLower: string } | null = null;
      if (rawUsername.length > 0 || !normalizedEmail) {
        const validUser = validateUsername(rawUsername);
        if (!validUser.ok) {
          return jsonResponse({ ok: false, error: validUser.error }, 400);
        }
        explicitUser = {
          username: validUser.username,
          usernameLower: validUser.usernameLower,
        };
      }

      const validPassword = validatePassword(body?.password ?? '');
      if (!validPassword.ok) {
        return jsonResponse({ ok: false, error: validPassword.error }, 400);
      }

      const result = await withTx(async (client) => {
        if (normalizedEmail) {
          const emailExists = await client.query(
            'SELECT id FROM users WHERE LOWER(email) = $1',
            [normalizedEmail],
          );
          if (emailExists.rows.length > 0) {
            return {
              ok: false as const,
              status: 409,
              error: 'Cette adresse e-mail est déjà utilisée.',
            };
          }
        }

        let finalUsername: string;
        let finalUsernameLower: string;
        if (explicitUser) {
          const exists = await client.query(
            'SELECT id FROM users WHERE username_lower = $1',
            [explicitUser.usernameLower],
          );
          if (exists.rows.length > 0) {
            return {
              ok: false as const,
              status: 409,
              error: 'Ce pseudo est déjà utilisé.',
            };
          }
          finalUsername = explicitUser.username;
          finalUsernameLower = explicitUser.usernameLower;
        } else {
          finalUsername = await findAvailableUsername(
            client,
            suggestUsernameBase(null, normalizedEmail),
          );
          finalUsernameLower = finalUsername.toLowerCase();
        }

        const userId = randomUUID();
        const salt = randomBytes(16).toString('hex');
        const passwordHash = hashPassword(validPassword.password, salt);
        const authProvider: AuthProvider = normalizedEmail ? 'email' : 'password';

        await client.query(
          `INSERT INTO users
             (id, username, username_lower, email, password_hash, salt, created_at, auth_provider)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            userId,
            finalUsername,
            finalUsernameLower,
            normalizedEmail,
            passwordHash,
            salt,
            now,
            authProvider,
          ],
        );
        const token = await createAuthSession(client, userId, now);

        const userKey = `user:${userId}`;
        const merged = await mergeGuestProgressIntoNewAccount(
          client,
          body?.guestProfileId,
          body?.guestPseudo,
          userKey,
          finalUsername,
          now,
        );
        const profile = merged ?? createDefaultEloProfile();
        if (!merged) {
          await saveEloProfile(client, userKey, finalUsername, profile, now);
        }

        const user: AuthUser = {
          id: userId,
          username: finalUsername,
          email: normalizedEmail,
          createdAt: now,
          provider: authProvider,
          avatarUrl: null,
          streak: presentAccountStreak(createEmptyStreakState(), now),
        };

        return {
          ok: true as const,
          token,
          user,
          profile,
          isNew: !explicitUser,
          mergedGuest: Boolean(merged),
          tier: getEloTier(profile.rating).label,
        };
      });

      if (!result.ok) {
        return jsonResponse({ ok: false, error: result.error }, result.status);
      }
      return jsonResponse({
        ok: true,
        data: {
          token: result.token,
          user: result.user,
          profile: presentProfile(result.profile, now),
          tier: result.tier,
          isNew: result.isNew,
          mergedGuest: result.mergedGuest,
        },
      });
    }

    // POST /api/game/auth/login — connexion par e-mail OU par pseudo + mot de passe
    if (method === 'POST' && subPath === '/auth/login') {
      await ensureAuthEmailIndex();
      const body = await readJsonBody<{
        identifier?: string;
        email?: string;
        username?: string;
        password?: string;
      }>(req);
      const parsedId = parseLoginIdentifier(
        body?.identifier ?? body?.email ?? body?.username ?? '',
      );
      const password = body?.password ?? '';
      if (!parsedId || !password) {
        return jsonResponse(
          { ok: false, error: 'Identifiant et mot de passe requis.' },
          400,
        );
      }

      const foundRes =
        parsedId.kind === 'email'
          ? await getPool().query(
              `SELECT id, username, game_name, email, password_hash, salt, created_at,
                      auth_provider, avatar_url,
                      streak_current, streak_best, streak_last_date,
                      streak_total_days, streak_recent_dates
               FROM users
               WHERE LOWER(email) = $1
               LIMIT 1`,
              [parsedId.value],
            )
          : await getPool().query(
              `SELECT id, username, game_name, email, password_hash, salt, created_at,
                      auth_provider, avatar_url,
                      streak_current, streak_best, streak_last_date,
                      streak_total_days, streak_recent_dates
               FROM users
               WHERE username_lower = $1
               LIMIT 1`,
              [parsedId.value],
            );

      if (foundRes.rows.length === 0) {
        return jsonResponse(
          { ok: false, error: 'E-mail, pseudo ou mot de passe incorrect.' },
          401,
        );
      }

      const row = foundRes.rows[0];
      if (!row.password_hash || !row.salt) {
        const providerLabel: Record<string, string> = {
          google: 'Google',
          apple: 'Apple',
          microsoft: 'Microsoft',
          email: 'le lien e-mail',
        };
        const label = providerLabel[String(row.auth_provider)] ?? 'votre fournisseur';
        return jsonResponse(
          {
            ok: false,
            error: `Ce compte se connecte avec ${label}. Utilisez le bouton correspondant.`,
          },
          401,
        );
      }
      const validPwd = verifyPassword(
        password,
        String(row.salt),
        String(row.password_hash),
      );
      if (!validPwd) {
        return jsonResponse(
          { ok: false, error: 'E-mail, pseudo ou mot de passe incorrect.' },
          401,
        );
      }

      const user = rowToAuthUser(row, now);

      const data = await withTx(async (client) => {
        await client.query('DELETE FROM auth_sessions WHERE expires_at < $1', [now]);
        const token = await createAuthSession(client, user.id, now);
        const profile = await loadEloProfile(client, `user:${user.id}`);
        return {
          token,
          user,
          profile: presentProfile(profile, now),
          tier: getEloTier(profile.rating).label,
        };
      });

      return jsonResponse({ ok: true, data });
    }

    // GET /api/game/auth/me
    if (method === 'GET' && subPath === '/auth/me') {
      const user = await resolveAuthUser(req, poolQuery, now);
      if (!user) {
        return jsonResponse({ ok: true, data: { user: null } });
      }
      const profile = await loadEloProfile(poolQuery, `user:${user.id}`);
      return jsonResponse({
        ok: true,
        data: {
          user,
          profile: presentProfile(profile, now),
          tier: getEloTier(profile.rating).label,
        },
      });
    }

    // POST /api/game/auth/logout
    if (method === 'POST' && subPath === '/auth/logout') {
      const token = extractBearerToken(req);
      if (token) {
        await getPool().query('DELETE FROM auth_sessions WHERE token = $1', [token]);
      }
      return jsonResponse({ ok: true });
    }

    // POST /api/game/streak/activity — valide la flamme quotidienne (comptes inscrits uniquement)
    if (method === 'POST' && subPath === '/streak/activity') {
      const user = await resolveAuthUser(req, poolQuery, now);
      if (!user) {
        return jsonResponse(
          { ok: false, error: 'La flamme quotidienne est réservée aux comptes inscrits.' },
          401,
        );
      }
      const data = await withTx(async (client) =>
        recordUserStreakActivity(client, user.id, now),
      );
      if (!data) {
        return jsonResponse({ ok: false, error: 'Compte introuvable.' }, 404);
      }
      return jsonResponse({ ok: true, data });
    }

    // GET /api/game/profile?profileId=...&pseudo=...
    if (method === 'GET' && subPath === '/profile') {
      const profileId = url.searchParams.get('profileId') ?? undefined;
      const pseudo = url.searchParams.get('pseudo') ?? undefined;
      const identity = await resolveIdentity(
        req,
        poolQuery,
        profileId,
        pseudo,
        'Joueur 1',
        now,
      );
      const profile = await loadEloProfile(poolQuery, identity.profileKey);
      return jsonResponse({
        ok: true,
        data: {
          profile: presentProfile(profile, now),
          tier: getEloTier(profile.rating).label,
        },
      });
    }

    // GET /api/game/stats?profileId=...&pseudo=...
    if (method === 'GET' && subPath === '/stats') {
      const profileId = url.searchParams.get('profileId') ?? undefined;
      const pseudo = url.searchParams.get('pseudo') ?? undefined;
      const identity = await resolveIdentity(
        req,
        poolQuery,
        profileId,
        pseudo,
        'Joueur 1',
        now,
      );
      const profile = await loadEloProfile(poolQuery, identity.profileKey);
      const histRes = await getPool().query(
        `SELECT id, room_code, opponent_pseudo, opponent_elo, player_symbol,
                result, end_reason, elo_before, elo_after, elo_delta, moves_count,
                time_control, played_at
         FROM match_history
         WHERE profile_key = $1
         ORDER BY played_at DESC, id DESC
         LIMIT 30`,
        [identity.profileKey],
      );

      const matches: MatchHistoryItem[] = (
        histRes.rows as Record<string, unknown>[]
      ).map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        roomCode: String(r.room_code),
        opponentPseudo: String(r.opponent_pseudo),
        opponentElo: Number(r.opponent_elo),
        playerSymbol: r.player_symbol === 'O' ? 'O' : 'X',
        result:
          r.result === 'win'
            ? 'win'
            : r.result === 'loss'
              ? 'loss'
              : 'draw',
        endReason: String(r.end_reason) as EndReason,
        eloBefore: Number(r.elo_before),
        eloAfter: Number(r.elo_after),
        eloDelta: Number(r.elo_delta),
        movesCount: Number(r.moves_count),
        timeControl: isTimeControl(r.time_control) ? r.time_control : 'unlimited',
        playedAt: Number(r.played_at),
      }));

      const chronological = [...matches].reverse();
      const eloHistory =
        chronological.length > 0
          ? [
              {
                rating: chronological[0].eloBefore,
                playedAt: chronological[0].playedAt,
              },
              ...chronological.map((m) => ({
                rating: m.eloAfter,
                playedAt: m.playedAt,
              })),
            ]
          : [{ rating: profile.rating, playedAt: now }];

      const rankedRes = await getPool().query(
        `SELECT COUNT(*) FILTER (WHERE rating < $1)::int AS below,
                COUNT(*)::int AS total
         FROM elo_profiles
         WHERE games_played >= $2`,
        [profile.rating, LEADERBOARD_MIN_GAMES],
      );
      const below = Number(rankedRes.rows[0]?.below ?? 0);
      const rankedPlayers = Number(rankedRes.rows[0]?.total ?? 0);
      const percentile =
        profile.gamesPlayed >= LEADERBOARD_MIN_GAMES && rankedPlayers > 1
          ? Math.round((below / (rankedPlayers - 1)) * 100)
          : null;

      const shown = presentProfile(profile, now);
      const nextTierObj = getNextEloTier(profile.rating);
      const payload: PlayerStatsPayload = {
        profile: shown,
        tier: getEloTier(profile.rating).label,
        nextTier: nextTierObj
          ? { label: nextTierObj.label, min: nextTierObj.min }
          : null,
        winRate:
          profile.gamesPlayed > 0
            ? Math.round((profile.wins / profile.gamesPlayed) * 100)
            : 0,
        matches,
        eloHistory,
        provisional: isProvisional(shown.rd),
        percentile,
        rankedPlayers,
        accountStreak: identity.user?.streak ?? null,
      };

      return jsonResponse({ ok: true, data: payload });
    }

    // POST /api/game/rooms
    if (method === 'POST' && subPath === '/rooms') {
      const body = await readJsonBody<{
        playerId?: string;
        profileId?: string;
        pseudo?: string;
        timeControl?: unknown;
        mode?: unknown;
      }>(req);

      if (!body?.playerId || !isTimeControl(body.timeControl)) {
        return jsonResponse({ ok: false, error: 'Paramètres de salon invalides.' }, 400);
      }

      const timeControl = body.timeControl;
      const mode: RoomMode = body.mode === '2v2' ? '2v2' : '1v1';
      const identityRes = await resolveRequiredIdentity(
        req,
        poolQuery,
        body.profileId ?? body.playerId,
        body.pseudo,
        now,
      );
      if (!identityRes.ok) {
        return jsonResponse({ ok: false, error: identityRes.error }, 400);
      }
      const { pseudo, profileKey } = identityRes;

      const data = await withTx(async (client) => {
        await client.query('DELETE FROM rooms WHERE updated_at < $1', [
          now - ROOM_CLEANUP_STALE_MS,
        ]);
        await client.query('DELETE FROM matchmaking_queue WHERE player_id = $1', [
          body.playerId,
        ]);

        const eloProfile = await loadEloProfile(client, profileKey);
        const code = await generateUniqueRoomCode(client);
        const room = createStoredRoom({
          code,
          playerId: body.playerId!,
          profileKey,
          pseudo,
          timeControl,
          mode,
          eloProfile,
          requireConfirm: true,
          now,
        });

        await client.query(
          `INSERT INTO rooms (code, state_json, version, updated_at)
           VALUES ($1, $2::jsonb, 1, $3)`,
          [code, JSON.stringify(room), now],
        );

        return {
          snapshot: toRoomSnapshot(room, now),
          version: 1,
        };
      });

      return jsonResponse({ ok: true, data });
    }

    // Room routes: /rooms/:code/<action>
    const roomMatch = subPath.match(
      /^\/rooms\/([A-Za-z0-9]+)\/(peek|join|state|move|resign|rematch|leave|seat|emote|ready)$/,
    );
    if (roomMatch) {
      const code = normalizeRoomCode(roomMatch[1]);
      const action = roomMatch[2];

      if (code.length !== 6) {
        return jsonResponse({ ok: false, error: 'Code de salon invalide.' }, 400);
      }

      // GET /api/game/rooms/:code/peek
      if (method === 'GET' && action === 'peek') {
        const res = await getPool().query(
          'SELECT state_json FROM rooms WHERE code = $1',
          [code],
        );
        if (res.rows.length === 0) {
          return jsonResponse({ ok: false, error: 'Salon introuvable ou expiré.' }, 404);
        }
        const room = parseStoredRoom(res.rows[0].state_json);
        return jsonResponse({ ok: true, data: { info: toRoomPeekInfo(room, now) } });
      }

      // GET /api/game/rooms/:code/state?playerId=...&version=...
      if (method === 'GET' && action === 'state') {
        const playerId = url.searchParams.get('playerId') ?? '';
        const clientVersion = Number(url.searchParams.get('version') ?? '0');

        const quick = await getPool().query(
          'SELECT state_json, version FROM rooms WHERE code = $1',
          [code],
        );
        if (quick.rows.length === 0) {
          return jsonResponse({ ok: false, error: 'Ce salon n’existe plus.' }, 404);
        }

        const quickRoom = parseStoredRoom(quick.rows[0].state_json);
        const quickVersion = Number(quick.rows[0].version);
        const settledCheck = settleTimeoutsAndAbandonment(quickRoom, now);
        const presenceCheck = playerId
          ? touchPlayerPresence(settledCheck.room, playerId, now)
          : { room: settledCheck.room, changed: false };

        if (!settledCheck.changed && !presenceCheck.changed) {
          if (clientVersion === quickVersion) {
            return jsonResponse({
              ok: true,
              data: { unchanged: true, serverNow: now },
            });
          }
          return jsonResponse({
            ok: true,
            data: {
              snapshot: toRoomSnapshot(quickRoom, now),
              version: quickVersion,
            },
          });
        }

        // Needs state mutation (timeout/abandonment or presence heartbeat)
        const updated = await withTx(async (client) => {
          const locked = await client.query(
            'SELECT state_json, version FROM rooms WHERE code = $1 FOR UPDATE',
            [code],
          );
          if (locked.rows.length === 0) {
            return null;
          }

          let room = parseStoredRoom(locked.rows[0].state_json);
          let version = Number(locked.rows[0].version);

          const settled = settleTimeoutsAndAbandonment(room, now);
          room = settled.room;

          const touched = playerId
            ? touchPlayerPresence(room, playerId, now)
            : { room, changed: false };
          room = touched.room;

          if (settled.changed) {
            room = await commitRoomEloIfEnded(client, room, now);
          }

          if (settled.changed || touched.changed) {
            // Bump version only for real game state transitions or connection state transitions
            if (settled.changed) {
              version += 1;
            }
            await saveRoomRow(client, room, version, now);
          }

          return {
            snapshot: toRoomSnapshot(room, now),
            version,
            unchanged: !settled.changed && clientVersion === version,
          };
        });

        if (!updated) {
          return jsonResponse({ ok: false, error: 'Ce salon n’existe plus.' }, 404);
        }

        if (updated.unchanged) {
          return jsonResponse({
            ok: true,
            data: { unchanged: true, serverNow: now },
          });
        }

        return jsonResponse({
          ok: true,
          data: { snapshot: updated.snapshot, version: updated.version },
        });
      }

      // POST /api/game/rooms/:code/join
      if (method === 'POST' && action === 'join') {
        const body = await readJsonBody<{
          playerId?: string;
          profileId?: string;
          pseudo?: string;
        }>(req);

        if (!body?.playerId) {
          return jsonResponse({ ok: false, error: 'Identifiant joueur manquant.' }, 400);
        }

        const authUser = await resolveAuthUser(req, poolQuery, now);
        const guestValid = validateGuestPseudo(body.pseudo ?? '');

        const result = await withTx(async (client) => {
          await client.query('DELETE FROM matchmaking_queue WHERE player_id = $1', [
            body.playerId,
          ]);

          const locked = await client.query(
            'SELECT state_json, version FROM rooms WHERE code = $1 FOR UPDATE',
            [code],
          );
          if (locked.rows.length === 0) {
            return { ok: false as const, status: 404, error: 'Ce salon n’existe pas ou a expiré.' };
          }

          const room = parseStoredRoom(locked.rows[0].state_json);
          const version = Number(locked.rows[0].version);
          const alreadyInRoom = findPlayerInRoom(room, body.playerId!);
          const isSpectatorJoin = !alreadyInRoom && toRoomPeekInfo(room, now).isFull;

          let pseudo: string;
          let profileKey: string;
          if (authUser) {
            pseudo = authUser.gameName || authUser.username;
            profileKey = `user:${authUser.id}`;
          } else if (alreadyInRoom) {
            pseudo = alreadyInRoom.player.pseudo;
            profileKey = alreadyInRoom.player.profileKey;
          } else if (guestValid.ok) {
            pseudo = guestValid.pseudo;
            profileKey = makeProfileKey(body.profileId ?? body.playerId, pseudo);
          } else if (isSpectatorJoin) {
            pseudo = 'Spectateur';
            profileKey = makeProfileKey(body.profileId ?? body.playerId, pseudo);
          } else {
            return { ok: false as const, status: 400, error: guestValid.error };
          }

          const eloProfile = await loadEloProfile(client, profileKey);

          const joined = joinStoredRoom(room, {
            playerId: body.playerId!,
            profileKey,
            pseudo,
            eloProfile,
            now,
          });
          if (!joined.ok) {
            return { ok: false as const, status: 409, error: joined.error };
          }

          const nextVersion = version + 1;
          await saveRoomRow(client, joined.room, nextVersion, now);
          return {
            ok: true as const,
            snapshot: toRoomSnapshot(joined.room, now),
            version: nextVersion,
          };
        });

        if (!result.ok) {
          return jsonResponse({ ok: false, error: result.error }, result.status);
        }
        return jsonResponse({
          ok: true,
          data: { snapshot: result.snapshot, version: result.version },
        });
      }

      // POST /api/game/rooms/:code/move
      if (method === 'POST' && action === 'move') {
        const body = await readJsonBody<{ playerId?: string; move?: Move }>(req);
        if (!body?.playerId || !body.move) {
          return jsonResponse({ ok: false, error: 'Coup invalide.' }, 400);
        }

        const result = await withTx(async (client) => {
          const locked = await client.query(
            'SELECT state_json, version FROM rooms WHERE code = $1 FOR UPDATE',
            [code],
          );
          if (locked.rows.length === 0) {
            return { ok: false as const, status: 404, error: 'Salon introuvable.' };
          }

          const room = parseStoredRoom(locked.rows[0].state_json);
          const version = Number(locked.rows[0].version);

          const moved = applyMoveToStoredRoom(room, {
            playerId: body.playerId!,
            move: body.move!,
            now,
          });

          if (!moved.ok) {
            if (moved.settledRoom) {
              const finalRoom = await commitRoomEloIfEnded(client, moved.settledRoom, now);
              const nextVersion = version + 1;
              await saveRoomRow(client, finalRoom, nextVersion, now);
              return {
                ok: false as const,
                status: 409,
                error: moved.error,
                snapshot: toRoomSnapshot(finalRoom, now),
                version: nextVersion,
              };
            }
            return { ok: false as const, status: 400, error: moved.error };
          }

          const finalRoom = await commitRoomEloIfEnded(client, moved.room, now);
          const nextVersion = version + 1;
          await saveRoomRow(client, finalRoom, nextVersion, now);

          return {
            ok: true as const,
            snapshot: toRoomSnapshot(finalRoom, now),
            version: nextVersion,
          };
        });

        if (!result.ok) {
          return jsonResponse(
            {
              ok: false,
              error: result.error,
              data: result.snapshot
                ? { snapshot: result.snapshot, version: result.version }
                : undefined,
            },
            result.status,
          );
        }
        return jsonResponse({
          ok: true,
          data: { snapshot: result.snapshot, version: result.version },
        });
      }

      // POST /api/game/rooms/:code/resign
      if (method === 'POST' && action === 'resign') {
        const body = await readJsonBody<{ playerId?: string }>(req);
        if (!body?.playerId) {
          return jsonResponse({ ok: false, error: 'Identifiant manquant.' }, 400);
        }

        const result = await withTx(async (client) => {
          const locked = await client.query(
            'SELECT state_json, version FROM rooms WHERE code = $1 FOR UPDATE',
            [code],
          );
          if (locked.rows.length === 0) {
            return { ok: false as const, status: 404, error: 'Salon introuvable.' };
          }
          const room = parseStoredRoom(locked.rows[0].state_json);
          const version = Number(locked.rows[0].version);

          const resigned = resignStoredRoom(room, { playerId: body.playerId!, now });
          if (!resigned.ok) {
            return { ok: false as const, status: 400, error: resigned.error };
          }

          const finalRoom = await commitRoomEloIfEnded(client, resigned.room, now);
          const nextVersion = version + 1;
          await saveRoomRow(client, finalRoom, nextVersion, now);

          return {
            ok: true as const,
            snapshot: toRoomSnapshot(finalRoom, now),
            version: nextVersion,
          };
        });

        if (!result.ok) {
          return jsonResponse({ ok: false, error: result.error }, result.status);
        }
        return jsonResponse({
          ok: true,
          data: { snapshot: result.snapshot, version: result.version },
        });
      }

      // POST /api/game/rooms/:code/rematch
      if (method === 'POST' && action === 'rematch') {
        const body = await readJsonBody<{ playerId?: string }>(req);
        if (!body?.playerId) {
          return jsonResponse({ ok: false, error: 'Identifiant manquant.' }, 400);
        }

        const result = await withTx(async (client) => {
          const locked = await client.query(
            'SELECT state_json, version FROM rooms WHERE code = $1 FOR UPDATE',
            [code],
          );
          if (locked.rows.length === 0) {
            return { ok: false as const, status: 404, error: 'Salon introuvable.' };
          }
          const room = parseStoredRoom(locked.rows[0].state_json);
          const version = Number(locked.rows[0].version);

          const voted = voteRematchStoredRoom(room, { playerId: body.playerId!, now });
          if (!voted.ok) {
            return { ok: false as const, status: 400, error: voted.error };
          }

          const nextVersion = version + 1;
          await saveRoomRow(client, voted.room, nextVersion, now);
          return {
            ok: true as const,
            snapshot: toRoomSnapshot(voted.room, now),
            version: nextVersion,
          };
        });

        if (!result.ok) {
          return jsonResponse({ ok: false, error: result.error }, result.status);
        }
        return jsonResponse({
          ok: true,
          data: { snapshot: result.snapshot, version: result.version },
        });
      }

      // POST /api/game/rooms/:code/leave
      if (method === 'POST' && action === 'leave') {
        const body = await readJsonBody<{ playerId?: string }>(req);
        if (!body?.playerId) {
          return jsonResponse({ ok: false, error: 'Identifiant manquant.' }, 400);
        }

        await withTx(async (client) => {
          const locked = await client.query(
            'SELECT state_json, version FROM rooms WHERE code = $1 FOR UPDATE',
            [code],
          );
          if (locked.rows.length === 0) return;

          const room = parseStoredRoom(locked.rows[0].state_json);
          const version = Number(locked.rows[0].version);
          const left = leaveStoredRoom(room, { playerId: body.playerId!, now });

          if (left.deleted) {
            await client.query('DELETE FROM rooms WHERE code = $1', [code]);
            return;
          }

          const finalRoom = await commitRoomEloIfEnded(client, left.room, now);
          await saveRoomRow(client, finalRoom, version + 1, now);
        });

        return jsonResponse({ ok: true });
      }

      // POST /api/game/rooms/:code/seat — changement de place en salle d'attente 2v2
      if (method === 'POST' && action === 'seat') {
        const body = await readJsonBody<{ playerId?: string; targetSeat?: unknown }>(req);
        const targetSeat = body?.targetSeat;
        const validSeat =
          targetSeat === 'A' ||
          targetSeat === 'B' ||
          targetSeat === 'C' ||
          targetSeat === 'D';
        if (!body?.playerId || !validSeat) {
          return jsonResponse({ ok: false, error: 'Place invalide.' }, 400);
        }

        const result = await withTx(async (client) => {
          const locked = await client.query(
            'SELECT state_json, version FROM rooms WHERE code = $1 FOR UPDATE',
            [code],
          );
          if (locked.rows.length === 0) {
            return { ok: false as const, status: 404, error: 'Salon introuvable.' };
          }
          const room = parseStoredRoom(locked.rows[0].state_json);
          const version = Number(locked.rows[0].version);
          const switched = switchSeatStoredRoom(room, {
            playerId: body.playerId!,
            targetSeat: targetSeat as TeamSeat,
            now,
          });
          if (!switched.ok) {
            return { ok: false as const, status: 400, error: switched.error };
          }
          const nextVersion = version + 1;
          await saveRoomRow(client, switched.room, nextVersion, now);
          return {
            ok: true as const,
            snapshot: toRoomSnapshot(switched.room, now),
            version: nextVersion,
          };
        });

        if (!result.ok) {
          return jsonResponse({ ok: false, error: result.error }, result.status);
        }
        return jsonResponse({
          ok: true,
          data: { snapshot: result.snapshot, version: result.version },
        });
      }

      // POST /api/game/rooms/:code/emote — tampons d'encre & emotes en match
      if (method === 'POST' && action === 'emote') {
        const body = await readJsonBody<{ playerId?: string; emote?: unknown }>(req);
        if (
          !body?.playerId ||
          typeof body.emote !== 'string' ||
          !(EMOTE_IDS as readonly string[]).includes(body.emote)
        ) {
          return jsonResponse({ ok: false, error: 'Réaction invalide.' }, 400);
        }

        const result = await withTx(async (client) => {
          const locked = await client.query(
            'SELECT state_json, version FROM rooms WHERE code = $1 FOR UPDATE',
            [code],
          );
          if (locked.rows.length === 0) {
            return { ok: false as const, status: 404, error: 'Salon introuvable.' };
          }
          const room = parseStoredRoom(locked.rows[0].state_json);
          const version = Number(locked.rows[0].version);
          const sent = sendEmoteStoredRoom(room, {
            playerId: body.playerId!,
            emote: body.emote as EmoteId,
            now,
          });
          if (!sent.ok) {
            return { ok: false as const, status: 429, error: sent.error };
          }
          const nextVersion = version + 1;
          await saveRoomRow(client, sent.room, nextVersion, now);
          return {
            ok: true as const,
            snapshot: toRoomSnapshot(sent.room, now),
            version: nextVersion,
          };
        });

        if (!result.ok) {
          return jsonResponse({ ok: false, error: result.error }, result.status);
        }
        return jsonResponse({
          ok: true,
          data: { snapshot: result.snapshot, version: result.version },
        });
      }

      // POST /api/game/rooms/:code/ready — confirmation avant lancement d'un salon privé
      if (method === 'POST' && action === 'ready') {
        const body = await readJsonBody<{ playerId?: string; ready?: unknown }>(req);
        if (!body?.playerId) {
          return jsonResponse({ ok: false, error: 'Identifiant joueur manquant.' }, 400);
        }
        const readyParam = typeof body.ready === 'boolean' ? body.ready : undefined;

        const result = await withTx(async (client) => {
          const locked = await client.query(
            'SELECT state_json, version FROM rooms WHERE code = $1 FOR UPDATE',
            [code],
          );
          if (locked.rows.length === 0) {
            return { ok: false as const, status: 404, error: 'Salon introuvable.' };
          }
          const room = parseStoredRoom(locked.rows[0].state_json);
          const version = Number(locked.rows[0].version);
          const confirmed = confirmReadyStoredRoom(room, {
            playerId: body.playerId!,
            ready: readyParam,
            now,
          });
          if (!confirmed.ok) {
            return { ok: false as const, status: 409, error: confirmed.error };
          }
          const nextVersion = version + 1;
          await saveRoomRow(client, confirmed.room, nextVersion, now);
          return {
            ok: true as const,
            snapshot: toRoomSnapshot(confirmed.room, now),
            version: nextVersion,
          };
        });

        if (!result.ok) {
          return jsonResponse({ ok: false, error: result.error }, result.status);
        }
        return jsonResponse({
          ok: true,
          data: { snapshot: result.snapshot, version: result.version },
        });
      }
    }

    // POST /api/game/matchmaking/join
    if (method === 'POST' && subPath === '/matchmaking/join') {
      const body = await readJsonBody<{
        playerId?: string;
        profileId?: string;
        pseudo?: string;
        timeControl?: unknown;
      }>(req);

      if (!body?.playerId || !isTimeControl(body.timeControl)) {
        return jsonResponse({ ok: false, error: 'Paramètres de matchmaking invalides.' }, 400);
      }

      const timeControl = body.timeControl;
      const identityRes = await resolveRequiredIdentity(
        req,
        poolQuery,
        body.profileId ?? body.playerId,
        body.pseudo,
        now,
      );
      if (!identityRes.ok) {
        return jsonResponse({ ok: false, error: identityRes.error }, 400);
      }
      const { pseudo, profileKey } = identityRes;

      const data = await withTx(async (client) => {
        await client.query(
          'DELETE FROM matchmaking_queue WHERE last_seen_at < $1',
          [now - QUEUE_STALE_MS],
        );
        await client.query('DELETE FROM matchmaking_queue WHERE player_id = $1', [
          body.playerId,
        ]);

        // Appariement par niveau : on privilégie l'adversaire au classement le
        // plus proche, puis le plus ancien dans la file. Personne n'est jamais
        // refusé (petite communauté), et on ne s'apparie pas avec soi-même.
        const selfProfile = await loadEloProfile(client, profileKey);
        const opponentRes = await client.query(
          `SELECT q.player_id, q.profile_key, q.pseudo
           FROM matchmaking_queue q
           LEFT JOIN elo_profiles e ON e.profile_key = q.profile_key
           WHERE q.time_control = $1
             AND q.matched_code IS NULL
             AND q.player_id <> $2
             AND q.profile_key <> $3
             AND q.last_seen_at >= $4
           ORDER BY ABS(COALESCE(e.rating, 300) - $5) ASC, q.joined_at ASC
           LIMIT 1
           FOR UPDATE OF q SKIP LOCKED`,
          [timeControl, body.playerId, profileKey, now - QUEUE_STALE_MS, selfProfile.rating],
        );

        if (opponentRes.rows.length > 0) {
          const opp = opponentRes.rows[0];
          const oppId = String(opp.player_id);
          const oppProfileKey = String(opp.profile_key);
          const oppPseudo = String(opp.pseudo);

          const profX = await loadEloProfile(client, oppProfileKey);
          const profO = await loadEloProfile(client, profileKey);
          const code = await generateUniqueRoomCode(client);

          const room0 = createStoredRoom({
            code,
            playerId: oppId,
            profileKey: oppProfileKey,
            pseudo: oppPseudo,
            timeControl,
            eloProfile: profX,
            now,
          });
          const joined = joinStoredRoom(room0, {
            playerId: body.playerId!,
            profileKey,
            pseudo,
            eloProfile: profO,
            now,
          });
          if (!joined.ok) {
            throw new Error(joined.error);
          }

          await client.query(
            `INSERT INTO rooms (code, state_json, version, updated_at)
             VALUES ($1, $2::jsonb, 1, $3)`,
            [code, JSON.stringify(joined.room), now],
          );
          await client.query(
            `UPDATE matchmaking_queue
             SET matched_code = $1
             WHERE player_id = $2`,
            [code, oppId],
          );

          return {
            matched: true as const,
            code,
            snapshot: toRoomSnapshot(joined.room, now),
            version: 1,
          };
        }

        await client.query(
          `INSERT INTO matchmaking_queue
             (player_id, profile_key, pseudo, time_control, matched_code, joined_at, last_seen_at)
           VALUES ($1, $2, $3, $4, NULL, $5, $5)
           ON CONFLICT (player_id) DO UPDATE SET
             profile_key = EXCLUDED.profile_key,
             pseudo = EXCLUDED.pseudo,
             time_control = EXCLUDED.time_control,
             matched_code = NULL,
             joined_at = EXCLUDED.joined_at,
             last_seen_at = EXCLUDED.last_seen_at`,
          [body.playerId, profileKey, pseudo, timeControl, now],
        );

        const countRes = await client.query(
          `SELECT COUNT(*)::int AS cnt
           FROM matchmaking_queue
           WHERE time_control = $1 AND matched_code IS NULL`,
          [timeControl],
        );

        return {
          matched: false as const,
          queueSize: Number(countRes.rows[0]?.cnt ?? 1),
        };
      });

      return jsonResponse({ ok: true, data });
    }

    // POST /api/game/matchmaking/poll
    if (method === 'POST' && subPath === '/matchmaking/poll') {
      const body = await readJsonBody<{ playerId?: string }>(req);
      if (!body?.playerId) {
        return jsonResponse({ ok: false, error: 'Identifiant manquant.' }, 400);
      }

      const data = await withTx(async (client) => {
        const res = await client.query(
          `SELECT matched_code, time_control
           FROM matchmaking_queue
           WHERE player_id = $1
           FOR UPDATE`,
          [body.playerId],
        );

        if (res.rows.length === 0) {
          return { matched: false as const, queueSize: 0, expired: true };
        }

        const row = res.rows[0];
        const matchedCode = row.matched_code ? String(row.matched_code) : null;
        const timeControl = String(row.time_control);

        if (matchedCode) {
          await client.query('DELETE FROM matchmaking_queue WHERE player_id = $1', [
            body.playerId,
          ]);
          const roomRes = await client.query(
            'SELECT state_json, version FROM rooms WHERE code = $1',
            [matchedCode],
          );
          if (roomRes.rows.length > 0) {
            const room = parseStoredRoom(roomRes.rows[0].state_json);
            const version = Number(roomRes.rows[0].version);
            return {
              matched: true as const,
              code: matchedCode,
              snapshot: toRoomSnapshot(room, now),
              version,
            };
          }
          return { matched: false as const, queueSize: 0, expired: true };
        }

        await client.query(
          'UPDATE matchmaking_queue SET last_seen_at = $1 WHERE player_id = $2',
          [now, body.playerId],
        );

        const countRes = await client.query(
          `SELECT COUNT(*)::int AS cnt
           FROM matchmaking_queue
           WHERE time_control = $1
             AND matched_code IS NULL
             AND last_seen_at >= $2`,
          [timeControl, now - QUEUE_STALE_MS],
        );

        return {
          matched: false as const,
          queueSize: Number(countRes.rows[0]?.cnt ?? 1),
        };
      });

      return jsonResponse({ ok: true, data });
    }

    // POST /api/game/matchmaking/cancel
    if (method === 'POST' && subPath === '/matchmaking/cancel') {
      const body = await readJsonBody<{ playerId?: string }>(req);
      if (body?.playerId) {
        await getPool().query('DELETE FROM matchmaking_queue WHERE player_id = $1', [
          body.playerId,
        ]);
      }
      return jsonResponse({ ok: true });
    }

    // ==================== TOURNOIS ENTRE AMIS (4 / 8 / 16) ====================

    // POST /api/game/tournaments — créer un tournoi
    if (method === 'POST' && subPath === '/tournaments') {
      await ensureTournamentsTable();
      const body = await readJsonBody<{
        playerId?: string;
        profileId?: string;
        pseudo?: string;
        name?: string;
        size?: unknown;
        timeControl?: unknown;
      }>(req);

      if (
        !body?.playerId ||
        !isTournamentSize(body.size) ||
        !isTimeControl(body.timeControl)
      ) {
        return jsonResponse(
          { ok: false, error: 'Paramètres de tournoi invalides.' },
          400,
        );
      }

      const size = body.size;
      const timeControl = body.timeControl;
      const identity = await resolveRequiredIdentity(
        req,
        poolQuery,
        body.profileId ?? body.playerId,
        body.pseudo,
        now,
      );
      if (!identity.ok) {
        return jsonResponse({ ok: false, error: identity.error }, 400);
      }

      const data = await withTx(async (client) => {
        await client.query('DELETE FROM tournaments WHERE updated_at < $1', [
          now - TOURNAMENT_CLEANUP_STALE_MS,
        ]);
        const eloProfile = await loadEloProfile(client, identity.profileKey);
        const code = await generateUniqueTournamentCode(client);
        const tournament = createStoredTournament({
          code,
          name: body.name,
          size,
          timeControl,
          hostPlayerId: body.playerId!,
          hostProfileKey: identity.profileKey,
          hostPseudo: identity.pseudo,
          hostEloProfile: eloProfile,
          now,
        });

        await client.query(
          `INSERT INTO tournaments (code, state_json, version, updated_at)
           VALUES ($1, $2::jsonb, 1, $3)`,
          [code, JSON.stringify(tournament), now],
        );

        return {
          snapshot: toTournamentSnapshot(tournament, now),
          version: 1,
        };
      });

      return jsonResponse({ ok: true, data });
    }

    // Match play / host forfeit: /tournaments/:code/matches/:matchId/(play|advance)
    const tournamentMatchRoute = subPath.match(
      /^\/tournaments\/([A-Za-z0-9]+)\/matches\/([A-Za-z0-9_-]+)\/(play|advance)$/,
    );
    if (method === 'POST' && tournamentMatchRoute) {
      await ensureTournamentsTable();
      const code = normalizeRoomCode(tournamentMatchRoute[1]);
      const matchId = tournamentMatchRoute[2];
      const action = tournamentMatchRoute[3];

      if (code.length !== 6) {
        return jsonResponse({ ok: false, error: 'Code de tournoi invalide.' }, 400);
      }

      if (action === 'play') {
        const body = await readJsonBody<{
          playerId?: string;
          profileId?: string;
          pseudo?: string;
        }>(req);

        if (!body?.playerId) {
          return jsonResponse({ ok: false, error: 'Identifiant joueur manquant.' }, 400);
        }

        const identity = await resolveIdentity(
          req,
          poolQuery,
          body.profileId ?? body.playerId,
          body.pseudo,
          'Joueur',
          now,
        );

        const result = await withTx(async (client) => {
          const locked = await client.query(
            'SELECT state_json, version FROM tournaments WHERE code = $1 FOR UPDATE',
            [code],
          );
          if (locked.rows.length === 0) {
            return { ok: false as const, status: 404, error: 'Tournoi introuvable ou expiré.' };
          }

          let tournament = parseStoredTournament(locked.rows[0].state_json);
          let tVersion = Number(locked.rows[0].version);
          const synced = await syncTournamentRowWithRooms(client, tournament, tVersion, now);
          tournament = synced.tournament;
          tVersion = synced.version;

          if (tournament.phase !== 'running') {
            return { ok: false as const, status: 409, error: 'Ce tournoi n’est pas en cours.' };
          }

          const match = findTournamentMatch(tournament, matchId);
          if (!match || !match.playerA || !match.playerB) {
            return { ok: false as const, status: 404, error: 'Match introuvable ou pas encore prêt.' };
          }
          if (match.status === 'finished' || match.status === 'bye') {
            return { ok: false as const, status: 409, error: 'Ce match est déjà terminé.' };
          }

          const isParticipant =
            match.playerA.id === body.playerId || match.playerB.id === body.playerId;
          if (!isParticipant) {
            return { ok: false as const, status: 403, error: 'Vous ne participez pas à ce match.' };
          }

          const eloProfile = await loadEloProfile(client, identity.profileKey);
          const tournamentMeta = {
            code: tournament.code,
            name: tournament.name,
            matchId: match.id,
            roundKey: match.roundKey,
          };

          // Si un salon existe déjà pour ce match, on le rejoint / reconnecte
          if (match.roomCode) {
            const roomLocked = await client.query(
              'SELECT state_json, version FROM rooms WHERE code = $1 FOR UPDATE',
              [match.roomCode],
            );
            if (roomLocked.rows.length > 0) {
              const room = parseStoredRoom(roomLocked.rows[0].state_json);
              const rVersion = Number(roomLocked.rows[0].version);
              const joined = joinStoredRoom(room, {
                playerId: body.playerId!,
                profileKey: identity.profileKey,
                pseudo: identity.pseudo,
                eloProfile,
                now,
              });
              if (!joined.ok) {
                return { ok: false as const, status: 409, error: joined.error };
              }
              const nextRoomVersion = rVersion + 1;
              await saveRoomRow(client, joined.room, nextRoomVersion, now);
              return {
                ok: true as const,
                roomCode: joined.room.code,
                snapshot: toRoomSnapshot(joined.room, now),
                version: nextRoomVersion,
                tournament: toTournamentSnapshot(tournament, now),
                tournamentVersion: tVersion,
              };
            }
          }

          // Sinon on crée le salon 1v1 dédié à ce match du tableau
          const roomCode = await generateUniqueRoomCode(client);
          const room = createStoredRoom({
            code: roomCode,
            playerId: body.playerId!,
            profileKey: identity.profileKey,
            pseudo: identity.pseudo,
            timeControl: tournament.timeControl,
            mode: '1v1',
            eloProfile,
            tournament: tournamentMeta,
            now,
          });
          await client.query(
            `INSERT INTO rooms (code, state_json, version, updated_at)
             VALUES ($1, $2::jsonb, 1, $3)`,
            [roomCode, JSON.stringify(room), now],
          );

          const updatedTournament = linkRoomToTournamentMatch(
            tournament,
            match.id,
            roomCode,
            now,
          );
          const nextTVersion = tVersion + 1;
          await saveTournamentRow(client, updatedTournament, nextTVersion, now);

          return {
            ok: true as const,
            roomCode,
            snapshot: toRoomSnapshot(room, now),
            version: 1,
            tournament: toTournamentSnapshot(updatedTournament, now),
            tournamentVersion: nextTVersion,
          };
        });

        if (!result.ok) {
          return jsonResponse({ ok: false, error: result.error }, result.status);
        }
        return jsonResponse({
          ok: true,
          data: {
            roomCode: result.roomCode,
            snapshot: result.snapshot,
            version: result.version,
            tournament: result.tournament,
            tournamentVersion: result.tournamentVersion,
          },
        });
      }

      // POST /api/game/tournaments/:code/matches/:matchId/advance (forfait hôte)
      if (action === 'advance') {
        const body = await readJsonBody<{
          playerId?: string;
          winnerId?: string;
        }>(req);

        if (!body?.playerId || !body?.winnerId) {
          return jsonResponse({ ok: false, error: 'Paramètres invalides.' }, 400);
        }

        const result = await withTx(async (client) => {
          const locked = await client.query(
            'SELECT state_json, version FROM tournaments WHERE code = $1 FOR UPDATE',
            [code],
          );
          if (locked.rows.length === 0) {
            return { ok: false as const, status: 404, error: 'Tournoi introuvable ou expiré.' };
          }
          const tournament = parseStoredTournament(locked.rows[0].state_json);
          const tVersion = Number(locked.rows[0].version);
          if (tournament.hostId !== body.playerId) {
            return {
              ok: false as const,
              status: 403,
              error: 'Seul l’organisateur peut déclarer un forfait.',
            };
          }

          const resolved = resolveTournamentMatchWinner(tournament, {
            matchId,
            winnerId: body.winnerId!,
            endReason: 'forfeit',
            now,
          });
          if (!resolved.ok) {
            return { ok: false as const, status: 409, error: resolved.error };
          }
          const nextVersion = resolved.changed ? tVersion + 1 : tVersion;
          if (resolved.changed) {
            await saveTournamentRow(client, resolved.tournament, nextVersion, now);
          }
          return {
            ok: true as const,
            snapshot: toTournamentSnapshot(resolved.tournament, now),
            version: nextVersion,
          };
        });

        if (!result.ok) {
          return jsonResponse({ ok: false, error: result.error }, result.status);
        }
        return jsonResponse({
          ok: true,
          data: { snapshot: result.snapshot, version: result.version },
        });
      }
    }

    // Tournament routes: /tournaments/:code and /tournaments/:code/(join|leave|start)
    const tournamentRoute = subPath.match(
      /^\/tournaments\/([A-Za-z0-9]+)(?:\/(join|leave|start))?$/,
    );
    if (tournamentRoute) {
      await ensureTournamentsTable();
      const code = normalizeRoomCode(tournamentRoute[1]);
      const action = tournamentRoute[2] ?? 'get';

      if (code.length !== 6) {
        return jsonResponse({ ok: false, error: 'Code de tournoi invalide.' }, 400);
      }

      // GET /api/game/tournaments/:code?version=...
      if (method === 'GET' && action === 'get') {
        const clientVersion = Number(url.searchParams.get('version') ?? '0');

        const result = await withTx(async (client) => {
          const locked = await client.query(
            'SELECT state_json, version FROM tournaments WHERE code = $1 FOR UPDATE',
            [code],
          );
          if (locked.rows.length === 0) {
            return null;
          }
          const tournament = parseStoredTournament(locked.rows[0].state_json);
          const version = Number(locked.rows[0].version);
          const synced = await syncTournamentRowWithRooms(client, tournament, version, now);

          if (!synced.changed && clientVersion > 0 && clientVersion === synced.version) {
            return { unchanged: true as const, serverNow: now };
          }
          return {
            unchanged: false as const,
            snapshot: toTournamentSnapshot(synced.tournament, now),
            version: synced.version,
          };
        });

        if (!result) {
          return jsonResponse({ ok: false, error: 'Tournoi introuvable ou expiré.' }, 404);
        }
        return jsonResponse({ ok: true, data: result });
      }

      // POST /api/game/tournaments/:code/join
      if (method === 'POST' && action === 'join') {
        const body = await readJsonBody<{
          playerId?: string;
          profileId?: string;
          pseudo?: string;
        }>(req);

        if (!body?.playerId) {
          return jsonResponse({ ok: false, error: 'Identifiant joueur manquant.' }, 400);
        }

        const identity = await resolveRequiredIdentity(
          req,
          poolQuery,
          body.profileId ?? body.playerId,
          body.pseudo,
          now,
        );
        if (!identity.ok) {
          return jsonResponse({ ok: false, error: identity.error }, 400);
        }

        const result = await withTx(async (client) => {
          const locked = await client.query(
            'SELECT state_json, version FROM tournaments WHERE code = $1 FOR UPDATE',
            [code],
          );
          if (locked.rows.length === 0) {
            return { ok: false as const, status: 404, error: 'Tournoi introuvable ou expiré.' };
          }
          let tournament = parseStoredTournament(locked.rows[0].state_json);
          let version = Number(locked.rows[0].version);
          const synced = await syncTournamentRowWithRooms(client, tournament, version, now);
          tournament = synced.tournament;
          version = synced.version;

          const eloProfile = await loadEloProfile(client, identity.profileKey);
          const joined = joinStoredTournament(tournament, {
            playerId: body.playerId!,
            profileKey: identity.profileKey,
            pseudo: identity.pseudo,
            eloProfile,
            now,
          });
          if (!joined.ok) {
            return { ok: false as const, status: 409, error: joined.error };
          }

          const nextVersion = version + 1;
          await saveTournamentRow(client, joined.tournament, nextVersion, now);
          return {
            ok: true as const,
            snapshot: toTournamentSnapshot(joined.tournament, now),
            version: nextVersion,
          };
        });

        if (!result.ok) {
          return jsonResponse({ ok: false, error: result.error }, result.status);
        }
        return jsonResponse({
          ok: true,
          data: { snapshot: result.snapshot, version: result.version },
        });
      }

      // POST /api/game/tournaments/:code/leave
      if (method === 'POST' && action === 'leave') {
        const body = await readJsonBody<{
          playerId?: string;
          targetPlayerId?: string;
        }>(req);

        if (!body?.playerId) {
          return jsonResponse({ ok: false, error: 'Identifiant joueur manquant.' }, 400);
        }

        const result = await withTx(async (client) => {
          const locked = await client.query(
            'SELECT state_json, version FROM tournaments WHERE code = $1 FOR UPDATE',
            [code],
          );
          if (locked.rows.length === 0) {
            return { ok: true as const, deleted: true as const };
          }
          const tournament = parseStoredTournament(locked.rows[0].state_json);
          const version = Number(locked.rows[0].version);
          const left = leaveOrKickTournament(tournament, {
            actorId: body.playerId!,
            targetPlayerId: body.targetPlayerId,
            now,
          });
          if (!left.ok) {
            return { ok: false as const, status: 409, error: left.error };
          }
          if (left.deleted) {
            await client.query('DELETE FROM tournaments WHERE code = $1', [code]);
            return { ok: true as const, deleted: true as const };
          }
          const nextVersion = version + 1;
          await saveTournamentRow(client, left.tournament, nextVersion, now);
          return {
            ok: true as const,
            deleted: false as const,
            snapshot: toTournamentSnapshot(left.tournament, now),
            version: nextVersion,
          };
        });

        if (!result.ok) {
          return jsonResponse({ ok: false, error: result.error }, result.status);
        }
        return jsonResponse({ ok: true, data: result });
      }

      // POST /api/game/tournaments/:code/start
      if (method === 'POST' && action === 'start') {
        const body = await readJsonBody<{ playerId?: string }>(req);
        if (!body?.playerId) {
          return jsonResponse({ ok: false, error: 'Identifiant joueur manquant.' }, 400);
        }

        const result = await withTx(async (client) => {
          const locked = await client.query(
            'SELECT state_json, version FROM tournaments WHERE code = $1 FOR UPDATE',
            [code],
          );
          if (locked.rows.length === 0) {
            return { ok: false as const, status: 404, error: 'Tournoi introuvable ou expiré.' };
          }
          const tournament = parseStoredTournament(locked.rows[0].state_json);
          const version = Number(locked.rows[0].version);
          const started = startStoredTournament(tournament, {
            actorId: body.playerId!,
            now,
          });
          if (!started.ok) {
            return { ok: false as const, status: 409, error: started.error };
          }
          const nextVersion = version + 1;
          await saveTournamentRow(client, started.tournament, nextVersion, now);
          return {
            ok: true as const,
            snapshot: toTournamentSnapshot(started.tournament, now),
            version: nextVersion,
          };
        });

        if (!result.ok) {
          return jsonResponse({ ok: false, error: result.error }, result.status);
        }
        return jsonResponse({
          ok: true,
          data: { snapshot: result.snapshot, version: result.version },
        });
      }
    }

    return jsonResponse({ ok: false, error: 'Route inconnue.' }, 404);
  } catch (err) {
    console.error('Game API error:', err);
    return jsonResponse(
      { ok: false, error: 'Erreur serveur temporaire.' },
      500,
    );
  }
}
