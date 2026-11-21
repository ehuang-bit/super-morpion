-- Nom affiché en partie, choisi librement par un compte (NULL = pseudo du compte).
-- Contrairement à username, il n'est pas unique et ne sert jamais à se connecter.
ALTER TABLE users ADD COLUMN IF NOT EXISTS game_name TEXT;
