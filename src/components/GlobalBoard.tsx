import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'framer-motion';
import {
  BOARD_COORDS,
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
import {
  FOCUS_SPRING,
  PROJECTOR_SPRING,
  SMOOTH_EASE,
} from '../utils/motion';
import { useI18n } from '../i18n';
import { BoardFx } from './BoardFx';
import { SubBoard } from './SubBoard';

interface GlobalBoardProps {
  gameState: GameState;
  canInteract: boolean;
  boardPrefs?: BoardPreferences;
  variant?: 'lobby' | 'arena' | 'preview';
  /** Case mise en évidence (tutoriel). */
  hintMove?: Move | null;
  onPlayMove: (move: Move) => void;
  onPreviewChange?: (preview: DestinationPreview | null, hoveredMove: Move | null) => void;
}

interface SubBoardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Délai de grâce lors du passage du curseur sur l'interstice entre deux cases
 * (ou au-dessus d'une case déjà occupée), afin que le cadre vert glisse
 * d'une zone 3×3 à l'autre sans jamais clignoter ni se réinitialiser.
 */
const HOVER_LEAVE_GRACE_MS = 135;

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

function rectsEqual(a: SubBoardRect[] | null, b: SubBoardRect[]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < b.length; i++) {
    if (
      a[i].x !== b[i].x ||
      a[i].y !== b[i].y ||
      a[i].w !== b[i].w ||
      a[i].h !== b[i].h
    ) {
      return false;
    }
  }
  return true;
}

export function GlobalBoard({
  gameState,
  canInteract,
  boardPrefs = DEFAULT_BOARD_PREFS,
  variant = 'lobby',
  hintMove = null,
  onPlayMove,
  onPreviewChange,
}: GlobalBoardProps) {
  const [hoveredMove, setHoveredMove] = useState<Move | null>(null);
  const [boardRects, setBoardRects] = useState<SubBoardRect[] | null>(null);

  const shellRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const hoveredMoveRef = useRef<Move | null>(null);
  const lastPreviewRef = useRef<DestinationPreview | null>(null);
  const clearHoverTimerRef = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();
  const { t } = useI18n();

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

  const cancelHoverClear = useCallback(() => {
    if (clearHoverTimerRef.current !== null) {
      window.clearTimeout(clearHoverTimerRef.current);
      clearHoverTimerRef.current = null;
    }
  }, []);

  const clearHoverImmediately = useCallback(() => {
    cancelHoverClear();
    if (hoveredMoveRef.current !== null) {
      hoveredMoveRef.current = null;
      setHoveredMove(null);
      onPreviewChange?.(null, null);
    }
  }, [cancelHoverClear, onPreviewChange]);

  useEffect(() => cancelHoverClear, [cancelHoverClear]);

  // Clear hover whenever turn/interaction/projector preference changes
  useEffect(() => {
    cancelHoverClear();
    hoveredMoveRef.current = null;
    setHoveredMove(null);
    onPreviewChange?.(null, null);
  }, [
    gameState.moveHistory.length,
    canInteract,
    boardPrefs.showProjector,
    cancelHoverClear,
    onPreviewChange,
  ]);

  // Measure the 9 sub-board layout slots relative to gridRef (immune to CSS transforms)
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const measure = () => {
      const next: SubBoardRect[] = [];
      for (let i = 0; i < 9; i++) {
        const el = grid.querySelector<HTMLElement>(`[data-board-index="${i}"]`);
        if (!el) return;
        next.push({
          x: el.offsetLeft,
          y: el.offsetTop,
          w: el.offsetWidth,
          h: el.offsetHeight,
        });
      }
      setBoardRects((prev) => (rectsEqual(prev, next) ? prev : next));
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [variant]);

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

  const handleHoverEnter = useCallback(
    (move: Move) => {
      cancelHoverClear();
      if (!boardPrefs.showProjector || !canInteract || gameState.status !== 'playing') {
        clearHoverImmediately();
        return;
      }
      const prev = hoveredMoveRef.current;
      if (prev && prev.boardIndex === move.boardIndex && prev.cellIndex === move.cellIndex) {
        return;
      }
      hoveredMoveRef.current = move;
      setHoveredMove(move);
      const preview = getDestinationPreview(gameState, move);
      onPreviewChange?.(preview, move);
    },
    [
      boardPrefs.showProjector,
      canInteract,
      gameState,
      cancelHoverClear,
      clearHoverImmediately,
      onPreviewChange,
    ],
  );

  const handleHoverLeave = useCallback(
    (move: Move) => {
      const curr = hoveredMoveRef.current;
      if (!curr || curr.boardIndex !== move.boardIndex || curr.cellIndex !== move.cellIndex) {
        return;
      }
      cancelHoverClear();
      clearHoverTimerRef.current = window.setTimeout(() => {
        clearHoverTimerRef.current = null;
        const latest = hoveredMoveRef.current;
        if (
          latest &&
          latest.boardIndex === move.boardIndex &&
          latest.cellIndex === move.cellIndex
        ) {
          hoveredMoveRef.current = null;
          setHoveredMove(null);
          onPreviewChange?.(null, null);
        }
      }, HOVER_LEAVE_GRACE_MS);
    },
    [cancelHoverClear, onPreviewChange],
  );

  const handlePlayMove = useCallback(
    (move: Move) => {
      clearHoverImmediately();
      onPlayMove(move);
    },
    [clearHoverImmediately, onPlayMove],
  );

  const isGameOver = gameState.status !== 'playing';
  const activeBoardIndex =
    !isGameOver &&
    !gameState.isFreeMove &&
    gameState.activeBoard !== null &&
    gameState.boards[gameState.activeBoard]?.status === 'active'
      ? gameState.activeBoard
      : null;

  // Persistent GPU spring coordinates for the active 3×3 focus frame
  const activeTargetX = useMotionValue(0);
  const activeTargetY = useMotionValue(0);
  const activeX = useSpring(activeTargetX, FOCUS_SPRING);
  const activeY = useSpring(activeTargetY, FOCUS_SPRING);
  const wasActiveVisibleRef = useRef(false);
  const activeRectsRef = useRef<SubBoardRect[] | null>(null);

  useLayoutEffect(() => {
    const rectsChanged = activeRectsRef.current !== boardRects;
    activeRectsRef.current = boardRects;

    if (activeBoardIndex === null || !boardRects || boardRects.length !== 9) {
      wasActiveVisibleRef.current = false;
      return;
    }

    const base = boardRects[0];
    const target = boardRects[activeBoardIndex];
    const tx = target.x + (target.w - base.w) / 2 - 1;
    const ty = target.y + (target.h - base.h) / 2 - 1;

    activeTargetX.set(tx);
    activeTargetY.set(ty);
    if (!wasActiveVisibleRef.current || reduceMotion || rectsChanged) {
      activeX.jump(tx);
      activeY.jump(ty);
    }
    wasActiveVisibleRef.current = true;
  }, [activeBoardIndex, boardRects, reduceMotion, activeTargetX, activeTargetY, activeX, activeY]);

  // Persistent GPU spring coordinates for the hover destination 3×3 projector
  const projTargetX = useMotionValue(0);
  const projTargetY = useMotionValue(0);
  const projX = useSpring(projTargetX, PROJECTOR_SPRING);
  const projY = useSpring(projTargetY, PROJECTOR_SPRING);
  const wasProjectorVisibleRef = useRef(false);
  const projRectsRef = useRef<SubBoardRect[] | null>(null);

  useLayoutEffect(() => {
    const rectsChanged = projRectsRef.current !== boardRects;
    projRectsRef.current = boardRects;

    if (!destinationPreview || !boardRects || boardRects.length !== 9) {
      wasProjectorVisibleRef.current = false;
      return;
    }

    lastPreviewRef.current = destinationPreview;
    const base = boardRects[0];
    const target = boardRects[destinationPreview.targetBoard];
    const tx = target.x + (target.w - base.w) / 2 - 1;
    const ty = target.y + (target.h - base.h) / 2 - 1;

    projTargetX.set(tx);
    projTargetY.set(ty);
    if (!wasProjectorVisibleRef.current || reduceMotion || rectsChanged) {
      projX.jump(tx);
      projY.jump(ty);
    }
    wasProjectorVisibleRef.current = true;
  }, [destinationPreview, boardRects, reduceMotion, projTargetX, projTargetY, projX, projY]);

  const isStrict = boardPrefs.boardShape === 'strict';
  const shellRadius = isStrict ? 'rounded-[6px]' : 'rounded-[16px]';
  const ringRadius = isStrict ? 'rounded-[5px]' : 'rounded-[11px]';
  const materialClass =
    boardPrefs.boardMaterial === 'gravure' ? 'board-material-gravure' : '';

  const variantClass =
    variant === 'arena'
      ? 'board-shell-arena'
      : variant === 'preview'
        ? 'board-shell-preview'
        : '';

  const frameWidth = boardRects ? boardRects[0].w + 2 : 0;
  const frameHeight = boardRects ? boardRects[0].h + 2 : 0;
  const shownPreview = destinationPreview ?? lastPreviewRef.current;
  const isProjectorVisible = Boolean(destinationPreview && boardRects);
  const isActiveVisible = Boolean(activeBoardIndex !== null && boardRects);

  return (
    <div
      ref={shellRef}
      dir="ltr"
      className={`board-shell ${variantClass} relative mx-auto box-border overflow-hidden ${shellRadius} ${materialClass} p-2 sm:p-2.5 transition-[border-radius] duration-200`}
      style={{
        backgroundColor: 'var(--bg-recessed)',
        border: '1px solid var(--border-main)',
        boxShadow: 'var(--shadow-board)',
      }}
      onPointerLeave={clearHoverImmediately}
    >
      <div
        ref={gridRef}
        className="relative grid grid-cols-3 grid-rows-3 w-full h-full min-h-0 min-w-0 gap-1.5 sm:gap-2"
      >
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
              hintCell={hintMove?.boardIndex === boardIndex ? hintMove.cellIndex : null}
              animateCells={newlyAddedCells}
              animateCapture={newlyCapturedBoards.has(boardIndex)}
              boardPrefs={boardPrefs}
              onPlayMove={handlePlayMove}
              onHoverEnter={handleHoverEnter}
              onHoverLeave={handleHoverLeave}
            />
          );
        })}

        {/* Persistent GPU-gliding active 3×3 focus frame */}
        {boardRects && (
          <motion.div
            aria-hidden="true"
            data-testid="active-subboard-frame"
            className={`pointer-events-none absolute top-0 left-0 z-20 box-border ${ringRadius}`}
            style={{
              width: frameWidth,
              height: frameHeight,
              x: activeX,
              y: activeY,
              border: '2.5px solid var(--accent-active)',
              boxShadow: 'var(--shadow-active)',
              willChange: 'transform, opacity',
            }}
            initial={false}
            animate={{
              opacity: isActiveVisible ? 1 : 0,
              scale: isActiveVisible ? 1 : 0.97,
            }}
            transition={{
              duration: isActiveVisible ? 0.16 : 0.12,
              ease: SMOOTH_EASE,
            }}
          />
        )}

        {/* Persistent GPU-gliding hover destination 3×3 projector */}
        {boardRects && shownPreview && (
          <motion.div
            aria-hidden="true"
            data-testid="destination-projector"
            className={`pointer-events-none absolute top-0 left-0 z-30 box-border ${ringRadius} flex items-start justify-end p-1`}
            style={{
              width: frameWidth,
              height: frameHeight,
              x: projX,
              y: projY,
              border: shownPreview.willBeFreeMove
                ? '2px dashed var(--danger-color)'
                : '2px dashed var(--accent-active)',
              backgroundColor: shownPreview.willBeFreeMove
                ? 'var(--danger-bg)'
                : 'var(--accent-active-bg)',
              boxShadow: shownPreview.willBeFreeMove
                ? '0 0 0 1px color-mix(in srgb, var(--danger-color) 20%, transparent)'
                : '0 0 0 1px color-mix(in srgb, var(--accent-active) 24%, transparent), var(--shadow-active)',
              transition:
                'border-color 180ms ease, background-color 180ms ease, box-shadow 180ms ease',
              willChange: 'transform, opacity',
            }}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{
              opacity: isProjectorVisible ? 1 : 0,
              scale: isProjectorVisible ? 1 : 0.975,
            }}
            transition={{
              duration: isProjectorVisible ? 0.13 : 0.14,
              ease: SMOOTH_EASE,
            }}
          >
            <span
              className="rounded px-1 py-0.5 font-mono text-[9px] font-medium leading-none shadow-sm"
              style={{
                backgroundColor: 'var(--bg-board)',
                color: shownPreview.willBeFreeMove
                  ? 'var(--danger-color)'
                  : 'var(--accent-active-text)',
                border: `1px solid ${
                  shownPreview.willBeFreeMove
                    ? 'var(--danger-color)'
                    : 'var(--accent-active)'
                }`,
                transition: 'color 180ms ease, border-color 180ms ease',
              }}
            >
              {shownPreview.willBeFreeMove
                ? t('common.freeMove')
                : shownPreview.isSelfRedirect
                  ? t('common.sameZone')
                  : `→ ${BOARD_COORDS[shownPreview.targetBoard]}`}
            </span>
          </motion.div>
        )}
      </div>

      <BoardFx
        shellRef={shellRef}
        gameState={gameState}
        strictCorners={isStrict}
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
