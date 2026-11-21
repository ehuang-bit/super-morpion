import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import {
  getDestinationPreview,
  type DestinationPreview,
  type GameState,
  type Move,
  type WinLine,
} from '@shared/gameEngine';
import {
  DEFAULT_BOARD_PREFS,
  type BoardPreferences,
} from '../types/boardPrefs';
import { SMOOTH_EASE } from '../utils/motion';
import { BoardFx } from './BoardFx';
import { SubBoard } from './SubBoard';

interface GlobalBoardProps {
  gameState: GameState;
  canInteract: boolean;
  boardPrefs?: BoardPreferences;
  variant?: 'lobby' | 'arena';
  onPlayMove: (move: Move) => void;
  onPreviewChange?: (preview: DestinationPreview | null, hoveredMove: Move | null) => void;
}

function getGlobalWinCoords(winLine: WinLine) {
  const center = (idx: number) => {
    const row = Math.floor(idx / 3);
    const col = idx % 3;
    return {
      x: 49 + col * 101,
      y: 49 + row * 101,
    };
  };
  const start = center(winLine[0]);
  const end = center(winLine[2]);
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

export function GlobalBoard({
  gameState,
  canInteract,
  boardPrefs = DEFAULT_BOARD_PREFS,
  variant = 'lobby',
  onPlayMove,
  onPreviewChange,
}: GlobalBoardProps) {
  const [hoveredMove, setHoveredMove] = useState<Move | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);

  // Track cells & board captures present on mount vs added live, so reconnects never replay old animations
  const seenMovesRef = useRef<Set<string> | null>(null);
  const prevBoardStatusesRef = useRef<string[] | null>(null);

  if (seenMovesRef.current === null) {
    const initialMoves = new Set<string>();
    gameState.boards.forEach((b, bIdx) => {
      b.cells.forEach((cell, cIdx) => {
        if (cell !== null) {
          initialMoves.add(`${bIdx}-${cIdx}`);
        }
      });
    });
    seenMovesRef.current = initialMoves;
    prevBoardStatusesRef.current = gameState.boards.map((b) => b.status);
  }

  const newlyAddedCells = useMemo(() => {
    const animateSet = new Set<string>();
    const seen = seenMovesRef.current!;

    if (gameState.moveHistory.length === 0) {
      seen.clear();
      return animateSet;
    }

    gameState.boards.forEach((b, bIdx) => {
      b.cells.forEach((cell, cIdx) => {
        const key = `${bIdx}-${cIdx}`;
        if (cell !== null && !seen.has(key)) {
          animateSet.add(key);
        }
      });
    });
    return animateSet;
  }, [gameState]);

  const newlyCapturedBoards = useMemo(() => {
    const capturedSet = new Set<number>();
    const prevStatuses = prevBoardStatusesRef.current!;
    gameState.boards.forEach((b, bIdx) => {
      if (prevStatuses[bIdx] === 'active' && b.status !== 'active') {
        capturedSet.add(bIdx);
      }
    });
    return capturedSet;
  }, [gameState]);

  useEffect(() => {
    const nextSeen = new Set<string>();
    gameState.boards.forEach((b, bIdx) => {
      b.cells.forEach((cell, cIdx) => {
        if (cell !== null) nextSeen.add(`${bIdx}-${cIdx}`);
      });
    });
    seenMovesRef.current = nextSeen;
    prevBoardStatusesRef.current = gameState.boards.map((b) => b.status);
  }, [gameState]);

  // Clear hover whenever turn/interaction changes
  useEffect(() => {
    setHoveredMove(null);
    onPreviewChange?.(null, null);
  }, [gameState.moveHistory.length, canInteract, onPreviewChange]);

  const destinationPreview = useMemo(() => {
    if (
      !boardPrefs.showProjector ||
      !hoveredMove ||
      !canInteract ||
      gameState.status !== 'playing'
    ) {
      return null;
    }
    return getDestinationPreview(gameState, hoveredMove);
  }, [gameState, hoveredMove, canInteract, boardPrefs.showProjector]);

  const handleHoverMove = (move: Move | null) => {
    if (!boardPrefs.showProjector) {
      setHoveredMove(null);
      onPreviewChange?.(null, null);
      return;
    }
    setHoveredMove(move);
    if (!move || !canInteract || gameState.status !== 'playing') {
      onPreviewChange?.(null, null);
      return;
    }
    const preview = getDestinationPreview(gameState, move);
    onPreviewChange?.(preview, move);
  };

  const isGameOver = gameState.status !== 'playing';
  const shellRadius =
    boardPrefs.boardShape === 'strict' ? 'rounded-[6px]' : 'rounded-[16px]';
  const materialClass =
    boardPrefs.boardMaterial === 'gravure' ? 'board-material-gravure' : '';

  const arenaClass = variant === 'arena' ? 'board-shell-arena' : '';

  return (
    <div
      ref={shellRef}
      className={`board-shell ${arenaClass} relative mx-auto box-border overflow-hidden ${shellRadius} ${materialClass} p-2 sm:p-2.5 transition-[border-radius] duration-200`}
      style={{
        backgroundColor: 'var(--bg-recessed)',
        border: '1px solid var(--border-main)',
        boxShadow: 'var(--shadow-board)',
      }}
      onPointerLeave={() => handleHoverMove(null)}
    >
      <LayoutGroup id="super-morpion-board">
        <div className="grid grid-cols-3 grid-rows-3 w-full h-full min-h-0 min-w-0 gap-1.5 sm:gap-2">
          {gameState.boards.map((subBoard, boardIndex) => {
            const isActiveTarget =
              !isGameOver &&
              gameState.activeBoard === boardIndex &&
              subBoard.status === 'active';
            const isAnyBoardOpen =
              !isGameOver &&
              gameState.activeBoard === null &&
              subBoard.status === 'active';

            const lastMoveCell =
              gameState.lastMove?.boardIndex === boardIndex
                ? gameState.lastMove.cellIndex
                : null;

            const hoveredCell =
              hoveredMove?.boardIndex === boardIndex ? hoveredMove.cellIndex : null;

            return (
              <SubBoard
                key={boardIndex}
                boardIndex={boardIndex}
                subBoard={subBoard}
                currentPlayer={gameState.currentPlayer}
                canInteract={canInteract}
                isActiveTarget={isActiveTarget}
                isAnyBoardOpen={isAnyBoardOpen}
                isFreeMovePhase={gameState.isFreeMove && !isGameOver}
                isGameOver={isGameOver}
                lastMoveCell={lastMoveCell}
                hoveredCell={hoveredCell}
                destinationPreview={destinationPreview}
                animateCells={newlyAddedCells}
                animateCapture={newlyCapturedBoards.has(boardIndex)}
                boardPrefs={boardPrefs}
                onPlayMove={onPlayMove}
                onHoverMove={handleHoverMove}
              />
            );
          })}
        </div>
      </LayoutGroup>

      <BoardFx
        shellRef={shellRef}
        gameState={gameState}
        strictCorners={boardPrefs.boardShape === 'strict'}
      />

      {/* Global Victory Alignment Line */}
      {gameState.status === 'won' && gameState.winLine && gameState.winner && (
        <svg
          viewBox="0 0 300 300"
          className="pointer-events-none absolute inset-0 z-40 w-full h-full p-2 sm:p-2.5"
          aria-hidden="true"
        >
          {(() => {
            const coords = getGlobalWinCoords(gameState.winLine);
            const strokeColor =
              gameState.winner === 'X' ? 'var(--x-color)' : 'var(--o-color)';
            return (
              <>
                <motion.line
                  x1={coords.x1}
                  y1={coords.y1}
                  x2={coords.x2}
                  y2={coords.y2}
                  stroke={strokeColor}
                  strokeWidth="17"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={100}
                  initial={{ strokeDashoffset: 100, opacity: 0 }}
                  animate={{ strokeDashoffset: 0, opacity: 0.2 }}
                  transition={{ duration: 0.8, delay: 0.1, ease: SMOOTH_EASE }}
                />
                <motion.line
                  x1={coords.x1}
                  y1={coords.y1}
                  x2={coords.x2}
                  y2={coords.y2}
                  stroke={strokeColor}
                  strokeWidth="10"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={100}
                  initial={{ strokeDashoffset: 100, opacity: 0.4 }}
                  animate={{ strokeDashoffset: 0, opacity: 0.94 }}
                  transition={{ duration: 0.8, delay: 0.1, ease: SMOOTH_EASE }}
                />
              </>
            );
          })()}
        </svg>
      )}
    </div>
  );
}
