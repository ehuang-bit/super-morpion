import { describe, expect, it } from 'vitest';
import { createDefaultEloProfile } from './elo.js';
import { createStoredRoom, joinStoredRoom, resignStoredRoom } from './onlineRoomLogic.js';
import {
  createStoredTournament,
  getTournamentRoundKeys,
  joinStoredTournament,
  leaveOrKickTournament,
  linkRoomToTournamentMatch,
  resolveTournamentMatchWinner,
  startStoredTournament,
  syncTournamentWithRooms,
} from './tournamentLogic.js';

function makeTournamentWithPlayers(size: 4 | 8 | 16, playerCount: number) {
  const now = 1_700_000_000_000;
  let t = createStoredTournament({
    code: 'TRN123',
    name: 'Coupe Amphi',
    size,
    timeControl: 'rapid',
    hostPlayerId: 'p1',
    hostProfileKey: 'p1:alice',
    hostPseudo: 'Alice',
    hostEloProfile: createDefaultEloProfile(),
    now,
  });
  for (let i = 2; i <= playerCount; i++) {
    const joined = joinStoredTournament(t, {
      playerId: `p${i}`,
      profileKey: `p${i}:joueur${i}`,
      pseudo: `Joueur ${i}`,
      eloProfile: createDefaultEloProfile(),
      now: now + i * 100,
    });
    expect(joined.ok).toBe(true);
    if (joined.ok) t = joined.tournament;
  }
  return t;
}

describe('tournamentLogic — arbres 4 / 8 / 16 joueurs', () => {
  it('génère les phases exactes (4 → Demis/Finale, 8 → Quarts/Demis/Finale, 16 → Huitièmes/Quarts/Demis/Finale)', () => {
    expect(getTournamentRoundKeys(4)).toEqual(['sf', 'final']);
    expect(getTournamentRoundKeys(8)).toEqual(['qf', 'sf', 'final']);
    expect(getTournamentRoundKeys(16)).toEqual(['r16', 'qf', 'sf', 'final']);
  });

  it('déroule un tournoi complet de 8 joueurs (Quarts → Demis → Finale → Champion)', () => {
    const t0 = makeTournamentWithPlayers(8, 8);
    const started = startStoredTournament(t0, { actorId: 'p1', now: 2000, rng: () => 0.42 });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    let t = started.tournament;
    expect(t.phase).toBe('running');
    expect(t.rounds).toHaveLength(3);
    expect(t.rounds[0].roundKey).toBe('qf');
    expect(t.rounds[0].matches).toHaveLength(4);
    expect(t.rounds[0].matches.every((m) => m.status === 'ready')).toBe(true);

    // Jouer les 4 quarts de finale
    for (const m of t.rounds[0].matches) {
      const res = resolveTournamentMatchWinner(t, {
        matchId: m.id,
        winnerId: m.playerA!.id,
        endReason: 'alignment',
        now: 3000,
      });
      expect(res.ok).toBe(true);
      if (res.ok) t = res.tournament;
    }

    // Les 2 demi-finales doivent être prêtes
    expect(t.rounds[1].roundKey).toBe('sf');
    expect(t.rounds[1].matches.every((m) => m.status === 'ready')).toBe(true);

    for (const m of t.rounds[1].matches) {
      const res = resolveTournamentMatchWinner(t, {
        matchId: m.id,
        winnerId: m.playerB!.id,
        endReason: 'timeout',
        now: 4000,
      });
      expect(res.ok).toBe(true);
      if (res.ok) t = res.tournament;
    }

    // Finale prête
    const finalMatch = t.rounds[2].matches[0];
    expect(finalMatch.roundKey).toBe('final');
    expect(finalMatch.status).toBe('ready');

    const finalRes = resolveTournamentMatchWinner(t, {
      matchId: finalMatch.id,
      winnerId: finalMatch.playerA!.id,
      endReason: 'alignment',
      now: 5000,
    });
    expect(finalRes.ok).toBe(true);
    if (!finalRes.ok) return;

    expect(finalRes.tournament.phase).toBe('finished');
    expect(finalRes.tournament.championId).toBe(finalMatch.playerA!.id);
    expect(finalRes.tournament.runnerUpId).toBe(finalMatch.playerB!.id);
  });

  it('gère proprement un tournoi de 16 joueurs complet', () => {
    const t0 = makeTournamentWithPlayers(16, 16);
    const started = startStoredTournament(t0, { actorId: 'p1', now: 2000, rng: () => 0.1 });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const t = started.tournament;
    expect(t.rounds.map((r) => r.matches.length)).toEqual([8, 4, 2, 1]);
    expect(t.rounds[0].matches.every((m) => m.status === 'ready')).toBe(true);
  });

  it('gère les qualifiés d’office (byes) si un tournoi de 8 démarre à 6 joueurs', () => {
    const t0 = makeTournamentWithPlayers(8, 6);
    const started = startStoredTournament(t0, { actorId: 'p1', now: 2000, rng: () => 0.5 });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const t = started.tournament;
    const byes = t.rounds[0].matches.filter((m) => m.status === 'bye');
    const ready = t.rounds[0].matches.filter((m) => m.status === 'ready');
    expect(byes).toHaveLength(2);
    expect(ready).toHaveLength(2);
    // Les 2 joueurs qualifiés d'office doivent déjà être placés en demi-finale
    const sfSeated = t.rounds[1].matches.reduce(
      (acc, m) => acc + (m.playerA ? 1 : 0) + (m.playerB ? 1 : 0),
      0,
    );
    expect(sfSeated).toBe(2);
  });

  it('synchronise un match de tournoi avec son salon 1v1 et fait avancer le vainqueur', () => {
    const t0 = makeTournamentWithPlayers(4, 4);
    const started = startStoredTournament(t0, { actorId: 'p1', now: 2000, rng: () => 0.2 });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    let t = started.tournament;
    const sf1 = t.rounds[0].matches[0];
    const pA = sf1.playerA!;
    const pB = sf1.playerB!;

    const room0 = createStoredRoom({
      code: 'MATCH1',
      playerId: pA.id,
      profileKey: pA.profileKey,
      pseudo: pA.pseudo,
      timeControl: 'rapid',
      eloProfile: createDefaultEloProfile(),
      tournament: { code: t.code, name: t.name, matchId: sf1.id, roundKey: sf1.roundKey },
      now: 2500,
    });
    const joinedRoom = joinStoredRoom(room0, {
      playerId: pB.id,
      profileKey: pB.profileKey,
      pseudo: pB.pseudo,
      eloProfile: createDefaultEloProfile(),
      now: 2600,
    });
    expect(joinedRoom.ok).toBe(true);
    if (!joinedRoom.ok) return;

    // Abandon immédiat de B en match de tournoi -> A doit gagner (jamais annulé)
    const resigned = resignStoredRoom(joinedRoom.room, {
      playerId: pB.id,
      now: 2700,
    });
    expect(resigned.ok).toBe(true);
    if (!resigned.ok) return;
    expect(resigned.room.matchWinner).toBe('X');
    expect(resigned.room.endReason).toBe('resign');

    t = linkRoomToTournamentMatch(t, sf1.id, 'MATCH1', 2600);
    const synced = syncTournamentWithRooms(t, new Map([['MATCH1', resigned.room]]), 2800);
    expect(synced.changed).toBe(true);
    expect(synced.tournament.rounds[0].matches[0].status).toBe('finished');
    expect(synced.tournament.rounds[0].matches[0].winnerId).toBe(pA.id);
    expect(synced.tournament.rounds[1].matches[0].playerA?.id).toBe(pA.id);
  });

  it('réattribue l’hôte si l’organisateur quitte le lobby avant le début', () => {
    const t0 = makeTournamentWithPlayers(4, 3);
    const res = leaveOrKickTournament(t0, { actorId: 'p1', now: 3000 });
    expect(res.ok).toBe(true);
    if (res.ok && !res.deleted) {
      expect(res.tournament.participants).toHaveLength(2);
      expect(res.tournament.hostId).toBe('p2');
    }
  });
});
