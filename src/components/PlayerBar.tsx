import { useId } from 'react';
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import type { EloStakes } from '@shared/elo';
import {
  BOARD_COORDS,
  type DestinationPreview,
  type GameState,
  type Move,
  type Player,
} from '@shared/gameEngine';
import {
  TEAM_SEAT_SYMBOL,
  TIME_CONTROL_LABELS,
  getTurnSeatOrder,
  type EndReason,
  type RoomEmote,
  type RoomMode,
  type RoomPlayer,
  type TeamSeat,
  type TimeControl,
} from '@shared/protocol';
import { ChevronRight, Eye, Wifi, WifiOff } from 'lucide-react';
import type { PieceStyle } from '../types/boardPrefs';
import { formatClock } from '../utils/format';
import { CHIP_SPRING, FOCUS_SPRING } from '../utils/motion';
import { EmoteStamp } from './EmoteBar';
import { SymbolMark } from './Symbols';

function formatSigned(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function formatSpectatorLabel(
  spectatorCount: number | undefined,
  isSpectator: boolean,
): string {
  const count = spectatorCount ?? 0;
  if (isSpectator) {
    return count > 1 ? `Mode spectateur · ${count}` : 'Mode spectateur';
  }
  return `${count} spectateur${count > 1 ? 's' : ''}`;
}

export interface TeamMemberSlot {
  seat: TeamSeat;
  player: RoomPlayer | null;
  isActiveSeat: boolean;
  isSelfSeat: boolean;
}

export interface PlayerCardProps {
  symbol: Player;
  player: RoomPlayer | null;
  isTurn: boolean;
  isSelf: boolean;
  isOpponent: boolean;
  clockMs: number | null;
  isLowClock: boolean;
  capturedCount: number;
  pieceStyle?: PieceStyle;
  variant?: 'compact' | 'wide';
  teamMembers?: TeamMemberSlot[];
  activeEmote?: RoomEmote | null;
}

export function PlayerCard({
  symbol,
  player,
  isTurn,
  isSelf,
  isOpponent,
  clockMs,
  isLowClock,
  capturedCount,
  pieceStyle = 'classique',
  variant = 'compact',
  teamMembers,
  activeEmote = null,
}: PlayerCardProps) {
  const accentColor = symbol === 'X' ? 'var(--x-color)' : 'var(--o-color)';
  const surfaceTint = symbol === 'X' ? 'var(--x-surface)' : 'var(--o-surface)';
  const isTeamCard = Boolean(teamMembers && teamMembers.length > 0);
  const cardEmote =
    activeEmote && activeEmote.senderSymbol === symbol ? activeEmote : null;

  return (
    <div
      className={`relative flex items-center justify-between gap-2 rounded-[12px] transition-colors duration-200 ${
        variant === 'wide' ? 'px-3 py-2 w-full' : 'px-3 py-2'
      }`}
      style={{
        backgroundColor: isTurn ? surfaceTint : 'var(--bg-board)',
        border: `1.5px solid ${isTurn ? accentColor : 'var(--border-main)'}`,
        boxShadow: isTurn ? 'var(--shadow-card)' : 'none',
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className="w-5 h-5 shrink-0">
          <SymbolMark player={symbol} size="badge" pieceStyle={pieceStyle} />
        </div>

        {isTeamCard && teamMembers ? (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0 leading-none">
              <span
                className="text-[11px] font-bold uppercase tracking-[0.06em] shrink-0"
                style={{ color: accentColor }}
              >
                Équipe {symbol}
              </span>
              {player && (
                <span
                  className="text-[11px] font-medium tabular-nums truncate"
                  style={{ color: 'var(--text-muted)' }}
                >
                  · {player.score} pt{player.score > 1 ? 's' : ''}
                  {variant === 'wide'
                    ? ` · ${capturedCount} zone${capturedCount > 1 ? 's' : ''}`
                    : ''}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1 mt-1">
              {teamMembers.map((member) => {
                const displayName = member.isSelfSeat
                  ? 'Vous'
                  : (member.player?.pseudo ?? 'Libre');
                const isOffline = Boolean(member.player && !member.player.connected);

                return (
                  <motion.span
                    key={member.seat}
                    animate={{ scale: member.isActiveSeat ? 1 : 0.98 }}
                    transition={CHIP_SPRING}
                    title={
                      member.player
                        ? `Siège ${member.seat} · ${member.player.pseudo}${
                            isOffline ? ' (déconnecté)' : ''
                          }`
                        : `Siège ${member.seat} · En attente`
                    }
                    className="inline-flex items-center gap-1 rounded-md pl-0.5 pr-1.5 py-0.5 text-[11px] leading-none min-w-0 max-w-full transition-colors duration-200"
                    style={{
                      backgroundColor: member.isActiveSeat
                        ? 'var(--bg-board)'
                        : 'var(--bg-surface)',
                      color: member.isActiveSeat
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                      border: member.isActiveSeat
                        ? `1.5px solid ${accentColor}`
                        : '1px solid var(--border-cell)',
                      boxShadow: member.isActiveSeat
                        ? `0 0 0 2px ${surfaceTint}`
                        : 'none',
                    }}
                  >
                    <motion.span
                      animate={{
                        scale: member.isActiveSeat ? 1.06 : 1,
                      }}
                      transition={CHIP_SPRING}
                      className="inline-flex items-center justify-center w-4 h-4 rounded-[4px] font-mono text-[10px] font-extrabold leading-none shrink-0 transition-colors duration-200"
                      style={{
                        backgroundColor: member.isActiveSeat
                          ? accentColor
                          : surfaceTint,
                        color: member.isActiveSeat
                          ? 'var(--bg-board)'
                          : accentColor,
                      }}
                    >
                      {member.seat}
                    </motion.span>
                    <span className="truncate max-w-[78px] sm:max-w-[92px] font-semibold">
                      {displayName}
                    </span>
                    {isOffline && (
                      <WifiOff
                        className="w-2.5 h-2.5 shrink-0"
                        style={{ color: 'var(--danger-color)' }}
                        aria-label="Déconnecté"
                      />
                    )}
                  </motion.span>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="truncate text-sm font-semibold leading-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {player?.pseudo ?? 'En attente…'}
              </span>
              {player && (
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none tabular-nums"
                  style={{
                    backgroundColor: 'var(--bg-recessed)',
                    color: 'var(--text-primary)',
                  }}
                  title={`Classement : ${player.elo} (${player.tier})`}
                >
                  {player.elo}
                </span>
              )}
              {isSelf && (
                <span
                  className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium leading-none ${
                    variant === 'compact' ? 'hidden sm:inline' : ''
                  }`}
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-cell)',
                  }}
                >
                  Vous
                </span>
              )}
              {isOpponent && player && (
                <span
                  title={player.connected ? 'Adversaire en ligne' : 'Adversaire déconnecté'}
                  className="inline-flex items-center shrink-0"
                  style={{
                    color: player.connected ? 'var(--x-color)' : 'var(--danger-color)',
                  }}
                >
                  {player.connected ? (
                    <Wifi className="w-3.5 h-3.5" strokeWidth={2} />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5" strokeWidth={2} />
                  )}
                </span>
              )}
            </div>

            <div
              className="flex items-center gap-1.5 text-[11px] leading-tight mt-0.5 whitespace-nowrap"
              style={{ color: 'var(--text-muted)' }}
            >
              {player && (
                <>
                  <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {player.tier}
                  </span>
                  <span>·</span>
                  <span className="tabular-nums font-medium">
                    {player.score} pt{player.score > 1 ? 's' : ''}
                  </span>
                  {variant === 'wide' && (
                    <>
                      <span>·</span>
                      <span className="tabular-nums">
                        {capturedCount} zone{capturedCount > 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                </>
              )}
              {!player && <span>—</span>}
            </div>
          </div>
        )}
      </div>

      {clockMs !== null ? (
        <div
          className={`shrink-0 rounded-lg px-2 py-1 font-mono text-xs sm:text-sm font-semibold tabular-nums leading-none ${
            isLowClock && isTurn ? 'clock-urgent' : ''
          }`}
          style={{
            backgroundColor: isLowClock
              ? 'var(--danger-bg)'
              : isTurn
                ? 'var(--bg-board)'
                : 'var(--bg-surface)',
            color: isLowClock
              ? 'var(--danger-color)'
              : isTurn
                ? 'var(--text-primary)'
                : 'var(--text-secondary)',
            border: `1px solid ${
              isLowClock ? 'var(--danger-color)' : 'var(--border-cell)'
            }`,
          }}
        >
          {formatClock(clockMs)}
        </div>
      ) : (
        isTurn && (
          <span
            className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold leading-none"
            style={{
              backgroundColor: 'var(--bg-board)',
              color: accentColor,
              border: `1px solid ${accentColor}`,
            }}
          >
            Trait
          </span>
        )
      )}

      {/* Tampon de réaction ancré sur la lèvre inférieure de la carte de l'émetteur */}
      <div
        className={`pointer-events-none absolute top-[calc(100%-6px)] z-30 ${
          symbol === 'X' ? 'left-2.5' : 'right-2.5'
        }`}
      >
        <EmoteStamp emote={cardEmote} align={symbol === 'X' ? 'left' : 'right'} />
      </div>
    </div>
  );
}

export interface MatchMetaStripProps {
  timeControl: TimeControl;
  eloStakes: EloStakes | null;
  perspectiveSymbol?: Player | null;
  mode?: RoomMode;
  spectatorCount?: number;
  isSpectator?: boolean;
}

export function MatchMetaStrip({
  timeControl,
  eloStakes,
  perspectiveSymbol,
  mode = '1v1',
  spectatorCount,
  isSpectator = false,
}: MatchMetaStripProps) {
  const winDelta =
    eloStakes && perspectiveSymbol === 'O' ? eloStakes.winO : eloStakes?.winX;
  const drawDelta =
    eloStakes && perspectiveSymbol === 'O' ? eloStakes.drawO : eloStakes?.drawX;
  const lossDelta =
    eloStakes && perspectiveSymbol === 'O' ? eloStakes.lossO : eloStakes?.lossX;

  const showSpectatorBadge = isSpectator || (spectatorCount ?? 0) > 0;

  return (
    <div className="w-full max-w-[580px] mx-auto px-2.5 flex items-center justify-between gap-2 text-[11px] leading-none">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-semibold truncate min-w-0" style={{ color: 'var(--text-secondary)' }}>
          {TIME_CONTROL_LABELS[timeControl]}
        </span>
        {mode === '2v2' && (
          <span
            className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none tracking-tight"
            style={{
              backgroundColor: 'var(--accent-active-bg)',
              color: 'var(--accent-active-text)',
              border: '1px solid var(--accent-active)',
            }}
          >
            2v2
          </span>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-1.5">
        {showSpectatorBadge && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
            style={{
              backgroundColor: isSpectator
                ? 'var(--accent-active-bg)'
                : 'var(--bg-surface)',
              color: isSpectator
                ? 'var(--accent-active-text)'
                : 'var(--text-secondary)',
              border: `1px solid ${
                isSpectator ? 'var(--accent-active)' : 'var(--border-cell)'
              }`,
            }}
          >
            <Eye className="w-3 h-3 shrink-0" strokeWidth={2} />
            <span>{formatSpectatorLabel(spectatorCount, isSpectator)}</span>
          </span>
        )}

        {eloStakes && winDelta !== undefined && drawDelta !== undefined && lossDelta !== undefined && (
          <div
            className="shrink-0 flex items-center gap-1.5 font-mono text-[10px] tabular-nums"
            style={{ color: 'var(--text-muted)' }}
            title="Variation Elo estimée selon l’issue du duel"
          >
            <span>Elo</span>
            <span className="font-semibold" style={{ color: 'var(--x-color)' }}>
              {formatSigned(winDelta)}
            </span>
            <span>/</span>
            <span>{formatSigned(drawDelta)}</span>
            <span>/</span>
            <span className="font-semibold" style={{ color: 'var(--danger-color)' }}>
              {formatSigned(lossDelta)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export interface TeamRelayStripProps {
  seats: Record<TeamSeat, RoomPlayer | null>;
  activeSeat: TeamSeat | null;
  localSeat: TeamSeat | null;
  startingPlayer?: Player;
  phase: 'waiting' | 'playing' | 'finished';
}

/**
 * Bandeau de relais 2v2 (A → C → B → D) avec témoin animé glissant d'un siège
 * à l'autre à chaque changement de tour.
 */
export function TeamRelayStrip({
  seats,
  activeSeat,
  localSeat,
  startingPlayer = 'X',
  phase,
}: TeamRelayStripProps) {
  const relayGroupId = useId();
  const reduceMotion = useReducedMotion();
  const order = getTurnSeatOrder(startingPlayer);

  return (
    <LayoutGroup id={relayGroupId}>
      <div
        className="w-full max-w-[580px] mx-auto"
        aria-label="Ordre de relais des équipes"
      >
        <div
          className="flex items-center justify-between gap-0.5 sm:gap-1 rounded-[11px] px-1.5 py-1"
          style={{
            backgroundColor: 'var(--bg-board)',
            border: '1px solid var(--border-main)',
          }}
        >
          {order.map((seat, idx) => {
            const member = seats[seat];
            const symbol = TEAM_SEAT_SYMBOL[seat];
            const teamColor = symbol === 'X' ? 'var(--x-color)' : 'var(--o-color)';
            const teamSurface = symbol === 'X' ? 'var(--x-surface)' : 'var(--o-surface)';
            const isActive = phase === 'playing' && activeSeat === seat;
            const isSelf = localSeat === seat;
            const displayName = isSelf ? 'Toi' : (member?.pseudo ?? 'Libre');

            return (
              <div
                key={seat}
                className="flex items-center gap-0.5 sm:gap-1 flex-1 min-w-0"
              >
                <div
                  className="relative flex-1 min-w-0 flex items-center justify-center gap-1 rounded-lg px-1.5 py-1 text-[11px] leading-none select-none transition-colors duration-200"
                  style={{
                    backgroundColor: isActive
                      ? 'transparent'
                      : isSelf
                        ? 'var(--bg-surface)'
                        : 'transparent',
                    border: isActive
                      ? '1px solid transparent'
                      : isSelf
                        ? `1px dashed ${teamColor}`
                        : '1px solid transparent',
                  }}
                  title={
                    member
                      ? `Siège ${seat} (Équipe ${symbol}) · ${member.pseudo}`
                      : `Siège ${seat} (Équipe ${symbol})`
                  }
                >
                  {isActive && (
                    <motion.span
                      layoutId="relay-baton"
                      transition={FOCUS_SPRING}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-lg overflow-hidden"
                      style={{
                        backgroundColor: teamColor,
                        boxShadow: 'var(--shadow-card)',
                      }}
                    >
                      {!reduceMotion && (
                        <motion.span
                          aria-hidden="true"
                          className="absolute inset-0 rounded-lg"
                          style={{
                            backgroundColor: 'var(--bg-board)',
                          }}
                          animate={{ opacity: [0.04, 0.2, 0.04] }}
                          transition={{
                            duration: 1.8,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }}
                        />
                      )}
                    </motion.span>
                  )}

                  <span
                    className="relative z-10 inline-flex items-center justify-center w-4 h-4 rounded-full font-mono text-[10px] font-extrabold leading-none shrink-0 transition-colors duration-200"
                    style={{
                      backgroundColor: isActive
                        ? 'color-mix(in srgb, var(--bg-board) 24%, transparent)'
                        : teamSurface,
                      color: isActive ? 'var(--bg-board)' : teamColor,
                    }}
                  >
                    {seat}
                  </span>
                  <span
                    className="relative z-10 truncate font-semibold transition-colors duration-200"
                    style={{
                      color: isActive
                        ? 'var(--bg-board)'
                        : isSelf
                          ? 'var(--text-primary)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    {displayName}
                  </span>
                </div>

                {idx < order.length - 1 && (
                  <ChevronRight
                    className="w-3 h-3 shrink-0"
                    style={{ color: 'var(--text-muted)', opacity: 0.6 }}
                    aria-hidden="true"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </LayoutGroup>
  );
}

export interface TacticalStatusStripProps {
  players: {
    X: RoomPlayer | null;
    O: RoomPlayer | null;
  };
  gameState: GameState;
  phase: 'waiting' | 'playing' | 'finished';
  localPlayerSymbol?: Player | null;
  isOnline: boolean;
  eloStakes?: EloStakes | null;
  endReason: EndReason | null;
  matchWinner: Player | null;
  preview: DestinationPreview | null;
  hoveredMove: Move | null;
  showDesktopMeta?: boolean;
  /** Dépassements d'affilée du temps par coup, pour chaque joueur. */
  moveTimeouts?: { X: number; O: number } | null;
  mode?: RoomMode;
  seats?: Record<TeamSeat, RoomPlayer | null> | null;
  activeSeat?: TeamSeat | null;
  localSeat?: TeamSeat | null;
  spectatorCount?: number;
  activeEmote?: RoomEmote | null;
}

export function TacticalStatusStrip({
  players,
  gameState,
  phase,
  localPlayerSymbol,
  isOnline,
  eloStakes,
  endReason,
  matchWinner,
  preview,
  hoveredMove,
  showDesktopMeta = false,
  moveTimeouts = null,
  mode = '1v1',
  seats = null,
  activeSeat = null,
  localSeat = null,
  spectatorCount,
}: TacticalStatusStripProps) {
  const activeSymbol = gameState.currentPlayer;
  const activePlayerObj = players[activeSymbol];
  const is2v2 = mode === '2v2' && seats !== null;
  const isSpectator = isOnline && localPlayerSymbol === null;

  const getSpectatorActorName = () => {
    if (is2v2 && activeSeat && seats) {
      return `${seats[activeSeat]?.pseudo ?? activeSeat} (${activeSeat})`;
    }
    return activePlayerObj?.pseudo ?? activeSymbol;
  };

  const renderContent = () => {
    if (phase === 'finished') {
      const winnerName = matchWinner ? players[matchWinner]?.pseudo : null;
      let label = 'Match nul — plateau complet';
      if (endReason === 'aborted') {
        label = 'Partie annulée — non classée';
      } else if (endReason === 'timeout' && matchWinner) {
        label = is2v2
          ? `L’équipe ${matchWinner} gagne au temps`
          : winnerName
            ? `${winnerName} gagne au temps`
            : label;
      } else if (endReason === 'resign' && matchWinner) {
        label = is2v2
          ? `L’équipe ${matchWinner} gagne par abandon`
          : winnerName
            ? `${winnerName} gagne par abandon`
            : label;
      } else if (endReason === 'abandoned' && matchWinner) {
        label = is2v2
          ? `L’équipe ${matchWinner} gagne (adversaire parti)`
          : winnerName
            ? `${winnerName} gagne (adversaire parti)`
            : label;
      } else if (matchWinner) {
        label = is2v2
          ? `Victoire de l’équipe ${matchWinner}`
          : winnerName
            ? `Victoire de ${winnerName}`
            : label;
      }

      return (
        <span
          className="text-xs font-medium truncate"
          style={{ color: 'var(--text-secondary)' }}
        >
          {label}
        </span>
      );
    }

    if (preview && hoveredMove) {
      if (preview.willWinGame) {
        return (
          <span
            className="text-xs font-semibold truncate"
            style={{ color: activeSymbol === 'X' ? 'var(--x-color)' : 'var(--o-color)' }}
          >
            Coup décisif : remporte la partie
          </span>
        );
      }
      if (preview.willBeFreeMove) {
        return (
          <span
            className="text-xs font-medium truncate"
            style={{ color: 'var(--danger-color)' }}
          >
            Envoi vers {BOARD_COORDS[preview.targetBoard]} (verrouillée) → Coup libre adverse
          </span>
        );
      }
      if (preview.willCaptureBoard) {
        return (
          <span
            className="text-xs font-medium truncate"
            style={{ color: 'var(--accent-active-text)' }}
          >
            Capture {BOARD_COORDS[hoveredMove.boardIndex]} et renvoie en{' '}
            <span className="font-mono">{BOARD_COORDS[preview.targetBoard]}</span>
          </span>
        );
      }
      if (preview.isSelfRedirect) {
        return (
          <span
            className="text-xs font-medium truncate"
            style={{ color: 'var(--accent-active-text)' }}
          >
            Renvoie l’adversaire dans la même zone{' '}
            <span className="font-mono">{BOARD_COORDS[preview.targetBoard]}</span>
          </span>
        );
      }
      return (
        <span
          className="text-xs font-medium truncate"
          style={{ color: 'var(--text-secondary)' }}
        >
          Renvoie l’adversaire en zone{' '}
          <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            {BOARD_COORDS[preview.targetBoard]}
          </span>
        </span>
      );
    }

    const zoneText =
      gameState.activeBoard === null
        ? 'Plateau ouvert'
        : `Zone ${BOARD_COORDS[gameState.activeBoard]}`;

    if (gameState.isFreeMove) {
      const originLabel =
        gameState.redirectedFromBoard !== null
          ? `Zone ${BOARD_COORDS[gameState.redirectedFromBoard]} verrouillée · `
          : '';

      if (isSpectator) {
        return (
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-tight"
              style={{
                backgroundColor: 'var(--accent-active-bg)',
                color: 'var(--accent-active-text)',
                border: '1px solid var(--accent-active)',
              }}
            >
              Coup libre
            </span>
            <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              Mode spectateur · Trait à {getSpectatorActorName()}
            </span>
          </div>
        );
      }

      if (is2v2 && phase === 'playing' && activeSeat && seats) {
        const freeMoveDetail =
          activeSeat === localSeat
            ? `${originLabel}À vous de jouer (Siège ${activeSeat}) — zone au choix`
            : localPlayerSymbol && TEAM_SEAT_SYMBOL[activeSeat] === localPlayerSymbol
              ? `Tour de votre coéquipier · ${seats[activeSeat]?.pseudo ?? activeSeat} (${activeSeat})`
              : `Tour de ${seats[activeSeat]?.pseudo ?? activeSeat} (${activeSeat})`;

        return (
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-tight"
              style={{
                backgroundColor: 'var(--accent-active-bg)',
                color: 'var(--accent-active-text)',
                border: '1px solid var(--accent-active)',
              }}
            >
              Coup libre
            </span>
            <span
              className="text-xs truncate"
              style={{ color: 'var(--text-secondary)' }}
            >
              {freeMoveDetail}
            </span>
          </div>
        );
      }

      return (
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-tight"
            style={{
              backgroundColor: 'var(--accent-active-bg)',
              color: 'var(--accent-active-text)',
              border: '1px solid var(--accent-active)',
            }}
          >
            Coup libre
          </span>
          <span
            className="text-xs truncate"
            style={{ color: 'var(--text-secondary)' }}
          >
            {originLabel}jouez dans n’importe quelle zone ouverte
          </span>
        </div>
      );
    }

    // Temps par coup dépassé : le dernier coup a été joué d'office
    const lastRecord = gameState.moveHistory[gameState.moveHistory.length - 1];
    const lastWasAuto = Boolean(lastRecord?.auto);

    if (isSpectator) {
      return (
        <div className="flex items-center gap-1.5 min-w-0">
          {lastWasAuto && (
            <span
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-tight"
              style={{
                backgroundColor: 'var(--danger-bg)',
                color: 'var(--danger-color)',
                border: '1px solid var(--danger-color)',
              }}
              title="Temps dépassé : un coup aléatoire a été joué automatiquement"
            >
              Coup d’office
            </span>
          )}
          <span
            className="inline-flex items-center gap-1 text-xs font-semibold truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            <Eye
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: 'var(--accent-active-text)' }}
              strokeWidth={2}
            />
            <span className="truncate">
              Mode spectateur · Trait à {getSpectatorActorName()}
            </span>
          </span>
          <span className="shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
            · {zoneText}
          </span>
        </div>
      );
    }

    let turnActor: string;
    let isSelfActiveTurn: boolean;

    if (is2v2 && phase === 'playing' && activeSeat && seats) {
      if (activeSeat === localSeat) {
        turnActor = `À vous de jouer (Siège ${activeSeat})`;
        isSelfActiveTurn = true;
      } else if (localPlayerSymbol && TEAM_SEAT_SYMBOL[activeSeat] === localPlayerSymbol) {
        turnActor = `Tour de votre coéquipier · ${seats[activeSeat]?.pseudo ?? activeSeat} (${activeSeat})`;
        isSelfActiveTurn = false;
      } else {
        turnActor = `Tour de ${seats[activeSeat]?.pseudo ?? activeSeat} (${activeSeat})`;
        isSelfActiveTurn = false;
      }
    } else {
      const isYourTurn = !isOnline || localPlayerSymbol === activeSymbol;
      isSelfActiveTurn = Boolean(isOnline && localPlayerSymbol === activeSymbol);
      turnActor = isYourTurn
        ? isOnline
          ? 'À vous de jouer'
          : `Tour de ${activePlayerObj?.pseudo ?? activeSymbol}`
        : `Tour de ${activePlayerObj?.pseudo ?? activeSymbol}`;
    }

    const lastWarning =
      isOnline &&
      localPlayerSymbol != null &&
      isSelfActiveTurn &&
      (moveTimeouts?.[localPlayerSymbol] ?? 0) > 0;

    return (
      <div className="flex items-center gap-1.5 min-w-0">
        {lastWasAuto && (
          <span
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-tight"
            style={{
              backgroundColor: 'var(--danger-bg)',
              color: 'var(--danger-color)',
              border: '1px solid var(--danger-color)',
            }}
            title="Temps dépassé : un coup aléatoire a été joué automatiquement"
          >
            Coup d’office
          </span>
        )}
        <span
          className="text-xs font-semibold truncate"
          style={{ color: 'var(--text-primary)' }}
        >
          {turnActor}
        </span>
        {lastWarning ? (
          <span
            className="text-xs font-medium truncate"
            style={{ color: 'var(--danger-color)' }}
          >
            · encore un dépassement et la partie est perdue
          </span>
        ) : (
          <span className="shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
            · {zoneText}
          </span>
        )}
      </div>
    );
  };

  const winDelta =
    eloStakes && localPlayerSymbol === 'O' ? eloStakes.winO : eloStakes?.winX;
  const lossDelta =
    eloStakes && localPlayerSymbol === 'O' ? eloStakes.lossO : eloStakes?.lossX;

  const showSpectatorPill =
    showDesktopMeta && (isSpectator || (spectatorCount ?? 0) > 0);
  const showEloPill =
    showDesktopMeta && eloStakes && winDelta !== undefined && lossDelta !== undefined;
  const showModePill = showDesktopMeta && mode === '2v2';

  return (
    <div className="w-full max-w-[580px] mx-auto flex h-7 items-center justify-between gap-2 px-2 sm:px-1">
      <div className="min-w-0 flex-1 flex items-center">{renderContent()}</div>

      {(showModePill || showSpectatorPill || showEloPill) && (
        <div className="flex items-center gap-1.5 shrink-0">
          {showModePill && (
            <span
              className="rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none"
              style={{
                backgroundColor: 'var(--accent-active-bg)',
                color: 'var(--accent-active-text)',
                border: '1px solid var(--accent-active)',
              }}
            >
              2v2
            </span>
          )}

          {showSpectatorPill && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none"
              style={{
                backgroundColor: isSpectator
                  ? 'var(--accent-active-bg)'
                  : 'var(--bg-surface)',
                color: isSpectator
                  ? 'var(--accent-active-text)'
                  : 'var(--text-secondary)',
                border: `1px solid ${
                  isSpectator ? 'var(--accent-active)' : 'var(--border-cell)'
                }`,
              }}
              title="Spectateurs en direct"
            >
              <Eye className="w-3 h-3 shrink-0" strokeWidth={2} />
              <span>
                {(spectatorCount ?? 0) > 0
                  ? `${spectatorCount} spectateur${(spectatorCount ?? 0) > 1 ? 's' : ''}`
                  : 'Mode spectateur'}
              </span>
            </span>
          )}

          {showEloPill && (
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-cell)',
              }}
              title="Enjeu Elo (Victoire / Défaite)"
            >
              Elo{' '}
              <span className="font-semibold" style={{ color: 'var(--x-color)' }}>
                {formatSigned(winDelta)}
              </span>
              /
              <span className="font-semibold" style={{ color: 'var(--danger-color)' }}>
                {formatSigned(lossDelta)}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export interface PlayerBarProps {
  players: {
    X: RoomPlayer | null;
    O: RoomPlayer | null;
  };
  gameState: GameState;
  phase: 'waiting' | 'playing' | 'finished';
  clocks: { X: number; O: number } | null;
  localPlayerSymbol?: Player | null;
  isOnline: boolean;
  eloStakes?: EloStakes | null;
  endReason: EndReason | null;
  matchWinner: Player | null;
  preview: DestinationPreview | null;
  hoveredMove: Move | null;
  pieceStyle?: PieceStyle;
  moveTimeouts?: { X: number; O: number } | null;
  mode?: RoomMode;
  seats?: Record<TeamSeat, RoomPlayer | null> | null;
  activeSeat?: TeamSeat | null;
  localSeat?: TeamSeat | null;
  spectatorCount?: number;
  activeEmote?: RoomEmote | null;
}

export function PlayerBar({
  players,
  gameState,
  phase,
  clocks,
  localPlayerSymbol,
  isOnline,
  eloStakes,
  endReason,
  matchWinner,
  preview,
  hoveredMove,
  pieceStyle = 'classique',
  moveTimeouts = null,
  mode = '1v1',
  seats = null,
  activeSeat = null,
  localSeat = null,
  spectatorCount,
  activeEmote = null,
}: PlayerBarProps) {
  const xCaptured = gameState.boards.filter((b) => b.status === 'X').length;
  const oCaptured = gameState.boards.filter((b) => b.status === 'O').length;
  const is2v2 = mode === '2v2' && seats !== null;

  const getTeamMembers = (symbol: Player): TeamMemberSlot[] | undefined => {
    if (!is2v2 || !seats) return undefined;
    const teamSeats: readonly [TeamSeat, TeamSeat] =
      symbol === 'X' ? ['A', 'B'] : ['C', 'D'];
    return teamSeats.map((seat) => ({
      seat,
      player: seats[seat],
      isActiveSeat: phase === 'playing' && activeSeat === seat,
      isSelfSeat: localSeat === seat,
    }));
  };

  return (
    <header className="w-full max-w-[580px] mx-auto px-2 sm:px-0">
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {(['X', 'O'] as const).map((symbol) => {
          const clockMs = clocks ? clocks[symbol] : null;
          return (
            <PlayerCard
              key={symbol}
              symbol={symbol}
              player={players[symbol]}
              isTurn={phase === 'playing' && gameState.currentPlayer === symbol}
              isSelf={isOnline && localPlayerSymbol === symbol}
              isOpponent={
                Boolean(isOnline && localPlayerSymbol && localPlayerSymbol !== symbol)
              }
              clockMs={clockMs}
              isLowClock={clockMs !== null && clockMs <= 15_000 && phase === 'playing'}
              capturedCount={symbol === 'X' ? xCaptured : oCaptured}
              pieceStyle={pieceStyle}
              variant="compact"
              teamMembers={getTeamMembers(symbol)}
              activeEmote={activeEmote}
            />
          );
        })}
      </div>

      {is2v2 && seats && (
        <div className="mt-1.5">
          <TeamRelayStrip
            seats={seats}
            activeSeat={activeSeat}
            localSeat={localSeat}
            startingPlayer={gameState.startingPlayer}
            phase={phase}
          />
        </div>
      )}

      <div className="mt-1.5">
        <TacticalStatusStrip
          players={players}
          gameState={gameState}
          phase={phase}
          localPlayerSymbol={localPlayerSymbol}
          isOnline={isOnline}
          eloStakes={eloStakes}
          endReason={endReason}
          matchWinner={matchWinner}
          preview={preview}
          hoveredMove={hoveredMove}
          showDesktopMeta
          moveTimeouts={moveTimeouts}
          mode={mode}
          seats={seats}
          activeSeat={activeSeat}
          localSeat={localSeat}
          spectatorCount={spectatorCount}
          activeEmote={activeEmote}
        />
      </div>
    </header>
  );
}
