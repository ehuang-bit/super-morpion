import { describe, expect, it } from 'vitest';
import {
  BOT_LEVELS,
  BOT_MAX_LEVEL,
  BOT_MIN_LEVEL,
  calibrateBotLevelFromElo,
  chooseBotMove,
  createInitialBotProgress,
  evolveBotProgress,
  getBotLevelProfile,
} from './botEngine';
import {
  applyMove,
  createInitialState,
  isValidMove,
  type GameState,
} from './gameEngine';

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('botEngine — calibration & évolution adaptative', () => {
  it('calibre le niveau initial du bot selon le classement Elo du joueur', () => {
    expect(calibrateBotLevelFromElo(300)).toBe(1);
    expect(calibrateBotLevelFromElo(500)).toBe(2);
    expect(calibrateBotLevelFromElo(850)).toBe(4);
    expect(calibrateBotLevelFromElo(1200)).toBe(6);
    expect(calibrateBotLevelFromElo(1600)).toBe(8);
    expect(calibrateBotLevelFromElo(2050)).toBe(10);
  });

  it('fait évoluer le bot au palier supérieur à chaque victoire du joueur', () => {
    const start = createInitialBotProgress(300);
    expect(start.level).toBe(1);
    expect(start.highestDefeatedLevel).toBeNull();

    const win1 = evolveBotProgress(start, 'win');
    expect(win1.evolved).toBe(true);
    expect(win1.previousLevel).toBe(1);
    expect(win1.next.level).toBe(2);
    expect(win1.next.peakLevel).toBe(2);
    expect(win1.next.highestDefeatedLevel).toBe(1);
    expect(win1.next.wins).toBe(1);
    expect(win1.next.winStreak).toBe(1);
    expect(win1.masteredMaxLevel).toBe(false);

    const win2 = evolveBotProgress(win1.next, 'win');
    expect(win2.evolved).toBe(true);
    expect(win2.next.level).toBe(3);
    expect(win2.next.winStreak).toBe(2);
  });

  it('plafonne proprement au niveau maximal (Souverain) et signale la maîtrise', () => {
    const atMax = createInitialBotProgress(2100);
    expect(atMax.level).toBe(BOT_MAX_LEVEL);

    const res = evolveBotProgress(atMax, 'win');
    expect(res.next.level).toBe(BOT_MAX_LEVEL);
    expect(res.evolved).toBe(false);
    expect(res.masteredMaxLevel).toBe(true);
    expect(res.next.highestDefeatedLevel).toBe(BOT_MAX_LEVEL);
  });

  it('conserve le niveau sur défaite ou nul et suit les défaites consécutives', () => {
    const start = createInitialBotProgress(1360);
    const loss1 = evolveBotProgress(start, 'loss');
    expect(loss1.evolved).toBe(false);
    expect(loss1.next.level).toBe(start.level);
    expect(loss1.next.losses).toBe(1);
    expect(loss1.next.consecutiveLosses).toBe(1);

    const loss2 = evolveBotProgress(loss1.next, 'loss');
    expect(loss2.next.consecutiveLosses).toBe(2);

    const draw = evolveBotProgress(loss2.next, 'draw');
    expect(draw.next.draws).toBe(1);
    expect(draw.next.consecutiveLosses).toBe(0);
  });

  it('expose 10 paliers strictement croissants en Elo', () => {
    expect(BOT_LEVELS.length).toBe(BOT_MAX_LEVEL - BOT_MIN_LEVEL + 1);
    for (let i = 1; i < BOT_LEVELS.length; i++) {
      expect(BOT_LEVELS[i].elo).toBeGreaterThan(BOT_LEVELS[i - 1].elo);
      expect(getBotLevelProfile(i + 1).level).toBe(i + 1);
    }
  });
});

describe('botEngine — qualité tactique & légalité des coups', () => {
  it('joue toujours un coup légal dès le premier coup quel que soit le niveau', () => {
    const state = createInitialState('X');
    for (let level = BOT_MIN_LEVEL; level <= BOT_MAX_LEVEL; level++) {
      const choice = chooseBotMove(state, level, seededRng(42 + level));
      expect(choice).not.toBeNull();
      expect(isValidMove(state, choice!.move, 'X')).toBe(true);
    }
  });

  it('prend immédiatement un coup gagnant global en 1 coup', () => {
    const state = createInitialState('O');
    // O a déjà capturé A1 (0) et B2 (4), et menace C3 (8) sur la case 8
    state.boards[0].status = 'O';
    state.boards[0].winner = 'O';
    state.boards[4].status = 'O';
    state.boards[4].winner = 'O';
    state.boards[8].cells[0] = 'O';
    state.boards[8].cells[4] = 'O';
    state.activeBoard = 8;
    state.moveHistory = [
      {
        boardIndex: 1,
        cellIndex: 8,
        player: 'X',
        moveNumber: 1,
        capturedBoard: false,
        triggeredFreeMove: false,
      },
    ];

    const choice = chooseBotMove(state, 4, seededRng(7));
    expect(choice).not.toBeNull();
    expect(choice!.move).toEqual({ boardIndex: 8, cellIndex: 8 });
  });

  it('bloque une victoire globale immédiate de l’adversaire à niveau confirmé/stratège', () => {
    const state = createInitialState('O');
    // X a déjà A1 (0) et B2 (4), et menace C3 (8) sur la case 8 pour gagner la partie.
    // Toutes les autres zones (1, 2, 3, 5, 6, 7) sont nulles/verrouillées : tout autre coup que (8, 8)
    // donne un coup libre à X qui gagne immédiatement en (8, 8).
    state.boards[0].status = 'X';
    state.boards[0].winner = 'X';
    state.boards[4].status = 'X';
    state.boards[4].winner = 'X';
    for (const closedIdx of [1, 2, 3, 5, 6, 7]) {
      state.boards[closedIdx].status = 'draw';
    }
    state.boards[8].cells[0] = 'X';
    state.boards[8].cells[4] = 'X';
    state.activeBoard = 8;
    state.moveHistory = [
      {
        boardIndex: 2,
        cellIndex: 8,
        player: 'X',
        moveNumber: 1,
        capturedBoard: false,
        triggeredFreeMove: false,
      },
    ];

    const choice = chooseBotMove(state, 5, seededRng(13));
    expect(choice).not.toBeNull();
    expect(choice!.move).toEqual({ boardIndex: 8, cellIndex: 8 });
  });

  it('un bot de haut niveau domine nettement un bot de niveau 1 sur une série de parties', () => {
    let strongWins = 0;
    let weakWins = 0;
    const rng = seededRng(2026);

    for (let g = 0; g < 6; g++) {
      let state: GameState = createInitialState(g % 2 === 0 ? 'X' : 'O');
      const strongPlayer = g % 2 === 0 ? 'X' : 'O';
      let safety = 0;

      while (state.status === 'playing' && safety < 85) {
        const level = state.currentPlayer === strongPlayer ? 7 : 1;
        const choice = chooseBotMove(state, level, rng);
        expect(choice).not.toBeNull();
        const res = applyMove(state, choice!.move);
        expect(res.ok).toBe(true);
        if (!res.ok) break;
        state = res.state;
        safety++;
      }

      if (state.status === 'won') {
        if (state.winner === strongPlayer) strongWins++;
        else weakWins++;
      }
    }

    expect(strongWins).toBeGreaterThan(weakWins);
  });
});
