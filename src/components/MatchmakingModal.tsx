import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TIME_CONTROL_LABELS, type TimeControl } from '@shared/protocol';
import { formatElapsedSeconds } from '../utils/format';
import { MODAL_TRANSITION } from '../utils/motion';

interface MatchmakingModalProps {
  open: boolean;
  timeControl: TimeControl | null;
  queueSize: number;
  onCancel: () => void;
}

export function MatchmakingModal({
  open,
  timeControl,
  queueSize,
  onCancel,
}: MatchmakingModalProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!open) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="matchmaking-title"
        >
          <div className="absolute inset-0 bg-black/40" />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={MODAL_TRANSITION}
            className="relative z-10 w-full max-w-[380px] rounded-[16px] p-5 flex flex-col gap-4"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-board)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="rounded-lg px-2.5 py-1 text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-main)',
                }}
              >
                {timeControl ? TIME_CONTROL_LABELS[timeControl] : 'Matchmaking'}
              </span>
              <span
                className="font-mono text-xs tabular-nums"
                style={{ color: 'var(--text-muted)' }}
              >
                {formatElapsedSeconds(elapsed)}
              </span>
            </div>

            <div>
              <h2
                id="matchmaking-title"
                className="text-base font-bold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                Recherche d’un adversaire…
              </h2>
              <p
                className="text-xs sm:text-sm mt-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                {queueSize > 1
                  ? `${queueSize} joueurs dans la file en ce moment.`
                  : 'La partie démarrera dès qu’un second joueur rejoint la file.'}
              </p>
            </div>

            <button
              type="button"
              onClick={onCancel}
              className="tactile-btn w-full rounded-[10px] px-4 py-2.5 text-sm font-semibold"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-main)',
              }}
            >
              Annuler la recherche
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
