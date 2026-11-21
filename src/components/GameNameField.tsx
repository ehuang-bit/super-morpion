import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, RotateCcw } from 'lucide-react';

interface GameNameFieldProps {
  /** Pseudo du compte : utilisé tant qu'aucun nom en partie n'est défini. */
  username: string;
  /** Nom en partie enregistré, ou null. */
  gameName: string | null;
  /** Enregistre le nom (chaîne vide = revenir au pseudo du compte). */
  onSave: (gameName: string) => Promise<{ ok: boolean; error?: string }>;
  disabled?: boolean;
}

type Status = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Nom affiché en partie pour un compte connecté.
 * Le pseudo du compte reste l'identité de base (connexion, classement) ;
 * ce champ ne change que le nom vu par les adversaires.
 */
export function GameNameField({ username, gameName, onSave, disabled }: GameNameFieldProps) {
  const [value, setValue] = useState(gameName ?? '');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const savedRef = useRef(gameName ?? '');

  // Suit la valeur du serveur (connexion, autre onglet…) sans écraser une saisie en cours
  useEffect(() => {
    const next = gameName ?? '';
    if (next !== savedRef.current) {
      savedRef.current = next;
      setValue(next);
    }
  }, [gameName]);

  useEffect(() => {
    if (status !== 'saved') return;
    const timer = window.setTimeout(() => setStatus('idle'), 1800);
    return () => window.clearTimeout(timer);
  }, [status]);

  const commit = async (raw: string) => {
    const clean = raw.replace(/\s+/g, ' ').trim();
    // Identique au pseudo du compte : inutile de le stocker comme nom personnalisé
    const target = clean === username ? '' : clean;
    if (target !== raw) setValue(target);
    if (target === savedRef.current) {
      setError(null);
      return;
    }
    setStatus('saving');
    setError(null);
    const result = await onSave(target);
    if (result.ok) {
      savedRef.current = target;
      setStatus('saved');
    } else {
      setStatus('error');
      setError(result.error ?? 'Impossible d’enregistrer ce nom.');
    }
  };

  const isCustom = value.trim().length > 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label
          htmlFor="play-game-name-input"
          className="block text-xs font-semibold"
          style={{ color: 'var(--text-secondary)' }}
        >
          Nom en partie
        </label>
        <AnimatePresence mode="wait" initial={false}>
          {status === 'saved' ? (
            <motion.span
              key="saved"
              role="status"
              className="inline-flex items-center gap-1 text-[11px] font-semibold"
              style={{ color: 'var(--x-color)' }}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Check className="h-3 w-3" strokeWidth={2.5} />
              Enregistré
            </motion.span>
          ) : isCustom ? (
            <motion.button
              key="reset"
              id="play-game-name-reset"
              type="button"
              disabled={disabled || status === 'saving'}
              onClick={() => void commit('')}
              className="inline-flex items-center gap-1 rounded text-[11px] font-semibold transition-opacity hover:opacity-70 disabled:opacity-40"
              style={{ color: 'var(--text-muted)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <RotateCcw className="h-3 w-3" />
              Revenir à {username}
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>
      <input
        id="play-game-name-input"
        type="text"
        maxLength={20}
        autoComplete="off"
        spellCheck={false}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          setValue(e.target.value);
          if (status === 'error') {
            setStatus('idle');
            setError(null);
          }
        }}
        onBlur={(e) => void commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        placeholder={username}
        aria-describedby="play-game-name-hint"
        aria-invalid={status === 'error'}
        className="tactile-input w-full rounded-[10px] px-3 py-2 text-sm font-medium disabled:opacity-60"
        style={{
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-primary)',
          border: `1px solid ${status === 'error' ? 'var(--danger-color)' : 'var(--border-main)'}`,
        }}
      />
      <p
        id="play-game-name-hint"
        className="mt-1 text-[11px] leading-snug"
        style={{ color: error ? 'var(--danger-color)' : 'var(--text-muted)' }}
      >
        {error ??
          (isCustom
            ? `Tes adversaires verront ce nom. Ton compte reste ${username}.`
            : `Facultatif : laisse vide pour jouer sous ${username}.`)}
      </p>
    </div>
  );
}
