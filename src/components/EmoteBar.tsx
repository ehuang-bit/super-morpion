import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  EMOTE_IDS,
  type EmoteId,
  type RoomEmote,
} from '@shared/protocol';
import { Smile } from 'lucide-react';
import { haptics } from '../utils/haptics';
import { CHIP_SPRING } from '../utils/motion';

export interface EmoteMeta {
  emoji: string;
  label: string;
  shortStamp: string;
}

export const EMOTE_META: Record<EmoteId, EmoteMeta> = {
  fire: { emoji: '🔥', label: 'Bien joué !', shortStamp: 'Bien joué !' },
  clap: { emoji: '👏', label: 'Bravo', shortStamp: 'Bravo !' },
  oops: { emoji: '😅', label: 'Oups…', shortStamp: 'Oups…' },
  mindblown: { emoji: '🤯', label: 'Coup de maître', shortStamp: 'Coup de maître !' },
  clock: { emoji: '⏳', label: 'Pression', shortStamp: 'Tic-tac…' },
  gg: { emoji: '🤝', label: 'GG', shortStamp: 'Bien joué · GG' },
};

const COOLDOWN_MS = 2_000;
const STAMP_SPRING = {
  type: 'spring',
  stiffness: 460,
  damping: 20,
} as const;

export interface EmoteBarProps {
  onSendEmote: (emote: EmoteId) => void;
  disabled?: boolean;
}

/**
 * Palette compacte de tampons d'atelier pour réagir en cours de partie.
 * S'ouvre au-dessus du bouton en veillant à ne jamais déborder de l'écran.
 */
export function EmoteBar({ onSendEmote, disabled = false }: EmoteBarProps) {
  const [open, setOpen] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const [cooldownKey, setCooldownKey] = useState(0);
  const [shiftX, setShiftX] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

  const isDisabled = disabled || coolingDown;

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current !== null) {
        window.clearTimeout(cooldownTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open]);

  // Ferme le menu sur clic extérieur ou touche Échap
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // Maintient le tiroir dans les marges de la fenêtre sur mobile comme bureau
  useLayoutEffect(() => {
    if (!open) {
      setShiftX(0);
      return;
    }

    const updateShift = () => {
      const trigger = containerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;

      const margin = 12;
      const vw = window.innerWidth;
      const triggerRect = trigger.getBoundingClientRect();
      const popWidth = popover.offsetWidth;

      // Ancré par défaut en right-0 par rapport au bouton
      const defaultLeft = triggerRect.right - popWidth;
      const defaultRight = triggerRect.right;

      let nextShift = 0;
      if (defaultLeft < margin) {
        nextShift = margin - defaultLeft;
      } else if (defaultRight > vw - margin) {
        nextShift = vw - margin - defaultRight;
      }
      setShiftX(nextShift);
    };

    updateShift();
    window.addEventListener('resize', updateShift);
    return () => window.removeEventListener('resize', updateShift);
  }, [open]);

  const handleSelectEmote = (id: EmoteId) => {
    if (isDisabled) return;

    haptics.tap();
    onSendEmote(id);
    setOpen(false);
    setCoolingDown(true);
    setCooldownKey((prev) => prev + 1);

    if (cooldownTimerRef.current !== null) {
      window.clearTimeout(cooldownTimerRef.current);
    }
    cooldownTimerRef.current = window.setTimeout(() => {
      setCoolingDown(false);
      cooldownTimerRef.current = null;
    }, COOLDOWN_MS);
  };

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        disabled={isDisabled}
        onClick={() => {
          if (isDisabled) return;
          haptics.tap();
          setOpen((prev) => !prev);
        }}
        aria-label="Envoyer une réaction"
        aria-haspopup="menu"
        aria-expanded={open}
        title={coolingDown ? 'Patientez un instant…' : 'Envoyer une réaction'}
        className="tactile-btn relative overflow-hidden inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          backgroundColor: open
            ? 'var(--accent-active-bg)'
            : 'var(--bg-surface)',
          color: open ? 'var(--accent-active-text)' : 'var(--text-secondary)',
          border: `1px solid ${
            open ? 'var(--accent-active)' : 'var(--border-cell)'
          }`,
        }}
      >
        <Smile className="w-3.5 h-3.5 relative z-10 shrink-0" strokeWidth={2} />
        <span className="hidden sm:inline relative z-10">Réagir</span>

        {coolingDown && (
          <motion.span
            key={cooldownKey}
            aria-hidden="true"
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: COOLDOWN_MS / 1000, ease: 'linear' }}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[2.5px] origin-left"
            style={{ backgroundColor: 'var(--accent-active)' }}
          />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={popoverRef}
            role="menu"
            aria-label="Réactions rapides"
            initial={
              reduceMotion
                ? { opacity: 0, x: shiftX }
                : { opacity: 0, y: 8, scale: 0.94, x: shiftX }
            }
            animate={
              reduceMotion
                ? { opacity: 1, x: shiftX }
                : { opacity: 1, y: 0, scale: 1, x: shiftX }
            }
            exit={
              reduceMotion
                ? { opacity: 0, x: shiftX }
                : { opacity: 0, y: 6, scale: 0.95, x: shiftX }
            }
            transition={CHIP_SPRING}
            className="absolute bottom-full mb-2 right-0 z-50 w-[268px] sm:w-[292px] max-w-[calc(100vw-24px)] rounded-2xl p-2 origin-bottom-right"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1.5px solid var(--border-main)',
              boxShadow: 'var(--shadow-board)',
            }}
          >
            <div
              className="px-1.5 pb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: 'var(--text-muted)' }}
            >
              <span>Tampons</span>
              <span className="font-mono normal-case tracking-normal opacity-80">
                1 clic
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {EMOTE_IDS.map((id) => {
                const meta = EMOTE_META[id];
                return (
                  <motion.button
                    key={id}
                    type="button"
                    role="menuitem"
                    onClick={() => handleSelectEmote(id)}
                    whileHover={reduceMotion ? undefined : { y: -1, scale: 1.03 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.94 }}
                    transition={CHIP_SPRING}
                    className="tactile-btn flex flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-center"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-cell)',
                    }}
                  >
                    <span className="text-lg leading-none" aria-hidden="true">
                      {meta.emoji}
                    </span>
                    <span
                      className="max-w-full truncate text-[10px] font-semibold leading-tight"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {meta.label}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export interface EmoteStampProps {
  emote: RoomEmote | null;
  align?: 'left' | 'right' | 'center';
}

/**
 * Tampon d'encre incliné qui claque brièvement sur la carte du joueur
 * lorsqu'une réaction est envoyée dans le salon.
 */
export function EmoteStamp({ emote, align = 'center' }: EmoteStampProps) {
  const reduceMotion = useReducedMotion();

  const alignClass =
    align === 'left'
      ? 'justify-start'
      : align === 'right'
        ? 'justify-end'
        : 'justify-center';

  const originClass =
    align === 'left'
      ? 'origin-top-left'
      : align === 'right'
        ? 'origin-top-right'
        : 'origin-center';

  return (
    <div className={`pointer-events-none inline-flex ${alignClass}`}>
      <AnimatePresence mode="wait">
        {emote && (() => {
          const meta = EMOTE_META[emote.emote];
          const isX = emote.senderSymbol === 'X';
          const inkColor = isX ? 'var(--x-color)' : 'var(--o-color)';
          const surfaceColor = isX ? 'var(--x-surface)' : 'var(--o-surface)';

          return (
            <motion.div
              key={emote.id}
              role="status"
              aria-live="polite"
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 1.48, y: -8, rotate: -14 }
              }
              animate={
                reduceMotion
                  ? { opacity: 1 }
                  : { opacity: 1, scale: 1, y: 0, rotate: -4 }
              }
              exit={
                reduceMotion
                  ? { opacity: 0, transition: { duration: 0.14 } }
                  : {
                      opacity: 0,
                      scale: 0.84,
                      y: -6,
                      rotate: -1,
                      transition: { duration: 0.16 },
                    }
              }
              transition={STAMP_SPRING}
              className={`relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 select-none ${originClass}`}
              style={{
                backgroundColor: surfaceColor,
                color: inkColor,
                border: `1.5px solid ${inkColor}`,
                boxShadow: 'var(--shadow-card)',
              }}
            >
              {/* Halo d'encre qui se diffuse à l'impact du tampon */}
              {!reduceMotion && (
                <motion.span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-1 rounded-full"
                  style={{ border: `2px solid ${inkColor}` }}
                  initial={{ scale: 0.78, opacity: 0.8 }}
                  animate={{ scale: 1.42, opacity: 0 }}
                  transition={{ duration: 0.56, ease: [0.16, 1, 0.3, 1] }}
                />
              )}

              <span className="text-base leading-none shrink-0" aria-hidden="true">
                {meta.emoji}
              </span>

              <div className="flex flex-col min-w-0 text-left">
                <span className="text-[11px] font-extrabold leading-tight whitespace-nowrap tracking-tight">
                  {meta.shortStamp}
                </span>
                <span className="flex items-center gap-1 min-w-0 text-[9.5px] font-semibold leading-tight opacity-85">
                  {emote.senderSeat && (
                    <span
                      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full font-mono text-[8.5px] font-extrabold leading-none shrink-0"
                      style={{
                        backgroundColor: inkColor,
                        color: 'var(--bg-board)',
                      }}
                    >
                      {emote.senderSeat}
                    </span>
                  )}
                  <span className="truncate max-w-[92px]">
                    {emote.senderPseudo}
                  </span>
                </span>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
