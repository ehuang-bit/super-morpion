import { getEloTier, getNextEloTier, type EloProfile } from '@shared/elo';
import {
  TIME_CONTROL_LABELS,
  type AuthUser,
  type EndReason,
  type MatchHistoryItem,
  type PlayerStatsPayload,
} from '@shared/protocol';
import {
  ArrowLeft,
  Award,
  Flame,
  LogIn,
  RefreshCw,
  Swords,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import type { PieceStyle } from '../types/boardPrefs';
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
}

const END_REASON_LABELS: Record<EndReason, string> = {
  alignment: 'Alignement',
  draw: 'Match nul',
  timeout: 'Temps écoulé',
  resign: 'Abandon',
  abandoned: 'Déconnexion',
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
}: StatsViewProps) {
  const profile = stats?.profile ?? playerElo.profile;
  const tier = stats?.tier ?? playerElo.tier;
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

  // Build SVG sparkline coordinates
  const ratings = eloHistory.map((p) => p.rating);
  const minRating = Math.min(...ratings, 1150) - 20;
  const maxRating = Math.max(...ratings, 1250) + 20;
  const ratingSpan = Math.max(40, maxRating - minRating);
  const chartW = 560;
  const chartH = 140;
  const padX = 18;
  const padY = 18;

  const points = eloHistory.map((pt, idx) => {
    const x =
      eloHistory.length === 1
        ? chartW / 2
        : padX +
          (idx / (eloHistory.length - 1)) * (chartW - padX * 2);
    const y =
      chartH -
      padY -
      ((pt.rating - minRating) / ratingSpan) * (chartH - padY * 2);
    return { x, y, rating: pt.rating };
  });

  const polylinePoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath =
    points.length > 1
      ? `M ${points[0].x.toFixed(1)} ${(chartH - padY).toFixed(1)} L ` +
        points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ') +
        ` L ${points[points.length - 1].x.toFixed(1)} ${(chartH - padY).toFixed(1)} Z`
      : '';

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
            Classement Elo FIDE, progression de rang et historique des duels en ligne.
          </p>
        </div>

        <div className="flex items-center gap-2">
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
              Classement Elo actuel
            </span>
            <div className="flex items-baseline gap-2.5 mt-0.5">
              <span
                className="font-mono text-3xl sm:text-4xl font-bold tabular-nums leading-none"
                style={{ color: 'var(--text-primary)' }}
              >
                {profile.rating}
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
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${tierProgressPct}%`,
                backgroundColor: 'var(--accent-active)',
              }}
            />
          </div>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {nextTier
              ? `Encore ${Math.max(0, nextTier.min - profile.rating)} pts Elo pour atteindre ${nextTier.label}`
              : 'Palier Souverain (2000+ Elo)'}
          </span>
        </div>
      </section>

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
            {profile.gamesPlayed}
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
            {winRate}%
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
            {profile.peakRating}
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
          className="rounded-[16px] p-4 sm:p-5 flex flex-col justify-between gap-3"
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
              className="font-mono text-xs font-semibold tabular-nums"
              style={{ color: 'var(--text-muted)' }}
            >
              Min {Math.round(minRating + 20)} · Max {Math.round(maxRating - 20)}
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
              className="w-full h-36 overflow-visible"
              role="img"
              aria-label="Graphique de progression Elo"
            >
              {/* Reference lines */}
              <line
                x1={padX}
                y1={padY}
                x2={chartW - padX}
                y2={padY}
                stroke="var(--border-cell)"
                strokeDasharray="3 3"
              />
              <line
                x1={padX}
                y1={chartH / 2}
                x2={chartW - padX}
                y2={chartH / 2}
                stroke="var(--border-cell)"
                strokeDasharray="3 3"
              />
              <line
                x1={padX}
                y1={chartH - padY}
                x2={chartW - padX}
                y2={chartH - padY}
                stroke="var(--border-main)"
              />

              {areaPath && (
                <path
                  d={areaPath}
                  fill="var(--x-surface)"
                  opacity="0.65"
                />
              )}

              {points.length > 1 && (
                <polyline
                  fill="none"
                  stroke="var(--x-color)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylinePoints}
                />
              )}

              {points.map((pt, idx) => (
                <g key={idx}>
                  <circle
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
                  />
                </g>
              ))}
            </svg>
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
              {matches.map((m) => {
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
                  <div
                    key={m.id}
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
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
