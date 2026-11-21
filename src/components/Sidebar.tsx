import { LayoutGroup, motion } from 'framer-motion';
import type { AuthUser } from '@shared/protocol';
import { BrandLogo } from './BrandLogo';
import {
  BarChart3,
  BookOpen,
  LogIn,
  LogOut,
  Palette,
  Swords,
  Target,
  Trophy,
  UserCheck,
  Vibrate,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import { CHIP_SPRING } from '../utils/motion';
import { StreakPill } from './StreakBadge';

export type NavTab = 'play' | 'daily' | 'stats' | 'leaderboard' | 'customize';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenRules: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  user: AuthUser | null;
  pseudo: string;
  muted: boolean;
  onToggleMute: () => void;
  hapticsEnabled: boolean;
  onToggleHaptics: () => void;
  connected: boolean;
  inActiveMatch: boolean;
}

type NavItemId = NavTab | 'rules';

const NAV_ITEMS: readonly { id: NavItemId; label: string; icon: LucideIcon }[] = [
  { id: 'play', label: 'Plateau & Duel', icon: Swords },
  { id: 'daily', label: 'Défi du jour', icon: Target },
  { id: 'stats', label: 'Mes statistiques', icon: BarChart3 },
  { id: 'leaderboard', label: 'Classement général', icon: Trophy },
  { id: 'customize', label: 'Couleurs & plateau', icon: Palette },
  { id: 'rules', label: 'Règles en 15s', icon: BookOpen },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  onOpenRules,
  onOpenAuth,
  onLogout,
  user,
  pseudo,
  muted,
  onToggleMute,
  hapticsEnabled,
  onToggleHaptics,
  connected,
  inActiveMatch,
}: SidebarProps) {
  const displayName = user?.username || pseudo.trim() || 'Invité';
  const initial = displayName.charAt(0).toUpperCase() || 'J';

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
        <LayoutGroup id="sidebar-desktop">
          <div className="flex flex-col justify-between h-full p-3.5 gap-4 select-none">
            {/* Top: Brand + Primary Navigation */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2 px-1">
                <button
                  type="button"
                  onClick={() => onSelectTab('play')}
                  aria-label="Super Morpion"
                  className="flex items-center text-left group min-w-0"
                >
                  <BrandLogo variant="sidebar" connected={connected} />
                </button>
              </div>

              {/* Navigation links */}
              <nav className="flex flex-col gap-1" aria-label="Navigation principale">
                {NAV_ITEMS.map((item) => {
                  const active = item.id !== 'rules' && activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.id === 'rules') onOpenRules();
                        else onSelectTab(item.id);
                      }}
                      aria-current={active ? 'page' : undefined}
                      className="tactile-btn relative w-full rounded-[10px] px-3 py-2.5 text-xs font-semibold flex items-center justify-between gap-2"
                      style={{
                        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      {active && (
                        // Fond de l'onglet actif : glisse d'une entrée à l'autre
                        <motion.span
                          layoutId="nav-active"
                          transition={CHIP_SPRING}
                          aria-hidden="true"
                          className="absolute inset-0 rounded-[10px]"
                          style={{
                            backgroundColor: 'var(--bg-recessed)',
                            border: '1px solid var(--border-strong)',
                          }}
                        />
                      )}
                      <span className="relative inline-flex items-center gap-2.5">
                        <Icon
                          className="w-4 h-4 shrink-0"
                          style={{
                            color: active ? 'var(--accent-active-text)' : 'var(--text-muted)',
                          }}
                          strokeWidth={1.9}
                        />
                        <span>{item.label}</span>
                      </span>
                      {item.id === 'play' && inActiveMatch && (
                        <span
                          className="relative rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                          style={{
                            backgroundColor: 'var(--accent-active-bg)',
                            color: 'var(--accent-active-text)',
                          }}
                        >
                          En cours
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
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
                    {user?.streak && (
                      <div className="mt-1">
                        <StreakPill
                          streak={user.streak}
                          size="xs"
                          showLabel
                          onClick={() => onSelectTab('stats')}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {user ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectTab('stats')}
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
                      onClick={onLogout}
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
                    onClick={onOpenAuth}
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
        </LayoutGroup>
      </aside>

      {/* Mobile & Tablet top header */}
      <header
        className="lg:hidden w-full px-3 flex items-center justify-between gap-2 shrink-0"
        style={{
          backgroundColor: 'var(--bg-board)',
          borderBottom: '1px solid var(--border-main)',
          paddingTop: 'env(safe-area-inset-top)',
          minHeight: 'calc(3.25rem + env(safe-area-inset-top))',
        }}
      >
        <button
          type="button"
          onClick={() => onSelectTab('play')}
          aria-label="Super Morpion"
          className="inline-flex items-center min-h-[44px] py-1.5 group min-w-0"
        >
          <BrandLogo variant="compact" connected={connected} />
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Activer le son' : 'Couper le son'}
            aria-pressed={!muted}
            title={muted ? 'Activer le son' : 'Couper le son'}
            className="tactile-btn inline-flex items-center justify-center w-10 h-10 rounded-lg"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: muted ? 'var(--text-muted)' : 'var(--text-primary)',
              border: '1px solid var(--border-main)',
            }}
          >
            {muted ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenRules}
            aria-label="Règles du jeu"
            title="Règles du jeu"
            className="tactile-btn inline-flex items-center justify-center w-10 h-10 rounded-lg"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-main)',
            }}
          >
            <BookOpen className="w-4 h-4" />
          </button>

          {user?.streak && (
            <StreakPill
              streak={user.streak}
              size="xs"
              onClick={() => onSelectTab('stats')}
            />
          )}

          {user ? (
            <button
              type="button"
              onClick={() => onSelectTab('stats')}
              className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--x-surface)',
                color: 'var(--x-color)',
                border: '1px solid var(--x-color)',
              }}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span className="max-w-[96px] truncate">{user.username}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
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
    </>
  );
}
