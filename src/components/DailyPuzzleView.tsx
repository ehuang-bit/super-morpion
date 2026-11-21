import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  BOARD_COORDS,
  applyMove,
  getOpponent,
  type DestinationPreview,
  type GameState,
  type Move,
  type Player,
} from '@shared/gameEngine';
import type { AuthUser } from '@shared/protocol';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Lightbulb,
  Lock,
  RotateCcw,
  Share2,
  Sparkles,
  Star,
  Target,
  Trophy,
} from 'lucide-react';
import {
  DAILY_PUZZLES,
  PUZZLE_CATEGORY_LABELS,
  buildPuzzleState,
  getDailyPuzzle,
  type DailyPuzzle,
} from '../data/dailyPuzzles';
import type { BoardPreferences } from '../types/boardPrefs';
import {
  getDailyStatus,
  recordDailySolve,
  type DailyStatus,
} from '../utils/dailyStorage';
import { haptics } from '../utils/haptics';
import { SMOOTH_EASE, STAMP_SPRING } from '../utils/motion';
import { soundEngine } from '../utils/soundEngine';
import { Confetti } from './Confetti';
import { GlobalBoard } from './GlobalBoard';
import { StreakPill } from './StreakBadge';
import { SymbolMark } from './Symbols';

interface DailyPuzzleViewProps {
  boardPrefs: BoardPreferences;
  user?: AuthUser | null;
  onSolvedDaily?: () => void;
  onOpenAuth?: () => void;
  onBackToPlay: () => void;
}

type PuzzleFeedback =
  | { kind: 'idle' }
  | { kind: 'good'; message: string }
  | { kind: 'wrong'; message: string }
  | { kind: 'solved' };

type TileMark = 'ok' | 'hint' | 'wrong';

function sameMove(a: Move, b: Move): boolean {
  return a.boardIndex === b.boardIndex && a.cellIndex === b.cellIndex;
}

function formatAttemptsLabel(count: number): string {
  return count <= 1 ? '1 essai' : `${count} essais`;
}

function buildWrongMoveMessage(
  puzzle: DailyPuzzle,
  stepIndex: number,
  move: Move,
  capturedBoard: boolean,
  nextState: GameState,
  puzzlePlayer: Player,
): string {
  const opponent = getOpponent(puzzlePlayer);
  const boardCoord = BOARD_COORDS[move.boardIndex];
  const cellCoord = BOARD_COORDS[move.cellIndex];

  if (puzzle.category === 'clean-capture') {
    if (capturedBoard && nextState.isFreeMove) {
      if (move.boardIndex === move.cellIndex) {
        return `Presque ! Tu prends ${boardCoord}, mais jouer la case ${cellCoord} verrouille la cible même du renvoi et offre un coup libre à ${opponent}.`;
      }
      return `Attention au renvoi ! Tu captures bien ${boardCoord}, mais la case ${cellCoord} pointe sur une zone verrouillée : coup libre pour ${opponent}.`;
    }
    return `Ce coup ne capture pas encore la zone. Cherche un alignement de 3 symboles qui laisse ${opponent} sur une zone active.`;
  }

  if (puzzle.category === 'mate1') {
    if (capturedBoard) {
      return `Zone ${boardCoord} prise, mais cela ne forme pas encore un alignement global de 3 zones !`;
    }
    return 'Pas tout à fait : ce coup ne conclut pas la partie immédiatement. Cherche le coup décisif.';
  }

  // Catégorie 'trap2'
  if (stepIndex === 0) {
    if (nextState.isFreeMove) {
      return `Attention : ce coup offre un coup libre à ${opponent}, qui peut aussitôt désamorcer ta menace.`;
    }
    return `Bonne piste, mais en ${cellCoord}, ${opponent} trouve une échappatoire. Cherche un renvoi plus contraignant.`;
  }

  return 'Tu y es presque ! Un coup termine immédiatement l’alignement de 3 zones.';
}

function buildShareTiles(marks: readonly TileMark[]): string {
  const mapped: string[] = marks.map((mark) => {
    if (mark === 'ok') return '🟩';
    if (mark === 'hint') return '🟨';
    return '🟥';
  });
  while (mapped.length < 3) {
    mapped.push('⬜');
  }
  return mapped.slice(0, 6).join('');
}

function DifficultyStars({ level }: { level: 1 | 2 | 3 }) {
  const label =
    level === 1 ? 'Accessible' : level === 2 ? 'Tactique' : 'Expert';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
      style={{
        backgroundColor: 'var(--accent-active-bg)',
        color: 'var(--accent-active-text)',
      }}
      title={`Difficulté : ${label}`}
      aria-label={`Difficulté ${level} sur 3 (${label})`}
    >
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((idx) => (
          <Star
            key={idx}
            className="w-3 h-3"
            strokeWidth={2.2}
            fill={idx <= level ? 'currentColor' : 'none'}
            style={{ opacity: idx <= level ? 1 : 0.3 }}
          />
        ))}
      </span>
      <span>{label}</span>
    </span>
  );
}

export function DailyPuzzleView({
  boardPrefs,
  user = null,
  onSolvedDaily,
  onOpenAuth,
  onBackToPlay,
}: DailyPuzzleViewProps) {
  const reduceMotion = useReducedMotion();

  // Défi du jour déterminé à l'ouverture de la vue
  const daily = useMemo(() => getDailyPuzzle(new Date()), []);
  const dailyCatalogIndex = useMemo(() => {
    const idx = DAILY_PUZZLES.findIndex((p) => p.id === daily.puzzle.id);
    return idx >= 0 ? idx : 0;
  }, [daily.puzzle.id]);

  // Index actif : commence sur le défi du jour, mais permet aussi l'entraînement
  const [selectedIndex, setSelectedIndex] = useState<number>(dailyCatalogIndex);
  const isDailyMode = selectedIndex === dailyCatalogIndex;
  const activePuzzle = DAILY_PUZZLES[selectedIndex] ?? daily.puzzle;

  const [dailyStatus, setDailyStatus] = useState<DailyStatus>(() =>
    getDailyStatus(new Date()),
  );

  // État ludique du défi en cours
  const [boardMountKey, setBoardMountKey] = useState(0);
  const [gameState, setGameState] = useState<GameState>(() =>
    buildPuzzleState(activePuzzle),
  );
  const [stepStartState, setStepStartState] = useState<GameState>(() =>
    buildPuzzleState(activePuzzle),
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [tileMarks, setTileMarks] = useState<TileMark[]>([]);
  const [hintVisible, setHintVisible] = useState(false);
  const [usedHintOnPuzzle, setUsedHintOnPuzzle] = useState(false);
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [isRevertingWrong, setIsRevertingWrong] = useState(false);
  const [shakeCount, setShakeCount] = useState(0);
  const [feedback, setFeedback] = useState<PuzzleFeedback>({ kind: 'idle' });
  const [showConfetti, setShowConfetti] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'shared'>(
    'idle',
  );
  const [hoverInfo, setHoverInfo] = useState<{
    preview: DestinationPreview | null;
    hoveredMove: Move | null;
  }>({ preview: null, hoveredMove: null });

  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const loadPuzzle = useCallback(
    (index: number) => {
      clearTimers();
      const target = DAILY_PUZZLES[index] ?? daily.puzzle;
      const initial = buildPuzzleState(target);
      setSelectedIndex(index);
      setGameState(initial);
      setStepStartState(initial);
      setStepIndex(0);
      setAttempts(0);
      setTileMarks([]);
      setHintVisible(false);
      setUsedHintOnPuzzle(false);
      setIsBotThinking(false);
      setIsRevertingWrong(false);
      setFeedback({ kind: 'idle' });
      setShowConfetti(false);
      setShareState('idle');
      setHoverInfo({ preview: null, hoveredMove: null });
      setBoardMountKey((k) => k + 1);
    },
    [clearTimers, daily.puzzle],
  );

  const handleRetry = useCallback(() => {
    haptics.tap();
    loadPuzzle(selectedIndex);
  }, [loadPuzzle, selectedIndex]);

  const handlePrevTraining = useCallback(() => {
    haptics.tap();
    const prev =
      (selectedIndex - 1 + DAILY_PUZZLES.length) % DAILY_PUZZLES.length;
    loadPuzzle(prev);
  }, [loadPuzzle, selectedIndex]);

  const handleNextTraining = useCallback(() => {
    haptics.tap();
    const next = (selectedIndex + 1) % DAILY_PUZZLES.length;
    loadPuzzle(next);
  }, [loadPuzzle, selectedIndex]);

  const handleReturnToDaily = useCallback(() => {
    haptics.tap();
    loadPuzzle(dailyCatalogIndex);
  }, [loadPuzzle, dailyCatalogIndex]);

  const handleRevealHint = useCallback(() => {
    if (feedback.kind === 'solved') return;
    haptics.tap();
    setHintVisible(true);
    setUsedHintOnPuzzle(true);
  }, [feedback.kind]);

  const handlePreviewChange = useCallback(
    (preview: DestinationPreview | null, hoveredMove: Move | null) => {
      setHoverInfo({ preview, hoveredMove });
    },
    [],
  );

  const puzzlePlayer = stepStartState.currentPlayer;
  const currentStep = activePuzzle.steps[stepIndex] ?? null;
  const isSolved = feedback.kind === 'solved';
  const canInteract =
    !isSolved &&
    !isBotThinking &&
    !isRevertingWrong &&
    gameState.status === 'playing';

  const hintMove: Move | null =
    hintVisible && !isSolved && !isBotThinking && currentStep
      ? currentStep.accept[0] ?? null
      : null;

  const handlePlayMove = useCallback(
    (move: Move) => {
      if (!canInteract || !currentStep) return;

      const applied = applyMove(gameState, move, gameState.currentPlayer);
      if (!applied.ok) return;

      const isAccepted = currentStep.accept.some((candidate) =>
        sameMove(candidate, move),
      );
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);

      // Applique d'abord visuellement le coup sur le plateau
      setGameState(applied.state);

      if (!isAccepted) {
        // Mauvais coup : son discret + secousse douce + message bienveillant puis retour en arrière
        soundEngine.playAutoMove();
        haptics.defeat();
        setTileMarks((prev) => [...prev, 'wrong']);
        setShakeCount((c) => c + 1);
        setIsRevertingWrong(true);
        setFeedback({
          kind: 'wrong',
          message: buildWrongMoveMessage(
            activePuzzle,
            stepIndex,
            move,
            applied.capturedBoard,
            applied.state,
            gameState.currentPlayer,
          ),
        });

        const snapshotToRestore = stepStartState;
        schedule(() => {
          setGameState(snapshotToRestore);
          setIsRevertingWrong(false);
        }, 850);
        return;
      }

      // Bon coup !
      const stepMark: TileMark = hintVisible ? 'hint' : 'ok';
      setTileMarks((prev) => [...prev, stepMark]);

      const isFinalStep = stepIndex >= activePuzzle.steps.length - 1;

      if (isFinalStep) {
        if (applied.capturedBoard) {
          haptics.capture();
        }
        soundEngine.playDailySolved();
        haptics.victory();
        setHintVisible(false);
        setFeedback({ kind: 'solved' });
        setShowConfetti(true);

        if (isDailyMode) {
          recordDailySolve(daily.dateKey, nextAttempts, usedHintOnPuzzle);
          setDailyStatus(getDailyStatus(new Date()));
          onSolvedDaily?.();
        }
        return;
      }

      // Bon coup intermédiaire (défi en 2 coups) : le bot répond après 650 ms
      if (applied.capturedBoard) {
        soundEngine.playCapture(gameState.currentPlayer);
        haptics.capture();
      } else {
        soundEngine.playMove(gameState.currentPlayer);
        haptics.move();
      }
      if (applied.triggeredFreeMove && applied.state.status === 'playing') {
        soundEngine.playFreeMove();
      }

      const botReply = currentStep.reply;
      const opponent = getOpponent(gameState.currentPlayer);
      setHintVisible(false);
      setIsBotThinking(true);
      setFeedback({
        kind: 'good',
        message: `Bien vu ! ${opponent} répond…`,
      });

      if (!botReply) {
        setStepStartState(applied.state);
        setStepIndex((i) => i + 1);
        setIsBotThinking(false);
        return;
      }

      schedule(() => {
        const afterReply = applyMove(applied.state, botReply);
        if (!afterReply.ok) {
          setIsBotThinking(false);
          return;
        }

        if (afterReply.capturedBoard) {
          soundEngine.playCapture(opponent);
          haptics.capture();
        } else {
          soundEngine.playMove(opponent);
          haptics.opponentMove();
        }
        if (
          afterReply.triggeredFreeMove &&
          afterReply.state.status === 'playing'
        ) {
          soundEngine.playFreeMove();
          haptics.freeMove();
        }

        setGameState(afterReply.state);
        setStepStartState(afterReply.state);
        setStepIndex((i) => i + 1);
        setIsBotThinking(false);
        setFeedback({
          kind: 'good',
          message: `Bien vu ! ${opponent} a joué en ${BOARD_COORDS[botReply.boardIndex]} → ${BOARD_COORDS[botReply.cellIndex]}. À toi de conclure !`,
        });
      }, 650);
    },
    [
      canInteract,
      currentStep,
      gameState,
      attempts,
      activePuzzle,
      stepIndex,
      stepStartState,
      schedule,
      hintVisible,
      isDailyMode,
      daily.dateKey,
      usedHintOnPuzzle,
      onSolvedDaily,
    ],
  );

  const handleShareResult = useCallback(async () => {
    haptics.tap();
    const tiles = buildShareTiles(tileMarks);
    const effectiveAttempts = Math.max(1, attempts);
    const accountStreakDays = user?.streak?.current ?? 0;
    const streakSuffix =
      user && accountStreakDays > 0 ? ` · Série : ${accountStreakDays} j` : '';

    const text = isDailyMode
      ? `Super Morpion · Défi #${daily.number}\n${tiles} · Résolu en ${formatAttemptsLabel(effectiveAttempts)}${streakSuffix}`
      : `Super Morpion · Défi « ${activePuzzle.title} »\n${tiles} · Résolu en ${formatAttemptsLabel(effectiveAttempts)}`;

    // Utilise Web Share si disponible sur mobile, sinon copie directe dans le presse-papiers
    const isCoarsePointer =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(pointer: coarse)').matches;

    if (
      isCoarsePointer &&
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function'
    ) {
      try {
        await navigator.share({
          title: `Super Morpion · Défi #${daily.number}`,
          text,
        });
        setShareState('shared');
        schedule(() => setShareState('idle'), 2400);
        return;
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          return;
        }
      }
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setShareState('copied');
      schedule(() => setShareState('idle'), 2400);
    } catch {
      // Ignore les restrictions du navigateur hors HTTPS
    }
  }, [
    tileMarks,
    attempts,
    user,
    isDailyMode,
    daily.number,
    activePuzzle.title,
    schedule,
  ]);

  // Bandeau d'état tactique discret au-dessus du plateau
  let boardStatusText = '';
  if (isSolved) {
    boardStatusText = 'Combinaison trouvée !';
  } else if (isBotThinking) {
    boardStatusText = `${getOpponent(puzzlePlayer)} prépare sa réponse…`;
  } else if (hoverInfo.preview && hoverInfo.hoveredMove && canInteract) {
    const cellCoord = BOARD_COORDS[hoverInfo.hoveredMove.cellIndex];
    const targetCoord = BOARD_COORDS[hoverInfo.preview.targetBoard];
    boardStatusText = `Case ${cellCoord} → renvoie en zone ${targetCoord}`;
  } else if (gameState.isFreeMove) {
    boardStatusText = `Coup libre pour ${gameState.currentPlayer} · Choisis n’importe quelle zone active`;
  } else if (gameState.activeBoard !== null) {
    boardStatusText = `Zone imposée : ${BOARD_COORDS[gameState.activeBoard]} · Trait à ${gameState.currentPlayer}`;
  } else {
    boardStatusText = `Trait à ${gameState.currentPlayer}`;
  }

  const totalSteps = activePuzzle.steps.length;

  return (
    <main className="relative flex-1 w-full max-w-[1160px] mx-auto px-2.5 sm:px-5 py-3 sm:py-5 flex flex-col gap-4 view-enter">
      {showConfetti && (
        <Confetti
          colorVars={['--x-color', '--o-color', '--accent-active']}
          particleCount={90}
          durationMs={2100}
        />
      )}

      {/* En-tête : titre du défi du jour, difficulté, flamme de série et sélecteur d'entraînement */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                haptics.tap();
                onBackToPlay();
              }}
              className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-main)',
                color: 'var(--text-secondary)',
              }}
              aria-label="Retour au jeu"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Jouer</span>
            </button>

            <div className="flex items-center gap-2">
              <Target
                className="w-5 h-5 shrink-0"
                style={{ color: 'var(--accent-active-text)' }}
                strokeWidth={2}
              />
              <h1
                className="text-lg sm:text-2xl font-bold tracking-tight truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {isDailyMode
                  ? `Défi du jour #${daily.number}`
                  : `Entraînement · #${selectedIndex + 1}/${DAILY_PUZZLES.length}`}
              </h1>
            </div>

            <DifficultyStars level={activePuzzle.difficulty} />

            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-main)',
                color: 'var(--text-secondary)',
              }}
            >
              {PUZZLE_CATEGORY_LABELS[activePuzzle.category]}
            </span>

            {isDailyMode && dailyStatus.solvedToday && !isSolved && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                style={{
                  backgroundColor: 'var(--x-surface)',
                  color: 'var(--x-color)',
                }}
              >
                <Check className="w-3 h-3" strokeWidth={2.6} />
                Résolu aujourd’hui
              </span>
            )}
          </div>
        </div>

        {/* Droite de l'en-tête : flamme de série (comptes uniquement) + navigation d'entraînement */}
        <div className="flex flex-wrap items-center gap-2">
          {user?.streak ? (
            <StreakPill streak={user.streak} size="sm" showLabel />
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="tactile-btn inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px dashed var(--border-strong)',
                color: 'var(--text-secondary)',
              }}
              title="Connecte-toi avec un compte pour activer ta flamme quotidienne"
            >
              <Flame className="w-3.5 h-3.5 shrink-0 opacity-70" />
              <span>Série</span>
              <Lock className="w-3 h-3 shrink-0 opacity-75" />
            </button>
          )}

          {/* Sélecteur discret pour s'entraîner sur un autre défi */}
          <div
            className="inline-flex items-center rounded-xl p-0.5"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-main)',
            }}
            role="group"
            aria-label="S’entraîner sur un autre défi"
          >
            <button
              type="button"
              onClick={handlePrevTraining}
              className="tactile-btn rounded-lg p-1.5"
              style={{ color: 'var(--text-secondary)' }}
              title="Défi précédent"
              aria-label="Défi d’entraînement précédent"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {isDailyMode ? (
              <button
                type="button"
                onClick={handleNextTraining}
                className="tactile-btn rounded-lg px-2 py-1 text-[11px] font-semibold whitespace-nowrap"
                style={{ color: 'var(--text-secondary)' }}
              >
                S’entraîner
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReturnToDaily}
                className="tactile-btn rounded-lg px-2.5 py-1 text-[11px] font-bold whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--accent-active-bg)',
                  color: 'var(--accent-active-text)',
                }}
              >
                Défi du jour #{daily.number}
              </button>
            )}

            <button
              type="button"
              onClick={handleNextTraining}
              className="tactile-btn rounded-lg p-1.5"
              style={{ color: 'var(--text-secondary)' }}
              title="Défi suivant"
              aria-label="Défi d’entraînement suivant"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Contenu principal : plateau à gauche sur grand écran, carte consigne à droite (en haut sur mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_352px] xl:grid-cols-[minmax(0,1fr)_384px] gap-4 lg:gap-6 items-start">
        {/* Plateau interactif */}
        <section
          aria-label="Plateau du défi tactique"
          className="order-last lg:order-first flex flex-col items-center justify-center gap-2.5"
        >
          {/* Bandeau discret de lecture tactique */}
          <div
            className="w-full max-w-[540px] flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl text-xs font-medium"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-main)',
              color: 'var(--text-secondary)',
            }}
          >
            <span className="inline-flex items-center gap-2 min-w-0 truncate">
              <span className="w-4 h-4 shrink-0">
                <SymbolMark
                  player={gameState.currentPlayer}
                  size="badge"
                  pieceStyle={boardPrefs.pieceStyle}
                />
              </span>
              <span className="truncate">{boardStatusText}</span>
            </span>

            {totalSteps > 1 && (
              <span
                className="shrink-0 font-mono text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-md"
                style={{
                  backgroundColor: 'var(--bg-recessed)',
                  color: 'var(--text-primary)',
                }}
              >
                Coup {Math.min(stepIndex + 1, totalSteps)}/{totalSteps}
              </span>
            )}
          </div>

          {/* Conteneur animé (secousse douce en cas de mauvais coup) */}
          <motion.div
            key={`shake-wrap-${shakeCount}`}
            animate={
              shakeCount > 0 && !reduceMotion
                ? { x: [0, -8, 8, -5, 5, -2, 0] }
                : { x: 0 }
            }
            transition={{ duration: 0.42, ease: SMOOTH_EASE }}
            className="relative flex justify-center w-full"
          >
            <GlobalBoard
              key={`${activePuzzle.id}-${boardMountKey}`}
              gameState={gameState}
              canInteract={canInteract}
              boardPrefs={boardPrefs}
              variant="lobby"
              hintMove={hintMove}
              onPlayMove={handlePlayMove}
              onPreviewChange={handlePreviewChange}
            />
          </motion.div>
        </section>

        {/* Carte consigne (à droite sur ordinateur, en haut sur mobile) */}
        <aside
          aria-label="Consigne du défi"
          className="order-first lg:order-last w-full max-w-[540px] lg:max-w-none mx-auto flex flex-col gap-3"
        >
          <div
            className="relative overflow-hidden rounded-[16px] p-4 sm:p-5 flex flex-col gap-4"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: `1px solid ${
                isSolved ? 'var(--x-color)' : 'var(--border-main)'
              }`,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            {/* Bandeau de mode entraînement si hors défi du jour */}
            {!isDailyMode && (
              <div
                className="flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-[11px] font-semibold"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-main)',
                  color: 'var(--text-secondary)',
                }}
              >
                <span>Mode entraînement · ne modifie pas ta série</span>
                <button
                  type="button"
                  onClick={handleReturnToDaily}
                  className="underline font-bold shrink-0"
                  style={{ color: 'var(--accent-active-text)' }}
                >
                  Défi du jour
                </button>
              </div>
            )}

            {/* Titre du problème + joueur au trait + essais */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {isDailyMode
                    ? `Problème du ${daily.dateKey}`
                    : `Catalogue · ${selectedIndex + 1} sur ${DAILY_PUZZLES.length}`}
                </p>
                <h2
                  className="text-lg sm:text-xl font-bold tracking-tight mt-0.5"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {activePuzzle.title}
                </h2>
              </div>

              <div
                className="shrink-0 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5"
                style={{
                  backgroundColor:
                    puzzlePlayer === 'X'
                      ? 'var(--x-surface)'
                      : 'var(--o-surface)',
                  border: `1px solid ${
                    puzzlePlayer === 'X' ? 'var(--x-color)' : 'var(--o-color)'
                  }`,
                }}
              >
                <span className="w-4 h-4">
                  <SymbolMark
                    player={puzzlePlayer}
                    size="badge"
                    pieceStyle={boardPrefs.pieceStyle}
                  />
                </span>
                <span
                  className="text-xs font-bold"
                  style={{
                    color:
                      puzzlePlayer === 'X'
                        ? 'var(--x-color)'
                        : 'var(--o-color)',
                  }}
                >
                  Joue {puzzlePlayer}
                </span>
              </div>
            </div>

            {/* Objectif tactique */}
            <p
              className="text-sm leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              {activePuzzle.objective}
            </p>

            {/* Compteur d'essais & progression des étapes */}
            <div
              className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-cell)',
              }}
            >
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--text-muted)' }}>Essais</span>
                <span
                  className="font-mono font-bold tabular-nums"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {attempts}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {activePuzzle.steps.map((_, idx) => {
                  const done = isSolved || idx < stepIndex;
                  const active = !isSolved && idx === stepIndex;
                  return (
                    <span
                      key={idx}
                      className="h-2 rounded-full transition-all duration-200"
                      style={{
                        width: active ? 20 : 8,
                        backgroundColor: done
                          ? 'var(--x-color)'
                          : active
                            ? 'var(--accent-active)'
                            : 'var(--border-strong)',
                      }}
                    />
                  );
                })}
                <span
                  className="ml-1 text-[11px] font-semibold"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {totalSteps === 1 ? '1 coup' : `${totalSteps} coups`}
                </span>
              </div>
            </div>

            {/* Zone de retour tactique (mauvais coup / bon coup / résolu) */}
            <AnimatePresence mode="wait">
              {feedback.kind === 'wrong' && (
                <motion.div
                  key={`wrong-${shakeCount}`}
                  role="status"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-xl px-3.5 py-2.5 text-xs sm:text-[13px] leading-snug font-medium"
                  style={{
                    backgroundColor: 'var(--danger-bg)',
                    border: '1px solid var(--danger-color)',
                    color: 'var(--danger-color)',
                  }}
                >
                  {feedback.message}
                </motion.div>
              )}

              {feedback.kind === 'good' && (
                <motion.div
                  key={`good-${stepIndex}-${isBotThinking}`}
                  role="status"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.22 }}
                  className="rounded-xl px-3.5 py-2.5 text-xs sm:text-[13px] leading-snug font-semibold flex items-start gap-2"
                  style={{
                    backgroundColor: 'var(--x-surface)',
                    border: '1px solid var(--x-color)',
                    color: 'var(--x-color)',
                  }}
                >
                  <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{feedback.message}</span>
                </motion.div>
              )}

              {feedback.kind === 'solved' && (
                <motion.div
                  key="solved-panel"
                  role="status"
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={STAMP_SPRING}
                  className="rounded-[14px] p-3.5 sm:p-4 flex flex-col gap-3"
                  style={{
                    backgroundColor: 'var(--x-surface)',
                    border: '1.5px solid var(--x-color)',
                  }}
                >
                  {/* Tampon célébration animé */}
                  <div className="flex items-center justify-between gap-2">
                    <motion.div
                      initial={
                        reduceMotion
                          ? false
                          : { scale: 1.55, rotate: -10, opacity: 0 }
                      }
                      animate={{ scale: 1, rotate: -2, opacity: 1 }}
                      transition={STAMP_SPRING}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider"
                      style={{
                        backgroundColor: 'var(--x-color)',
                        color: 'var(--bg-board)',
                      }}
                    >
                      <Trophy className="w-3.5 h-3.5" />
                      <span>Défi résolu</span>
                    </motion.div>

                    <span
                      className="text-xs font-bold tabular-nums"
                      style={{ color: 'var(--x-color)' }}
                    >
                      {formatAttemptsLabel(attempts)}
                      {usedHintOnPuzzle ? ' · avec indice' : ' · sans indice'}
                    </span>
                  </div>

                  {/* Explication tactique */}
                  <p
                    className="text-xs sm:text-[13px] leading-relaxed"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {activePuzzle.explanation}
                  </p>

                  {/* Aperçu Wordle + bouton Partager le résultat */}
                  <div className="flex flex-col gap-2 pt-1">
                    <div
                      className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-mono"
                      style={{
                        backgroundColor: 'var(--bg-board)',
                        border: '1px solid var(--border-main)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span aria-hidden="true">{buildShareTiles(tileMarks)}</span>
                      <span className="font-sans font-semibold text-[11px]">
                        {isDailyMode
                          ? user?.streak
                            ? `Série : ${Math.max(1, user.streak.current)} j`
                            : 'Défi validé ✓'
                          : 'Entraînement'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleShareResult()}
                        className="tactile-btn flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold"
                        style={{
                          backgroundColor: 'var(--btn-primary-bg)',
                          color: 'var(--btn-primary-text)',
                        }}
                      >
                        {shareState === 'idle' ? (
                          <>
                            <Share2 className="w-4 h-4" />
                            <span>Partager le résultat</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            <span>
                              {shareState === 'shared'
                                ? 'Résultat partagé !'
                                : 'Résultat copié !'}
                            </span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleNextTraining}
                        className="tactile-btn inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold"
                        style={{
                          backgroundColor: 'var(--bg-board)',
                          border: '1px solid var(--border-strong)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <span>Autre défi</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Encart Indice révélé */}
            <AnimatePresence>
              {hintVisible && !isSolved && (
                <motion.div
                  key="hint-box"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.22 }}
                  className="rounded-xl px-3.5 py-2.5 text-xs sm:text-[13px] leading-relaxed flex items-start gap-2"
                  style={{
                    backgroundColor: 'var(--accent-active-bg)',
                    border: '1px solid var(--accent-active)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Lightbulb
                    className="w-4 h-4 shrink-0 mt-0.5"
                    style={{ color: 'var(--accent-active-text)' }}
                  />
                  <span>{activePuzzle.hint}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Boutons d'action : Indice & Réessayer */}
            <div className="flex items-center gap-2 pt-1">
              {!isSolved && (
                <button
                  type="button"
                  onClick={handleRevealHint}
                  disabled={hintVisible || isBotThinking}
                  className="tactile-btn flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold disabled:opacity-55"
                  style={{
                    backgroundColor: hintVisible
                      ? 'var(--accent-active-bg)'
                      : 'var(--bg-surface)',
                    border: `1px solid ${
                      hintVisible
                        ? 'var(--accent-active)'
                        : 'var(--border-main)'
                    }`,
                    color: hintVisible
                      ? 'var(--accent-active-text)'
                      : 'var(--text-primary)',
                  }}
                >
                  <Lightbulb className="w-4 h-4" />
                  <span>{hintVisible ? 'Indice affiché' : 'Indice'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleRetry}
                className={`tactile-btn inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold ${
                  isSolved ? 'flex-1' : ''
                }`}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-main)',
                  color: 'var(--text-secondary)',
                }}
              >
                <RotateCcw className="w-4 h-4" />
                <span>Réessayer</span>
              </button>
            </div>
          </div>

          {/* Note discrète en bas de carte : résumé du jour si déjà résolu */}
          {dailyStatus.solvedToday && dailyStatus.todayAttempts !== null && (
            <div
              className="rounded-xl px-3.5 py-2.5 text-xs flex items-center justify-between gap-2"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-main)',
                color: 'var(--text-secondary)',
              }}
            >
              <span>
                Défi du jour #{daily.number} validé en{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {formatAttemptsLabel(dailyStatus.todayAttempts)}
                </strong>
                {dailyStatus.todayUsedHint ? ' (avec indice)' : ' (sans indice)'}
              </span>
              <span
                className="font-bold shrink-0"
                style={{ color: 'var(--accent-active-text)' }}
              >
                Prochain demain
              </span>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
