import { describe, expect, it } from 'vitest';
import {
  applyMove,
  createInitialState,
  getDestinationPreview,
  getLegalMoves,
  isValidMove,
  validateMove,
  type GameState,
  type SubBoardState,
} from './gameEngine.js';

function makeBoard(
  overrides: Partial<SubBoardState> & { cells?: (null | 'X' | 'O')[] } = {},
): SubBoardState {
  return {
    cells: overrides.cells ?? Array(9).fill(null),
    status: overrides.status ?? 'active',
    winner: overrides.winner ?? null,
    winLine: overrides.winLine ?? null,
  };
}

function makeCustomState(partial: Partial<GameState> = {}): GameState {
  const base = createInitialState(partial.startingPlayer ?? 'X');
  return {
    ...base,
    ...partial,
    boards: partial.boards ?? base.boards,
  };
}

describe('gameEngine', () => {
  it('initialise correctement une partie avec 81 coups légaux et sans coup libre forcé', () => {
    const state = createInitialState('X');
    expect(state.boards).toHaveLength(9);
    expect(state.currentPlayer).toBe('X');
    expect(state.activeBoard).toBeNull();
    expect(state.isFreeMove).toBe(false);
    expect(state.status).toBe('playing');
    expect(getLegalMoves(state)).toHaveLength(81);
  });

  it('applique la règle de renvoi standard et rejette les coups hors sous-grille active', () => {
    const s0 = createInitialState('X');
    const r1 = applyMove(s0, { boardIndex: 4, cellIndex: 2 });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    expect(r1.state.currentPlayer).toBe('O');
    expect(r1.state.activeBoard).toBe(2);
    expect(r1.state.isFreeMove).toBe(false);
    expect(r1.state.lastMove).toEqual({ boardIndex: 4, cellIndex: 2, player: 'X' });

    // O essaie de jouer dans la sous-grille 0 au lieu de 2
    expect(validateMove(r1.state, { boardIndex: 0, cellIndex: 0 }, 'O')).toBe(
      'WRONG_SUBBOARD',
    );
    expect(isValidMove(r1.state, { boardIndex: 2, cellIndex: 5 }, 'O')).toBe(true);
  });

  it('rejette les coups hors tour, hors limites et sur cases déjà occupées', () => {
    const s0 = createInitialState('X');
    expect(validateMove(s0, { boardIndex: 0, cellIndex: 0 }, 'O')).toBe('NOT_YOUR_TURN');
    expect(validateMove(s0, { boardIndex: -1, cellIndex: 0 })).toBe('OUT_OF_BOUNDS');
    expect(validateMove(s0, { boardIndex: 0, cellIndex: 9 })).toBe('OUT_OF_BOUNDS');

    const r1 = applyMove(s0, { boardIndex: 0, cellIndex: 0 });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const r2 = applyMove(r1.state, { boardIndex: 0, cellIndex: 4 });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    // X est renvoyé en 4, essayons d'abord un test sur case occupée en mettant activeBoard = 0
    const custom = makeCustomState({
      boards: r2.state.boards,
      currentPlayer: 'X',
      activeBoard: 0,
    });
    expect(validateMove(custom, { boardIndex: 0, cellIndex: 0 })).toBe('CELL_OCCUPIED');
  });

  it('capture et verrouille immédiatement une sous-grille lors d’un alignement local', () => {
    const state = makeCustomState({
      currentPlayer: 'X',
      activeBoard: 0,
      boards: [
        makeBoard({
          cells: ['X', 'X', null, 'O', null, null, null, null, null],
        }),
        ...Array.from({ length: 8 }, () => makeBoard()),
      ],
    });

    const res = applyMove(state, { boardIndex: 0, cellIndex: 2 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.capturedBoard).toBe(true);
    expect(res.state.boards[0].status).toBe('X');
    expect(res.state.boards[0].winner).toBe('X');
    expect(res.state.boards[0].winLine).toEqual([0, 1, 2]);
    // Le coup a ciblé la case 2, la sous-grille 2 est active
    expect(res.state.activeBoard).toBe(2);

    // Vérifie qu'on ne peut plus jouer dans les cases vides de la sous-grille 0 même en coup libre
    const freeState = makeCustomState({
      ...res.state,
      activeBoard: null,
      isFreeMove: true,
    });
    expect(validateMove(freeState, { boardIndex: 0, cellIndex: 4 })).toBe(
      'SUBBOARD_LOCKED',
    );
    expect(getLegalMoves(freeState).some((m) => m.boardIndex === 0)).toBe(false);
  });

  it('passe une sous-grille pleine sans vainqueur en état draw verrouillé et déclenche un coup libre si ciblée', () => {
    // Sous-grille 5 presque pleine sans alignement pour X
    // X O X
    // X O O
    // O X [X]  -> case 8 manquante -> aucun alignement !
    const boards = Array.from({ length: 9 }, () => makeBoard());
    boards[5] = makeBoard({
      cells: ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', null],
    });

    const state = makeCustomState({
      boards,
      currentPlayer: 'X',
      activeBoard: 5,
    });

    // X joue (5, 8) -> sous-grille 5 devient nulle et verrouillée, renvoi en 8
    const r1 = applyMove(state, { boardIndex: 5, cellIndex: 8 });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    expect(r1.capturedBoard).toBe(false);
    expect(r1.state.boards[5].status).toBe('draw');
    expect(r1.state.boards[5].winner).toBeNull();
    expect(r1.state.activeBoard).toBe(8);
    expect(r1.state.isFreeMove).toBe(false);

    // O joue (8, 5) -> renvoie X vers la sous-grille 5 (qui est en égalité locale) => Coup libre !
    const r2 = applyMove(r1.state, { boardIndex: 8, cellIndex: 5 });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    expect(r2.triggeredFreeMove).toBe(true);
    expect(r2.state.activeBoard).toBeNull();
    expect(r2.state.isFreeMove).toBe(true);
    expect(r2.state.redirectedFromBoard).toBe(5);
    expect(validateMove(r2.state, { boardIndex: 5, cellIndex: 0 })).toBe(
      'SUBBOARD_LOCKED',
    );
    expect(isValidMove(r2.state, { boardIndex: 3, cellIndex: 4 })).toBe(true);
  });

  it('accorde un coup libre lorsque la sous-grille ciblée est déjà gagnée', () => {
    const boards = Array.from({ length: 9 }, () => makeBoard());
    boards[2] = makeBoard({
      cells: ['X', 'X', 'X', 'O', 'O', null, null, null, null],
      status: 'X',
      winner: 'X',
      winLine: [0, 1, 2],
    });

    const state = makeCustomState({
      boards,
      currentPlayer: 'O',
      activeBoard: 4,
    });

    const res = applyMove(state, { boardIndex: 4, cellIndex: 2 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.triggeredFreeMove).toBe(true);
    expect(res.state.activeBoard).toBeNull();
    expect(res.state.isFreeMove).toBe(true);
    expect(res.state.redirectedFromBoard).toBe(2);
    expect(isValidMove(res.state, { boardIndex: 7, cellIndex: 7 })).toBe(true);
  });

  it('accorde immédiatement un coup libre sur auto-capture de la sous-grille de destination', () => {
    // X joue (4, 4) et capture la sous-grille 4 à ce moment précis -> O a coup libre
    const boards = Array.from({ length: 9 }, () => makeBoard());
    boards[4] = makeBoard({
      cells: ['X', null, null, null, null, null, null, null, 'X'],
    });

    const state = makeCustomState({
      boards,
      currentPlayer: 'X',
      activeBoard: 4,
    });

    const res = applyMove(state, { boardIndex: 4, cellIndex: 4 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.capturedBoard).toBe(true);
    expect(res.triggeredFreeMove).toBe(true);
    expect(res.state.activeBoard).toBeNull();
    expect(res.state.isFreeMove).toBe(true);
    expect(res.state.redirectedFromBoard).toBe(4);
  });

  it('détecte la victoire globale dès qu’un joueur aligne 3 sous-grilles et bloque la suite', () => {
    const boards = Array.from({ length: 9 }, () => makeBoard());
    boards[0] = makeBoard({ status: 'X', winner: 'X', winLine: [0, 1, 2] });
    boards[4] = makeBoard({ status: 'X', winner: 'X', winLine: [3, 4, 5] });
    boards[8] = makeBoard({
      cells: ['X', null, null, null, 'X', null, null, null, null],
    });

    const state = makeCustomState({
      boards,
      currentPlayer: 'X',
      activeBoard: 8,
    });

    const res = applyMove(state, { boardIndex: 8, cellIndex: 8 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.state.status).toBe('won');
    expect(res.state.winner).toBe('X');
    expect(res.state.winLine).toEqual([0, 4, 8]);
    expect(res.state.activeBoard).toBeNull();
    expect(res.state.isFreeMove).toBe(false);
    expect(getLegalMoves(res.state)).toHaveLength(0);
    expect(validateMove(res.state, { boardIndex: 1, cellIndex: 0 })).toBe('GAME_OVER');
  });

  it('détecte le match nul global quand plus aucune sous-grille active et aucun alignement', () => {
    // Répartition globale sans aucun alignement de 3 :
    // X O X
    // O O X
    // X [active->draw] O
    const boards: SubBoardState[] = [
      makeBoard({ status: 'X', winner: 'X', winLine: [0, 1, 2] }),
      makeBoard({ status: 'O', winner: 'O', winLine: [0, 1, 2] }),
      makeBoard({ status: 'X', winner: 'X', winLine: [0, 1, 2] }),
      makeBoard({ status: 'O', winner: 'O', winLine: [0, 1, 2] }),
      makeBoard({ status: 'O', winner: 'O', winLine: [0, 1, 2] }),
      makeBoard({ status: 'X', winner: 'X', winLine: [0, 1, 2] }),
      makeBoard({ status: 'X', winner: 'X', winLine: [0, 1, 2] }),
      makeBoard({
        cells: ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', null],
      }),
      makeBoard({ status: 'O', winner: 'O', winLine: [0, 1, 2] }),
    ];

    const state = makeCustomState({
      boards,
      currentPlayer: 'X',
      activeBoard: 7,
    });

    const res = applyMove(state, { boardIndex: 7, cellIndex: 8 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.state.boards[7].status).toBe('draw');
    expect(res.state.status).toBe('draw');
    expect(res.state.winner).toBeNull();
    expect(res.state.winLine).toBeNull();
    expect(getLegalMoves(res.state)).toHaveLength(0);
  });

  it('calcule correctement le projecteur de destination et préserve l’immutabilité', () => {
    const boards = Array.from({ length: 9 }, () => makeBoard());
    boards[2] = makeBoard({ status: 'X', winner: 'X', winLine: [0, 1, 2] });
    const state = makeCustomState({
      boards,
      currentPlayer: 'O',
      activeBoard: 4,
    });

    const snapshotBefore = JSON.stringify(state);

    // Renvoi standard vers 6
    const p1 = getDestinationPreview(state, { boardIndex: 4, cellIndex: 6 });
    expect(p1).toEqual({
      targetBoard: 6,
      willBeFreeMove: false,
      isSelfRedirect: false,
      willCaptureBoard: false,
      willWinGame: false,
    });

    // Auto-renvoi sur la même sous-grille 4
    const pSelf = getDestinationPreview(state, { boardIndex: 4, cellIndex: 4 });
    expect(pSelf).toEqual({
      targetBoard: 4,
      willBeFreeMove: false,
      isSelfRedirect: true,
      willCaptureBoard: false,
      willWinGame: false,
    });

    // Renvoi vers une sous-grille déjà verrouillée (2) -> coup libre adverse
    const pFree = getDestinationPreview(state, { boardIndex: 4, cellIndex: 2 });
    expect(pFree).toEqual({
      targetBoard: 2,
      willBeFreeMove: true,
      isSelfRedirect: false,
      willCaptureBoard: false,
      willWinGame: false,
    });

    // Coup illégal -> null
    expect(getDestinationPreview(state, { boardIndex: 0, cellIndex: 0 })).toBeNull();

    // L'état d'origine est intact
    expect(JSON.stringify(state)).toBe(snapshotBefore);
  });
});
