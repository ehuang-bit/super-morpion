import { useState } from 'react';
import { Eye, Flame } from 'lucide-react';
import { demoControls } from './demoBackend';
import type { DemoBotMode } from './demoMode';

export interface DemoPanelProps {
  onSpectateMatch?: (code: string) => void;
  demoLoggedIn?: boolean;
  onToggleDemoAccount?: () => void;
}

const BOT_MODES: readonly { id: DemoBotMode; label: string; hint: string }[] = [
  { id: 'facile', label: 'Facile', hint: 'Joue au hasard' },
  { id: 'fort', label: 'Fort', hint: 'Capture et bloque' },
  { id: 'absent', label: 'Absent', hint: 'Ne joue jamais : laisse filer ses 25 s' },
];

/**
 * Panneau flottant du mode démo (développement uniquement) : règle
 * l'adversaire simulé, teste les nouvelles fonctions et force une fin de
 * partie pour voir les animations.
 */
export default function DemoPanel({
  onSpectateMatch,
  demoLoggedIn = false,
  onToggleDemoAccount,
}: DemoPanelProps = {}) {
  const [open, setOpen] = useState(false);
  const [botMode, setBotMode] = useState<DemoBotMode>(() => demoControls.getBotMode());
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'danger' } | null>(null);

  const finish = (result: 'win' | 'loss' | 'draw', promotion = false) => {
    const ok = demoControls.finish(result, { promotion });
    setNotice(ok ? null : { text: 'Lance d’abord une partie.', tone: 'danger' });
  };

  const handleSpectateMatch = () => {
    const code = demoControls.prepareSpectatorMatch();
    if (onSpectateMatch) {
      onSpectateMatch(code);
      setNotice(null);
      setOpen(false);
      return;
    }
    setNotice({ text: `Match spectateur prêt (#${code}).`, tone: 'info' });
  };

  const buttonStyle = {
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-main)',
  } as const;

  return (
    <div
      className="fixed right-2 bottom-[4.5rem] lg:bottom-2 z-[90] rounded-[12px] text-xs select-none"
      style={{
        backgroundColor: 'var(--bg-board)',
        color: 'var(--text-primary)',
        border: '1px dashed var(--accent-active)',
        boxShadow: 'var(--shadow-card)',
        maxWidth: 272,
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

          <div
            className="pt-2 border-t flex flex-col gap-1.5"
            style={{ borderColor: 'var(--border-cell)' }}
          >
            <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>
              Nouvelles fonctions
            </p>
            <button
              type="button"
              onClick={handleSpectateMatch}
              className="tactile-btn w-full rounded-md px-2.5 py-1.5 font-semibold flex items-center gap-1.5 text-left"
              style={buttonStyle}
            >
              <Eye className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent-active-text)' }} />
              <span className="truncate">Observer un match (Spectateur)</span>
            </button>
            <button
              type="button"
              aria-pressed={demoLoggedIn}
              onClick={() => {
                onToggleDemoAccount?.();
                setNotice(null);
              }}
              className="tactile-btn w-full rounded-md px-2.5 py-1.5 font-semibold flex items-center justify-between gap-2 text-left"
              style={
                demoLoggedIn
                  ? {
                      backgroundColor: 'var(--accent-active-bg)',
                      color: 'var(--accent-active-text)',
                      border: '1px solid var(--accent-active)',
                    }
                  : buttonStyle
              }
            >
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <Flame className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {demoLoggedIn ? 'Passer en invité' : 'Compte démo (Streak)'}
                </span>
              </span>
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
                style={{
                  backgroundColor: demoLoggedIn ? 'var(--bg-board)' : 'var(--bg-recessed)',
                  color: demoLoggedIn ? 'var(--accent-active-text)' : 'var(--text-muted)',
                }}
              >
                {demoLoggedIn ? 'Compte actif' : 'Mode invité'}
              </span>
            </button>
          </div>

          {notice && (
            <p
              role="status"
              style={{
                color: notice.tone === 'danger' ? 'var(--danger-color)' : 'var(--accent-active-text)',
              }}
            >
              {notice.text}
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
