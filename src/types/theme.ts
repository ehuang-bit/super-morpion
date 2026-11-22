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
    label: 'Craie & Outremer',
    description: 'Papier minéral, outremer, carmin et malachite',
    swatches: {
      canvas: '#F3F5F8',
      x: '#21458C',
      o: '#8C2D45',
      active: '#286452',
    },
  },
  {
    id: 'argile',
    label: 'Céladon & Encre',
    description: 'Porcelaine céladon, cyprès, aubergine et ardoise',
    swatches: {
      canvas: '#F1F4F2',
      x: '#2A6B5C',
      o: '#562444',
      active: '#2B5B82',
    },
  },
  {
    id: 'bordeaux',
    label: 'Bordeaux & Craie',
    description: 'Albâtre, lie-de-vin, bleu de Prusse et pin',
    swatches: {
      canvas: '#F5F2EE',
      x: '#7A2337',
      o: '#224C6B',
      active: '#29634D',
    },
  },
  {
    id: 'travertin',
    label: 'Sauge & Figue',
    description: 'Calcaire doux, pin profond, figue fumée et indigo',
    swatches: {
      canvas: '#EFEFEA',
      x: '#234C36',
      o: '#94435E',
      active: '#38528F',
    },
  },
  {
    id: 'kyoto',
    label: 'Washi & Glycine',
    description: 'Washi, glycine indigo, rouge beni et mousse',
    swatches: {
      canvas: '#F4F2EC',
      x: '#3D3B78',
      o: '#963438',
      active: '#396347',
    },
  },
  {
    id: 'nocturne',
    label: 'Ardoise & Glacier',
    description: 'Ardoise nuit, glacier, camélia poudré et écume',
    swatches: {
      canvas: '#14171D',
      x: '#6EA2D4',
      o: '#DE9AA5',
      active: '#70AA9C',
    },
  },
  {
    id: 'emeraude',
    label: 'Forêt & Perle',
    description: 'Pin sombre mat, sauge, quartz lilas et fjord',
    swatches: {
      canvas: '#121816',
      x: '#5F9A84',
      o: '#D9A7BF',
      active: '#7AA8CE',
    },
  },
  {
    id: 'obsidienne',
    label: 'Obsidienne & Jade',
    description: 'Obsidienne froide, pervenche, jade et carmin doux',
    swatches: {
      canvas: '#121216',
      x: '#8690D4',
      o: '#8AC4B4',
      active: '#D68696',
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

const THEME_MORPH_MS = 380;

let morphTimer: number | null = null;

export function getOriginFromElement(
  el: HTMLElement | null | undefined,
): ThemeTransitionOrigin | undefined {
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

  if (!origin || reduced) {
    if (morphTimer !== null) {
      window.clearTimeout(morphTimer);
      morphTimer = null;
    }
    root.classList.remove('theme-morphing');
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

  // Transition nette et uniforme des surfaces sans halo dégradé radial
  if (morphTimer !== null) {
    window.clearTimeout(morphTimer);
    morphTimer = null;
  }
  root.classList.remove('no-transitions');
  root.classList.add('theme-morphing');
  root.setAttribute('data-theme', theme);
  onSyncCommit?.();

  morphTimer = window.setTimeout(() => {
    root.classList.remove('theme-morphing');
    morphTimer = null;
  }, THEME_MORPH_MS);
}
