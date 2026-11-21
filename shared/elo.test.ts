import { describe, expect, it } from 'vitest';
import {
  INITIAL_ELO,
  INITIAL_RD,
  MIN_ELO,
  MIN_RD,
  PROVISIONAL_RD,
  RATING_PERIOD_MS,
  applyOutcomeToProfile,
  calculateRatingUpdate,
  createDefaultEloProfile,
  formatRating,
  getEloStakes,
  getEloTier,
  getNextEloTier,
  glicko2Rate,
  inflateDeviation,
  isProvisional,
  normalizeEloProfile,
  winProbability,
} from './elo.js';

const NOW = 1_800_000_000_000;

describe('Glicko-2', () => {
  it('reproduit l’exemple de référence de Glickman (τ = 0.5)', () => {
    const next = glicko2Rate(
      { rating: 1500, rd: 200, volatility: 0.06 },
      [
        { opponent: { rating: 1400, rd: 30, volatility: 0.06 }, score: 1 },
        { opponent: { rating: 1550, rd: 100, volatility: 0.06 }, score: 0 },
        { opponent: { rating: 1700, rd: 300, volatility: 0.06 }, score: 0 },
      ],
      0.5,
    );
    expect(next.rating).toBeCloseTo(1464.06, 1);
    expect(next.rd).toBeCloseTo(151.52, 1);
    expect(next.volatility).toBeCloseTo(0.05999, 4);
  });

  it('crée un profil provisoire à 1200 (Tacticien)', () => {
    const profile = createDefaultEloProfile();
    expect(profile.rating).toBe(INITIAL_ELO);
    expect(profile.rd).toBe(INITIAL_RD);
    expect(isProvisional(profile.rd)).toBe(true);
    expect(formatRating(profile.rating, profile.rd)).toBe('1200?');
    expect(getEloTier(profile.rating).label).toBe('Tacticien');
  });

  it('fait beaucoup bouger un nouveau joueur, puis se stabilise', () => {
    const first = calculateRatingUpdate(
      { rating: 1200, rd: 350 },
      { rating: 1200, rd: 350 },
      1,
      NOW,
    );
    // Deux débutants : grosse variation symétrique, déviation qui se resserre
    expect(first.deltaA).toBeGreaterThan(100);
    expect(first.deltaB).toBe(-first.deltaA);
    expect(first.nextA.rd).toBeLessThan(350);

    const established = calculateRatingUpdate(
      { rating: 1500, rd: 60, volatility: 0.06 },
      { rating: 1500, rd: 60, volatility: 0.06 },
      1,
      NOW,
    );
    expect(established.deltaA).toBeGreaterThan(3);
    expect(established.deltaA).toBeLessThan(12);
  });

  it('protège les joueurs établis contre les classements provisoires', () => {
    const res = calculateRatingUpdate(
      { rating: 1500, rd: 60 },
      { rating: 1500, rd: 350 },
      0,
      NOW,
    );
    // Le joueur établi perd peu, le nouveau gagne beaucoup
    expect(Math.abs(res.deltaA)).toBeLessThan(12);
    expect(res.deltaB).toBeGreaterThan(80);
  });

  it('récompense les exploits et donne peu au favori', () => {
    const upset = calculateRatingUpdate(
      { rating: 1200, rd: 70 },
      { rating: 1600, rd: 70 },
      1,
      NOW,
    );
    expect(upset.expectedA).toBeLessThan(0.15);
    expect(upset.deltaA).toBeGreaterThan(14);

    const favorite = calculateRatingUpdate(
      { rating: 1600, rd: 70 },
      { rating: 1200, rd: 70 },
      1,
      NOW,
    );
    expect(favorite.deltaA).toBeGreaterThanOrEqual(0);
    expect(favorite.deltaA).toBeLessThan(5);
  });

  it('donne des deltas asymétriques sur nul quand les niveaux diffèrent', () => {
    const draw = calculateRatingUpdate(
      { rating: 1200, rd: 80 },
      { rating: 1400, rd: 80 },
      0.5,
      NOW,
    );
    expect(draw.deltaA).toBeGreaterThan(0);
    expect(draw.deltaB).toBeLessThan(0);
  });

  it('fait remonter la déviation après une longue inactivité', () => {
    const player = {
      rating: 1500,
      rd: 60,
      volatility: 0.06,
      lastPlayedAt: NOW - 60 * RATING_PERIOD_MS,
    };
    const inflated = inflateDeviation(player, NOW);
    expect(inflated).toBeGreaterThan(60);
    expect(inflated).toBeLessThan(PROVISIONAL_RD);
    expect(inflateDeviation({ ...player, lastPlayedAt: NOW }, NOW)).toBe(60);
  });

  it('respecte le plancher, borne la déviation et expose les enjeux', () => {
    const floored = calculateRatingUpdate(
      { rating: 110, rd: 300 },
      { rating: 1400, rd: 60 },
      0,
      NOW,
    );
    expect(floored.nextA.rating).toBeGreaterThanOrEqual(MIN_ELO);

    let state = { rating: 1500, rd: 350, volatility: 0.06 };
    for (let i = 0; i < 200; i++) {
      const r = calculateRatingUpdate(state, { rating: 1500, rd: 50 }, 0.5, NOW);
      state = r.nextA;
    }
    expect(state.rd).toBeGreaterThanOrEqual(MIN_RD);
    expect(isProvisional(state.rd)).toBe(false);

    const stakes = getEloStakes({ rating: 1200, rd: 350 }, { rating: 1200, rd: 350 }, NOW);
    expect(stakes.winProbX).toBe(50);
    expect(stakes.winX).toBe(stakes.winO);
    expect(stakes.lossX).toBe(stakes.lossO);
    expect(stakes.drawX).toBe(0);
    expect(stakes.winX).toBeGreaterThan(0);
    expect(stakes.lossX).toBeLessThan(0);
  });

  it('calcule une probabilité de victoire cohérente', () => {
    expect(winProbability({ rating: 1500, rd: 60 }, { rating: 1500, rd: 60 }, NOW)).toBeCloseTo(0.5, 5);
    expect(winProbability({ rating: 1800, rd: 60 }, { rating: 1400, rd: 60 }, NOW)).toBeGreaterThan(0.85);
    // L'incertitude rapproche la probabilité de 50 %
    const sure = winProbability({ rating: 1800, rd: 50 }, { rating: 1400, rd: 50 }, NOW);
    const unsure = winProbability({ rating: 1800, rd: 350 }, { rating: 1400, rd: 350 }, NOW);
    expect(unsure).toBeLessThan(sure);
  });

  it('gère les paliers', () => {
    expect(getEloTier(950).label).toBe('Novice');
    expect(getEloTier(1050).label).toBe('Apprenti');
    expect(getEloTier(1250).label).toBe('Tacticien');
    expect(getEloTier(1450).label).toBe('Stratège');
    expect(getEloTier(1650).label).toBe('Maître');
    expect(getEloTier(1850).label).toBe('Grand Maître');
    expect(getEloTier(2050).label).toBe('Souverain');
    expect(getNextEloTier(1199)).toMatchObject({ label: 'Tacticien', min: 1200 });
    expect(getNextEloTier(1850)).toMatchObject({ label: 'Souverain', min: 2000 });
    expect(getNextEloTier(2000)).toBeNull();
  });

  it('met à jour statistiques, séries et date de dernière partie', () => {
    let p = createDefaultEloProfile();
    p = applyOutcomeToProfile(p, { rating: 1350, rd: 290, volatility: 0.06 }, 1, NOW);
    p = applyOutcomeToProfile(p, { rating: 1420, rd: 250, volatility: 0.06 }, 1, NOW + 1);
    expect(p).toMatchObject({
      rating: 1420,
      rd: 250,
      gamesPlayed: 2,
      wins: 2,
      peakRating: 1420,
      streak: 2,
      lastPlayedAt: NOW + 1,
    });
    p = applyOutcomeToProfile(p, { rating: 1380, rd: 230, volatility: 0.06 }, 0, NOW + 2);
    expect(p.streak).toBe(-1);
    expect(p.peakRating).toBe(1420);
    p = applyOutcomeToProfile(p, { rating: 1380, rd: 220, volatility: 0.06 }, 0.5, NOW + 3);
    expect(p.streak).toBe(0);
    expect(p.draws).toBe(1);
  });

  it('normalise un ancien profil sans champs Glicko', () => {
    const legacy = normalizeEloProfile({ rating: 1310, gamesPlayed: 12 } as never);
    expect(legacy.rating).toBe(1310);
    expect(legacy.rd).toBe(INITIAL_RD);
    expect(legacy.lastPlayedAt).toBeNull();
    expect(legacy.peakRating).toBe(1310);
  });
});
