import { useState } from 'react';
import { motion } from 'framer-motion';
import type { EloMatchDelta } from '@shared/elo';
import type { Player } from '@shared/gameEngine';
import type { EndReason, RoomPlayer } from '@shared/protocol';
import { Eye, Home, RotateCcw } from 'lucide-react';
import { CHIP_SPRING } from '../utils/motion';

interface GameEndBannerProps {
  players: {
    X: RoomPlayer | null;
    O: RoomPlayer | null;
  };
  matchWinner: Player | null;
  endReason: EndReason | null;
  eloResult: {
    X: EloMatchDelta;
    O: EloMatchDelta;
  } | null;
  isOnline: boolean;
  selfVotedRematch: boolean;
  opponentVotedRematch: boolean;
  onRematch: () => void;
  onLeave: () => void;
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

export function GameEndBanner({
  players,
  matchWinner,
  endReason,
  eloResult,
  isOnline,
  selfVotedRematch,
  opponentVotedRematch,
  onRematch,
  onLeave,
}: GameEndBannerProps) {
  const [hidden, setHidden] = useState(false);

  if (hidden) {
    return null;
  }

  const winnerPlayer = matchWinner ? players[matchWinner] : null;
  let title = 'Match nul';
  let subtitle = 'Plus aucun coup légal sur le plateau.';

  if (winnerPlayer) {
    title = `${winnerPlayer.pseudo} remporte le duel`;
    if (endReason === 'timeout') {
      subtitle = 'Victoire au temps écoulé.';
    } else if (endReason === 'resign') {
      subtitle = 'Victoire par abandon de l’adversaire.';
    } else if (endReason === 'abandoned') {
      subtitle = 'L’adversaire a quitté la partie.';
    } else {
      subtitle = 'Alignement de 3 sous-grilles capturées.';
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={CHIP_SPRING}
      className="absolute bottom-2.5 left-2.5 right-2.5 z-50 rounded-[12px] p-3 sm:p-3.5 flex flex-col gap-2.5"
      style={{
        backgroundColor: 'var(--bg-board)',
        border: `1.5px solid ${
          matchWinner === 'X'
            ? 'var(--x-color)'
            : matchWinner === 'O'
              ? 'var(--o-color)'
              : 'var(--border-strong)'
        }`,
        boxShadow: 'var(--shadow-board)',
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="min-w-0">
          <p
            className="text-sm sm:text-base font-bold leading-tight truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </p>
          <p
            className="text-xs mt-0.5 leading-snug"
            style={{ color: 'var(--text-secondary)' }}
          >
            {isOnline && opponentVotedRematch && !selfVotedRematch
              ? 'L’adversaire propose une revanche.'
              : isOnline && selfVotedRematch && !opponentVotedRematch
                ? 'En attente de la confirmation adverse…'
                : subtitle}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setHidden(true)}
            title="Inspecter le plateau final"
            aria-label="Inspecter le plateau final"
            className="tactile-btn inline-flex items-center justify-center rounded-[9px] px-2.5 py-2 text-xs font-medium"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-main)',
            }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onLeave}
            className="tactile-btn inline-flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-main)',
            }}
          >
            <Home className="w-3.5 h-3.5" />
            <span>Accueil</span>
          </button>

          <button
            type="button"
            onClick={onRematch}
            disabled={isOnline && selfVotedRematch}
            className="tactile-btn inline-flex items-center gap-1.5 rounded-[9px] px-3.5 py-2 text-xs font-semibold disabled:opacity-60"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>
              {isOnline && selfVotedRematch
                ? 'En attente…'
                : isOnline && opponentVotedRematch
                  ? 'Accepter revanche'
                  : 'Revanche'}
            </span>
          </button>
        </div>
      </div>

      {/* Chess-style Elo calculation summary */}
      {eloResult && (
        <div
          className="grid grid-cols-2 gap-2 pt-2 border-t text-xs"
          style={{ borderColor: 'var(--border-cell)' }}
        >
          {(['X', 'O'] as const).map((sym) => {
            const p = players[sym];
            const res = eloResult[sym];
            const deltaColor =
              res.delta > 0
                ? 'var(--x-color)'
                : res.delta < 0
                  ? 'var(--danger-color)'
                  : 'var(--text-secondary)';
            return (
              <div
                key={sym}
                className="flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-1.5"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-cell)',
                }}
              >
                <span
                  className="truncate font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {p?.pseudo ?? sym}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums flex items-center gap-1">
                  <span style={{ color: 'var(--text-muted)' }}>{res.before}</span>
                  <span style={{ color: 'var(--text-muted)' }}>→</span>
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {res.after}
                  </span>
                  <span className="font-semibold" style={{ color: deltaColor }}>
                    ({formatDelta(res.delta)})
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
