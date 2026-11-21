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

interface ViewTransitionLike {
  ready: Promise<void>;
  finished: Promise<void>;
  skipTransition?: () => void;
}

type DocumentWithTransition = Document & {
  startViewTransition?: (callback: () => void) => ViewTransitionLike;
};

let activeTransition: ViewTransitionLike | null = null;
let fadeTimer: number | null = null;

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

  // Chargement initial ou animations réduites : changement immédiat sans transition
  if (!origin || reduced) {
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

  const doc = document as DocumentWithTransition;
  if (typeof doc.startViewTransition === 'function') {
    try {
      activeTransition?.skipTransition?.();
    } catch {
      // Transition déjà terminée
    }
    try {
      root.classList.remove('theme-fading');
      root.classList.add('theme-revealing');
      const transition = doc.startViewTransition(() => {
        root.setAttribute('data-theme', theme);
        onSyncCommit?.();
      });
      activeTransition = transition;
      const x = Math.max(0, Math.min(window.innerWidth, origin.x));
      const y = Math.max(0, Math.min(window.innerHeight, origin.y));
      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      );
      transition.ready
        .then(() => {
          root.animate(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${endRadius}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration: 560,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              pseudoElement: '::view-transition-new(root)',
            },
          );
        })
        .catch(() => {
          // Repli silencieux si le navigateur annule la transition
        });
      transition.finished
        .catch(() => {})
        .finally(() => {
          if (activeTransition === transition) {
            activeTransition = null;
          }
          root.classList.remove('theme-revealing');
        });
      return;
    } catch {
      root.classList.remove('theme-revealing');
    }
  }

  // Repli si View Transitions API indisponible : fondu doux des couleurs
  if (fadeTimer !== null) {
    window.clearTimeout(fadeTimer);
  }
  root.classList.add('theme-fading');
  root.setAttribute('data-theme', theme);
  onSyncCommit?.();
  fadeTimer = window.setTimeout(() => {
    root.classList.remove('theme-fading');
    fadeTimer = null;
  }, 420);
}
