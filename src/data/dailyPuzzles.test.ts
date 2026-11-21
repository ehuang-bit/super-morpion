import { afterEach, describe, expect, it } from 'vitest';
import {
  applyMove,
  createInitialState,
  getLegalMoves,
  type GameState,
  type Move,
} from '@shared/gameEngine';
import {
  getDailyProgress,
  getDailyStatus,
  recordDailySolve,
} from '../utils/dailyStorage';
import {
  DAILY_PUZZLES,
  buildPuzzleState,
  getDailyPuzzle,
  getDateKey,
  getPuzzleNumber,
  type DailyPuzzle,
} from './dailyPuzzles';

function findImmediateWins(state: GameState): Move[] {
  const wins: Move[] = [];
  for (const move of getLegalMoves(state)) {
    const res = applyMove(state, move);
    if (
      res.ok &&
      res.state.status === 'won' &&
      res.state.winner === state.currentPlayer
    ) {
      wins.push(move);
    }
  }
  return wins;
}

describe('Catalogue des défis tactiques quotidiens (dailyPuzzles)', () => {
  it('contient exactement 15 puzzles variés répartis sur les 3 catégories', () => {
    expect(DAILY_PUZZLES).toHaveLength(15);

    const ids = new Set(DAILY_PUZZLES.map((p) => p.id));
    expect(ids.size).toBe(15);

    const byCategory = {
      mate1: DAILY_PUZZLES.filter((p) => p.category === 'mate1'),
      trap2: DAILY_PUZZLES.filter((p) => p.category === 'trap2'),
      'clean-capture': DAILY_PUZZLES.filter(
        (p) => p.category === 'clean-capture',
      ),
    };

    expect(byCategory.mate1).toHaveLength(5);
    expect(byCategory.trap2).toHaveLength(5);
    expect(byCategory['clean-capture']).toHaveLength(5);

    for (const puzzle of DAILY_PUZZLES) {
      expect(puzzle.title.trim().length).toBeGreaterThan(0);
      expect(puzzle.objective.trim().length).toBeGreaterThan(0);
      expect(puzzle.hint.trim().length).toBeGreaterThan(0);
      expect(puzzle.explanation.trim().length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(puzzle.difficulty);
      expect(puzzle.setupMoves.length).toBeGreaterThan(0);
      expect(puzzle.steps.length).toBeGreaterThan(0);
    }
  });

  describe.each<DailyPuzzle>(DAILY_PUZZLES)(
    'Défi « $id » ($category, difficulté $difficulty)',
    (puzzle) => {
      it('possède une séquence setupMoves 100 % légale laissant la partie en cours', () => {
        let state = createInitialState('X');
        for (let i = 0; i < puzzle.setupMoves.length; i++) {
          const res = applyMove(state, puzzle.setupMoves[i]);
          expect(
            res.ok,
            `setupMoves[${i}] doit être légal`,
          ).toBe(true);
          if (!res.ok) return;
          state = res.state;
          expect(
            state.status,
            `la partie doit rester en cours après setupMoves[${i}]`,
          ).toBe('playing');
        }

        const built = buildPuzzleState(puzzle);
        expect(built).toEqual(state);
        expect(built.status).toBe('playing');
        expect(getLegalMoves(built).length).toBeGreaterThanOrEqual(3);
      });

      it('valide la légalité et la justesse tactique de chaque étape', () => {
        const startState = buildPuzzleState(puzzle);
        const puzzlePlayer = startState.currentPlayer;

        if (puzzle.category === 'mate1') {
          expect(puzzle.steps).toHaveLength(1);
          const step = puzzle.steps[0];
          expect(step.accept.length).toBeGreaterThan(0);
          expect(step.reply).toBeUndefined();

          for (const move of step.accept) {
            const res = applyMove(startState, move, puzzlePlayer);
            expect(res.ok).toBe(true);
            if (!res.ok) return;
            expect(res.state.status).toBe('won');
            expect(res.state.winner).toBe(puzzlePlayer);
          }

          // Vérifie que tous les coups gagnants immédiats sont bien acceptés
          const allWins = findImmediateWins(startState);
          expect(step.accept).toHaveLength(allWins.length);
          // Et qu'il existe des coups non gagnants (le défi n'est pas trivial)
          expect(getLegalMoves(startState).length).toBeGreaterThan(
            allWins.length,
          );
        } else if (puzzle.category === 'trap2') {
          expect(puzzle.steps).toHaveLength(2);
          // Pas de victoire immédiate en 1 coup dès le départ
          expect(findImmediateWins(startState)).toHaveLength(0);

          const [step1, step2] = puzzle.steps;
          expect(step1.accept.length).toBeGreaterThan(0);
          expect(step1.reply).toBeDefined();
          expect(step2.accept.length).toBeGreaterThan(0);
          expect(step2.reply).toBeUndefined();

          for (const firstMove of step1.accept) {
            const r1 = applyMove(startState, firstMove, puzzlePlayer);
            expect(r1.ok).toBe(true);
            if (!r1.ok) return;
            expect(r1.state.status).toBe('playing');

            // Vérifie que le piège est véritablement forcé contre TOUTES les réponses adverses
            const allOppReplies = getLegalMoves(r1.state);
            expect(allOppReplies.length).toBeGreaterThan(0);
            for (const oppMove of allOppReplies) {
              const afterOpp = applyMove(r1.state, oppMove);
              expect(afterOpp.ok).toBe(true);
              if (!afterOpp.ok) return;
              expect(afterOpp.state.status).toBe('playing');
              expect(findImmediateWins(afterOpp.state).length).toBeGreaterThan(
                0,
              );
            }

            // Vérifie la réponse déterministe prévue + le coup de grâce
            const rReply = applyMove(r1.state, step1.reply!);
            expect(rReply.ok).toBe(true);
            if (!rReply.ok) return;
            expect(rReply.state.status).toBe('playing');
            expect(rReply.state.currentPlayer).toBe(puzzlePlayer);

            for (const secondMove of step2.accept) {
              const r2 = applyMove(rReply.state, secondMove, puzzlePlayer);
              expect(r2.ok).toBe(true);
              if (!r2.ok) return;
              expect(r2.state.status).toBe('won');
              expect(r2.state.winner).toBe(puzzlePlayer);
            }
          }
        } else {
          // Catégorie 'clean-capture' : capture sans offrir de coup libre
          let state = startState;

          for (let stepIdx = 0; stepIdx < puzzle.steps.length; stepIdx++) {
            const step = puzzle.steps[stepIdx];
            expect(step.accept.length).toBeGreaterThan(0);
            expect(findImmediateWins(state)).toHaveLength(0);

            // Vérifie qu'il existe au moins un piège de capture offrant un coup libre
            const decoyCaptures = getLegalMoves(state).filter((mv) => {
              const r = applyMove(state, mv);
              return r.ok && r.capturedBoard && r.state.isFreeMove;
            });
            expect(decoyCaptures.length).toBeGreaterThan(0);

            let nextAfterAccept: GameState | null = null;
            for (const move of step.accept) {
              const res = applyMove(state, move, puzzlePlayer);
              expect(res.ok).toBe(true);
              if (!res.ok) return;
              expect(res.capturedBoard).toBe(true);
              expect(res.state.isFreeMove).toBe(false);
              expect(res.state.status).toBe('playing');
              nextAfterAccept = res.state;
            }

            if (step.reply) {
              expect(nextAfterAccept).not.toBeNull();
              const rReply = applyMove(nextAfterAccept!, step.reply);
              expect(rReply.ok).toBe(true);
              if (!rReply.ok) return;
              expect(rReply.state.status).toBe('playing');
              expect(rReply.state.currentPlayer).toBe(puzzlePlayer);
              state = rReply.state;
            }
          }
        }
      });
    },
  );

  describe('Sélection quotidienne déterministe', () => {
    it('formate correctement la clé de date locale YYYY-MM-DD', () => {
      expect(getDateKey(new Date(2026, 0, 1))).toBe('2026-01-01');
      expect(getDateKey(new Date(2026, 10, 21))).toBe('2026-11-21');
      expect(getDateKey(new Date(2026, 8, 5))).toBe('2026-09-05');
    });

    it('incrémente le numéro de défi jour après jour depuis le 2026-01-01', () => {
      expect(getPuzzleNumber(new Date(2026, 0, 1))).toBe(1);
      expect(getPuzzleNumber(new Date(2026, 0, 2))).toBe(2);
      expect(getPuzzleNumber(new Date(2026, 0, 31))).toBe(31);
      // Vérifie aussi le passage à l'heure d'été/hiver
      const beforeDst = getPuzzleNumber(new Date(2026, 2, 28, 12, 0));
      const afterDst = getPuzzleNumber(new Date(2026, 2, 29, 12, 0));
      expect(afterDst - beforeDst).toBe(1);
    });

    it('est déterministe pour une même date et varie d’un jour à l’autre', () => {
      const morning = getDailyPuzzle(new Date(2026, 5, 15, 7, 15));
      const evening = getDailyPuzzle(new Date(2026, 5, 15, 22, 45));
      expect(morning).toEqual(evening);

      const nextDay = getDailyPuzzle(new Date(2026, 5, 16, 9, 0));
      expect(nextDay.number).toBe(morning.number + 1);
      expect(nextDay.dateKey).not.toBe(morning.dateKey);
      expect(nextDay.puzzle.id).not.toBe(morning.puzzle.id);

      // Sur 15 jours consécutifs, chaque défi du catalogue apparaît exactement une fois
      const seen = new Set<string>();
      for (let d = 0; d < DAILY_PUZZLES.length; d++) {
        const { puzzle } = getDailyPuzzle(new Date(2026, 0, 1 + d));
        seen.add(puzzle.id);
      }
      expect(seen.size).toBe(DAILY_PUZZLES.length);
    });
  });

  describe('Stockage local et série quotidienne (dailyStorage)', () => {
    const originalLocalStorage = globalThis.localStorage;

    afterEach(() => {
      Object.defineProperty(globalThis, 'localStorage', {
        value: originalLocalStorage,
        configurable: true,
        writable: true,
      });
    });

    function installMockStorage(): Map<string, string> {
      const store = new Map<string, string>();
      const mockStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => {
          store.clear();
        },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() {
          return store.size;
        },
      };
      Object.defineProperty(globalThis, 'localStorage', {
        value: mockStorage,
        configurable: true,
        writable: true,
      });
      return store;
    }

    it('enregistre les résolutions sous sm_daily_puzzle_v1 et suit la série sur plusieurs jours', () => {
      const store = installMockStorage();

      recordDailySolve('2026-11-19', 2, false);
      recordDailySolve('2026-11-20', 1, false);
      // Un deuxième enregistrement le même jour reste idempotent
      recordDailySolve('2026-11-20', 5, true);

      expect(store.has('sm_daily_puzzle_v1')).toBe(true);
      const progress = getDailyProgress();
      expect(progress.solved['2026-11-20']?.attempts).toBe(1);
      expect(progress.solved['2026-11-20']?.usedHint).toBe(false);

      // Le lendemain matin (avant résolution), la série de 2 jours est toujours active
      const beforeSolve = getDailyStatus(new Date(2026, 10, 21));
      expect(beforeSolve.solvedToday).toBe(false);
      expect(beforeSolve.streak).toBe(2);
      expect(beforeSolve.bestStreak).toBe(2);
      expect(beforeSolve.todayAttempts).toBeNull();

      // Résolution du 21 novembre -> série passe à 3
      recordDailySolve('2026-11-21', 1, true);
      const afterSolve = getDailyStatus(new Date(2026, 10, 21));
      expect(afterSolve.solvedToday).toBe(true);
      expect(afterSolve.streak).toBe(3);
      expect(afterSolve.bestStreak).toBe(3);
      expect(afterSolve.todayAttempts).toBe(1);
      expect(afterSolve.todayUsedHint).toBe(true);

      // Si le joueur manque 2 jours, la série active retombe à 0 mais bestStreak reste 3
      const afterGap = getDailyStatus(new Date(2026, 10, 23));
      expect(afterGap.solvedToday).toBe(false);
      expect(afterGap.streak).toBe(0);
      expect(afterGap.bestStreak).toBe(3);
    });

    it('résiste sans erreur si localStorage est indisponible ou corrompu', () => {
      const store = installMockStorage();
      store.set('sm_daily_puzzle_v1', '{json invalide');
      expect(getDailyProgress().streak).toBe(0);

      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: () => {
            throw new Error('QuotaExceededError');
          },
          setItem: () => {
            throw new Error('QuotaExceededError');
          },
        },
        configurable: true,
        writable: true,
      });

      expect(() => recordDailySolve('2026-11-21', 1, false)).not.toThrow();
      expect(getDailyStatus(new Date(2026, 10, 21)).solvedToday).toBe(false);
    });
  });
});
