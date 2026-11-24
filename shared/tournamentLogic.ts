import { getEloTier, type EloProfile } from './elo.js';
import {
  normalizeRoomCode,
  sanitizePseudo,
  type StoredRoom,
} from './onlineRoomLogic.js';
import type {
  EndReason,
  TimeControl,
  TournamentMatch,
  TournamentParticipant,
  TournamentPhase,
  TournamentRound,
  TournamentRoundKey,
  TournamentSize,
  TournamentSnapshot,
} from './protocol.js';

export interface StoredTournament {
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
  lastActivityAt: number;
}

const VALID_SIZES: readonly TournamentSize[] = [4, 8, 16];

/** Ordre standard des têtes de série par taille d'arbre (garantit une répartition équilibrée des byes). */
const SEED_ORDER: Record<TournamentSize, readonly number[]> = {
  4: [0, 3, 1, 2],
  8: [0, 7, 3, 4, 1, 6, 2, 5],
  16: [0, 15, 7, 8, 3, 12, 4, 11, 1, 14, 6, 9, 2, 13, 5, 10],
};

export function isTournamentSize(value: unknown): value is TournamentSize {
  return typeof value === 'number' && (VALID_SIZES as readonly number[]).includes(value);
}

export function sanitizeTournamentName(raw: string | undefined): string {
  const cleaned = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 36);
  return cleaned.length > 0 ? cleaned : 'Tournoi entre amis';
}

export function getTournamentRoundKeys(size: TournamentSize): TournamentRoundKey[] {
  if (size === 4) return ['sf', 'final'];
  if (size === 8) return ['qf', 'sf', 'final'];
  return ['r16', 'qf', 'sf', 'final'];
}

function cloneTournament(t: StoredTournament): StoredTournament {
  return {
    ...t,
    participants: t.participants.map((p) => ({ ...p })),
    rounds: t.rounds.map((r) => ({
      ...r,
      matches: r.matches.map((m) => ({
        ...m,
        playerA: m.playerA ? { ...m.playerA } : null,
        playerB: m.playerB ? { ...m.playerB } : null,
      })),
    })),
  };
}

function buildParticipant(params: {
  playerId: string;
  profileKey: string;
  pseudo: string;
  eloProfile: EloProfile;
  seed: number;
  now: number;
}): TournamentParticipant {
  return {
    id: params.playerId,
    profileKey: params.profileKey,
    pseudo: sanitizePseudo(params.pseudo),
    elo: Math.round(params.eloProfile.rating),
    tier: getEloTier(params.eloProfile.rating).label,
    seed: params.seed,
    joinedAt: params.now,
  };
}

export function createStoredTournament(params: {
  code: string;
  name?: string;
  size: TournamentSize;
  timeControl: TimeControl;
  hostPlayerId: string;
  hostProfileKey: string;
  hostPseudo: string;
  hostEloProfile: EloProfile;
  now: number;
}): StoredTournament {
  const host = buildParticipant({
    playerId: params.hostPlayerId,
    profileKey: params.hostProfileKey,
    pseudo: params.hostPseudo,
    eloProfile: params.hostEloProfile,
    seed: 1,
    now: params.now,
  });

  return {
    code: normalizeRoomCode(params.code),
    name: sanitizeTournamentName(params.name),
    size: params.size,
    timeControl: params.timeControl,
    phase: 'lobby',
    hostId: host.id,
    participants: [host],
    rounds: [],
    championId: null,
    runnerUpId: null,
    createdAt: params.now,
    startedAt: null,
    finishedAt: null,
    lastActivityAt: params.now,
  };
}

export function joinStoredTournament(
  tournament: StoredTournament,
  params: {
    playerId: string;
    profileKey: string;
    pseudo: string;
    eloProfile: EloProfile;
    now: number;
  },
): { ok: true; tournament: StoredTournament; alreadyJoined: boolean } | { ok: false; error: string } {
  const next = cloneTournament(tournament);
  const existingIdx = next.participants.findIndex((p) => p.id === params.playerId);

  if (existingIdx !== -1) {
    // Met à jour le pseudo/Elo tant que le tournoi n'a pas démarré
    if (next.phase === 'lobby') {
      next.participants[existingIdx] = {
        ...next.participants[existingIdx],
        pseudo: sanitizePseudo(params.pseudo),
        elo: Math.round(params.eloProfile.rating),
        tier: getEloTier(params.eloProfile.rating).label,
      };
      next.lastActivityAt = params.now;
    }
    return { ok: true, tournament: next, alreadyJoined: true };
  }

  if (next.phase !== 'lobby') {
    return { ok: false, error: 'Ce tournoi a déjà commencé.' };
  }

  if (next.participants.length >= next.size) {
    return { ok: false, error: 'Ce tournoi est déjà complet.' };
  }

  next.participants.push(
    buildParticipant({
      playerId: params.playerId,
      profileKey: params.profileKey,
      pseudo: params.pseudo,
      eloProfile: params.eloProfile,
      seed: next.participants.length + 1,
      now: params.now,
    }),
  );
  next.lastActivityAt = params.now;
  return { ok: true, tournament: next, alreadyJoined: false };
}

export function leaveOrKickTournament(
  tournament: StoredTournament,
  params: {
    actorId: string;
    targetPlayerId?: string;
    now: number;
  },
):
  | { ok: true; deleted: true }
  | { ok: true; deleted: false; tournament: StoredTournament }
  | { ok: false; error: string } {
  if (tournament.phase !== 'lobby') {
    return { ok: false, error: 'Impossible de quitter un tournoi déjà lancé.' };
  }

  const targetId = params.targetPlayerId ?? params.actorId;
  if (targetId !== params.actorId && params.actorId !== tournament.hostId) {
    return { ok: false, error: 'Seul l’organisateur peut retirer un joueur.' };
  }

  const next = cloneTournament(tournament);
  const filtered = next.participants.filter((p) => p.id !== targetId);
  if (filtered.length === next.participants.length) {
    return { ok: true, deleted: false, tournament: next };
  }

  if (filtered.length === 0) {
    return { ok: true, deleted: true };
  }

  next.participants = filtered.map((p, idx) => ({ ...p, seed: idx + 1 }));
  if (next.hostId === targetId) {
    next.hostId = next.participants[0].id;
  }
  next.lastActivityAt = params.now;
  return { ok: true, deleted: false, tournament: next };
}

function isBranchResolvedEmpty(rounds: TournamentRound[], roundIndex: number, matchIndex: number): boolean {
  if (roundIndex === 0) return false;
  const child = rounds[roundIndex - 1]?.matches[matchIndex];
  return Boolean(child && child.status === 'bye' && child.winnerId === null);
}

/**
 * Propage automatiquement tous les qualifiés d'office (« bye ») et les
 * branches vides de bas en haut jusqu'à stabilité complète de l'arbre.
 */
function settleByesAndReadiness(tournament: StoredTournament, now: number): void {
  const { rounds } = tournament;
  if (rounds.length === 0) return;

  for (let r = 0; r < rounds.length; r++) {
    const round = rounds[r];
    for (let m = 0; m < round.matches.length; m++) {
      const match = round.matches[m];
      if (match.status === 'finished' || match.status === 'live') continue;

      const aIsEmptyBranch =
        match.playerA === null &&
        (r === 0 || isBranchResolvedEmpty(rounds, r, m * 2));
      const bIsEmptyBranch =
        match.playerB === null &&
        (r === 0 || isBranchResolvedEmpty(rounds, r, m * 2 + 1));

      if (match.playerA && match.playerB) {
        match.status = 'ready';
        continue;
      }

      if (match.playerA && bIsEmptyBranch) {
        match.status = 'bye';
        match.winnerId = match.playerA.id;
        match.endReason = 'bye';
        match.finishedAt = now;
        placeWinnerInParent(tournament, r, m, match.playerA, null, now);
        continue;
      }

      if (match.playerB && aIsEmptyBranch) {
        match.status = 'bye';
        match.winnerId = match.playerB.id;
        match.endReason = 'bye';
        match.finishedAt = now;
        placeWinnerInParent(tournament, r, m, match.playerB, null, now);
        continue;
      }

      if (aIsEmptyBranch && bIsEmptyBranch) {
        match.status = 'bye';
        match.winnerId = null;
        match.endReason = 'bye';
        match.finishedAt = now;
        continue;
      }

      match.status = 'pending';
    }
  }
}

function placeWinnerInParent(
  tournament: StoredTournament,
  roundIndex: number,
  matchIndex: number,
  winner: TournamentParticipant,
  loser: TournamentParticipant | null,
  now: number,
): void {
  const lastRoundIndex = tournament.rounds.length - 1;
  if (roundIndex >= lastRoundIndex) {
    tournament.phase = 'finished';
    tournament.championId = winner.id;
    tournament.runnerUpId = loser?.id ?? null;
    tournament.finishedAt = now;
    return;
  }

  const nextRound = tournament.rounds[roundIndex + 1];
  const parentIndex = Math.floor(matchIndex / 2);
  const parent = nextRound.matches[parentIndex];
  if (!parent) return;

  if (matchIndex % 2 === 0) {
    parent.playerA = { ...winner };
  } else {
    parent.playerB = { ...winner };
  }

  if (parent.playerA && parent.playerB && parent.status === 'pending') {
    parent.status = 'ready';
  }
}

export function startStoredTournament(
  tournament: StoredTournament,
  params: {
    actorId: string;
    now: number;
    rng?: () => number;
  },
): { ok: true; tournament: StoredTournament } | { ok: false; error: string } {
  if (tournament.phase !== 'lobby') {
    return { ok: false, error: 'Le tournoi est déjà lancé.' };
  }
  if (params.actorId !== tournament.hostId) {
    return { ok: false, error: 'Seul l’organisateur peut lancer le tournoi.' };
  }
  if (tournament.participants.length < 2) {
    return { ok: false, error: 'Il faut au moins 2 joueurs pour démarrer.' };
  }

  const next = cloneTournament(tournament);
  const rng = params.rng ?? Math.random;

  // Tirage au sort aléatoire des inscrits (Fisher-Yates)
  const shuffled = [...next.participants];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  shuffled.forEach((p, idx) => {
    p.seed = idx + 1;
  });
  next.participants = shuffled;

  const roundKeys = getTournamentRoundKeys(next.size);
  const seedOrder = SEED_ORDER[next.size];
  const rounds: TournamentRound[] = [];

  for (let r = 0; r < roundKeys.length; r++) {
    const matchCount = next.size / Math.pow(2, r + 1);
    const matches: TournamentMatch[] = [];
    for (let m = 0; m < matchCount; m++) {
      let playerA: TournamentParticipant | null = null;
      let playerB: TournamentParticipant | null = null;
      if (r === 0) {
        const seedA = seedOrder[m * 2];
        const seedB = seedOrder[m * 2 + 1];
        playerA = shuffled[seedA] ? { ...shuffled[seedA] } : null;
        playerB = shuffled[seedB] ? { ...shuffled[seedB] } : null;
      }
      matches.push({
        id: `r${r}-m${m}`,
        roundIndex: r,
        matchIndex: m,
        roundKey: roundKeys[r],
        playerA,
        playerB,
        status: 'pending',
        roomCode: null,
        winnerId: null,
        endReason: null,
        needsTiebreak: false,
        finishedAt: null,
      });
    }
    rounds.push({
      roundIndex: r,
      roundKey: roundKeys[r],
      matches,
    });
  }

  next.rounds = rounds;
  next.phase = 'running';
  next.startedAt = params.now;
  next.lastActivityAt = params.now;

  settleByesAndReadiness(next, params.now);

  return { ok: true, tournament: next };
}

export function findTournamentMatch(
  tournament: StoredTournament,
  matchId: string,
): TournamentMatch | null {
  for (const round of tournament.rounds) {
    for (const match of round.matches) {
      if (match.id === matchId) return match;
    }
  }
  return null;
}

export function linkRoomToTournamentMatch(
  tournament: StoredTournament,
  matchId: string,
  roomCode: string,
  now: number,
): StoredTournament {
  const next = cloneTournament(tournament);
  const match = findTournamentMatch(next, matchId);
  if (!match) return next;
  match.roomCode = normalizeRoomCode(roomCode);
  if (match.status === 'ready') {
    match.status = 'live';
  }
  next.lastActivityAt = now;
  return next;
}

export function resolveTournamentMatchWinner(
  tournament: StoredTournament,
  params: {
    matchId: string;
    winnerId: string;
    endReason: EndReason | 'forfeit';
    now: number;
  },
): { ok: true; tournament: StoredTournament; changed: boolean } | { ok: false; error: string } {
  const next = cloneTournament(tournament);
  const match = findTournamentMatch(next, params.matchId);
  if (!match) {
    return { ok: false, error: 'Match introuvable.' };
  }
  if (match.status === 'finished' || match.status === 'bye') {
    return { ok: true, tournament: next, changed: false };
  }
  if (!match.playerA || !match.playerB) {
    return { ok: false, error: 'Ce match n’a pas encore ses deux joueurs.' };
  }

  let winner: TournamentParticipant | null = null;
  let loser: TournamentParticipant | null = null;
  if (match.playerA.id === params.winnerId) {
    winner = match.playerA;
    loser = match.playerB;
  } else if (match.playerB.id === params.winnerId) {
    winner = match.playerB;
    loser = match.playerA;
  } else {
    return { ok: false, error: 'Joueur vainqueur invalide.' };
  }

  match.status = 'finished';
  match.winnerId = winner.id;
  match.endReason = params.endReason;
  match.needsTiebreak = false;
  match.finishedAt = params.now;

  placeWinnerInParent(next, match.roundIndex, match.matchIndex, winner, loser, params.now);
  settleByesAndReadiness(next, params.now);
  next.lastActivityAt = params.now;

  return { ok: true, tournament: next, changed: true };
}

/**
 * Synchronise les matchs en cours d'un tournoi avec l'état des salons 1v1 associés.
 * Dès qu'un salon se termine sur une victoire, le vainqueur avance automatiquement
 * vers le tour suivant (demi-finale, finale ou sacre du champion).
 */
export function syncTournamentWithRooms(
  tournament: StoredTournament,
  roomsByCode: Map<string, StoredRoom>,
  now: number,
): { tournament: StoredTournament; changed: boolean } {
  if (tournament.phase !== 'running') {
    return { tournament, changed: false };
  }

  let current = tournament;
  let changed = false;

  for (const round of tournament.rounds) {
    for (const match of round.matches) {
      if (match.status !== 'live' || !match.roomCode) continue;
      const room = roomsByCode.get(match.roomCode);
      if (!room) continue;

      if (room.phase === 'finished' && room.matchWinner !== null) {
        const winnerPlayer = room.players[room.matchWinner];
        if (winnerPlayer) {
          const res = resolveTournamentMatchWinner(current, {
            matchId: match.id,
            winnerId: winnerPlayer.id,
            endReason: room.endReason ?? 'alignment',
            now,
          });
          if (res.ok && res.changed) {
            current = res.tournament;
            changed = true;
          }
        }
      } else if (room.phase === 'finished' && room.endReason === 'draw') {
        if (!match.needsTiebreak) {
          const copy = cloneTournament(current);
          const target = findTournamentMatch(copy, match.id);
          if (target) {
            target.needsTiebreak = true;
            copy.lastActivityAt = now;
            current = copy;
            changed = true;
          }
        }
      } else if (room.phase === 'playing' && match.needsTiebreak) {
        const copy = cloneTournament(current);
        const target = findTournamentMatch(copy, match.id);
        if (target) {
          target.needsTiebreak = false;
          copy.lastActivityAt = now;
          current = copy;
          changed = true;
        }
      }
    }
  }

  return { tournament: current, changed };
}

export function toTournamentSnapshot(
  tournament: StoredTournament,
  now: number,
): TournamentSnapshot {
  return {
    code: tournament.code,
    name: tournament.name,
    size: tournament.size,
    timeControl: tournament.timeControl,
    phase: tournament.phase,
    hostId: tournament.hostId,
    participants: tournament.participants.map((p) => ({ ...p })),
    rounds: tournament.rounds.map((r) => ({
      roundIndex: r.roundIndex,
      roundKey: r.roundKey,
      matches: r.matches.map((m) => ({
        ...m,
        playerA: m.playerA ? { ...m.playerA } : null,
        playerB: m.playerB ? { ...m.playerB } : null,
      })),
    })),
    championId: tournament.championId,
    runnerUpId: tournament.runnerUpId,
    createdAt: tournament.createdAt,
    startedAt: tournament.startedAt,
    finishedAt: tournament.finishedAt,
    serverNow: now,
  };
}
