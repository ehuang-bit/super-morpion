import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { MODAL_TRANSITION } from '../utils/motion';

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
  /** Lance le tutoriel guidé sur le plateau d'essai. */
  onStartTutorial?: () => void;
}

export function RulesModal({ open, onClose, onStartTutorial }: RulesModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

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
          aria-labelledby="rules-modal-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/45"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={MODAL_TRANSITION}
            className="relative z-10 w-full max-w-[680px] rounded-[16px] p-5 sm:p-6"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-board)',
            }}
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2
                  id="rules-modal-title"
                  className="text-lg font-bold tracking-tight"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Règles en 15 secondes
                </h2>
                <p
                  className="text-sm mt-0.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Chaque case choisie dicte la zone du coup suivant.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer les règles"
                className="tactile-btn inline-flex items-center justify-center w-9 h-9 rounded-lg"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-main)',
                }}
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* Step 1: Le renvoi */}
              <div
                className="rounded-[12px] p-3.5 flex flex-col gap-3"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-cell)',
                }}
              >
                <svg viewBox="0 0 120 96" className="w-full h-24" aria-hidden="true">
                  {/* Left subboard (A2) */}
                  <rect
                    x="8"
                    y="16"
                    width="44"
                    height="44"
                    rx="5"
                    fill="var(--bg-board)"
                    stroke="var(--border-strong)"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M22.6 18v40M37.3 18v40M10 30.6h40M10 45.3h40"
                    stroke="var(--border-cell)"
                    strokeWidth="1"
                  />
                  {/* Played X in top-right cell */}
                  <path
                    d="M40.5 20.5l7 7M47.5 20.5l-7 7"
                    stroke="var(--x-color)"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                  {/* Right global board showing top-right active */}
                  <rect
                    x="68"
                    y="16"
                    width="44"
                    height="44"
                    rx="5"
                    fill="var(--bg-board)"
                    stroke="var(--border-strong)"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M82.6 18v40M97.3 18v40M70 30.6h40M70 45.3h40"
                    stroke="var(--border-cell)"
                    strokeWidth="1"
                  />
                  <rect
                    x="97.8"
                    y="16.8"
                    width="13.4"
                    height="13.4"
                    rx="2.5"
                    fill="var(--accent-active-bg)"
                    stroke="var(--accent-active)"
                    strokeWidth="2"
                  />
                  {/* Redirect arc */}
                  <path
                    d="M49 20 C66 6, 86 6, 102 14"
                    fill="none"
                    stroke="var(--accent-active)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M98.5 11.5 L103 14.5 L98.5 16.5"
                    fill="none"
                    stroke="var(--accent-active)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <text
                    x="30"
                    y="78"
                    textAnchor="middle"
                    fontSize="8.5"
                    fill="var(--text-muted)"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    Case C1
                  </text>
                  <text
                    x="90"
                    y="78"
                    textAnchor="middle"
                    fontSize="8.5"
                    fill="var(--accent-active-text)"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    → Zone C1
                  </text>
                </svg>
                <div>
                  <h3
                    className="text-sm font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    1. Le renvoi
                  </h3>
                  <p
                    className="text-xs leading-relaxed mt-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    La position de votre case envoie l’adversaire dans la sous-grille correspondante.
                  </p>
                </div>
              </div>

              {/* Step 2: Le coup libre */}
              <div
                className="rounded-[12px] p-3.5 flex flex-col gap-3"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-cell)',
                }}
              >
                <svg viewBox="0 0 120 96" className="w-full h-24" aria-hidden="true">
                  <rect
                    x="32"
                    y="12"
                    width="56"
                    height="56"
                    rx="6"
                    fill="var(--bg-board)"
                    stroke="var(--border-strong)"
                    strokeWidth="1.5"
                  />
                  {/* 3x3 mini zones, center is locked by X, rest highlighted */}
                  {[0, 1, 2, 3, 5, 6, 7, 8].map((idx) => {
                    const r = Math.floor(idx / 3);
                    const c = idx % 3;
                    return (
                      <rect
                        key={idx}
                        x={34.5 + c * 17.5}
                        y={14.5 + r * 17.5}
                        width="16"
                        height="16"
                        rx="2.5"
                        fill="var(--accent-active-bg)"
                        stroke="var(--accent-active)"
                        strokeWidth="1.2"
                      />
                    );
                  })}
                  {/* Center locked board */}
                  <rect
                    x={34.5 + 17.5}
                    y={14.5 + 17.5}
                    width="16"
                    height="16"
                    rx="2.5"
                    fill="var(--x-surface)"
                    stroke="var(--x-color)"
                    strokeWidth="1.4"
                  />
                  <path
                    d="M56 36l8 8M64 36l-8 8"
                    stroke="var(--x-color)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <text
                    x="60"
                    y="82"
                    textAnchor="middle"
                    fontSize="8.5"
                    fill="var(--accent-active-text)"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    Coup libre actif
                  </text>
                </svg>
                <div>
                  <h3
                    className="text-sm font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    2. Le coup libre
                  </h3>
                  <p
                    className="text-xs leading-relaxed mt-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Si la zone ciblée est déjà gagnée ou pleine, vous pouvez jouer dans n’importe quelle zone libre.
                  </p>
                </div>
              </div>

              {/* Step 3: Capture & Victoire */}
              <div
                className="rounded-[12px] p-3.5 flex flex-col gap-3"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-cell)',
                }}
              >
                <svg viewBox="0 0 120 96" className="w-full h-24" aria-hidden="true">
                  {/* Left: 3 in local captures zone */}
                  <rect
                    x="8"
                    y="16"
                    width="44"
                    height="44"
                    rx="5"
                    fill="var(--o-surface)"
                    stroke="var(--o-color)"
                    strokeWidth="1.5"
                  />
                  <circle cx="17" cy="25" r="4" fill="none" stroke="var(--o-color)" strokeWidth="2" />
                  <circle cx="30" cy="38" r="4" fill="none" stroke="var(--o-color)" strokeWidth="2" />
                  <circle cx="43" cy="51" r="4" fill="none" stroke="var(--o-color)" strokeWidth="2" />
                  <line
                    x1="14"
                    y1="22"
                    x2="46"
                    y2="54"
                    stroke="var(--o-color)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    opacity="0.65"
                  />

                  {/* Right: 3 zones win match */}
                  <rect
                    x="68"
                    y="16"
                    width="44"
                    height="44"
                    rx="5"
                    fill="var(--bg-board)"
                    stroke="var(--border-strong)"
                    strokeWidth="1.5"
                  />
                  {[0, 1, 2].map((col) => (
                    <g key={col}>
                      <rect
                        x={70.5 + col * 13.5}
                        y="18.5"
                        width="12"
                        height="12"
                        rx="2"
                        fill="var(--x-surface)"
                        stroke="var(--x-color)"
                        strokeWidth="1.1"
                      />
                      <path
                        d={`M${73.5 + col * 13.5} 21.5l6 6M${79.5 + col * 13.5} 21.5l-6 6`}
                        stroke="var(--x-color)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </g>
                  ))}
                  <line
                    x1="73"
                    y1="24.5"
                    x2="107"
                    y2="24.5"
                    stroke="var(--x-color)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <text
                    x="30"
                    y="78"
                    textAnchor="middle"
                    fontSize="7.8"
                    fill="var(--text-muted)"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    Zone prise
                  </text>
                  <text
                    x="91"
                    y="78"
                    textAnchor="middle"
                    fontSize="7.8"
                    fill="var(--x-color)"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    3 = Victoire
                  </text>
                </svg>
                <div>
                  <h3
                    className="text-sm font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    3. Capture et victoire
                  </h3>
                  <p
                    className="text-xs leading-relaxed mt-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Alignez 3 symboles pour verrouiller une zone, puis alignez 3 zones pour gagner.
                  </p>
                </div>
              </div>
            </div>

            <p
              className="mt-4 rounded-[10px] px-3 py-2 text-xs leading-relaxed"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-cell)',
              }}
            >
              <strong style={{ color: 'var(--text-primary)' }}>25 secondes par coup.</strong>{' '}
              Le liséré autour du plateau indique le temps restant. S’il se vide, un coup
              aléatoire est joué à votre place ; deux dépassements d’affilée font perdre la
              partie au temps.
            </p>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {onStartTutorial && (
                <button
                  type="button"
                  onClick={onStartTutorial}
                  className="tactile-btn rounded-xl px-4 py-2 text-sm font-semibold"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-main)',
                  }}
                >
                  Apprendre en jouant
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="tactile-btn rounded-xl px-4 py-2 text-sm font-semibold"
                style={{
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-text)',
                }}
              >
                Compris, jouer
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
