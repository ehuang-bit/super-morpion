export type ThemeId =
  | 'atelier'
  | 'argile'
  | 'bordeaux'
  | 'travertin'
  | 'kyoto'
  | 'nocturne'
  | 'emeraude'
  | 'obsidienne';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description: string;
  swatches: {
    canvas: string;
    x: string;
    o: string;
    active: string;
  };
}

export const THEMES: readonly ThemeMeta[] = [
  {
    id: 'atelier',
    label: 'Atelier',
    description: 'Lin chaud, forêt et cacao',
    swatches: {
      canvas: '#F4EFE6',
      x: '#1D5B42',
      o: '#6F452E',
      active: '#C88A2E',
    },
  },
  {
    id: 'argile',
    label: 'Argile & Ardoise',
    description: 'Pierre claire, ardoise et terracotta',
    swatches: {
      canvas: '#EFECE6',
      x: '#264653',
      o: '#C85A38',
      active: '#D99B26',
    },
  },
  {
    id: 'bordeaux',
    label: 'Bordeaux & Craie',
    description: 'Albâtre, lie-de-vin et bleu de Prusse',
    swatches: {
      canvas: '#F5F1EB',
      x: '#6E2233',
      o: '#2B4958',
      active: '#B38136',
    },
  },
  {
    id: 'travertin',
    label: 'Sauge & Travertin',
    description: 'Calcaire clair, olive et figue fumée',
    swatches: {
      canvas: '#ECE8E0',
      x: '#32553E',
      o: '#6F3D4E',
      active: '#B5822C',
    },
  },
  {
    id: 'kyoto',
    label: 'Kyoto',
    description: 'Washi, indigo et cèdre',
    swatches: {
      canvas: '#F3EFE7',
      x: '#283B5B',
      o: '#A65E3A',
      active: '#C7513D',
    },
  },
  {
    id: 'nocturne',
    label: 'Nocturne',
    description: 'Charbon chaud, sauge et sable doré',
    swatches: {
      canvas: '#171614',
      x: '#63B995',
      o: '#D9B99B',
      active: '#D48C5E',
    },
  },
  {
    id: 'emeraude',
    label: 'Club Nuit',
    description: 'Ardoise nuit, menthe et laiton',
    swatches: {
      canvas: '#121716',
      x: '#54B88A',
      o: '#E0C38A',
      active: '#D1A24B',
    },
  },
  {
    id: 'obsidienne',
    label: 'Obsidienne & Or',
    description: 'Galerie sombre, acier glacier et champagne',
    swatches: {
      canvas: '#111214',
      x: '#7BB0CA',
      o: '#DFC080',
      active: '#D19A4B',
    },
  },
];

export function isValidThemeId(value: string | null): value is ThemeId {
  return (
    value === 'atelier' ||
    value === 'argile' ||
    value === 'bordeaux' ||
    value === 'travertin' ||
    value === 'kyoto' ||
    value === 'nocturne' ||
    value === 'emeraude' ||
    value === 'obsidienne'
  );
}

export interface ThemeTransitionOrigin {
  x: number;
  y: number;
}

const THEME_MORPH_MS = 460;
const THEME_HALO_MS = 540;

let morphTimer: number | null = null;
let activeHaloHost: HTMLElement | null = null;
let activeHaloAnim: Animation | null = null;

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) {
    return `rgba(200, 138, 46, ${alpha})`;
  }
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `rgba(200, 138, 46, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function cleanupActiveHalo(): void {
  if (activeHaloAnim) {
    try {
      activeHaloAnim.cancel();
    } catch {
      // Animation déjà terminée ou annulée
    }
    activeHaloAnim = null;
  }
  if (activeHaloHost) {
    activeHaloHost.remove();
    activeHaloHost = null;
  }
}

/**
 * Projette un léger halo d'encre diffus aux couleurs de la nouvelle palette
 * depuis le bouton cliqué, sans bord dur ni découpe de l'écran.
 */
function spawnInkHalo(theme: ThemeId, origin: ThemeTransitionOrigin): void {
  cleanupActiveHalo();

  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) {
    return;
  }

  const meta = THEMES.find((item) => item.id === theme) ?? THEMES[0];
  const x = Math.max(0, Math.min(window.innerWidth, origin.x));
  const y = Math.max(0, Math.min(window.innerHeight, origin.y));
  const maxRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
  const radius = Math.max(220, maxRadius * 0.85);
  const diameter = radius * 2;

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('data-theme-halo', 'true');
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '9998';
  host.style.pointerEvents = 'none';
  host.style.overflow = 'hidden';
  host.style.transition = 'none';

  const wash = document.createElement('div');
  wash.style.position = 'absolute';
  wash.style.left = `${x - radius}px`;
  wash.style.top = `${y - radius}px`;
  wash.style.width = `${diameter}px`;
  wash.style.height = `${diameter}px`;
  wash.style.borderRadius = '50%';
  wash.style.transformOrigin = 'center center';
  wash.style.willChange = 'transform, opacity';
  wash.style.transition = 'none';
  wash.style.background = `radial-gradient(circle, ${hexToRgba(meta.swatches.active, 0.22)} 0%, ${hexToRgba(meta.swatches.x, 0.14)} 38%, ${hexToRgba(meta.swatches.x, 0.04)} 58%, transparent 72%)`;

  if (typeof wash.animate !== 'function') {
    return;
  }

  host.appendChild(wash);
  document.body.appendChild(host);
  activeHaloHost = host;

  const anim = wash.animate(
    [
      { transform: 'scale(0.08)', opacity: 0.9 },
      { transform: 'scale(1.6)', opacity: 0 },
    ],
    {
      duration: THEME_HALO_MS,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards',
    },
  );
  activeHaloAnim = anim;

  const finalize = () => {
    if (activeHaloAnim === anim) {
      activeHaloAnim = null;
    }
    if (activeHaloHost === host) {
      activeHaloHost = null;
    }
    host.remove();
  };

  anim.onfinish = finalize;
  anim.oncancel = finalize;
}

export function getOriginFromElement(el: HTMLElement | null | undefined): ThemeTransitionOrigin | undefined {
  if (!el || typeof window === 'undefined') return undefined;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return undefined;
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export function applyThemeToDocument(
  theme: ThemeId,
  origin?: ThemeTransitionOrigin,
  onSyncCommit?: () => void,
): void {
  const root = document.documentElement;
  const reduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Chargement initial ou animations réduites : changement immédiat sans transition ni halo
  if (!origin || reduced) {
    if (morphTimer !== null) {
      window.clearTimeout(morphTimer);
      morphTimer = null;
    }
    root.classList.remove('theme-morphing');
    cleanupActiveHalo();
    root.classList.add('no-transitions');
    root.setAttribute('data-theme', theme);
    onSyncCommit?.();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('no-transitions');
      });
    });
    return;
  }

  // Fondu synchronisé de toutes les surfaces + halo d'encre pictural depuis le bouton
  if (morphTimer !== null) {
    window.clearTimeout(morphTimer);
    morphTimer = null;
  }
  root.classList.remove('no-transitions');
  root.classList.add('theme-morphing');
  root.setAttribute('data-theme', theme);
  onSyncCommit?.();
  spawnInkHalo(theme, origin);

  morphTimer = window.setTimeout(() => {
    root.classList.remove('theme-morphing');
    morphTimer = null;
  }, THEME_MORPH_MS);
}
