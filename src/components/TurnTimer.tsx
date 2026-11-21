import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Player } from '@shared/gameEngine';
import { haptics } from '../utils/haptics';
import { SMOOTH_EASE } from '../utils/motion';
import { soundEngine } from '../utils/soundEngine';

interface TurnTimerProps {
  /** Début du chrono du coup en cours (heure serveur), ou `null`. */
  turnStartedAt: number | null;
  /** Temps accordé par coup. */
  limitMs: number;
  /** Écart estimé entre l'horloge du serveur et celle de l'appareil. */
  clockOffsetMs: number;
  activePlayer: Player;
  /** Vrai quand c'est au joueur local de jouer (son et vibration). */
  isSelfTurn: boolean;
  running: boolean;
  strictCorners: boolean;
}

/** Les dernières secondes s'affichent en grand. */
const COUNTDOWN_FROM = 5;
/** Débord du liséré autour du plateau, en pixels. */
const RING_OUTSET = 7;
const RING_STROKE = 4;

/**
 * Temps du coup en cours : un liséré qui se vide autour du plateau, à la
 * couleur du joueur qui doit jouer, puis un compte à rebours 5-4-3-2-1.
 *
 * À placer dans le conteneur `relative` qui épouse le plateau.
 */
export function TurnTimer({
  turnStartedAt,
  limitMs,
  clockOffsetMs,
  activePlayer,
  isSelfTurn,
  running,
  strictCorners,
}: TurnTimerProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<SVGRectElement | null>(null);
  const offsetRef = useRef(clockOffsetMs);
  const selfTurnRef = useRef(isSelfTurn);
  const lastShownRef = useRef<number | null>(null);
  offsetRef.current = clockOffsetMs;
  selfTurnRef.current = isSelfTurn;

  const [size, setSize] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [urgent, setUrgent] = useState(false);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize(el.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Nouveau coup : on repart d'un chrono calme
    lastShownRef.current = null;
    setSecondsLeft(null);
    setUrgent(false);
    if (!running || turnStartedAt === null) {
      return;
    }

    let frame = 0;
    let wasUrgent = false;
    const update = () => {
      const now = Date.now() + offsetRef.current;
      const remaining = Math.min(limitMs, Math.max(0, turnStartedAt + limitMs - now));
      if (ringRef.current) {
        ringRef.current.style.strokeDashoffset = String(1 - remaining / limitMs);
      }

      const secs = Math.ceil(remaining / 1000);
      const shown = remaining > 0 && secs <= COUNTDOWN_FROM ? secs : null;
      if (shown !== lastShownRef.current) {
        lastShownRef.current = shown;
        setSecondsLeft(shown);
        if (shown !== null && selfTurnRef.current) {
          soundEngine.playCountdownTick(shown);
          haptics.countdown();
        }
      }

      const isUrgent = remaining <= COUNTDOWN_FROM * 1000;
      if (isUrgent !== wasUrgent) {
        wasUrgent = isUrgent;
        setUrgent(isUrgent);
      }
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [running, turnStartedAt, limitMs]);

  const visible = running && turnStartedAt !== null;
  const color = urgent
    ? 'var(--danger-color)'
    : activePlayer === 'X'
      ? 'var(--x-color)'
      : 'var(--o-color)';
  const radius = (strictCorners ? 6 : 16) + RING_OUTSET - RING_STROKE / 2;
  const inner = Math.max(0, size - RING_STROKE);

  return (
    <>
      {/* Conteneur fixe (mesuré) ; seul l'intérieur est rejoué à chaque battement */}
      <div
        ref={wrapRef}
        aria-hidden="true"
        className="pointer-events-none absolute z-[45]"
        style={{ inset: -RING_OUTSET }}
      >
        <motion.div
          className="w-full h-full"
          // Battement à chaque seconde du compte à rebours
          animate={secondsLeft !== null ? { scale: [1, 1.014, 1] } : { scale: 1 }}
          transition={{ duration: 0.32, ease: SMOOTH_EASE }}
          key={secondsLeft === null ? 'calm' : `beat-${secondsLeft}`}
        >
          {visible && size > 0 && (
            <svg width={size} height={size} className="block overflow-visible">
              <rect
                x={RING_STROKE / 2}
                y={RING_STROKE / 2}
                width={inner}
                height={inner}
                rx={radius}
                fill="none"
                stroke="var(--border-main)"
                strokeWidth={RING_STROKE - 1}
                opacity={0.7}
              />
              <rect
                ref={ringRef}
                x={RING_STROKE / 2}
                y={RING_STROKE / 2}
                width={inner}
                height={inner}
                rx={radius}
                fill="none"
                stroke={color}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="1 1"
                className={urgent ? 'turn-timer-urgent' : ''}
                style={{ transition: 'stroke 300ms ease' }}
              />
            </svg>
          )}
        </motion.div>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[46] flex items-center justify-center overflow-hidden"
      >
        <AnimatePresence>
          {secondsLeft !== null && (
            <motion.span
              key={secondsLeft}
              initial={{ scale: 1.8, opacity: 0 }}
              animate={{
                scale: 1,
                opacity: isSelfTurn ? [0, 0.85, 0.3] : [0, 0.5, 0.18],
              }}
              exit={{ scale: 0.75, opacity: 0 }}
              transition={{
                duration: 0.7,
                ease: SMOOTH_EASE,
                times: [0, 0.25, 1],
              }}
              className="absolute font-mono font-bold leading-none tabular-nums select-none"
              style={{
                color: 'var(--danger-color)',
                fontSize: 'clamp(110px, 38vmin, 230px)',
              }}
            >
              {secondsLeft}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <span className="sr-only" role="status">
        {secondsLeft === COUNTDOWN_FROM
          ? isSelfTurn
            ? `Plus que ${COUNTDOWN_FROM} secondes pour jouer`
            : `Plus que ${COUNTDOWN_FROM} secondes pour l’adversaire`
          : ''}
      </span>
    </>
  );
}
