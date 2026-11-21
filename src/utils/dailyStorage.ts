import { getDateKey, getPuzzleNumber } from '../data/dailyPuzzles';

const DAILY_STORAGE_KEY = 'sm_daily_puzzle_v1';
const MS_PER_DAY = 86_400_000;
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DailySolveRecord {
  attempts: number;
  usedHint: boolean;
  solvedAt: number;
}

export interface DailyProgress {
  solved: Record<string, DailySolveRecord>;
  streak: number;
  bestStreak: number;
  lastSolvedDate: string | null;
}

export interface DailyStatus {
  solvedToday: boolean;
  streak: number;
  bestStreak: number;
  puzzleNumber: number;
  dateKey: string;
  todayAttempts: number | null;
  todayUsedHint: boolean;
}

const EMPTY_PROGRESS: DailyProgress = {
  solved: {},
  streak: 0,
  bestStreak: 0,
  lastSolvedDate: null,
};

function dateKeyToDayNumber(dateKey: string): number | null {
  const match = DATE_KEY_RE.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = Date.UTC(year, month - 1, day);
  // Vérifie que la date ne déborde pas (ex. 2026-02-31)
  const check = new Date(utc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(utc / MS_PER_DAY);
}

function computeLongestStreak(dateKeys: readonly string[]): number {
  const dayNumbers = Array.from(
    new Set(
      dateKeys
        .map(dateKeyToDayNumber)
        .filter((n): n is number => n !== null),
    ),
  ).sort((a, b) => a - b);

  if (dayNumbers.length === 0) return 0;

  let best = 1;
  let current = 1;
  for (let i = 1; i < dayNumbers.length; i++) {
    if (dayNumbers[i] === dayNumbers[i - 1] + 1) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 1;
    }
  }
  return best;
}

function computeStreakAtReference(
  solved: Record<string, DailySolveRecord>,
  referenceDateKey: string,
): number {
  const refDay = dateKeyToDayNumber(referenceDateKey);
  if (refDay === null) return 0;

  const solvedDays = new Set<number>();
  for (const key of Object.keys(solved)) {
    const dayNum = dateKeyToDayNumber(key);
    if (dayNum !== null) solvedDays.add(dayNum);
  }

  // La série reste active si résolue aujourd'hui OU hier (en attente du défi du jour)
  let cursor: number;
  if (solvedDays.has(refDay)) {
    cursor = refDay;
  } else if (solvedDays.has(refDay - 1)) {
    cursor = refDay - 1;
  } else {
    return 0;
  }

  let count = 0;
  while (solvedDays.has(cursor)) {
    count += 1;
    cursor -= 1;
  }
  return count;
}

function sanitizeProgress(raw: unknown): DailyProgress {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_PROGRESS, solved: {} };
  }

  const candidate = raw as Partial<DailyProgress>;
  const solved: Record<string, DailySolveRecord> = {};

  if (candidate.solved && typeof candidate.solved === 'object') {
    for (const [key, value] of Object.entries(candidate.solved)) {
      if (dateKeyToDayNumber(key) === null) continue;
      if (!value || typeof value !== 'object') continue;
      const entry = value as Partial<DailySolveRecord>;
      const attempts =
        typeof entry.attempts === 'number' &&
        Number.isFinite(entry.attempts) &&
        entry.attempts >= 1
          ? Math.round(entry.attempts)
          : 1;
      const usedHint = Boolean(entry.usedHint);
      const solvedAt =
        typeof entry.solvedAt === 'number' && Number.isFinite(entry.solvedAt)
          ? entry.solvedAt
          : 0;
      solved[key] = { attempts, usedHint, solvedAt };
    }
  }

  const sortedKeys = Object.keys(solved).sort();
  const lastSolvedDate =
    sortedKeys.length > 0 ? sortedKeys[sortedKeys.length - 1] : null;
  const computedBest = computeLongestStreak(sortedKeys);
  const storedBest =
    typeof candidate.bestStreak === 'number' &&
    Number.isFinite(candidate.bestStreak) &&
    candidate.bestStreak >= 0
      ? Math.round(candidate.bestStreak)
      : 0;
  const bestStreak = Math.max(storedBest, computedBest);
  const streak = lastSolvedDate
    ? computeStreakAtReference(solved, lastSolvedDate)
    : 0;

  return {
    solved,
    streak,
    bestStreak,
    lastSolvedDate,
  };
}

/** Lit la progression locale des défis quotidiens en toute sécurité. */
export function getDailyProgress(): DailyProgress {
  try {
    if (typeof localStorage === 'undefined') {
      return { ...EMPTY_PROGRESS, solved: {} };
    }
    const raw = localStorage.getItem(DAILY_STORAGE_KEY);
    if (!raw) return { ...EMPTY_PROGRESS, solved: {} };
    return sanitizeProgress(JSON.parse(raw));
  } catch {
    return { ...EMPTY_PROGRESS, solved: {} };
  }
}

/** Enregistre la résolution d'un défi du jour (idempotent pour une même date). */
export function recordDailySolve(
  dateKey: string,
  attempts: number,
  usedHint: boolean,
): DailyProgress {
  const progress = getDailyProgress();
  if (dateKeyToDayNumber(dateKey) === null) {
    return progress;
  }

  const safeAttempts =
    Number.isFinite(attempts) && attempts >= 1 ? Math.round(attempts) : 1;

  // Conserve la toute première résolution officielle de la journée
  const solved: Record<string, DailySolveRecord> = { ...progress.solved };
  if (!solved[dateKey]) {
    solved[dateKey] = {
      attempts: safeAttempts,
      usedHint: Boolean(usedHint),
      solvedAt: Date.now(),
    };
  }

  const sortedKeys = Object.keys(solved).sort();
  const lastSolvedDate =
    sortedKeys.length > 0 ? sortedKeys[sortedKeys.length - 1] : null;
  const streak = computeStreakAtReference(solved, dateKey);
  const bestStreak = Math.max(
    progress.bestStreak,
    computeLongestStreak(sortedKeys),
    streak,
  );

  const next: DailyProgress = {
    solved,
    streak,
    bestStreak,
    lastSolvedDate,
  };

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore les erreurs de quota ou de navigation privée
  }

  return next;
}

/** Résume l'état du défi pour la date donnée (résolu aujourd'hui, série, essais). */
export function getDailyStatus(date: Date = new Date()): DailyStatus {
  const dateKey = getDateKey(date);
  const puzzleNumber = getPuzzleNumber(date);
  const progress = getDailyProgress();
  const todayEntry = progress.solved[dateKey] ?? null;
  const streak = computeStreakAtReference(progress.solved, dateKey);
  const bestStreak = Math.max(progress.bestStreak, streak);

  return {
    solvedToday: todayEntry !== null,
    streak,
    bestStreak,
    puzzleNumber,
    dateKey,
    todayAttempts: todayEntry ? todayEntry.attempts : null,
    todayUsedHint: todayEntry ? todayEntry.usedHint : false,
  };
}
