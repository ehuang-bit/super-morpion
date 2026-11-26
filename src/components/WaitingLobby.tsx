import { useEffect, useRef, useState } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import {
  ROOM_READY_COUNTDOWN_MS,
  TEAM_SEAT_SYMBOL,
  TIME_CONTROL_LABELS,
  getTurnSeatOrder,
  type RoomPlayer,
  type RoomSnapshot,
  type TeamSeat,
} from '@shared/protocol';
import { ArrowLeft, Check, CheckCircle2, Clock, Copy, Share2, Users } from 'lucide-react';
import { formatRoomCode } from '../utils/format';
import { CHIP_SPRING, SMOOTH_EASE } from '../utils/motion';
import { soundEngine } from '../utils/soundEngine';
import { QrCode } from './QrCode';
import { SymbolMark } from './Symbols';

export interface WaitingLobbyProps {
  snapshot: RoomSnapshot;
  localPlayerId?: string;
  clockOffsetMs?: number;
  isBusy?: boolean;
  onSwitchSeat?: (seat: TeamSeat) => void;
  onConfirmReady?: (ready: boolean) => void;
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
  clockOffsetMs = 0,
  isBusy = false,
  onSwitchSeat,
  onConfirmReady,
  onCancel,
}: WaitingLobbyProps) {
  const [copiedType, setCopiedType] = useState<'link' | 'code' | null>(null);
  const [nowEstimate, setNowEstimate] = useState<number>(() => Date.now() + clockOffsetMs);
  const lastSoundSecondRef = useRef<number | null>(null);

  const is2v2 = snapshot.mode === '2v2' && snapshot.seats !== null;
  const seats = is2v2 ? snapshot.seats : null;
  const maxPlayers = is2v2 ? 4 : 2;
  const occupiedCount = is2v2 && seats
    ? ALL_SEATS.filter((seat) => seats[seat] !== null).length
    : (snapshot.players.X ? 1 : 0) + (snapshot.players.O ? 1 : 0);
  const allSeated = occupiedCount === maxPlayers;
  const turnOrder = getTurnSeatOrder(snapshot.gameState.startingPlayer);

  const requireConfirm = Boolean(snapshot.requireConfirm);
  const readySet = new Set(snapshot.readyPlayerIds ?? []);
  const seatedPlayers: RoomPlayer[] = is2v2 && seats
    ? ALL_SEATS.map((s) => seats[s]).filter((p): p is RoomPlayer => p !== null)
    : ([snapshot.players.X, snapshot.players.O].filter(
        (p): p is RoomPlayer => p !== null,
      ));
  const readyCount = seatedPlayers.filter((p) => readySet.has(p.id)).length;
  const localIsSeated = Boolean(
    localPlayerId && seatedPlayers.some((p) => p.id === localPlayerId),
  );
  const localIsReady = Boolean(localPlayerId && readySet.has(localPlayerId));

  const countdownEndsAt = requireConfirm ? (snapshot.countdownEndsAt ?? null) : null;
  const isCountdownActive = countdownEndsAt !== null;

  useEffect(() => {
    if (countdownEndsAt === null) {
      lastSoundSecondRef.current = null;
      return;
    }
    const update = () => setNowEstimate(Date.now() + clockOffsetMs);
    update();
    const id = window.setInterval(update, 80);
    return () => window.clearInterval(id);
  }, [countdownEndsAt, clockOffsetMs]);

  const countdownRemainingMs =
    countdownEndsAt !== null ? Math.max(0, countdownEndsAt - nowEstimate) : 0;
  const countdownSeconds =
    countdownEndsAt !== null
      ? countdownRemainingMs > 0
        ? Math.max(1, Math.ceil(countdownRemainingMs / 1000))
        : 0
      : 0;
  const countdownProgress =
    countdownEndsAt !== null
      ? Math.max(0, Math.min(1, countdownRemainingMs / ROOM_READY_COUNTDOWN_MS))
      : 0;

  useEffect(() => {
    if (countdownEndsAt === null || countdownSeconds <= 0) return;
    if (lastSoundSecondRef.current !== countdownSeconds) {
      lastSoundSecondRef.current = countdownSeconds;
      soundEngine.playCountdownTick(countdownSeconds);
    }
  }, [countdownEndsAt, countdownSeconds]);

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
      setCopiedType(type);
    }
  };

  return (
    <main
      className={`w-full ${is2v2 ? 'max-w-[488px]' : 'max-w-[460px]'} mx-auto px-1 sm:px-2 lg:px-0 flex-1 flex flex-col justify-center`}
    >
      <div
        className="rounded-[16px] p-4 sm:p-5 lg:p-4 xl:p-5 flex flex-col gap-4"
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
              {is2v2 ? 'Salon 2v2 en équipes' : 'Salon privé'}
            </h1>
            <p
              className="text-xs sm:text-sm mt-0.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              {requireConfirm
                ? allSeated
                  ? isCountdownActive
                    ? 'Tout le monde a confirmé : la partie va démarrer.'
                    : 'Tout le monde est là : confirme pour lancer le départ.'
                  : is2v2
                    ? 'Partage le code : chacun rejoint puis confirme avant le coup d’envoi.'
                    : 'Partage le lien ou le code, puis confirmez tous les deux pour démarrer.'
                : is2v2
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

        {/* Joueurs en présence (mode 1v1 avec confirmation) */}
        {!is2v2 && requireConfirm && (
          <div className="flex flex-col gap-2">
            {(['X', 'O'] as const).map((sym) => {
              const player = snapshot.players[sym];
              const color = sym === 'X' ? 'var(--x-color)' : 'var(--o-color)';
              const surface = sym === 'X' ? 'var(--x-surface)' : 'var(--o-surface)';
              const isSelf = Boolean(player && localPlayerId && player.id === localPlayerId);
              const isReady = Boolean(player && readySet.has(player.id));

              if (!player) {
                return (
                  <div
                    key={sym}
                    className="rounded-[12px] px-3 py-2.5 flex items-center justify-between gap-2.5"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--bg-surface) 55%, transparent)',
                      border: '1px dashed var(--border-strong)',
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 opacity-60"
                        style={{ backgroundColor: surface }}
                      >
                        <span className="w-4 h-4">
                          <SymbolMark player={sym} size="badge" />
                        </span>
                      </span>
                      <span
                        className="text-xs font-semibold truncate"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Joueur {sym}
                      </span>
                    </div>
                    <span
                      className="shrink-0 text-[11px] font-medium"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      En attente…
                    </span>
                  </div>
                );
              }

              return (
                <motion.div
                  key={sym}
                  initial={{ opacity: 0, scale: 0.96, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={CHIP_SPRING}
                  className="rounded-[12px] px-3 py-2.5 flex items-center justify-between gap-2.5"
                  style={{
                    backgroundColor: isReady ? surface : 'var(--bg-surface)',
                    border: isSelf
                      ? `1.5px solid ${color}`
                      : `1px solid ${isReady ? color : 'var(--border-main)'}`,
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--bg-board)', border: `1px solid ${color}` }}
                    >
                      <span className="w-4 h-4">
                        <SymbolMark player={sym} size="badge" />
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="text-sm font-bold truncate"
                          style={{ color: 'var(--text-primary)' }}
                          title={player.pseudo}
                        >
                          {player.pseudo}
                        </span>
                        {isSelf && (
                          <span
                            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
                            style={{ backgroundColor: 'var(--bg-board)', color }}
                          >
                            Toi
                          </span>
                        )}
                      </div>
                      <span
                        className="block font-mono text-[11px] tabular-nums truncate"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {player.elo} · {player.tier}
                      </span>
                    </div>
                  </div>

                  <span
                    className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{
                      backgroundColor: isReady ? 'var(--bg-board)' : 'var(--bg-recessed)',
                      color: isReady ? 'var(--x-color)' : 'var(--text-muted)',
                      border: `1px solid ${isReady ? 'color-mix(in srgb, var(--x-color) 35%, transparent)' : 'var(--border-cell)'}`,
                    }}
                  >
                    {isReady ? (
                      <>
                        <Check className="w-3 h-3" strokeWidth={2.5} />
                        <span>Confirmé</span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-3 h-3" />
                        <span>Pas encore prêt</span>
                      </>
                    )}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Formation des équipes en 2v2 (changement de place libre avant le décompte) */}
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
              {onSwitchSeat && !isCountdownActive && (
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  Choisissez votre équipe
                </span>
              )}
            </div>

            <LayoutGroup id={`waiting-teams-${snapshot.code}`}>
              <div className="grid grid-cols-1 min-[440px]:grid-cols-2 gap-2.5">
                {TEAM_CONFIG.map((team) => (
                  <div
                    key={team.symbol}
                    className="rounded-[12px] p-2 sm:p-2.5 flex flex-col gap-2"
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
                        const isReady = Boolean(player && readySet.has(player.id));

                        if (player) {
                          return (
                            <div
                              key={seat}
                              className="rounded-[10px] px-1.5 sm:px-2 py-1.5 min-h-[44px] sm:min-h-[38px] flex items-center gap-1.5 sm:gap-2"
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
                                <span className="shrink-0 flex items-center gap-1">
                                  {isSelf && (
                                    <span
                                      className="rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
                                      style={{
                                        backgroundColor: team.surface,
                                        color: team.color,
                                      }}
                                    >
                                      Toi
                                    </span>
                                  )}
                                  {requireConfirm && (
                                    <span
                                      title={isReady ? 'Confirmé' : 'En attente de confirmation'}
                                      aria-label={isReady ? 'Confirmé' : 'En attente'}
                                      className="inline-flex items-center justify-center w-4 h-4 rounded-full"
                                      style={{
                                        backgroundColor: isReady
                                          ? 'var(--x-surface)'
                                          : 'var(--bg-recessed)',
                                        color: isReady
                                          ? 'var(--x-color)'
                                          : 'var(--text-muted)',
                                      }}
                                    >
                                      {isReady ? (
                                        <Check className="w-2.5 h-2.5" strokeWidth={2.75} />
                                      ) : (
                                        <Clock className="w-2.5 h-2.5" />
                                      )}
                                    </span>
                                  )}
                                </span>
                              </motion.div>
                            </div>
                          );
                        }

                        if (onSwitchSeat && !isCountdownActive) {
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

        {/* Confirmation + Compte à rebours de lancement (3,5 s) */}
        {requireConfirm &&
          (isCountdownActive ? (
            <motion.div
              key="countdown"
              id="lobby-countdown-banner"
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, scale: 0.96, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.22, ease: SMOOTH_EASE }}
                className="relative overflow-hidden rounded-[14px] p-3.5 flex flex-col gap-2.5"
                style={{
                  backgroundColor: 'var(--accent-active-bg)',
                  border: '1.5px solid var(--accent-active)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <motion.span
                      key={countdownSeconds}
                      initial={{ scale: 1.35, opacity: 0.5 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={CHIP_SPRING}
                      className="w-10 h-10 rounded-full flex items-center justify-center font-mono text-lg font-extrabold shrink-0"
                      style={{
                        backgroundColor: 'var(--btn-primary-bg)',
                        color: 'var(--btn-primary-text)',
                        boxShadow: 'var(--shadow-card)',
                      }}
                    >
                      {countdownSeconds > 0 ? countdownSeconds : '•'}
                    </motion.span>
                    <div className="min-w-0">
                      <p
                        className="text-sm font-extrabold leading-tight"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Tout le monde est prêt !
                      </p>
                      <p
                        className="text-xs font-medium mt-0.5"
                        style={{ color: 'var(--accent-active-text)' }}
                      >
                        {countdownSeconds > 0
                          ? `La partie commence dans ${countdownSeconds} s…`
                          : 'Lancement de la partie…'}
                      </p>
                    </div>
                  </div>
                  {localIsSeated && onConfirmReady && countdownSeconds > 0 && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onConfirmReady(false)}
                      className="tactile-btn shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                      style={{
                        backgroundColor: 'var(--bg-board)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-main)',
                      }}
                    >
                      Annuler
                    </button>
                  )}
                </div>
                <div
                  className="h-1.5 w-full rounded-full overflow-hidden"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--bg-board) 65%, transparent)' }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-75 ease-linear"
                    style={{
                      width: `${Math.round(countdownProgress * 100)}%`,
                      backgroundColor: 'var(--accent-active)',
                    }}
                  />
                </div>
              </motion.div>
            ) : localIsSeated && onConfirmReady ? (
              <motion.div
                key="confirm-controls"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: SMOOTH_EASE }}
                className="rounded-[14px] p-3 flex flex-col gap-2"
                style={{
                  backgroundColor: localIsReady ? 'var(--x-surface)' : 'var(--bg-surface)',
                  border: `1px solid ${localIsReady ? 'var(--x-color)' : 'var(--border-main)'}`,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs font-semibold"
                    style={{
                      color: localIsReady ? 'var(--x-color)' : 'var(--text-secondary)',
                    }}
                  >
                    {localIsReady
                      ? allSeated
                        ? 'Confirmation enregistrée · En attente des autres…'
                        : 'Tu as confirmé · En attente des autres joueurs…'
                      : allSeated
                        ? 'Clique sur Confirmer pour lancer la partie'
                        : 'Confirme ta présence dès que tu es prêt'}
                  </span>
                  <span
                    className="shrink-0 font-mono text-xs font-bold tabular-nums rounded-full px-2 py-0.5"
                    style={{
                      backgroundColor: 'var(--bg-board)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-cell)',
                    }}
                  >
                    {readyCount}/{maxPlayers}
                  </span>
                </div>

                {localIsReady ? (
                  <button
                    id="lobby-unconfirm-btn"
                    type="button"
                    disabled={isBusy}
                    onClick={() => onConfirmReady(false)}
                    className="tactile-btn w-full rounded-[10px] px-3 py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                    style={{
                      backgroundColor: 'var(--bg-board)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-main)',
                    }}
                  >
                    <span>Annuler ma confirmation</span>
                  </button>
                ) : (
                  <button
                    id="lobby-confirm-btn"
                    type="button"
                    disabled={isBusy}
                    onClick={() => onConfirmReady(true)}
                    className="tactile-btn cta-primary w-full rounded-[11px] px-4 py-2.5 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--btn-primary-bg)',
                      color: 'var(--btn-primary-text)',
                    }}
                  >
                    <CheckCircle2 className="w-4 h-4" strokeWidth={2.2} />
                    <span>Confirmer</span>
                  </button>
                )}
              </motion.div>
            ) : null)}

        {/* Code du salon + QR code : complet tant qu'on attend des joueurs, compact une fois au complet */}
        {requireConfirm && allSeated ? (
          <div
            className="rounded-[10px] px-3 py-2 flex items-center justify-between gap-2"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-cell)',
            }}
          >
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Salon{' '}
              <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                #{formatRoomCode(snapshot.code)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => copyText(inviteUrl, 'link')}
              className="tactile-btn inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold"
              style={{
                backgroundColor: 'var(--bg-board)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-main)',
              }}
            >
              {copiedType === 'link' ? (
                <>
                  <Check className="w-3 h-3" style={{ color: 'var(--x-color)' }} />
                  <span>Lien copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Partager</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <>
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
          </>
        )}

        <div
          className="flex items-center justify-between gap-2 pt-2 border-t"
          style={{ borderColor: 'var(--border-cell)' }}
        >
          <span
            className="inline-flex items-center gap-2 text-xs font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            <span className="live-dot" aria-hidden="true" />
            {requireConfirm
              ? `${occupiedCount}/${maxPlayers} joueurs · ${readyCount}/${maxPlayers} prêts`
              : is2v2
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
            <span>Quitter</span>
          </button>
        </div>
      </div>
    </main>
  );
}
