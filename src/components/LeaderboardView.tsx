import { motion } from 'framer-motion';
import type { AuthUser, LeaderboardPayload } from '@shared/protocol';
import { Crown, Flame, LogIn, Medal, RefreshCw, Swords, Trophy } from 'lucide-react';
import { useI18n } from '../i18n';
import { AnimatedNumber } from './AnimatedNumber';

interface LeaderboardViewProps {
  user: AuthUser | null;
  data: LeaderboardPayload | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenAuth: () => void;
  onPlay: () => void;
}

const PODIUM_COLORS = ['#C9A227', '#9AA3AD', '#B0703C'];

export function LeaderboardView({
  user,
  data,
  loading,
  onRefresh,
  onOpenAuth,
  onPlay,
}: LeaderboardViewProps) {
  const { t } = useI18n();
  const entries = data?.entries ?? [];
  const minGames = data?.minGames ?? 3;

  return (
    <main className="w-full max-w-[760px] mx-auto px-3 sm:px-6 py-4 sm:py-6 flex-1 flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <Trophy className="w-6 h-6" style={{ color: 'var(--accent-active)' }} />
            {t('lb.title')}
          </h1>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {t('lb.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="tactile-btn inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-semibold disabled:opacity-50"
          style={{
            backgroundColor: 'var(--bg-board)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-main)',
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{t('common.refresh')}</span>
        </button>
      </div>

      {!user && (
        <div
          className="rounded-[12px] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--accent-active-bg)',
            border: '1px solid var(--accent-active)',
          }}
        >
          <p className="text-xs sm:text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Seuls les comptes apparaissent au classement. Connecte-toi pour y entrer : ta
            progression invité est conservée.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="tactile-btn shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5"
            style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Se connecter</span>
          </button>
        </div>
      )}

      <section
        className="rounded-[16px] overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-board)',
          border: '1px solid var(--border-main)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {loading && entries.length === 0 ? (
          <div className="flex flex-col">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-12 border-b animate-pulse"
                style={{ borderColor: 'var(--border-cell)', backgroundColor: i % 2 ? 'var(--bg-surface)' : 'transparent' }}
              />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 flex flex-col items-center text-center gap-3">
            <Crown className="w-10 h-10" style={{ color: 'var(--accent-active)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Le trône est libre.
            </p>
            <p className="text-xs max-w-[340px]" style={{ color: 'var(--text-secondary)' }}>
              Joue {minGames} parties classées avec un compte pour devenir le premier nom
              du classement.
            </p>
            <button
              type="button"
              onClick={onPlay}
              className="tactile-btn mt-1 rounded-[10px] px-4 py-2 text-sm font-semibold inline-flex items-center gap-2"
              style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
            >
              <Swords className="w-4 h-4" />
              <span>Jouer une partie</span>
            </button>
          </div>
        ) : (
          <ol>
            {entries.map((entry, index) => {
              const podium = entry.rank <= 3;
              return (
                <motion.li
                  key={`${entry.rank}-${entry.pseudo}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index, 12) * 0.03, duration: 0.25 }}
                  className="flex items-center gap-3 px-3.5 sm:px-4 py-2.5 border-b last:border-b-0"
                  style={{
                    borderColor: 'var(--border-cell)',
                    backgroundColor: entry.isSelf ? 'var(--accent-active-bg)' : 'transparent',
                  }}
                >
                  <span
                    className="w-7 shrink-0 text-center font-mono text-sm font-bold tabular-nums"
                    style={{ color: podium ? PODIUM_COLORS[entry.rank - 1] : 'var(--text-muted)' }}
                  >
                    {podium ? <Medal className="w-5 h-5 mx-auto" /> : entry.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="truncate text-sm font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {entry.pseudo}
                      </span>
                      {entry.isSelf && (
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: 'var(--bg-board)', color: 'var(--accent-active-text)' }}
                        >
                          Toi
                        </span>
                      )}
                      {typeof entry.dailyStreak === 'number' && entry.dailyStreak >= 2 && (
                        <span
                          className="shrink-0 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums"
                          style={{
                            backgroundColor: 'var(--accent-active-bg)',
                            color: 'var(--accent-active-text)',
                          }}
                          title={`Série active : ${entry.dailyStreak} jours d’affilée`}
                        >
                          <Flame className="w-2.5 h-2.5" strokeWidth={2.2} />
                          <span>{entry.dailyStreak}</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {entry.tier} · {entry.gamesPlayed} parties · {entry.wins} victoires
                    </span>
                  </div>
                  <span
                    className="shrink-0 font-mono text-base font-bold tabular-nums"
                    style={{ color: 'var(--text-primary)' }}
                    title={`Déviation ±${entry.rd}`}
                  >
                    <AnimatedNumber
                      value={entry.rating}
                      from={Math.max(0, entry.rating - 70)}
                      durationMs={600}
                      delayMs={80 + Math.min(index, 12) * 30}
                    />
                  </span>
                </motion.li>
              );
            })}
          </ol>
        )}
      </section>

      {data?.selfRank && (
        <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
          Ta position actuelle : <strong>#{data.selfRank}</strong>
        </p>
      )}
    </main>
  );
}
