import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff, LogIn, User, UserPlus, X } from 'lucide-react';
import { MODAL_TRANSITION } from '../utils/motion';

interface AuthModalProps {
  open: boolean;
  initialMode?: 'login' | 'register';
  defaultPseudo: string;
  loading: boolean;
  error: string | null;
  onClearError: () => void;
  onLogin: (username: string, password: string) => Promise<boolean>;
  onRegister: (username: string, password: string) => Promise<boolean>;
  onContinueAsGuest: (guestPseudo: string) => void;
  onClose: () => void;
}

export function AuthModal({
  open,
  initialMode = 'login',
  defaultPseudo,
  loading,
  error,
  onClearError,
  onLogin,
  onRegister,
  onContinueAsGuest,
  onClose,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [username, setUsername] = useState(defaultPseudo || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [guestName, setGuestName] = useState(defaultPseudo || '');

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      if (defaultPseudo && !username) {
        setUsername(defaultPseudo);
      }
      if (defaultPseudo && !guestName) {
        setGuestName(defaultPseudo);
      }
    }
  }, [open, initialMode, defaultPseudo, username, guestName]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const handleAccountSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    if (!cleanUser || !password) return;
    const ok =
      mode === 'login'
        ? await onLogin(cleanUser, password)
        : await onRegister(cleanUser, password);
    if (ok) {
      setPassword('');
    }
  };

  const handleGuestClick = () => {
    onContinueAsGuest(guestName.trim() || defaultPseudo.trim() || 'Invité');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
        >
          {/* Translucent backdrop so the ready-to-play board stays visible behind */}
          <div
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={MODAL_TRANSITION}
            className="relative z-10 w-full max-w-[420px] rounded-[16px] p-5 sm:p-6 flex flex-col gap-4"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-board)',
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="auth-modal-title"
                  className="text-lg font-bold tracking-tight"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Entrer dans l’arène
                </h2>
                <p
                  className="text-xs sm:text-sm mt-0.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Connectez votre compte pour conserver votre Elo et vos statistiques, ou jouez immédiatement en invité.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer et continuer en invité"
                className="tactile-btn inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-main)',
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Segmented Mode Switch: Connexion / Créer un compte */}
            <div
              className="grid grid-cols-2 gap-1 p-1 rounded-[10px]"
              style={{
                backgroundColor: 'var(--bg-recessed)',
                border: '1px solid var(--border-cell)',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  onClearError();
                }}
                className="tactile-btn rounded-[7px] py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                style={{
                  backgroundColor:
                    mode === 'login' ? 'var(--bg-board)' : 'transparent',
                  color:
                    mode === 'login'
                      ? 'var(--text-primary)'
                      : 'var(--text-secondary)',
                  boxShadow: mode === 'login' ? 'var(--shadow-card)' : 'none',
                }}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Se connecter</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  onClearError();
                }}
                className="tactile-btn rounded-[7px] py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                style={{
                  backgroundColor:
                    mode === 'register' ? 'var(--bg-board)' : 'transparent',
                  color:
                    mode === 'register'
                      ? 'var(--text-primary)'
                      : 'var(--text-secondary)',
                  boxShadow: mode === 'register' ? 'var(--shadow-card)' : 'none',
                }}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Créer un compte</span>
              </button>
            </div>

            {/* Account Form */}
            <form onSubmit={handleAccountSubmit} className="flex flex-col gap-3">
              <div>
                <label
                  htmlFor="auth-username-input"
                  className="block text-xs font-semibold mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Pseudo (3 à 20 caractères)
                </label>
                <input
                  id="auth-username-input"
                  type="text"
                  maxLength={20}
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (error) onClearError();
                  }}
                  placeholder="Ex. Camille"
                  className="tactile-input w-full rounded-[10px] px-3.5 py-2 text-sm font-medium"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-main)',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="auth-password-input"
                  className="block text-xs font-semibold mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Mot de passe (min. 6 caractères)
                </label>
                <div className="relative">
                  <input
                    id="auth-password-input"
                    type={showPassword ? 'text' : 'password'}
                    minLength={6}
                    maxLength={100}
                    required
                    autoComplete={
                      mode === 'login' ? 'current-password' : 'new-password'
                    }
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) onClearError();
                    }}
                    placeholder="••••••"
                    className="tactile-input w-full rounded-[10px] pl-3.5 pr-10 py-2 text-sm font-medium"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-main)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword
                        ? 'Masquer le mot de passe'
                        : 'Afficher le mot de passe'
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-[9px] px-3 py-2 text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--danger-bg)',
                    color: 'var(--danger-color)',
                    border: '1px solid var(--danger-color)',
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || username.trim().length < 3 || password.length < 6}
                className="tactile-btn w-full rounded-[10px] px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-text)',
                }}
              >
                {mode === 'login' ? (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>{loading ? 'Connexion…' : 'Se connecter'}</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>{loading ? 'Création…' : 'Créer mon compte'}</span>
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="relative flex items-center justify-center my-0.5">
              <div
                className="w-full border-t"
                style={{ borderColor: 'var(--border-cell)' }}
              />
              <span
                className="px-2.5 text-[11px] font-medium shrink-0"
                style={{
                  backgroundColor: 'var(--bg-board)',
                  color: 'var(--text-muted)',
                }}
              >
                ou accès immédiat
              </span>
              <div
                className="w-full border-t"
                style={{ borderColor: 'var(--border-cell)' }}
              />
            </div>

            {/* Guest quick entry */}
            <div
              className="rounded-[12px] p-3 flex flex-col gap-2.5"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-cell)',
              }}
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={20}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Pseudo invité (ex. Théo)"
                  aria-label="Pseudo invité"
                  className="tactile-input flex-1 min-w-0 rounded-[9px] px-3 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--bg-board)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-main)',
                  }}
                />
                <button
                  type="button"
                  onClick={handleGuestClick}
                  className="tactile-btn shrink-0 rounded-[9px] px-3.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5"
                  style={{
                    backgroundColor: 'var(--bg-recessed)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-strong)',
                  }}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Jouer en tant qu’invité</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
