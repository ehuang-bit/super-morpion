import { useState } from 'react';
import { demoControls } from './demoBackend';
import type { DemoBotMode } from './demoMode';

const BOT_MODES: readonly { id: DemoBotMode; label: string; hint: string }[] = [
  { id: 'facile', label: 'Facile', hint: 'Joue au hasard' },
  { id: 'fort', label: 'Fort', hint: 'Capture et bloque' },
  { id: 'absent', label: 'Absent', hint: 'Ne joue jamais : laisse filer ses 25 s' },
];

/**
 * Panneau flottant du mode démo (développement uniquement) : règle
 * l'adversaire simulé et force une fin de partie pour voir les animations.
 */
export default function DemoPanel() {
  const [open, setOpen] = useState(false);
  const [botMode, setBotMode] = useState<DemoBotMode>(() => demoControls.getBotMode());
  const [message, setMessage] = useState<string | null>(null);

  const finish = (result: 'win' | 'loss' | 'draw', promotion = false) => {
    const ok = demoControls.finish(result, { promotion });
    setMessage(ok ? null : 'Lance d’abord une partie.');
  };

  const buttonStyle = {
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-main)',
  } as const;

  return (
    <div
      className="fixed right-2 bottom-2 z-[90] rounded-[12px] text-xs select-none"
      style={{
        backgroundColor: 'var(--bg-board)',
        color: 'var(--text-primary)',
        border: '1px dashed var(--accent-active)',
        boxShadow: 'var(--shadow-card)',
        maxWidth: 252,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 font-semibold"
      >
        <span>Mode démo</span>
        <span style={{ color: 'var(--text-muted)' }}>{open ? 'Réduire' : 'Ouvrir'}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 flex flex-col gap-2.5">
          <div>
            <p className="mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
              Adversaire simulé
            </p>
            <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Adversaire simulé">
              {BOT_MODES.map((mode) => {
                const selected = mode.id === botMode;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    title={mode.hint}
                    onClick={() => {
                      demoControls.setBotMode(mode.id);
                      setBotMode(mode.id);
                    }}
                    className="tactile-btn rounded-md px-1.5 py-1.5 font-semibold"
                    style={{
                      backgroundColor: selected ? 'var(--accent-active-bg)' : 'var(--bg-surface)',
                      color: selected ? 'var(--accent-active-text)' : 'var(--text-secondary)',
                      border: `1px solid ${selected ? 'var(--accent-active)' : 'var(--border-cell)'}`,
                    }}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
              Terminer la partie en cours
            </p>
            <div className="grid grid-cols-2 gap-1">
              <button type="button" className="tactile-btn rounded-md px-2 py-1.5 font-semibold" style={buttonStyle} onClick={() => finish('win')}>
                Victoire
              </button>
              <button type="button" className="tactile-btn rounded-md px-2 py-1.5 font-semibold" style={buttonStyle} onClick={() => finish('loss')}>
                Défaite
              </button>
              <button type="button" className="tactile-btn rounded-md px-2 py-1.5 font-semibold" style={buttonStyle} onClick={() => finish('draw')}>
                Match nul
              </button>
              <button type="button" className="tactile-btn rounded-md px-2 py-1.5 font-semibold" style={buttonStyle} onClick={() => finish('win', true)}>
                Promotion
              </button>
            </div>
          </div>

          {message && (
            <p role="status" style={{ color: 'var(--danger-color)' }}>
              {message}
            </p>
          )}
          <p style={{ color: 'var(--text-muted)' }}>
            Visible uniquement en développement. Les parties, comptes et classements sont fictifs.
          </p>
        </div>
      )}
    </div>
  );
}
