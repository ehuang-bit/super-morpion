import type { AccountStreak } from './protocol.js';

/** Paliers de flamme quotidienne célébrés dans l'interface. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100] as const;

const MS_PER_DAY = 86_400_000;
const MAX_RECENT_DATES = 14;
const RECENT_WINDOW_DAYS = 7;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** État brut de la flamme quotidienne stocké côté compte inscrit (jamais invité). */
export interface StoredStreakState {
  current: number;
  best: number;
  /** Dernier jour d'activité validé au format 'YYYY-MM-DD' (UTC), ou null. */
  lastActiveDate: string | null;
  totalActiveDays: number;
  /** Dates UTC uniques ('YYYY-MM-DD'), triées en ordre croissant, bornées aux 14 plus récentes. */
  recentDates: string[];
}

/** Résultat d'un enregistrement d'activité quotidienne sur un compte. */
export interface RecordStreakResult {
  next: StoredStreakState;
  changed: boolean;
  incremented: boolean;
  started: boolean;
  milestoneReached: number | null;
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function parseDateParts(dateKey: string): [number, number, number] {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) {
    throw new Error(`Clé de date UTC invalide : "${dateKey}"`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  return Number.isFinite(ms) && toUtcDateKey(ms) === value;
}

function normalizeRecentDates(
  dates: readonly unknown[] | undefined,
  ensureDate?: string | null,
): string[] {
  const unique = new Set<string>();
  if (Array.isArray(dates)) {
    for (const item of dates) {
      if (isValidDateKey(item)) {
        unique.add(item);
      }
    }
  }
  if (ensureDate && isValidDateKey(ensureDate)) {
    unique.add(ensureDate);
  }
  const sorted = Array.from(unique).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (sorted.length <= MAX_RECENT_DATES) return sorted;
  return sorted.slice(sorted.length - MAX_RECENT_DATES);
}

/** Convertit un horodatage (ms) en clé calendaire UTC 'YYYY-MM-DD'. */
export function toUtcDateKey(ms: number): string {
  const date = new Date(ms);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Décale une date UTC 'YYYY-MM-DD' de `deltaDays` jours (positif ou négatif). */
export function shiftUtcDateKey(dateKey: string, deltaDays: number): string {
  const [year, month, day] = parseDateParts(dateKey);
  const shift = Number.isFinite(deltaDays) ? Math.trunc(deltaDays) : 0;
  return toUtcDateKey(Date.UTC(year, month - 1, day + shift));
}

/** Calcule l'écart entier en jours UTC entre deux clés (`toKey - fromKey`). */
export function diffUtcDays(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = parseDateParts(fromKey);
  const [ty, tm, td] = parseDateParts(toKey);
  const fromMs = Date.UTC(fy, fm - 1, fd);
  const toMs = Date.UTC(ty, tm - 1, td);
  const diff = Math.round((toMs - fromMs) / MS_PER_DAY);
  return diff === 0 ? 0 : diff;
}

/** Crée un état initial vierge pour un compte n'ayant pas encore validé de journée. */
export function createEmptyStreakState(): StoredStreakState {
  return {
    current: 0,
    best: 0,
    lastActiveDate: null,
    totalActiveDays: 0,
    recentDates: [],
  };
}

/** Assainit un état de flamme partiel ou brut issu du stockage. */
export function normalizeStoredStreak(
  raw?: Partial<StoredStreakState> | null,
): StoredStreakState {
  if (!raw) return createEmptyStreakState();
  const lastActiveDate = isValidDateKey(raw.lastActiveDate)
    ? raw.lastActiveDate
    : null;
  const rawCurrent = toNonNegativeInt(raw.current);
  const current = lastActiveDate ? rawCurrent : 0;
  const best = Math.max(toNonNegativeInt(raw.best), current);
  const totalActiveDays = toNonNegativeInt(raw.totalActiveDays);
  const recentDates = normalizeRecentDates(raw.recentDates, lastActiveDate);

  return {
    current,
    best,
    lastActiveDate,
    totalActiveDays,
    recentDates,
  };
}

/**
 * Enregistre une activité quotidienne (partie terminée, défi du jour, etc.)
 * pour un compte inscrit à l'instant `nowMs`. Idempotent sur la même journée UTC.
 */
export function recordStreakActivity(
  state: StoredStreakState,
  nowMs: number,
): RecordStreakResult {
  const normalized = normalizeStoredStreak(state);
  const today = toUtcDateKey(nowMs);

  if (normalized.lastActiveDate === today) {
    const recentDates = normalizeRecentDates(normalized.recentDates, today);
    const next: StoredStreakState = {
      ...normalized,
      recentDates,
    };
    return {
      next,
      changed: false,
      incremented: false,
      started: false,
      milestoneReached: null,
    };
  }

  let nextCurrent: number;
  let started: boolean;

  if (
    normalized.lastActiveDate !== null &&
    diffUtcDays(normalized.lastActiveDate, today) === 1
  ) {
    nextCurrent = normalized.current + 1;
    started = normalized.current === 0;
  } else {
    nextCurrent = 1;
    started = true;
  }

  const nextBest = Math.max(normalized.best, nextCurrent);
  const nextTotalActiveDays = normalized.totalActiveDays + 1;
  const recentDates = normalizeRecentDates(normalized.recentDates, today);
  const milestoneReached = (STREAK_MILESTONES as readonly number[]).includes(
    nextCurrent,
  )
    ? nextCurrent
    : null;

  return {
    next: {
      current: nextCurrent,
      best: nextBest,
      lastActiveDate: today,
      totalActiveDays: nextTotalActiveDays,
      recentDates,
    },
    changed: true,
    incremented: true,
    started,
    milestoneReached,
  };
}

/**
 * Projette l'état stocké en vue prête pour l'interface à l'instant `nowMs` :
 * remet la série effective à 0 si plus d'un jour UTC a été manqué, calcule
 * `activeToday`, `atRisk` et la fenêtre glissante des 7 derniers jours.
 */
export function presentAccountStreak(
  state: StoredStreakState,
  nowMs: number,
): AccountStreak {
  const normalized = normalizeStoredStreak(state);
  const today = toUtcDateKey(nowMs);
  const gap = normalized.lastActiveDate
    ? diffUtcDays(normalized.lastActiveDate, today)
    : Infinity;

  const activeToday = gap === 0;
  const atRisk = gap === 1 && normalized.current > 0;
  const current = gap <= 1 ? normalized.current : 0;

  const dateSet = new Set(normalized.recentDates);
  const recentDays: { date: string; active: boolean }[] = [];
  for (let delta = -(RECENT_WINDOW_DAYS - 1); delta <= 0; delta++) {
    const date = shiftUtcDateKey(today, delta);
    recentDays.push({ date, active: dateSet.has(date) });
  }

  return {
    current,
    best: normalized.best,
    lastActiveDate: normalized.lastActiveDate,
    activeToday,
    atRisk,
    totalActiveDays: normalized.totalActiveDays,
    recentDays,
  };
}

/** Retourne le prochain palier strictement supérieur à `current` (ou null si >= 100). */
export function getNextStreakMilestone(current: number): number | null {
  const safeCurrent = toNonNegativeInt(current);
  for (const milestone of STREAK_MILESTONES) {
    if (milestone > safeCurrent) return milestone;
  }
  return null;
}
