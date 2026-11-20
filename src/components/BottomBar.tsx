import { useEffect, useState } from 'react';
import {
  BookOpen,
  Flag,
  LogOut,
  RotateCcw,
  SlidersHorizontal,
  Vibrate,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { THEMES, type ThemeId } from '../types/theme';

interface BottomBarProps {
  theme: ThemeId;
  onChangeTheme: (theme: ThemeId) => void;
  onOpenCustomize: () => void;
  muted: boolean;
  onToggleMute: () => void;
  hapticsEnabled: boolean;
  onToggleHaptics: () => void;
  onOpenRules: () => void;
  inGame: boolean;
  phase?: 'waiting' | 'playing' | 'finished';
  onResign?: () => void;
  onRematch?: () => void;
  onLeave?: () => void;
  rematchVoted?: boolean;
}

export function BottomBar({
  theme,
  onChangeTheme,
  onOpenCustomize,
  muted,
  onToggleMute,
  hapticsEnabled,
  onToggleHaptics,
  onOpenRules,
  inGame,
  phase,
  onResign,
  onRematch,
  onLeave,
  rematchVoted = false,
}: BottomBarProps) {
  const [confirmResign, setConfirmResign] = useState(false);

  useEffect(() => {
    if (!confirmResign) return;
    const timer = window.setTimeout(() => setConfirmResign(false), 3200);
    return () => window.clearTimeout(timer);
  }, [confirmResign]);

  useEffect(() => {
    setConfirmResign(false);
  }, [phase]);

  // Show first 3 quick swatches on bar + full 5 palettes inside Plateau customize studio
  const quickThemes = THEMES.slice(0, 3);

  return (
    <footer className="w-full max-w-[580px] mx-auto px-2 sm:px-0">
      <div
        className="flex items-center justify-between gap-1.5 sm:gap-2 rounded-[12px] px-2 sm:px-2.5 py-1.5"
        style={{
          backgroundColor: 'var(--bg-board)',
          border: '1px solid var(--border-main)',
        }}
      >
        {/* Quick theme switches + Plateau customizer */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <div
            className="flex items-center gap-0.5 sm:gap-1"
            role="group"
            aria-label="Sélection rapide de thème"
          >
            {quickThemes.map((item) => {
              const active = item.id === theme;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeTheme(item.id)}
                  title={`${item.label} — ${item.description}`}
                  aria-label={`Thème ${item.label}`}
                  aria-pressed={active}
                  className="tactile-btn inline-flex items-center justify-center gap-1.5 rounded-lg px-1.5 py-1.5 text-xs font-medium min-h-[34px]"
                  style={{
                    backgroundColor: active ? 'var(--bg-recessed)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: `1px solid ${active ? 'var(--border-strong)' : 'transparent'}`,
                  }}
                >
                  <span className="inline-flex items-center -space-x-1" aria-hidden="true">
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/15"
                      style={{ backgroundColor: item.swatches.canvas }}
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/15"
                      style={{ backgroundColor: item.swatches.x }}
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/15"
                      style={{ backgroundColor: item.swatches.o }}
                    />
                  </span>
                  <span className="hidden md:inline">{item.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onOpenCustomize}
            title="Personnaliser le plateau, les pièces et les couleurs"
            aria-label="Personnaliser le plateau"
            className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium min-h-[34px]"
            style={{
              backgroundColor:
                theme === 'kyoto' || theme === 'emeraude'
                  ? 'var(--bg-recessed)'
                  : 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: `1px solid ${
                theme === 'kyoto' || theme === 'emeraude'
                  ? 'var(--border-strong)'
                  : 'var(--border-cell)'
              }`,
            }}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.8} />
            <span className={!inGame ? 'inline' : 'hidden sm:inline'}>
              Plateau
            </span>
          </button>
        </div>

        {/* Utility & match controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Activer le son' : 'Couper le son'}
            title={muted ? 'Activer le son' : 'Couper le son'}
            className="tactile-btn inline-flex items-center justify-center rounded-lg px-2 py-1.5 min-w-[34px] min-h-[34px]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: muted ? 'var(--text-muted)' : 'var(--text-primary)',
              border: '1px solid var(--border-cell)',
            }}
          >
            {muted ? (
              <VolumeX className="w-4 h-4" strokeWidth={1.75} />
            ) : (
              <Volume2 className="w-4 h-4" strokeWidth={1.75} />
            )}
          </button>

          <button
            type="button"
            onClick={onToggleHaptics}
            aria-pressed={hapticsEnabled}
            aria-label={
              hapticsEnabled
                ? 'Désactiver les vibrations'
                : 'Activer les vibrations'
            }
            title={
              hapticsEnabled
                ? 'Vibrations tactiles activées (mobile)'
                : 'Vibrations tactiles coupées'
            }
            className="tactile-btn inline-flex items-center justify-center rounded-lg px-2 py-1.5 min-w-[34px] min-h-[34px]"
            style={{
              backgroundColor: hapticsEnabled
                ? 'var(--bg-surface)'
                : 'transparent',
              color: hapticsEnabled ? 'var(--text-primary)' : 'var(--text-muted)',
              border: `1px solid ${
                hapticsEnabled ? 'var(--border-cell)' : 'var(--border-main)'
              }`,
              opacity: hapticsEnabled ? 1 : 0.72,
            }}
          >
            <Vibrate className="w-4 h-4" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={onOpenRules}
            aria-label="Règles en 15s"
            title="Règles en 15s"
            className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-2 sm:px-2.5 py-1.5 text-xs font-medium min-h-[34px]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-cell)',
            }}
          >
            <BookOpen className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span className={!inGame ? 'sm:hidden' : 'hidden'}>Règles</span>
            <span className="hidden sm:inline">Règles en 15s</span>
          </button>

          {inGame && phase === 'playing' && onResign && (
            <button
              type="button"
              onClick={() => {
                if (!confirmResign) {
                  setConfirmResign(true);
                  return;
                }
                setConfirmResign(false);
                onResign();
              }}
              aria-label={confirmResign ? 'Confirmer abandon' : 'Abandonner'}
              title={confirmResign ? 'Confirmer abandon' : 'Abandonner la partie'}
              className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-2 sm:px-2.5 py-1.5 text-xs font-medium min-h-[34px]"
              style={{
                backgroundColor: confirmResign ? 'var(--danger-bg)' : 'var(--bg-surface)',
                color: confirmResign ? 'var(--danger-color)' : 'var(--text-secondary)',
                border: `1px solid ${
                  confirmResign ? 'var(--danger-color)' : 'var(--border-cell)'
                }`,
              }}
            >
              <Flag className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span className={confirmResign ? 'inline' : 'hidden sm:inline'}>
                {confirmResign ? 'Confirmer' : 'Abandonner'}
              </span>
            </button>
          )}

          {inGame && phase === 'finished' && onRematch && (
            <button
              type="button"
              onClick={onRematch}
              disabled={rematchVoted}
              className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold min-h-[34px] disabled:opacity-60"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.9} />
              <span>{rematchVoted ? 'Attente…' : 'Revanche'}</span>
            </button>
          )}

          {inGame && onLeave && (
            <button
              type="button"
              onClick={onLeave}
              aria-label="Quitter la partie"
              title="Quitter vers l’accueil"
              className="tactile-btn inline-flex items-center justify-center rounded-lg px-2 py-1.5 min-w-[34px] min-h-[34px]"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-cell)',
              }}
            >
              <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}
