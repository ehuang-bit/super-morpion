import { useEffect, useRef, useState, type RefObject } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { GameState } from '@shared/gameEngine';
import { SMOOTH_EASE } from '../utils/motion';

interface Point {
  x: number;
  y: number;
}

interface Box extends Point {
  w: number;
  h: number;
}

interface InkDot {
  dx: number;
  dy: number;
  size: number;
  delay: number;
}

type Fx =
  | { id: number; kind: 'splash'; at: Point; color: string; dots: InkDot[] }
  | { id: number; kind: 'trail'; from: Point; to: Point; target: Box; showLine: boolean }
  | { id: number; kind: 'shockwave'; box: Box; color: string }
  | { id: number; kind: 'freeMove'; zones: { box: Box; delay: number }[] }
  | { id: number; kind: 'winZones'; zones: { box: Box; delay: number }[]; color: string };

interface BoardFxProps {
  /** Conteneur du plateau : sert à mesurer les cases et les zones. */
  shellRef: RefObject<HTMLDivElement | null>;
  gameState: GameState;
  strictCorners: boolean;
}

/** Durée de vie maximale d'un effet avant nettoyage. */
const FX_LIFETIME_MS = 1900;

let fxCounter = 0;

function measure(shell: HTMLElement, selector: string): Box | null {
  const el = shell.querySelector(selector);
  if (!el) return null;
  const a = el.getBoundingClientRect();
  const b = shell.getBoundingClientRect();
  return {
    x: a.left - b.left - shell.clientLeft,
    y: a.top - b.top - shell.clientTop,
    w: a.width,
    h: a.height,
  };
}

function centerOf(box: Box): Point {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

/** Éclaboussure : quelques gouttes projetées autour d'un point. */
function makeDots(count: number, reach: number): InkDot[] {
  const dots: InkDot[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.9;
    const distance = reach * (0.45 + Math.random() * 0.75);
    dots.push({
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      size: 3 + Math.random() * 4.5,
      delay: Math.random() * 0.06,
    });
  }
  return dots;
}

/**
 * Effets joués par-dessus le plateau à chaque coup :
 * éclaboussure d'encre à la pose, trait de renvoi vers la zone où l'adversaire
 * doit jouer, onde à la prise d'une zone, vague et bandeau au coup libre.
 *
 * Seuls les coups joués en direct sont animés (pas le chargement d'une partie
 * en cours). Rien n'est affiché si le système demande de réduire les animations.
 */
export function BoardFx({ shellRef, gameState, strictCorners }: BoardFxProps) {
  const reduceMotion = useReducedMotion();
  const [effects, setEffects] = useState<Fx[]>([]);
  const prevLengthRef = useRef(gameState.moveHistory.length);
  const timersRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    const length = gameState.moveHistory.length;
    const previous = prevLengthRef.current;
    prevLengthRef.current = length;

    if (reduceMotion || length !== previous + 1) return;
    const shell = shellRef.current;
    const record = gameState.moveHistory[length - 1];
    if (!shell || !record) return;

    const cell = measure(
      shell,
      `[data-board-index="${record.boardIndex}"] [data-cell-index="${record.cellIndex}"]`,
    );
    if (!cell) return;
    const cellCenter = centerOf(cell);
    const color = record.player === 'X' ? 'var(--x-color)' : 'var(--o-color)';
    const created: Fx[] = [];

    created.push({
      id: ++fxCounter,
      kind: 'splash',
      at: cellCenter,
      color,
      dots: record.capturedBoard ? makeDots(16, cell.w * 2.1) : makeDots(7, cell.w * 0.95),
    });

    if (record.capturedBoard) {
      const zone = measure(shell, `[data-board-index="${record.boardIndex}"]`);
      if (zone) created.push({ id: ++fxCounter, kind: 'shockwave', box: zone, color });
    }

    // Victoire : les trois zones alignées s'allument l'une après l'autre
    if (gameState.status === 'won' && gameState.winLine) {
      const zones: { box: Box; delay: number }[] = [];
      gameState.winLine.forEach((boardIndex, order) => {
        const box = measure(shell, `[data-board-index="${boardIndex}"]`);
        if (box) zones.push({ box, delay: 0.12 + order * 0.2 });
      });
      created.push({ id: ++fxCounter, kind: 'winZones', zones, color });
    }

    if (gameState.status === 'playing') {
      if (gameState.activeBoard !== null) {
        const target = measure(shell, `[data-board-index="${gameState.activeBoard}"]`);
        if (target) {
          const to = centerOf(target);
          created.push({
            id: ++fxCounter,
            kind: 'trail',
            from: cellCenter,
            to,
            target,
            showLine: Math.hypot(to.x - cellCenter.x, to.y - cellCenter.y) > 14,
          });
        }
      } else if (gameState.isFreeMove) {
        const zones: { box: Box; delay: number }[] = [];
        const originRow = Math.floor(record.cellIndex / 3);
        const originCol = record.cellIndex % 3;
        gameState.boards.forEach((board, index) => {
          if (board.status !== 'active') return;
          const box = measure(shell, `[data-board-index="${index}"]`);
          if (!box) return;
          const distance =
            Math.abs(Math.floor(index / 3) - originRow) + Math.abs((index % 3) - originCol);
          zones.push({ box, delay: 0.12 + distance * 0.07 });
        });
        created.push({ id: ++fxCounter, kind: 'freeMove', zones });
      }
    }

    const ids = new Set(created.map((fx) => fx.id));
    setEffects((list) => [...list, ...created]);
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      setEffects((list) => list.filter((fx) => !ids.has(fx.id)));
    }, FX_LIFETIME_MS);
    timersRef.current.add(timer);
  }, [gameState, reduceMotion, shellRef]);

  if (effects.length === 0) return null;

  const zoneRadius = strictCorners ? 5 : 11;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[35]">
      <svg className="absolute inset-0 w-full h-full overflow-visible">
        {effects.map((fx) =>
          fx.kind === 'trail' && fx.showLine ? (
            <g key={fx.id}>
              <motion.line
                x1={fx.from.x}
                y1={fx.from.y}
                x2={fx.to.x}
                y2={fx.to.y}
                stroke="var(--accent-active)"
                strokeWidth={3.5}
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={100}
                initial={{ strokeDashoffset: 100, opacity: 1 }}
                animate={{ strokeDashoffset: [100, 0, 0], opacity: [1, 1, 0] }}
                transition={{ duration: 0.95, times: [0, 0.42, 1], ease: SMOOTH_EASE }}
              />
              <motion.circle
                r={5.5}
                fill="var(--accent-active)"
                initial={{ cx: fx.from.x, cy: fx.from.y, opacity: 1 }}
                animate={{ cx: fx.to.x, cy: fx.to.y, opacity: [1, 1, 0] }}
                transition={{
                  cx: { duration: 0.4, ease: SMOOTH_EASE },
                  cy: { duration: 0.4, ease: SMOOTH_EASE },
                  opacity: { duration: 0.6, times: [0, 0.66, 1] },
                }}
              />
            </g>
          ) : null,
        )}
      </svg>

      {effects.map((fx) => {
        if (fx.kind === 'splash') {
          return fx.dots.map((dot, index) => (
            <motion.span
              key={`${fx.id}-${index}`}
              className="absolute rounded-full"
              style={{
                left: fx.at.x - dot.size / 2,
                top: fx.at.y - dot.size / 2,
                width: dot.size,
                height: dot.size,
                backgroundColor: fx.color,
              }}
              initial={{ x: 0, y: 0, scale: 0.3, opacity: 0.95 }}
              animate={{ x: dot.dx, y: dot.dy, scale: [0.3, 1.15, 0.7], opacity: [0.95, 0.85, 0] }}
              transition={{ duration: 0.62, delay: dot.delay, ease: [0.16, 1, 0.3, 1] }}
            />
          ));
        }

        if (fx.kind === 'trail') {
          // Arrivée : la zone où l'adversaire doit jouer s'illumine
          return (
            <motion.div
              key={fx.id}
              className="absolute"
              style={{
                left: fx.target.x,
                top: fx.target.y,
                width: fx.target.w,
                height: fx.target.h,
                borderRadius: zoneRadius,
                border: '2.5px solid var(--accent-active)',
                backgroundColor: 'var(--accent-active-bg)',
              }}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: [0, 1, 0], scale: [0.94, 1.045, 1] }}
              transition={{
                duration: 0.7,
                delay: fx.showLine ? 0.3 : 0.05,
                times: [0, 0.35, 1],
                ease: SMOOTH_EASE,
              }}
            />
          );
        }

        if (fx.kind === 'shockwave') {
          return [0, 0.13].map((delay, ring) => (
            <motion.div
              key={`${fx.id}-${ring}`}
              className="absolute"
              style={{
                left: fx.box.x,
                top: fx.box.y,
                width: fx.box.w,
                height: fx.box.h,
                borderRadius: zoneRadius,
                border: `${ring === 0 ? 4 : 2.5}px solid ${fx.color}`,
              }}
              initial={{ opacity: 0.9, scale: 1 }}
              animate={{ opacity: 0, scale: ring === 0 ? 1.6 : 1.95 }}
              transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
            />
          ));
        }

        if (fx.kind === 'winZones') {
          return fx.zones.map((zone, index) => (
            <motion.div
              key={`${fx.id}-${index}`}
              className="absolute"
              style={{
                left: zone.box.x,
                top: zone.box.y,
                width: zone.box.w,
                height: zone.box.h,
                borderRadius: zoneRadius,
                border: `4px solid ${fx.color}`,
                backgroundColor: `color-mix(in srgb, ${fx.color} 30%, transparent)`,
              }}
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: [0, 1, 0.55], scale: [0.88, 1.09, 1] }}
              transition={{ duration: 0.6, delay: zone.delay, times: [0, 0.4, 1] }}
            />
          ));
        }

        // Coup libre : vague sur les zones ouvertes, puis bandeau
        return (
          <div key={fx.id}>
            {fx.zones.map((zone, index) => (
              <motion.div
                key={index}
                className="absolute"
                style={{
                  left: zone.box.x,
                  top: zone.box.y,
                  width: zone.box.w,
                  height: zone.box.h,
                  borderRadius: zoneRadius,
                  border: '3px solid var(--accent-active)',
                  backgroundColor: 'var(--accent-active-bg)',
                }}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: [0, 1, 0], scale: [0.92, 1.035, 1] }}
                transition={{ duration: 0.75, delay: zone.delay, times: [0, 0.35, 1] }}
              />
            ))}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                className="rounded-full px-5 py-2 font-extrabold uppercase whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--accent-active)',
                  color: 'var(--bg-board)',
                  letterSpacing: '0.22em',
                  fontSize: 'clamp(15px, 4.4vmin, 26px)',
                  boxShadow: 'var(--shadow-board)',
                }}
                initial={{ opacity: 0, scale: 0.6, letterSpacing: '0.6em' }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  scale: [0.6, 1.06, 1, 1.04],
                  letterSpacing: ['0.6em', '0.22em', '0.22em', '0.3em'],
                }}
                transition={{ duration: 1.5, times: [0, 0.22, 0.78, 1], ease: SMOOTH_EASE }}
              >
                Coup libre
              </motion.div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
