import { describe, expect, it } from 'vitest';
import {
  STREAK_MILESTONES,
  createEmptyStreakState,
  diffUtcDays,
  getNextStreakMilestone,
  normalizeStoredStreak,
  presentAccountStreak,
  recordStreakActivity,
  shiftUtcDateKey,
  toUtcDateKey,
  type StoredStreakState,
} from './streak.js';

function utcMs(year: number, month: number, day: number, hour = 12): number {
  return Date.UTC(year, month - 1, day, hour, 0, 0);
}

describe('Flamme quotidienne (streak UTC)', () => {
  it('manipule correctement les clés calendaires UTC aux changements de mois et d’année', () => {
    expect(toUtcDateKey(utcMs(2026, 11, 21, 0))).toBe('2026-11-21');
    expect(toUtcDateKey(utcMs(2026, 11, 21, 23))).toBe('2026-11-21');

    expect(shiftUtcDateKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftUtcDateKey('2027-01-01', -1)).toBe('2026-12-31');
    expect(shiftUtcDateKey('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftUtcDateKey('2024-02-29', 1)).toBe('2024-03-01');
    expect(shiftUtcDateKey('2026-02-28', 1)).toBe('2026-03-01');

    expect(diffUtcDays('2026-11-20', '2026-11-21')).toBe(1);
    expect(diffUtcDays('2026-11-21', '2026-11-21')).toBe(0);
    expect(diffUtcDays('2026-11-21', '2026-11-20')).toBe(-1);
    expect(diffUtcDays('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('présente un état initial vide cohérent', () => {
    const empty = createEmptyStreakState();
    const now = utcMs(2026, 11, 21, 14);
    const view = presentAccountStreak(empty, now);

    expect(view.current).toBe(0);
    expect(view.best).toBe(0);
    expect(view.lastActiveDate).toBeNull();
    expect(view.activeToday).toBe(false);
    expect(view.atRisk).toBe(false);
    expect(view.totalActiveDays).toBe(0);
    expect(view.recentDays).toHaveLength(7);
    expect(view.recentDays[0].date).toBe('2026-11-15');
    expect(view.recentDays[6].date).toBe('2026-11-21');
    expect(view.recentDays.every((d) => !d.active)).toBe(true);
  });

  it('allume la flamme au premier jour et reste idempotent sur la même journée', () => {
    const day1Morning = utcMs(2026, 11, 21, 8);
    const first = recordStreakActivity(createEmptyStreakState(), day1Morning);

    expect(first.changed).toBe(true);
    expect(first.incremented).toBe(true);
    expect(first.started).toBe(true);
    expect(first.milestoneReached).toBeNull();
    expect(first.next).toEqual({
      current: 1,
      best: 1,
      lastActiveDate: '2026-11-21',
      totalActiveDays: 1,
      recentDates: ['2026-11-21'],
    });

    const viewDay1 = presentAccountStreak(first.next, day1Morning);
    expect(viewDay1.current).toBe(1);
    expect(viewDay1.best).toBe(1);
    expect(viewDay1.activeToday).toBe(true);
    expect(viewDay1.atRisk).toBe(false);
    expect(viewDay1.recentDays[6]).toEqual({ date: '2026-11-21', active: true });

    // Deuxième activité le même jour (le soir UTC) : strictement idempotent
    const day1Evening = utcMs(2026, 11, 21, 22);
    const second = recordStreakActivity(first.next, day1Evening);

    expect(second.changed).toBe(false);
    expect(second.incremented).toBe(false);
    expect(second.started).toBe(false);
    expect(second.milestoneReached).toBeNull();
    expect(second.next.current).toBe(1);
    expect(second.next.totalActiveDays).toBe(1);
    expect(second.next.recentDates).toEqual(['2026-11-21']);
  });

  it('garantit la présence du jour courant dans recentDates même si absent de l’état brut', () => {
    const legacyState: StoredStreakState = {
      current: 2,
      best: 2,
      lastActiveDate: '2026-11-21',
      totalActiveDays: 2,
      recentDates: [],
    };
    const res = recordStreakActivity(legacyState, utcMs(2026, 11, 21, 18));
    expect(res.changed).toBe(false);
    expect(res.next.recentDates).toContain('2026-11-21');
  });

  it('incrémente la série sur les jours consécutifs et détecte le palier des 3 jours', () => {
    let state = createEmptyStreakState();

    // Jour 1
    const r1 = recordStreakActivity(state, utcMs(2026, 11, 19, 10));
    state = r1.next;
    expect(state.current).toBe(1);

    // Jour 2 (avant activité : série à entretenir)
    const beforeDay2 = presentAccountStreak(state, utcMs(2026, 11, 20, 7));
    expect(beforeDay2.current).toBe(1);
    expect(beforeDay2.activeToday).toBe(false);
    expect(beforeDay2.atRisk).toBe(true);

    // Jour 2 (activité validée)
    const r2 = recordStreakActivity(state, utcMs(2026, 11, 20, 9));
    state = r2.next;
    expect(r2.changed).toBe(true);
    expect(r2.incremented).toBe(true);
    expect(r2.started).toBe(false);
    expect(r2.milestoneReached).toBeNull();
    expect(state.current).toBe(2);
    expect(state.best).toBe(2);
    expect(state.totalActiveDays).toBe(2);

    // Jour 3 : palier 3 jours atteint !
    const r3 = recordStreakActivity(state, utcMs(2026, 11, 21, 11));
    state = r3.next;
    expect(r3.changed).toBe(true);
    expect(r3.incremented).toBe(true);
    expect(r3.started).toBe(false);
    expect(r3.milestoneReached).toBe(3);
    expect(state.current).toBe(3);
    expect(state.best).toBe(3);
    expect(state.totalActiveDays).toBe(3);

    // Jour 4 avant activité : atRisk = true, série intacte à 3
    const beforeDay4 = presentAccountStreak(state, utcMs(2026, 11, 22, 15));
    expect(beforeDay4.current).toBe(3);
    expect(beforeDay4.activeToday).toBe(false);
    expect(beforeDay4.atRisk).toBe(true);
  });

  it('rompt la série après 2 jours manqués tout en conservant le record et le cumul', () => {
    let state = createEmptyStreakState();
    for (let d = 10; d <= 14; d++) {
      state = recordStreakActivity(state, utcMs(2026, 11, d, 12)).next;
    }
    expect(state.current).toBe(5);
    expect(state.best).toBe(5);
    expect(state.totalActiveDays).toBe(5);

    // 2 jours plus tard (16 nov.) : la série affichée est rompue (0), mais record conservé
    const missedView = presentAccountStreak(state, utcMs(2026, 11, 16, 12));
    expect(missedView.current).toBe(0);
    expect(missedView.best).toBe(5);
    expect(missedView.activeToday).toBe(false);
    expect(missedView.atRisk).toBe(false);
    expect(missedView.totalActiveDays).toBe(5);

    // Nouvelle activité le 16 nov. : redémarre à 1 en gardant best = 5
    const restarted = recordStreakActivity(state, utcMs(2026, 11, 16, 19));
    expect(restarted.changed).toBe(true);
    expect(restarted.incremented).toBe(true);
    expect(restarted.started).toBe(true);
    expect(restarted.milestoneReached).toBeNull();
    expect(restarted.next.current).toBe(1);
    expect(restarted.next.best).toBe(5);
    expect(restarted.next.totalActiveDays).toBe(6);
    expect(restarted.next.lastActiveDate).toBe('2026-11-16');
  });

  it('construit exactement la fenêtre glissante de 7 jours à cheval sur mois et année', () => {
    let state = createEmptyStreakState();
    // Actif les 29 déc., 31 déc. 2026 et 1er janv. 2027
    state = recordStreakActivity(state, utcMs(2026, 12, 29, 10)).next;
    state = recordStreakActivity(state, utcMs(2026, 12, 31, 10)).next;
    state = recordStreakActivity(state, utcMs(2027, 1, 1, 10)).next;

    const view = presentAccountStreak(state, utcMs(2027, 1, 2, 8));
    expect(view.current).toBe(2);
    expect(view.atRisk).toBe(true);
    expect(view.activeToday).toBe(false);
    expect(view.recentDays).toEqual([
      { date: '2026-12-27', active: false },
      { date: '2026-12-28', active: false },
      { date: '2026-12-29', active: true },
      { date: '2026-12-30', active: false },
      { date: '2026-12-31', active: true },
      { date: '2027-01-01', active: true },
      { date: '2027-01-02', active: false },
    ]);

    // Vérification sur année bissextile (février -> mars 2024)
    let leapState = createEmptyStreakState();
    leapState = recordStreakActivity(leapState, utcMs(2024, 2, 28, 12)).next;
    leapState = recordStreakActivity(leapState, utcMs(2024, 2, 29, 12)).next;
    leapState = recordStreakActivity(leapState, utcMs(2024, 3, 1, 12)).next;

    const leapView = presentAccountStreak(leapState, utcMs(2024, 3, 1, 15));
    expect(leapView.current).toBe(3);
    expect(leapView.activeToday).toBe(true);
    expect(leapView.recentDays.map((d) => d.date)).toEqual([
      '2024-02-24',
      '2024-02-25',
      '2024-02-26',
      '2024-02-27',
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]);
    expect(leapView.recentDays.map((d) => d.active)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
  });

  it('borne recentDates aux 14 derniers jours et déclenche tous les paliers', () => {
    let state = createEmptyStreakState();
    const milestonesHit: number[] = [];
    const baseMs = utcMs(2026, 1, 1, 12);

    for (let i = 0; i < 100; i++) {
      const res = recordStreakActivity(state, baseMs + i * 86_400_000);
      state = res.next;
      if (res.milestoneReached !== null) {
        milestonesHit.push(res.milestoneReached);
      }
      expect(state.recentDates.length).toBeLessThanOrEqual(14);
    }

    expect(milestonesHit).toEqual([...STREAK_MILESTONES]);
    expect(state.current).toBe(100);
    expect(state.best).toBe(100);
    expect(state.totalActiveDays).toBe(100);
    expect(state.recentDates).toHaveLength(14);
  });

  it('calcule correctement le prochain palier', () => {
    expect(getNextStreakMilestone(0)).toBe(3);
    expect(getNextStreakMilestone(2)).toBe(3);
    expect(getNextStreakMilestone(3)).toBe(7);
    expect(getNextStreakMilestone(6)).toBe(7);
    expect(getNextStreakMilestone(7)).toBe(14);
    expect(getNextStreakMilestone(14)).toBe(30);
    expect(getNextStreakMilestone(30)).toBe(60);
    expect(getNextStreakMilestone(60)).toBe(100);
    expect(getNextStreakMilestone(99)).toBe(100);
    expect(getNextStreakMilestone(100)).toBeNull();
    expect(getNextStreakMilestone(250)).toBeNull();
  });

  it('assainit un état partiel ou corrompu via normalizeStoredStreak', () => {
    const normalized = normalizeStoredStreak({
      current: 4.8,
      best: 2,
      lastActiveDate: '2026-11-21',
      totalActiveDays: -5,
      recentDates: [
        '2026-11-20',
        'invalide',
        '2026-02-30',
        '2026-11-19',
        '2026-11-20',
      ],
    });

    expect(normalized.current).toBe(4);
    expect(normalized.best).toBe(4);
    expect(normalized.totalActiveDays).toBe(0);
    expect(normalized.recentDates).toEqual([
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
    ]);

    expect(normalizeStoredStreak(null)).toEqual(createEmptyStreakState());
  });

  it('gère une anomalie d’horloge (date antérieure) en redémarrant proprement à 1', () => {
    const state = recordStreakActivity(
      createEmptyStreakState(),
      utcMs(2026, 11, 21, 12),
    ).next;

    const backward = recordStreakActivity(state, utcMs(2026, 11, 19, 12));
    expect(backward.changed).toBe(true);
    expect(backward.started).toBe(true);
    expect(backward.next.current).toBe(1);
    expect(backward.next.lastActiveDate).toBe('2026-11-19');
  });
});
