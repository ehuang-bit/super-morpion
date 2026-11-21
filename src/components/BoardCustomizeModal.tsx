import { useEffect } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { RotateCcw, X } from 'lucide-react';
import {
  BOARD_MATERIALS,
  BOARD_SHAPES,
  DEFAULT_BOARD_PREFS,
  PIECE_STYLES,
  type BoardPreferences,
} from '../types/boardPrefs';
import {
  THEMES,
  getOriginFromElement,
  type ThemeId,
  type ThemeTransitionOrigin,
} from '../types/theme';
import { CHIP_SPRING, MODAL_TRANSITION } from '../utils/motion';
import { SymbolMark } from './Symbols';

interface BoardCustomizeModalProps {
  open: boolean;
  onClose: () => void;
  theme: ThemeId;
  onChangeTheme: (theme: ThemeId, origin?: ThemeTransitionOrigin) => void;
  boardPrefs: BoardPreferences;
  onChangeBoardPrefs: (next: BoardPreferences) => void;
}

export function BoardCustomizeModal({
  open,
  onClose,
  theme,
  onChangeTheme,
  boardPrefs,
  onChangeBoardPrefs,
}: BoardCustomizeModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const isStrict = boardPrefs.boardShape === 'strict';
  const shellRadius = isStrict ? 'rounded-[6px]' : 'rounded-[14px]';
  const subRadius = isStrict ? 'rounded-[4px]' : 'rounded-[9px]';
  const cellRadius = isStrict ? 'rounded-[2px]' : 'rounded-[4px]';
  const materialClass =
    boardPrefs.boardMaterial === 'gravure' ? 'board-material-gravure' : '';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="customize-modal-title"
        >
          <div className="absolute inset-0 bg-black/45" onClick={onClose} />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={MODAL_TRANSITION}
            className="relative z-10 w-full max-w-[540px] max-h-[90dvh] overflow-y-auto rounded-[16px] p-4 sm:p-5 flex flex-col gap-4"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-board)',
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="customize-modal-title"
                  className="text-base sm:text-lg font-bold tracking-tight"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Personnaliser le plateau
                </h2>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Aperçu instantané, conservé entre vos parties.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer la personnalisation"
                className="tactile-btn inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-main)',
                }}
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>

            {/* Live Preview Strip */}
            <div
              className="rounded-[12px] p-3 flex items-center justify-center"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-cell)',
              }}
            >
              <div
                className={`w-full max-w-[232px] aspect-[2/1] box-border overflow-hidden ${shellRadius} ${materialClass} p-1.5 grid grid-cols-2 grid-rows-1 gap-1.5`}
                style={{
                  backgroundColor: 'var(--bg-recessed)',
                  border: '1px solid var(--border-main)',
                }}
              >
                {/* Left sub-board: active with live pieces & projector */}
                <div
                  className={`relative w-full h-full min-h-0 min-w-0 box-border ${subRadius} p-1`}
                  style={{
                    backgroundColor: 'var(--bg-board)',
                    border: '2px solid var(--accent-active)',
                    boxShadow: 'var(--shadow-active)',
                  }}
                >
                  {boardPrefs.showCoords && (
                    <span
                      className="absolute top-0.5 left-1 font-mono text-[8px] leading-none opacity-55"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      A1
                    </span>
                  )}
                  <div className="grid grid-cols-3 grid-rows-3 w-full h-full min-h-0 min-w-0 gap-[2px]">
                    {(
                      ['X', null, 'O', null, 'X', null, null, 'O', null] as const
                    ).map((val, idx) => (
                      <div
                        key={idx}
                        className={`relative w-full h-full min-h-0 min-w-0 overflow-hidden box-border ${cellRadius}`}
                        style={{
                          backgroundColor:
                            idx === 4
                              ? 'var(--accent-active-bg)'
                              : 'var(--bg-surface)',
                          border: `1px solid ${
                            idx === 4
                              ? 'var(--accent-active)'
                              : 'var(--border-cell)'
                          }`,
                        }}
                      >
                        <span className="pointer-events-none absolute inset-[15%] flex items-center justify-center">
                          {val ? (
                            <SymbolMark
                              player={val}
                              size="cell"
                              pieceStyle={boardPrefs.pieceStyle}
                            />
                          ) : idx === 1 && boardPrefs.showProjector ? (
                            <SymbolMark
                              player="X"
                              size="cell"
                              pieceStyle={boardPrefs.pieceStyle}
                              ghost
                            />
                          ) : null}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right sub-board: alternating material + captured emblem */}
                <div
                  className={`relative w-full h-full min-h-0 min-w-0 box-border ${subRadius} p-1 flex items-center justify-center`}
                  style={{
                    backgroundColor:
                      boardPrefs.boardMaterial === 'damier'
                        ? 'var(--bg-surface)'
                        : 'var(--x-surface)',
                    border: '1px solid color-mix(in srgb, var(--x-color) 40%, transparent)',
                  }}
                >
                  {boardPrefs.showCoords && (
                    <span
                      className="absolute top-0.5 left-1 font-mono text-[8px] leading-none opacity-55"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      B1
                    </span>
                  )}
                  <div className="w-12 h-12">
                    <SymbolMark
                      player="X"
                      size="captured"
                      pieceStyle={boardPrefs.pieceStyle}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 1. Palettes */}
            <div>
              <span
                className="block text-xs font-semibold mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Palette de couleurs
              </span>
              <LayoutGroup id="theme-modal">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {THEMES.map((item) => {
                    const selected = item.id === theme;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={(e) =>
                          onChangeTheme(item.id, getOriginFromElement(e.currentTarget))
                        }
                        aria-pressed={selected}
                        className="tactile-btn relative rounded-[10px] px-2.5 py-2 text-left flex items-center gap-2"
                        style={{
                          backgroundColor: selected
                            ? 'var(--bg-recessed)'
                            : 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          border: '1.5px solid var(--border-cell)',
                        }}
                      >
                        {selected && (
                          <motion.span
                            layoutId="theme-modal-ring"
                            transition={CHIP_SPRING}
                            aria-hidden="true"
                            className="pointer-events-none absolute -inset-[1.5px] rounded-[10px]"
                            style={{ border: '1.5px solid var(--accent-active)' }}
                          />
                        )}
                        <span className="relative z-10 inline-flex items-center -space-x-1 shrink-0">
                          <span
                            className="w-3 h-3 rounded-full border border-black/15"
                            style={{ backgroundColor: item.swatches.canvas }}
                          />
                          <span
                            className="w-3 h-3 rounded-full border border-black/15"
                            style={{ backgroundColor: item.swatches.x }}
                          />
                          <span
                            className="w-3 h-3 rounded-full border border-black/15"
                            style={{ backgroundColor: item.swatches.o }}
                          />
                        </span>
                        <span className="relative z-10 min-w-0">
                          <span className="block text-xs font-semibold truncate">
                            {item.label}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </LayoutGroup>
            </div>

            {/* 2. Style des pièces */}
            <div>
              <span
                className="block text-xs font-semibold mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Style des pièces
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PIECE_STYLES.map((style) => {
                  const selected = boardPrefs.pieceStyle === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() =>
                        onChangeBoardPrefs({ ...boardPrefs, pieceStyle: style.id })
                      }
                      aria-pressed={selected}
                      className="tactile-btn rounded-[10px] p-2.5 flex flex-col items-center gap-1.5 text-center"
                      style={{
                        backgroundColor: selected
                          ? 'var(--bg-recessed)'
                          : 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        border: `1.5px solid ${
                          selected ? 'var(--accent-active)' : 'var(--border-cell)'
                        }`,
                      }}
                    >
                      <div className="flex items-center gap-1.5 h-6">
                        <div className="w-5 h-5">
                          <SymbolMark
                            player="X"
                            size="badge"
                            pieceStyle={style.id}
                          />
                        </div>
                        <div className="w-5 h-5">
                          <SymbolMark
                            player="O"
                            size="badge"
                            pieceStyle={style.id}
                          />
                        </div>
                      </div>
                      <span className="text-xs font-semibold leading-tight">
                        {style.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Matière & 4. Angles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span
                  className="block text-xs font-semibold mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Surface du plateau
                </span>
                <div
                  className="grid grid-cols-3 gap-1 p-1 rounded-[10px]"
                  style={{
                    backgroundColor: 'var(--bg-recessed)',
                    border: '1px solid var(--border-cell)',
                  }}
                >
                  {BOARD_MATERIALS.map((mat) => {
                    const selected = boardPrefs.boardMaterial === mat.id;
                    return (
                      <button
                        key={mat.id}
                        type="button"
                        onClick={() =>
                          onChangeBoardPrefs({
                            ...boardPrefs,
                            boardMaterial: mat.id,
                          })
                        }
                        aria-pressed={selected}
                        className="tactile-btn rounded-[7px] px-1.5 py-1.5 text-[11px] font-semibold truncate"
                        style={{
                          backgroundColor: selected
                            ? 'var(--bg-board)'
                            : 'transparent',
                          color: selected
                            ? 'var(--text-primary)'
                            : 'var(--text-secondary)',
                          boxShadow: selected ? 'var(--shadow-card)' : 'none',
                        }}
                      >
                        {mat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span
                  className="block text-xs font-semibold mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Géométrie des angles
                </span>
                <div
                  className="grid grid-cols-2 gap-1 p-1 rounded-[10px]"
                  style={{
                    backgroundColor: 'var(--bg-recessed)',
                    border: '1px solid var(--border-cell)',
                  }}
                >
                  {BOARD_SHAPES.map((shape) => {
                    const selected = boardPrefs.boardShape === shape.id;
                    return (
                      <button
                        key={shape.id}
                        type="button"
                        onClick={() =>
                          onChangeBoardPrefs({ ...boardPrefs, boardShape: shape.id })
                        }
                        aria-pressed={selected}
                        className="tactile-btn rounded-[7px] px-2 py-1.5 text-[11px] font-semibold truncate"
                        style={{
                          backgroundColor: selected
                            ? 'var(--bg-board)'
                            : 'transparent',
                          color: selected
                            ? 'var(--text-primary)'
                            : 'var(--text-secondary)',
                          boxShadow: selected ? 'var(--shadow-card)' : 'none',
                        }}
                      >
                        {shape.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 5. Aides tactiques */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={boardPrefs.showCoords}
                onClick={() =>
                  onChangeBoardPrefs({
                    ...boardPrefs,
                    showCoords: !boardPrefs.showCoords,
                  })
                }
                className="tactile-btn rounded-[10px] px-3 py-2 flex items-center justify-between gap-2 text-left"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-cell)',
                }}
              >
                <span
                  className="text-xs font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Coordonnées A1–C3
                </span>
                <span
                  className="rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold"
                  style={{
                    backgroundColor: boardPrefs.showCoords
                      ? 'var(--x-surface)'
                      : 'var(--bg-recessed)',
                    color: boardPrefs.showCoords
                      ? 'var(--x-color)'
                      : 'var(--text-muted)',
                  }}
                >
                  {boardPrefs.showCoords ? 'Oui' : 'Non'}
                </span>
              </button>

              <button
                type="button"
                role="switch"
                aria-checked={boardPrefs.showProjector}
                onClick={() =>
                  onChangeBoardPrefs({
                    ...boardPrefs,
                    showProjector: !boardPrefs.showProjector,
                  })
                }
                className="tactile-btn rounded-[10px] px-3 py-2 flex items-center justify-between gap-2 text-left"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-cell)',
                }}
              >
                <span
                  className="text-xs font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Projecteur au survol
                </span>
                <span
                  className="rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold"
                  style={{
                    backgroundColor: boardPrefs.showProjector
                      ? 'var(--x-surface)'
                      : 'var(--bg-recessed)',
                    color: boardPrefs.showProjector
                      ? 'var(--x-color)'
                      : 'var(--text-muted)',
                  }}
                >
                  {boardPrefs.showProjector ? 'Oui' : 'Non'}
                </span>
              </button>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={(e) => {
                  onChangeTheme('atelier', getOriginFromElement(e.currentTarget));
                  onChangeBoardPrefs({ ...DEFAULT_BOARD_PREFS });
                }}
                className="tactile-btn inline-flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-main)',
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Réinitialiser</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="tactile-btn rounded-[9px] px-4 py-2 text-xs sm:text-sm font-semibold"
                style={{
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-text)',
                }}
              >
                Terminer
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
