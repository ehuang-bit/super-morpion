import { AnimatePresence, motion } from 'framer-motion';
import {
  BOARD_COORDS,
  type DestinationPreview,
  type Move,
  type Player,
  type SubBoardState,
  type WinLine,
} from '@shared/gameEngine';
import type { BoardPreferences } from '../types/boardPrefs';
import {
  CAPTURE_SPRING,
  FOCUS_SPRING,
  PLACE_SPRING,
  PROJECTOR_SPRING,
  SMOOTH_EASE,
  STAMP_SPRING,
} from '../utils/motion';
import { SymbolMark } from './Symbols';

interface SubBoardProps {
  boardIndex: number;
  subBoard: SubBoardState;
  currentPlayer: Player;
  canInteract: boolean;
  isActiveTarget: boolean;
  isAnyBoardOpen: boolean;
  isFreeMovePhase: boolean;
  isGameOver: boolean;
  lastMoveCell: number | null;
  hoveredCell: number | null;
  /** Case conseillée à mettre en évidence (tutoriel). */
  hintCell?: number | null;
  destinationPreview: DestinationPreview | null;
  animateCells: Set<string>;
  animateCapture: boolean;
  boardPrefs: BoardPreferences;
  onPlayMove: (move: Move) => void;
  onHoverMove: (move: Move | null) => void;
}

function getLocalWinCoords(winLine: WinLine) {
  const center = (idx: number) => {
    const row = Math.floor(idx / 3);
    const col = idx % 3;
    return {
      x: 16.5 + col * 33.5,
      y: 16.5 + row * 33.5,
    };
  };
  const start = center(winLine[0]);
  const end = center(winLine[2]);
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

export function SubBoard({
  boardIndex,
  subBoard,
  currentPlayer,
  canInteract,
  isActiveTarget,
  isAnyBoardOpen,
  isFreeMovePhase,
  isGameOver,
  lastMoveCell,
  hoveredCell,
  hintCell = null,
  destinationPreview,
  animateCells,
  animateCapture,
  boardPrefs,
  onPlayMove,
  onHoverMove,
}: SubBoardProps) {
  const isLocked = subBoard.status !== 'active';
  const isPlayableBoard =
    !isGameOver && !isLocked && canInteract && (isActiveTarget || isAnyBoardOpen);
  const isFocusedBoard =
    !isGameOver && !isLocked && (isActiveTarget || isAnyBoardOpen);
  const isDimmed = !isGameOver && !isLocked && !isFocusedBoard;

  const isDestinationTarget =
    boardPrefs.showProjector &&
    destinationPreview !== null &&
    destinationPreview.targetBoard === boardIndex;

  const isStrict = boardPrefs.boardShape === 'strict';
  const subRadius = isStrict ? 'rounded-[4px]' : 'rounded-[10px]';
  const ringRadius = isStrict ? 'rounded-[5px]' : 'rounded-[11px]';
  const cellRadius = isStrict ? 'rounded-[2px]' : 'rounded-[5px]';

  // Zone verrouillée : les petites pièces s'estompent, en cascade depuis la
  // case qui vient d'être jouée quand la prise a lieu en direct.
  const lockedOpacity =
    subBoard.status === 'X' || subBoard.status === 'O'
      ? 0.2
      : subBoard.status === 'draw'
        ? 0.3
        : 1;
  const cascadeDelay = (cellIndex: number): number => {
    if (!animateCapture || lastMoveCell === null) return 0;
    const distance =
      Math.abs(Math.floor(cellIndex / 3) - Math.floor(lastMoveCell / 3)) +
      Math.abs((cellIndex % 3) - (lastMoveCell % 3));
    return 120 + distance * 60;
  };

  let containerBg =
    boardPrefs.boardMaterial === 'damier' && boardIndex % 2 === 1
      ? 'var(--bg-surface)'
      : 'var(--bg-board)';
  let containerBorder = 'var(--border-main)';

  if (subBoard.status === 'X') {
    containerBg = 'var(--x-surface)';
    containerBorder = 'var(--x-color)';
  } else if (subBoard.status === 'O') {
    containerBg = 'var(--o-surface)';
    containerBorder = 'var(--o-color)';
  } else if (subBoard.status === 'draw') {
    containerBg = 'var(--draw-surface)';
    containerBorder = 'var(--border-strong)';
  }

  return (
    <div
      data-board-index={boardIndex}
      className={`subboard-shell relative w-full h-full min-h-0 min-w-0 box-border ${subRadius} p-1 sm:p-1.5 select-none ${
        isDimmed ? 'opacity-70' : 'opacity-100'
      }`}
      style={{
        backgroundColor: containerBg,
        border: `1px solid ${
          subBoard.status === 'X' || subBoard.status === 'O'
            ? `color-mix(in srgb, ${containerBorder} 35%, transparent)`
            : containerBorder
        }`,
      }}
    >
      {/* Subtle architectural coordinate label */}
      {boardPrefs.showCoords && (
        <span
          className="pointer-events-none absolute top-0.5 left-1 z-10 font-mono text-[9px] leading-none tracking-tight opacity-45"
          style={{ color: 'var(--text-muted)' }}
        >
          {BOARD_COORDS[boardIndex]}
        </span>
      )}

      {/* Active sub-board spring-gliding focus ring */}
      {!isGameOver && isActiveTarget && !isFreeMovePhase && !isLocked && (
        <motion.div
          layoutId="active-subboard-frame"
          transition={FOCUS_SPRING}
          className={`pointer-events-none absolute -inset-[2px] z-20 ${ringRadius}`}
          style={{
            border: '2.5px solid var(--accent-active)',
            boxShadow: 'var(--shadow-active)',
          }}
        />
      )}

      {/* Free move cue on every active sub-board */}
      {!isGameOver && isFreeMovePhase && !isLocked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.42 }}
          transition={{ duration: 0.24, ease: SMOOTH_EASE }}
          className={`pointer-events-none absolute -inset-[1.5px] z-20 ${ringRadius}`}
          style={{
            border: '2px solid var(--accent-active)',
            backgroundColor: 'var(--accent-active-bg)',
          }}
        />
      )}

      {/* Gliding Hover Destination Projector */}
      {isDestinationTarget && destinationPreview && (
        <motion.div
          layoutId="destination-projector"
          transition={PROJECTOR_SPRING}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`pointer-events-none absolute -inset-[2px] z-30 ${ringRadius} flex items-start justify-end p-1`}
          style={{
            border: destinationPreview.willBeFreeMove
              ? '2px dashed var(--danger-color)'
              : '2px dashed var(--accent-active)',
            backgroundColor: destinationPreview.willBeFreeMove
              ? 'var(--danger-bg)'
              : 'var(--accent-active-bg)',
          }}
        >
          <span
            className="rounded px-1 py-0.5 font-mono text-[9px] font-medium leading-none shadow-sm"
            style={{
              backgroundColor: 'var(--bg-board)',
              color: destinationPreview.willBeFreeMove
                ? 'var(--danger-color)'
                : 'var(--accent-active-text)',
              border: `1px solid ${
                destinationPreview.willBeFreeMove
                  ? 'var(--danger-color)'
                  : 'var(--accent-active)'
              }`,
            }}
          >
            {destinationPreview.willBeFreeMove
              ? 'Coup libre →'
              : destinationPreview.isSelfRedirect
                ? '↻ Même zone'
                : `→ ${BOARD_COORDS[boardIndex]}`}
          </span>
        </motion.div>
      )}

      {/* 3x3 Cells Grid */}
      <div
        className={`grid grid-cols-3 grid-rows-3 w-full h-full min-h-0 min-w-0 gap-[3px] sm:gap-1 ${
          isLocked ? 'pointer-events-none' : ''
        }`}
      >
        {subBoard.cells.map((cellValue, cellIndex) => {
          const isLastMove = lastMoveCell === cellIndex;
          const isPlayableCell = isPlayableBoard && cellValue === null;
          const isHovered =
            boardPrefs.showProjector && isPlayableCell && hoveredCell === cellIndex;
          const cellKey = `${boardIndex}-${cellIndex}`;
          const shouldAnimate = animateCells.has(cellKey);

          return (
            <button
              key={cellIndex}
              type="button"
              disabled={!isPlayableCell}
              aria-label={`Zone ${BOARD_COORDS[boardIndex]}, case ${BOARD_COORDS[cellIndex]}${
                cellValue ? `, occupée par ${cellValue}` : ''
              }`}
              data-cell-index={cellIndex}
              onClick={() => {
                if (!isPlayableCell) return;
                onHoverMove(null);
                onPlayMove({ boardIndex, cellIndex });
              }}
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse' && isPlayableCell) {
                  onHoverMove({ boardIndex, cellIndex });
                }
              }}
              onPointerLeave={() => {
                if (hoveredCell === cellIndex) {
                  onHoverMove(null);
                }
              }}
              className={`board-cell relative block w-full h-full min-h-0 min-w-0 overflow-hidden p-0 box-border ${cellRadius} ${
                isPlayableCell
                  ? 'board-cell-playable cursor-pointer'
                  : 'cursor-default'
              }`}
              style={{
                backgroundColor: isLastMove
                  ? 'var(--accent-active-bg)'
                  : 'var(--bg-surface)',
                border: `1px solid ${
                  isLastMove ? 'var(--accent-active)' : 'var(--border-cell)'
                }`,
                ...(isLocked
                  ? {
                      opacity: lockedOpacity,
                      transition: 'opacity 320ms ease',
                      transitionDelay: `${cascadeDelay(cellIndex)}ms`,
                    }
                  : {}),
              }}
            >
              <span className="pointer-events-none absolute inset-[15%] flex items-center justify-center">
                {cellValue !== null ? (
                  shouldAnimate ? (
                    // Pose : la pièce arrive un peu grande et inclinée, puis se cale
                    <motion.div
                      className="w-full h-full"
                      initial={{ scale: 1.5, rotate: cellValue === 'X' ? -9 : 0 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={PLACE_SPRING}
                    >
                      <SymbolMark
                        player={cellValue}
                        size="cell"
                        pieceStyle={boardPrefs.pieceStyle}
                        animate
                      />
                    </motion.div>
                  ) : (
                    <SymbolMark
                      player={cellValue}
                      size="cell"
                      pieceStyle={boardPrefs.pieceStyle}
                      animate={false}
                    />
                  )
                ) : (
                  <AnimatePresence>
                    {isHovered && (
                      <motion.div
                        key="ghost"
                        initial={{ opacity: 0, scale: 0.84 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.88 }}
                        transition={{ duration: 0.14, ease: SMOOTH_EASE }}
                        className="w-full h-full"
                      >
                        <SymbolMark
                          player={currentPlayer}
                          size="cell"
                          pieceStyle={boardPrefs.pieceStyle}
                          ghost
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </span>

              {hintCell === cellIndex && cellValue === null && (
                <span
                  aria-hidden="true"
                  className="hint-pulse pointer-events-none absolute inset-[7%] rounded-[inherit]"
                />
              )}

              {isLastMove && (
                <motion.span
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2, ease: SMOOTH_EASE }}
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-[3px] right-[3px] w-1 h-1 rounded-full"
                  style={{ backgroundColor: 'var(--accent-active)' }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Captured Sub-Board Overlay (X or O) */}
      {(subBoard.status === 'X' || subBoard.status === 'O') && (
        <motion.div
          // Tampon : le grand symbole tombe de haut et s'écrase sur la zone
          initial={animateCapture ? { scale: 2.7, opacity: 0, rotate: -12 } : false}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={animateCapture ? { ...STAMP_SPRING, delay: 0.12 } : CAPTURE_SPRING}
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-[18%]"
        >
          {subBoard.winLine && (
            <svg
              viewBox="0 0 100 100"
              className="absolute inset-0 w-full h-full opacity-35"
              aria-hidden="true"
            >
              {(() => {
                const coords = getLocalWinCoords(subBoard.winLine);
                const lineColor =
                  subBoard.status === 'X' ? 'var(--x-color)' : 'var(--o-color)';
                return animateCapture ? (
                  <motion.line
                    x1={coords.x1}
                    y1={coords.y1}
                    x2={coords.x2}
                    y2={coords.y2}
                    stroke={lineColor}
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    pathLength={100}
                    strokeDasharray={100}
                    initial={{ strokeDashoffset: 100, opacity: 0.4 }}
                    animate={{ strokeDashoffset: 0, opacity: 1 }}
                    transition={{ duration: 0.34, delay: 0.3, ease: SMOOTH_EASE }}
                  />
                ) : (
                  <line
                    x1={coords.x1}
                    y1={coords.y1}
                    x2={coords.x2}
                    y2={coords.y2}
                    stroke={lineColor}
                    strokeWidth="4.5"
                    strokeLinecap="round"
                  />
                );
              })()}
            </svg>
          )}
          <SymbolMark
            player={subBoard.status}
            size="captured"
            pieceStyle={boardPrefs.pieceStyle}
            animate={false}
          />
        </motion.div>
      )}

      {/* Local Draw Lock Overlay */}
      {subBoard.status === 'draw' && (
        <motion.div
          initial={animateCapture ? { scale: 0.9, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={CAPTURE_SPRING}
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <span
            className="rounded-md px-2 py-0.5 font-mono text-[11px] font-medium tracking-tight"
            style={{
              backgroundColor: 'var(--bg-board)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-strong)',
            }}
          >
            Nul
          </span>
        </motion.div>
      )}
    </div>
  );
}
