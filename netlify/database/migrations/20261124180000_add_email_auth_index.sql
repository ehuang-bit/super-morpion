-- Index insensible à la casse sur l'adresse e-mail pour la connexion e-mail + mot de passe
-- et la liaison automatique avec Google / lien magique.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

CREATE INDEX IF NOT EXISTS idx_users_email_lower
  ON users (LOWER(email))
  WHERE email IS NOT NULL AND email <> '';
