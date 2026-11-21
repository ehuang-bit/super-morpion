import {
  applyMove,
  createInitialState,
  type GameState,
  type Move,
} from '@shared/gameEngine';

export type PuzzleCategory = 'mate1' | 'trap2' | 'clean-capture';
export type PuzzleDifficulty = 1 | 2 | 3;

export interface PuzzleStep {
  /** Coups jugés exacts pour franchir cette étape. */
  readonly accept: readonly Move[];
  /** Réponse déterministe jouée par l'adversaire après le coup du joueur. */
  readonly reply?: Move;
}

export interface DailyPuzzle {
  readonly id: string;
  readonly title: string;
  readonly category: PuzzleCategory;
  readonly difficulty: PuzzleDifficulty;
  readonly objective: string;
  readonly hint: string;
  readonly explanation: string;
  readonly setupMoves: readonly Move[];
  readonly steps: readonly PuzzleStep[];
}

export const PUZZLE_CATEGORY_LABELS: Record<PuzzleCategory, string> = {
  mate1: 'Victoire en 1 coup',
  trap2: 'Piège en 2 coups',
  'clean-capture': 'Capture sans coup libre',
};

const m = (boardIndex: number, cellIndex: number): Move => ({
  boardIndex,
  cellIndex,
});

/**
 * Catalogue de 15 défis tactiques de Super Morpion, chacun issu d'une séquence
 * de coups légaux depuis la position initiale. Les catégories sont alternées
 * pour varier le rythme au fil des jours.
 */
export const DAILY_PUZZLES: readonly DailyPuzzle[] = [
  {
    id: 'mate1-diag-finale',
    title: 'Diagonale décisive',
    category: 'mate1',
    difficulty: 1,
    objective: 'Trait à X · Remporte la partie en un seul coup dans la zone C3.',
    hint: 'Regarde la grande diagonale A1–B2–C3 : un alignement diagonal t’attend dans C3.',
    explanation:
      'X contrôle déjà A1 et B2. En jouant la case C3 dans la zone C3, X complète la diagonale locale et verrouille l’alignement global A1–B2–C3.',
    setupMoves: [
      m(0, 1), m(1, 0), m(0, 0), m(0, 4), m(4, 4), m(4, 0),
      m(0, 2), m(2, 0), m(4, 1), m(1, 6), m(6, 0), m(1, 3),
      m(3, 1), m(3, 0), m(4, 7), m(7, 0), m(8, 4), m(8, 2),
      m(2, 4), m(8, 5), m(5, 1), m(3, 4), m(8, 0), m(2, 8),
    ],
    steps: [{ accept: [m(8, 8)] }],
  },
  {
    id: 'clean-choix-simple',
    title: 'Capture sans risque',
    category: 'clean-capture',
    difficulty: 1,
    objective: 'Trait à X · Prends la zone B2 sans offrir de coup libre à O.',
    hint: 'Deux cases capturent B2, mais la zone A1 est déjà verrouillée : choisis l’autre diagonale.',
    explanation:
      'Jouer en A1 capturerait B2, mais renverrait O sur la zone A1 déjà fermée — lui offrant un coup libre. La case A3 capture aussi B2 tout en confinant O dans A3.',
    setupMoves: [
      m(4, 4), m(4, 7), m(7, 0), m(0, 6), m(6, 0), m(0, 3),
      m(3, 4), m(4, 3), m(3, 0), m(0, 0), m(4, 2), m(2, 4),
      m(4, 1), m(1, 4),
    ],
    steps: [{ accept: [m(4, 6)] }],
  },
  {
    id: 'trap2-couloir-unique',
    title: 'Le couloir forcé',
    category: 'trap2',
    difficulty: 1,
    objective: 'Trait à X · Force la victoire en 2 coups en piégeant O sur son renvoi.',
    hint: 'Envoie O dans la zone B3 : il n’y reste qu’une seule case vide, et elle te renvoie exactement là où tu gagnes.',
    explanation:
      'X joue en case B3 (zone B2) pour expédier O dans B3, où seule la case C1 est libre. O est contraint de jouer C1 et renvoie X en zone C1 pour clore la première ligne en C3.',
    setupMoves: [
      m(0, 2), m(2, 2), m(2, 4), m(4, 2), m(2, 0), m(0, 7),
      m(7, 7), m(7, 4), m(4, 1), m(1, 1), m(1, 3), m(3, 0),
      m(0, 1), m(1, 7), m(7, 8), m(8, 0), m(0, 0), m(7, 1),
      m(1, 6), m(6, 1), m(1, 0), m(2, 7), m(7, 3), m(3, 1),
      m(7, 0), m(7, 5), m(5, 0), m(8, 1), m(4, 0), m(7, 6),
      m(6, 0), m(3, 4),
    ],
    steps: [
      { accept: [m(4, 7)], reply: m(7, 2) },
      { accept: [m(2, 8)] },
    ],
  },
  {
    id: 'mate1-libre-colonne',
    title: 'Coup libre fatal',
    category: 'mate1',
    difficulty: 1,
    objective: 'Trait à X (coup libre) · Choisis la bonne zone et termine la partie immédiatement.',
    hint: 'Ne te laisse pas distraire par C2 ou C3 : quelle zone complète ta colonne de gauche ?',
    explanation:
      'Avec un coup libre, X peut prendre plusieurs zones, mais seule la zone A2 relie A1 et A3. La case A2 complète la colonne locale et scelle la victoire globale.',
    setupMoves: [
      m(0, 1), m(1, 0), m(0, 2), m(2, 0), m(0, 0), m(1, 6),
      m(6, 0), m(1, 3), m(3, 0), m(4, 1), m(8, 3), m(3, 8),
      m(8, 0), m(4, 7), m(7, 1), m(4, 4), m(5, 1), m(3, 4),
      m(6, 4), m(5, 4), m(3, 6), m(6, 1), m(6, 8), m(8, 2),
      m(2, 4), m(2, 1), m(5, 0), m(2, 6),
    ],
    steps: [{ accept: [m(3, 3)] }],
  },
  {
    id: 'clean-eviter-mat-libre',
    title: 'Le coup libre mortel',
    category: 'clean-capture',
    difficulty: 2,
    objective: 'Trait à X · Capture la zone C2 sans déclencher un coup libre qui ferait gagner O.',
    hint: 'O menace la colonne de gauche en A3 : vérifie si la zone C1 est libre avant de compléter la ligne du haut.',
    explanation:
      'Capturer C2 par la case C1 renverrait O sur C1 (déjà prise par X), donnant à O un coup libre gagnant en A3 ! En prenant C2 par la case C3, X verrouille la zone et garde O sous contrôle.',
    setupMoves: [
      m(2, 0), m(0, 3), m(3, 3), m(3, 2), m(2, 8), m(8, 2),
      m(2, 4), m(4, 2), m(5, 0), m(0, 0), m(0, 2), m(0, 6),
      m(6, 2), m(3, 0), m(5, 1), m(1, 2), m(5, 4), m(4, 0),
      m(8, 0), m(3, 1), m(1, 0), m(5, 3), m(8, 3), m(6, 0),
      m(7, 0), m(6, 4), m(4, 3), m(5, 7), m(7, 2), m(1, 5),
    ],
    steps: [{ accept: [m(5, 8)] }],
  },
  {
    id: 'trap2-rebond-libre',
    title: 'Rebond vers le coup libre',
    category: 'trap2',
    difficulty: 2,
    objective: 'Trait à X · Prends B2 de manière à obtenir un coup libre gagnant au tour suivant.',
    hint: 'Capture B2 par la case qui envoie O dans C2 : sa seule case libre pointe sur une zone déjà verrouillée.',
    explanation:
      'Prendre B2 via C2 (et non A2) enferme O dans C2, où seule la case A1 reste libre. Comme A1 appartient déjà à X, O doit céder un coup libre qui permet à X de conclure en C3 (case A3).',
    setupMoves: [
      m(0, 0), m(0, 5), m(5, 4), m(4, 4), m(4, 8), m(8, 5),
      m(5, 5), m(5, 8), m(8, 0), m(0, 4), m(4, 2), m(2, 0),
      m(0, 1), m(1, 0), m(0, 2), m(2, 5), m(5, 6), m(6, 0),
      m(8, 3), m(3, 0), m(4, 0), m(5, 3), m(3, 5), m(5, 2),
      m(2, 4), m(4, 1), m(1, 5), m(5, 7), m(7, 7), m(7, 0),
      m(5, 1), m(1, 4), m(4, 6), m(6, 4),
    ],
    steps: [
      { accept: [m(4, 5)], reply: m(5, 0) },
      { accept: [m(8, 6)] },
    ],
  },
  {
    id: 'mate1-o-contre-attaque',
    title: 'Contre-attaque éclair',
    category: 'mate1',
    difficulty: 2,
    objective: 'Trait à O · Frappe avant X et termine la partie en un coup dans C3.',
    hint: 'Inutile de parer la menace locale de X en C2 : tu as déjà deux O alignés sur la colonne gauche de C3.',
    explanation:
      'O tient déjà C1 et C2. Plutôt que de défendre, O complète la colonne gauche de C3 en jouant la case A2, alignant aussitôt C1–C2–C3.',
    setupMoves: [
      m(0, 2), m(2, 0), m(0, 1), m(1, 0), m(0, 0), m(2, 3),
      m(3, 6), m(6, 3), m(3, 0), m(2, 6), m(6, 0), m(5, 2),
      m(3, 3), m(5, 5), m(5, 0), m(5, 8), m(8, 5), m(8, 0),
      m(8, 2), m(8, 6), m(6, 1), m(1, 3), m(1, 8),
    ],
    steps: [{ accept: [m(8, 3)] }],
  },
  {
    id: 'clean-coup-libre-propre',
    title: 'La bonne zone à prendre',
    category: 'clean-capture',
    difficulty: 2,
    objective: 'Trait à O (coup libre) · Capture une zone sans rendre un coup libre à X.',
    hint: 'Les prises en A2 et C2 renvoient vers les coins verrouillés A1 et C1. Cherche une capture propre au bas du plateau.',
    explanation:
      'Prendre A2 (via A1) ou C2 (via C1) renvoie X sur une zone verrouillée et lui offre la victoire immédiate en B1 ! Seule la capture de B3 par la case A3 maintient X prisonnier d’une zone active.',
    setupMoves: [
      m(0, 0), m(0, 3), m(3, 7), m(7, 3), m(3, 3), m(3, 2),
      m(2, 0), m(0, 7), m(7, 2), m(2, 2), m(2, 4), m(4, 2),
      m(2, 8), m(8, 0), m(0, 2), m(5, 0), m(0, 1), m(1, 0),
      m(8, 2), m(7, 0), m(5, 4), m(4, 7), m(7, 8), m(8, 5),
      m(5, 6), m(6, 0), m(4, 0), m(3, 1), m(1, 5), m(5, 1),
      m(1, 2),
    ],
    steps: [{ accept: [m(7, 6)] }],
  },
  {
    id: 'trap2-o-double-renvoi',
    title: 'L’étau de O',
    category: 'trap2',
    difficulty: 2,
    objective: 'Trait à O · Enferme X dans une zone sans issue pour gagner en 2 coups.',
    hint: 'Observe la zone A2 : toutes ses cases vides mènent soit vers une zone verrouillée, soit directement vers C3.',
    explanation:
      'En jouant A2 depuis C2, O jette X dans l’étau de A2 : quelle que soit la case choisie par X, O obtient un coup libre ou est renvoyé en C3, où la case B2 complète la ligne du bas A3–B3–C3.',
    setupMoves: [
      m(5, 7), m(7, 3), m(3, 5), m(5, 8), m(8, 2), m(2, 2),
      m(2, 8), m(8, 8), m(8, 5), m(5, 6), m(6, 7), m(7, 0),
      m(0, 2), m(2, 3), m(3, 3), m(3, 4), m(4, 7), m(7, 6),
      m(6, 8), m(8, 0), m(0, 1), m(1, 0), m(0, 0), m(6, 2),
      m(2, 0), m(6, 0), m(2, 4), m(4, 2), m(5, 2), m(6, 1),
      m(1, 2), m(4, 0), m(5, 0), m(3, 1), m(1, 5),
    ],
    steps: [
      { accept: [m(5, 3)], reply: m(3, 7) },
      { accept: [m(8, 4)] },
    ],
  },
  {
    id: 'mate1-libre-double-piege',
    title: 'L’alignement caché',
    category: 'mate1',
    difficulty: 2,
    objective: 'Trait à O (coup libre) · Plusieurs captures s’offrent à toi, une seule gagne tout de suite.',
    hint: 'O possède déjà C1 et B2 : cherche la diagonale gagnante dans le coin inférieur gauche.',
    explanation:
      'A2 et B3 sont tentantes mais ne suffisent pas. En jouant la case A3 dans la zone A3, O achève la diagonale locale et remporte la grande diagonale C1–B2–A3.',
    setupMoves: [
      m(1, 4), m(4, 0), m(0, 2), m(2, 1), m(1, 7), m(7, 7),
      m(7, 3), m(3, 1), m(1, 1), m(2, 0), m(0, 1), m(2, 2),
      m(0, 0), m(6, 2), m(3, 3), m(3, 0), m(6, 0), m(4, 4),
      m(4, 2), m(4, 8), m(8, 2), m(7, 1), m(6, 8), m(8, 4),
      m(5, 0), m(6, 4), m(5, 1),
    ],
    steps: [{ accept: [m(6, 6)] }],
  },
  {
    id: 'clean-auto-renvoi',
    title: 'Le piège de l’auto-renvoi',
    category: 'clean-capture',
    difficulty: 3,
    objective: 'Trait à X · Prends la zone centrale B2 sans déclencher de coup libre.',
    hint: 'Attention : si tu captures B2 en jouant sa case centrale B2, tu verrouilles la cible même du renvoi !',
    explanation:
      'Classique du Super Morpion : gagner une zone en jouant sa propre coordonnée (B2 dans B2) la verrouille aussitôt et offre un coup libre à l’adversaire. La case A3 capture B2 proprement et renvoie O en A3.',
    setupMoves: [
      m(4, 8), m(8, 4), m(4, 0), m(0, 6), m(6, 4), m(4, 1),
      m(1, 4), m(4, 5), m(5, 2), m(2, 4), m(4, 3), m(3, 4),
    ],
    steps: [{ accept: [m(4, 6)] }],
  },
  {
    id: 'trap2-fourchette-globale',
    title: 'La fourchette globale',
    category: 'trap2',
    difficulty: 3,
    objective: 'Trait à X · Crée une double menace imparable pour gagner en 2 coups.',
    hint: 'Prends B2 par la case qui envoie O en C3 : s’il pare la menace locale en A3, il t’ouvre la seconde diagonale.',
    explanation:
      'En capturant B2 par la case C3, X menace simultanément les deux grandes diagonales (en A3 et en C3). En C3, O ne peut que parer en A3 — ce qui renvoie directement X en A3 pour le coup de grâce !',
    setupMoves: [
      m(0, 0), m(0, 6), m(6, 4), m(4, 4), m(4, 0), m(0, 4),
      m(4, 2), m(2, 2), m(2, 0), m(0, 8), m(8, 7), m(7, 0),
      m(0, 2), m(2, 4), m(4, 5), m(5, 0), m(0, 1), m(1, 0),
      m(2, 6), m(6, 1), m(1, 8), m(8, 5), m(5, 3), m(3, 0),
      m(2, 3), m(3, 2), m(4, 6), m(6, 5), m(5, 8), m(8, 1),
      m(1, 4), m(4, 1), m(1, 2), m(7, 2), m(8, 8), m(8, 3),
      m(3, 5), m(5, 2), m(6, 2), m(3, 4),
    ],
    steps: [
      { accept: [m(4, 8)], reply: m(8, 6) },
      { accept: [m(6, 6)] },
    ],
  },
  {
    id: 'mate1-centre-cle',
    title: 'Le pivot central',
    category: 'mate1',
    difficulty: 3,
    objective: 'Trait à X (coup libre) · Trouve l’unique case gagnante au cœur d’un plateau chargé.',
    hint: 'X tient A2 et C2 : dans la zone centrale B2 très encombrée, une diagonale inverse n’attend qu’une pièce.',
    explanation:
      'Malgré les apparences de B1 et A3, la clé se trouve au centre absolu : jouer B2 dans la zone B2 complète la diagonale C1–B2–A3 locale et relie A2–B2–C2 globalement.',
    setupMoves: [
      m(3, 0), m(0, 4), m(4, 6), m(6, 5), m(5, 1), m(1, 6),
      m(6, 0), m(0, 8), m(8, 4), m(4, 1), m(1, 0), m(0, 0),
      m(5, 0), m(8, 3), m(3, 6), m(6, 2), m(2, 0), m(8, 0),
      m(3, 3), m(8, 6), m(6, 3), m(4, 0), m(5, 2), m(2, 1),
      m(1, 1), m(1, 4), m(4, 2), m(2, 8), m(7, 3), m(4, 3),
      m(2, 3), m(4, 5),
    ],
    steps: [{ accept: [m(4, 4)] }],
  },
  {
    id: 'clean-double-prise',
    title: 'Double prise chirurgicale',
    category: 'clean-capture',
    difficulty: 3,
    objective: 'Trait à X · Enchaîne deux captures de zone propres sans jamais offrir de coup libre.',
    hint: 'A1 et C1 sont verrouillées : évite d’y renvoyer O en prenant d’abord A2 (via B3), puis C2 (via C3).',
    explanation:
      'D’abord, X prend A2 par B3 au lieu d’A1 (verrouillée). O répond en renvoyant X dans C2, où X résiste au piège de C1 et capture proprement par la diagonale en C3.',
    setupMoves: [
      m(0, 2), m(2, 0), m(0, 1), m(1, 0), m(0, 0), m(2, 1),
      m(1, 2), m(2, 2), m(3, 2), m(5, 7), m(7, 4), m(4, 5),
      m(5, 0), m(5, 3), m(3, 1), m(1, 3), m(3, 4), m(4, 0),
      m(6, 0), m(3, 6), m(6, 2), m(3, 8), m(8, 0), m(7, 0),
      m(5, 1), m(1, 5), m(5, 4), m(4, 3),
    ],
    steps: [
      { accept: [m(3, 7)], reply: m(7, 5) },
      { accept: [m(5, 8)] },
    ],
  },
  {
    id: 'trap2-preparation-silencieuse',
    title: 'Le coup silencieux',
    category: 'trap2',
    difficulty: 3,
    objective: 'Trait à X · Aucune prise directe : trouve le coup calme qui garantit la victoire en 2 coups.',
    hint: 'Prépare une menace sur la colonne gauche de B2 tout en envoyant O dans A2, où toutes les issues te ramènent à la victoire.',
    explanation:
      'Sans capturer immédiatement, X joue en A2 dans la zone B2 : cela crée une menace gagnante en A3 tout en enfermant O dans A2, dont les seules cases vides (B1, B2, B3) renvoient X en B2 ou offrent un coup libre décisif.',
    setupMoves: [
      m(1, 2), m(2, 1), m(1, 1), m(1, 7), m(7, 6), m(6, 1),
      m(1, 0), m(0, 7), m(7, 0), m(0, 1), m(7, 3), m(3, 5),
      m(5, 8), m(8, 3), m(3, 3), m(3, 6), m(6, 7), m(3, 2),
      m(2, 4), m(4, 5), m(5, 7), m(8, 7), m(4, 0), m(0, 3),
      m(3, 8), m(8, 1), m(3, 0), m(0, 5), m(5, 1), m(4, 2),
      m(2, 7), m(5, 4),
    ],
    steps: [
      { accept: [m(4, 3)], reply: m(3, 4) },
      { accept: [m(4, 6)] },
    ],
  },
];

const EPOCH_UTC_MS = Date.UTC(2026, 0, 1);
const MS_PER_DAY = 86_400_000;

/** Reconstruit l'état exact d'un puzzle en rejouant ses coups légaux depuis le début. */
export function buildPuzzleState(puzzle: DailyPuzzle): GameState {
  let state = createInitialState('X');
  for (let i = 0; i < puzzle.setupMoves.length; i++) {
    const move = puzzle.setupMoves[i];
    const result = applyMove(state, move);
    if (!result.ok) {
      throw new Error(
        `Coup de préparation invalide #${i + 1} dans « ${puzzle.id} » : ${result.error}`,
      );
    }
    state = result.state;
  }
  return state;
}

/** Formate une date locale en clé canonique YYYY-MM-DD. */
export function getDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Retourne le numéro incrémental du défi du jour depuis le 2026-01-01 (n° 1). */
export function getPuzzleNumber(date: Date = new Date()): number {
  const localDayUtc = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  return Math.floor((localDayUtc - EPOCH_UTC_MS) / MS_PER_DAY) + 1;
}

/** Sélectionne de manière déterministe le défi correspondant à une date donnée. */
export function getDailyPuzzle(date: Date = new Date()): {
  puzzle: DailyPuzzle;
  number: number;
  dateKey: string;
} {
  const dateKey = getDateKey(date);
  const number = getPuzzleNumber(date);
  const total = DAILY_PUZZLES.length;
  const index = (((number - 1) % total) + total) % total;
  return {
    puzzle: DAILY_PUZZLES[index],
    number,
    dateKey,
  };
}
