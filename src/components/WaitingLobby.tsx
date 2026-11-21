import { useEffect, useState } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import {
  TEAM_SEAT_SYMBOL,
  TIME_CONTROL_LABELS,
  getTurnSeatOrder,
  type RoomSnapshot,
  type TeamSeat,
} from '@shared/protocol';
import { ArrowLeft, Check, Copy, Share2, Users } from 'lucide-react';
import { formatRoomCode } from '../utils/format';
import { CHIP_SPRING } from '../utils/motion';
import { QrCode } from './QrCode';
import { SymbolMark } from './Symbols';

export interface WaitingLobbyProps {
  snapshot: RoomSnapshot;
  localPlayerId?: string;
  onSwitchSeat?: (seat: TeamSeat) => void;
  onCancel: () => void;
}

const TEAM_CONFIG: readonly {
  symbol: 'X' | 'O';
  label: string;
  seats: readonly [TeamSeat, TeamSeat];
  color: string;
  surface: string;
}[] = [
  {
    symbol: 'X',
    label: 'Équipe X',
    seats: ['A', 'B'],
    color: 'var(--x-color)',
    surface: 'var(--x-surface)',
  },
  {
    symbol: 'O',
    label: 'Équipe O',
    seats: ['C', 'D'],
    color: 'var(--o-color)',
    surface: 'var(--o-surface)',
  },
];

const ALL_SEATS: readonly TeamSeat[] = ['A', 'B', 'C', 'D'];

export function WaitingLobby({
  snapshot,
  localPlayerId,
  onSwitchSeat,
  onCancel,
}: WaitingLobbyProps) {
  const [copiedType, setCopiedType] = useState<'link' | 'code' | null>(null);

  const is2v2 = snapshot.mode === '2v2' && snapshot.seats !== null;
  const seats = is2v2 ? snapshot.seats : null;
  const occupiedCount = seats
    ? ALL_SEATS.filter((seat) => seats[seat] !== null).length
    : 0;
  const turnOrder = getTurnSeatOrder(snapshot.gameState.startingPlayer);

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/room/${snapshot.code}`
      : `/room/${snapshot.code}`;

  useEffect(() => {
    if (!copiedType) return;
    const timer = window.setTimeout(() => setCopiedType(null), 2200);
    return () => window.clearTimeout(timer);
  }, [copiedType]);

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const shareInvite = async () => {
    try {
      await navigator.share({
        title: is2v2 ? 'Super Morpion — 2v2 en équipes' : 'Super Morpion — duel',
        text: is2v2
          ? `Rejoins notre partie 2v2 au Super Morpion (${TIME_CONTROL_LABELS[snapshot.timeControl]}) ! Code ${snapshot.code}`
          : `Je te défie au Super Morpion (${TIME_CONTROL_LABELS[snapshot.timeControl]}) ! Code ${snapshot.code}`,
        url: inviteUrl,
      });
    } catch {
      // Partage annulé
    }
  };

  const copyText = async (text: string, type: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
    } catch {
      // Fallback for restricted clipboard permissions
      setCopiedType(type);
    }
  };

  return (
    <main
      className={`w-full ${is2v2 ? 'max-w-[488px]' : 'max-w-[460px]'} mx-auto px-1 sm:px-2 lg:px-0 flex-1 flex flex-col justify-center`}
    >
      <div
        className="rounded-[16px] p-4 sm:p-5 lg:p-4 xl:p-5 flex flex-col gap-4 sm:gap-5"
        style={{
          backgroundColor: 'var(--bg-board)',
          border: '1px solid var(--border-main)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1
              className="text-lg font-bold tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              {is2v2 ? 'Salon 2v2 en équipes' : 'Duel privé prêt'}
            </h1>
            <p
              className="text-xs sm:text-sm mt-0.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              {is2v2
                ? 'Partagez le code ou le QR : la partie démarre dès que les 4 places sont prises.'
                : 'Partagez le lien ou le code à votre adversaire.'}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-1.5">
            {is2v2 && (
              <span
                className="rounded-lg px-2 py-1 text-xs font-bold"
                style={{
                  backgroundColor: 'var(--accent-active-bg)',
                  color: 'var(--accent-active-text)',
                  border: '1px solid var(--accent-active)',
                }}
              >
                2v2
              </span>
            )}
            <span
              className="rounded-lg px-2.5 py-1 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-main)',
              }}
            >
              {TIME_CONTROL_LABELS[snapshot.timeControl]}
            </span>
          </div>
        </div>

        {/* Formation des équipes en 2v2 (changement de place libre avant le 4e joueur) */}
        {is2v2 && seats && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span
                className="inline-flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Users className="w-3.5 h-3.5" style={{ color: 'var(--accent-active-text)' }} />
                <span>Formation des équipes</span>
              </span>
              {onSwitchSeat && (
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  Choisissez votre équipe
                </span>
              )}
            </div>

            <LayoutGroup id={`waiting-teams-${snapshot.code}`}>
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2.5">
                {TEAM_CONFIG.map((team) => (
                  <div
                    key={team.symbol}
                    className="rounded-[12px] p-2.5 flex flex-col gap-2"
                    style={{
                      backgroundColor: team.surface,
                      border: `1px solid color-mix(in srgb, ${team.color} 28%, var(--border-main))`,
                    }}
                  >
                    <div className="flex items-center gap-1.5 px-0.5">
                      <span className="w-3.5 h-3.5 shrink-0">
                        <SymbolMark player={team.symbol} size="badge" />
                      </span>
                      <span
                        className="text-xs font-bold tracking-tight"
                        style={{ color: team.color }}
                      >
                        {team.label}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {team.seats.map((seat) => {
                        const player = seats[seat];
                        const isSelf = Boolean(
                          player && localPlayerId && player.id === localPlayerId,
                        );

                        if (player) {
                          return (
                            <div
                              key={seat}
                              className="rounded-[10px] px-2 py-1.5 min-h-[44px] sm:min-h-[38px] flex items-center gap-2"
                              style={{
                                backgroundColor: 'var(--bg-board)',
                                border: isSelf
                                  ? `1.5px solid ${team.color}`
                                  : '1px solid var(--border-cell)',
                              }}
                            >
                              <span
                                className="w-5 h-5 rounded-md flex items-center justify-center font-mono text-[11px] font-bold shrink-0"
                                style={{
                                  backgroundColor: team.surface,
                                  color: team.color,
                                }}
                              >
                                {seat}
                              </span>
                              <motion.div
                                key={player.id}
                                layout="position"
                                layoutId={`lobby-seat-player-${player.id}`}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={CHIP_SPRING}
                                className="flex-1 min-w-0 flex items-center justify-between gap-1"
                              >
                                <span
                                  className="truncate text-xs font-semibold"
                                  style={{ color: 'var(--text-primary)' }}
                                  title={player.pseudo}
                                >
                                  {player.pseudo}
                                </span>
                                {isSelf && (
                                  <span
                                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
                                    style={{
                                      backgroundColor: team.surface,
                                      color: team.color,
                                    }}
                                  >
                                    Toi
                                  </span>
                                )}
                              </motion.div>
                            </div>
                          );
                        }

                        if (onSwitchSeat) {
                          return (
                            <motion.button
                              key={seat}
                              type="button"
                              layout="position"
                              initial={{ opacity: 0.7, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={CHIP_SPRING}
                              onClick={() => onSwitchSeat(seat)}
                              title={`Cliquer pour prendre la place ${seat} (${team.label})`}
                              aria-label={`Changer pour la place ${seat} (${team.label})`}
                              className="tactile-btn w-full rounded-[10px] px-2 py-1.5 min-h-[44px] sm:min-h-[38px] flex items-center gap-1.5 text-left"
                              style={{
                                backgroundColor:
                                  'color-mix(in srgb, var(--bg-board) 62%, transparent)',
                                color: team.color,
                                border: `1px dashed color-mix(in srgb, ${team.color} 45%, var(--border-strong))`,
                              }}
                            >
                              <span
                                className="w-5 h-5 rounded-md flex items-center justify-center font-mono text-[11px] font-bold shrink-0 opacity-80"
                                style={{
                                  backgroundColor: 'var(--bg-board)',
                                  color: team.color,
                                }}
                              >
                                {seat}
                              </span>
                              <span className="truncate text-[11px] font-semibold">
                                Place libre
                              </span>
                            </motion.button>
                          );
                        }

                        return (
                          <div
                            key={seat}
                            className="rounded-[10px] px-2 py-1.5 min-h-[44px] sm:min-h-[38px] flex items-center gap-2"
                            style={{
                              backgroundColor:
                                'color-mix(in srgb, var(--bg-board) 50%, transparent)',
                              border: '1px dashed var(--border-strong)',
                            }}
                          >
                            <span
                              className="w-5 h-5 rounded-md flex items-center justify-center font-mono text-[11px] font-bold shrink-0 opacity-65"
                              style={{
                                backgroundColor: 'var(--bg-board)',
                                color: team.color,
                              }}
                            >
                              {seat}
                            </span>
                            <span
                              className="truncate text-[11px] font-medium"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              Place libre
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </LayoutGroup>

            {/* Ordre des tours : A → C → B → D */}
            <div
              className="rounded-[10px] px-3 py-2 flex flex-wrap items-center justify-between gap-2"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-cell)',
              }}
            >
              <span
                className="text-[11px] font-semibold"
                style={{ color: 'var(--text-muted)' }}
              >
                Ordre des tours :
              </span>
              <div
                className="flex items-center gap-1"
                aria-label={`Ordre des tours : ${turnOrder.join(', ')}`}
              >
                {turnOrder.map((seat, idx) => {
                  const isX = TEAM_SEAT_SYMBOL[seat] === 'X';
                  const seatColor = isX ? 'var(--x-color)' : 'var(--o-color)';
                  const seatSurface = isX ? 'var(--x-surface)' : 'var(--o-surface)';
                  const filled = seats[seat] !== null;

                  return (
                    <div key={seat} className="inline-flex items-center gap-1">
                      <motion.span
                        initial={{ opacity: 0, y: 4, scale: 0.85 }}
                        animate={{ opacity: filled ? 1 : 0.72, y: 0, scale: 1 }}
                        transition={{ ...CHIP_SPRING, delay: idx * 0.05 }}
                        className="inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-md px-1.5 font-mono text-[11px] font-bold"
                        style={{
                          backgroundColor: seatSurface,
                          color: seatColor,
                          border: filled
                            ? `1px solid color-mix(in srgb, ${seatColor} 45%, transparent)`
                            : '1px dashed var(--border-strong)',
                        }}
                        title={seats[seat]?.pseudo ?? `Place ${seat} libre`}
                      >
                        {seat}
                      </motion.span>
                      {idx < turnOrder.length - 1 && (
                        <span
                          className="text-[11px] font-semibold select-none"
                          style={{ color: 'var(--text-muted)' }}
                          aria-hidden="true"
                        >
                          →
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Code du salon à 6 caractères + QR code d'invitation */}
        <div className="flex flex-col min-[360px]:flex-row items-stretch gap-3">
          <div
            className="flex-1 min-w-0 rounded-[12px] p-3.5 sm:p-4 lg:p-3.5 xl:p-4 flex flex-col justify-between gap-3"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-main)',
            }}
          >
            <div>
              <span
                className="block text-[11px] font-semibold"
                style={{ color: 'var(--text-muted)' }}
              >
                Code du salon
              </span>
              <span
                className="mt-1 block font-mono text-xl sm:text-2xl lg:text-xl xl:text-2xl font-semibold tracking-[0.12em] whitespace-nowrap"
                style={{ color: 'var(--text-primary)' }}
              >
                {formatRoomCode(snapshot.code)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => copyText(snapshot.code, 'code')}
              className="tactile-btn self-start inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--bg-board)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-strong)',
              }}
            >
              {copiedType === 'code' ? (
                <>
                  <Check className="w-3.5 h-3.5" style={{ color: 'var(--x-color)' }} />
                  <span>Copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copier</span>
                </>
              )}
            </button>
          </div>

          <div className="shrink-0 flex flex-col items-center justify-center gap-1.5">
            <QrCode
              value={inviteUrl}
              size={116}
              label={`QR code d’invitation pour le salon ${snapshot.code}`}
            />
            <span
              className="text-[10.5px] font-medium text-center leading-tight max-w-[118px]"
              style={{ color: 'var(--text-muted)' }}
            >
              Scanner pour rejoindre
            </span>
          </div>
        </div>

        {/* Direct invite link */}
        <div>
          <span
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            Lien d’invitation direct
          </span>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              readOnly
              value={inviteUrl}
              aria-label="Lien d’invitation direct"
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 rounded-[10px] px-3 py-2 font-mono text-xs"
              style={{
                backgroundColor: 'var(--bg-recessed)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-cell)',
              }}
            />
            <button
              type="button"
              onClick={() => copyText(inviteUrl, 'link')}
              className="tactile-btn shrink-0 rounded-[10px] px-4 py-2 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
              }}
            >
              {copiedType === 'link' ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Lien copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copier le lien</span>
                </>
              )}
            </button>
          </div>
          {canShare && (
            <button
              type="button"
              onClick={() => void shareInvite()}
              className="tactile-btn mt-2 w-full rounded-[10px] px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2"
              style={{
                backgroundColor: 'var(--accent-active-bg)',
                color: 'var(--accent-active-text)',
                border: '1px solid var(--accent-active)',
              }}
            >
              <Share2 className="w-4 h-4" />
              <span>Envoyer l’invitation</span>
            </button>
          )}
        </div>

        <div
          className="flex items-center justify-between gap-2 pt-2 border-t"
          style={{ borderColor: 'var(--border-cell)' }}
        >
          <span
            className="inline-flex items-center gap-2 text-xs font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            <span className="live-dot" aria-hidden="true" />
            {is2v2
              ? `${occupiedCount}/4 joueurs connectés · En attente…`
              : 'En attente de l’adversaire…'}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="tactile-btn shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-main)',
            }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Annuler</span>
          </button>
        </div>
      </div>
    </main>
  );
}
