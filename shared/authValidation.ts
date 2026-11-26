/**
 * Règles pures de validation et normalisation pour les comptes (pseudo, e-mail, mot de passe).
 * Partagées entre le serveur et les tests unitaires.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(
  raw: string,
): { ok: true; email: string } | { ok: false; error: string } {
  const cleaned = String(raw).trim().toLowerCase();
  if (!cleaned) {
    return { ok: false, error: 'Adresse e-mail requise.' };
  }
  if (cleaned.length > 254 || !EMAIL_RE.test(cleaned)) {
    return { ok: false, error: 'Adresse e-mail invalide.' };
  }
  return { ok: true, email: cleaned };
}

export function validateUsername(
  raw: string,
): { ok: true; username: string; usernameLower: string } | { ok: false; error: string } {
  const cleaned = String(raw).replace(/\s+/g, ' ').trim();
  if (cleaned.length < 3) {
    return {
      ok: false,
      error: 'Le pseudo doit contenir au moins 3 caractères.',
    };
  }
  if (cleaned.length > 20) {
    return {
      ok: false,
      error: 'Le pseudo est limité à 20 caractères.',
    };
  }
  if (!/^[\p{L}\p{N}_ -]{3,20}$/u.test(cleaned)) {
    return {
      ok: false,
      error: 'Utilisez uniquement des lettres, chiffres, espaces, tirets ou _.',
    };
  }
  return {
    ok: true,
    username: cleaned,
    usernameLower: cleaned.toLowerCase(),
  };
}

/**
 * Pseudo d'un joueur invité (2 à 20 caractères). Obligatoire avant d'entrer
 * dans une partie, un salon privé ou un tournoi en ligne.
 */
export function validateGuestPseudo(
  raw: string,
): { ok: true; pseudo: string } | { ok: false; error: string } {
  const cleaned = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (cleaned.length < 2) {
    return {
      ok: false,
      error: 'Entre ton pseudo (2 caractères min.) pour jouer en ligne.',
    };
  }
  if (cleaned.length > 20) {
    return {
      ok: false,
      error: 'Le pseudo est limité à 20 caractères.',
    };
  }
  if (!/^[\p{L}\p{N}_ -]{2,20}$/u.test(cleaned)) {
    return {
      ok: false,
      error: 'Utilisez uniquement des lettres, chiffres, espaces, tirets ou _.',
    };
  }
  return { ok: true, pseudo: cleaned };
}

export function validatePassword(
  raw: string,
): { ok: true; password: string } | { ok: false; error: string } {
  const password = String(raw);
  if (password.length < 6) {
    return {
      ok: false,
      error: 'Le mot de passe doit contenir au moins 6 caractères.',
    };
  }
  if (password.length > 100) {
    return { ok: false, error: 'Mot de passe trop long.' };
  }
  return { ok: true, password };
}

/**
 * Détermine si un identifiant de connexion est une adresse e-mail ou un pseudo.
 */
export function parseLoginIdentifier(
  raw: string,
): { kind: 'email'; value: string } | { kind: 'username'; value: string } | null {
  const cleaned = String(raw).replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  if (cleaned.includes('@')) {
    return { kind: 'email', value: cleaned.toLowerCase() };
  }
  return { kind: 'username', value: cleaned.toLowerCase() };
}

/** Transforme un nom ou une adresse e-mail en base de pseudo valide (3 à 16 caractères). */
export function suggestUsernameBase(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const source =
    (name && name.trim()) || (email ? email.split('@')[0] : '') || 'Joueur';
  const cleaned = source
    .replace(/[._+]+/g, ' ')
    .replace(/[^\p{L}\p{N} -]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16)
    .trim();
  return cleaned.length >= 3 ? cleaned : 'Joueur';
}
