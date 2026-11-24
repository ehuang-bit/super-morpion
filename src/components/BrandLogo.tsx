interface BrandLogoProps {
  variant?: 'sidebar' | 'compact';
  connected?: boolean;
}

/**
 * Emblème architectural 3×3 + logotype graphique « Super Morpion ».
 * Surfaces planes sans dégradés, entièrement calées sur les variables du thème.
 */
export function BrandLogo({
  variant = 'sidebar',
  connected = true,
}: BrandLogoProps) {
  const isCompact = variant === 'compact';

  return (
    <span className="inline-flex items-center gap-2.5 min-w-0 select-none">
      {/* Sceau 3×3 plat */}
      <span
        className={`relative shrink-0 inline-flex items-center justify-center transition-transform duration-200 group-hover:scale-[1.04] ${
          isCompact ? 'w-8 h-8' : 'w-10 h-10'
        }`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 40 40" className="w-full h-full overflow-visible">
          {/* Boîtier du sceau */}
          <rect
            x="1.5"
            y="1.5"
            width="37"
            height="37"
            rx="9"
            fill="var(--bg-surface)"
            stroke="var(--border-strong)"
            strokeWidth="1.4"
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
            rx="2"
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
            fill="var(--o-pion-fill, var(--o-surface))"
            stroke="var(--o-pion-rim, var(--o-color))"
            strokeWidth="2"
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

      {/* Logotype typographique */}
      <span className="min-w-0 flex flex-col items-start">
        <span className="flex items-center gap-1.5 leading-none" aria-hidden="true">
          <span
            className="text-[9px] font-bold uppercase tracking-[0.26em]"
            style={{ color: 'var(--accent-active-text)' }}
          >
            Super
          </span>
          <span
            className="inline-block h-[1.5px] rounded-full w-3.5"
            style={{
              backgroundColor: 'var(--accent-active)',
              opacity: 0.65,
            }}
          />
        </span>

        <span
          dir="ltr"
          className={`flex items-center font-extrabold tracking-[-0.03em] leading-none mt-0.5 ${
            isCompact ? 'text-[14px]' : 'text-[15.5px]'
          }`}
          style={{ color: 'var(--text-primary)' }}
          aria-hidden="true"
        >
          <span>M</span>
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
                fill="var(--o-pion-fill, var(--o-surface))"
                stroke="var(--o-pion-rim, var(--o-color))"
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
