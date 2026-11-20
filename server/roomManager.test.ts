import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoomManager } from './roomManager.js';

describe('RoomManager', () => {
  const managers: RoomManager[] = [];

  afterEach(() => {
    vi.useRealTimers();
    for (const m of managers) {
      m.dispose();
    }
    managers.length = 0;
  });

  function createManager(options: ConstructorParameters<typeof RoomManager>[0] = {}) {
    const manager = new RoomManager(options);
    managers.push(manager);
    return manager;
  }

  it('crée un salon à 6 caractères, permet à un deuxième joueur de rejoindre et rejette un troisième', () => {
    const manager = createManager();
    const created = manager.createRoom({
      socketId: 's1',
      playerId: 'p1',
      pseudo: 'Camille',
      timeControl: 'unlimited',
    });

    expect(created.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(created.phase).toBe('waiting');
    expect(created.players.X?.pseudo).toBe('Camille');
    expect(created.players.O).toBeNull();

    const joined = manager.joinRoom({
      code: ` ${created.code.toLowerCase()} `,
      socketId: 's2',
      playerId: 'p2',
      pseudo: 'Théo',
    });

    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.snapshot.phase).toBe('playing');
    expect(joined.snapshot.players.O?.pseudo).toBe('Théo');

    const third = manager.joinRoom({
      code: created.code,
      socketId: 's3',
      playerId: 'p3',
      pseudo: 'Intrus',
    });
    expect(third.ok).toBe(false);
  });

  it('valide les coups de manière autoritaire et empêche de jouer hors tour', () => {
    const manager = createManager();
    const created = manager.createRoom({
      socketId: 's1',
      playerId: 'p1',
      pseudo: 'Alice',
      timeControl: 'unlimited',
    });
    manager.joinRoom({
      code: created.code,
      socketId: 's2',
      playerId: 'p2',
      pseudo: 'Bastien',
    });

    // O essaie de jouer avant X
    const badTurn = manager.handleMove({
      code: created.code,
      socketId: 's2',
      playerId: 'p2',
      move: { boardIndex: 0, cellIndex: 0 },
    });
    expect(badTurn.ok).toBe(false);

    // Usurpation de socketId
    const spoofed = manager.handleMove({
      code: created.code,
      socketId: 's2',
      playerId: 'p1',
      move: { boardIndex: 0, cellIndex: 0 },
    });
    expect(spoofed.ok).toBe(false);

    // Coup légitime de X
    const goodMove = manager.handleMove({
      code: created.code,
      socketId: 's1',
      playerId: 'p1',
      move: { boardIndex: 4, cellIndex: 2 },
    });
    expect(goodMove.ok).toBe(true);
    if (!goodMove.ok) return;
    expect(goodMove.snapshot.gameState.activeBoard).toBe(2);
    expect(goodMove.snapshot.gameState.currentPlayer).toBe('O');
  });

  it('gère la reconnexion sur rafraîchissement et annule le forfait de déconnexion', () => {
    vi.useFakeTimers();
    const updates: string[] = [];
    const manager = createManager({
      disconnectGraceMs: 5000,
      onRoomUpdated: (snap) => updates.push(`${snap.phase}:${snap.endReason ?? ''}`),
    });

    const created = manager.createRoom({
      socketId: 's1',
      playerId: 'p1',
      pseudo: 'Lucie',
      timeControl: 'unlimited',
    });
    manager.joinRoom({
      code: created.code,
      socketId: 's2',
      playerId: 'p2',
      pseudo: 'Marc',
    });

    const disc = manager.handleDisconnect('s2');
    expect(disc.snapshot?.players.O?.connected).toBe(false);

    // Reconnexion avant les 5s avec un nouveau socketId
    vi.advanceTimersByTime(2000);
    const reconn = manager.joinRoom({
      code: created.code,
      socketId: 's2-new',
      playerId: 'p2',
      pseudo: 'Marc',
    });
    expect(reconn.ok).toBe(true);
    if (!reconn.ok) return;
    expect(reconn.reconnected).toBe(true);
    expect(reconn.snapshot.players.O?.connected).toBe(true);

    // Même après expiration du délai initial, la partie continue
    vi.advanceTimersByTime(5000);
    expect(updates).toHaveLength(0);
    expect(manager.getRoomSnapshot(created.code)?.phase).toBe('playing');
  });

  it('attribue la victoire par abandon après expiration du délai de reconnexion', () => {
    vi.useFakeTimers();
    let latestPhase = '';
    let latestWinner: string | null = null;
    const manager = createManager({
      disconnectGraceMs: 5000,
      onRoomUpdated: (snap) => {
        latestPhase = snap.phase;
        latestWinner = snap.matchWinner;
      },
    });

    const created = manager.createRoom({
      socketId: 's1',
      playerId: 'p1',
      pseudo: 'Léa',
      timeControl: 'unlimited',
    });
    manager.joinRoom({
      code: created.code,
      socketId: 's2',
      playerId: 'p2',
      pseudo: 'Noé',
    });

    manager.handleDisconnect('s2');
    vi.advanceTimersByTime(5100);

    expect(latestPhase).toBe('finished');
    expect(latestWinner).toBe('X');
    const finalSnap = manager.getRoomSnapshot(created.code);
    expect(finalSnap?.endReason).toBe('abandoned');
    expect(finalSnap?.players.X?.score).toBe(1);
  });

  it('inverse qui commence lors d’une revanche tout en conservant les scores personnels', () => {
    const manager = createManager();
    const created = manager.createRoom({
      socketId: 's1',
      playerId: 'p1',
      pseudo: 'Nora',
      timeControl: 'rapid',
    });
    manager.joinRoom({
      code: created.code,
      socketId: 's2',
      playerId: 'p2',
      pseudo: 'Hugo',
    });

    // p2 abandonne -> p1 (X) gagne et passe à 1 point
    const resigned = manager.resign({
      code: created.code,
      socketId: 's2',
      playerId: 'p2',
    });
    expect(resigned.ok).toBe(true);
    if (!resigned.ok) return;
    expect(resigned.snapshot.players.X?.score).toBe(1);

    // Vote 1/2
    const v1 = manager.requestRematch({
      code: created.code,
      socketId: 's1',
      playerId: 'p1',
    });
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;
    expect(v1.restarted).toBe(false);
    expect(v1.snapshot.rematchVotes).toEqual(['p1']);

    // Vote 2/2 -> redémarrage avec rôles inversés
    const v2 = manager.requestRematch({
      code: created.code,
      socketId: 's2',
      playerId: 'p2',
    });
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    expect(v2.restarted).toBe(true);
    expect(v2.snapshot.phase).toBe('playing');
    expect(v2.snapshot.gameNumber).toBe(2);
    expect(v2.snapshot.players.X?.id).toBe('p2');
    expect(v2.snapshot.players.X?.score).toBe(0);
    expect(v2.snapshot.players.O?.id).toBe('p1');
    expect(v2.snapshot.players.O?.score).toBe(1);
    expect(v2.snapshot.gameState.currentPlayer).toBe('X');
  });

  it('apparie deux joueurs en matchmaking rapide et décompte la pendule correctement', () => {
    vi.useFakeTimers();
    let nowMs = 1_000_000;
    let timedOutReason: string | null = null;

    const manager = createManager({
      now: () => nowMs,
      onRoomUpdated: (snap) => {
        timedOutReason = snap.endReason;
      },
    });

    const first = manager.joinMatchmaking({
      socketId: 's1',
      playerId: 'p1',
      pseudo: 'Jade',
      timeControl: 'blitz',
    });
    expect(first.matched).toBe(false);

    // Le même joueur ne s'auto-apparie pas
    const selfRetry = manager.joinMatchmaking({
      socketId: 's1',
      playerId: 'p1',
      pseudo: 'Jade',
      timeControl: 'blitz',
    });
    expect(selfRetry.matched).toBe(false);

    // Autre cadence -> pas d'appariement
    const otherCadence = manager.joinMatchmaking({
      socketId: 's3',
      playerId: 'p3',
      pseudo: 'Paul',
      timeControl: 'rapid',
    });
    expect(otherCadence.matched).toBe(false);

    // Deuxième joueur en blitz -> match immédiat
    const second = manager.joinMatchmaking({
      socketId: 's2',
      playerId: 'p2',
      pseudo: 'Sacha',
      timeControl: 'blitz',
    });
    expect(second.matched).toBe(true);
    if (!second.matched) return;

    const { code, snapshot } = second;
    expect(snapshot.clocks).toEqual({ X: 90_000, O: 90_000 });

    // 4.5s s'écoulent pendant le tour de X
    nowMs += 4500;
    vi.advanceTimersByTime(4500);

    const moved = manager.handleMove({
      code,
      socketId: 's1',
      playerId: 'p1',
      move: { boardIndex: 0, cellIndex: 0 },
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    expect(moved.snapshot.clocks?.X).toBe(85_500);
    expect(moved.snapshot.clocks?.O).toBe(90_000);

    // O laisse passer ses 90s -> timeout automatique
    nowMs += 90_000;
    vi.advanceTimersByTime(90_000);

    expect(timedOutReason).toBe('timeout');
    const finalSnap = manager.getRoomSnapshot(code);
    expect(finalSnap?.phase).toBe('finished');
    expect(finalSnap?.matchWinner).toBe('X');
    expect(finalSnap?.clocks?.O).toBe(0);
    expect(finalSnap?.eloResult).toEqual({
      X: { before: 1200, after: 1220, delta: 20, tier: 'Tacticien' },
      O: { before: 1200, after: 1180, delta: -20, tier: 'Apprenti' },
    });
  });

  it('calcule les enjeux Elo et met à jour les classements lors d’une fin de partie puis d’une revanche', () => {
    const profileEvents: Array<{ socketId: string; rating: number }> = [];
    const manager = createManager({
      onProfileUpdated: (socketId, payload) => {
        profileEvents.push({ socketId, rating: payload.profile.rating });
      },
    });

    const created = manager.createRoom({
      socketId: 's1',
      playerId: 'p1',
      profileId: 'prof-1',
      pseudo: 'Nora',
      timeControl: 'unlimited',
    });
    expect(created.players.X?.elo).toBe(1200);
    expect(created.eloStakes).toBeNull();

    const joined = manager.joinRoom({
      code: created.code,
      socketId: 's2',
      playerId: 'p2',
      profileId: 'prof-2',
      pseudo: 'Hugo',
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    expect(joined.snapshot.eloStakes).toEqual({
      winX: 20,
      drawX: 0,
      lossX: -20,
      winO: 20,
      drawO: 0,
      lossO: -20,
      winProbX: 50,
    });

    // Hugo abandonne -> Nora (X) gagne +20, Hugo (O) perd -20
    const resigned = manager.resign({
      code: created.code,
      socketId: 's2',
      playerId: 'p2',
    });
    expect(resigned.ok).toBe(true);
    if (!resigned.ok) return;

    expect(resigned.snapshot.eloResult).toEqual({
      X: { before: 1200, after: 1220, delta: 20, tier: 'Tacticien' },
      O: { before: 1200, after: 1180, delta: -20, tier: 'Apprenti' },
    });
    expect(resigned.snapshot.players.X?.elo).toBe(1220);
    expect(resigned.snapshot.players.O?.elo).toBe(1180);
    expect(profileEvents).toEqual([
      { socketId: 's1', rating: 1220 },
      { socketId: 's2', rating: 1180 },
    ]);

    // Revanche: rôles inversés (Hugo passe X à 1180, Nora passe O à 1220) et nouveaux enjeux
    manager.requestRematch({ code: created.code, socketId: 's1', playerId: 'p1' });
    const rematch = manager.requestRematch({
      code: created.code,
      socketId: 's2',
      playerId: 'p2',
    });
    expect(rematch.ok).toBe(true);
    if (!rematch.ok) return;
    expect(rematch.restarted).toBe(true);
    expect(rematch.snapshot.eloResult).toBeNull();
    expect(rematch.snapshot.players.X?.elo).toBe(1180);
    expect(rematch.snapshot.players.O?.elo).toBe(1220);
    expect(rematch.snapshot.eloStakes?.winX).toBeGreaterThan(20);
  });
});
