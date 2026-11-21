import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatRating, type EloProfile } from '@shared/elo';
import type { AuthUser } from '@shared/protocol';
import {
  Award,
  BarChart3,
  BookOpen,
  LogIn,
  LogOut,
  Menu,
  SlidersHorizontal,
  Swords,
  Trophy,
  UserCheck,
  Vibrate,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { THEMES, type ThemeId } from '../types/theme';
import { SMOOTH_EASE } from '../utils/motion';

export type NavTab = 'play' | 'stats' | 'leaderboard';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenCustomize: () => void;
  onOpenRules: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  user: AuthUser | null;
  pseudo: string;
  playerElo: {
    profile: EloProfile;
    tier: string;
  };
  theme: ThemeId;
  onChangeTheme: (theme: ThemeId) => void;
  muted: boolean;
  onToggleMute: () => void;
  hapticsEnabled: boolean;
  onToggleHaptics: () => void;
  connected: boolean;
  inActiveMatch: boolean;
}

export function Sidebar({
  activeTab,
  onSelectTab,
  onOpenCustomize,
  onOpenRules,
  onOpenAuth,
  onLogout,
  user,
  pseudo,
  playerElo,
  theme,
  onChangeTheme,
  muted,
  onToggleMute,
  hapticsEnabled,
  onToggleHaptics,
  connected,
  inActiveMatch,
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const displayName = user?.username || pseudo.trim() || 'Invité';
  const initial = displayName.charAt(0).toUpperCase() || 'J';
  const ratingLabel = formatRating(playerElo.profile.rating, playerElo.profile.rd);

  // Signature quick swatches in sidebar (including the new sophisticated palettes)
  const featuredThemes = THEMES.filter((t) =>
    ['atelier', 'bordeaux', 'travertin', 'nocturne', 'obsidienne'].includes(t.id),
  );

  const renderSidebarBody = (closeMobile?: () => void) => (
    <div className="flex flex-col justify-between h-full p-3.5 gap-4 select-none">
      {/* Top: Brand + Primary Navigation */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2 px-1">
          <button
            type="button"
            onClick={() => {
              onSelectTab('play');
              closeMobile?.();
            }}
            className="flex items-center gap-2.5 text-left group"
          >
            <div
              className="w-9 h-9 rounded-[10px] p-1.5 shrink-0 transition-transform duration-150 group-hover:scale-[1.03]"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-main)',
              }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 32 32" className="w-full h-full">
                <path
                  d="M11 3v26M21 3v26M3 11h26M3 21h26"
                  stroke="var(--border-strong)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <path
                  d="M5.5 5.5l3.5 3.5M9 5.5l-3.5 3.5"
                  stroke="var(--x-color)"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                />
                <circle
                  cx="16"
                  cy="16"
                  r="2.4"
                  fill="none"
                  stroke="var(--o-color)"
                  strokeWidth="2.1"
                />
                <rect
                  x="22.5"
                  y="22.5"
                  width="6.5"
                  height="6.5"
                  rx="1.5"
                  fill="var(--accent-active-bg)"
                  stroke="var(--accent-active)"
                  strokeWidth="1.6"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <span
                className="block text-sm font-bold tracking-tight leading-tight truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                Super Morpion
              </span>
              <span
                className="flex items-center gap-1.5 text-[11px] leading-tight mt-0.5"
                style={{ color: 'var(--text-muted)' }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: connected
                      ? 'var(--x-color)'
                      : 'var(--danger-color)',
                  }}
                />
                <span>1v1 en ligne</span>
              </span>
            </div>
          </button>

          {closeMobile && (
            <button
              type="button"
              onClick={closeMobile}
              aria-label="Fermer le menu"
              className="tactile-btn inline-flex items-center justify-center w-8 h-8 rounded-lg"
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

        {/* Navigation links */}
        <nav className="flex flex-col gap-1" aria-label="Navigation principale">
          <button
            type="button"
            onClick={() => {
              onSelectTab('play');
              closeMobile?.();
            }}
            aria-current={activeTab === 'play' ? 'page' : undefined}
            className="tactile-btn w-full rounded-[10px] px-3 py-2.5 text-xs font-semibold flex items-center justify-between gap-2"
            style={{
              backgroundColor:
                activeTab === 'play' ? 'var(--bg-recessed)' : 'transparent',
              color:
                activeTab === 'play'
                  ? 'var(--text-primary)'
                  : 'var(--text-secondary)',
              border: `1px solid ${
                activeTab === 'play' ? 'var(--border-strong)' : 'transparent'
              }`,
            }}
          >
            <span className="inline-flex items-center gap-2.5">
              <Swords
                className="w-4 h-4 shrink-0"
                style={{
                  color:
                    activeTab === 'play'
                      ? 'var(--accent-active-text)'
                      : 'var(--text-muted)',
                }}
                strokeWidth={1.9}
              />
              <span>Plateau & Duel</span>
            </span>
            {inActiveMatch && (
              <span
                className="rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                style={{
                  backgroundColor: 'var(--accent-active-bg)',
                  color: 'var(--accent-active-text)',
                }}
              >
                En cours
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectTab('stats');
              closeMobile?.();
            }}
            aria-current={activeTab === 'stats' ? 'page' : undefined}
            className="tactile-btn w-full rounded-[10px] px-3 py-2.5 text-xs font-semibold flex items-center justify-between gap-2"
            style={{
              backgroundColor:
                activeTab === 'stats' ? 'var(--bg-recessed)' : 'transparent',
              color:
                activeTab === 'stats'
                  ? 'var(--text-primary)'
                  : 'var(--text-secondary)',
              border: `1px solid ${
                activeTab === 'stats' ? 'var(--border-strong)' : 'transparent'
              }`,
            }}
          >
            <span className="inline-flex items-center gap-2.5">
              <BarChart3
                className="w-4 h-4 shrink-0"
                style={{
                  color:
                    activeTab === 'stats'
                      ? 'var(--accent-active-text)'
                      : 'var(--text-muted)',
                }}
                strokeWidth={1.9}
              />
              <span>Mes statistiques</span>
            </span>
            <span
              className="font-mono text-[11px] tabular-nums"
              style={{ color: 'var(--text-muted)' }}
            >
              {ratingLabel}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectTab('leaderboard');
              closeMobile?.();
            }}
            aria-current={activeTab === 'leaderboard' ? 'page' : undefined}
            className="tactile-btn w-full rounded-[10px] px-3 py-2.5 text-xs font-semibold flex items-center justify-between gap-2"
            style={{
              backgroundColor:
                activeTab === 'leaderboard' ? 'var(--bg-recessed)' : 'transparent',
              color:
                activeTab === 'leaderboard'
                  ? 'var(--text-primary)'
                  : 'var(--text-secondary)',
              border: `1px solid ${
                activeTab === 'leaderboard' ? 'var(--border-strong)' : 'transparent'
              }`,
            }}
          >
            <span className="inline-flex items-center gap-2.5">
              <Trophy
                className="w-4 h-4 shrink-0"
                style={{
                  color:
                    activeTab === 'leaderboard'
                      ? 'var(--accent-active-text)'
                      : 'var(--text-muted)',
                }}
                strokeWidth={1.9}
              />
              <span>Classement général</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenCustomize();
              closeMobile?.();
            }}
            className="tactile-btn w-full rounded-[10px] px-3 py-2.5 text-xs font-semibold flex items-center justify-between gap-2"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid transparent',
            }}
          >
            <span className="inline-flex items-center gap-2.5">
              <SlidersHorizontal
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--text-muted)' }}
                strokeWidth={1.85}
              />
              <span>Personnaliser le plateau</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenRules();
              closeMobile?.();
            }}
            className="tactile-btn w-full rounded-[10px] px-3 py-2.5 text-xs font-semibold flex items-center justify-between gap-2"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid transparent',
            }}
          >
            <span className="inline-flex items-center gap-2.5">
              <BookOpen
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--text-muted)' }}
                strokeWidth={1.85}
              />
              <span>Règles en 15s</span>
            </span>
          </button>
        </nav>

        {/* Quick Sophisticated Palettes Section */}
        <div
          className="rounded-[12px] p-2.5 flex flex-col gap-2"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-cell)',
          }}
        >
          <div className="flex items-center justify-between">
            <span
              className="text-[11px] font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              Couleurs du plateau
            </span>
            <button
              type="button"
              onClick={() => {
                onOpenCustomize();
                closeMobile?.();
              }}
              className="text-[10px] font-semibold hover:underline"
              style={{ color: 'var(--accent-active-text)' }}
            >
              8 thèmes →
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {featuredThemes.map((item) => {
              const active = item.id === theme;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeTheme(item.id)}
                  title={`${item.label} — ${item.description}`}
                  aria-label={`Thème ${item.label}`}
                  aria-pressed={active}
                  className="tactile-btn rounded-lg py-1.5 flex items-center justify-center"
                  style={{
                    backgroundColor: active
                      ? 'var(--bg-board)'
                      : 'var(--bg-recessed)',
                    border: `1.5px solid ${
                      active ? 'var(--accent-active)' : 'var(--border-cell)'
                    }`,
                  }}
                >
                  <span className="inline-flex items-center -space-x-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/20"
                      style={{ backgroundColor: item.swatches.canvas }}
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/20"
                      style={{ backgroundColor: item.swatches.x }}
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/20"
                      style={{ backgroundColor: item.swatches.o }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom: Account / Guest card + Audio & Haptics controls */}
      <div className="flex flex-col gap-2.5">
        <div
          className="rounded-[12px] p-3 flex flex-col gap-2.5"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-main)',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0"
              style={{
                backgroundColor: user
                  ? 'var(--x-surface)'
                  : 'var(--bg-recessed)',
                color: user ? 'var(--x-color)' : 'var(--text-primary)',
                border: `1px solid ${
                  user ? 'var(--x-color)' : 'var(--border-strong)'
                }`,
              }}
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  className="text-xs font-bold truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {displayName}
                </span>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                  style={{
                    backgroundColor: user
                      ? 'var(--x-surface)'
                      : 'var(--bg-recessed)',
                    color: user ? 'var(--x-color)' : 'var(--text-muted)',
                  }}
                >
                  {user ? 'Compte' : 'Invité'}
                </span>
              </div>
              <div
                className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums mt-0.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Award
                  className="w-3 h-3 shrink-0"
                  style={{ color: 'var(--accent-active-text)' }}
                />
                <span className="font-semibold">{ratingLabel}</span>
                <span>·</span>
                <span className="font-sans truncate">{playerElo.tier}</span>
              </div>
            </div>
          </div>

          {user ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onSelectTab('stats');
                  closeMobile?.();
                }}
                className="tactile-btn flex-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold inline-flex items-center justify-center gap-1.5"
                style={{
                  backgroundColor: 'var(--bg-board)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-cell)',
                }}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Mon profil</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  closeMobile?.();
                }}
                title="Se déconnecter"
                aria-label="Se déconnecter"
                className="tactile-btn rounded-lg px-2.5 py-1.5 text-[11px] font-semibold inline-flex items-center justify-center gap-1"
                style={{
                  backgroundColor: 'var(--bg-board)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-cell)',
                }}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                onOpenAuth();
                closeMobile?.();
              }}
              className="tactile-btn w-full rounded-lg px-3 py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
              }}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Se connecter / S’inscrire</span>
            </button>
          )}
        </div>

        {/* Sound & Haptics row */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Activer le son' : 'Couper le son'}
            className="tactile-btn rounded-lg px-2.5 py-1.5 text-[11px] font-medium inline-flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: muted ? 'var(--text-muted)' : 'var(--text-primary)',
              border: '1px solid var(--border-cell)',
            }}
          >
            {muted ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
            <span>{muted ? 'Son coupé' : 'Son actif'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleHaptics}
            aria-pressed={hapticsEnabled}
            className="tactile-btn rounded-lg px-2.5 py-1.5 text-[11px] font-medium inline-flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: hapticsEnabled
                ? 'var(--text-primary)'
                : 'var(--text-muted)',
              border: '1px solid var(--border-cell)',
            }}
          >
            <Vibrate className="w-3.5 h-3.5" />
            <span>{hapticsEnabled ? 'Haptique' : 'Silencieux'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop persistent left sidebar */}
      <aside
        aria-label="Barre latérale"
        className="hidden lg:flex flex-col w-[236px] xl:w-[252px] shrink-0 h-[100dvh] sticky top-0"
        style={{
          backgroundColor: 'var(--bg-board)',
          borderRight: '1px solid var(--border-main)',
        }}
      >
        {renderSidebarBody()}
      </aside>

      {/* Mobile & Tablet top header */}
      <header
        className="lg:hidden w-full h-12 px-3 flex items-center justify-between gap-2 shrink-0"
        style={{
          backgroundColor: 'var(--bg-board)',
          borderBottom: '1px solid var(--border-main)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu de navigation"
            className="tactile-btn inline-flex items-center justify-center w-8 h-8 rounded-lg"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-main)',
            }}
          >
            <Menu className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('play')}
            className="text-sm font-bold tracking-tight truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            Super Morpion
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() =>
              onSelectTab(activeTab === 'leaderboard' ? 'play' : 'leaderboard')
            }
            aria-label="Classement général"
            className="tactile-btn inline-flex items-center justify-center w-8 h-8 rounded-lg"
            style={{
              backgroundColor:
                activeTab === 'leaderboard'
                  ? 'var(--accent-active-bg)'
                  : 'var(--bg-surface)',
              color:
                activeTab === 'leaderboard'
                  ? 'var(--accent-active-text)'
                  : 'var(--text-primary)',
              border: `1px solid ${
                activeTab === 'leaderboard'
                  ? 'var(--accent-active)'
                  : 'var(--border-cell)'
              }`,
            }}
          >
            <Trophy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onSelectTab(activeTab === 'stats' ? 'play' : 'stats')}
            className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold"
            style={{
              backgroundColor:
                activeTab === 'stats'
                  ? 'var(--accent-active-bg)'
                  : 'var(--bg-surface)',
              color:
                activeTab === 'stats'
                  ? 'var(--accent-active-text)'
                  : 'var(--text-primary)',
              border: `1px solid ${
                activeTab === 'stats'
                  ? 'var(--accent-active)'
                  : 'var(--border-cell)'
              }`,
            }}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span className="font-mono tabular-nums">{ratingLabel}</span>
          </button>

          {user ? (
            <button
              type="button"
              onClick={() => onSelectTab('stats')}
              className="tactile-btn inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--x-surface)',
                color: 'var(--x-color)',
                border: '1px solid var(--x-color)',
              }}
            >
              <span className="max-w-[84px] truncate">{user.username}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="tactile-btn inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
              }}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Connexion</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile slide-over drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="lg:hidden fixed inset-0 z-50 flex"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div
              className="absolute inset-0 bg-black/45"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ duration: 0.24, ease: SMOOTH_EASE }}
              className="relative z-10 w-[264px] max-w-[84vw] h-full"
              style={{
                backgroundColor: 'var(--bg-board)',
                borderRight: '1px solid var(--border-main)',
                boxShadow: 'var(--shadow-board)',
              }}
            >
              {renderSidebarBody(() => setMobileOpen(false))}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
