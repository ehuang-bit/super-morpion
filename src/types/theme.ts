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
    label: 'Lin & Acier',
    description: 'Lin chaud, bleu acier, terracotta douce et mousse',
    swatches: {
      canvas: '#EDEAE4',
      x: '#3D679A',
      o: '#B05634',
      active: '#4E7D3F',
    },
  },
  {
    id: 'argile',
    label: 'Sable & Cèdre',
    description: 'Sable doux, sarcelle ardoise, cèdre roux et olivier',
    swatches: {
      canvas: '#ECE7DE',
      x: '#366B70',
      o: '#A55C3D',
      active: '#547D42',
    },
  },
  {
    id: 'bordeaux',
    label: 'Crème & Velours',
    description: 'Crème chaude, bordeaux velours, pétrole et sauge',
    swatches: {
      canvas: '#EFEAE5',
      x: '#8A4252',
      o: '#3C667E',
      active: '#4A7A4C',
    },
  },
  {
    id: 'travertin',
    label: 'Pierre & Sauge',
    description: 'Pierre douce, pin mat, figue et vert mousse',
    swatches: {
      canvas: '#E9E8E2',
      x: '#3E6E52',
      o: '#8B4D5E',
      active: '#537C41',
    },
  },
  {
    id: 'kyoto',
    label: 'Papier & Sumi',
    description: 'Papier washi, indigo calme, argile rouge et matcha',
    swatches: {
      canvas: '#ECE9E1',
      x: '#425A8A',
      o: '#A85143',
      active: '#4F7B43',
    },
  },
  {
    id: 'nocturne',
    label: 'Anthracite & Brume',
    description: 'Anthracite chaud, bleu brume, pêche douce et mousse',
    swatches: {
      canvas: '#262421',
      x: '#82AAD4',
      o: '#E59E74',
      active: '#93B866',
    },
  },
  {
    id: 'emeraude',
    label: 'Noyer & Mousse',
    description: 'Bois noyer sombre, sauge douce, pêche et mousse',
    swatches: {
      canvas: '#24231F',
      x: '#87BBA2',
      o: '#E0A37E',
      active: '#94B968',
    },
  },
  {
    id: 'obsidienne',
    label: 'Charbon & Lin',
    description: 'Charbon doux, bleu lin, argile rosée et mousse',
    swatches: {
      canvas: '#222120',
      x: '#8BA7D1',
      o: '#DC968A',
      active: '#8EB668',
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
