import { useId } from 'react';

interface BrandLogoProps {
  variant?: 'sidebar' | 'compact';
  connected?: boolean;
}

/**
 * Emblème architectural 3×3 + logotype graphique « Super Morpion ».
 * Toutes les couleurs passent par les variables CSS du thème actif.
 */
export function BrandLogo({
  variant = 'sidebar',
  connected = true,
}: BrandLogoProps) {
  const uid = useId().replace(/:/g, '');
  const gradBg = `sm-bg-${uid}`;
  const gradLine = `sm-line-${uid}`;
  const isCompact = variant === 'compact';

  return (
    <span className="inline-flex items-center gap-2.5 min-w-0 select-none">
      {/* Sceau 3×3 biseauté */}
      <span
        className={`relative shrink-0 inline-flex items-center justify-center transition-transform duration-200 group-hover:scale-[1.06] group-hover:-rotate-2 ${
          isCompact ? 'w-8 h-8' : 'w-10 h-10'
        }`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 40 40" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id={gradBg} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--bg-board)" />
              <stop offset="100%" stopColor="var(--bg-recessed)" />
            </linearGradient>
            <linearGradient id={gradLine} x1="15%" y1="15%" x2="88%" y2="88%">
              <stop offset="0%" stopColor="var(--x-color)" />
              <stop offset="52%" stopColor="var(--accent-active)" />
              <stop offset="100%" stopColor="var(--o-color)" />
            </linearGradient>
          </defs>

          {/* Boîtier du sceau */}
          <rect
            x="1.5"
            y="1.5"
            width="37"
            height="37"
            rx="10"
            fill={`url(#${gradBg})`}
            stroke="var(--border-strong)"
            strokeWidth="1.4"
          />
          <rect
            x="3.8"
            y="3.8"
            width="32.4"
            height="32.4"
            rx="7.8"
            fill="none"
            stroke="var(--border-cell)"
            strokeWidth="0.9"
          />

          {/* Grille 3×3 gravée */}
          <path
            d="M15 7.5v25M25 7.5v25M7.5 15h25M7.5 25h25"
            stroke="var(--border-strong)"
            strokeWidth="1.15"
            strokeLinecap="round"
            opacity="0.72"
          />

          {/* Case cible active (en bas à droite) */}
          <rect
            x="26.2"
            y="26.2"
            width="7.4"
            height="7.4"
            rx="2.1"
            fill="var(--accent-active-bg)"
            stroke="var(--accent-active)"
            strokeWidth="1.45"
          />
          <path
            d="M29.9 28.1v3.8M28 30h3.8"
            stroke="var(--accent-active-text)"
            strokeWidth="1.3"
            strokeLinecap="round"
          />

          {/* Pièce X (en haut à gauche) */}
          <path
            d="M8.5 8.5l4.4 4.4M12.9 8.5l-4.4 4.4"
            stroke="var(--x-color)"
            strokeWidth="2.15"
            strokeLinecap="round"
          />

          {/* Pièce O (au centre) */}
          <circle
            cx="20"
            cy="20"
            r="2.9"
            fill="var(--o-surface)"
            stroke="var(--o-color)"
            strokeWidth="2"
          />

          {/* Trait diagonal d'alignement */}
          <path
            d="M7.5 7.5L32.8 32.8"
            stroke={`url(#${gradLine})`}
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeDasharray="2 3"
            opacity="0.65"
          />
        </svg>

        {isCompact && (
          <span
            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
            style={{
              backgroundColor: connected
                ? 'var(--x-color)'
                : 'var(--danger-color)',
              borderColor: 'var(--bg-board)',
            }}
          />
        )}
      </span>

      {/* Logotype typographique stylisé */}
      <span className="min-w-0 flex flex-col items-start">
        <span className="flex items-center gap-1.5 leading-none" aria-hidden="true">
          <span
            className="text-[9px] font-bold uppercase tracking-[0.26em]"
            style={{ color: 'var(--accent-active-text)' }}
          >
            Super
          </span>
          <span
            className="inline-block h-[1.5px] rounded-full w-4"
            style={{
              background:
                'linear-gradient(90deg, var(--accent-active), transparent)',
            }}
          />
        </span>

        <span
          className={`flex items-center font-extrabold tracking-[-0.03em] leading-none mt-0.5 ${
            isCompact ? 'text-[14px]' : 'text-[15.5px]'
          }`}
          style={{ color: 'var(--text-primary)' }}
          aria-hidden="true"
        >
          <span>M</span>
          {/* O stylisé en pièce de plateau */}
          <span
            className="relative inline-flex items-center justify-center mx-[0.5px]"
            style={{ width: isCompact ? 11 : 12, height: isCompact ? 11 : 12 }}
          >
            <svg viewBox="0 0 14 14" className="w-full h-full">
              <circle
                cx="7"
                cy="7"
                r="4.7"
                fill="var(--x-surface)"
                stroke="var(--x-color)"
                strokeWidth="2.3"
              />
              <circle cx="7" cy="7" r="1.4" fill="var(--accent-active)" />
            </svg>
          </span>
          <span>RPI</span>
          <span
            className="relative inline-flex items-center justify-center mx-[0.5px]"
            style={{ width: isCompact ? 11 : 12, height: isCompact ? 11 : 12 }}
          >
            <svg viewBox="0 0 14 14" className="w-full h-full">
              <circle
                cx="7"
                cy="7"
                r="4.7"
                fill="var(--o-surface)"
                stroke="var(--o-color)"
                strokeWidth="2.3"
              />
            </svg>
          </span>
          <span>N</span>
        </span>

        {!isCompact && (
          <span
            className="flex items-center gap-1.5 text-[10.5px] font-medium leading-tight mt-1"
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
        )}
      </span>
    </span>
  );
}
