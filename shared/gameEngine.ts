export type Player = 'X' | 'O';
export type CellValue = Player | null;
export type SubBoardStatus = 'active' | 'X' | 'O' | 'draw';
export type WinLine = [number, number, number];

export interface SubBoardState {
  cells: CellValue[];
  status: SubBoardStatus;
  winner: Player | null;
  winLine: WinLine | null;
}

export interface Move {
  boardIndex: number;
  cellIndex: number;
}

export interface MoveRecord {
  boardIndex: number;
  cellIndex: number;
  player: Player;
  moveNumber: number;
  capturedBoard: boolean;
  triggeredFreeMove: boolean;
}

export type GameStatus = 'playing' | 'won' | 'draw';

export interface GameState {
  boards: SubBoardState[];
  currentPlayer: Player;
  startingPlayer: Player;
  activeBoard: number | null;
  isFreeMove: boolean;
  redirectedFromBoard: number | null;
  status: GameStatus;
  winner: Player | null;
  winLine: WinLine | null;
  lastMove: {
    boardIndex: number;
    cellIndex: number;
    player: Player;
  } | null;
  moveHistory: MoveRecord[];
}

export type MoveErrorCode =
  | 'GAME_OVER'
  | 'NOT_YOUR_TURN'
  | 'OUT_OF_BOUNDS'
  | 'WRONG_SUBBOARD'
  | 'SUBBOARD_LOCKED'
  | 'CELL_OCCUPIED';

export type ApplyMoveResult =
  | {
      ok: true;
      state: GameState;
      capturedBoard: boolean;
      triggeredFreeMove: boolean;
    }
  | {
      ok: false;
      error: MoveErrorCode;
    };

export interface DestinationPreview {
  targetBoard: number;
  willBeFreeMove: boolean;
  isSelfRedirect: boolean;
  willCaptureBoard: boolean;
  willWinGame: boolean;
}

export const WIN_LINES: readonly WinLine[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const BOARD_COORDS: readonly string[] = [
  'A1',
  'B1',
  'C1',
  'A2',
  'B2',
  'C2',
  'A3',
  'B3',
  'C3',
];

export function getOpponent(player: Player): Player {
  return player === 'X' ? 'O' : 'X';
}

function createEmptySubBoard(): SubBoardState {
  return {
    cells: Array<CellValue>(9).fill(null),
    status: 'active',
    winner: null,
    winLine: null,
  };
}

export function createInitialState(startingPlayer: Player = 'X'): GameState {
  return {
    boards: Array.from({ length: 9 }, () => createEmptySubBoard()),
    currentPlayer: startingPlayer,
    startingPlayer,
    activeBoard: null,
    isFreeMove: false,
    redirectedFromBoard: null,
    status: 'playing',
    winner: null,
    winLine: null,
    lastMove: null,
    moveHistory: [],
  };
}

export function checkLineWin(
  cells: readonly (Player | null)[],
): { winner: Player; winLine: WinLine } | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const first = cells[a];
    if (first !== null && first === cells[b] && first === cells[c]) {
      return {
        winner: first,
        winLine: [a, b, c],
      };
    }
  }
  return null;
}

export function validateMove(
  state: GameState,
  move: Move,
  expectedPlayer?: Player,
): MoveErrorCode | null {
  if (state.status !== 'playing') {
    return 'GAME_OVER';
  }

  if (expectedPlayer !== undefined && expectedPlayer !== state.currentPlayer) {
    return 'NOT_YOUR_TURN';
  }

  if (
    !Number.isInteger(move.boardIndex) ||
    !Number.isInteger(move.cellIndex) ||
    move.boardIndex < 0 ||
    move.boardIndex > 8 ||
    move.cellIndex < 0 ||
    move.cellIndex > 8
  ) {
    return 'OUT_OF_BOUNDS';
  }

  if (state.activeBoard !== null && state.activeBoard !== move.boardIndex) {
    return 'WRONG_SUBBOARD';
  }

  const targetBoard = state.boards[move.boardIndex];
  if (targetBoard.status !== 'active') {
    return 'SUBBOARD_LOCKED';
  }

  if (targetBoard.cells[move.cellIndex] !== null) {
    return 'CELL_OCCUPIED';
  }

  return null;
}

export function isValidMove(
  state: GameState,
  move: Move,
  expectedPlayer?: Player,
): boolean {
  return validateMove(state, move, expectedPlayer) === null;
}

export function getLegalMoves(state: GameState): Move[] {
  if (state.status !== 'playing') {
    return [];
  }

  const moves: Move[] = [];
  const candidateBoards =
    state.activeBoard !== null ? [state.activeBoard] : [0, 1, 2, 3, 4, 5, 6, 7, 8];

  for (const boardIndex of candidateBoards) {
    const board = state.boards[boardIndex];
    if (board.status !== 'active') continue;

    for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
      if (board.cells[cellIndex] === null) {
        moves.push({ boardIndex, cellIndex });
      }
    }
  }

  return moves;
}

export function applyMove(
  state: GameState,
  move: Move,
  expectedPlayer?: Player,
): ApplyMoveResult {
  const error = validateMove(state, move, expectedPlayer);
  if (error !== null) {
    return { ok: false, error };
  }

  const player = state.currentPlayer;
  const { boardIndex, cellIndex } = move;

  const nextBoards: SubBoardState[] = state.boards.map((board, index) => {
    const clonedCells = [...board.cells];
    if (index !== boardIndex) {
      return {
        ...board,
        cells: clonedCells,
        winLine: board.winLine ? ([...board.winLine] as WinLine) : null,
      };
    }

    clonedCells[cellIndex] = player;
    const localWin = checkLineWin(clonedCells);
    if (localWin) {
      return {
        cells: clonedCells,
        status: localWin.winner,
        winner: localWin.winner,
        winLine: localWin.winLine,
      };
    }

    if (clonedCells.every((cell) => cell !== null)) {
      return {
        cells: clonedCells,
        status: 'draw',
        winner: null,
        winLine: null,
      };
    }

    return {
      cells: clonedCells,
      status: 'active',
      winner: null,
      winLine: null,
    };
  });

  const capturedBoard =
    state.boards[boardIndex].status === 'active' &&
    nextBoards[boardIndex].status === player;

  const globalWinners = nextBoards.map((board) => board.winner);
  const globalWin = checkLineWin(globalWinners);

  let nextStatus: GameStatus = 'playing';
  let nextWinner: Player | null = null;
  let nextWinLine: WinLine | null = null;
  let nextActiveBoard: number | null = null;
  let nextIsFreeMove = false;
  let nextRedirectedFromBoard: number | null = null;
  let triggeredFreeMove = false;

  if (globalWin) {
    nextStatus = 'won';
    nextWinner = globalWin.winner;
    nextWinLine = globalWin.winLine;
  } else if (!nextBoards.some((board) => board.status === 'active')) {
    nextStatus = 'draw';
  } else if (nextBoards[cellIndex].status === 'active') {
    nextActiveBoard = cellIndex;
  } else {
    nextActiveBoard = null;
    nextIsFreeMove = true;
    nextRedirectedFromBoard = cellIndex;
    triggeredFreeMove = true;
  }

  const nextHistory: MoveRecord[] = [
    ...state.moveHistory,
    {
      boardIndex,
      cellIndex,
      player,
      moveNumber: state.moveHistory.length + 1,
      capturedBoard,
      triggeredFreeMove,
    },
  ];

  const nextState: GameState = {
    boards: nextBoards,
    currentPlayer: getOpponent(player),
    startingPlayer: state.startingPlayer,
    activeBoard: nextActiveBoard,
    isFreeMove: nextIsFreeMove,
    redirectedFromBoard: nextRedirectedFromBoard,
    status: nextStatus,
    winner: nextWinner,
    winLine: nextWinLine,
    lastMove: {
      boardIndex,
      cellIndex,
      player,
    },
    moveHistory: nextHistory,
  };

  return {
    ok: true,
    state: nextState,
    capturedBoard,
    triggeredFreeMove,
  };
}

export function getDestinationPreview(
  state: GameState,
  move: Move,
): DestinationPreview | null {
  const result = applyMove(state, move);
  if (!result.ok) {
    return null;
  }

  const { state: nextState, capturedBoard } = result;
  return {
    targetBoard: move.cellIndex,
    willBeFreeMove: nextState.isFreeMove,
    isSelfRedirect:
      move.boardIndex === move.cellIndex &&
      !nextState.isFreeMove &&
      nextState.status === 'playing',
    willCaptureBoard: capturedBoard,
    willWinGame: nextState.status === 'won',
  };
}
