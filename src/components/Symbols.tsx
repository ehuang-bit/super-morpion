import { motion } from 'framer-motion';
import type { Player } from '@shared/gameEngine';
import type { PieceStyle } from '../types/boardPrefs';
import { CAPTURE_SPRING, SMOOTH_EASE } from '../utils/motion';

interface SymbolProps {
  player: Player;
  size?: 'cell' | 'captured' | 'badge';
  pieceStyle?: PieceStyle;
  animate?: boolean;
  ghost?: boolean;
  className?: string;
}

const STROKE_BY_SIZE = {
  cell: 9.5,
  captured: 8.2,
  badge: 11.2,
} as const;

export function SymbolMark({
  player,
  size = 'cell',
  pieceStyle = 'classique',
  animate = false,
  ghost = false,
  className = '',
}: SymbolProps) {
  const strokeWidth = STROKE_BY_SIZE[size];
  const color = player === 'X' ? 'var(--x-color)' : 'var(--o-color)';
  const surface = player === 'X' ? 'var(--x-surface)' : 'var(--o-surface)';
  const opacityClass = ghost ? 'opacity-35' : 'opacity-100';
  const shouldAnimate = animate && !ghost;

  // Style 4: Pions (tactile ceramic/wood discs with engraved mark)
  if (pieceStyle === 'pions') {
    const innerStroke = size === 'badge' ? 9.5 : 7.5;
    const svg = (
      <svg
        viewBox="0 0 100 100"
        className={`block w-full h-full select-none pointer-events-none ${opacityClass} ${className}`}
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r="40"
          fill={surface}
          stroke={color}
          strokeWidth={size === 'badge' ? 7 : 6}
        />
        {player === 'X' ? (
          <>
            <line
              x1="33"
              y1="33"
              x2="67"
              y2="67"
              stroke={color}
              strokeWidth={innerStroke}
              strokeLinecap="round"
            />
            <line
              x1="67"
              y1="33"
              x2="33"
              y2="67"
              stroke={color}
              strokeWidth={innerStroke}
              strokeLinecap="round"
            />
          </>
        ) : (
          <circle
            cx="50"
            cy="50"
            r="17.5"
            fill="none"
            stroke={color}
            strokeWidth={innerStroke}
          />
        )}
      </svg>
    );

    if (shouldAnimate) {
      return (
        <motion.div
          className="w-full h-full"
          initial={{ scale: 0.72, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={CAPTURE_SPRING}
        >
          {svg}
        </motion.div>
      );
    }
    return svg;
  }

  // Style 2: Calligraphie / Plume (gentle curved organic strokes)
  if (pieceStyle === 'calligraphie') {
    if (player === 'X') {
      const p1 = 'M22 25 Q49 48 77 77';
      const p2 = 'M78 22 Q51 50 23 78';
      return (
        <svg
          viewBox="0 0 100 100"
          className={`block w-full h-full select-none pointer-events-none ${opacityClass} ${className}`}
          aria-hidden="true"
        >
          {shouldAnimate ? (
            <>
              <motion.path
                d={p1}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={100}
                initial={{ strokeDashoffset: 100, opacity: 0.45 }}
                animate={{ strokeDashoffset: 0, opacity: 1 }}
                transition={{ duration: 0.2, ease: SMOOTH_EASE }}
              />
              <motion.path
                d={p2}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={100}
                initial={{ strokeDashoffset: 100, opacity: 0.45 }}
                animate={{ strokeDashoffset: 0, opacity: 1 }}
                transition={{ duration: 0.2, delay: 0.07, ease: SMOOTH_EASE }}
              />
            </>
          ) : (
            <>
              <path
                d={p1}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
              <path
                d={p2}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
            </>
          )}
        </svg>
      );
    }

    // Open brush-stroke ensō circle for O
    const ensoPath = 'M 54 21 A 29 29 0 1 1 38 24';
    return (
      <svg
        viewBox="0 0 100 100"
        className={`block w-full h-full select-none pointer-events-none ${opacityClass} ${className}`}
        aria-hidden="true"
      >
        {shouldAnimate ? (
          <motion.path
            d={ensoPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={100}
            initial={{ strokeDashoffset: 100, opacity: 0.45 }}
            animate={{ strokeDashoffset: 0, opacity: 1 }}
            transition={{ duration: 0.28, ease: SMOOTH_EASE }}
          />
        ) : (
          <path
            d={ensoPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}
      </svg>
    );
  }

  // Style 3: Géométrique / Précision (square-capped architectural strokes + double ring)
  if (pieceStyle === 'geometrique') {
    if (player === 'X') {
      return (
        <svg
          viewBox="0 0 100 100"
          className={`block w-full h-full select-none pointer-events-none ${opacityClass} ${className}`}
          aria-hidden="true"
        >
          {shouldAnimate ? (
            <>
              <motion.line
                x1="22"
                y1="22"
                x2="78"
                y2="78"
                stroke={color}
                strokeWidth={strokeWidth * 0.92}
                strokeLinecap="square"
                pathLength={100}
                strokeDasharray={100}
                initial={{ strokeDashoffset: 100, opacity: 0.45 }}
                animate={{ strokeDashoffset: 0, opacity: 1 }}
                transition={{ duration: 0.18, ease: SMOOTH_EASE }}
              />
              <motion.line
                x1="78"
                y1="22"
                x2="22"
                y2="78"
                stroke={color}
                strokeWidth={strokeWidth * 0.92}
                strokeLinecap="square"
                pathLength={100}
                strokeDasharray={100}
                initial={{ strokeDashoffset: 100, opacity: 0.45 }}
                animate={{ strokeDashoffset: 0, opacity: 1 }}
                transition={{ duration: 0.18, delay: 0.06, ease: SMOOTH_EASE }}
              />
            </>
          ) : (
            <>
              <line
                x1="22"
                y1="22"
                x2="78"
                y2="78"
                stroke={color}
                strokeWidth={strokeWidth * 0.92}
                strokeLinecap="square"
              />
              <line
                x1="78"
                y1="22"
                x2="22"
                y2="78"
                stroke={color}
                strokeWidth={strokeWidth * 0.92}
                strokeLinecap="square"
              />
            </>
          )}
        </svg>
      );
    }

    return (
      <svg
        viewBox="0 0 100 100"
        className={`block w-full h-full select-none pointer-events-none ${opacityClass} ${className}`}
        aria-hidden="true"
      >
        {shouldAnimate ? (
          <>
            <motion.circle
              cx="50"
              cy="50"
              r="30"
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth * 0.78}
              transform="rotate(-90 50 50)"
              pathLength={100}
              strokeDasharray={100}
              initial={{ strokeDashoffset: 100, opacity: 0.45 }}
              animate={{ strokeDashoffset: 0, opacity: 1 }}
              transition={{ duration: 0.24, ease: SMOOTH_EASE }}
            />
            <motion.circle
              cx="50"
              cy="50"
              r="15"
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth * 0.55}
              opacity={0.7}
              initial={{ scale: 0.65, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.7 }}
              transition={{ duration: 0.2, delay: 0.08, ease: SMOOTH_EASE }}
            />
          </>
        ) : (
          <>
            <circle
              cx="50"
              cy="50"
              r="30"
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth * 0.78}
            />
            <circle
              cx="50"
              cy="50"
              r="15"
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth * 0.55}
              opacity={0.7}
            />
          </>
        )}
      </svg>
    );
  }

  // Style 1: Classique (default rounded architectural strokes)
  if (player === 'X') {
    return (
      <svg
        viewBox="0 0 100 100"
        className={`block w-full h-full select-none pointer-events-none ${opacityClass} ${className}`}
        aria-hidden="true"
      >
        {shouldAnimate ? (
          <>
            <motion.line
              x1="23"
              y1="23"
              x2="77"
              y2="77"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={100}
              initial={{ strokeDashoffset: 100, opacity: 0.45 }}
              animate={{ strokeDashoffset: 0, opacity: 1 }}
              transition={{ duration: 0.2, ease: SMOOTH_EASE }}
            />
            <motion.line
              x1="77"
              y1="23"
              x2="23"
              y2="77"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={100}
              initial={{ strokeDashoffset: 100, opacity: 0.45 }}
              animate={{ strokeDashoffset: 0, opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.065, ease: SMOOTH_EASE }}
            />
          </>
        ) : (
          <>
            <line
              x1="23"
              y1="23"
              x2="77"
              y2="77"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            <line
              x1="77"
              y1="23"
              x2="23"
              y2="77"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      className={`block w-full h-full select-none pointer-events-none ${opacityClass} ${className}`}
      aria-hidden="true"
    >
      {shouldAnimate ? (
        <motion.circle
          cx="50"
          cy="50"
          r="28"
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          pathLength={100}
          strokeDasharray={100}
          initial={{ strokeDashoffset: 100, opacity: 0.45 }}
          animate={{ strokeDashoffset: 0, opacity: 1 }}
          transition={{ duration: 0.26, ease: SMOOTH_EASE }}
        />
      ) : (
        <circle
          cx="50"
          cy="50"
          r="28"
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
