-- Passage de l'Elo initial de 1200 à 300 en conservant la proportion exacte des joueurs existants (× 300 / 1200, plancher 100)
ALTER TABLE elo_profiles
  ALTER COLUMN rating SET DEFAULT 300,
  ALTER COLUMN peak_rating SET DEFAULT 300;

UPDATE elo_profiles
SET rating = GREATEST(100, ROUND(rating * 300.0 / 1200.0)::INTEGER),
    peak_rating = GREATEST(100, ROUND(peak_rating * 300.0 / 1200.0)::INTEGER);

UPDATE match_history
SET opponent_elo = GREATEST(100, ROUND(opponent_elo * 300.0 / 1200.0)::INTEGER),
    elo_before = GREATEST(100, ROUND(elo_before * 300.0 / 1200.0)::INTEGER),
    elo_after = GREATEST(100, ROUND(elo_after * 300.0 / 1200.0)::INTEGER),
    elo_delta = GREATEST(100, ROUND(elo_after * 300.0 / 1200.0)::INTEGER)
              - GREATEST(100, ROUND(elo_before * 300.0 / 1200.0)::INTEGER);
