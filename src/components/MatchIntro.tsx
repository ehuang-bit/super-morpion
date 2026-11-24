import { useEffect, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import type { EloStakes } from '@shared/elo';
import type { Player } from '@shared/gameEngine';
import {
  MOVE_TIME_LIMIT_MS,
  TEAM_SEAT_SYMBOL,
  TIME_CONTROL_LABELS,
  getTurnSeatOrder,
  type RoomMode,
  type RoomPlayer,
  type TeamSeat,
  type TimeControl,
} from '@shared/protocol';
import type { PieceStyle } from '../types/boardPrefs';
import { haptics } from '../utils/haptics';
import { soundEngine } from '../utils/soundEngine';
import { SymbolMark } from './Symbols';

export interface MatchIntroProps {
  players: {
    X: RoomPlayer | null;
    O: RoomPlayer | null;
  };
  localSymbol: Player | null;
  eloStakes: EloStakes | null;
  timeControl: TimeControl;
  pieceStyle: PieceStyle;
  mode?: RoomMode;
  seats?: Record<TeamSeat, RoomPlayer | null> | null;
  localSeat?: TeamSeat | null;
  startingPlayer?: Player;
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
              {player ? `${player.elo}` : ''}
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

function TeamSide({
  symbol,
  teamSeats,
  seats,
  localSeat,
  pieceStyle,
}: {
  symbol: Player;
  teamSeats: readonly [TeamSeat, TeamSeat];
  seats: Record<TeamSeat, RoomPlayer | null>;
  localSeat: TeamSeat | null;
  pieceStyle: PieceStyle;
}) {
  const fromLeft = symbol === 'X';
  const teamInk = fromLeft ? 'var(--x-color)' : 'var(--o-color)';

  return (
    <motion.div
      className={`vs-half ${fromLeft ? 'vs-half-x' : 'vs-half-o'} absolute inset-0`}
      style={{
        backgroundColor: teamInk,
        color: 'var(--bg-board)',
      }}
      initial={{ x: fromLeft ? '-100%' : '100%' }}
      animate={{ x: 0 }}
      exit={{ x: fromLeft ? '-100%' : '100%' }}
      transition={SLIDE}
    >
      <div className="vs-half-content absolute flex flex-col items-center justify-center gap-2 px-4 text-center">
        <motion.div
          className="w-[clamp(50px,13vmin,118px)] aspect-square"
          initial={{ scale: 0.4, opacity: 0, rotate: fromLeft ? -30 : 30 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ ...SLIDE, delay: 0.22 }}
        >
          <div className="w-full h-full" style={PAPER_SYMBOLS}>
            <SymbolMark player={symbol} size="captured" pieceStyle={pieceStyle} />
          </div>
        </motion.div>

        <motion.span
          className="font-extrabold tracking-tight leading-tight"
          style={{ fontSize: 'clamp(19px, 4.2vmin, 36px)' }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.28 }}
        >
          Équipe {symbol}
        </motion.span>

        <div className="flex flex-col gap-1.5 sm:gap-2 w-full max-w-[260px] mt-0.5">
          {teamSeats.map((seat, idx) => {
            const member = seats[seat];
            const isSelfSeat = localSeat === seat;
            return (
              <motion.div
                key={seat}
                className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left min-w-0"
                style={{
                  backgroundColor: isSelfSeat
                    ? 'color-mix(in srgb, var(--bg-board) 24%, transparent)'
                    : 'color-mix(in srgb, var(--bg-board) 15%, transparent)',
                  border: isSelfSeat
                    ? '1.5px solid color-mix(in srgb, var(--bg-board) 72%, transparent)'
                    : '1px solid color-mix(in srgb, var(--bg-board) 32%, transparent)',
                }}
                initial={{ opacity: 0, x: fromLeft ? -20 : 20, scale: 0.94 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ ...SLIDE, delay: 0.38 + idx * 0.12 }}
              >
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full font-mono text-xs font-extrabold leading-none shrink-0"
                  style={{
                    backgroundColor: 'var(--bg-board)',
                    color: teamInk,
                  }}
                >
                  {seat}
                </span>
                <span className="flex-1 min-w-0 truncate font-bold text-sm sm:text-base leading-tight">
                  {member?.pseudo ?? '—'}
                </span>
                {isSelfSeat && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase leading-none"
                    style={{
                      backgroundColor: 'var(--bg-board)',
                      color: teamInk,
                      letterSpacing: '0.12em',
                    }}
                  >
                    Toi
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Présentation plein écran des deux joueurs (ou deux équipes en 2v2) au
 * lancement d'une partie. Elle dure le temps du délai de départ : le premier
 * chrono ne tourne pas pendant qu'elle est affichée.
 */
export function MatchIntro({
  players,
  localSymbol,
  eloStakes,
  timeControl,
  pieceStyle,
  mode = '1v1',
  seats = null,
  localSeat = null,
  startingPlayer = 'X',
}: MatchIntroProps) {
  useEffect(() => {
    soundEngine.playVersus();
    haptics.capture();
  }, []);

  const is2v2 = mode === '2v2' && seats !== null;
  const relayOrder = getTurnSeatOrder(startingPlayer);

  const winDelta = eloStakes ? (localSymbol === 'O' ? eloStakes.winO : eloStakes.winX) : null;
  const lossDelta = eloStakes ? (localSymbol === 'O' ? eloStakes.lossO : eloStakes.lossX) : null;
  const opponent = localSymbol ? players[localSymbol === 'X' ? 'O' : 'X'] : null;

  const statusAnnouncement = is2v2
    ? `Partie 2 contre 2 : Équipe X (${seats.A?.pseudo ?? 'A'} et ${seats.B?.pseudo ?? 'B'}) contre Équipe O (${seats.C?.pseudo ?? 'C'} et ${seats.D?.pseudo ?? 'D'})`
    : opponent
      ? `Partie contre ${opponent.pseudo}`
      : 'La partie commence';

  return (
    <motion.div
      className="fixed inset-0 z-[80] overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 1, transition: { duration: 0.5 } }}
    >
      <span className="sr-only" role="status">
        {statusAnnouncement}
      </span>

      {is2v2 ? (
        <>
          <TeamSide
            symbol="X"
            teamSeats={['A', 'B']}
            seats={seats}
            localSeat={localSeat}
            pieceStyle={pieceStyle}
          />
          <TeamSide
            symbol="O"
            teamSeats={['C', 'D']}
            seats={seats}
            localSeat={localSeat}
            pieceStyle={pieceStyle}
          />
        </>
      ) : (
        <>
          <Side symbol="X" player={players.X} isSelf={localSymbol === 'X'} pieceStyle={pieceStyle} />
          <Side symbol="O" player={players.O} isSelf={localSymbol === 'O'} pieceStyle={pieceStyle} />
        </>
      )}

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div className="relative">
          {is2v2 && (
            <motion.span
              aria-hidden="true"
              className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-extrabold uppercase tracking-[0.14em]"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
                border: '2px solid var(--bg-board)',
                boxShadow: 'var(--shadow-card)',
              }}
              initial={{ scale: 0, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 22, delay: 0.64 }}
            >
              2v2
            </motion.span>
          )}
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

        {is2v2 ? (
          <motion.div
            className="flex flex-col items-center gap-1.5 rounded-2xl px-4 py-2 text-xs sm:text-sm font-semibold"
            style={{
              backgroundColor: 'var(--bg-board)',
              color: 'var(--text-primary)',
              boxShadow: 'var(--shadow-card)',
            }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ delay: 0.82, duration: 0.3 }}
          >
            <span>
              {TIME_CONTROL_LABELS[timeControl]} · {Math.round(MOVE_TIME_LIMIT_MS / 1000)} s par coup
            </span>
            <div
              className="flex items-center gap-1 sm:gap-1.5"
              aria-label={`Ordre de relais : ${relayOrder.join(' puis ')}`}
            >
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.1em] mr-0.5"
                style={{ color: 'var(--text-muted)' }}
              >
                Relais
              </span>
              {relayOrder.map((seat, idx) => {
                const isTeamX = TEAM_SEAT_SYMBOL[seat] === 'X';
                const seatInk = isTeamX ? 'var(--x-color)' : 'var(--o-color)';
                const seatSurface = isTeamX ? 'var(--x-surface)' : 'var(--o-surface)';
                const isSelf = localSeat === seat;
                return (
                  <motion.span
                    key={seat}
                    className="inline-flex items-center gap-1 sm:gap-1.5"
                    initial={{ opacity: 0, scale: 0.65, y: 4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{
                      type: 'spring',
                      stiffness: 460,
                      damping: 22,
                      delay: 0.96 + idx * 0.11,
                    }}
                  >
                    <span
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full font-mono text-xs font-extrabold leading-none"
                      style={{
                        backgroundColor: isSelf ? seatInk : seatSurface,
                        color: isSelf ? 'var(--bg-board)' : seatInk,
                        border: `1.5px solid ${seatInk}`,
                      }}
                    >
                      {seat}
                    </span>
                    {idx < relayOrder.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="font-mono text-xs font-bold"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        →
                      </span>
                    )}
                  </motion.span>
                );
              })}
            </div>
          </motion.div>
        ) : (
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
        )}
      </div>
    </motion.div>
  );
}
