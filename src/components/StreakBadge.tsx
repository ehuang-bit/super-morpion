import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { AccountStreak } from '@shared/protocol';
import { STREAK_MILESTONES, getNextStreakMilestone } from '@shared/streak';
import {
  CalendarCheck2,
  Flame,
  Lock,
  LogIn,
  Sparkles,
  X,
} from 'lucide-react';
import { CHIP_SPRING, PLACE_SPRING, SMOOTH_EASE } from '../utils/motion';

const WEEKDAY_INITIALS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'] as const;
const WEEKDAY_NAMES = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
] as const;
const MONTH_SHORT_NAMES = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;

const TOAST_AUTO_DISMISS_MS = 5_500;

function formatDayWord(count: number): string {
  return count > 1 ? 'jours' : 'jour';
}

function parseUtcDayMeta(dateKey: string): {
  initial: string;
  fullLabel: string;
} {
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return { initial: '·', fullLabel: dateKey };
  }
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  const dow = date.getUTCDay();
  const initial = WEEKDAY_INITIALS[dow] ?? '·';
  const weekday = WEEKDAY_NAMES[dow] ?? '';
  const monthLabel = MONTH_SHORT_NAMES[month - 1] ?? '';
  return {
    initial,
    fullLabel: `${weekday} ${day} ${monthLabel}`.trim(),
  };
}

function isMilestoneCount(days: number): boolean {
  return (STREAK_MILESTONES as readonly number[]).includes(days);
}

export interface StreakPillProps {
  streak: AccountStreak;
  size?: 'xs' | 'sm' | 'md';
  showLabel?: boolean;
  onClick?: () => void;
}

const PILL_SIZE_CLASSES: Record<
  NonNullable<StreakPillProps['size']>,
  { container: string; icon: string }
> = {
  xs: {
    container: 'px-1.5 py-0.5 text-[11px] gap-1 rounded-md',
    icon: 'w-3 h-3',
  },
  sm: {
    container: 'px-2 py-1 text-xs gap-1.5 rounded-lg',
    icon: 'w-3.5 h-3.5',
  },
  md: {
    container: 'px-2.5 py-1.5 text-sm gap-1.5 rounded-[10px]',
    icon: 'w-4 h-4',
  },
};

/**
 * Pastille compacte de flamme quotidienne (en-tête, barre latérale, classement).
 * Trois états visuels : allumée aujourd'hui, à entretenir (en péril), ou vierge.
 */
export function StreakPill({
  streak,
  size = 'sm',
  showLabel = false,
  onClick,
}: StreakPillProps) {
  const prefersReducedMotion = useReducedMotion();
  const sizeSpec = PILL_SIZE_CLASSES[size];

  const isLit = streak.activeToday && streak.current > 0;
  const isAtRisk = !isLit && streak.atRisk && streak.current > 0;

  const tooltip = isLit
    ? `Flamme validée aujourd’hui : ${streak.current} ${formatDayWord(streak.current)} d’affilée`
    : isAtRisk
      ? `Joue une partie ou le défi du jour pour conserver ta série de ${streak.current} ${formatDayWord(streak.current)} !`
      : 'Joue une partie ou le défi du jour pour allumer ta flamme quotidienne.';

  const valueText =
    streak.current === 0
      ? showLabel
        ? '0 jour'
        : '0 j'
      : showLabel
        ? `${streak.current} ${formatDayWord(streak.current)}`
        : String(streak.current);

  const pillStyle = isLit
    ? {
        backgroundColor: 'var(--accent-active-bg)',
        border: '1px solid var(--accent-active)',
        color: 'var(--accent-active-text)',
      }
    : isAtRisk
      ? {
          backgroundColor: 'var(--bg-surface)',
          border: '1px dashed var(--accent-active)',
          color: 'var(--accent-active-text)',
        }
      : {
          backgroundColor: 'var(--bg-recessed)',
          border: '1px solid var(--border-main)',
          color: 'var(--text-muted)',
        };

  const flameNode = (
    <motion.span
      className="inline-flex items-center justify-center shrink-0"
      aria-hidden="true"
      animate={
        isLit && !prefersReducedMotion
          ? {
              scale: [1, 1.12, 0.98, 1.07, 1],
              rotate: [0, -4, 3, -2, 0],
            }
          : { scale: 1, rotate: 0 }
      }
      transition={
        isLit && !prefersReducedMotion
          ? {
              duration: 3.2,
              repeat: Infinity,
              repeatDelay: 1.6,
              ease: 'easeInOut',
            }
          : { duration: 0.2 }
      }
    >
      <Flame
        className={sizeSpec.icon}
        strokeWidth={isLit ? 2.1 : 1.9}
        fill={isLit ? 'currentColor' : 'none'}
        fillOpacity={isLit ? 0.24 : 0}
      />
    </motion.span>
  );

  const content = (
    <>
      {flameNode}
      <span className="font-mono font-bold tabular-nums leading-none">
        {valueText}
      </span>
    </>
  );

  const baseClassName = `inline-flex items-center justify-center font-semibold select-none shrink-0 ${sizeSpec.container}`;
  const motionProps = {
    initial: prefersReducedMotion ? { opacity: 0.95 } : { scale: 0.9, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    transition: prefersReducedMotion ? { duration: 0.12 } : CHIP_SPRING,
  };

  if (onClick) {
    return (
      <motion.button
        key={`${streak.current}-${isLit ? 'lit' : isAtRisk ? 'risk' : 'zero'}`}
        type="button"
        onClick={onClick}
        title={tooltip}
        aria-label={tooltip}
        whileHover={prefersReducedMotion ? undefined : { y: -1 }}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
        className={`${baseClassName} cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
        style={{
          ...pillStyle,
          outlineColor: 'var(--text-primary)',
        }}
        {...motionProps}
      >
        {content}
      </motion.button>
    );
  }

  return (
    <motion.span
      key={`${streak.current}-${isLit ? 'lit' : isAtRisk ? 'risk' : 'zero'}`}
      title={tooltip}
      aria-label={tooltip}
      className={baseClassName}
      style={pillStyle}
      {...motionProps}
    >
      {content}
    </motion.span>
  );
}

export interface AccountStreakCardProps {
  streak: AccountStreak | null;
  isAccount: boolean;
  onOpenAuth?: () => void;
  onOpenDaily?: () => void;
}

/**
 * Carte complète de flamme quotidienne (vue Statistiques ou affichage autonome).
 * Affiche la série, les paliers et la frise 7 jours pour les comptes inscrits,
 * ou une invitation sobre et verrouillée pour les invités.
 */
export function AccountStreakCard({
  streak,
  isAccount,
  onOpenAuth,
  onOpenDaily,
}: AccountStreakCardProps) {
  const prefersReducedMotion = useReducedMotion();

  // Invité : carte verrouillée sobre fidèle à l'Atelier vivant
  if (!isAccount) {
    return (
      <section
        className="rounded-[16px] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        style={{
          backgroundColor: 'var(--bg-board)',
          border: '1px dashed var(--border-strong)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div className="flex items-start gap-3.5 min-w-0">
          <div
            className="relative w-11 h-11 rounded-[12px] flex items-center justify-center shrink-0"
            style={{
              backgroundColor: 'var(--bg-recessed)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-main)',
            }}
          >
            <Flame className="w-5 h-5" strokeWidth={1.8} />
            <span
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: 'var(--bg-board)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-strong)',
              }}
              aria-hidden="true"
            >
              <Lock className="w-2.5 h-2.5" strokeWidth={2.2} />
            </span>
          </div>

          <div className="min-w-0">
            <h2
              className="text-sm sm:text-base font-bold tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              Flamme quotidienne réservée aux comptes
            </h2>
            <p
              className="text-xs sm:text-[13px] mt-1 leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              Crée un compte gratuit pour suivre ta série de jours consécutifs,
              débloquer les paliers et la synchroniser sur tous tes appareils.
            </p>
          </div>
        </div>

        {onOpenAuth && (
          <button
            type="button"
            onClick={onOpenAuth}
            className="tactile-btn shrink-0 self-start sm:self-center rounded-[10px] px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1.5"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
            }}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Créer un compte / Connexion</span>
          </button>
        )}
      </section>
    );
  }

  // Compte connecté en attente de chargement de la donnée
  if (!streak) {
    return (
      <section
        className="rounded-[16px] p-4 sm:p-5 flex items-center gap-3.5"
        style={{
          backgroundColor: 'var(--bg-board)',
          border: '1px solid var(--border-main)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div
          className="w-11 h-11 rounded-[12px] flex items-center justify-center shrink-0"
          style={{
            backgroundColor: 'var(--bg-recessed)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-cell)',
          }}
        >
          <Flame className="w-5 h-5" strokeWidth={1.8} />
        </div>
        <div>
          <h2
            className="text-sm sm:text-base font-bold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Flamme quotidienne
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Synchronisation de ta série en cours…
          </p>
        </div>
      </section>
    );
  }

  const isLit = streak.activeToday && streak.current > 0;
  const isAtRisk = !isLit && streak.atRisk && streak.current > 0;
  const nextMilestone = getNextStreakMilestone(streak.current);
  const hitMilestone = isLit && isMilestoneCount(streak.current);

  const milestoneProgressPct = nextMilestone
    ? Math.max(
        streak.current > 0 ? 6 : 0,
        Math.min(100, Math.round((streak.current / nextMilestone) * 100)),
      )
    : 100;

  const statusBadge = isLit
    ? {
        label: 'Validée aujourd’hui ✓',
        style: {
          backgroundColor: 'var(--x-surface)',
          color: 'var(--x-color)',
          border: '1px solid var(--x-color)',
        },
      }
    : isAtRisk
      ? {
          label: 'À entretenir aujourd’hui',
          style: {
            backgroundColor: 'var(--accent-active-bg)',
            color: 'var(--accent-active-text)',
            border: '1px solid var(--accent-active)',
          },
        }
      : {
          label: 'Prête à s’allumer',
          style: {
            backgroundColor: 'var(--bg-recessed)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-main)',
          },
        };

  return (
    <section
      className="rounded-[16px] p-4 sm:p-5 flex flex-col gap-4"
      style={{
        backgroundColor: 'var(--bg-board)',
        border: '1px solid var(--border-main)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* En-tête : médaillon flamme + titre + badge d'état */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <motion.div
            className="relative w-11 h-11 rounded-[12px] flex items-center justify-center shrink-0"
            style={
              isLit
                ? {
                    backgroundColor: 'var(--accent-active-bg)',
                    color: 'var(--accent-active-text)',
                    border: '1px solid var(--accent-active)',
                  }
                : isAtRisk
                  ? {
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--accent-active-text)',
                      border: '1px dashed var(--accent-active)',
                    }
                  : {
                      backgroundColor: 'var(--bg-recessed)',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border-main)',
                    }
            }
            initial={prefersReducedMotion ? false : { scale: 0.92 }}
            animate={{ scale: 1 }}
            transition={PLACE_SPRING}
          >
            <motion.span
              className="inline-flex items-center justify-center"
              animate={
                isLit && !prefersReducedMotion
                  ? {
                      scale: [1, 1.1, 0.97, 1.06, 1],
                      rotate: [0, -4, 3, -2, 0],
                    }
                  : { scale: 1, rotate: 0 }
              }
              transition={
                isLit && !prefersReducedMotion
                  ? {
                      duration: 3.4,
                      repeat: Infinity,
                      repeatDelay: 1.8,
                      ease: 'easeInOut',
                    }
                  : { duration: 0.2 }
              }
            >
              <Flame
                className="w-5 h-5"
                strokeWidth={2}
                fill={isLit ? 'currentColor' : 'none'}
                fillOpacity={isLit ? 0.25 : 0}
              />
            </motion.span>
            {hitMilestone && (
              <span
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--accent-active)',
                  color: 'var(--bg-board)',
                }}
                aria-hidden="true"
              >
                <Sparkles className="w-2.5 h-2.5" strokeWidth={2.4} />
              </span>
            )}
          </motion.div>

          <div>
            <h2
              className="text-sm sm:text-base font-bold tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              Flamme quotidienne
            </h2>
            <p className="text-[11px] sm:text-xs" style={{ color: 'var(--text-muted)' }}>
              {isLit
                ? 'Ta journée est validée. Reviens demain pour poursuivre la série.'
                : isAtRisk
                  ? 'Joue une partie ou le défi du jour avant minuit UTC pour la conserver.'
                  : 'Joue une partie ou le défi du jour pour lancer une nouvelle série.'}
            </p>
          </div>
        </div>

        <span
          className="rounded-lg px-2.5 py-1 text-xs font-semibold shrink-0"
          style={statusBadge.style}
        >
          {statusBadge.label}
        </span>
      </div>

      {/* Compteur principal + statistiques compactes + barre de palier */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span
              className="font-mono text-3xl sm:text-4xl font-bold tabular-nums leading-none"
              style={{
                color: isLit
                  ? 'var(--accent-active-text)'
                  : 'var(--text-primary)',
              }}
            >
              {streak.current}
            </span>
            <span
              className="text-sm font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              {formatDayWord(streak.current)} d’affilée
            </span>
          </div>

          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs font-mono tabular-nums"
            style={{ color: 'var(--text-muted)' }}
          >
            <span>
              Record :{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {streak.best} j
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Jours actifs :{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {streak.totalActiveDays}
              </strong>
            </span>
          </div>
        </div>

        {/* Barre de progression vers le prochain palier */}
        <div className="sm:w-[270px] flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span
              className="font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              {nextMilestone
                ? `Prochain palier : ${nextMilestone} j`
                : 'Palier maximal atteint'}
            </span>
            <span
              className="font-mono tabular-nums font-semibold"
              style={{ color: 'var(--text-muted)' }}
            >
              {nextMilestone
                ? `${streak.current} / ${nextMilestone} j`
                : `${streak.current} j`}
            </span>
          </div>

          <div
            className="w-full h-2 rounded-full overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-recessed)',
              border: '1px solid var(--border-cell)',
            }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: 'var(--accent-active)' }}
              initial={prefersReducedMotion ? false : { width: '0%' }}
              animate={{ width: `${milestoneProgressPct}%` }}
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : { duration: 0.7, ease: SMOOTH_EASE }
              }
            />
          </div>

          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {nextMilestone
              ? `Encore ${Math.max(1, nextMilestone - streak.current)} ${formatDayWord(Math.max(1, nextMilestone - streak.current))} pour atteindre ${nextMilestone} j`
              : 'Flamme centenaire débloquée (100+ j)'}
          </span>
        </div>
      </div>

      {/* Frise visuelle des 7 derniers jours (UTC) */}
      <div
        className="rounded-[12px] p-3 flex flex-col gap-2.5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-cell)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className="text-xs font-semibold inline-flex items-center gap-1.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            <CalendarCheck2 className="w-3.5 h-3.5" />
            <span>7 derniers jours</span>
          </span>

          {!streak.activeToday && onOpenDaily && (
            <button
              type="button"
              onClick={onOpenDaily}
              className="tactile-btn rounded-lg px-2.5 py-1 text-xs font-semibold inline-flex items-center gap-1.5"
              style={{
                backgroundColor: 'var(--accent-active-bg)',
                color: 'var(--accent-active-text)',
                border: '1px solid var(--accent-active)',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Valider via le Défi du jour</span>
            </button>
          )}
        </div>

        <div
          className="grid grid-cols-7 gap-1.5 sm:gap-2"
          role="list"
          aria-label="Activité des 7 derniers jours"
        >
          {streak.recentDays.map((day, idx) => {
            const isToday = idx === streak.recentDays.length - 1;
            const meta = parseUtcDayMeta(day.date);
            const tileLabel = isToday
              ? day.active
                ? `Aujourd’hui (${meta.fullLabel}) : validé`
                : `Aujourd’hui (${meta.fullLabel}) : à valider`
              : day.active
                ? `${meta.fullLabel} : validé`
                : `${meta.fullLabel} : inactif`;

            const tileStyle = day.active
              ? {
                  backgroundColor: 'var(--accent-active-bg)',
                  border: '1px solid var(--accent-active)',
                  color: 'var(--accent-active-text)',
                }
              : isToday
                ? {
                    backgroundColor: 'var(--bg-board)',
                    border: '1px dashed var(--accent-active)',
                    color: 'var(--text-primary)',
                  }
                : {
                    backgroundColor: 'var(--bg-recessed)',
                    border: '1px solid var(--border-cell)',
                    color: 'var(--text-muted)',
                  };

            return (
              <div
                key={day.date}
                role="listitem"
                title={tileLabel}
                aria-label={tileLabel}
                className="relative rounded-[10px] py-2 px-1 flex flex-col items-center justify-center gap-1.5"
                style={tileStyle}
              >
                {/* Anneau pulsant discret sur aujourd'hui si pas encore validé */}
                {isToday && !day.active && !prefersReducedMotion && (
                  <motion.span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-[10px]"
                    style={{
                      border: '1.5px solid var(--accent-active)',
                    }}
                    animate={{ opacity: [0.2, 0.85, 0.2], scale: [1, 1.03, 1] }}
                    transition={{
                      duration: 2.2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />
                )}

                <span className="text-[11px] font-bold leading-none">
                  {meta.initial}
                </span>

                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center"
                  style={
                    day.active
                      ? {
                          backgroundColor: 'var(--accent-active)',
                          color: 'var(--bg-board)',
                        }
                      : isToday
                        ? {
                            backgroundColor: 'var(--accent-active-bg)',
                            color: 'var(--accent-active-text)',
                          }
                        : {
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--border-strong)',
                          }
                  }
                  aria-hidden="true"
                >
                  {day.active ? (
                    <Flame
                      className="w-3 h-3"
                      strokeWidth={2.2}
                      fill="currentColor"
                      fillOpacity={0.3}
                    />
                  ) : (
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: isToday
                          ? 'var(--accent-active)'
                          : 'var(--border-strong)',
                      }}
                    />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export interface StreakCelebrationToastProps {
  notice: { days: number; milestone: number | null } | null;
  onDismiss: () => void;
}

/**
 * Pastille flottante célébrant l'allumage, l'incrément ou un palier de flamme quotidienne.
 */
export function StreakCelebrationToast({
  notice,
  onDismiss,
}: StreakCelebrationToastProps) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(onDismiss, TOAST_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [notice, onDismiss]);

  const isMilestone = notice !== null && notice.milestone !== null;

  return (
    <div className="fixed bottom-[4.75rem] lg:bottom-5 inset-x-0 z-[75] flex justify-center px-3 pointer-events-none">
      <AnimatePresence>
        {notice && (
          <motion.div
            key={`${notice.days}-${notice.milestone ?? 'step'}`}
            role="status"
            aria-live="polite"
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 20, scale: 0.94 }
            }
            animate={
              prefersReducedMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0, scale: 1 }
            }
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 12, scale: 0.96 }
            }
            transition={
              prefersReducedMotion
                ? { duration: 0.16 }
                : { type: 'spring', stiffness: 380, damping: 28 }
            }
            className="pointer-events-auto max-w-[92vw] rounded-full pl-2 pr-2.5 py-1.5 flex items-center gap-2.5"
            style={{
              backgroundColor: 'var(--bg-board)',
              color: 'var(--text-primary)',
              border: '1.5px solid var(--accent-active)',
              boxShadow: 'var(--shadow-board)',
            }}
          >
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--accent-active-bg)',
                color: 'var(--accent-active-text)',
                border: '1px solid var(--accent-active)',
              }}
              aria-hidden="true"
            >
              {isMilestone ? (
                <Sparkles className="w-4 h-4" strokeWidth={2.2} />
              ) : (
                <Flame
                  className="w-4 h-4"
                  strokeWidth={2.2}
                  fill="currentColor"
                  fillOpacity={0.28}
                />
              )}
            </span>

            <div className="flex flex-col pr-1 min-w-0">
              <span className="text-xs sm:text-sm font-bold leading-tight truncate">
                {isMilestone
                  ? `Palier ${notice.milestone} jours atteint !`
                  : `Flamme allumée · ${notice.days} ${formatDayWord(notice.days)} d’affilée !`}
              </span>
              {isMilestone && (
                <span
                  className="text-[11px] font-medium leading-tight truncate"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Flamme quotidienne · {notice.days} {formatDayWord(notice.days)} d’affilée
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onDismiss}
              aria-label="Fermer la notification de flamme"
              className="w-6 h-6 rounded-full inline-flex items-center justify-center shrink-0 transition-opacity hover:opacity-80"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
              }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
