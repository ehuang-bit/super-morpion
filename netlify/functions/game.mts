import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import type { Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import {
  createDefaultEloProfile,
  getEloTier,
  getNextEloTier,
  type EloProfile,
} from '../../shared/elo.js';
import type { Move, Player } from '../../shared/gameEngine.js';
import {
  applyEloOutcomeToRoom,
  applyMoveToStoredRoom,
  createStoredRoom,
  generateRoomCode,
  joinStoredRoom,
  leaveStoredRoom,
  makeProfileKey,
  normalizeRoomCode,
  resignStoredRoom,
  sanitizePseudo,
  settleTimeoutsAndAbandonment,
  toRoomPeekInfo,
  toRoomSnapshot,
  touchPlayerPresence,
  voteRematchStoredRoom,
  type StoredRoom,
} from '../../shared/onlineRoomLogic.js';
import type {
  AuthUser,
  EndReason,
  MatchHistoryItem,
  PlayerStatsPayload,
  TimeControl,
} from '../../shared/protocol.js';

export const config: Config = {
  path: '/api/game/*',
};

const db = getDatabase();

const QUEUE_STALE_MS = 25_000;
const ROOM_CLEANUP_STALE_MS = 2 * 60 * 60 * 1000;
const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

function validateUsername(
  raw: string,
): { ok: true; username: string; usernameLower: string } | { ok: false; error: string } {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 3) {
    return {
      ok: false,
      error: 'Le pseudo doit contenir au moins 3 caractères.',
    };
  }
  if (cleaned.length > 20) {
    return {
      ok: false,
      error: 'Le pseudo est limité à 20 caractères.',
    };
  }
  if (!/^[\p{L}\p{N}_ -]{3,20}$/u.test(cleaned)) {
    return {
      ok: false,
      error: 'Utilisez uniquement des lettres, chiffres, espaces, tirets ou _.',
    };
  }
  return {
    ok: true,
    username: cleaned,
    usernameLower: cleaned.toLowerCase(),
  };
}

function extractBearerToken(req: Request): string | null {
  const raw = req.headers.get('authorization');
  if (!raw) return null;
  const match = raw.match(/^Bearer\s+([A-Za-z0-9._-]+)$/i);
  return match ? match[1] : null;
}

async function resolveAuthUser(
  req: Request,
  queryable: Pick<PgClientLike, 'query'>,
  now: number,
): Promise<AuthUser | null> {
  const token = extractBearerToken(req);
  if (!token) return null;
  const res = await queryable.query(
    `SELECT u.id, u.username, u.created_at
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > $2`,
    [token, now],
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    id: String(row.id),
    username: String(row.username),
    createdAt: Number(row.created_at),
  };
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
      pseudo: user.username,
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
  const client = (await db.pool.connect()) as unknown as PgClientLike;
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

function rowToEloProfile(row: Record<string, unknown> | undefined): EloProfile {
  if (!row) return createDefaultEloProfile();
  return {
    rating: Number(row.rating) || 1200,
    gamesPlayed: Number(row.games_played) || 0,
    wins: Number(row.wins) || 0,
    draws: Number(row.draws) || 0,
    losses: Number(row.losses) || 0,
    peakRating: Number(row.peak_rating) || Number(row.rating) || 1200,
    streak: Number(row.streak) || 0,
  };
}

async function loadEloProfile(
  client: Pick<PgClientLike, 'query'>,
  profileKey: string,
): Promise<EloProfile> {
  const res = await client.query(
    `SELECT rating, games_played, wins, draws, losses, peak_rating, streak
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
       (profile_key, pseudo, rating, games_played, wins, draws, losses, peak_rating, streak, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (profile_key) DO UPDATE SET
       pseudo = EXCLUDED.pseudo,
       rating = EXCLUDED.rating,
       games_played = EXCLUDED.games_played,
       wins = EXCLUDED.wins,
       draws = EXCLUDED.draws,
       losses = EXCLUDED.losses,
       peak_rating = EXCLUDED.peak_rating,
       streak = EXCLUDED.streak,
       updated_at = EXCLUDED.updated_at`,
    [
      profileKey,
      sanitizePseudo(pseudo),
      profile.rating,
      profile.gamesPlayed,
      profile.wins,
      profile.draws,
      profile.losses,
      profile.peakRating,
      profile.streak,
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
  if (
    room.phase !== 'finished' ||
    room.eloResult !== null ||
    !room.players.X ||
    !room.players.O
  ) {
    return room;
  }

  const profX = await loadEloProfile(client, room.players.X.profileKey);
  const profO = await loadEloProfile(client, room.players.O.profileKey);
  const updated = applyEloOutcomeToRoom(room, profX, profO);

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

export default async (req: Request): Promise<Response> => {
  try {
    const url = new URL(req.url);
    const subPath = url.pathname.replace(/^\/api\/game/, '') || '/';
    const method = req.method.toUpperCase();
    const now = Date.now();

    // GET /api/game/health
    if (method === 'GET' && subPath === '/health') {
      await db.pool.query('SELECT 1');
      return jsonResponse({ ok: true, serverNow: now });
    }

    const poolQuery = db.pool as unknown as Pick<PgClientLike, 'query'>;

    // POST /api/game/auth/register
    if (method === 'POST' && subPath === '/auth/register') {
      const body = await readJsonBody<{ username?: string; password?: string }>(req);
      const validUser = validateUsername(body?.username ?? '');
      if (!validUser.ok) {
        return jsonResponse({ ok: false, error: validUser.error }, 400);
      }
      const password = body?.password ?? '';
      if (password.length < 6) {
        return jsonResponse(
          { ok: false, error: 'Le mot de passe doit contenir au moins 6 caractères.' },
          400,
        );
      }
      if (password.length > 100) {
        return jsonResponse({ ok: false, error: 'Mot de passe trop long.' }, 400);
      }

      const result = await withTx(async (client) => {
        const exists = await client.query(
          'SELECT id FROM users WHERE username_lower = $1',
          [validUser.usernameLower],
        );
        if (exists.rows.length > 0) {
          return {
            ok: false as const,
            status: 409,
            error: 'Ce pseudo est déjà utilisé.',
          };
        }

        const userId = randomUUID();
        const salt = randomBytes(16).toString('hex');
        const passwordHash = hashPassword(password, salt);
        const token = randomBytes(32).toString('hex');
        const expiresAt = now + AUTH_SESSION_TTL_MS;

        await client.query(
          `INSERT INTO users (id, username, username_lower, password_hash, salt, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, validUser.username, validUser.usernameLower, passwordHash, salt, now],
        );
        await client.query(
          `INSERT INTO auth_sessions (token, user_id, created_at, expires_at)
           VALUES ($1, $2, $3, $4)`,
          [token, userId, now, expiresAt],
        );

        const profile = createDefaultEloProfile();
        await saveEloProfile(client, `user:${userId}`, validUser.username, profile, now);

        const user: AuthUser = {
          id: userId,
          username: validUser.username,
          createdAt: now,
        };

        return {
          ok: true as const,
          token,
          user,
          profile,
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
          profile: result.profile,
          tier: result.tier,
        },
      });
    }

    // POST /api/game/auth/login
    if (method === 'POST' && subPath === '/auth/login') {
      const body = await readJsonBody<{ username?: string; password?: string }>(req);
      const cleanName = (body?.username ?? '').replace(/\s+/g, ' ').trim();
      const password = body?.password ?? '';
      if (!cleanName || !password) {
        return jsonResponse(
          { ok: false, error: 'Pseudo et mot de passe requis.' },
          400,
        );
      }

      const foundRes = await db.pool.query(
        `SELECT id, username, password_hash, salt, created_at
         FROM users
         WHERE username_lower = $1`,
        [cleanName.toLowerCase()],
      );
      if (foundRes.rows.length === 0) {
        return jsonResponse(
          { ok: false, error: 'Pseudo ou mot de passe incorrect.' },
          401,
        );
      }

      const row = foundRes.rows[0];
      const validPwd = verifyPassword(
        password,
        String(row.salt),
        String(row.password_hash),
      );
      if (!validPwd) {
        return jsonResponse(
          { ok: false, error: 'Pseudo ou mot de passe incorrect.' },
          401,
        );
      }

      const user: AuthUser = {
        id: String(row.id),
        username: String(row.username),
        createdAt: Number(row.created_at),
      };

      const data = await withTx(async (client) => {
        await client.query('DELETE FROM auth_sessions WHERE expires_at < $1', [now]);
        const token = randomBytes(32).toString('hex');
        await client.query(
          `INSERT INTO auth_sessions (token, user_id, created_at, expires_at)
           VALUES ($1, $2, $3, $4)`,
          [token, user.id, now, now + AUTH_SESSION_TTL_MS],
        );
        const profile = await loadEloProfile(client, `user:${user.id}`);
        return {
          token,
          user,
          profile,
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
          profile,
          tier: getEloTier(profile.rating).label,
        },
      });
    }

    // POST /api/game/auth/logout
    if (method === 'POST' && subPath === '/auth/logout') {
      const token = extractBearerToken(req);
      if (token) {
        await db.pool.query('DELETE FROM auth_sessions WHERE token = $1', [token]);
      }
      return jsonResponse({ ok: true });
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
          profile,
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
      const histRes = await db.pool.query(
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

      const nextTierObj = getNextEloTier(profile.rating);
      const payload: PlayerStatsPayload = {
        profile,
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
      }>(req);

      if (!body?.playerId || !isTimeControl(body.timeControl)) {
        return jsonResponse({ ok: false, error: 'Paramètres de salon invalides.' }, 400);
      }

      const timeControl = body.timeControl;
      const identity = await resolveIdentity(
        req,
        poolQuery,
        body.profileId ?? body.playerId,
        body.pseudo,
        'Joueur 1',
        now,
      );
      const { pseudo, profileKey } = identity;

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
          eloProfile,
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
    const roomMatch = subPath.match(/^\/rooms\/([A-Za-z0-9]+)\/(peek|join|state|move|resign|rematch|leave)$/);
    if (roomMatch) {
      const code = normalizeRoomCode(roomMatch[1]);
      const action = roomMatch[2];

      if (code.length !== 6) {
        return jsonResponse({ ok: false, error: 'Code de salon invalide.' }, 400);
      }

      // GET /api/game/rooms/:code/peek
      if (method === 'GET' && action === 'peek') {
        const res = await db.pool.query(
          'SELECT state_json FROM rooms WHERE code = $1',
          [code],
        );
        if (res.rows.length === 0) {
          return jsonResponse({ ok: false, error: 'Salon introuvable ou expiré.' }, 404);
        }
        const room = parseStoredRoom(res.rows[0].state_json);
        return jsonResponse({ ok: true, data: { info: toRoomPeekInfo(room) } });
      }

      // GET /api/game/rooms/:code/state?playerId=...&version=...
      if (method === 'GET' && action === 'state') {
        const playerId = url.searchParams.get('playerId') ?? '';
        const clientVersion = Number(url.searchParams.get('version') ?? '0');

        const quick = await db.pool.query(
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

        const identity = await resolveIdentity(
          req,
          poolQuery,
          body.profileId ?? body.playerId,
          body.pseudo,
          'Joueur',
          now,
        );
        const { pseudo, profileKey } = identity;

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
      const identity = await resolveIdentity(
        req,
        poolQuery,
        body.profileId ?? body.playerId,
        body.pseudo,
        'Joueur',
        now,
      );
      const { pseudo, profileKey } = identity;

      const data = await withTx(async (client) => {
        await client.query(
          'DELETE FROM matchmaking_queue WHERE last_seen_at < $1',
          [now - QUEUE_STALE_MS],
        );
        await client.query('DELETE FROM matchmaking_queue WHERE player_id = $1', [
          body.playerId,
        ]);

        const opponentRes = await client.query(
          `SELECT player_id, profile_key, pseudo
           FROM matchmaking_queue
           WHERE time_control = $1
             AND matched_code IS NULL
             AND player_id <> $2
           ORDER BY joined_at ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED`,
          [timeControl, body.playerId],
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
        await db.pool.query('DELETE FROM matchmaking_queue WHERE player_id = $1', [
          body.playerId,
        ]);
      }
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, error: 'Route inconnue.' }, 404);
  } catch (err) {
    console.error('Game API error:', err);
    return jsonResponse(
      { ok: false, error: 'Erreur serveur temporaire.' },
      500,
    );
  }
};
