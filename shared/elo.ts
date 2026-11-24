/**
 * Classement Glicko-2 (le système utilisé par Lichess et, sous une forme
 * proche, par Chess.com).
 *
 * Par rapport à un Elo à facteur K fixe, chaque joueur porte en plus :
 *  - une déviation (RD) : l'incertitude sur son niveau. Elle est grande pour
 *    un nouveau joueur (ses premières parties font beaucoup bouger son
 *    classement) puis se resserre à mesure qu'il joue, et remonte lentement
 *    quand il reste inactif ;
 *  - une volatilité (σ) : la régularité de ses résultats. Un joueur qui
 *    enchaîne des résultats surprenants voit son classement bouger plus vite.
 *
 * Le gain ou la perte dépend donc du niveau des deux joueurs ET de la
 * confiance que l'on a dans chacun d'eux : battre un joueur établi rapporte
 * plus que battre un joueur dont le classement est encore provisoire.
 */

export const INITIAL_ELO = 300;
export const MIN_ELO = 100;
export const INITIAL_RD = 350;
export const MIN_RD = 45;
export const MAX_RD = 350;
export const INITIAL_VOLATILITY = 0.06;
export const MAX_VOLATILITY = 0.1;
/** Contrainte d'évolution de la volatilité (Lichess utilise 0.75). */
export const GLICKO_TAU = 0.75;
/** Au-delà de cette déviation, le classement est considéré comme provisoire. */
export const PROVISIONAL_RD = 110;
/** Durée d'une « période » d'inactivité pour la remontée de la déviation. */
export const RATING_PERIOD_MS = 24 * 60 * 60 * 1000;

const GLICKO_SCALE = 173.7178;
const GLICKO_CENTER = 1500;
const CONVERGENCE_EPSILON = 0.000001;

export interface EloTier {
  id: string;
  label: string;
  min: number;
}

export interface EloProfile {
  rating: number;
  /** Déviation Glicko (incertitude, en points de classement). */
  rd: number;
  /** Volatilité Glicko-2. */
  volatility: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  peakRating: number;
  streak: number;
  /** Horodatage de la dernière partie classée (ms), null si jamais joué. */
  lastPlayedAt: number | null;
}

export interface EloMatchDelta {
  before: number;
  after: number;
  delta: number;
  tier: string;
  /** Déviation après la partie. */
  rd?: number;
  /** Classement encore provisoire après la partie. */
  provisional?: boolean;
  /** false quand la partie a été annulée (aucun effet sur le classement). */
  rated?: boolean;
}

export interface EloStakes {
  winX: number;
  drawX: number;
  lossX: number;
  winO: number;
  drawO: number;
  lossO: number;
  /** Probabilité de victoire attendue pour X, en pourcentage. */
  winProbX: number;
}

/** Ce dont le calcul a besoin pour un joueur. */
export interface RatingInput {
  rating: number;
  rd?: number;
  volatility?: number;
  lastPlayedAt?: number | null;
}

export interface GlickoState {
  rating: number;
  rd: number;
  volatility: number;
}

export interface RatingUpdateResult {
  /** États complets (non arrondis pour rd/volatility, rating arrondi). */
  nextA: GlickoState;
  nextB: GlickoState;
  deltaA: number;
  deltaB: number;
  expectedA: number;
  expectedB: number;
}

export const ELO_TIERS: readonly EloTier[] = [
  { id: 'souverain', label: 'Souverain', min: 2000 },
  { id: 'grand_maitre', label: 'Grand Maître', min: 1700 },
  { id: 'maitre', label: 'Maître', min: 1400 },
  { id: 'stratege', label: 'Stratège', min: 1100 },
  { id: 'tacticien', label: 'Tacticien', min: 800 },
  { id: 'apprenti', label: 'Apprenti', min: 500 },
  { id: 'novice', label: 'Novice', min: 0 },
];

export function createDefaultEloProfile(): EloProfile {
  return {
    rating: INITIAL_ELO,
    rd: INITIAL_RD,
    volatility: INITIAL_VOLATILITY,
    gamesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    peakRating: INITIAL_ELO,
    streak: 0,
    lastPlayedAt: null,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number | undefined | null, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function isProvisional(rd: number | undefined | null): boolean {
  return finiteOr(rd, INITIAL_RD) > PROVISIONAL_RD;
}

/** Formate le classement arrondi à l'entier (sans point d'interrogation). */
export function formatRating(rating: number, _rd?: number | null): string {
  return `${Math.round(rating)}`;
}

/**
 * Remontée de la déviation après une période d'inactivité :
 * φ* = √(φ² + σ²·t), t = nombre de jours sans partie classée.
 */
export function inflateDeviation(player: RatingInput, now: number): number {
  const rd = clamp(finiteOr(player.rd, INITIAL_RD), MIN_RD, MAX_RD);
  if (!player.lastPlayedAt || now <= player.lastPlayedAt) {
    return rd;
  }
  const sigma = finiteOr(player.volatility, INITIAL_VOLATILITY);
  const periods = (now - player.lastPlayedAt) / RATING_PERIOD_MS;
  const phi = rd / GLICKO_SCALE;
  const inflated = Math.sqrt(phi * phi + sigma * sigma * periods) * GLICKO_SCALE;
  return clamp(inflated, MIN_RD, MAX_RD);
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectedScoreInternal(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

export interface GlickoGameResult {
  opponent: GlickoState;
  /** 1 = victoire, 0.5 = nul, 0 = défaite. */
  score: number;
}

/**
 * Algorithme Glicko-2 complet (Glickman, 2013) pour une période de
 * classement contenant un ou plusieurs résultats.
 */
export function glicko2Rate(
  player: GlickoState,
  results: readonly GlickoGameResult[],
  tau: number = GLICKO_TAU,
): GlickoState {
  const mu = (player.rating - GLICKO_CENTER) / GLICKO_SCALE;
  const phi = player.rd / GLICKO_SCALE;
  const sigma = player.volatility;

  if (results.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return {
      rating: player.rating,
      rd: phiStar * GLICKO_SCALE,
      volatility: sigma,
    };
  }

  let vInv = 0;
  let deltaSum = 0;
  for (const r of results) {
    const muJ = (r.opponent.rating - GLICKO_CENTER) / GLICKO_SCALE;
    const phiJ = r.opponent.rd / GLICKO_SCALE;
    const gJ = g(phiJ);
    const eJ = expectedScoreInternal(mu, muJ, phiJ);
    vInv += gJ * gJ * eJ * (1 - eJ);
    deltaSum += gJ * (r.score - eJ);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // Nouvelle volatilité : résolution de f(x) = 0 (méthode d'Illinois).
  const a = Math.log(sigma * sigma);
  const phi2 = phi * phi;
  const delta2 = delta * delta;
  const f = (x: number) => {
    const ex = Math.exp(x);
    const num = ex * (delta2 - phi2 - v - ex);
    const den = 2 * (phi2 + v + ex) * (phi2 + v + ex);
    return num / den - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (delta2 > phi2 + v) {
    B = Math.log(delta2 - phi2 - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0 && k < 100) {
      k += 1;
    }
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  let guard = 0;
  while (Math.abs(B - A) > CONVERGENCE_EPSILON && guard < 200) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
    guard += 1;
  }

  const sigmaNext = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi2 + sigmaNext * sigmaNext);
  const phiNext = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNext = mu + phiNext * phiNext * deltaSum;

  return {
    rating: muNext * GLICKO_SCALE + GLICKO_CENTER,
    rd: phiNext * GLICKO_SCALE,
    volatility: sigmaNext,
  };
}

function toGlickoState(player: RatingInput, now: number): GlickoState {
  return {
    rating: finiteOr(player.rating, INITIAL_ELO),
    rd: inflateDeviation(player, now),
    volatility: clamp(
      finiteOr(player.volatility, INITIAL_VOLATILITY),
      0.01,
      MAX_VOLATILITY,
    ),
  };
}

function finalizeState(state: GlickoState): GlickoState {
  return {
    rating: Math.max(MIN_ELO, Math.round(state.rating)),
    rd: clamp(state.rd, MIN_RD, MAX_RD),
    volatility: clamp(state.volatility, 0.01, MAX_VOLATILITY),
  };
}

/**
 * Probabilité de victoire de A contre B, en tenant compte de l'incertitude
 * sur les deux classements.
 */
export function winProbability(
  playerA: RatingInput,
  playerB: RatingInput,
  now: number = Date.now(),
): number {
  const a = toGlickoState(playerA, now);
  const b = toGlickoState(playerB, now);
  const combinedPhi =
    Math.sqrt(a.rd * a.rd + b.rd * b.rd) / GLICKO_SCALE;
  const muDiff = (a.rating - b.rating) / GLICKO_SCALE;
  return 1 / (1 + Math.exp(-g(combinedPhi) * muDiff));
}

/** Calcule la mise à jour Glicko-2 d'une partie entre A et B. */
export function calculateRatingUpdate(
  playerA: RatingInput,
  playerB: RatingInput,
  outcomeA: 1 | 0.5 | 0,
  now: number = Date.now(),
): RatingUpdateResult {
  const a = toGlickoState(playerA, now);
  const b = toGlickoState(playerB, now);
  const outcomeB = (1 - outcomeA) as 1 | 0.5 | 0;

  const nextA = finalizeState(glicko2Rate(a, [{ opponent: b, score: outcomeA }]));
  const nextB = finalizeState(glicko2Rate(b, [{ opponent: a, score: outcomeB }]));

  const roundedA = Math.round(a.rating);
  const roundedB = Math.round(b.rating);
  const expectedA = winProbability(playerA, playerB, now);

  return {
    nextA,
    nextB,
    deltaA: nextA.rating - roundedA,
    deltaB: nextB.rating - roundedB,
    expectedA,
    expectedB: 1 - expectedA,
  };
}

/** Gains / pertes possibles avant la partie, vus de chaque côté. */
export function getEloStakes(
  playerX: RatingInput,
  playerO: RatingInput,
  now: number = Date.now(),
): EloStakes {
  const onWinX = calculateRatingUpdate(playerX, playerO, 1, now);
  const onDraw = calculateRatingUpdate(playerX, playerO, 0.5, now);
  const onLossX = calculateRatingUpdate(playerX, playerO, 0, now);

  return {
    winX: onWinX.deltaA,
    drawX: onDraw.deltaA,
    lossX: onLossX.deltaA,
    winO: onLossX.deltaB,
    drawO: onDraw.deltaB,
    lossO: onWinX.deltaB,
    winProbX: Math.round(onWinX.expectedA * 100),
  };
}

export function getEloTier(rating: number): EloTier {
  for (const tier of ELO_TIERS) {
    if (rating >= tier.min) {
      return tier;
    }
  }
  return ELO_TIERS[ELO_TIERS.length - 1];
}

export function getNextEloTier(rating: number): EloTier | null {
  for (let i = ELO_TIERS.length - 1; i >= 0; i--) {
    if (ELO_TIERS[i].min > rating) {
      return ELO_TIERS[i];
    }
  }
  return null;
}

/** Applique le résultat d'une partie classée au profil complet. */
export function applyOutcomeToProfile(
  profile: EloProfile,
  next: GlickoState,
  outcome: 1 | 0.5 | 0,
  now: number,
): EloProfile {
  let nextStreak = 0;
  if (outcome === 1) {
    nextStreak = profile.streak >= 0 ? profile.streak + 1 : 1;
  } else if (outcome === 0) {
    nextStreak = profile.streak <= 0 ? profile.streak - 1 : -1;
  }

  return {
    rating: next.rating,
    rd: next.rd,
    volatility: next.volatility,
    gamesPlayed: profile.gamesPlayed + 1,
    wins: profile.wins + (outcome === 1 ? 1 : 0),
    draws: profile.draws + (outcome === 0.5 ? 1 : 0),
    losses: profile.losses + (outcome === 0 ? 1 : 0),
    peakRating: Math.max(profile.peakRating, next.rating),
    streak: nextStreak,
    lastPlayedAt: now,
  };
}

/** Normalise un profil partiel (ancienne version, JSON stocké…). */
export function normalizeEloProfile(
  raw: Partial<EloProfile> | null | undefined,
): EloProfile {
  const def = createDefaultEloProfile();
  if (!raw) return def;
  const rating = finiteOr(raw.rating, def.rating);
  return {
    rating,
    rd: clamp(finiteOr(raw.rd, def.rd), MIN_RD, MAX_RD),
    volatility: clamp(
      finiteOr(raw.volatility, def.volatility),
      0.01,
      MAX_VOLATILITY,
    ),
    gamesPlayed: finiteOr(raw.gamesPlayed, 0),
    wins: finiteOr(raw.wins, 0),
    draws: finiteOr(raw.draws, 0),
    losses: finiteOr(raw.losses, 0),
    peakRating: finiteOr(raw.peakRating, rating),
    streak: finiteOr(raw.streak, 0),
    lastPlayedAt:
      typeof raw.lastPlayedAt === 'number' && raw.lastPlayedAt > 0
        ? raw.lastPlayedAt
        : null,
  };
}
