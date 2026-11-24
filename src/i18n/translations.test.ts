import { describe, expect, it } from 'vitest';
import { FR, type TranslationKey } from './fr';
import { LANGUAGES, translate, TRANSLATIONS } from './index';

describe('i18n — 11 langues complètes', () => {
  it('contient les 11 langues demandées avec l’arabe en RTL', () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(codes).toEqual([
      'fr',
      'en',
      'zh',
      'de',
      'es',
      'it',
      'hu',
      'ar',
      'hi',
      'pl',
      'pt',
    ]);
    const ar = LANGUAGES.find((l) => l.code === 'ar');
    expect(ar?.dir).toBe('rtl');
    expect(LANGUAGES.filter((l) => l.code !== 'ar').every((l) => l.dir === 'ltr')).toBe(
      true,
    );
  });

  it('couvre 100 % des clés sans chaîne vide dans chaque langue et préserve les variables', () => {
    const frKeys = Object.keys(FR) as TranslationKey[];
    const placeholderRegex = /\{[a-zA-Z0-9_]+\}/g;

    for (const lang of LANGUAGES) {
      const dict = TRANSLATIONS[lang.code];
      for (const key of frKeys) {
        const val = dict[key];
        expect(typeof val, `${lang.code}.${key}`).toBe('string');
        expect(val.trim().length, `${lang.code}.${key} empty`).toBeGreaterThan(0);

        const expectedVars = [...new Set(FR[key].match(placeholderRegex) ?? [])].sort();
        const actualVars = [...new Set(val.match(placeholderRegex) ?? [])].sort();
        expect(actualVars, `${lang.code}.${key} vars`).toEqual(expectedVars);
      }
    }
  });

  it('interpole proprement les variables dynamiques', () => {
    expect(translate('en', 'trn.participantsTitle', { count: 5, size: 8 })).toBe(
      'Players joined (5/8)',
    );
    expect(translate('zh', 'trn.participantsTitle', { count: 4, size: 4 })).toBe(
      '已报名玩家 (4/4)',
    );
    expect(translate('ar', 'trn.round.qf')).toBe('ربع النهائي');
  });
});
