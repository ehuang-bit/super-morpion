import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  Mail,
  Sparkles,
  Trophy,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import {
  emailLinkEnabled,
  enabledSocialProviders,
  type SocialProvider,
} from '../auth/firebase';
import type { AuthController } from '../hooks/useAuth';
import { MODAL_TRANSITION, SMOOTH_EASE } from '../utils/motion';

interface AuthModalProps {
  open: boolean;
  auth: AuthController;
  defaultPseudo: string;
  onContinueAsGuest: (guestPseudo: string) => void;
  onClose: () => void;
  onSignedIn: () => void;
}

type View = 'main' | 'email' | 'email-sent' | 'email-confirm' | 'onboarding';

const PROVIDER_LABELS: Record<SocialProvider, string> = {
  google: 'Continuer avec Google',
  apple: 'Continuer avec Apple',
  microsoft: 'Continuer avec Microsoft',
};

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-[18px] h-[18px]" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true" fill="currentColor">
      <path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.75.73 1.05 1.6 2.24 2.73 2.2 1.1-.05 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.3-.88-2.32-3.5zM14.2 6.13c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.65-1.05 1.68-.92 2.67.97.08 1.96-.49 2.56-1.22z" />
    </svg>
  );
}

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-[16px] h-[16px]" aria-hidden="true">
      <rect x="2" y="2" width="9.5" height="9.5" fill="#F25022" />
      <rect x="12.5" y="2" width="9.5" height="9.5" fill="#7FBA00" />
      <rect x="2" y="12.5" width="9.5" height="9.5" fill="#00A4EF" />
      <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFB900" />
    </svg>
  );
}

const PROVIDER_LOGOS: Record<SocialProvider, () => JSX.Element> = {
  google: GoogleLogo,
  apple: AppleLogo,
  microsoft: MicrosoftLogo,
};

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-px flex-1" style={{ backgroundColor: 'var(--border-cell)' }} />
      <span className="text-[11px] font-medium shrink-0" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <div className="h-px flex-1" style={{ backgroundColor: 'var(--border-cell)' }} />
    </div>
  );
}

function ErrorBox({ message }: { message: string | null }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          key={message}
          role="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: SMOOTH_EASE }}
          className="overflow-hidden"
        >
          <div
            className="rounded-[10px] px-3 py-2 text-xs font-medium"
            style={{
              backgroundColor: 'var(--danger-bg)',
              color: 'var(--danger-color)',
              border: '1px solid var(--danger-color)',
            }}
          >
            {message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function inputStyle() {
  return {
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-main)',
  } as const;
}

export function AuthModal({
  open,
  auth,
  defaultPseudo,
  onContinueAsGuest,
  onClose,
  onSignedIn,
}: AuthModalProps) {
  const hasExternal = enabledSocialProviders.length > 0 || emailLinkEnabled;
  const [view, setView] = useState<View>('main');
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [showPasswordForm, setShowPasswordForm] = useState(!hasExternal);
  const [username, setUsername] = useState(defaultPseudo || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [guestName, setGuestName] = useState(defaultPseudo || '');
  const [email, setEmail] = useState('');
  const [chosenName, setChosenName] = useState('');
  const [busyProvider, setBusyProvider] = useState<SocialProvider | null>(null);

  // Vue imposée par l'état d'authentification
  useEffect(() => {
    if (auth.onboarding) {
      setChosenName(auth.onboarding.suggestedUsername);
      setView('onboarding');
    } else if (auth.magicLinkNeedsEmail) {
      setView('email-confirm');
    } else if (auth.magicLinkSentTo) {
      setView('email-sent');
    }
  }, [auth.onboarding, auth.magicLinkNeedsEmail, auth.magicLinkSentTo]);

  useEffect(() => {
    if (open && !auth.onboarding && !auth.magicLinkNeedsEmail && !auth.magicLinkSentTo) {
      setView('main');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (defaultPseudo) {
      setUsername((prev) => prev || defaultPseudo);
      setGuestName((prev) => prev || defaultPseudo);
    }
  }, [defaultPseudo]);

  const blockingView = view === 'onboarding';

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !blockingView) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, blockingView]);

  const switchView = (next: View) => {
    auth.clearError();
    setView(next);
  };

  const handleSocial = async (provider: SocialProvider) => {
    setBusyProvider(provider);
    const res = await auth.signInSocial(provider);
    setBusyProvider(null);
    if (res.ok && !res.isNew) onSignedIn();
  };

  const handleAccountSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    if (!cleanUser || !password) return;
    const res =
      mode === 'login'
        ? await auth.login(cleanUser, password)
        : await auth.register(cleanUser, password);
    if (res.ok) {
      setPassword('');
      onSignedIn();
    }
  };

  const handleSendLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) return;
    await auth.sendEmailLink(email);
  };

  const handleConfirmLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) return;
    const res = await auth.completeEmailLink(email);
    if (res.ok && !res.isNew) onSignedIn();
  };

  const handleOnboardingSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = chosenName.trim();
    if (clean.length < 3) return;
    if (auth.onboarding && clean !== auth.onboarding.suggestedUsername) {
      const ok = await auth.changeUsername(clean);
      if (!ok) return;
    }
    auth.finishOnboarding();
    onSignedIn();
  };

  const handleGuestClick = () => {
    onContinueAsGuest(guestName.trim() || defaultPseudo.trim() || 'Invité');
  };

  const renderHeader = (title: string, subtitle: ReactNode, back?: View) => (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2 min-w-0">
        {back && (
          <button
            type="button"
            onClick={() => switchView(back)}
            aria-label="Retour"
            className="tactile-btn mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-main)',
            }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="min-w-0">
          <h2
            id="auth-modal-title"
            className="text-lg sm:text-xl font-bold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {subtitle}
          </p>
        </div>
      </div>
      {!blockingView && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="tactile-btn inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-main)',
          }}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  const renderMain = () => (
    <>
      {renderHeader(
        'Entrer dans l’arène',
        'Un compte garde ton classement, ton historique et ta place au classement général.',
      )}

      <ul className="flex flex-wrap gap-1.5" aria-label="Avantages du compte">
        {[
          { icon: Trophy, label: 'Classement général' },
          { icon: Sparkles, label: 'Elo sauvegardé' },
          { icon: Check, label: 'Tous tes appareils' },
        ].map(({ icon: Icon, label }) => (
          <li
            key={label}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{
              backgroundColor: 'var(--accent-active-bg)',
              color: 'var(--accent-active-text)',
            }}
          >
            <Icon className="w-3 h-3" strokeWidth={2.2} />
            {label}
          </li>
        ))}
      </ul>

      {hasExternal && (
        <div className="flex flex-col gap-2">
          {enabledSocialProviders.map((provider) => {
            const Logo = PROVIDER_LOGOS[provider];
            const isApple = provider === 'apple';
            return (
              <motion.button
                key={provider}
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => void handleSocial(provider)}
                disabled={auth.loading}
                className="w-full rounded-[11px] px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2.5 disabled:opacity-60"
                style={
                  isApple
                    ? { backgroundColor: '#000', color: '#fff', border: '1px solid #000' }
                    : {
                        backgroundColor: '#fff',
                        color: '#1f1f1f',
                        border: '1px solid #dadce0',
                      }
                }
              >
                <Logo />
                <span>
                  {busyProvider === provider ? 'Connexion…' : PROVIDER_LABELS[provider]}
                </span>
              </motion.button>
            );
          })}

          {emailLinkEnabled && (
            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => switchView('email')}
              className="w-full rounded-[11px] px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2.5"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-strong)',
              }}
            >
              <Mail className="w-4 h-4" />
              <span>Continuer avec un e-mail</span>
            </motion.button>
          )}
        </div>
      )}

      <ErrorBox message={view === 'main' ? auth.error : null} />

      {hasExternal && (
        <button
          type="button"
          onClick={() => setShowPasswordForm((v) => !v)}
          aria-expanded={showPasswordForm}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold self-center"
          style={{ color: 'var(--text-secondary)' }}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>Avec un pseudo et un mot de passe</span>
          <ChevronDown
            className="w-3.5 h-3.5 transition-transform duration-200"
            style={{ transform: showPasswordForm ? 'rotate(180deg)' : 'none' }}
          />
        </button>
      )}

      <AnimatePresence initial={false}>
        {showPasswordForm && (
          <motion.div
            key="password-form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.26, ease: SMOOTH_EASE }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 pt-0.5">
              <div
                className="grid grid-cols-2 gap-1 p-1 rounded-[10px]"
                style={{
                  backgroundColor: 'var(--bg-recessed)',
                  border: '1px solid var(--border-cell)',
                }}
              >
                {(['register', 'login'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      auth.clearError();
                    }}
                    className="relative rounded-[7px] py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                    style={{
                      color: mode === m ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {mode === m && (
                      <motion.span
                        layoutId="auth-mode-pill"
                        className="absolute inset-0 rounded-[7px]"
                        style={{
                          backgroundColor: 'var(--bg-board)',
                          boxShadow: 'var(--shadow-card)',
                        }}
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                    <span className="relative inline-flex items-center gap-1.5">
                      {m === 'login' ? (
                        <LogIn className="w-3.5 h-3.5" />
                      ) : (
                        <UserPlus className="w-3.5 h-3.5" />
                      )}
                      {m === 'login' ? 'Se connecter' : 'Créer un compte'}
                    </span>
                  </button>
                ))}
              </div>

              <form onSubmit={handleAccountSubmit} className="flex flex-col gap-2.5">
                <input
                  id="auth-username-input"
                  type="text"
                  maxLength={20}
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (auth.error) auth.clearError();
                  }}
                  placeholder="Pseudo (3 à 20 caractères)"
                  aria-label="Pseudo"
                  className="tactile-input w-full rounded-[10px] px-3.5 py-2 text-sm font-medium"
                  style={inputStyle()}
                />
                <div className="relative">
                  <input
                    id="auth-password-input"
                    type={showPassword ? 'text' : 'password'}
                    minLength={6}
                    maxLength={100}
                    required
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (auth.error) auth.clearError();
                    }}
                    placeholder="Mot de passe (6 caractères min.)"
                    aria-label="Mot de passe"
                    className="tactile-input w-full rounded-[10px] pl-3.5 pr-10 py-2 text-sm font-medium"
                    style={inputStyle()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={auth.loading || username.trim().length < 3 || password.length < 6}
                  className="tactile-btn w-full rounded-[10px] px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--btn-primary-bg)',
                    color: 'var(--btn-primary-text)',
                  }}
                >
                  {mode === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                  <span>
                    {auth.loading
                      ? 'Un instant…'
                      : mode === 'login'
                        ? 'Se connecter'
                        : 'Créer mon compte'}
                  </span>
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Divider label="ou jouer tout de suite" />

      <div className="flex items-center gap-2">
        <input
          type="text"
          maxLength={20}
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          placeholder="Pseudo invité"
          aria-label="Pseudo invité"
          className="tactile-input flex-1 min-w-0 rounded-[10px] px-3 py-2 text-sm font-medium"
          style={inputStyle()}
        />
        <button
          type="button"
          onClick={handleGuestClick}
          className="tactile-btn shrink-0 rounded-[10px] px-3.5 py-2 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5"
          style={{
            backgroundColor: 'var(--bg-recessed)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-strong)',
          }}
        >
          <User className="w-3.5 h-3.5" />
          <span>Invité</span>
        </button>
      </div>
      <p className="text-[11px] -mt-1.5" style={{ color: 'var(--text-muted)' }}>
        Ta progression invité sera transférée si tu crées un compte plus tard.
      </p>
    </>
  );

  const renderEmail = () => (
    <>
      {renderHeader(
        'Connexion par e-mail',
        'Gmail, iCloud, Outlook… On t’envoie un lien magique, sans mot de passe.',
        'main',
      )}
      <form onSubmit={handleSendLink} className="flex flex-col gap-2.5">
        <input
          type="email"
          required
          autoFocus
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (auth.error) auth.clearError();
          }}
          placeholder="ton.adresse@icloud.com"
          aria-label="Adresse e-mail"
          className="tactile-input w-full rounded-[10px] px-3.5 py-2.5 text-sm font-medium"
          style={inputStyle()}
        />
        <ErrorBox message={auth.error} />
        <button
          type="submit"
          disabled={auth.loading || !email.includes('@')}
          className="tactile-btn w-full rounded-[10px] px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
        >
          <Mail className="w-4 h-4" />
          <span>{auth.loading ? 'Envoi…' : 'Recevoir mon lien de connexion'}</span>
        </button>
      </form>
    </>
  );

  const renderEmailSent = () => (
    <>
      {renderHeader('Vérifie ta boîte mail', 'Le lien est valable une heure.', 'email')}
      <div
        className="rounded-[12px] p-4 flex items-start gap-3"
        style={{ backgroundColor: 'var(--accent-active-bg)', border: '1px solid var(--accent-active)' }}
      >
        <motion.div
          initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: 'var(--bg-board)', color: 'var(--accent-active-text)' }}
        >
          <Mail className="w-4 h-4" />
        </motion.div>
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
          Un lien a été envoyé à <strong>{auth.magicLinkSentTo}</strong>. Ouvre-le
          sur cet appareil pour entrer directement dans la partie. Pense à
          regarder dans les indésirables.
        </p>
      </div>
    </>
  );

  const renderEmailConfirm = () => (
    <>
      {renderHeader(
        'Confirme ton adresse',
        'Tu as ouvert le lien sur un autre appareil : saisis l’adresse utilisée.',
      )}
      <form onSubmit={handleConfirmLink} className="flex flex-col gap-2.5">
        <input
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ton.adresse@icloud.com"
          aria-label="Adresse e-mail"
          className="tactile-input w-full rounded-[10px] px-3.5 py-2.5 text-sm font-medium"
          style={inputStyle()}
        />
        <ErrorBox message={auth.error} />
        <button
          type="submit"
          disabled={auth.loading || !email.includes('@')}
          className="tactile-btn w-full rounded-[10px] px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
        >
          <LogIn className="w-4 h-4" />
          <span>{auth.loading ? 'Connexion…' : 'Me connecter'}</span>
        </button>
      </form>
    </>
  );

  const renderOnboarding = () => (
    <>
      {renderHeader(
        'Bienvenue dans l’arène',
        auth.onboarding?.mergedGuest
          ? 'Ta progression invité a été transférée. Choisis le pseudo affiché à tes adversaires.'
          : 'Choisis le pseudo affiché à tes adversaires et au classement.',
      )}
      <form onSubmit={handleOnboardingSubmit} className="flex flex-col gap-2.5">
        <input
          type="text"
          autoFocus
          maxLength={20}
          value={chosenName}
          onChange={(e) => {
            setChosenName(e.target.value);
            if (auth.error) auth.clearError();
          }}
          aria-label="Pseudo de joueur"
          className="tactile-input w-full rounded-[10px] px-3.5 py-2.5 text-base font-semibold"
          style={inputStyle()}
        />
        <ErrorBox message={auth.error} />
        <button
          type="submit"
          disabled={auth.loading || chosenName.trim().length < 3}
          className="tactile-btn w-full rounded-[10px] px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
        >
          <Sparkles className="w-4 h-4" />
          <span>{auth.loading ? 'Un instant…' : 'C’est parti'}</span>
        </button>
      </form>
    </>
  );

  const renderView = () => {
    switch (view) {
      case 'email':
        return renderEmail();
      case 'email-sent':
        return renderEmailSent();
      case 'email-confirm':
        return renderEmailConfirm();
      case 'onboarding':
        return renderOnboarding();
      default:
        return renderMain();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[3px]"
            onClick={blockingView ? undefined : onClose}
          />

          <motion.div
            layout
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={MODAL_TRANSITION}
            className="relative z-10 w-full sm:max-w-[420px] max-h-[92dvh] overflow-y-auto rounded-t-[20px] sm:rounded-[18px] p-5 sm:p-6"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-board)',
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.18, ease: SMOOTH_EASE }}
                className="flex flex-col gap-4"
              >
                {renderView()}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
