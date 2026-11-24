import { LayoutGroup, motion } from 'framer-motion';
import type { AuthUser } from '@shared/protocol';
import {
  BarChart3,
  BookOpen,
  Bot,
  Crown,
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
import { useI18n, type TranslationKey } from '../i18n';
import { CHIP_SPRING } from '../utils/motion';
import { BrandLogo } from './BrandLogo';
import { LanguageSelector } from './LanguageSelector';
import { StreakPill } from './StreakBadge';

export type NavTab =
  | 'play'
  | 'tournament'
  | 'bot'
  | 'daily'
  | 'stats'
  | 'leaderboard'
  | 'customize';

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
  inActiveTournament?: boolean;
}

type NavItemId = NavTab | 'rules';

const NAV_ITEMS: readonly {
  id: NavItemId;
  labelKey: TranslationKey;
  icon: LucideIcon;
}[] = [
  { id: 'play', labelKey: 'nav.play', icon: Swords },
  { id: 'tournament', labelKey: 'nav.tournament', icon: Crown },
  { id: 'bot', labelKey: 'nav.bot', icon: Bot },
  { id: 'daily', labelKey: 'nav.daily', icon: Target },
  { id: 'stats', labelKey: 'nav.stats', icon: BarChart3 },
  { id: 'leaderboard', labelKey: 'nav.leaderboard', icon: Trophy },
  { id: 'customize', labelKey: 'nav.customize', icon: Palette },
  { id: 'rules', labelKey: 'nav.rules', icon: BookOpen },
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
  inActiveTournament = false,
}: SidebarProps) {
  const { t } = useI18n();
  const displayName = user?.username || pseudo.trim() || t('nav.guest');
  const initial = displayName.charAt(0).toUpperCase() || 'J';

  return (
    <>
      {/* Desktop persistent left sidebar */}
      <aside
        aria-label="Sidebar"
        className="hidden lg:flex flex-col w-[236px] xl:w-[252px] shrink-0 h-[100dvh] sticky top-0"
        style={{
          backgroundColor: 'var(--bg-board)',
          borderInlineEnd: '1px solid var(--border-main)',
        }}
      >
        <LayoutGroup id="sidebar-desktop">
          <div className="flex flex-col justify-between h-full p-3.5 gap-3 select-none">
            {/* Top: Brand + Primary Navigation */}
            <div className="flex flex-col gap-3.5 min-h-0">
              <div className="flex items-center justify-between gap-2 px-1">
                <button
                  type="button"
                  onClick={() => onSelectTab('play')}
                  aria-label="Super Morpion"
                  className="flex items-center text-start group min-w-0"
                >
                  <BrandLogo variant="sidebar" connected={connected} />
                </button>
              </div>

              {/* Navigation links */}
              <nav className="flex flex-col gap-1" aria-label="Main navigation">
                {NAV_ITEMS.map((item) => {
                  const active = item.id !== 'rules' && activeTab === item.id;
                  const Icon = item.icon;
                  const showBadge =
                    (item.id === 'play' && inActiveMatch) ||
                    (item.id === 'tournament' && inActiveTournament);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.id === 'rules') onOpenRules();
                        else onSelectTab(item.id);
                      }}
                      aria-current={active ? 'page' : undefined}
                      className="tactile-btn relative w-full rounded-[10px] px-3 py-2 text-xs font-semibold flex items-center justify-between gap-2"
                      style={{
                        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      {active && (
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
                      <span className="relative inline-flex items-center gap-2.5 min-w-0">
                        <Icon
                          className="w-4 h-4 shrink-0"
                          style={{
                            color: active
                              ? 'var(--accent-active-text)'
                              : 'var(--text-muted)',
                          }}
                          strokeWidth={1.9}
                        />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </span>
                      {showBadge && (
                        <span
                          className="relative shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                          style={{
                            backgroundColor: 'var(--accent-active-bg)',
                            color: 'var(--accent-active-text)',
                          }}
                        >
                          {t('nav.inProgress')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Bottom: Account card + Language selector + Audio & Haptics */}
            <div className="flex flex-col gap-2">
              <div
                className="rounded-[12px] p-2.5 flex flex-col gap-2"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-main)',
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden"
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
                    {user?.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      initial
                    )}
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
                        {user ? t('nav.account') : t('nav.guest')}
                      </span>
                    </div>
                    {user?.email && (
                      <div
                        className="text-[10px] truncate mt-0.5"
                        style={{ color: 'var(--text-muted)' }}
                        title={user.email}
                      >
                        {user.email}
                      </div>
                    )}
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
                      <span>{t('nav.myProfile')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={onLogout}
                      title={t('nav.signOut')}
                      aria-label={t('nav.signOut')}
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
                    <span className="truncate">{t('nav.signIn')}</span>
                  </button>
                )}
              </div>

              {/* 11-Language Selector */}
              <LanguageSelector variant="sidebar" />

              {/* Sound & Haptics row */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={onToggleMute}
                  aria-label={muted ? t('nav.soundOff') : t('nav.soundOn')}
                  className="tactile-btn rounded-lg px-2 py-1.5 text-[11px] font-medium inline-flex items-center justify-center gap-1.5"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: muted ? 'var(--text-muted)' : 'var(--text-primary)',
                    border: '1px solid var(--border-cell)',
                  }}
                >
                  {muted ? (
                    <VolumeX className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">
                    {muted ? t('nav.soundOff') : t('nav.soundOn')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onToggleHaptics}
                  aria-pressed={hapticsEnabled}
                  className="tactile-btn rounded-lg px-2 py-1.5 text-[11px] font-medium inline-flex items-center justify-center gap-1.5"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: hapticsEnabled
                      ? 'var(--text-primary)'
                      : 'var(--text-muted)',
                    border: '1px solid var(--border-cell)',
                  }}
                >
                  <Vibrate className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {hapticsEnabled ? t('nav.hapticsOn') : t('nav.hapticsOff')}
                  </span>
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
          <LanguageSelector variant="header" />

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? t('nav.soundOff') : t('nav.soundOn')}
            aria-pressed={!muted}
            title={muted ? t('nav.soundOff') : t('nav.soundOn')}
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
            aria-label={t('nav.rules')}
            title={t('nav.rules')}
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
              <span className="max-w-[84px] truncate">{user.username}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
              }}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{t('nav.connect')}</span>
            </button>
          )}
        </div>
      </header>
    </>
  );
}
