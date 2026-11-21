import { WIN_LINES, type GameState } from '@shared/gameEngine';

/** Niveau de tension dramatique du grand plateau. */
export type BoardTension = 'calm' | 'heated' | 'match-point';

/**
 * Évalue la tension actuelle de la partie à partir des 9 zones du grand plateau :
 * - `'match-point'` : au moins une ligne gagnante comporte 2 zones prises par
 *   un même joueur et la 3e zone encore `'active'` ;
 * - `'heated'` : au moins 3 zones sont capturées au total, ou un joueur en
 *   détient déjà au moins 2 ;
 * - `'calm'` : début de partie ou équilibre encore ouvert.
 */
export function getBoardTension(gameState: GameState): BoardTension {
  const { boards } = gameState;

  for (const [a, b, c] of WIN_LINES) {
    let xCount = 0;
    let oCount = 0;
    let activeCount = 0;

    for (const index of [a, b, c]) {
      const status = boards[index]?.status;
      if (status === 'X') {
        xCount += 1;
      } else if (status === 'O') {
        oCount += 1;
      } else if (status === 'active') {
        activeCount += 1;
      }
    }

    if (activeCount === 1 && (xCount === 2 || oCount === 2)) {
      return 'match-point';
    }
  }

  let capturedX = 0;
  let capturedO = 0;
  for (const board of boards) {
    if (board.status === 'X') {
      capturedX += 1;
    } else if (board.status === 'O') {
      capturedO += 1;
    }
  }

  if (capturedX + capturedO >= 3 || capturedX >= 2 || capturedO >= 2) {
    return 'heated';
  }

  return 'calm';
}
