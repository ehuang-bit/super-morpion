import type { EloStakes } from '@shared/elo';
import {
  BOARD_COORDS,
  type DestinationPreview,
  type GameState,
  type Move,
  type Player,
} from '@shared/gameEngine';
import {
  TIME_CONTROL_LABELS,
  type EndReason,
  type RoomPlayer,
  type TimeControl,
} from '@shared/protocol';
import { Wifi, WifiOff } from 'lucide-react';
import type { PieceStyle } from '../types/boardPrefs';
import { formatClock } from '../utils/format';
import { SymbolMark } from './Symbols';

function formatSigned(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

interface PlayerCardProps {
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
}: PlayerCardProps) {
  const accentColor = symbol === 'X' ? 'var(--x-color)' : 'var(--o-color)';
  const surfaceTint = symbol === 'X' ? 'var(--x-surface)' : 'var(--o-surface)';

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
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-5 h-5 shrink-0">
          <SymbolMark player={symbol} size="badge" pieceStyle={pieceStyle} />
        </div>
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
                title={
                  player.provisional
                    ? `Classement provisoire : ${player.elo} ±${player.rd} (${player.tier})`
                    : `Classement : ${player.elo} ±${player.rd} (${player.tier})`
                }
              >
                {player.elo}
                {player.provisional ? '?' : ''}
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
    </div>
  );
}

interface MatchMetaStripProps {
  timeControl: TimeControl;
  roomCode?: string;
  eloStakes: EloStakes | null;
  perspectiveSymbol?: Player | null;
}

export function MatchMetaStrip({
  timeControl,
  roomCode,
  eloStakes,
  perspectiveSymbol,
}: MatchMetaStripProps) {
  const winDelta =
    eloStakes && perspectiveSymbol === 'O' ? eloStakes.winO : eloStakes?.winX;
  const drawDelta =
    eloStakes && perspectiveSymbol === 'O' ? eloStakes.drawO : eloStakes?.drawX;
  const lossDelta =
    eloStakes && perspectiveSymbol === 'O' ? eloStakes.lossO : eloStakes?.lossX;

  return (
    <div className="w-full max-w-[580px] mx-auto px-2.5 flex items-center justify-between gap-2 text-[11px] leading-none">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>
          {TIME_CONTROL_LABELS[timeControl]}
        </span>
        {roomCode && (
          <span
            className="rounded px-1.5 py-0.5 font-mono text-[10px] font-medium"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-main)',
            }}
          >
            #{roomCode}
          </span>
        )}
      </div>

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
  );
}

interface TacticalStatusStripProps {
  players: {
    X: RoomPlayer | null;
    O: RoomPlayer | null;
  };
  gameState: GameState;
  phase: 'waiting' | 'playing' | 'finished';
  localPlayerSymbol?: Player | null;
  isOnline: boolean;
  roomCode?: string;
  eloStakes?: EloStakes | null;
  endReason: EndReason | null;
  matchWinner: Player | null;
  preview: DestinationPreview | null;
  hoveredMove: Move | null;
  showDesktopMeta?: boolean;
}

export function TacticalStatusStrip({
  players,
  gameState,
  phase,
  localPlayerSymbol,
  isOnline,
  roomCode,
  eloStakes,
  endReason,
  matchWinner,
  preview,
  hoveredMove,
  showDesktopMeta = false,
}: TacticalStatusStripProps) {
  const activeSymbol = gameState.currentPlayer;
  const activePlayerObj = players[activeSymbol];

  const renderContent = () => {
    if (phase === 'finished') {
      const winnerName = matchWinner ? players[matchWinner]?.pseudo : null;
      let label = 'Match nul — plateau complet';
      if (endReason === 'aborted') {
        label = 'Partie annulée — non classée';
      } else if (endReason === 'timeout' && winnerName) {
        label = `${winnerName} gagne au temps`;
      } else if (endReason === 'resign' && winnerName) {
        label = `${winnerName} gagne par abandon`;
      } else if (endReason === 'abandoned' && winnerName) {
        label = `${winnerName} gagne (adversaire parti)`;
      } else if (winnerName) {
        label = `Victoire de ${winnerName}`;
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

    if (gameState.isFreeMove) {
      const originLabel =
        gameState.redirectedFromBoard !== null
          ? `Zone ${BOARD_COORDS[gameState.redirectedFromBoard]} verrouillée · `
          : '';
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

    const isYourTurn = !isOnline || localPlayerSymbol === activeSymbol;
    const turnActor = isYourTurn
      ? isOnline
        ? 'À vous de jouer'
        : `Tour de ${activePlayerObj?.pseudo ?? activeSymbol}`
      : `Tour de ${activePlayerObj?.pseudo ?? activeSymbol}`;

    const zoneText =
      gameState.activeBoard === null
        ? 'Plateau ouvert'
        : `Zone ${BOARD_COORDS[gameState.activeBoard]}`;

    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className="text-xs font-semibold truncate"
          style={{ color: 'var(--text-primary)' }}
        >
          {turnActor}
        </span>
        <span className="shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
          · {zoneText}
        </span>
      </div>
    );
  };

  const winDelta =
    eloStakes && localPlayerSymbol === 'O' ? eloStakes.winO : eloStakes?.winX;
  const lossDelta =
    eloStakes && localPlayerSymbol === 'O' ? eloStakes.lossO : eloStakes?.lossX;

  return (
    <div className="w-full max-w-[580px] mx-auto flex h-7 items-center justify-between gap-2 px-2 sm:px-1">
      <div className="min-w-0 flex-1 flex items-center">{renderContent()}</div>

      {showDesktopMeta && (
        <div className="flex items-center gap-1.5 shrink-0">
          {eloStakes && winDelta !== undefined && lossDelta !== undefined && (
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
          {roomCode && (
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[11px] font-medium"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-main)',
              }}
            >
              #{roomCode}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface PlayerBarProps {
  players: {
    X: RoomPlayer | null;
    O: RoomPlayer | null;
  };
  gameState: GameState;
  phase: 'waiting' | 'playing' | 'finished';
  clocks: { X: number; O: number } | null;
  localPlayerSymbol?: Player | null;
  isOnline: boolean;
  roomCode?: string;
  eloStakes?: EloStakes | null;
  endReason: EndReason | null;
  matchWinner: Player | null;
  preview: DestinationPreview | null;
  hoveredMove: Move | null;
  pieceStyle?: PieceStyle;
}

export function PlayerBar({
  players,
  gameState,
  phase,
  clocks,
  localPlayerSymbol,
  isOnline,
  roomCode,
  eloStakes,
  endReason,
  matchWinner,
  preview,
  hoveredMove,
  pieceStyle = 'classique',
}: PlayerBarProps) {
  const xCaptured = gameState.boards.filter((b) => b.status === 'X').length;
  const oCaptured = gameState.boards.filter((b) => b.status === 'O').length;

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
            />
          );
        })}
      </div>

      <div className="mt-1.5">
        <TacticalStatusStrip
          players={players}
          gameState={gameState}
          phase={phase}
          localPlayerSymbol={localPlayerSymbol}
          isOnline={isOnline}
          roomCode={roomCode}
          eloStakes={eloStakes}
          endReason={endReason}
          matchWinner={matchWinner}
          preview={preview}
          hoveredMove={hoveredMove}
          showDesktopMeta
        />
      </div>
    </header>
  );
}
