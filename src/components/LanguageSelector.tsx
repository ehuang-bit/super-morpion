import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { useI18n } from '../i18n';
import { haptics } from '../utils/haptics';
import { SMOOTH_EASE } from '../utils/motion';

interface LanguageSelectorProps {
  variant?: 'sidebar' | 'header' | 'grid';
}

export function LanguageSelector({ variant = 'sidebar' }: LanguageSelectorProps) {
  const { locale, language, languages, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (variant === 'grid') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {languages.map((lang) => {
          const active = lang.code === locale;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => {
                setLocale(lang.code);
                haptics.tap();
              }}
              aria-pressed={active}
              className="tactile-btn rounded-[10px] px-3 py-2.5 text-start flex items-center justify-between gap-2"
              style={{
                backgroundColor: active ? 'var(--accent-active-bg)' : 'var(--bg-surface)',
                border: active
                  ? '1.5px solid var(--accent-active)'
                  : '1px solid var(--border-cell)',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              <span className="min-w-0 flex flex-col">
                <span className="text-xs font-bold truncate" dir={lang.dir}>
                  {lang.nativeName}
                </span>
                <span
                  className="font-mono text-[10px] uppercase"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {lang.shortCode}
                </span>
              </span>
              {active && (
                <Check
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: 'var(--accent-active-text)' }}
                />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  const isHeader = variant === 'header';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          haptics.tap();
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t('nav.language')}: ${language.nativeName}`}
        title={`${t('nav.language')} — ${language.nativeName}`}
        className={
          isHeader
            ? 'tactile-btn inline-flex items-center justify-center gap-1 h-10 px-2.5 rounded-lg text-[11px] font-bold'
            : 'tactile-btn w-full rounded-lg px-2.5 py-1.5 text-[11px] font-medium flex items-center justify-between gap-1.5'
        }
        style={{
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-primary)',
          border: isHeader
            ? '1px solid var(--border-main)'
            : '1px solid var(--border-cell)',
        }}
      >
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
          <span className="truncate">
            {isHeader ? language.shortCode : language.nativeName}
          </span>
        </span>
        {!isHeader && (
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
              open ? 'rotate-180' : ''
            }`}
            style={{ color: 'var(--text-muted)' }}
          />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label={t('nav.language')}
            initial={{ opacity: 0, y: isHeader ? -6 : 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: isHeader ? -4 : 4, scale: 0.97 }}
            transition={{ duration: 0.14, ease: SMOOTH_EASE }}
            className={`absolute z-50 rounded-[12px] p-1.5 grid grid-cols-2 gap-1 ${
              isHeader
                ? 'top-full mt-1.5 end-0 w-[264px]'
                : 'bottom-full mb-1.5 inset-x-0 w-[240px]'
            }`}
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-strong)',
              boxShadow: 'var(--shadow-board)',
            }}
          >
            {languages.map((lang) => {
              const active = lang.code === locale;
              return (
                <button
                  key={lang.code}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setLocale(lang.code);
                    setOpen(false);
                    haptics.tap();
                  }}
                  className="tactile-btn rounded-lg px-2 py-1.5 text-[11px] font-semibold flex items-center justify-between gap-1 text-start"
                  style={{
                    backgroundColor: active
                      ? 'var(--accent-active-bg)'
                      : 'transparent',
                    color: active
                      ? 'var(--text-primary)'
                      : 'var(--text-secondary)',
                    border: active
                      ? '1px solid var(--accent-active)'
                      : '1px solid transparent',
                  }}
                >
                  <span className="truncate" dir={lang.dir}>
                    {lang.nativeName}
                  </span>
                  {active && (
                    <Check
                      className="w-3 h-3 shrink-0"
                      style={{ color: 'var(--accent-active-text)' }}
                    />
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
