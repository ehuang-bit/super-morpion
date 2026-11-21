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
  type StoredRoom,
} from './onlineRoomLogic.js';
import {
  MATCH_INTRO_MS,
  MOVE_TIMEOUT_GRACE_MS,
  MOVE_TIME_LIMIT_MS,
  type TimeControl,
} from './protocol.js';

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
    // Le premier chrono ne démarre qu'après la présentation des joueurs
    expect(joined.room.turnStartedAt).toBe(t0 + 500 + MATCH_INTRO_MS);

    // O essaie de jouer hors tour -> rejeté
    const wrongTurn = applyMoveToStoredRoom(joined.room, {
      playerId: 'p2',
      move: { boardIndex: 0, cellIndex: 0 },
      now: t0 + 1000,
    });
    expect(wrongTurn.ok).toBe(false);

    // X joue un coup légal 1 s après le démarrage de son chrono
    const moved = applyMoveToStoredRoom(joined.room, {
      playerId: 'p1',
      move: { boardIndex: 4, cellIndex: 2 },
      now: t0 + 500 + MATCH_INTRO_MS + 1000,
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.room.clocks?.X).toBe(179_000);
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

    // X ne joue jamais son premier coup : partie annulée, pas de vainqueur
    const aborted = settleTimeoutsAndAbandonment(j.room, t0 + 91_000);
    expect(aborted.changed).toBe(true);
    expect(aborted.endReason).toBe('aborted');
    expect(aborted.endedWinner).toBeNull();
    expect(aborted.room.players.O?.score).toBe(0);

    // Après deux coups, une pendule globale épuisée fait perdre au temps
    const m1 = applyMoveToStoredRoom(j.room, {
      playerId: 'p1',
      move: { boardIndex: 4, cellIndex: 0 },
      now: t0 + 1_000,
    });
    if (!m1.ok) throw new Error('move failed');
    const m2 = applyMoveToStoredRoom(m1.room, {
      playerId: 'p2',
      move: { boardIndex: 0, cellIndex: 4 },
      now: t0 + 2_000,
    });
    if (!m2.ok) throw new Error('move failed');
    const lowClock: StoredRoom = { ...m2.room, clocks: { X: 10_000, O: 89_000 } };
    const notYet = settleTimeoutsAndAbandonment(lowClock, t0 + 2_000 + 9_999);
    expect(notYet.changed).toBe(false);
    const timedOut = settleTimeoutsAndAbandonment(lowClock, t0 + 2_000 + 10_000);
    expect(timedOut.changed).toBe(true);
    expect(timedOut.endReason).toBe('timeout');
    expect(timedOut.endedWinner).toBe('O');
    expect(timedOut.room.clocks?.X).toBe(0);
    // Aucun coup n'a été joué d'office : la pendule a expiré avant la limite par coup
    expect(timedOut.room.gameState.moveHistory).toHaveLength(2);

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

    const u1 = applyMoveToStoredRoom(unlim1.room, {
      playerId: 'p1',
      move: { boardIndex: 4, cellIndex: 4 },
      now: t0 + 100,
    });
    if (!u1.ok) throw new Error('move failed');
    const u2 = applyMoveToStoredRoom(u1.room, {
      playerId: 'p2',
      move: { boardIndex: 4, cellIndex: 0 },
      now: t0 + 200,
    });
    if (!u2.ok) throw new Error('move failed');

    const later = t0 + DISCONNECT_FORFEIT_MS + 1000;
    u2.room.players.X!.lastSeenAt = later - 1000;
    const abandoned = settleTimeoutsAndAbandonment(u2.room, later);
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

    // Abandon immédiat (0 coup) : annulé, aucun effet sur le classement
    const earlyResign = resignStoredRoom(joined.room, { playerId: 'p2', now: t0 + 500 });
    if (!earlyResign.ok) throw new Error('resign failed');
    expect(earlyResign.endReason).toBe('aborted');
    const unrated = applyEloOutcomeToRoom(earlyResign.room, profX, profO, t0 + 500);
    expect(unrated.rated).toBe(false);
    expect(unrated.room.eloResult?.X).toMatchObject({ delta: 0, rated: false });
    expect(unrated.nextProfileX).toBe(profX);

    const m1 = applyMoveToStoredRoom(joined.room, {
      playerId: 'p1',
      move: { boardIndex: 4, cellIndex: 4 },
      now: t0 + 1000,
    });
    if (!m1.ok) throw new Error('move failed');
    const m2 = applyMoveToStoredRoom(m1.room, {
      playerId: 'p2',
      move: { boardIndex: 4, cellIndex: 1 },
      now: t0 + 1500,
    });
    if (!m2.ok) throw new Error('move failed');

    const resigned = resignStoredRoom(m2.room, {
      playerId: 'p2',
      now: t0 + 2000,
    });
    expect(resigned.ok).toBe(true);
    if (!resigned.ok) return;
    expect(resigned.endReason).toBe('resign');

    const withElo = applyEloOutcomeToRoom(resigned.room, profX, profO, t0 + 2000);
    expect(withElo.rated).toBe(true);
    // Deux joueurs provisoires : grosse variation symétrique (Glicko-2)
    const gain = withElo.nextProfileX.rating - 1200;
    expect(gain).toBeGreaterThan(100);
    expect(withElo.nextProfileO.rating).toBe(1200 - gain);
    expect(withElo.nextProfileX.rd).toBeLessThan(350);
    expect(withElo.nextProfileX.lastPlayedAt).toBe(t0 + 2000);
    expect(withElo.room.eloResult?.X).toMatchObject({
      before: 1200,
      after: 1200 + gain,
      delta: gain,
      rated: true,
      provisional: true,
    });
    expect(withElo.room.players.X?.rd).toBeLessThan(350);

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
    expect(v2.room.players.X?.elo).toBe(1200 - gain);
    expect(v2.room.players.O?.id).toBe('p1');
    expect(v2.room.players.O?.elo).toBe(1200 + gain);
    expect(v2.room.eloResult).toBeNull();

    // Quitter avant d'avoir joué : annulation
    const leftEarly = leaveStoredRoom(v2.room, { playerId: 'p2', now: t0 + 5000 });
    expect(leftEarly.endReason).toBe('aborted');
    expect(leftEarly.endedWinner).toBeNull();

    // Quitter en pleine partie déclenche un abandon
    const r1 = applyMoveToStoredRoom(v2.room, {
      playerId: 'p2',
      move: { boardIndex: 0, cellIndex: 0 },
      now: t0 + 5000,
    });
    if (!r1.ok) throw new Error('move failed');
    const r2 = applyMoveToStoredRoom(r1.room, {
      playerId: 'p1',
      move: { boardIndex: 0, cellIndex: 1 },
      now: t0 + 5500,
    });
    if (!r2.ok) throw new Error('move failed');
    const left = leaveStoredRoom(r2.room, {
      playerId: 'p2',
      now: t0 + 6000,
    });
    expect(left.deleted).toBe(false);
    expect(left.endedWinner).toBe('O');
    expect(left.endReason).toBe('abandoned');
  });
});

describe('limite de 25 s par coup', () => {
  const LIMIT = MOVE_TIME_LIMIT_MS;
  const GRACE = MOVE_TIMEOUT_GRACE_MS;

  /** Salon lancé à t0 : le chrono de X démarre à `start`. */
  function startRoom(timeControl: TimeControl, t0 = 5_000_000) {
    const room0 = createStoredRoom({
      code: 'TIM001',
      playerId: 'p1',
      profileKey: 'k1',
      pseudo: 'Lina',
      timeControl,
      eloProfile: createDefaultEloProfile(),
      now: t0,
    });
    const joined = joinStoredRoom(room0, {
      playerId: 'p2',
      profileKey: 'k2',
      pseudo: 'Marc',
      eloProfile: createDefaultEloProfile(),
      now: t0,
    });
    if (!joined.ok) throw new Error('join failed');
    return { room: joined.room, start: t0 + MATCH_INTRO_MS };
  }

  function play(
    room: StoredRoom,
    playerId: string,
    boardIndex: number,
    cellIndex: number,
    now: number,
  ): StoredRoom {
    const res = applyMoveToStoredRoom(room, {
      playerId,
      move: { boardIndex, cellIndex },
      now,
    });
    if (!res.ok) throw new Error(`move failed: ${res.error}`);
    return res.room;
  }

  it('s’applique aussi à la cadence sans pendule globale', () => {
    const { room, start } = startRoom('unlimited');
    expect(room.clocks).toBeNull();
    expect(room.turnStartedAt).toBe(start);

    const snap = toRoomSnapshot(room, start);
    expect(snap.moveTimeLimitMs).toBe(25_000);
    expect(snap.moveTimeouts).toEqual({ X: 0, O: 0 });

    // Pendant la présentation et jusqu'à la limite : rien ne bouge
    expect(settleTimeoutsAndAbandonment(room, start - 1).changed).toBe(false);
    expect(settleTimeoutsAndAbandonment(room, start + LIMIT + GRACE - 1).changed).toBe(false);
  });

  it('joue un coup aléatoire d’office quand la limite est dépassée', () => {
    const { room, start } = startRoom('rapid');
    const settled = settleTimeoutsAndAbandonment(room, start + LIMIT + GRACE, () => 0);

    expect(settled.changed).toBe(true);
    expect(settled.endReason).toBeNull();
    expect(settled.room.phase).toBe('playing');

    const history = settled.room.gameState.moveHistory;
    expect(history).toHaveLength(1);
    // rng() = 0 : premier coup légal
    expect(history[0]).toMatchObject({ player: 'X', boardIndex: 0, cellIndex: 0, auto: true });
    expect(settled.room.gameState.currentPlayer).toBe('O');
    expect(settled.room.moveTimeouts).toEqual({ X: 1, O: 0 });
    // Le chrono suivant démarre à l'échéance, pas au moment du contrôle
    expect(settled.room.turnStartedAt).toBe(start + LIMIT);
    // La pendule globale est débitée des 25 s
    expect(settled.room.clocks).toEqual({ X: 180_000 - LIMIT, O: 180_000 });
    // Le salon d'origine n'est pas modifié
    expect(room.gameState.moveHistory).toHaveLength(0);
  });

  it('choisit toujours un coup légal, y compris dans une zone imposée', () => {
    const { room, start } = startRoom('unlimited');
    const afterX = play(room, 'p1', 4, 2, start + 1_000); // envoie O en zone 2
    for (const r of [0, 0.37, 0.5, 0.999]) {
      const settled = settleTimeoutsAndAbandonment(afterX, start + 1_000 + LIMIT + GRACE, () => r);
      const last = settled.room.gameState.moveHistory.at(-1);
      expect(last).toMatchObject({ player: 'O', boardIndex: 2, auto: true });
    }
  });

  it('accepte un coup arrivé dans la tolérance réseau, refuse au-delà', () => {
    const { room, start } = startRoom('unlimited');

    const inGrace = applyMoveToStoredRoom(room, {
      playerId: 'p1',
      move: { boardIndex: 4, cellIndex: 4 },
      now: start + LIMIT + GRACE - 1,
    });
    expect(inGrace.ok).toBe(true);

    const tooLate = applyMoveToStoredRoom(room, {
      playerId: 'p1',
      move: { boardIndex: 4, cellIndex: 4 },
      now: start + LIMIT + GRACE + 100,
      rng: () => 0,
    });
    expect(tooLate.ok).toBe(false);
    if (tooLate.ok) return;
    expect(tooLate.error).toContain('joué à votre place');
    // L'état avec le coup d'office est renvoyé pour être enregistré
    expect(tooLate.settledRoom?.phase).toBe('playing');
    expect(tooLate.settledRoom?.gameState.moveHistory).toHaveLength(1);
    expect(tooLate.settledRoom?.gameState.moveHistory[0].auto).toBe(true);
    expect(tooLate.settledRoom?.gameState.currentPlayer).toBe('O');
  });

  it('remet le compteur à zéro dès que le joueur joue lui-même', () => {
    const { room, start } = startRoom('unlimited');
    let t = start + 1_000;
    let r = play(room, 'p1', 4, 4, t); // X joue, O envoyé en zone 4
    t += 1_000;
    r = play(r, 'p2', 4, 0, t); // O joue, X envoyé en zone 0

    // X dépasse une première fois
    t += LIMIT + GRACE;
    const first = settleTimeoutsAndAbandonment(r, t, () => 0);
    expect(first.room.moveTimeouts).toEqual({ X: 1, O: 0 });
    expect(first.room.phase).toBe('playing');
    r = first.room;

    // O joue, puis X joue lui-même : son compteur repart de zéro
    const xAuto = r.gameState.moveHistory.at(-1)!;
    const oBoard = xAuto.cellIndex;
    const oCell = r.gameState.boards[oBoard].cells.findIndex((c) => c === null);
    t = r.turnStartedAt! + 1_000;
    r = play(r, 'p2', oBoard, oCell, t);
    const xBoard = r.gameState.activeBoard!;
    const xCell = r.gameState.boards[xBoard].cells.findIndex((c) => c === null);
    t += 1_000;
    r = play(r, 'p1', xBoard, xCell, t);
    expect(r.moveTimeouts).toEqual({ X: 0, O: 0 });
  });

  it('fait perdre au temps au 2e dépassement d’affilée', () => {
    const { room, start } = startRoom('unlimited');
    let t = start + 1_000;
    let r = play(room, 'p1', 4, 4, t);
    t += 1_000;
    r = play(r, 'p2', 4, 0, t);

    // 1er dépassement de X : coup d'office
    t += LIMIT + GRACE;
    r = settleTimeoutsAndAbandonment(r, t, () => 0).room;
    expect(r.moveTimeouts?.X).toBe(1);

    // O joue normalement
    const oBoard = r.gameState.activeBoard!;
    const oCell = r.gameState.boards[oBoard].cells.findIndex((c) => c === null);
    t = r.turnStartedAt! + 2_000;
    r = play(r, 'p2', oBoard, oCell, t);
    const movesBefore = r.gameState.moveHistory.length;

    // 2e dépassement d'affilée de X : défaite au temps, classée
    const lost = settleTimeoutsAndAbandonment(r, t + LIMIT + GRACE, () => 0);
    expect(lost.changed).toBe(true);
    expect(lost.endReason).toBe('timeout');
    expect(lost.endedWinner).toBe('O');
    expect(lost.room.phase).toBe('finished');
    expect(lost.room.matchWinner).toBe('O');
    expect(lost.room.players.O?.score).toBe(1);
    // Pas de second coup d'office
    expect(lost.room.gameState.moveHistory).toHaveLength(movesBefore);
  });

  it('annule la partie si un joueur n’a jamais joué lui-même', () => {
    const { room, start } = startRoom('unlimited');
    // X absent : coup d'office, O joue, X dépasse encore
    let r = settleTimeoutsAndAbandonment(room, start + LIMIT + GRACE, () => 0).room;
    const oBoard = r.gameState.activeBoard!;
    const oCell = r.gameState.boards[oBoard].cells.findIndex((c) => c === null);
    const t = r.turnStartedAt! + 1_000;
    r = play(r, 'p2', oBoard, oCell, t);

    const ended = settleTimeoutsAndAbandonment(r, t + LIMIT + GRACE, () => 0);
    expect(ended.endReason).toBe('aborted');
    expect(ended.endedWinner).toBeNull();
    expect(ended.room.players.O?.score).toBe(0);
  });

  it('rejoue toute la chronologie après une longue absence des deux joueurs', () => {
    const { room, start } = startRoom('unlimited');
    let t = start + 1_000;
    let r = play(room, 'p1', 4, 4, t);
    t += 1_000;
    r = play(r, 'p2', 4, 0, t);

    // Personne ne revient pendant une heure : X d'office, O d'office, puis
    // 2e dépassement de X
    const settled = settleTimeoutsAndAbandonment(r, t + 3_600_000, () => 0);
    expect(settled.endReason).toBe('timeout');
    expect(settled.endedWinner).toBe('O');
    const history = settled.room.gameState.moveHistory;
    expect(history).toHaveLength(4);
    expect(history[2]).toMatchObject({ player: 'X', auto: true });
    expect(history[3]).toMatchObject({ player: 'O', auto: true });
    expect(settled.room.moveTimeouts).toEqual({ X: 2, O: 1 });
  });

  it('laisse la pendule globale décider quand il reste moins de 25 s', () => {
    const { room, start } = startRoom('blitz');
    let t = start + 1_000;
    let r = play(room, 'p1', 4, 4, t);
    t += 1_000;
    r = play(r, 'p2', 4, 0, t);
    r = { ...r, clocks: { X: 8_000, O: 60_000 } };

    expect(settleTimeoutsAndAbandonment(r, t + 7_999).changed).toBe(false);
    const flagged = settleTimeoutsAndAbandonment(r, t + 8_000);
    expect(flagged.endReason).toBe('timeout');
    expect(flagged.endedWinner).toBe('O');
    expect(flagged.room.clocks?.X).toBe(0);
    expect(flagged.room.gameState.moveHistory).toHaveLength(2);
  });

  it('repart de zéro à la revanche', () => {
    const { room, start } = startRoom('unlimited');
    let t = start + 1_000;
    let r = play(room, 'p1', 4, 4, t);
    t += 1_000;
    r = play(r, 'p2', 4, 0, t);
    t += LIMIT + GRACE;
    r = settleTimeoutsAndAbandonment(r, t, () => 0).room;
    expect(r.moveTimeouts?.X).toBe(1);

    const resigned = resignStoredRoom(r, { playerId: 'p2', now: t + 1_000 });
    if (!resigned.ok) throw new Error('resign failed');
    const v1 = voteRematchStoredRoom(resigned.room, { playerId: 'p1', now: t + 2_000 });
    if (!v1.ok) throw new Error('vote failed');
    const v2 = voteRematchStoredRoom(v1.room, { playerId: 'p2', now: t + 3_000 });
    if (!v2.ok) throw new Error('vote failed');
    expect(v2.restarted).toBe(true);
    expect(v2.room.moveTimeouts).toEqual({ X: 0, O: 0 });
    expect(v2.room.turnStartedAt).toBe(t + 3_000 + MATCH_INTRO_MS);
  });

  it('n’impose rien aux salons créés avant la règle tant qu’aucun coup n’est joué', () => {
    const { room, start } = startRoom('unlimited');
    const legacy: StoredRoom = { ...room, turnStartedAt: null };
    delete legacy.moveTimeouts;

    const settled = settleTimeoutsAndAbandonment(legacy, start + 10 * LIMIT);
    expect(settled.changed).toBe(false);
    expect(toRoomSnapshot(legacy, start).moveTimeouts).toEqual({ X: 0, O: 0 });

    // Dès le coup suivant, le chrono par coup s'enclenche
    const next = play(legacy, 'p1', 4, 4, start + 10 * LIMIT);
    expect(next.turnStartedAt).toBe(start + 10 * LIMIT);
    expect(next.moveTimeouts).toEqual({ X: 0, O: 0 });
  });
});
