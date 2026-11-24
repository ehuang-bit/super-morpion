import { describe, expect, it } from 'vitest';
import {
  parseLoginIdentifier,
  suggestUsernameBase,
  validateEmail,
  validatePassword,
  validateUsername,
} from './authValidation.js';

describe('authValidation', () => {
  it('validates and normalizes email addresses', () => {
    expect(validateEmail('  Alice.Dupont@Gmail.COM ')).toEqual({
      ok: true,
      email: 'alice.dupont@gmail.com',
    });
    expect(validateEmail('etudiant+promo@albertschool.com')).toEqual({
      ok: true,
      email: 'etudiant+promo@albertschool.com',
    });
    expect(validateEmail('')).toMatchObject({ ok: false });
    expect(validateEmail('pas-un-mail')).toMatchObject({ ok: false });
    expect(validateEmail('test@localhost')).toMatchObject({ ok: false });
    expect(validateEmail('a b@gmail.com')).toMatchObject({ ok: false });
  });

  it('validates usernames cleanly', () => {
    expect(validateUsername('  Camille_42  ')).toEqual({
      ok: true,
      username: 'Camille_42',
      usernameLower: 'camille_42',
    });
    expect(validateUsername('ab')).toMatchObject({ ok: false });
    expect(validateUsername('alice@gmail.com')).toMatchObject({ ok: false });
  });

  it('validates password length bounds', () => {
    expect(validatePassword('secret123')).toEqual({ ok: true, password: 'secret123' });
    expect(validatePassword('12345')).toMatchObject({ ok: false });
    expect(validatePassword('a'.repeat(101))).toMatchObject({ ok: false });
  });

  it('distinguishes email vs username login identifiers', () => {
    expect(parseLoginIdentifier('  Alice@Example.com ')).toEqual({
      kind: 'email',
      value: 'alice@example.com',
    });
    expect(parseLoginIdentifier('  Camille ')).toEqual({
      kind: 'username',
      value: 'camille',
    });
    expect(parseLoginIdentifier('   ')).toBeNull();
  });

  it('derives clean username suggestions from display name or email', () => {
    expect(suggestUsernameBase('Éléonore Martin', 'el@gmail.com')).toBe('Éléonore Martin');
    expect(suggestUsernameBase(null, 'lucas.dupont+2026@gmail.com')).toBe('lucas dupont 202');
    expect(suggestUsernameBase(null, 'ab@x.fr')).toBe('Joueur');
  });
});
