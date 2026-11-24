import {
  WIN_LINES,
  applyMove,
  getLegalMoves,
  getOpponent,
  type GameState,
  type Move,
  type Player,
  type SubBoardState,
} from './gameEngine';

export interface BotLevelProfile {
  /** Palier de 1 (Novice) à 10 (Souverain). */
  level: number;
  /** Nom affiché du palier. */
  label: string;
  /** Classement Elo indicatif du bot à ce palier. */
  elo: number;
  /** Description courte du style de jeu algorithmique. */
  style: string;
  /** Profondeur maximale de recherche alpha-bêta. */
  maxDepth: number;
  /** Budget maximal de nœuds explorés par coup (garantit 0 freeze UI). */
  nodeBudget: number;
  /** Budget temps maximal en ms. */
  timeBudgetMs: number;
  /** Poids de la gestion des renvois et coups libres (0 = aveugle, 1 = complet). */
  redirectAwareness: number;
  /** Poids de l'évaluation globale 3×3 (0.35 = myope, 1 = stratège). */
  macroAwareness: number;
  /** Probabilité de jouer un coup légèrement sous-optimal parmi les meilleurs. */
  mistakeRate: number;
  /** Amplitude du bruit heuristique (en points d'évaluation) pour les bas paliers. */
  evalNoise: number;
}

export const BOT_MIN_LEVEL = 1;
export const BOT_MAX_LEVEL = 10;

export const BOT_LEVELS: readonly BotLevelProfile[] = [
  {
    level: 1,
    label: 'Novice',
    elo: 850,
    style: 'Coups simples, découvre les renvois',
    maxDepth: 1,
    nodeBudget: 120,
    timeBudgetMs: 12,
    redirectAwareness: 0.08,
    macroAwareness: 0.3,
    mistakeRate: 0.45,
    evalNoise: 140,
  },
  {
    level: 2,
    label: 'Apprenti',
    elo: 1000,
    style: 'Voit les alignements évidents',
    maxDepth: 1,
    nodeBudget: 250,
    timeBudgetMs: 16,
    redirectAwareness: 0.2,
    macroAwareness: 0.45,
    mistakeRate: 0.3,
    evalNoise: 85,
  },
  {
    level: 3,
    label: 'Initié',
    elo: 1120,
    style: 'Bloque les menaces directes',
    maxDepth: 2,
    nodeBudget: 700,
    timeBudgetMs: 22,
    redirectAwareness: 0.35,
    macroAwareness: 0.6,
    mistakeRate: 0.2,
    evalNoise: 48,
  },
  {
    level: 4,
    label: 'Tacticien',
    elo: 1240,
    style: 'Évite les coups libres offerts',
    maxDepth: 2,
    nodeBudget: 1600,
    timeBudgetMs: 28,
    redirectAwareness: 0.55,
    macroAwareness: 0.75,
    mistakeRate: 0.13,
    evalNoise: 28,
  },
  {
    level: 5,
    label: 'Confirmé',
    elo: 1360,
    style: 'Anticipe les captures locales',
    maxDepth: 3,
    nodeBudget: 3200,
    timeBudgetMs: 36,
    redirectAwareness: 0.75,
    macroAwareness: 0.85,
    mistakeRate: 0.08,
    evalNoise: 15,
  },
  {
    level: 6,
    label: 'Stratège',
    elo: 1480,
    style: 'Contrôle le centre et les renvois',
    maxDepth: 3,
    nodeBudget: 6200,
    timeBudgetMs: 44,
    redirectAwareness: 0.9,
    macroAwareness: 0.95,
    mistakeRate: 0.04,
    evalNoise: 7,
  },
  {
    level: 7,
    label: 'Expert',
    elo: 1620,
    style: 'Calcule les pièges sur 3 à 4 coups',
    maxDepth: 4,
    nodeBudget: 11000,
    timeBudgetMs: 52,
    redirectAwareness: 1,
    macroAwareness: 1,
    mistakeRate: 0.02,
    evalNoise: 3,
  },
  {
    level: 8,
    label: 'Maître',
    elo: 1780,
    style: 'Domine la grille globale',
    maxDepth: 4,
    nodeBudget: 18500,
    timeBudgetMs: 60,
    redirectAwareness: 1,
    macroAwareness: 1,
    mistakeRate: 0,
    evalNoise: 1,
  },
  {
    level: 9,
    label: 'Grand Maître',
    elo: 1940,
    style: 'Recherche profonde en finale',
    maxDepth: 5,
    nodeBudget: 30000,
    timeBudgetMs: 70,
    redirectAwareness: 1,
    macroAwareness: 1,
    mistakeRate: 0,
    evalNoise: 0,
  },
  {
    level: 10,
    label: 'Souverain',
    elo: 2100,
    style: 'Calcul maximal, zéro concession',
    maxDepth: 6,
    nodeBudget: 48000,
    timeBudgetMs: 85,
    redirectAwareness: 1,
    macroAwareness: 1,
    mistakeRate: 0,
    evalNoise: 0,
  },
];

export function clampBotLevel(level: number): number {
  if (!Number.isFinite(level)) return 4;
  return Math.max(BOT_MIN_LEVEL, Math.min(BOT_MAX_LEVEL, Math.round(level)));
}

export function getBotLevelProfile(level: number): BotLevelProfile {
  const clamped = clampBotLevel(level);
  return BOT_LEVELS[clamped - 1];
}

/**
 * Calibre le niveau initial du bot directement d'après l'Elo du joueur
 * (légèrement au niveau du joueur pour un duel équilibré dès la 1re partie).
 */
export function calibrateBotLevelFromElo(playerElo: number): number {
  if (!Number.isFinite(playerElo)) return 4;
  let best = BOT_LEVELS[0];
  let bestDiff = Math.abs(playerElo - best.elo);
  for (const profile of BOT_LEVELS) {
    const diff = Math.abs(playerElo - profile.elo);
    if (diff < bestDiff) {
      best = profile;
      bestDiff = diff;
    }
  }
  return best.level;
}

export interface BotProgressState {
  /** Niveau actuel du bot (1..10). */
  level: number;
  /** Plus haut niveau atteint (ou vaincu + 1). */
  peakLevel: number;
  /** Plus haut niveau battu par le joueur (null si aucune victoire encore). */
  highestDefeatedLevel: number | null;
  wins: number;
  draws: number;
  losses: number;
  /** Série de victoires consécutives contre le bot. */
  winStreak: number;
  /** Défaites consécutives au niveau actuel (pour suggérer un ajustement). */
  consecutiveLosses: number;
  /** Elo du joueur lors du dernier calibrage. */
  calibratedElo: number;
}

export function createInitialBotProgress(playerElo: number): BotProgressState {
  const level = calibrateBotLevelFromElo(playerElo);
  return {
    level,
    peakLevel: level,
    highestDefeatedLevel: null,
    wins: 0,
    draws: 0,
    losses: 0,
    winStreak: 0,
    consecutiveLosses: 0,
    calibratedElo: Math.round(playerElo),
  };
}

export interface BotMatchOutcomeUpdate {
  next: BotProgressState;
  previousLevel: number;
  evolved: boolean;
  /** Vrai si le joueur vient de battre le niveau maximal (Niv. 10). */
  masteredMaxLevel: boolean;
}

/**
 * Fait évoluer le niveau du bot après une partie :
 * - Si le joueur gagne : le bot monte immédiatement d'un palier (+1, jusqu'à Niv. 10)
 *   et devient plus fort.
 * - Si nul ou défaite : le bot conserve son niveau pour la revanche, et suit les défaites
 *   consécutives afin de proposer un ajustement facultatif si besoin.
 */
export function evolveBotProgress(
  current: BotProgressState,
  outcome: 'win' | 'loss' | 'draw',
): BotMatchOutcomeUpdate {
  const previousLevel = clampBotLevel(current.level);

  if (outcome === 'win') {
    const nextLevel = clampBotLevel(previousLevel + 1);
    const evolved = nextLevel > previousLevel;
    const highestDefeated =
      current.highestDefeatedLevel === null
        ? previousLevel
        : Math.max(current.highestDefeatedLevel, previousLevel);

    return {
      next: {
        ...current,
        level: nextLevel,
        peakLevel: Math.max(current.peakLevel, nextLevel),
        highestDefeatedLevel: highestDefeated,
        wins: current.wins + 1,
        winStreak: current.winStreak + 1,
        consecutiveLosses: 0,
      },
      previousLevel,
      evolved,
      masteredMaxLevel: previousLevel === BOT_MAX_LEVEL,
    };
  }

  if (outcome === 'draw') {
    return {
      next: {
        ...current,
        draws: current.draws + 1,
        winStreak: 0,
        consecutiveLosses: 0,
      },
      previousLevel,
      evolved: false,
      masteredMaxLevel: false,
    };
  }

  return {
    next: {
      ...current,
      losses: current.losses + 1,
      winStreak: 0,
      consecutiveLosses: current.consecutiveLosses + 1,
    },
    previousLevel,
    evolved: false,
    masteredMaxLevel: false,
  };
}

// Poids positionnels d'une grille 3×3 (centre > coins > bords)
const CELL_WEIGHTS = [3, 1.5, 3, 1.5, 5.5, 1.5, 3, 1.5, 3] as const;
const ZONE_IMPORTANCE = [1.25, 0.9, 1.25, 0.9, 1.75, 0.9, 1.25, 0.9, 1.25] as const;

const WIN_SCORE = 100_000;

/** Compte les menaces immédiates (2 pions + 1 case vide) dans une sous-grille active. */
function countLocalThreats(board: SubBoardState, player: Player): number {
  if (board.status !== 'active') return 0;
  let threats = 0;
  const cells = board.cells;
  for (let i = 0; i < WIN_LINES.length; i++) {
    const [a, b, c] = WIN_LINES[i];
    let own = 0;
    let empty = 0;
    const ca = cells[a];
    const cb = cells[b];
    const cc = cells[c];
    if (ca === player) own++;
    else if (ca === null) empty++;
    if (cb === player) own++;
    else if (cb === null) empty++;
    if (cc === player) own++;
    else if (cc === null) empty++;
    if (own === 2 && empty === 1) threats++;
  }
  return threats;
}

/** Évalue une sous-grille active pour `botPlayer`. */
function evaluateSubBoard(board: SubBoardState, botPlayer: Player): number {
  if (board.status !== 'active') return 0;
  const opp = getOpponent(botPlayer);
  const cells = board.cells;
  let score = 0;

  for (let i = 0; i < 9; i++) {
    const v = cells[i];
    if (v === botPlayer) score += CELL_WEIGHTS[i];
    else if (v === opp) score -= CELL_WEIGHTS[i];
  }

  for (let i = 0; i < WIN_LINES.length; i++) {
    const [a, b, c] = WIN_LINES[i];
    let botCount = 0;
    let oppCount = 0;
    if (cells[a] === botPlayer) botCount++;
    else if (cells[a] === opp) oppCount++;
    if (cells[b] === botPlayer) botCount++;
    else if (cells[b] === opp) oppCount++;
    if (cells[c] === botPlayer) botCount++;
    else if (cells[c] === opp) oppCount++;

    if (botCount === 2 && oppCount === 0) score += 22;
    else if (oppCount === 2 && botCount === 0) score -= 24;
    else if (botCount === 1 && oppCount === 0) score += 3.5;
    else if (oppCount === 1 && botCount === 0) score -= 3.5;
  }

  return score;
}

/**
 * Fonction d'évaluation heuristique d'un état complet de Super Morpion
 * du point de vue de `botPlayer`.
 */
export function evaluatePosition(
  state: GameState,
  botPlayer: Player,
  profile: BotLevelProfile,
): number {
  const opp = getOpponent(botPlayer);

  if (state.status === 'won') {
    return state.winner === botPlayer ? WIN_SCORE : -WIN_SCORE;
  }
  if (state.status === 'draw') {
    return 0;
  }

  let score = 0;
  const boards = state.boards;

  // 1. Contrôle des zones capturées & lignes globales 3×3
  const macroFactor = profile.macroAwareness;
  for (let b = 0; b < 9; b++) {
    const status = boards[b].status;
    if (status === botPlayer) {
      score += 115 * ZONE_IMPORTANCE[b] * macroFactor;
    } else if (status === opp) {
      score -= 120 * ZONE_IMPORTANCE[b] * macroFactor;
    } else if (status === 'active') {
      score += evaluateSubBoard(boards[b], botPlayer) * ZONE_IMPORTANCE[b];
    }
  }

  for (let i = 0; i < WIN_LINES.length; i++) {
    const [a, b, c] = WIN_LINES[i];
    let botOwned = 0;
    let oppOwned = 0;
    let drawCount = 0;

    const sa = boards[a].status;
    const sb = boards[b].status;
    const sc = boards[c].status;

    if (sa === botPlayer) botOwned++;
    else if (sa === opp) oppOwned++;
    else if (sa === 'draw') drawCount++;

    if (sb === botPlayer) botOwned++;
    else if (sb === opp) oppOwned++;
    else if (sb === 'draw') drawCount++;

    if (sc === botPlayer) botOwned++;
    else if (sc === opp) oppOwned++;
    else if (sc === 'draw') drawCount++;

    // Une ligne contenant un nul ou les deux joueurs est morte
    if (drawCount > 0 || (botOwned > 0 && oppOwned > 0)) continue;

    if (botOwned === 2) score += 340 * macroFactor;
    else if (oppOwned === 2) score -= 375 * macroFactor;
    else if (botOwned === 1) score += 52 * macroFactor;
    else if (oppOwned === 1) score -= 56 * macroFactor;
  }

  // 2. Initiative & danger du renvoi / coup libre
  const redirectFactor = profile.redirectAwareness;
  if (redirectFactor > 0) {
    const toMove = state.currentPlayer;
    const sign = toMove === botPlayer ? 1 : -1;

    if (state.activeBoard === null) {
      // Celui qui a le coup libre dispose d'un fort avantage tactique
      score += sign * 95 * redirectFactor;
    } else {
      const target = boards[state.activeBoard];
      const threats = countLocalThreats(target, toMove);
      if (threats > 0) {
        score += sign * (55 + threats * 25) * redirectFactor;
      }
    }
  }

  return score;
}

/** Tri rapide des coups pour maximiser les coupes alpha-bêta. */
function scoreMoveForOrdering(
  state: GameState,
  move: Move,
  profile: BotLevelProfile,
): number {
  const player = state.currentPlayer;
  const opp = getOpponent(player);
  const board = state.boards[move.boardIndex];
  let priority = CELL_WEIGHTS[move.cellIndex] * 3 + ZONE_IMPORTANCE[move.boardIndex] * 4;

  // Vérifie rapidement si le coup capture ou bloque la sous-grille locale
  let captures = false;
  let blocks = false;
  for (let i = 0; i < WIN_LINES.length; i++) {
    const [a, b, c] = WIN_LINES[i];
    if (a !== move.cellIndex && b !== move.cellIndex && c !== move.cellIndex) continue;
    const o1 = a === move.cellIndex ? b : a;
    const o2 = c === move.cellIndex ? b : c;
    const v1 = board.cells[o1];
    const v2 = board.cells[o2];
    if (v1 === player && v2 === player) captures = true;
    if (v1 === opp && v2 === opp) blocks = true;
  }

  if (captures) priority += 220;
  if (blocks) priority += 120;

  // Évite en priorité de renvoyer l'adversaire sur une zone fermée (coup libre)
  if (profile.redirectAwareness > 0.25) {
    const destStatus =
      move.cellIndex === move.boardIndex && captures
        ? player
        : state.boards[move.cellIndex].status;
    if (destStatus !== 'active') {
      priority -= 90 * profile.redirectAwareness;
    } else {
      const oppThreatsInDest = countLocalThreats(state.boards[move.cellIndex], opp);
      priority -= oppThreatsInDest * 45 * profile.redirectAwareness;
    }
  }

  return priority;
}

interface SearchContext {
  botPlayer: Player;
  profile: BotLevelProfile;
  nodes: number;
  deadlineMs: number;
  aborted: boolean;
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function alphaBeta(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  ctx: SearchContext,
): number {
  ctx.nodes++;
  if ((ctx.nodes & 127) === 0) {
    if (ctx.nodes >= ctx.profile.nodeBudget || nowMs() >= ctx.deadlineMs) {
      ctx.aborted = true;
      return evaluatePosition(state, ctx.botPlayer, ctx.profile);
    }
  }

  if (state.status === 'won') {
    const bonus = depth * 120;
    return state.winner === ctx.botPlayer ? WIN_SCORE + bonus : -(WIN_SCORE + bonus);
  }
  if (state.status === 'draw') {
    return 0;
  }
  if (depth <= 0) {
    return evaluatePosition(state, ctx.botPlayer, ctx.profile);
  }

  const moves = getLegalMoves(state);
  if (moves.length === 0) {
    return evaluatePosition(state, ctx.botPlayer, ctx.profile);
  }

  // En coup libre (jusqu'à 45+ coups), limite la largeur aux meilleurs candidats à profondeur interne
  const ordered = moves
    .map((move) => ({ move, order: scoreMoveForOrdering(state, move, ctx.profile) }))
    .sort((a, b) => b.order - a.order);

  const widthLimit =
    state.activeBoard === null
      ? depth >= 3
        ? 14
        : 18
      : 9;
  const limit = Math.min(ordered.length, widthLimit);

  if (maximizing) {
    let best = -Infinity;
    for (let i = 0; i < limit; i++) {
      const res = applyMove(state, ordered[i].move);
      if (!res.ok) continue;
      const val = alphaBeta(res.state, depth - 1, alpha, beta, false, ctx);
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (beta <= alpha || ctx.aborted) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < limit; i++) {
      const res = applyMove(state, ordered[i].move);
      if (!res.ok) continue;
      const val = alphaBeta(res.state, depth - 1, alpha, beta, true, ctx);
      if (val < best) best = val;
      if (best < beta) beta = best;
      if (beta <= alpha || ctx.aborted) break;
    }
    return best;
  }
}

export interface BotChoiceResult {
  move: Move;
  score: number;
  depthReached: number;
  nodesEvaluated: number;
}

/**
 * Sélectionne le coup du bot pour un état de jeu et un palier (1..10).
 * Utilise un approfondissement itératif alpha-bêta borné en nœuds et en temps,
 * puis applique la signature d'erreur contrôlée du palier pour un rendu naturel.
 */
export function chooseBotMove(
  state: GameState,
  level: number,
  rng: () => number = Math.random,
): BotChoiceResult | null {
  const legalMoves = getLegalMoves(state);
  if (legalMoves.length === 0) return null;
  if (legalMoves.length === 1) {
    return { move: legalMoves[0], score: 0, depthReached: 0, nodesEvaluated: 1 };
  }

  const profile = getBotLevelProfile(level);
  const botPlayer = state.currentPlayer;

  // Premier coup absolu de la partie : ouverture naturelle centrée (avec variété aux bas niveaux)
  if (state.moveHistory.length === 0) {
    if (profile.level >= 5) {
      return { move: { boardIndex: 4, cellIndex: 4 }, score: 25, depthReached: 1, nodesEvaluated: 1 };
    }
    const openings: Move[] = [
      { boardIndex: 4, cellIndex: 4 },
      { boardIndex: 4, cellIndex: 0 },
      { boardIndex: 0, cellIndex: 4 },
      { boardIndex: 2, cellIndex: 4 },
      { boardIndex: 6, cellIndex: 4 },
    ];
    const pick = openings[Math.floor(rng() * openings.length) % openings.length];
    return { move: pick, score: 10, depthReached: 1, nodesEvaluated: 1 };
  }

  // Victoire globale immédiate en 1 coup : toujours prise à partir du niveau 2 (et 70 % au niveau 1)
  for (const move of legalMoves) {
    const res = applyMove(state, move);
    if (res.ok && res.state.status === 'won' && res.state.winner === botPlayer) {
      if (profile.level >= 2 || rng() < 0.7) {
        return { move, score: WIN_SCORE, depthReached: 1, nodesEvaluated: legalMoves.length };
      }
    }
  }

  const orderedRoot = legalMoves
    .map((move) => ({ move, order: scoreMoveForOrdering(state, move, profile) }))
    .sort((a, b) => b.order - a.order)
    .map((entry) => entry.move);

  // En coup libre avec beaucoup de cases, on garde les 22 candidats les plus prometteurs à la racine
  const rootCandidates =
    state.activeBoard === null && orderedRoot.length > 22
      ? orderedRoot.slice(0, 22)
      : orderedRoot;

  // Adapte la profondeur en fin de partie quand il reste peu de sous-grilles actives
  const activeBoardsCount = state.boards.filter((b) => b.status === 'active').length;
  const endgameBonus = activeBoardsCount <= 4 && profile.level >= 6 ? 1 : 0;
  const targetDepth = Math.min(7, profile.maxDepth + endgameBonus);

  const startTime = nowMs();
  const deadlineMs = startTime + profile.timeBudgetMs;

  let bestScores: { move: Move; score: number }[] = rootCandidates.map((move) => ({
    move,
    score: 0,
  }));
  let depthReached = 0;
  let totalNodes = 0;

  // Approfondissement itératif (1 -> targetDepth) : garantit toujours une réponse complète même si le budget expire
  for (let depth = 1; depth <= targetDepth; depth++) {
    const ctx: SearchContext = {
      botPlayer,
      profile,
      nodes: totalNodes,
      deadlineMs,
      aborted: false,
    };

    const iterScores: { move: Move; score: number }[] = [];
    let alpha = -Infinity;
    const beta = Infinity;

    for (let i = 0; i < bestScores.length; i++) {
      const move = bestScores[i].move;
      const res = applyMove(state, move);
      if (!res.ok) continue;

      const val = alphaBeta(res.state, depth - 1, alpha, beta, false, ctx);
      iterScores.push({ move, score: val });
      if (val > alpha) alpha = val;
      if (ctx.aborted) break;
    }

    totalNodes = ctx.nodes;

    if (!ctx.aborted && iterScores.length === bestScores.length) {
      iterScores.sort((a, b) => b.score - a.score);
      bestScores = iterScores;
      depthReached = depth;
      // Si un mat forcé est déjà trouvé, inutile de chercher plus loin
      if (bestScores[0].score >= WIN_SCORE - 500) break;
    } else {
      // Garde l'itération précédente complète si la profondeur courante a été coupée
      if (depth === 1 && iterScores.length > 0) {
        iterScores.sort((a, b) => b.score - a.score);
        bestScores = iterScores;
        depthReached = 1;
      }
      break;
    }
  }

  // Bruit contrôlé & imperfections humaines pour les paliers bas / intermédiaires
  if (profile.evalNoise > 0 || profile.mistakeRate > 0) {
    const noisy = bestScores
      .map((entry) => ({
        move: entry.move,
        rawScore: entry.score,
        noisyScore: entry.score + (rng() * 2 - 1) * profile.evalNoise,
      }))
      .sort((a, b) => b.noisyScore - a.noisyScore);

    // Ne gâche jamais une victoire forcée au niveau >= 3
    if (profile.level >= 3 && bestScores[0].score >= WIN_SCORE - 500) {
      return {
        move: bestScores[0].move,
        score: bestScores[0].score,
        depthReached,
        nodesEvaluated: totalNodes,
      };
    }

    if (noisy.length >= 2 && rng() < profile.mistakeRate) {
      const poolSize = Math.min(noisy.length, profile.level <= 2 ? 4 : 3);
      const pickIdx = 1 + Math.floor(rng() * (poolSize - 1));
      const picked = noisy[Math.min(pickIdx, noisy.length - 1)];
      return {
        move: picked.move,
        score: picked.rawScore,
        depthReached,
        nodesEvaluated: totalNodes,
      };
    }

    return {
      move: noisy[0].move,
      score: noisy[0].rawScore,
      depthReached,
      nodesEvaluated: totalNodes,
    };
  }

  // Tie-break léger parmi les coups quasi-équivalents (< 2 pts) pour éviter la monotonie
  const topScore = bestScores[0].score;
  const nearTies = bestScores.filter((e) => topScore - e.score <= 2);
  const chosen = nearTies[Math.floor(rng() * nearTies.length) % nearTies.length];

  return {
    move: chosen.move,
    score: chosen.score,
    depthReached,
    nodesEvaluated: totalNodes,
  };
}
