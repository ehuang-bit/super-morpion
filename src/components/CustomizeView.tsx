import { useCallback, useState } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import {
  applyMove,
  createInitialState,
  type GameState,
  type Move,
} from '@shared/gameEngine';
import { ArrowLeft, Palette, RotateCcw, Sparkles } from 'lucide-react';
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
import { haptics } from '../utils/haptics';
import { CHIP_SPRING } from '../utils/motion';
import { soundEngine } from '../utils/soundEngine';
import { GlobalBoard } from './GlobalBoard';
import { SymbolMark } from './Symbols';

interface CustomizeViewProps {
  theme: ThemeId;
  onChangeTheme: (theme: ThemeId, origin?: ThemeTransitionOrigin) => void;
  boardPrefs: BoardPreferences;
  onChangeBoardPrefs: (next: BoardPreferences) => void;
  inActiveMatch: boolean;
  onBackToPlay: () => void;
  hapticsEnabled?: boolean;
  onToggleHaptics?: () => void;
}

/** Position d'exposition : zone A1 prise par X, C3 par O, zone centrale B2 active. */
const SHOWCASE_MOVES: readonly Move[] = [
  { boardIndex: 0, cellIndex: 2 },
  { boardIndex: 2, cellIndex: 8 },
  { boardIndex: 8, cellIndex: 0 },
  { boardIndex: 0, cellIndex: 8 },
  { boardIndex: 8, cellIndex: 1 },
  { boardIndex: 1, cellIndex: 0 },
  { boardIndex: 0, cellIndex: 1 },
  { boardIndex: 1, cellIndex: 8 },
  { boardIndex: 8, cellIndex: 3 },
  { boardIndex: 3, cellIndex: 0 },
  { boardIndex: 0, cellIndex: 0 },
  { boardIndex: 8, cellIndex: 6 },
  { boardIndex: 6, cellIndex: 8 },
  { boardIndex: 8, cellIndex: 7 },
  { boardIndex: 7, cellIndex: 8 },
  { boardIndex: 8, cellIndex: 8 },
  { boardIndex: 4, cellIndex: 0 },
  { boardIndex: 4, cellIndex: 4 },
];

function buildShowcaseState(): GameState {
  let state = createInitialState('X');
  for (const move of SHOWCASE_MOVES) {
    const res = applyMove(state, move);
    if (res.ok) state = res.state;
  }
  return state;
}

export function CustomizeView({
  theme,
  onChangeTheme,
  boardPrefs,
  onChangeBoardPrefs,
  inActiveMatch,
  onBackToPlay,
  hapticsEnabled,
  onToggleHaptics,
}: CustomizeViewProps) {
  const [previewState, setPreviewState] = useState<GameState>(() =>
    buildShowcaseState(),
  );

  const activeThemeMeta = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  const isCustomPreviewDirty =
    previewState.moveHistory.length !== SHOWCASE_MOVES.length;
  const isDefaultConfig =
    theme === 'atelier' &&
    boardPrefs.pieceStyle === DEFAULT_BOARD_PREFS.pieceStyle &&
    boardPrefs.boardMaterial === DEFAULT_BOARD_PREFS.boardMaterial &&
    boardPrefs.boardShape === DEFAULT_BOARD_PREFS.boardShape &&
    boardPrefs.showCoords === DEFAULT_BOARD_PREFS.showCoords &&
    boardPrefs.showProjector === DEFAULT_BOARD_PREFS.showProjector;

  const handlePreviewMove = useCallback((move: Move) => {
    setPreviewState((prev) => {
      if (prev.status !== 'playing') {
        return buildShowcaseState();
      }
      const res = applyMove(prev, move, prev.currentPlayer);
      if (!res.ok) return prev;
      const last = res.state.moveHistory[res.state.moveHistory.length - 1];
      if (last?.capturedBoard) {
        soundEngine.playCapture(last.player);
        haptics.capture();
      } else {
        soundEngine.playMove(prev.currentPlayer);
        haptics.move();
      }
      return res.state;
    });
  }, []);

  const handleResetPreview = useCallback(() => {
    setPreviewState(buildShowcaseState());
    haptics.tap();
  }, []);

  return (
    <main className="w-full max-w-[1040px] mx-auto px-3 sm:px-6 py-4 sm:py-6 flex-1 flex flex-col gap-5">
      {/* En-tête de la page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Palette
              className="w-5 h-5 shrink-0"
              style={{ color: 'var(--accent-active-text)' }}
              strokeWidth={1.9}
            />
            <h1
              className="text-xl sm:text-2xl font-bold tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              Couleurs & plateau
            </h1>
          </div>
          <p
            className="text-xs sm:text-sm mt-0.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            Palette, style des pièces, matière et aides visuelles — sauvegardé
            automatiquement.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isDefaultConfig}
            onClick={(e) => {
              onChangeTheme('atelier', getOriginFromElement(e.currentTarget));
              onChangeBoardPrefs({ ...DEFAULT_BOARD_PREFS });
            }}
            className="tactile-btn inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-semibold disabled:opacity-45"
            style={{
              backgroundColor: 'var(--bg-board)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-main)',
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Réinitialiser</span>
          </button>

          <button
            type="button"
            onClick={onBackToPlay}
            className="tactile-btn inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-xs sm:text-sm font-semibold"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
            }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{inActiveMatch ? 'Retour à la partie' : 'Retour au plateau'}</span>
          </button>
        </div>
      </div>

      {/* Corps : contrôles à gauche, aperçu interactif fixe à droite (en haut sur téléphone) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_348px] gap-5 items-start">
        {/* Aperçu interactif */}
        <aside className="order-first lg:order-last lg:sticky lg:top-6 w-full">
          <div
            className="rounded-[16px] p-4 flex flex-col items-center gap-3"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div className="w-full flex items-center justify-between gap-2">
              <span
                className="inline-flex items-center gap-1.5 text-xs font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                <Sparkles
                  className="w-3.5 h-3.5"
                  style={{ color: 'var(--accent-active-text)' }}
                />
                <span>Aperçu en direct</span>
              </span>
              <span
                className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                style={{
                  backgroundColor: 'var(--accent-active-bg)',
                  color: 'var(--accent-active-text)',
                }}
              >
                {activeThemeMeta.label}
              </span>
            </div>

            <div className="w-full flex justify-center">
              <GlobalBoard
                gameState={previewState}
                canInteract
                boardPrefs={boardPrefs}
                variant="preview"
                onPlayMove={handlePreviewMove}
              />
            </div>

            <div className="w-full flex items-center justify-between gap-2 text-[11px]">
              <span style={{ color: 'var(--text-muted)' }}>
                Cliquez ou survolez une case pour tester.
              </span>
              {isCustomPreviewDirty && (
                <button
                  type="button"
                  onClick={handleResetPreview}
                  className="tactile-btn shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-cell)',
                  }}
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Remettre</span>
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Sections de personnalisation */}
        <div className="flex flex-col gap-4 min-w-0">
          {/* 1. Palettes de couleurs */}
          <section
            aria-labelledby="customize-palettes-heading"
            className="rounded-[16px] p-4 sm:p-5 flex flex-col gap-3"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2
                id="customize-palettes-heading"
                className="text-sm font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                Palette de couleurs
              </h2>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {activeThemeMeta.description}
              </span>
            </div>

            <LayoutGroup id="theme-page">
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
                      title={`${item.label} — ${item.description}`}
                      className="tactile-btn relative rounded-[12px] p-3 flex flex-col items-start gap-2 text-left"
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
                          layoutId="theme-page-ring"
                          transition={CHIP_SPRING}
                          aria-hidden="true"
                          className="pointer-events-none absolute -inset-[1.5px] rounded-[12px]"
                          style={{ border: '1.5px solid var(--accent-active)' }}
                        />
                      )}
                      <span className="relative z-10 inline-flex items-center -space-x-1">
                        <span
                          className="w-4 h-4 rounded-full border border-black/15"
                          style={{ backgroundColor: item.swatches.canvas }}
                        />
                        <span
                          className="w-4 h-4 rounded-full border border-black/15"
                          style={{ backgroundColor: item.swatches.x }}
                        />
                        <span
                          className="w-4 h-4 rounded-full border border-black/15"
                          style={{ backgroundColor: item.swatches.o }}
                        />
                        <span
                          className="w-4 h-4 rounded-full border border-black/15"
                          style={{ backgroundColor: item.swatches.active }}
                        />
                      </span>
                      <span className="relative z-10 text-xs font-bold leading-snug">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </LayoutGroup>
          </section>

          {/* 2. Style des pièces */}
          <section
            aria-labelledby="customize-pieces-heading"
            className="rounded-[16px] p-4 sm:p-5 flex flex-col gap-3"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <h2
              id="customize-pieces-heading"
              className="text-sm font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              Style des pièces
            </h2>

            <LayoutGroup id="piece-style-page">
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
                      className="tactile-btn relative rounded-[12px] p-3 flex flex-col items-center gap-1.5 text-center"
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
                          layoutId="piece-style-ring"
                          transition={CHIP_SPRING}
                          aria-hidden="true"
                          className="pointer-events-none absolute -inset-[1.5px] rounded-[12px]"
                          style={{ border: '1.5px solid var(--accent-active)' }}
                        />
                      )}
                      <div className="relative z-10 flex items-center gap-2 h-7">
                        <div className="w-6 h-6">
                          <SymbolMark
                            player="X"
                            size="badge"
                            pieceStyle={style.id}
                          />
                        </div>
                        <div className="w-6 h-6">
                          <SymbolMark
                            player="O"
                            size="badge"
                            pieceStyle={style.id}
                          />
                        </div>
                      </div>
                      <span className="relative z-10 text-xs font-bold leading-tight">
                        {style.label}
                      </span>
                      <span
                        className="relative z-10 text-[11px] leading-tight"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {style.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </LayoutGroup>
          </section>

          {/* 3. Surface & Géométrie */}
          <section
            aria-labelledby="customize-surface-heading"
            className="rounded-[16px] p-4 sm:p-5 flex flex-col gap-4"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <h2
              id="customize-surface-heading"
              className="text-sm font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              Matière & géométrie
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
              <div className="flex flex-col gap-1.5">
                <span
                  className="text-xs font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Surface du plateau
                </span>
                <LayoutGroup id="board-material-page">
                  <div
                    className="grid grid-cols-3 gap-1 p-1 rounded-[11px]"
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
                          title={mat.description}
                          className="tactile-btn relative rounded-[8px] px-1.5 py-2 text-[11.5px] font-semibold"
                          style={{
                            color: selected
                              ? 'var(--text-primary)'
                              : 'var(--text-secondary)',
                          }}
                        >
                          {selected && (
                            <motion.span
                              layoutId="board-material-pill"
                              transition={CHIP_SPRING}
                              aria-hidden="true"
                              className="absolute inset-0 rounded-[8px]"
                              style={{
                                backgroundColor: 'var(--bg-board)',
                                boxShadow: 'var(--shadow-card)',
                              }}
                            />
                          )}
                          <span className="relative z-10">{mat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </LayoutGroup>
              </div>

              <div className="flex flex-col gap-1.5">
                <span
                  className="text-xs font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Géométrie des angles
                </span>
                <LayoutGroup id="board-shape-page">
                  <div
                    className="grid grid-cols-2 gap-1 p-1 rounded-[11px]"
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
                          title={shape.description}
                          className="tactile-btn relative rounded-[8px] px-2 py-2 text-[11.5px] font-semibold"
                          style={{
                            color: selected
                              ? 'var(--text-primary)'
                              : 'var(--text-secondary)',
                          }}
                        >
                          {selected && (
                            <motion.span
                              layoutId="board-shape-pill"
                              transition={CHIP_SPRING}
                              aria-hidden="true"
                              className="absolute inset-0 rounded-[8px]"
                              style={{
                                backgroundColor: 'var(--bg-board)',
                                boxShadow: 'var(--shadow-card)',
                              }}
                            />
                          )}
                          <span className="relative z-10">{shape.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </LayoutGroup>
              </div>
            </div>
          </section>

          {/* 4. Aides tactiques */}
          <section
            aria-labelledby="customize-aids-heading"
            className="rounded-[16px] p-4 sm:p-5 flex flex-col gap-3"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <h2
              id="customize-aids-heading"
              className="text-sm font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              Repères & aides tactiques
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                className="tactile-btn rounded-[12px] p-3 flex items-center justify-between gap-3 text-left"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-cell)',
                }}
              >
                <span className="min-w-0">
                  <span
                    className="block text-xs font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Coordonnées A1–C3
                  </span>
                  <span
                    className="block text-[11px] mt-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Affiche les repères sur chaque zone
                  </span>
                </span>
                <span
                  className="shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold"
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
                className="tactile-btn rounded-[12px] p-3 flex items-center justify-between gap-3 text-left"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-cell)',
                }}
              >
                <span className="min-w-0">
                  <span
                    className="block text-xs font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Projecteur au survol
                  </span>
                  <span
                    className="block text-[11px] mt-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Prévisualise la zone cible du prochain coup
                  </span>
                </span>
                <span
                  className="shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold"
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

              {onToggleHaptics && typeof hapticsEnabled === 'boolean' && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={hapticsEnabled}
                  onClick={onToggleHaptics}
                  className="lg:hidden tactile-btn rounded-[12px] p-3 flex items-center justify-between gap-3 text-left"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-cell)',
                  }}
                >
                  <span className="min-w-0">
                    <span
                      className="block text-xs font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Vibrations haptiques
                    </span>
                    <span
                      className="block text-[11px] mt-0.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Retour tactile aux coups, captures et décompte
                    </span>
                  </span>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold"
                    style={{
                      backgroundColor: hapticsEnabled
                        ? 'var(--x-surface)'
                        : 'var(--bg-recessed)',
                      color: hapticsEnabled
                        ? 'var(--x-color)'
                        : 'var(--text-muted)',
                    }}
                  >
                    {hapticsEnabled ? 'Oui' : 'Non'}
                  </span>
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
