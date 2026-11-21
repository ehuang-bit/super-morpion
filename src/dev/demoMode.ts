/**
 * Mode démo, réservé au développement.
 *
 * Activé par `?demo` dans l'adresse (mémorisé pour la session du navigateur,
 * désactivé par `?demo=off`). En production, `import.meta.env.DEV` vaut
 * `false` : `DEMO_MODE` est alors toujours faux et le faux serveur n'est
 * jamais chargé.
 */

const SESSION_KEY = 'sm_demo_mode';
const BOT_KEY = 'sm_demo_bot';

export type DemoBotMode = 'facile' | 'fort' | 'absent';

function readDemoFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('demo')) {
      const value = params.get('demo');
      if (value === 'off' || value === '0') {
        sessionStorage.removeItem(SESSION_KEY);
        return false;
      }
      sessionStorage.setItem(SESSION_KEY, '1');
      const bot = params.get('bot');
      if (bot === 'facile' || bot === 'fort' || bot === 'absent') {
        sessionStorage.setItem(BOT_KEY, bot);
      }
      return true;
    }
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export const DEMO_MODE: boolean = import.meta.env.DEV && readDemoFlag();

export function getInitialDemoBotMode(): DemoBotMode {
  try {
    const saved = sessionStorage.getItem(BOT_KEY);
    if (saved === 'facile' || saved === 'fort' || saved === 'absent') return saved;
  } catch {
    // Stockage indisponible : mode par défaut
  }
  return 'facile';
}

export function saveDemoBotMode(mode: DemoBotMode): void {
  try {
    sessionStorage.setItem(BOT_KEY, mode);
  } catch {
    // Sans importance en démo
  }
}
