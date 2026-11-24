import { LayoutGroup, motion } from 'framer-motion';
import { Bot, Crown, Palette, Swords, Trophy, type LucideIcon } from 'lucide-react';
import { useI18n, type TranslationKey } from '../i18n';
import { CHIP_SPRING } from '../utils/motion';
import type { NavTab } from './Sidebar';

interface MobileTabBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

const TABS: readonly {
  id: NavTab;
  labelKey: TranslationKey;
  icon: LucideIcon;
}[] = [
  { id: 'play', labelKey: 'nav.mobilePlay', icon: Swords },
  { id: 'tournament', labelKey: 'nav.mobileTournament', icon: Crown },
  { id: 'bot', labelKey: 'nav.mobileBot', icon: Bot },
  { id: 'leaderboard', labelKey: 'nav.mobileLeaderboard', icon: Trophy },
  { id: 'customize', labelKey: 'nav.mobileCustomize', icon: Palette },
];

export function MobileTabBar({ activeTab, onSelectTab }: MobileTabBarProps) {
  const { t } = useI18n();
  return (
    <nav
      aria-label="Mobile navigation"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5"
      style={{
        backgroundColor: 'var(--bg-board)',
        borderTop: '1px solid var(--border-main)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <LayoutGroup id="mobile-tabbar">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              aria-current={active ? 'page' : undefined}
              className="tab-bar-btn relative flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] font-semibold"
              style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}
            >
              {active && (
                <motion.span
                  layoutId="tabbar-active"
                  transition={CHIP_SPRING}
                  aria-hidden="true"
                  className="absolute top-0 left-1/4 right-1/4 h-[3px] rounded-b-full"
                  style={{ backgroundColor: 'var(--accent-active)' }}
                />
              )}
              <Icon
                className="w-5 h-5"
                strokeWidth={active ? 2.1 : 1.8}
                style={{
                  color: active ? 'var(--accent-active-text)' : 'var(--text-muted)',
                }}
              />
              <span className="truncate max-w-full px-1">{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </LayoutGroup>
    </nav>
  );
}
