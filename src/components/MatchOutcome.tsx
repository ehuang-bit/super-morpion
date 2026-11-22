import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { EloMatchDelta } from '@shared/elo';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import { haptics } from '../utils/haptics';
import { CHIP_SPRING, SMOOTH_EASE } from '../utils/motion';
import { soundEngine } from '../utils/soundEngine';
import { Confetti } from './Confetti';

export type OutcomeKind = 'win' | 'loss' | 'draw';

interface MatchOutcomeProps {
  kind: OutcomeKind;
  /** Couleur de l'encre : celle du vainqueur, neutre pour un nul. */
  inkColor: string;
  /** Variables CSS des confettis (lisibles sur l'encre). */
  confettiVars: string[];
  myResult: EloMatchDelta | null;
  /** Nom du nouveau rang si la victoire fait monter d'un palier. */
  promotionLabel: string | null;
  onDone: () => void;
}

/** Chronologie, en secondes depuis la fin de la partie. */
const TIMELINE = {
  win: { flood: 0.8, title: 1.25, rating: 1.65, end: 3.25 },
  loss: { flood: 0.35, title: 0.75, rating: 0.95, end: 2.05 },
  draw: { flood: 0.35, title: 0.75, rating: 0.95, end: 2.05 },
} as const;
const PROMOTION_SECONDS = 2.4;
const EXIT_SECONDS = 0.45;

const TITLES: Record<OutcomeKind, string> = {
  win: 'VICTOIRE',
  loss: 'DÉFAITE',
  draw: 'MATCH NUL',
};

const BLOB_SHAPES = [
  '46% 54% 51% 49% / 53% 47% 55% 45%',
  '58% 42% 47% 53% / 44% 56% 49% 51%',
  '41% 59% 55% 45% / 57% 43% 46% 54%',
];

/** Taches secondaires : position (en % de l'écran), taille (vmax), avance. */
const SATELLITES = [
  { x: 22, y: 30, size: 34, lead: 0.2 },
  { x: 76, y: 24, size: 28, lead: 0.14 },
  { x: 84, y: 70, size: 38, lead: 0.17 },
  { x: 18, y: 78, size: 30, lead: 0.1 },
  { x: 52, y: 88, size: 24, lead: 0.05 },
  { x: 48, y: 10, size: 22, lead: 0.08 },
] as const;

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`.replace('-', '−');
}

/** Titre qui s'écrit lettre après lettre, de gauche à droite. */
function InkTitle({ text, delay, size }: { text: string; delay: number; size: string }) {
  return (
    <h2
      aria-label={text}
      className="flex justify-center font-extrabold leading-none"
      style={{ fontSize: size, letterSpacing: '-0.01em' }}
    >
      {text.split('').map((char, index) => (
        <motion.span
          key={index}
          aria-hidden="true"
          className="inline-block whitespace-pre"
          initial={{ clipPath: 'inset(-10% 100% -10% 0)', y: 18, opacity: 0 }}
          animate={{ clipPath: 'inset(-10% -5% -10% 0)', y: 0, opacity: 1 }}
          transition={{ delay: delay + index * 0.055, duration: 0.3, ease: SMOOTH_EASE }}
        >
          {char}
        </motion.span>
      ))}
    </h2>
  );
}

function RatingLine({
  result,
  delay,
  large,
}: {
  result: EloMatchDelta;
  delay: number;
  large: boolean;
}) {
  const shown = useAnimatedNumber(result.before, result.after, 650, delay * 1000 + 100);
  return (
    <motion.div
      className="flex items-center justify-center gap-3 font-mono tabular-nums"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
    >
      <span
        className="font-bold"
        style={{ fontSize: large ? 'clamp(30px, 7vmin, 60px)' : 'clamp(22px, 5vmin, 38px)' }}
      >
        {shown}
        {result.provisional ? '?' : ''}
      </span>
      <motion.span
        className="rounded-full px-3 py-1 font-bold"
        style={{
          fontSize: large ? 'clamp(16px, 3.4vmin, 26px)' : 'clamp(14px, 2.8vmin, 20px)',
          backgroundColor: 'var(--bg-board)',
          color:
            result.delta > 0
              ? 'var(--x-color)'
              : result.delta < 0
                ? 'var(--danger-color)'
                : 'var(--text-secondary)',
        }}
        initial={{ scale: 0, rotate: -14 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ ...CHIP_SPRING, delay: delay + 0.4 }}
      >
        {formatDelta(result.delta)}
      </motion.span>
    </motion.div>
  );
}

/**
 * Séquence plein écran de fin de partie.
 *
 * Victoire : l'encre du vainqueur envahit l'écran, « VICTOIRE » s'écrit,
 * confettis et compteur de classement, puis éventuelle promotion de rang.
 * Défaite et nul : version plus courte et plus sobre.
 *
 * La séquence ne peut pas être passée ; `onDone` est appelé à la fin.
 */
export function MatchOutcome({
  kind,
  inkColor,
  confettiVars,
  myResult: liveResult,
  promotionLabel: livePromotionLabel,
  onDone,
}: MatchOutcomeProps) {
  // Données figées au lancement : une mise à jour du salon ne relance rien
  const [{ myResult, promotionLabel }] = useState(() => ({
    myResult: liveResult,
    promotionLabel: livePromotionLabel,
  }));
  const timeline = TIMELINE[kind];
  const hasPromotion = kind === 'win' && promotionLabel !== null;
  const [scene, setScene] = useState<'result' | 'promotion'>('result');
  const [confetti, setConfetti] = useState(false);
  const [exiting, setExiting] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timers: number[] = [];
    const at = (seconds: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, seconds * 1000));
    };

    at(timeline.flood, () => soundEngine.playInkFlood());
    if (kind === 'win') at(timeline.title, () => setConfetti(true));

    let end: number = timeline.end;
    if (hasPromotion) {
      at(timeline.end - 0.15, () => {
        setScene('promotion');
        soundEngine.playPromotion();
        haptics.victory();
      });
      end += PROMOTION_SECONDS;
    }
    at(end, () => setExiting(true));
    at(end + EXIT_SECONDS, () => onDoneRef.current());

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [kind, hasPromotion, timeline]);

  const rated = myResult !== null && myResult.rated !== false;

  return (
    <motion.div
      className="fixed inset-0 z-[85] overflow-hidden"
      style={{ color: 'var(--bg-board)' }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: EXIT_SECONDS, ease: 'easeInOut' }}
    >
      <span className="sr-only" role="status">
        {kind === 'win' ? 'Victoire' : kind === 'loss' ? 'Défaite' : 'Match nul'}
        {rated && myResult ? `, classement ${myResult.after}` : ''}
      </span>

      {/* Encre */}
      {kind === 'win' && (
        <div aria-hidden="true" className="absolute inset-0">
          {SATELLITES.map((blob, index) => (
            <motion.div
              key={index}
              className="absolute"
              style={{
                left: `${blob.x}%`,
                top: `${blob.y}%`,
                width: `${blob.size}vmax`,
                height: `${blob.size}vmax`,
                marginLeft: `${-blob.size / 2}vmax`,
                marginTop: `${-blob.size / 2}vmax`,
                borderRadius: BLOB_SHAPES[index % BLOB_SHAPES.length],
                backgroundColor: inkColor,
              }}
              initial={{ scale: 0, rotate: 0 }}
              animate={{ scale: 1.25, rotate: index % 2 === 0 ? 40 : -40 }}
              transition={{
                delay: timeline.flood - blob.lead,
                duration: 0.75,
                ease: [0.3, 0, 0.2, 1],
              }}
            />
          ))}
          <motion.div
            className="absolute left-1/2 top-1/2"
            style={{
              width: '240vmax',
              height: '240vmax',
              marginLeft: '-120vmax',
              marginTop: '-120vmax',
              borderRadius: BLOB_SHAPES[0],
              backgroundColor: inkColor,
            }}
            initial={{ scale: 0, rotate: 0 }}
            animate={{ scale: 1, rotate: 30 }}
            transition={{ delay: timeline.flood, duration: 0.85, ease: [0.65, 0, 0.2, 1] }}
          />
        </div>
      )}

      {kind === 'loss' && (
        <motion.div
          aria-hidden="true"
          className="absolute inset-x-0 top-0"
          style={{ height: '100%', backgroundColor: inkColor }}
          initial={{ y: '-112%' }}
          animate={{ y: 0 }}
          transition={{ delay: timeline.flood, duration: 0.6, ease: [0.6, 0, 0.25, 1] }}
        >
          {/* Bord inférieur qui coule */}
          <svg
            className="absolute left-0 top-full w-full"
            style={{ height: '9vh', marginTop: -1 }}
            viewBox="0 0 100 20"
            preserveAspectRatio="none"
          >
            <path
              d="M0 0 H100 V4 C92 4 91 15 84 15 C77 15 78 5 70 5 C63 5 63 19 55 19 C47 19 48 6 40 6 C33 6 33 13 26 13 C19 13 20 4 12 4 C6 4 6 10 0 10 Z"
              fill={inkColor}
            />
          </svg>
        </motion.div>
      )}

      {kind === 'draw' && (
        <div aria-hidden="true" className="absolute inset-0">
          <motion.div
            className="absolute inset-y-0 left-0 w-[51%]"
            style={{ backgroundColor: inkColor }}
            initial={{ x: '-102%' }}
            animate={{ x: 0 }}
            transition={{ delay: timeline.flood, duration: 0.55, ease: [0.6, 0, 0.25, 1] }}
          />
          <motion.div
            className="absolute inset-y-0 right-0 w-[51%]"
            style={{ backgroundColor: inkColor }}
            initial={{ x: '102%' }}
            animate={{ x: 0 }}
            transition={{ delay: timeline.flood, duration: 0.55, ease: [0.6, 0, 0.25, 1] }}
          />
        </div>
      )}

      {confetti && <Confetti colorVars={confettiVars} particleCount={170} durationMs={2800} />}

      {/* Contenu */}
      <div className="absolute inset-0 flex items-center justify-center px-5">
        <AnimatePresence mode="wait">
          {scene === 'result' ? (
            <motion.div
              key="result"
              className="flex flex-col items-center gap-[2.2vmin] text-center"
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.22 } }}
            >
              <div className="relative">
                <InkTitle
                  text={TITLES[kind]}
                  delay={timeline.title}
                  size={
                    kind === 'win' ? 'clamp(46px, 15vmin, 170px)' : 'clamp(38px, 11vmin, 120px)'
                  }
                />
                {kind === 'win' && (
                  // Trait de pinceau sous le titre
                  <motion.div
                    aria-hidden="true"
                    className="absolute left-[5%] w-[90%] rounded-full"
                    style={{
                      top: '100%',
                      height: 'max(4px, 1vmin)',
                      marginTop: '1vmin',
                      backgroundColor: 'currentColor',
                      transformOrigin: '0% 50%',
                      rotate: -1.2,
                    }}
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 0.9 }}
                    transition={{
                      delay: timeline.title + TITLES.win.length * 0.055,
                      duration: 0.4,
                      ease: SMOOTH_EASE,
                    }}
                  />
                )}
              </div>

              {rated && myResult && (
                <div className={kind === 'win' ? 'mt-[3vmin]' : 'mt-[1vmin]'}>
                  <RatingLine result={myResult} delay={timeline.rating} large={kind === 'win'} />
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="promotion"
              className="relative flex flex-col items-center gap-[2vmin] text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {/* Anneaux concentriques gravés (sans dégradé conique) */}
              <motion.svg
                aria-hidden="true"
                viewBox="0 0 260 260"
                className="pointer-events-none absolute left-1/2"
                style={{
                  top: 'clamp(55px, 14vmin, 110px)',
                  width: 'min(92vmin, 420px)',
                  height: 'min(92vmin, 420px)',
                  marginLeft: 'calc(min(92vmin, 420px) / -2)',
                  marginTop: 'calc(min(92vmin, 420px) / -2)',
                  opacity: 0.2,
                }}
                initial={{ scale: 0.72, opacity: 0 }}
                animate={{ scale: 1, opacity: 0.2 }}
                transition={{ duration: 0.55, ease: SMOOTH_EASE }}
              >
                <circle cx="130" cy="130" r="88" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <circle cx="130" cy="130" r="110" fill="none" stroke="currentColor" strokeWidth="0.9" strokeDasharray="3 6" />
                <circle cx="130" cy="130" r="126" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.6" />
              </motion.svg>
              <motion.svg
                aria-hidden="true"
                viewBox="0 0 100 104"
                className="relative"
                style={{ width: 'clamp(110px, 28vmin, 220px)' }}
                initial={{ scale: 0, rotate: -35, y: 40 }}
                animate={{ scale: 1, rotate: 0, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
              >
                <path
                  d="M50 4 L90 18 V52 C90 76 73 92 50 100 C27 92 10 76 10 52 V18 Z"
                  fill="var(--bg-board)"
                />
                <path
                  d="M50 13 L82 24 V52 C82 71 68 84 50 91 C32 84 18 71 18 52 V24 Z"
                  fill="none"
                  stroke={inkColor}
                  strokeWidth={2.4}
                  opacity={0.55}
                />
                <text
                  x="50"
                  y="66"
                  textAnchor="middle"
                  fontSize="44"
                  fontWeight="800"
                  fill={inkColor}
                  fontFamily="'Figtree', ui-sans-serif, system-ui, sans-serif"
                >
                  {(promotionLabel ?? '?').charAt(0)}
                </text>
              </motion.svg>
              <motion.p
                className="relative font-bold uppercase"
                style={{ letterSpacing: '0.32em', fontSize: 'clamp(13px, 2.6vmin, 20px)' }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 0.9, y: 0 }}
                transition={{ delay: 0.45, duration: 0.3 }}
              >
                Promotion
              </motion.p>
              <div className="relative">
                <InkTitle
                  text={promotionLabel ?? ''}
                  delay={0.6}
                  size="clamp(34px, 10vmin, 104px)"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
