export type Locale =
  | 'fr'
  | 'en'
  | 'zh'
  | 'de'
  | 'es'
  | 'it'
  | 'hu'
  | 'ar'
  | 'hi'
  | 'pl'
  | 'pt';

export interface LanguageOption {
  code: Locale;
  nativeName: string;
  shortCode: string;
  dir: 'ltr' | 'rtl';
  bcp47: string;
}

export const LANGUAGES: readonly LanguageOption[] = [
  { code: 'fr', nativeName: 'Français', shortCode: 'FR', dir: 'ltr', bcp47: 'fr-FR' },
  { code: 'en', nativeName: 'English', shortCode: 'EN', dir: 'ltr', bcp47: 'en-US' },
  { code: 'zh', nativeName: '中文 (简体)', shortCode: '中文', dir: 'ltr', bcp47: 'zh-CN' },
  { code: 'de', nativeName: 'Deutsch', shortCode: 'DE', dir: 'ltr', bcp47: 'de-DE' },
  { code: 'es', nativeName: 'Español', shortCode: 'ES', dir: 'ltr', bcp47: 'es-ES' },
  { code: 'it', nativeName: 'Italiano', shortCode: 'IT', dir: 'ltr', bcp47: 'it-IT' },
  { code: 'hu', nativeName: 'Magyar', shortCode: 'HU', dir: 'ltr', bcp47: 'hu-HU' },
  { code: 'ar', nativeName: 'العربية', shortCode: 'عربي', dir: 'rtl', bcp47: 'ar-SA' },
  { code: 'hi', nativeName: 'हिन्दी', shortCode: 'हिं', dir: 'ltr', bcp47: 'hi-IN' },
  { code: 'pl', nativeName: 'Polski', shortCode: 'PL', dir: 'ltr', bcp47: 'pl-PL' },
  { code: 'pt', nativeName: 'Português', shortCode: 'PT', dir: 'ltr', bcp47: 'pt-PT' },
];

export const DEFAULT_LOCALE: Locale = 'fr';
const LOCALE_STORAGE_KEY = 'sm_locale';

const VALID_LOCALES = new Set<string>(LANGUAGES.map((l) => l.code));

export function isValidLocale(raw: unknown): raw is Locale {
  return typeof raw === 'string' && VALID_LOCALES.has(raw);
}

export function getLanguageOption(locale: Locale): LanguageOption {
  return LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];
}

export function getSavedLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isValidLocale(saved)) return saved;
  } catch {
    // ignore storage errors
  }
  return DEFAULT_LOCALE;
}

export function saveLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore storage errors
  }
}

export function applyLocaleToDocument(locale: Locale): void {
  if (typeof document === 'undefined') return;
  const opt = getLanguageOption(locale);
  document.documentElement.lang = opt.code;
  document.documentElement.dir = opt.dir;
}
