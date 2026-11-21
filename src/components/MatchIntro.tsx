import { useEffect, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import type { EloStakes } from '@shared/elo';
import type { Player } from '@shared/gameEngine';
import {
  MOVE_TIME_LIMIT_MS,
  TIME_CONTROL_LABELS,
  type RoomPlayer,
  type TimeControl,
} from '@shared/protocol';
import type { PieceStyle } from '../types/boardPrefs';
import { haptics } from '../utils/haptics';
import { soundEngine } from '../utils/soundEngine';
import { SymbolMark } from './Symbols';

interface MatchIntroProps {
  players: {
    X: RoomPlayer | null;
    O: RoomPlayer | null;
  };
  localSymbol: Player | null;
  eloStakes: EloStakes | null;
  timeControl: TimeControl;
  pieceStyle: PieceStyle;
}

const SLIDE = { type: 'spring', stiffness: 210, damping: 26, mass: 0.9 } as const;

function formatSigned(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`.replace('-', '−');
}

/** Sur l'encre, les symboles prennent la couleur du papier. */
const PAPER_SYMBOLS = {
  '--x-color': 'var(--bg-board)',
  '--o-color': 'var(--bg-board)',
} as CSSProperties;

function Side({
  symbol,
  player,
  isSelf,
  pieceStyle,
}: {
  symbol: Player;
  player: RoomPlayer | null;
  isSelf: boolean;
  pieceStyle: PieceStyle;
}) {
  const fromLeft = symbol === 'X';
  return (
    <motion.div
      className={`vs-half ${fromLeft ? 'vs-half-x' : 'vs-half-o'} absolute inset-0`}
      style={{
        backgroundColor: fromLeft ? 'var(--x-color)' : 'var(--o-color)',
        color: 'var(--bg-board)',
      }}
      initial={{ x: fromLeft ? '-100%' : '100%' }}
      animate={{ x: 0 }}
      exit={{ x: fromLeft ? '-100%' : '100%' }}
      transition={SLIDE}
    >
      <div className="vs-half-content absolute flex flex-col items-center justify-center gap-2 px-4 text-center">
        <motion.div
          className="w-[clamp(64px,18vmin,150px)] aspect-square"
          initial={{ scale: 0.4, opacity: 0, rotate: fromLeft ? -30 : 30 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ ...SLIDE, delay: 0.22 }}
        >
          <div className="w-full h-full" style={PAPER_SYMBOLS}>
            <SymbolMark player={symbol} size="captured" pieceStyle={pieceStyle} />
          </div>
        </motion.div>
        <motion.div
          className="flex flex-col items-center gap-1 min-w-0 max-w-full"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34, duration: 0.3 }}
        >
          <span
            className="max-w-full truncate font-extrabold tracking-tight leading-tight"
            style={{ fontSize: 'clamp(22px, 5.4vmin, 46px)' }}
          >
            {player?.pseudo ?? '—'}
          </span>
          <span className="flex items-center gap-2 font-mono text-sm sm:text-base font-semibold tabular-nums">
            <span>
              {player ? `${player.elo}${player.provisional ? '?' : ''}` : ''}
            </span>
            {player && <span className="font-sans font-medium opacity-85">· {player.tier}</span>}
          </span>
          {isSelf && (
            <span
              className="mt-0.5 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase"
              style={{
                backgroundColor: 'var(--bg-board)',
                color: fromLeft ? 'var(--x-color)' : 'var(--o-color)',
                letterSpacing: '0.12em',
              }}
            >
              Toi
            </span>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

/**
 * Présentation plein écran des deux joueurs au lancement d'une partie.
 * Elle dure le temps du délai de départ : le premier chrono ne tourne pas
 * pendant qu'elle est affichée.
 */
export function MatchIntro({
  players,
  localSymbol,
  eloStakes,
  timeControl,
  pieceStyle,
}: MatchIntroProps) {
  useEffect(() => {
    soundEngine.playVersus();
    haptics.capture();
  }, []);

  const winDelta = eloStakes ? (localSymbol === 'O' ? eloStakes.winO : eloStakes.winX) : null;
  const lossDelta = eloStakes ? (localSymbol === 'O' ? eloStakes.lossO : eloStakes.lossX) : null;
  const opponent = localSymbol ? players[localSymbol === 'X' ? 'O' : 'X'] : null;

  return (
    <motion.div
      className="fixed inset-0 z-[80] overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 1, transition: { duration: 0.5 } }}
    >
      <span className="sr-only" role="status">
        {opponent ? `Partie contre ${opponent.pseudo}` : 'La partie commence'}
      </span>

      <Side symbol="X" player={players.X} isSelf={localSymbol === 'X'} pieceStyle={pieceStyle} />
      <Side symbol="O" player={players.O} isSelf={localSymbol === 'O'} pieceStyle={pieceStyle} />

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div className="relative">
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 rounded-full"
            style={{ border: '3px solid var(--bg-board)' }}
            initial={{ scale: 1, opacity: 0 }}
            animate={{ scale: 2.6, opacity: [0, 0.9, 0] }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.62, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.div
            aria-hidden="true"
            className="relative flex items-center justify-center rounded-full font-extrabold"
            style={{
              width: 'clamp(70px, 17vmin, 128px)',
              height: 'clamp(70px, 17vmin, 128px)',
              fontSize: 'clamp(26px, 6.6vmin, 50px)',
              backgroundColor: 'var(--bg-board)',
              color: 'var(--text-primary)',
              boxShadow: 'var(--shadow-board)',
              letterSpacing: '-0.02em',
            }}
            initial={{ scale: 3.4, opacity: 0, rotate: -22 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 22, delay: 0.48 }}
          >
            VS
          </motion.div>
        </div>

        <motion.div
          className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-semibold"
          style={{
            backgroundColor: 'var(--bg-board)',
            color: 'var(--text-primary)',
            boxShadow: 'var(--shadow-card)',
          }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ delay: 0.85, duration: 0.3 }}
        >
          <span>
            {TIME_CONTROL_LABELS[timeControl]} · {Math.round(MOVE_TIME_LIMIT_MS / 1000)} s par coup
          </span>
          {winDelta !== null && lossDelta !== null && localSymbol && (
            <span className="font-mono tabular-nums">
              <span style={{ color: 'var(--x-color)' }}>{formatSigned(winDelta)}</span>
              <span style={{ color: 'var(--text-muted)' }}> / </span>
              <span style={{ color: 'var(--danger-color)' }}>{formatSigned(lossDelta)}</span>
            </span>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
