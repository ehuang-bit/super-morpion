import { motion } from 'framer-motion';
import {
  getEloTier,
  getNextEloTier,
  isProvisional,
  type EloProfile,
} from '@shared/elo';
import {
  TIME_CONTROL_LABELS,
  type AuthUser,
  type EndReason,
  type MatchHistoryItem,
  type PlayerStatsPayload,
  type TimeControl,
} from '@shared/protocol';
import {
  ArrowLeft,
  Award,
  Flame,
  LogIn,
  LogOut,
  RefreshCw,
  Swords,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import type { PieceStyle } from '../types/boardPrefs';
import { AnimatedNumber } from './AnimatedNumber';
import { AccountStreakCard } from './StreakBadge';
import { SymbolMark } from './Symbols';

interface StatsViewProps {
  user: AuthUser | null;
  pseudo: string;
  playerElo: {
    profile: EloProfile;
    tier: string;
  };
  stats: PlayerStatsPayload | null;
  loading: boolean;
  pieceStyle: PieceStyle;
  onRefresh: () => void;
  onBackToPlay: () => void;
  onOpenAuth: () => void;
  onOpenDaily?: () => void;
  onLogout?: () => void;
}

const TIME_CONTROL_ORDER: readonly TimeControl[] = [
  'unlimited',
  'rapid',
  'blitz',
];

const END_REASON_LABELS: Record<EndReason, string> = {
  alignment: 'Alignement',
  draw: 'Match nul',
  timeout: 'Temps écoulé',
  resign: 'Abandon',
  abandoned: 'Déconnexion',
  aborted: 'Annulée',
};

function formatMatchDate(ts: number): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatSignedDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

export function StatsView({
  user,
  pseudo,
  playerElo,
  stats,
  loading,
  pieceStyle,
  onRefresh,
  onBackToPlay,
  onOpenAuth,
  onOpenDaily,
  onLogout,
}: StatsViewProps) {
  const profile = stats?.profile ?? playerElo.profile;
  const tier = stats?.tier ?? playerElo.tier;
  const provisional = stats?.provisional ?? isProvisional(profile.rd);
  const percentile = stats?.percentile ?? null;
  const currentTierObj = getEloTier(profile.rating);
  const nextTier =
    stats?.nextTier ??
    (() => {
      const n = getNextEloTier(profile.rating);
      return n ? { label: n.label, min: n.min } : null;
    })();

  const winRate =
    stats?.winRate ??
    (profile.gamesPlayed > 0
      ? Math.round((profile.wins / profile.gamesPlayed) * 100)
      : 0);

  const matches: MatchHistoryItem[] = stats?.matches ?? [];
  const eloHistory =
    stats?.eloHistory && stats.eloHistory.length > 0
      ? stats.eloHistory
      : [{ rating: profile.rating, playedAt: Date.now() }];

  // Tier progress calculation
  const tierFloor = currentTierObj.min;
  const tierCeiling = nextTier ? nextTier.min : 2200;
  const tierProgressPct = nextTier
    ? Math.max(
        4,
        Math.min(
          100,
          Math.round(
            ((profile.rating - tierFloor) /
              Math.max(1, tierCeiling - tierFloor)) *
              100,
          ),
        ),
      )
    : 100;

  // Coordonnées du graphique SVG d'évolution Elo
  const ratings = eloHistory.map((p) => p.rating);
  const observedMin = Math.min(...ratings);
  const observedMax = Math.max(...ratings);
  const minRating = Math.min(observedMin, 1150) - 20;
  const maxRating = Math.max(observedMax, 1250) + 20;
  const midRating = Math.round((minRating + maxRating) / 2);
  const ratingSpan = Math.max(40, maxRating - minRating);
  const chartW = 440;
  const chartH = 200;
  const padLeft = 42;
  const padRight = 14;
  const padY = 18;
  const plotW = chartW - padLeft - padRight;

  const points = eloHistory.map((pt, idx) => {
    const x =
      eloHistory.length === 1
        ? padLeft + plotW / 2
        : padLeft + (idx / (eloHistory.length - 1)) * plotW;
    const y =
      chartH -
      padY -
      ((pt.rating - minRating) / ratingSpan) * (chartH - padY * 2);
    return { x, y, rating: pt.rating };
  });

  const polylinePoints = points
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath =
    points.length > 1
      ? `M ${points[0].x.toFixed(1)} ${(chartH - padY).toFixed(1)} L ` +
        points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ') +
        ` L ${points[points.length - 1].x.toFixed(1)} ${(chartH - padY).toFixed(1)} Z`
      : '';

  // Répartition par cadence calculée sur l'historique des duels
  const cadenceStats = TIME_CONTROL_ORDER.map((timeControl) => {
    let wins = 0;
    let draws = 0;
    let losses = 0;
    for (const match of matches) {
      if (match.timeControl !== timeControl) continue;
      if (match.result === 'win') wins++;
      else if (match.result === 'draw') draws++;
      else losses++;
    }
    const total = wins + draws + losses;
    const winPct = total > 0 ? Math.round((wins / total) * 100) : null;
    return {
      timeControl,
      label: TIME_CONTROL_LABELS[timeControl],
      total,
      wins,
      draws,
      losses,
      winPct,
    };
  });

  const displayName = user?.username || pseudo.trim() || 'Invité';

  return (
    <main className="w-full max-w-[940px] mx-auto px-3 sm:px-6 py-4 sm:py-6 flex-1 flex flex-col gap-4">
      {/* Top header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1
              className="text-xl sm:text-2xl font-bold tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              Statistiques · {displayName}
            </h1>
            <span
              className="rounded-md px-2 py-0.5 text-xs font-semibold"
              style={{
                backgroundColor: user
                  ? 'var(--x-surface)'
                  : 'var(--bg-recessed)',
                color: user ? 'var(--x-color)' : 'var(--text-secondary)',
                border: `1px solid ${
                  user ? 'var(--x-color)' : 'var(--border-main)'
                }`,
              }}
            >
              {user ? 'Compte synchronisé' : 'Profil invité'}
            </span>
          </div>
          <p
            className="text-xs sm:text-sm mt-0.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            Classement Glicko-2 (comme Lichess), progression de rang et historique des duels.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {user && onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="tactile-btn lg:hidden inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--bg-board)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-main)',
              }}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Déconnexion</span>
            </button>
          )}

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
            <span>Actualiser</span>
          </button>

          <button
            type="button"
            onClick={onBackToPlay}
            className="tactile-btn inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
            }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Retour au plateau</span>
          </button>
        </div>
      </div>

      {/* Guest sync banner */}
      {!user && (
        <div
          className="rounded-[12px] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--accent-active-bg)',
            border: '1px solid var(--accent-active)',
          }}
        >
          <p
            className="text-xs sm:text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            Vous jouez en tant qu’invité. Créez un compte pour sauvegarder votre Elo et votre historique sur tous vos appareils.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="tactile-btn shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
            }}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Créer un compte / Connexion</span>
          </button>
        </div>
      )}

      {/* Hero Elo & Tier Progression Card */}
      <section
        className="rounded-[16px] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        style={{
          backgroundColor: 'var(--bg-board)',
          border: '1px solid var(--border-main)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div className="flex items-center gap-3.5">
          <div
            className="w-12 h-12 rounded-[12px] flex items-center justify-center shrink-0"
            style={{
              backgroundColor: 'var(--accent-active-bg)',
              color: 'var(--accent-active-text)',
              border: '1px solid var(--accent-active)',
            }}
          >
            <Award className="w-6 h-6" strokeWidth={1.9} />
          </div>
          <div>
            <span
              className="text-xs font-semibold"
              style={{ color: 'var(--text-muted)' }}
            >
              Classement actuel
            </span>
            <div className="flex items-baseline gap-2.5 mt-0.5">
              <span
                className="font-mono text-3xl sm:text-4xl font-bold tabular-nums leading-none"
                style={{ color: 'var(--text-primary)' }}
              >
                <AnimatedNumber
                  value={profile.rating}
                  from={Math.max(0, profile.rating - 90)}
                  durationMs={900}
                />
                {provisional && (
                  <span style={{ color: 'var(--text-muted)' }}>?</span>
                )}
              </span>
              <span
                className="font-mono text-xs font-semibold tabular-nums"
                style={{ color: 'var(--text-muted)' }}
                title="Déviation : l’incertitude sur ton niveau. Elle diminue à chaque partie et remonte doucement si tu ne joues pas."
              >
                ±{Math.round(profile.rd)}
              </span>
              <span
                className="rounded-lg px-2.5 py-1 text-xs font-bold"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-strong)',
                }}
              >
                {tier}
              </span>
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-secondary)' }}>
              {provisional
                ? 'Classement provisoire : tes premières parties le font beaucoup bouger.'
                : percentile !== null
                  ? `Meilleur que ${percentile} % des joueurs classés.`
                  : 'Classement établi.'}
            </p>
          </div>
        </div>

        {/* Progress to next tier */}
        <div className="sm:w-[300px] flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
              {nextTier
                ? `Prochain rang : ${nextTier.label}`
                : 'Rang suprême atteint'}
            </span>
            <span
              className="font-mono tabular-nums font-semibold"
              style={{ color: 'var(--text-muted)' }}
            >
              {nextTier ? `${profile.rating} / ${nextTier.min}` : `${profile.rating} Elo`}
            </span>
          </div>
          <div
            className="w-full h-2.5 rounded-full overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-recessed)',
              border: '1px solid var(--border-cell)',
            }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: 'var(--accent-active)' }}
              initial={{ width: '0%' }}
              animate={{ width: `${tierProgressPct}%` }}
              transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {nextTier
              ? `Encore ${Math.max(0, nextTier.min - profile.rating)} pts Elo pour atteindre ${nextTier.label}`
              : 'Palier Souverain (2000+ Elo)'}
          </span>
        </div>
      </section>

      {/* Flamme quotidienne : active pour les comptes inscrits, verrouillée pour les invités */}
      <AccountStreakCard
        streak={stats?.accountStreak ?? user?.streak ?? null}
        isAccount={Boolean(user)}
        onOpenAuth={onOpenAuth}
        onOpenDaily={onOpenDaily}
      />

      {/* 4 KPI Cards */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          className="rounded-[14px] p-3.5 flex flex-col justify-between gap-1"
          style={{
            backgroundColor: 'var(--bg-board)',
            border: '1px solid var(--border-main)',
          }}
        >
          <span
            className="text-xs font-semibold flex items-center justify-between"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>Parties jouées</span>
            <Swords className="w-3.5 h-3.5 opacity-70" />
          </span>
          <span
            className="font-mono text-2xl font-bold tabular-nums mt-1"
            style={{ color: 'var(--text-primary)' }}
          >
            <AnimatedNumber value={profile.gamesPlayed} />
          </span>
          <span
            className="font-mono text-[11px] tabular-nums"
            style={{ color: 'var(--text-muted)' }}
          >
            {profile.wins}V · {profile.draws}N · {profile.losses}D
          </span>
        </div>

        <div
          className="rounded-[14px] p-3.5 flex flex-col justify-between gap-1"
          style={{
            backgroundColor: 'var(--bg-board)',
            border: '1px solid var(--border-main)',
          }}
        >
          <span
            className="text-xs font-semibold flex items-center justify-between"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>Taux de victoire</span>
            <TrendingUp className="w-3.5 h-3.5 opacity-70" />
          </span>
          <span
            className="font-mono text-2xl font-bold tabular-nums mt-1"
            style={{ color: 'var(--x-color)' }}
          >
            <AnimatedNumber value={winRate} suffix="%" delayMs={180} />
          </span>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {profile.gamesPlayed === 0
              ? 'Aucun duel terminé'
              : `${profile.wins} victoire${profile.wins > 1 ? 's' : ''}`}
          </span>
        </div>

        <div
          className="rounded-[14px] p-3.5 flex flex-col justify-between gap-1"
          style={{
            backgroundColor: 'var(--bg-board)',
            border: '1px solid var(--border-main)',
          }}
        >
          <span
            className="text-xs font-semibold flex items-center justify-between"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>Meilleur Elo</span>
            <Trophy className="w-3.5 h-3.5 opacity-70" />
          </span>
          <span
            className="font-mono text-2xl font-bold tabular-nums mt-1"
            style={{ color: 'var(--text-primary)' }}
          >
            <AnimatedNumber
              value={profile.peakRating}
              from={Math.max(0, profile.peakRating - 90)}
              delayMs={240}
            />
          </span>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Rang {getEloTier(profile.peakRating).label}
          </span>
        </div>

        <div
          className="rounded-[14px] p-3.5 flex flex-col justify-between gap-1"
          style={{
            backgroundColor: 'var(--bg-board)',
            border: '1px solid var(--border-main)',
          }}
        >
          <span
            className="text-xs font-semibold flex items-center justify-between"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>Série actuelle</span>
            <Flame className="w-3.5 h-3.5 opacity-70" />
          </span>
          <span
            className="font-mono text-2xl font-bold tabular-nums mt-1"
            style={{
              color:
                profile.streak > 0
                  ? 'var(--x-color)'
                  : profile.streak < 0
                    ? 'var(--danger-color)'
                    : 'var(--text-primary)',
            }}
          >
            {profile.streak > 0 ? `+${profile.streak}` : profile.streak}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {profile.streak > 0
              ? 'Série de victoires'
              : profile.streak < 0
                ? 'Série de défaites'
                : 'Série neutre'}
          </span>
        </div>
      </section>

      {/* Elo Evolution Chart + Recent Match History */}
      <div className="grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-4">
        {/* SVG Elo Curve */}
        <section
          className="rounded-[16px] p-4 sm:p-5 flex flex-col gap-4"
          style={{
            backgroundColor: 'var(--bg-board)',
            border: '1px solid var(--border-main)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2
                className="text-sm font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                Courbe d’évolution Elo
              </h2>
              <p
                className="text-xs mt-0.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Progression sur vos {matches.length || 0} derniers duels classés
              </p>
            </div>
            <span
              className="font-mono text-xs font-semibold tabular-nums shrink-0"
              style={{ color: 'var(--text-muted)' }}
            >
              Min {Math.round(observedMin)} · Max {Math.round(observedMax)}
            </span>
          </div>

          <div
            className="rounded-[12px] p-3"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-cell)',
            }}
          >
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="w-full h-44 sm:h-48 overflow-visible"
              role="img"
              aria-label="Graphique de progression Elo"
            >
              {/* Repères de valeur discrets (max / milieu / min) */}
              <text
                x={padLeft - 8}
                y={padY + 3.5}
                textAnchor="end"
                fontSize="10.5"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fill="var(--text-muted)"
              >
                {Math.round(maxRating)}
              </text>
              <text
                x={padLeft - 8}
                y={chartH / 2 + 3.5}
                textAnchor="end"
                fontSize="10.5"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fill="var(--text-muted)"
              >
                {midRating}
              </text>
              <text
                x={padLeft - 8}
                y={chartH - padY + 3.5}
                textAnchor="end"
                fontSize="10.5"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fill="var(--text-muted)"
              >
                {Math.round(minRating)}
              </text>

              {/* Lignes de repère horizontales */}
              <line
                x1={padLeft}
                y1={padY}
                x2={chartW - padRight}
                y2={padY}
                stroke="var(--border-cell)"
                strokeDasharray="3 3"
              />
              <line
                x1={padLeft}
                y1={chartH / 2}
                x2={chartW - padRight}
                y2={chartH / 2}
                stroke="var(--border-cell)"
                strokeDasharray="3 3"
              />
              <line
                x1={padLeft}
                y1={chartH - padY}
                x2={chartW - padRight}
                y2={chartH - padY}
                stroke="var(--border-main)"
              />

              {areaPath && (
                <motion.path
                  key={`area-${polylinePoints}`}
                  d={areaPath}
                  fill="var(--x-surface)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.65 }}
                  transition={{ duration: 0.5, delay: 0.75 }}
                />
              )}

              {/* La courbe se trace de gauche à droite */}
              {points.length > 1 && (
                <motion.polyline
                  key={`line-${polylinePoints}`}
                  fill="none"
                  stroke="var(--x-color)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylinePoints}
                  pathLength={100}
                  strokeDasharray={100}
                  initial={{ strokeDashoffset: 100 }}
                  animate={{ strokeDashoffset: 0 }}
                  transition={{ duration: 1.15, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                />
              )}

              {points.map((pt, idx) => (
                <motion.circle
                  key={`${idx}-${polylinePoints.length}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={idx === points.length - 1 ? 4.5 : 3}
                  fill={
                    idx === points.length - 1
                      ? 'var(--accent-active)'
                      : 'var(--bg-board)'
                  }
                  stroke="var(--x-color)"
                  strokeWidth="2"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    duration: 0.25,
                    delay: 0.2 + (idx / Math.max(1, points.length - 1)) * 1,
                  }}
                />
              ))}
            </svg>
          </div>

          {/* Répartition par cadence */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3
                className="text-xs font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                Répartition par cadence
              </h3>
              <span
                className="text-[11px]"
                style={{ color: 'var(--text-muted)' }}
              >
                {matches.length === 0
                  ? 'Aucun duel enregistré'
                  : matches.length === 1
                    ? 'Sur le dernier duel'
                    : `Sur les ${matches.length} derniers duels`}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {cadenceStats.map((item) => {
                const winWidth =
                  item.total > 0 ? (item.wins / item.total) * 100 : 0;
                const drawWidth =
                  item.total > 0 ? (item.draws / item.total) * 100 : 0;
                const lossWidth =
                  item.total > 0 ? (item.losses / item.total) * 100 : 0;

                return (
                  <div
                    key={item.timeControl}
                    className="rounded-[11px] p-2 sm:p-2.5 flex flex-col gap-1.5 min-w-0"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-cell)',
                    }}
                  >
                    <span
                      className="text-[11px] font-bold truncate"
                      style={{ color: 'var(--text-primary)' }}
                      title={item.label}
                    >
                      {item.label}
                    </span>

                    <div className="flex flex-wrap items-baseline justify-between gap-x-1 gap-y-0.5">
                      <span
                        className="font-mono text-sm sm:text-base font-bold tabular-nums leading-none"
                        style={{
                          color:
                            item.winPct !== null
                              ? 'var(--x-color)'
                              : 'var(--text-muted)',
                        }}
                      >
                        {item.winPct !== null ? `${item.winPct}%` : '—'}
                      </span>
                      <span
                        className="font-mono text-[10px] tabular-nums shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {item.total} duel{item.total > 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Barre de proportion V / N / D */}
                    <div
                      className="h-1.5 w-full rounded-full overflow-hidden flex"
                      style={{
                        backgroundColor:
                          item.total > 0
                            ? 'var(--bg-board)'
                            : 'var(--border-cell)',
                        opacity: item.total > 0 ? 1 : 0.65,
                      }}
                      aria-hidden="true"
                    >
                      {item.wins > 0 && (
                        <span
                          className="h-full"
                          style={{
                            width: `${winWidth}%`,
                            backgroundColor: 'var(--x-color)',
                          }}
                        />
                      )}
                      {item.draws > 0 && (
                        <span
                          className="h-full"
                          style={{
                            width: `${drawWidth}%`,
                            backgroundColor: 'var(--accent-active)',
                          }}
                        />
                      )}
                      {item.losses > 0 && (
                        <span
                          className="h-full"
                          style={{
                            width: `${lossWidth}%`,
                            backgroundColor: 'var(--border-cell)',
                          }}
                        />
                      )}
                    </div>

                    <span
                      className="font-mono text-[10px] tabular-nums leading-tight"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {item.wins}V · {item.draws}N · {item.losses}D
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Recent Matches History */}
        <section
          className="rounded-[16px] p-4 sm:p-5 flex flex-col gap-3"
          style={{
            backgroundColor: 'var(--bg-board)',
            border: '1px solid var(--border-main)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2
                className="text-sm font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                Historique des duels récents
              </h2>
              <p
                className="text-xs mt-0.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Résultats certifiés par le serveur en ligne
              </p>
            </div>
            <span
              className="font-mono text-xs tabular-nums"
              style={{ color: 'var(--text-muted)' }}
            >
              {matches.length} duel{matches.length > 1 ? 's' : ''}
            </span>
          </div>

          {matches.length === 0 ? (
            <div
              className="rounded-[12px] p-6 flex flex-col items-center justify-center text-center gap-2.5 my-auto"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-cell)',
              }}
            >
              <p
                className="text-xs sm:text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Aucune partie terminée pour ce profil
              </p>
              <p
                className="text-xs max-w-[280px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                Lancez un duel privé ou un matchmaking rapide pour enregistrer vos premières statistiques.
              </p>
              <button
                type="button"
                onClick={onBackToPlay}
                className="tactile-btn mt-1 rounded-lg px-3.5 py-2 text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-text)',
                }}
              >
                Jouer une partie
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-0.5">
              {matches.map((m, index) => {
                const isWin = m.result === 'win';
                const isLoss = m.result === 'loss';
                const badgeBg = isWin
                  ? 'var(--x-surface)'
                  : isLoss
                    ? 'var(--danger-bg)'
                    : 'var(--draw-surface)';
                const badgeColor = isWin
                  ? 'var(--x-color)'
                  : isLoss
                    ? 'var(--danger-color)'
                    : 'var(--text-secondary)';
                const badgeLabel = isWin
                  ? 'Victoire'
                  : isLoss
                    ? 'Défaite'
                    : 'Nul';

                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + Math.min(index, 10) * 0.05, duration: 0.28 }}
                    className="rounded-[11px] px-3 py-2.5 flex items-center justify-between gap-2.5"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-cell)',
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-5 h-5 shrink-0">
                        <SymbolMark
                          player={m.playerSymbol}
                          size="badge"
                          pieceStyle={pieceStyle}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-bold leading-none"
                            style={{
                              backgroundColor: badgeBg,
                              color: badgeColor,
                            }}
                          >
                            {badgeLabel}
                          </span>
                          <span
                            className="text-xs font-semibold truncate"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            vs {m.opponentPseudo}
                          </span>
                          <span
                            className="font-mono text-[10px] tabular-nums"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            ({m.opponentElo})
                          </span>
                        </div>
                        <div
                          className="flex items-center gap-1.5 text-[11px] mt-0.5 flex-wrap"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <span>{TIME_CONTROL_LABELS[m.timeControl]}</span>
                          <span>·</span>
                          <span>{END_REASON_LABELS[m.endReason] ?? m.endReason}</span>
                          <span>·</span>
                          <span>{m.movesCount} coups</span>
                          {m.playedAt > 0 && (
                            <>
                              <span>·</span>
                              <span>{formatMatchDate(m.playedAt)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right font-mono tabular-nums">
                      <span
                        className="block text-xs font-bold"
                        style={{ color: badgeColor }}
                      >
                        {formatSignedDelta(m.eloDelta)}
                      </span>
                      <span
                        className="block text-[10px]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {m.eloAfter} Elo
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
