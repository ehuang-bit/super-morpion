import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { TimeControl, TournamentRoundKey } from '@shared/protocol';
import { FR, type TranslationDict, type TranslationKey } from './fr';
import {
  applyLocaleToDocument,
  getLanguageOption,
  getSavedLocale,
  LANGUAGES,
  saveLocale,
  type LanguageOption,
  type Locale,
} from './languages';
import { DE, EN, ES, IT, ZH } from './localesA';
import { AR, HI, HU, PL, PT } from './localesB';

export { LANGUAGES, type LanguageOption, type Locale } from './languages';
export type { TranslationKey } from './fr';

export const TRANSLATIONS: Record<Locale, TranslationDict> = {
  fr: FR,
  en: EN,
  zh: ZH,
  de: DE,
  es: ES,
  it: IT,
  hu: HU,
  ar: AR,
  hi: HI,
  pl: PL,
  pt: PT,
};

export type TranslateVars = Record<string, string | number>;

export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: TranslateVars,
): string {
  const dict = TRANSLATIONS[locale] ?? FR;
  let text = dict[key] ?? FR[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

const TIER_KEYS: Record<string, TranslationKey> = {
  Novice: 'tier.Novice',
  Apprenti: 'tier.Apprenti',
  Tacticien: 'tier.Tacticien',
  Stratège: 'tier.Stratège',
  Maître: 'tier.Maître',
  'Grand Maître': 'tier.Grand Maître',
  Souverain: 'tier.Souverain',
};

interface I18nContextValue {
  locale: Locale;
  language: LanguageOption;
  dir: 'ltr' | 'rtl';
  languages: readonly LanguageOption[];
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: TranslateVars) => string;
  translateTier: (tierLabel: string) => string;
  translateTimeControl: (tc: TimeControl) => string;
  translateRoundKey: (roundKey: TournamentRoundKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getSavedLocale());

  useEffect(() => {
    applyLocaleToDocument(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    saveLocale(next);
    applyLocaleToDocument(next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const language = getLanguageOption(locale);
    const t = (key: TranslationKey, vars?: TranslateVars) =>
      translate(locale, key, vars);

    const translateTier = (tierLabel: string) => {
      const k = TIER_KEYS[tierLabel];
      return k ? translate(locale, k) : tierLabel;
    };

    const translateTimeControl = (tc: TimeControl) => {
      if (tc === 'rapid') return translate(locale, 'tc.rapid');
      if (tc === 'blitz') return translate(locale, 'tc.blitz');
      return translate(locale, 'tc.unlimited');
    };

    const translateRoundKey = (roundKey: TournamentRoundKey) => {
      return translate(locale, `trn.round.${roundKey}` as TranslationKey);
    };

    return {
      locale,
      language,
      dir: language.dir,
      languages: LANGUAGES,
      setLocale,
      t,
      translateTier,
      translateTimeControl,
      translateRoundKey,
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return ctx;
}
