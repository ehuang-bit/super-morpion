import { describe, expect, it } from 'vitest';
import { createDefaultEloProfile } from './elo.js';
import {
  DISCONNECT_FORFEIT_MS,
  applyEloOutcomeToRoom,
  applyMoveToStoredRoom,
  createStoredRoom,
  joinStoredRoom,
  leaveStoredRoom,
  resignStoredRoom,
  settleTimeoutsAndAbandonment,
  toRoomSnapshot,
  voteRematchStoredRoom,
} from './onlineRoomLogic.js';

describe('onlineRoomLogic', () => {
  it('gère création, jonction, reconnexion et validation autoritaire des coups', () => {
    const t0 = 1_000_000;
    const profX = createDefaultEloProfile();
    const profO = createDefaultEloProfile();

    const room0 = createStoredRoom({
      code: 'abc123',
      playerId: 'p1',
      profileKey: 'prof1:camille',
      pseudo: 'Camille',
      timeControl: 'rapid',
      eloProfile: profX,
      now: t0,
    });
    expect(room0.code).toBe('ABC123');
    expect(room0.phase).toBe('waiting');

    const joined = joinStoredRoom(room0, {
      playerId: 'p2',
      profileKey: 'prof2:theo',
      pseudo: 'Théo',
      eloProfile: profO,
      now: t0 + 500,
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.room.phase).toBe('playing');
    expect(joined.room.turnStartedAt).toBe(t0 + 500);

    // O essaie de jouer hors tour -> rejeté
    const wrongTurn = applyMoveToStoredRoom(joined.room, {
      playerId: 'p2',
      move: { boardIndex: 0, cellIndex: 0 },
      now: t0 + 1000,
    });
    expect(wrongTurn.ok).toBe(false);

    // X joue un coup légal après 4s
    const moved = applyMoveToStoredRoom(joined.room, {
      playerId: 'p1',
      move: { boardIndex: 4, cellIndex: 2 },
      now: t0 + 4500,
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.room.clocks?.X).toBe(176_000);
    expect(moved.room.gameState.activeBoard).toBe(2);

    // Reconnexion de p2
    const reconn = joinStoredRoom(moved.room, {
      playerId: 'p2',
      profileKey: 'prof2:theo',
      pseudo: 'Théo',
      eloProfile: profO,
      now: t0 + 6000,
    });
    expect(reconn.ok).toBe(true);
    if (!reconn.ok) return;
    expect(reconn.reconnected).toBe(true);
    const snap = toRoomSnapshot(reconn.room, t0 + 6000);
    expect(snap.players.O?.connected).toBe(true);
  });

  it('détecte les expirations de pendule et l’abandon par déconnexion', () => {
    const t0 = 2_000_000;
    const room0 = createStoredRoom({
      code: 'XYZ789',
      playerId: 'p1',
      profileKey: 'k1',
      pseudo: 'Jade',
      timeControl: 'blitz',
      eloProfile: createDefaultEloProfile(),
      now: t0,
    });
    const j = joinStoredRoom(room0, {
      playerId: 'p2',
      profileKey: 'k2',
      pseudo: 'Sacha',
      eloProfile: createDefaultEloProfile(),
      now: t0,
    });
    if (!j.ok) throw new Error('join failed');

    // Dépassement des 90s de X -> victoire O par timeout
    const timedOut = settleTimeoutsAndAbandonment(j.room, t0 + 91_000);
    expect(timedOut.changed).toBe(true);
    expect(timedOut.endReason).toBe('timeout');
    expect(timedOut.endedWinner).toBe('O');
    expect(timedOut.room.clocks?.X).toBe(0);

    // Scénario illimité : p2 disparaît >= 60s tandis que p1 reste actif
    const unlim0 = createStoredRoom({
      code: 'UNL111',
      playerId: 'p1',
      profileKey: 'k1',
      pseudo: 'Jade',
      timeControl: 'unlimited',
      eloProfile: createDefaultEloProfile(),
      now: t0,
    });
    const unlim1 = joinStoredRoom(unlim0, {
      playerId: 'p2',
      profileKey: 'k2',
      pseudo: 'Sacha',
      eloProfile: createDefaultEloProfile(),
      now: t0,
    });
    if (!unlim1.ok) throw new Error('join failed');

    const later = t0 + DISCONNECT_FORFEIT_MS + 1000;
    unlim1.room.players.X!.lastSeenAt = later - 1000;
    const abandoned = settleTimeoutsAndAbandonment(unlim1.room, later);
    expect(abandoned.changed).toBe(true);
    expect(abandoned.endReason).toBe('abandoned');
    expect(abandoned.endedWinner).toBe('X');
  });

  it('calcule l’Elo à la fin et inverse les symboles sur revanche', () => {
    const t0 = 3_000_000;
    const profX = createDefaultEloProfile();
    const profO = createDefaultEloProfile();

    const room0 = createStoredRoom({
      code: 'ELO111',
      playerId: 'p1',
      profileKey: 'k1',
      pseudo: 'Nora',
      timeControl: 'unlimited',
      eloProfile: profX,
      now: t0,
    });
    const joined = joinStoredRoom(room0, {
      playerId: 'p2',
      profileKey: 'k2',
      pseudo: 'Hugo',
      eloProfile: profO,
      now: t0,
    });
    if (!joined.ok) throw new Error('join failed');

    const resigned = resignStoredRoom(joined.room, {
      playerId: 'p2',
      now: t0 + 2000,
    });
    expect(resigned.ok).toBe(true);
    if (!resigned.ok) return;

    const withElo = applyEloOutcomeToRoom(resigned.room, profX, profO);
    expect(withElo.nextProfileX.rating).toBe(1220);
    expect(withElo.nextProfileO.rating).toBe(1180);
    expect(withElo.room.eloResult).toEqual({
      X: { before: 1200, after: 1220, delta: 20, tier: 'Tacticien' },
      O: { before: 1200, after: 1180, delta: -20, tier: 'Apprenti' },
    });

    const v1 = voteRematchStoredRoom(withElo.room, {
      playerId: 'p1',
      now: t0 + 3000,
    });
    expect(v1.ok && !v1.restarted).toBe(true);
    if (!v1.ok) return;

    const v2 = voteRematchStoredRoom(v1.room, {
      playerId: 'p2',
      now: t0 + 4000,
    });
    expect(v2.ok && v2.restarted).toBe(true);
    if (!v2.ok) return;

    expect(v2.room.players.X?.id).toBe('p2');
    expect(v2.room.players.X?.elo).toBe(1180);
    expect(v2.room.players.O?.id).toBe('p1');
    expect(v2.room.players.O?.elo).toBe(1220);
    expect(v2.room.eloResult).toBeNull();

    // Quitter en pleine partie déclenche un abandon
    const left = leaveStoredRoom(v2.room, {
      playerId: 'p2',
      now: t0 + 5000,
    });
    expect(left.deleted).toBe(false);
    expect(left.endedWinner).toBe('O');
    expect(left.endReason).toBe('abandoned');
  });
});
