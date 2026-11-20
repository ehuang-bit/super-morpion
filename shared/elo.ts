export const INITIAL_ELO = 1200;
export const MIN_ELO = 100;

export interface EloTier {
  id: string;
  label: string;
  min: number;
}

export interface EloProfile {
  rating: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  peakRating: number;
  streak: number;
}

export interface EloMatchDelta {
  before: number;
  after: number;
  delta: number;
  tier: string;
}

export interface EloStakes {
  winX: number;
  drawX: number;
  lossX: number;
  winO: number;
  drawO: number;
  lossO: number;
  winProbX: number;
}

export interface EloPlayerInput {
  rating: number;
  gamesPlayed: number;
}

export interface EloUpdateResult {
  newRatingA: number;
  newRatingB: number;
  deltaA: number;
  deltaB: number;
  expectedA: number;
  expectedB: number;
}

export const ELO_TIERS: readonly EloTier[] = [
  { id: 'souverain', label: 'Souverain', min: 2000 },
  { id: 'grand_maitre', label: 'Grand Maître', min: 1800 },
  { id: 'maitre', label: 'Maître', min: 1600 },
  { id: 'stratege', label: 'Stratège', min: 1400 },
  { id: 'tacticien', label: 'Tacticien', min: 1200 },
  { id: 'apprenti', label: 'Apprenti', min: 1000 },
  { id: 'novice', label: 'Novice', min: 0 },
];

export function createDefaultEloProfile(): EloProfile {
  return {
    rating: INITIAL_ELO,
    gamesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    peakRating: INITIAL_ELO,
    streak: 0,
  };
}

export function getKFactor(rating: number, gamesPlayed: number): number {
  if (gamesPlayed < 10) return 40;
  if (rating >= 2000) return 16;
  return 24;
}

export function calculateExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function calculateEloUpdate(
  playerA: EloPlayerInput,
  playerB: EloPlayerInput,
  outcomeA: 1 | 0.5 | 0,
): EloUpdateResult {
  const expectedA = calculateExpectedScore(playerA.rating, playerB.rating);
  const expectedB = 1 - expectedA;
  const outcomeB = 1 - outcomeA;

  const kA = getKFactor(playerA.rating, playerA.gamesPlayed);
  const kB = getKFactor(playerB.rating, playerB.gamesPlayed);

  const newRatingA = Math.max(
    MIN_ELO,
    Math.round(playerA.rating + kA * (outcomeA - expectedA)),
  );
  const newRatingB = Math.max(
    MIN_ELO,
    Math.round(playerB.rating + kB * (outcomeB - expectedB)),
  );

  return {
    newRatingA,
    newRatingB,
    deltaA: newRatingA - playerA.rating,
    deltaB: newRatingB - playerB.rating,
    expectedA,
    expectedB,
  };
}

export function getEloStakes(
  playerX: EloPlayerInput,
  playerO: EloPlayerInput,
): EloStakes {
  const onWinX = calculateEloUpdate(playerX, playerO, 1);
  const onDraw = calculateEloUpdate(playerX, playerO, 0.5);
  const onLossX = calculateEloUpdate(playerX, playerO, 0);

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

export function applyOutcomeToProfile(
  profile: EloProfile,
  newRating: number,
  outcome: 1 | 0.5 | 0,
): EloProfile {
  let nextStreak = 0;
  if (outcome === 1) {
    nextStreak = profile.streak >= 0 ? profile.streak + 1 : 1;
  } else if (outcome === 0) {
    nextStreak = profile.streak <= 0 ? profile.streak - 1 : -1;
  }

  return {
    rating: newRating,
    gamesPlayed: profile.gamesPlayed + 1,
    wins: profile.wins + (outcome === 1 ? 1 : 0),
    draws: profile.draws + (outcome === 0.5 ? 1 : 0),
    losses: profile.losses + (outcome === 0 ? 1 : 0),
    peakRating: Math.max(profile.peakRating, newRating),
    streak: nextStreak,
  };
}
