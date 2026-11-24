import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getEloTier, type EloMatchDelta } from '@shared/elo';
import type { Player } from '@shared/gameEngine';
import type { EndReason, RoomMode, RoomPlayer, TeamSeat } from '@shared/protocol';
import {
  Check,
  Eye,
  Home,
  RotateCcw,
  Share2,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import { CHIP_SPRING } from '../utils/motion';

export interface GameEndBannerProps {
  players: {
    X: RoomPlayer | null;
    O: RoomPlayer | null;
  };
  localSymbol: Player | null;
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
  /** Ne rejoue pas le décompte Elo si la séquence de fin l'a déjà animé. */
  skipRatingAnimation?: boolean;
  /** Permet au parent de masquer/afficher le bandeau (mode inspection du plateau). */
  hidden?: boolean;
  onHiddenChange?: (hidden: boolean) => void;
  mode?: RoomMode;
  seats?: Record<TeamSeat, RoomPlayer | null> | null;
  rematchVotes?: string[];
  isSpectator?: boolean;
  onOpenSouvenirCard?: () => void;
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function RatingLine({
  label,
  result,
  emphasize,
  skipAnimation = false,
}: {
  label: string;
  result: EloMatchDelta;
  emphasize: boolean;
  skipAnimation?: boolean;
}) {
  const shown = useAnimatedNumber(
    skipAnimation ? result.after : result.before,
    result.after,
    950,
    emphasize ? 450 : 600,
  );
  const deltaColor =
    result.delta > 0
      ? 'var(--x-color)'
      : result.delta < 0
        ? 'var(--danger-color)'
        : 'var(--text-secondary)';

  return (
    <div
      className="flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-1.5"
      style={{
        backgroundColor: emphasize ? 'var(--bg-surface)' : 'transparent',
        border: `1px solid ${emphasize ? 'var(--border-main)' : 'var(--border-cell)'}`,
      }}
    >
      <span
        className={`truncate ${emphasize ? 'text-sm font-semibold' : 'text-xs font-medium'}`}
        style={{ color: emphasize ? 'var(--text-primary)' : 'var(--text-secondary)' }}
      >
        {label}
      </span>
      <span className="shrink-0 flex items-center gap-1.5 font-mono tabular-nums">
        <span
          className={emphasize ? 'text-base font-bold' : 'text-xs font-semibold'}
          style={{ color: 'var(--text-primary)' }}
        >
          {shown}
        </span>
        {result.rated !== false && (
          <motion.span
            initial={{ opacity: 0, scale: 0.6, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              ...CHIP_SPRING,
              delay: skipAnimation ? 0.1 : emphasize ? 0.4 : 0.55,
            }}
            className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 ${
              emphasize ? 'text-xs' : 'text-[10px]'
            } font-bold`}
            style={{
              color: deltaColor,
              backgroundColor:
                result.delta > 0
                  ? 'var(--x-surface)'
                  : result.delta < 0
                    ? 'var(--danger-bg)'
                    : 'var(--bg-recessed)',
            }}
          >
            {result.delta > 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : result.delta < 0 ? (
              <TrendingDown className="w-3 h-3" />
            ) : null}
            {formatDelta(result.delta)}
          </motion.span>
        )}
      </span>
    </div>
  );
}

export function GameEndBanner({
  players,
  localSymbol,
  matchWinner,
  endReason,
  eloResult,
  isOnline,
  selfVotedRematch,
  opponentVotedRematch,
  onRematch,
  onLeave,
  skipRatingAnimation = false,
  hidden: controlledHidden,
  onHiddenChange,
  mode,
  seats,
  rematchVotes,
  isSpectator = false,
  onOpenSouvenirCard,
}: GameEndBannerProps) {
  const [internalHidden, setInternalHidden] = useState(false);
  const [shared, setShared] = useState(false);

  const isControlled = controlledHidden !== undefined;
  const hidden = isControlled ? controlledHidden : internalHidden;
  const setHidden = (next: boolean) => {
    if (!isControlled) {
      setInternalHidden(next);
    }
    onHiddenChange?.(next);
  };

  useEffect(() => {
    if (!shared) return;
    const timer = window.setTimeout(() => setShared(false), 2200);
    return () => window.clearTimeout(timer);
  }, [shared]);

  const is2v2 = mode === '2v2' && Boolean(seats);
  const spectator = Boolean(isSpectator);
  const aborted = endReason === 'aborted';
  const isWin = !aborted && !spectator && localSymbol !== null && matchWinner === localSymbol;
  const isLoss =
    !aborted &&
    !spectator &&
    localSymbol !== null &&
    matchWinner !== null &&
    matchWinner !== localSymbol;
  const winnerPlayer = matchWinner ? players[matchWinner] : null;
  const rematchCount = rematchVotes?.length ?? 0;

  let title = 'Match nul';
  let subtitle = 'Plus aucun coup possible sur le plateau.';

  if (aborted) {
    title = 'Partie annulée';
    subtitle = is2v2
      ? 'Moins de deux coups joués : la partie a été annulée.'
      : 'Moins de deux coups joués : elle ne compte pas au classement.';
  } else if (is2v2 && matchWinner) {
    title = isWin
      ? 'Victoire d’équipe !'
      : isLoss
        ? 'Défaite d’équipe'
        : matchWinner === 'X'
          ? 'Équipe X gagne !'
          : 'Équipe O gagne !';
    const reasons: Partial<Record<EndReason, string>> = spectator
      ? {
          timeout: 'Fin au temps.',
          resign: 'Fin par abandon.',
          abandoned: 'Fin suite à un départ.',
          alignment: 'Trois zones alignées sur le grand plateau.',
        }
      : {
          timeout: isWin ? 'L’équipe adverse a dépassé son temps.' : 'Temps écoulé.',
          resign: isWin ? 'L’équipe adverse a abandonné.' : 'Partie abandonnée.',
          abandoned: isWin ? 'Un adversaire a quitté la partie.' : 'Partie quittée.',
          alignment: 'Trois zones alignées sur le grand plateau.',
        };
    subtitle = reasons[endReason ?? 'alignment'] ?? subtitle;
  } else if (winnerPlayer) {
    title = isWin ? 'Victoire !' : isLoss ? 'Défaite' : `${winnerPlayer.pseudo} gagne`;
    const reasons: Partial<Record<EndReason, string>> = spectator
      ? {
          timeout: 'Fin au temps.',
          resign: 'Fin par abandon.',
          abandoned: 'Fin suite à un départ.',
          alignment: 'Trois zones alignées sur le grand plateau.',
        }
      : {
          timeout: isWin ? 'Ton adversaire a dépassé son temps.' : 'Temps écoulé.',
          resign: isWin ? 'Ton adversaire a abandonné.' : 'Partie abandonnée.',
          abandoned: isWin ? 'Ton adversaire a quitté la partie.' : 'Partie quittée.',
          alignment: 'Trois zones alignées sur le grand plateau.',
        };
    subtitle = reasons[endReason ?? 'alignment'] ?? subtitle;
  }

  const displaySubtitle = spectator
    ? subtitle
    : is2v2
      ? isOnline && selfVotedRematch && rematchCount < 4
        ? `En attente des autres joueurs (${rematchCount}/4 prêts)…`
        : isOnline && !selfVotedRematch && (opponentVotedRematch || rematchCount > 0)
          ? `Revanche proposée (${rematchCount}/4 prêts).`
          : subtitle
      : isOnline && opponentVotedRematch && !selfVotedRematch
        ? 'Ton adversaire propose une revanche.'
        : isOnline && selfVotedRematch && !opponentVotedRematch
          ? 'En attente de la réponse de ton adversaire…'
          : subtitle;

  const myResult = !spectator && localSymbol && eloResult ? eloResult[localSymbol] : null;
  const oppSymbol: Player | null =
    !spectator && localSymbol ? (localSymbol === 'X' ? 'O' : 'X') : null;
  const oppResult = oppSymbol && eloResult ? eloResult[oppSymbol] : null;

  const tierBefore = myResult ? getEloTier(myResult.before) : null;
  const tierAfter = myResult ? getEloTier(myResult.after) : null;
  const tierChange =
    tierBefore && tierAfter && tierBefore.id !== tierAfter.id
      ? tierAfter.min > tierBefore.min
        ? 'up'
        : 'down'
      : null;

  const accent =
    matchWinner === 'X'
      ? 'var(--x-color)'
      : matchWinner === 'O'
        ? 'var(--o-color)'
        : 'var(--border-strong)';

  const teamXLabel = seats
    ? [seats.A?.pseudo, seats.B?.pseudo].filter(Boolean).join(' & ') || 'A & B'
    : 'A & B';
  const teamOLabel = seats
    ? [seats.C?.pseudo, seats.D?.pseudo].filter(Boolean).join(' & ') || 'C & D'
    : 'C & D';

  const rematchLabel = is2v2
    ? isOnline && selfVotedRematch
      ? rematchCount > 0
        ? `En attente (${rematchCount}/4)…`
        : 'En attente…'
      : isOnline && rematchCount > 0
        ? `Revanche (${rematchCount}/4)`
        : 'Revanche'
    : isOnline && selfVotedRematch
      ? 'En attente…'
      : isOnline && opponentVotedRematch
        ? 'Accepter la revanche'
        : 'Revanche';

  const shouldPulseRematch =
    !selfVotedRematch && (opponentVotedRematch || (is2v2 && rematchCount > 0) || isLoss);

  const showSouvenirBtn = Boolean(onOpenSouvenirCard) && !aborted;

  const handleShare = async () => {
    const url = window.location.origin;
    const delta = myResult && myResult.rated !== false ? ` (${formatDelta(myResult.delta)} Elo)` : '';
    const text = spectator
      ? 'Je viens de suivre une belle partie au Super Morpion, viens jouer :'
      : is2v2
        ? isWin
          ? 'Victoire en 2v2 au Super Morpion ! Viens nous défier :'
          : 'Partie en 2v2 au Super Morpion, viens jouer :'
        : isWin
          ? `Je viens de gagner au Super Morpion${delta}. Viens me défier :`
          : 'Je joue au Super Morpion, viens me défier :';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Super Morpion', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShared(true);
    } catch {
      // Partage annulé
    }
  };

  if (hidden) {
    if (onHiddenChange) return null;
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        className="tactile-btn absolute bottom-2.5 right-2.5 z-50 rounded-full px-3 py-1.5 text-xs font-semibold shadow-md"
        style={{
          backgroundColor: 'var(--bg-board)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-strong)',
        }}
      >
        Résultat
      </button>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.25 }}
        className="absolute bottom-2.5 left-2.5 right-2.5 z-50 rounded-[14px] p-3 sm:p-3.5 flex flex-col gap-2.5"
        style={{
          backgroundColor: 'var(--bg-board)',
          border: `1.5px solid ${accent}`,
          boxShadow: 'var(--shadow-board)',
        }}
      >
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.25 }}
              className="text-lg sm:text-xl font-extrabold leading-tight tracking-tight"
              style={{
                color:
                  isWin || (spectator && !aborted && matchWinner !== null)
                    ? accent
                    : 'var(--text-primary)',
              }}
            >
              {title}
            </motion.p>
            <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>
              {displaySubtitle}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void handleShare()}
              title="Partager"
              aria-label="Partager le résultat"
              className="tactile-btn inline-flex items-center justify-center rounded-[9px] w-8 h-8"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: shared ? 'var(--x-color)' : 'var(--text-secondary)',
                border: '1px solid var(--border-main)',
              }}
            >
              {shared ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setHidden(true)}
              title="Voir le plateau final"
              aria-label="Voir le plateau final"
              className="tactile-btn inline-flex items-center justify-center rounded-[9px] w-8 h-8"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-main)',
              }}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Résumé compact des équipes en mode 2v2 */}
        {is2v2 && !aborted && (
          <div
            className="rounded-[10px] px-2.5 py-2 flex flex-col gap-1"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-cell)',
            }}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-snug">
              <span className="inline-flex items-center gap-1 min-w-0">
                <span className="font-bold shrink-0" style={{ color: 'var(--x-color)' }}>
                  Équipe X :
                </span>
                <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {teamXLabel}
                </span>
              </span>
              <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>
                ·
              </span>
              <span className="inline-flex items-center gap-1 min-w-0">
                <span className="font-bold shrink-0" style={{ color: 'var(--o-color)' }}>
                  Équipe O :
                </span>
                <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {teamOLabel}
                </span>
              </span>
            </div>
            <span className="text-[10.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
              Match amical 2v2 · non classé
            </span>
          </div>
        )}

        <AnimatePresence>
          {tierChange && tierAfter && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                type: 'spring',
                stiffness: 380,
                damping: 16,
                delay: skipRatingAnimation ? 0.15 : 1.2,
              }}
              className="self-start rounded-full px-3 py-1 text-xs font-bold"
              style={{
                backgroundColor: tierChange === 'up' ? 'var(--accent-active-bg)' : 'var(--bg-recessed)',
                color: tierChange === 'up' ? 'var(--accent-active-text)' : 'var(--text-secondary)',
                border: `1px solid ${tierChange === 'up' ? 'var(--accent-active)' : 'var(--border-main)'}`,
              }}
            >
              {tierChange === 'up' ? `Promotion : ${tierAfter.label}` : `Nouveau rang : ${tierAfter.label}`}
            </motion.div>
          )}
        </AnimatePresence>

        {eloResult && (
          <div className="flex flex-col gap-1.5">
            {myResult && localSymbol ? (
              <>
                <RatingLine
                  label="Ton classement"
                  result={myResult}
                  emphasize
                  skipAnimation={skipRatingAnimation}
                />
                {oppResult && oppSymbol && (
                  <RatingLine
                    label={players[oppSymbol]?.pseudo ?? 'Adversaire'}
                    result={oppResult}
                    emphasize={false}
                    skipAnimation={skipRatingAnimation}
                  />
                )}
              </>
            ) : (
              (['X', 'O'] as const).map((sym) => (
                <RatingLine
                  key={sym}
                  label={players[sym]?.pseudo ?? sym}
                  result={eloResult[sym]}
                  emphasize={false}
                  skipAnimation={skipRatingAnimation}
                />
              ))
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onLeave}
            className={`tactile-btn ${spectator && !showSouvenirBtn ? 'flex-1' : 'flex-1 sm:flex-initial'} inline-flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-semibold`}
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-main)',
            }}
          >
            <Home className="w-3.5 h-3.5 shrink-0" />
            <span>Accueil</span>
          </button>

          {showSouvenirBtn && (
            <button
              type="button"
              onClick={onOpenSouvenirCard}
              className={`tactile-btn ${spectator ? 'flex-1' : 'flex-1 sm:flex-initial'} inline-flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-semibold`}
              style={{
                backgroundColor: 'var(--accent-active-bg)',
                color: 'var(--accent-active-text)',
                border: '1px solid var(--accent-active)',
              }}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Carte souvenir</span>
            </button>
          )}

          {!spectator && (
            <motion.button
              type="button"
              onClick={onRematch}
              disabled={isOnline && selfVotedRematch}
              // La revanche bat doucement quand elle est proposée, ou après une défaite
              animate={shouldPulseRematch ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={
                shouldPulseRematch
                  ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: 0.2 }
              }
              className="tactile-btn flex-1 min-w-[132px] inline-flex items-center justify-center gap-1.5 rounded-[10px] px-3.5 py-2 text-sm font-semibold disabled:opacity-60"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
              }}
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>{rematchLabel}</span>
            </motion.button>
          )}
        </div>
      </motion.div>
    </>
  );
}
