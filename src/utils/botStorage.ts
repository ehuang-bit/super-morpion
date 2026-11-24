import {
  BOT_MAX_LEVEL,
  BOT_MIN_LEVEL,
  calibrateBotLevelFromElo,
  clampBotLevel,
  createInitialBotProgress,
  type BotProgressState,
} from '@shared/botEngine';

const BOT_STORAGE_PREFIX = 'sm_bot_progress_v1_';

function storageKey(scopeId: string): string {
  const safe = scopeId.trim().slice(0, 64) || 'guest';
  return `${BOT_STORAGE_PREFIX}${safe}`;
}

function sanitizeProgress(
  raw: Partial<BotProgressState> | null | undefined,
  fallbackElo: number,
): BotProgressState {
  const base = createInitialBotProgress(fallbackElo);
  if (!raw || typeof raw !== 'object') return base;

  const level =
    typeof raw.level === 'number' ? clampBotLevel(raw.level) : base.level;
  const peakLevel =
    typeof raw.peakLevel === 'number'
      ? Math.max(level, clampBotLevel(raw.peakLevel))
      : level;
  const highestDefeatedLevel =
    typeof raw.highestDefeatedLevel === 'number' &&
    raw.highestDefeatedLevel >= BOT_MIN_LEVEL &&
    raw.highestDefeatedLevel <= BOT_MAX_LEVEL
      ? Math.round(raw.highestDefeatedLevel)
      : null;

  const toNonNegInt = (v: unknown, fb = 0) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fb;

  return {
    level,
    peakLevel,
    highestDefeatedLevel,
    wins: toNonNegInt(raw.wins),
    draws: toNonNegInt(raw.draws),
    losses: toNonNegInt(raw.losses),
    winStreak: toNonNegInt(raw.winStreak),
    consecutiveLosses: toNonNegInt(raw.consecutiveLosses),
    calibratedElo:
      typeof raw.calibratedElo === 'number' && Number.isFinite(raw.calibratedElo)
        ? Math.round(raw.calibratedElo)
        : Math.round(fallbackElo),
  };
}

/**
 * Charge la progression contre le bot pour un utilisateur (ou invité).
 * Si le joueur n'a jamais encore joué contre le bot, calibre le niveau
 * automatiquement sur son Elo actuel.
 */
export function loadBotProgress(
  scopeId: string,
  playerElo: number,
): BotProgressState {
  try {
    const raw = localStorage.getItem(storageKey(scopeId));
    if (!raw) {
      return createInitialBotProgress(playerElo);
    }
    const parsed = JSON.parse(raw) as Partial<BotProgressState>;
    const clean = sanitizeProgress(parsed, playerElo);

    // Si aucune partie contre le bot n'a encore été jouée, suit automatiquement l'Elo réel du joueur
    if (clean.wins === 0 && clean.draws === 0 && clean.losses === 0) {
      const recalibrated = calibrateBotLevelFromElo(playerElo);
      return {
        ...clean,
        level: recalibrated,
        peakLevel: Math.max(clean.peakLevel, recalibrated),
        calibratedElo: Math.round(playerElo),
      };
    }

    return clean;
  } catch {
    return createInitialBotProgress(playerElo);
  }
}

export function saveBotProgress(
  scopeId: string,
  progress: BotProgressState,
): void {
  try {
    localStorage.setItem(storageKey(scopeId), JSON.stringify(progress));
  } catch {
    // Ignore storage quota / private mode errors
  }
}
