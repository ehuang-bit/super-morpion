import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { PLACE_SPRING, SMOOTH_EASE, STAMP_SPRING } from '../utils/motion';

interface LaunchSplashProps {
  onDone: () => void;
}

/**
 * Chronologie, en secondes.
 * 1. Un petit morpion se trace et se joue : X aligne sa diagonale.
 * 2. La caméra recule : ce morpion n'était que la case centrale d'un plus grand.
 * 3. Les grandes cases se tamponnent, la grande diagonale se trace.
 * 4. Le nom s'écrit, puis l'écran se referme en goutte d'encre sur le site.
 */
const T = {
  miniGrid: 0.1,
  miniMoves: 0.42,
  miniMoveGap: 0.13,
  miniLine: 1.1,
  zoomOut: 1.38,
  bigGrid: 1.5,
  bigMarks: 1.86,
  bigMarkGap: 0.1,
  bigLine: 2.3,
  title: 1.95,
  end: 3.15,
} as const;
const EXIT_SECONDS = 0.55;

/** Petit morpion, dessiné autour de (0, 0) : 3 cases de 24 unités. */
const MINI_CELL = 24;
const MINI_HALF = 36;
/** Coups du petit morpion, dans l'ordre joué (colonne, ligne). */
const MINI_MOVES: readonly { symbol: 'X' | 'O'; col: number; row: number }[] = [
  { symbol: 'X', col: 1, row: 1 },
  { symbol: 'O', col: 2, row: 0 },
  { symbol: 'X', col: 0, row: 0 },
  { symbol: 'O', col: 0, row: 2 },
  { symbol: 'X', col: 2, row: 2 },
];

/** Grand plateau : 3 cases de 100 unités, la case centrale porte le petit morpion. */
const BIG_MARKS: readonly { symbol: 'X' | 'O'; col: number; row: number }[] = [
  { symbol: 'X', col: 0, row: 0 },
  { symbol: 'O', col: 2, row: 0 },
  { symbol: 'O', col: 0, row: 2 },
  { symbol: 'X', col: 2, row: 2 },
];

const ZOOM_START = 3.1;

function Mark({
  symbol,
  size,
  stroke,
}: {
  symbol: 'X' | 'O';
  size: number;
  stroke: number;
}) {
  const r = size / 2;
  return symbol === 'X' ? (
    <path
      d={`M${-r} ${-r}L${r} ${r}M${r} ${-r}L${-r} ${r}`}
      stroke="var(--x-color)"
      strokeWidth={stroke}
      strokeLinecap="round"
      fill="none"
    />
  ) : (
    <circle r={r} stroke="var(--o-color)" strokeWidth={stroke} fill="none" />
  );
}

/**
 * Animation d'ouverture du site : « un morpion dans un morpion ».
 * Un appui ou une touche la passe ; `onDone` est appelé une fois terminée.
 */
export function LaunchSplash({ onDone }: LaunchSplashProps) {
  const [exiting, setExiting] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timer = window.setTimeout(() => setExiting(true), T.end * 1000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => onDoneRef.current(), EXIT_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [exiting]);

  useEffect(() => {
    const skip = () => setExiting(true);
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, []);

  const title = 'MORPION';

  return (
    <motion.div
      id="launch-splash"
      className="fixed inset-0 z-[120] flex cursor-pointer select-none flex-col items-center justify-center overflow-hidden"
      style={{ backgroundColor: 'var(--bg-canvas)' }}
      onPointerDown={() => setExiting(true)}
      initial={false}
      animate={{
        clipPath: exiting ? 'circle(0% at 50% 44%)' : 'circle(150% at 50% 44%)',
      }}
      transition={{ duration: EXIT_SECONDS, ease: [0.65, 0, 0.3, 1] }}
    >
      <span className="sr-only" role="status">
        Super Morpion
      </span>

      <motion.div
        aria-hidden="true"
        className="flex flex-col items-center"
        animate={{ scale: exiting ? 0.88 : 1, opacity: exiting ? 0.4 : 1 }}
        transition={{ duration: EXIT_SECONDS, ease: 'easeIn' }}
      >
        <svg
          viewBox="0 0 300 300"
          className="overflow-visible"
          style={{ width: 'min(58vmin, 340px)', height: 'min(58vmin, 340px)' }}
        >
          {/* Socle du grand plateau */}
          <motion.rect
            x="-12"
            y="-12"
            width="324"
            height="324"
            rx="30"
            fill="var(--bg-board)"
            stroke="var(--border-main)"
            strokeWidth="1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: T.bigGrid - 0.1, duration: 0.45 }}
          />

          {/* Grille du grand plateau */}
          {['M100 8V292', 'M200 8V292', 'M8 100H292', 'M8 200H292'].map((d, index) => (
            <motion.path
              key={d}
              d={d}
              stroke="var(--border-strong)"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
              pathLength={1}
              strokeDasharray="1"
              initial={{ strokeDashoffset: 1, opacity: 0 }}
              animate={{ strokeDashoffset: 0, opacity: 1 }}
              transition={{
                strokeDashoffset: {
                  delay: T.bigGrid + index * 0.06,
                  duration: 0.5,
                  ease: SMOOTH_EASE,
                },
                opacity: { delay: T.bigGrid + index * 0.06, duration: 0.01 },
              }}
            />
          ))}

          {/* Grandes cases gagnées, tamponnées une à une */}
          {BIG_MARKS.map((mark, index) => (
            <g
              key={`${mark.col}-${mark.row}`}
              transform={`translate(${50 + mark.col * 100} ${50 + mark.row * 100})`}
            >
              <motion.g
                initial={{ scale: 1.9, opacity: 0, rotate: mark.symbol === 'X' ? -14 : 0 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{
                  ...STAMP_SPRING,
                  delay: T.bigMarks + index * T.bigMarkGap,
                  opacity: { delay: T.bigMarks + index * T.bigMarkGap, duration: 0.08 },
                }}
              >
                {/* Cadre invisible : garde le centre de transformation au milieu de la case */}
                <rect x="-40" y="-40" width="80" height="80" fill="none" />
                <Mark symbol={mark.symbol} size={46} stroke={9} />
              </motion.g>
            </g>
          ))}

          {/* Petit morpion : plein cadre au départ, puis simple case centrale */}
          <g transform="translate(150 150)">
            <motion.g
              initial={{ scale: ZOOM_START }}
              animate={{ scale: 1 }}
              transition={{ delay: T.zoomOut, duration: 0.7, ease: [0.7, 0, 0.2, 1] }}
            >
              <rect
                x={-MINI_HALF - 6}
                y={-MINI_HALF - 6}
                width={MINI_HALF * 2 + 12}
                height={MINI_HALF * 2 + 12}
                fill="none"
              />
              {[
                `M${-MINI_CELL / 2} ${-MINI_HALF}V${MINI_HALF}`,
                `M${MINI_CELL / 2} ${-MINI_HALF}V${MINI_HALF}`,
                `M${-MINI_HALF} ${-MINI_CELL / 2}H${MINI_HALF}`,
                `M${-MINI_HALF} ${MINI_CELL / 2}H${MINI_HALF}`,
              ].map((d, index) => (
                <motion.path
                  key={d}
                  d={d}
                  stroke="var(--border-strong)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  fill="none"
                  pathLength={1}
              strokeDasharray="1"
              initial={{ strokeDashoffset: 1, opacity: 0 }}
                  animate={{ strokeDashoffset: 0, opacity: 1 }}
                  transition={{
                    strokeDashoffset: {
                      delay: T.miniGrid + index * 0.06,
                      duration: 0.4,
                      ease: SMOOTH_EASE,
                    },
                    opacity: { delay: T.miniGrid + index * 0.06, duration: 0.01 },
                  }}
                />
              ))}

              {MINI_MOVES.map((move, index) => (
                <g
                  key={index}
                  transform={`translate(${(move.col - 1) * MINI_CELL} ${(move.row - 1) * MINI_CELL})`}
                >
                  <motion.g
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      ...PLACE_SPRING,
                      delay: T.miniMoves + index * T.miniMoveGap,
                      opacity: { delay: T.miniMoves + index * T.miniMoveGap, duration: 0.05 },
                    }}
                  >
                    <rect x="-10" y="-10" width="20" height="20" fill="none" />
                    <Mark symbol={move.symbol} size={11} stroke={2.6} />
                  </motion.g>
                </g>
              ))}

              {/* Alignement du petit morpion */}
              <motion.path
                d={`M${-MINI_HALF + 3} ${-MINI_HALF + 3}L${MINI_HALF - 3} ${MINI_HALF - 3}`}
                stroke="var(--accent-active)"
                strokeWidth="2.6"
                strokeLinecap="round"
                fill="none"
                pathLength={1}
              strokeDasharray="1"
              initial={{ strokeDashoffset: 1, opacity: 0 }}
                animate={{ strokeDashoffset: 0, opacity: 1 }}
                transition={{
                  strokeDashoffset: { delay: T.miniLine, duration: 0.24, ease: SMOOTH_EASE },
                  opacity: { delay: T.miniLine, duration: 0.01 },
                }}
              />
            </motion.g>
          </g>

          {/* Alignement du grand plateau : la petite diagonale se prolonge */}
          <motion.path
            d="M20 20L280 280"
            stroke="var(--accent-active)"
            strokeWidth="7"
            strokeLinecap="round"
            fill="none"
            pathLength={1}
              strokeDasharray="1"
              initial={{ strokeDashoffset: 1, opacity: 0 }}
            animate={{ strokeDashoffset: 0, opacity: 0.92 }}
            transition={{
              strokeDashoffset: { delay: T.bigLine, duration: 0.42, ease: SMOOTH_EASE },
              opacity: { delay: T.bigLine, duration: 0.01 },
            }}
          />
        </svg>

        {/* Logotype */}
        <div className="mt-[5vmin] flex flex-col items-center">
          <motion.div
            className="flex items-center gap-2.5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: T.title, duration: 0.35, ease: SMOOTH_EASE }}
          >
            <motion.span
              className="h-[2px] w-6 origin-right rounded-full"
              style={{ backgroundColor: 'var(--accent-active)' }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: T.title + 0.1, duration: 0.4, ease: SMOOTH_EASE }}
            />
            <span
              className="font-bold uppercase"
              style={{
                color: 'var(--accent-active-text)',
                fontSize: 'clamp(11px, 2.2vmin, 15px)',
                letterSpacing: '0.42em',
                marginRight: '-0.42em',
              }}
            >
              Super
            </span>
            <motion.span
              className="h-[2px] w-6 origin-left rounded-full"
              style={{ backgroundColor: 'var(--accent-active)' }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: T.title + 0.1, duration: 0.4, ease: SMOOTH_EASE }}
            />
          </motion.div>
          <div
            className="mt-[1.2vmin] flex font-extrabold leading-none"
            style={{
              color: 'var(--text-primary)',
              fontSize: 'clamp(34px, 9vmin, 64px)',
              letterSpacing: '-0.03em',
            }}
          >
            {title.split('').map((char, index) => (
              <motion.span
                key={index}
                className="inline-block"
                initial={{ clipPath: 'inset(-10% 100% -10% 0)', y: 16, opacity: 0 }}
                animate={{ clipPath: 'inset(-10% -5% -10% 0)', y: 0, opacity: 1 }}
                transition={{
                  delay: T.title + 0.15 + index * 0.05,
                  duration: 0.32,
                  ease: SMOOTH_EASE,
                }}
              >
                {char}
              </motion.span>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
