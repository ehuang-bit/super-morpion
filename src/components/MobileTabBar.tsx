import { LayoutGroup, motion } from 'framer-motion';
import { BarChart3, Menu, Swords, Trophy, type LucideIcon } from 'lucide-react';
import { CHIP_SPRING } from '../utils/motion';
import type { NavTab } from './Sidebar';

interface MobileTabBarProps {
  activeTab: NavTab;
  menuOpen: boolean;
  onSelectTab: (tab: NavTab) => void;
  onOpenMenu: () => void;
}

const TABS: readonly { id: NavTab | 'menu'; label: string; icon: LucideIcon }[] = [
  { id: 'play', label: 'Jouer', icon: Swords },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'leaderboard', label: 'Classement', icon: Trophy },
  { id: 'menu', label: 'Menu', icon: Menu },
];

/**
 * Barre d'onglets fixée en bas de l'écran sur téléphone et tablette.
 * Elle tient compte de la barre d'accueil du téléphone (zone sûre).
 */
export function MobileTabBar({ activeTab, menuOpen, onSelectTab, onOpenMenu }: MobileTabBarProps) {
  return (
    <nav
      aria-label="Navigation principale"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-4"
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
          const active = tab.id === 'menu' ? menuOpen : !menuOpen && activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => (tab.id === 'menu' ? onOpenMenu() : onSelectTab(tab.id))}
              aria-current={active && tab.id !== 'menu' ? 'page' : undefined}
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
                style={{ color: active ? 'var(--accent-active-text)' : 'var(--text-muted)' }}
              />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </LayoutGroup>
    </nav>
  );
}
