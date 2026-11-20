import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { BOARD_COORDS, type GameState } from '@shared/gameEngine';
import { CHIP_SPRING } from '../utils/motion';

interface MoveHistoryRibbonProps {
  gameState: GameState;
}

export function MoveHistoryRibbon({ gameState }: MoveHistoryRibbonProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const xZones = gameState.boards.filter((b) => b.status === 'X').length;
  const oZones = gameState.boards.filter((b) => b.status === 'O').length;
  const moveCount = gameState.moveHistory.length;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
  }, [moveCount]);

  return (
    <div
      className="w-full max-w-[580px] mx-auto px-2 sm:px-0"
      aria-label="Historique et contrôle des zones"
    >
      <div
        className="flex items-center gap-2 rounded-[11px] px-2.5 h-8"
        style={{
          backgroundColor: 'var(--bg-board)',
          border: '1px solid var(--border-main)',
        }}
      >
        {/* Zone control + move count */}
        <div
          className="flex items-center gap-2 shrink-0 pr-2 border-r font-mono text-[11px] tabular-nums"
          style={{
            borderColor: 'var(--border-cell)',
            color: 'var(--text-secondary)',
          }}
        >
          <span className="inline-flex items-center gap-1" title="Zones capturées par X">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: 'var(--x-color)' }}
            />
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {xZones}
            </span>
          </span>
          <span style={{ color: 'var(--text-muted)' }}>–</span>
          <span className="inline-flex items-center gap-1" title="Zones capturées par O">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: 'var(--o-color)' }}
            />
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {oZones}
            </span>
          </span>
          <span
            className="hidden xs:inline sm:inline text-[10px]"
            style={{ color: 'var(--text-muted)' }}
          >
            · #{moveCount}
          </span>
        </div>

        {/* Scrollable move chips */}
        <div
          ref={scrollRef}
          className="no-scrollbar flex-1 flex items-center gap-1 overflow-x-auto whitespace-nowrap"
        >
          {moveCount === 0 ? (
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              En attente du premier coup…
            </span>
          ) : (
            gameState.moveHistory.map((record, idx) => {
              const isLatest = idx === moveCount - 1;
              const coord = `${BOARD_COORDS[record.boardIndex]}·${BOARD_COORDS[record.cellIndex]}`;
              return (
                <motion.span
                  key={record.moveNumber}
                  initial={
                    isLatest ? { opacity: 0, scale: 0.88, x: 8 } : false
                  }
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  transition={CHIP_SPRING}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] leading-none shrink-0"
                  style={{
                    backgroundColor: isLatest
                      ? 'var(--accent-active-bg)'
                      : 'var(--bg-surface)',
                    color: isLatest ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: `1px solid ${
                      isLatest ? 'var(--accent-active)' : 'var(--border-cell)'
                    }`,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor:
                        record.player === 'X' ? 'var(--x-color)' : 'var(--o-color)',
                    }}
                  />
                  <span style={{ color: 'var(--text-muted)' }}>{record.moveNumber}.</span>
                  <span className="font-medium">{coord}</span>
                  {record.capturedBoard && (
                    <span
                      className="w-2 h-2 rounded-[2px] shrink-0"
                      style={{
                        backgroundColor:
                          record.player === 'X' ? 'var(--x-color)' : 'var(--o-color)',
                      }}
                      title="Zone capturée"
                    />
                  )}
                </motion.span>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
