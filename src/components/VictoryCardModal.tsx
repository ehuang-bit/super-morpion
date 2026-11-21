import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Download, Share2, X } from 'lucide-react';
import { MODAL_TRANSITION } from '../utils/motion';
import {
  canShareVictoryCardFiles,
  downloadVictoryCard,
  renderVictoryCardDataUrl,
  shareVictoryCard,
  type VictoryCardData,
} from '../utils/victoryCard';

interface VictoryCardModalProps {
  open: boolean;
  data: VictoryCardData | null;
  onClose: () => void;
}

export function VictoryCardModal({
  open,
  data,
  onClose,
}: VictoryCardModalProps) {
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const [feedback, setFeedback] = useState<'downloaded' | 'shared' | null>(null);
  const [fontsTick, setFontsTick] = useState(0);

  const canShareFiles = useMemo(() => canShareVictoryCardFiles(), []);
  const isVisible = open && data !== null;

  // Fermeture au clavier (Échap)
  useEffect(() => {
    if (!isVisible) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isVisible, onClose]);

  // Réinitialise les états transitoires à la fermeture
  useEffect(() => {
    if (!isVisible) {
      setBusy(null);
      setFeedback(null);
    }
  }, [isVisible]);

  // Régénère l'aperçu une fois les polices chargées si nécessaire
  useEffect(() => {
    if (!isVisible || typeof document === 'undefined' || !('fonts' in document)) {
      return;
    }
    if (document.fonts.status === 'loaded') return;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) {
        setFontsTick((n) => n + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isVisible]);

  // Efface la confirmation visuelle après 2 s
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const previewUrl = useMemo(() => {
    if (!open || !data) return null;
    void fontsTick;
    return renderVictoryCardDataUrl(data);
  }, [open, data, fontsTick]);

  const handleDownload = async () => {
    if (!data || busy !== null) return;
    setBusy('download');
    try {
      await downloadVictoryCard(data);
      setFeedback('downloaded');
    } finally {
      setBusy(null);
    }
  };

  const handleShare = async () => {
    if (!data || busy !== null) return;
    setBusy('share');
    try {
      const outcome = await shareVictoryCard(data);
      setFeedback(outcome);
    } catch {
      // Partage annulé par l'utilisateur
    } finally {
      setBusy(null);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && data && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="victory-card-modal-title"
        >
          {/* Arrière-plan */}
          <div
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={MODAL_TRANSITION}
            className="relative z-10 w-full max-w-[460px] rounded-[16px] p-4 sm:p-5 flex flex-col gap-4"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-board)',
            }}
          >
            {/* En-tête */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  id="victory-card-modal-title"
                  className="text-lg font-bold tracking-tight"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Carte souvenir
                </h2>
                <p
                  className="text-xs sm:text-sm mt-0.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Affiche PNG haute définition aux couleurs de votre atelier.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer la carte souvenir"
                className="tactile-btn shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-main)',
                }}
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>

            {/* Aperçu encadré */}
            <div
              className="flex items-center justify-center rounded-[14px] p-2.5 sm:p-3"
              style={{
                backgroundColor: 'var(--bg-recessed)',
                border: '1px solid var(--border-cell)',
              }}
            >
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Aperçu de la carte souvenir de la partie Super Morpion"
                  className="max-h-[60dvh] w-auto max-w-full object-contain rounded-[14px] select-none"
                  style={{
                    border: '1px solid var(--border-main)',
                    boxShadow: 'var(--shadow-card)',
                  }}
                />
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canShareFiles && (
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  disabled={busy !== null}
                  className="tactile-btn flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color:
                      feedback === 'shared'
                        ? 'var(--x-color)'
                        : 'var(--text-primary)',
                    border: '1px solid var(--border-main)',
                  }}
                >
                  {feedback === 'shared' ? (
                    <>
                      <Check className="w-4 h-4" strokeWidth={2.2} />
                      <span>Partagée !</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4" strokeWidth={2} />
                      <span>Partager l’image</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => void handleDownload()}
                disabled={busy !== null}
                className="tactile-btn flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                style={{
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-text)',
                }}
              >
                {feedback === 'downloaded' ? (
                  <>
                    <Check className="w-4 h-4" strokeWidth={2.4} />
                    <span>Enregistrée !</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" strokeWidth={2} />
                    <span>Télécharger PNG</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
