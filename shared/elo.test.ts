import { describe, expect, it } from 'vitest';
import {
  INITIAL_ELO,
  MIN_ELO,
  applyOutcomeToProfile,
  calculateEloUpdate,
  calculateExpectedScore,
  createDefaultEloProfile,
  getEloStakes,
  getEloTier,
  getKFactor,
  getNextEloTier,
} from './elo.js';

describe('elo', () => {
  it('crée un profil initial à 1200 Elo (Tacticien)', () => {
    const profile = createDefaultEloProfile();
    expect(profile.rating).toBe(INITIAL_ELO);
    expect(profile.peakRating).toBe(1200);
    expect(getEloTier(profile.rating).label).toBe('Tacticien');
  });

  it('calcule correctement le facteur K (provisoire, standard, maître)', () => {
    expect(getKFactor(1200, 0)).toBe(40);
    expect(getKFactor(1500, 9)).toBe(40);
    expect(getKFactor(1500, 10)).toBe(24);
    expect(getKFactor(2000, 25)).toBe(16);
  });

  it('attribue +20 / -20 entre deux joueurs provisoires à 1200 Elo', () => {
    const res = calculateEloUpdate(
      { rating: 1200, gamesPlayed: 0 },
      { rating: 1200, gamesPlayed: 0 },
      1,
    );
    expect(res.expectedA).toBeCloseTo(0.5, 5);
    expect(res.deltaA).toBe(20);
    expect(res.deltaB).toBe(-20);
    expect(res.newRatingA).toBe(1220);
    expect(res.newRatingB).toBe(1180);
  });

  it('récompense un upset et donne un gain modeste au favori', () => {
    const expected = calculateExpectedScore(1200, 1600);
    expect(expected).toBeLessThan(0.1);

    const upset = calculateEloUpdate(
      { rating: 1200, gamesPlayed: 20 },
      { rating: 1600, gamesPlayed: 20 },
      1,
    );
    expect(upset.deltaA).toBeGreaterThanOrEqual(21);
    expect(upset.deltaB).toBeLessThanOrEqual(-21);

    const favoriteWin = calculateEloUpdate(
      { rating: 1600, gamesPlayed: 20 },
      { rating: 1200, gamesPlayed: 20 },
      1,
    );
    expect(favoriteWin.deltaA).toBeLessThanOrEqual(3);
    expect(favoriteWin.deltaA).toBeGreaterThan(0);
  });

  it('calcule des deltas asymétriques sur match nul quand les Elos diffèrent', () => {
    const draw = calculateEloUpdate(
      { rating: 1200, gamesPlayed: 15 },
      { rating: 1400, gamesPlayed: 15 },
      0.5,
    );
    expect(draw.deltaA).toBeGreaterThan(0);
    expect(draw.deltaB).toBeLessThan(0);
  });

  it('respecte le plancher MIN_ELO et calcule les enjeux et paliers', () => {
    const floored = calculateEloUpdate(
      { rating: 105, gamesPlayed: 5 },
      { rating: 1400, gamesPlayed: 5 },
      0,
    );
    expect(floored.newRatingA).toBeGreaterThanOrEqual(MIN_ELO);

    const stakes = getEloStakes(
      { rating: 1200, gamesPlayed: 0 },
      { rating: 1200, gamesPlayed: 0 },
    );
    expect(stakes).toEqual({
      winX: 20,
      drawX: 0,
      lossX: -20,
      winO: 20,
      drawO: 0,
      lossO: -20,
      winProbX: 50,
    });

    expect(getEloTier(950).label).toBe('Novice');
    expect(getEloTier(1050).label).toBe('Apprenti');
    expect(getEloTier(1250).label).toBe('Tacticien');
    expect(getEloTier(1450).label).toBe('Stratège');
    expect(getEloTier(1650).label).toBe('Maître');
    expect(getEloTier(1850).label).toBe('Grand Maître');
    expect(getEloTier(2050).label).toBe('Souverain');

    expect(getNextEloTier(950)).toMatchObject({ label: 'Apprenti', min: 1000 });
    expect(getNextEloTier(1199)).toMatchObject({ label: 'Tacticien', min: 1200 });
    expect(getNextEloTier(1200)).toMatchObject({ label: 'Stratège', min: 1400 });
    expect(getNextEloTier(1450)).toMatchObject({ label: 'Maître', min: 1600 });
    expect(getNextEloTier(1650)).toMatchObject({ label: 'Grand Maître', min: 1800 });
    expect(getNextEloTier(1850)).toMatchObject({ label: 'Souverain', min: 2000 });
    expect(getNextEloTier(2000)).toBeNull();
  });

  it('met à jour les statistiques et séries dans applyOutcomeToProfile', () => {
    let p = createDefaultEloProfile();
    p = applyOutcomeToProfile(p, 1220, 1);
    p = applyOutcomeToProfile(p, 1238, 1);
    expect(p).toMatchObject({
      rating: 1238,
      gamesPlayed: 2,
      wins: 2,
      draws: 0,
      losses: 0,
      peakRating: 1238,
      streak: 2,
    });
    p = applyOutcomeToProfile(p, 1218, 0);
    expect(p.streak).toBe(-1);
    expect(p.peakRating).toBe(1238);
    p = applyOutcomeToProfile(p, 1218, 0.5);
    expect(p.streak).toBe(0);
    expect(p.draws).toBe(1);
  });
});
