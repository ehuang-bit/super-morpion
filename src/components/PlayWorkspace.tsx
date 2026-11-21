import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import { formatRating, type EloProfile } from '@shared/elo';
import {
  BOARD_COORDS,
  applyMove,
  createInitialState,
  type DestinationPreview,
  type GameState,
  type Move,
} from '@shared/gameEngine';
import {
  MOVE_TIME_LIMIT_MS,
  TIME_CONTROL_LABELS,
  type AuthUser,
  type LobbyStats,
  type RoomPeekInfo,
  type RoomSnapshot,
  type TimeControl,
} from '@shared/protocol';
import {
  ArrowRight,
  Award,
  ChevronRight,
  Clock,
  GraduationCap,
  Link2,
  LogIn,
  MonitorSmartphone,
  RotateCcw,
  Swords,
  UserCheck,
} from 'lucide-react';
import type { ConnectionStatus } from '../hooks/useOnlineGame';
import type { BoardPreferences } from '../types/boardPrefs';
import { normalizeRoomCode } from '../utils/format';
import { haptics } from '../utils/haptics';
import { CHIP_SPRING } from '../utils/motion';
import { soundEngine } from '../utils/soundEngine';
import { getTutorialSeen, saveTutorialSeen } from '../utils/storage';
import { GlobalBoard } from './GlobalBoard';
import { JoinPrompt } from './JoinPrompt';
import { SymbolMark } from './Symbols';
import { WaitingLobby } from './WaitingLobby';

interface PlayWorkspaceProps {
  user: AuthUser | null;
  pseudo: string;
  onChangePseudo: (value: string) => void;
  timeControl: TimeControl;
  onChangeTimeControl: (tc: TimeControl) => void;
  playerElo: {
    profile: EloProfile;
    tier: string;
  };
  boardPrefs: BoardPreferences;
  connected: boolean;
  connectionStatus: ConnectionStatus;
  isBusy: boolean;
  error: string | null;
  lobby: LobbyStats | null;
  waitingSnapshot: RoomSnapshot | null;
  routeRoomCode: string | null;
  peekInfo: RoomPeekInfo | null;
  peekError: string | null;
  onCreateRoom: () => void;
  onJoinCode: (code: string) => void;
  onJoinMatchmaking: () => void;
  onCancelWaitingOrPrompt: () => void;
  onOpenStats: () => void;
  onOpenAuth: () => void;
  /** Incrémenté pour lancer le tutoriel depuis l'extérieur (fenêtre des règles). */
  tutorialRequest: number;
}

const CADENCES: readonly TimeControl[] = ['unlimited', 'rapid', 'blitz'];

/* ---------- Tutoriel : trois étapes sur le plateau d'essai ---------- */

type TutorialStep = 1 | 2 | 3 | 'done';

/** Position de la 3e étape : X peut prendre la zone centrale en un coup. */
const LESSON_MOVES: readonly Move[] = [
  { boardIndex: 4, cellIndex: 0 },
  { boardIndex: 0, cellIndex: 4 },
  { boardIndex: 4, cellIndex: 8 },
  { boardIndex: 8, cellIndex: 4 },
];
const LESSON_HINT: Move = { boardIndex: 4, cellIndex: 4 };

function buildCaptureLesson(): GameState {
  let state = createInitialState('X');
  for (const move of LESSON_MOVES) {
    const res = applyMove(state, move);
    if (res.ok) state = res.state;
  }
  return state;
}

export function PlayWorkspace({
  user,
  pseudo,
  onChangePseudo,
  timeControl,
  onChangeTimeControl,
  playerElo,
  boardPrefs,
  connected,
  connectionStatus,
  isBusy,
  error,
  lobby,
  waitingSnapshot,
  routeRoomCode,
  peekInfo,
  peekError,
  onCreateRoom,
  onJoinCode,
  onJoinMatchmaking,
  onCancelWaitingOrPrompt,
  onOpenStats,
  onOpenAuth,
  tutorialRequest,
}: PlayWorkspaceProps) {
  const [joinCode, setJoinCode] = useState('');
  const [sandboxState, setSandboxState] = useState<GameState>(() =>
    createInitialState('X'),
  );
  const [sandboxPreview, setSandboxPreview] = useState<{
    preview: DestinationPreview | null;
    hoveredMove: Move | null;
  }>({ preview: null, hoveredMove: null });

  const [tutorial, setTutorial] = useState<TutorialStep | null>(null);
  const [tutorialOffer, setTutorialOffer] = useState<boolean>(() => !getTutorialSeen());
  const [tutorialRetry, setTutorialRetry] = useState(false);

  const handleSandboxMove = useCallback((move: Move) => {
    setSandboxState((prev) => {
      if (prev.status !== 'playing') {
        return createInitialState('X');
      }
      const res = applyMove(prev, move, prev.currentPlayer);
      if (!res.ok) return prev;
      const lastRecord =
        res.state.moveHistory[res.state.moveHistory.length - 1];
      if (lastRecord?.capturedBoard) {
        soundEngine.playCapture(lastRecord.player);
        haptics.capture();
      } else {
        soundEngine.playMove(prev.currentPlayer);
        haptics.move();
      }
      if (lastRecord?.triggeredFreeMove && res.state.status === 'playing') {
        soundEngine.playFreeMove();
      }
      return res.state;
    });
  }, []);

  const handleResetSandbox = useCallback(() => {
    setSandboxState(createInitialState('X'));
    setSandboxPreview({ preview: null, hoveredMove: null });
    haptics.tap();
  }, []);

  const handlePreviewChange = useCallback(
    (preview: DestinationPreview | null, hoveredMove: Move | null) => {
      setSandboxPreview({ preview, hoveredMove });
    },
    [],
  );

  const boardSectionRef = useRef<HTMLElement>(null);

  const startTutorial = useCallback(() => {
    saveTutorialSeen();
    setTutorialOffer(false);
    setTutorialRetry(false);
    setSandboxState(createInitialState('X'));
    setSandboxPreview({ preview: null, hoveredMove: null });
    setTutorial(1);
    // Sur téléphone, le plateau d'essai est sous la console : on y amène le joueur
    window.requestAnimationFrame(() => {
      boardSectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, []);

  const endTutorial = useCallback(() => {
    setTutorial(null);
    setTutorialRetry(false);
    setSandboxState(createInitialState('X'));
  }, []);

  const dismissTutorialOffer = useCallback(() => {
    saveTutorialSeen();
    setTutorialOffer(false);
  }, []);

  // Lancement demandé depuis la fenêtre des règles
  const lastTutorialRequestRef = useRef(tutorialRequest);
  useEffect(() => {
    if (tutorialRequest !== lastTutorialRequestRef.current) {
      lastTutorialRequestRef.current = tutorialRequest;
      startTutorial();
    }
  }, [tutorialRequest, startTutorial]);

  // Progression du tutoriel au fil des coups joués sur le plateau d'essai
  useEffect(() => {
    if (tutorial === null || tutorial === 'done') return;
    const count = sandboxState.moveHistory.length;

    if (tutorial === 1 && count >= 1) {
      setTutorial(2);
      return;
    }
    if (tutorial === 2 && count >= 2) {
      // Laisse le temps de voir le renvoi avant de passer à la prise de zone
      const timer = window.setTimeout(() => {
        setSandboxState(buildCaptureLesson());
        setTutorial(3);
      }, 1300);
      return () => window.clearTimeout(timer);
    }
    if (tutorial === 3 && count > LESSON_MOVES.length) {
      if (sandboxState.boards[LESSON_HINT.boardIndex].status === 'X') {
        setTutorial('done');
        return;
      }
      setTutorialRetry(true);
      const timer = window.setTimeout(
        () => setSandboxState(buildCaptureLesson()),
        900,
      );
      return () => window.clearTimeout(timer);
    }
  }, [tutorial, sandboxState]);

  const handleJoinSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeRoomCode(joinCode);
    if (cleaned.length === 6) {
      onJoinCode(cleaned);
    }
  };

  const normalizedJoin = normalizeRoomCode(joinCode);
  const hasSandboxMoves = sandboxState.moveHistory.length > 0;
  const ratingLabel = formatRating(playerElo.profile.rating, playerElo.profile.rd);
  const waitingInQueue = lobby ? lobby.queue[timeControl] : 0;
  const canLaunch = connected && !isBusy;
  const showLaunchConsole = !waitingSnapshot && !routeRoomCode;
  const tutorialActive = tutorial !== null && showLaunchConsole;

  // Build tactical hint above the ready-to-play board
  let boardHint =
    'Plateau prêt à jouer · survolez ou cliquez une case pour tester le renvoi';
  if (sandboxPreview.preview && sandboxPreview.hoveredMove) {
    if (sandboxPreview.preview.willBeFreeMove) {
      boardHint = `Case ${BOARD_COORDS[sandboxPreview.hoveredMove.cellIndex]} → Zone verrouillée : coup libre adverse`;
    } else {
      boardHint = `Jouer en case ${BOARD_COORDS[sandboxPreview.hoveredMove.cellIndex]} → renvoie en zone ${BOARD_COORDS[sandboxPreview.preview.targetBoard]}`;
    }
  } else if (hasSandboxMoves) {
    if (sandboxState.status === 'won' && sandboxState.winner) {
      boardHint = `Aperçu : alignement global ${sandboxState.winner} ! Cliquez sur Réinitialiser`;
    } else if (sandboxState.activeBoard !== null) {
      boardHint = `Aperçu tactique · Trait à ${sandboxState.currentPlayer} dans la zone ${BOARD_COORDS[sandboxState.activeBoard]}`;
    } else {
      boardHint = `Aperçu tactique · Coup libre pour ${sandboxState.currentPlayer}`;
    }
  }

  // Texte du tutoriel
  let coachTitle = '';
  let coachBody = '';
  if (tutorial === 1) {
    coachTitle = 'Joue où tu veux';
    coachBody = 'Clique sur n’importe quelle case du plateau.';
  } else if (tutorial === 2) {
    const first = sandboxState.moveHistory[0];
    const zone = first ? BOARD_COORDS[first.cellIndex] : '';
    coachTitle = 'La case jouée désigne la zone suivante';
    coachBody = first
      ? `Tu as joué une case ${zone} : ton adversaire doit jouer dans la zone ${zone}, celle qui est encadrée. Joue un coup pour lui.`
      : 'Ton adversaire doit jouer dans la zone encadrée. Joue un coup pour lui.';
  } else if (tutorial === 3) {
    coachTitle = 'Aligne 3 symboles pour prendre une zone';
    coachBody = tutorialRetry
      ? 'Pas celle-ci : joue la case qui clignote pour compléter la diagonale.'
      : 'Joue la case qui clignote pour compléter la diagonale.';
  } else if (tutorial === 'done') {
    coachTitle = 'Zone prise !';
    coachBody = `Prends 3 zones alignées pour gagner la partie. En match, chaque coup se joue en ${Math.round(MOVE_TIME_LIMIT_MS / 1000)} secondes.`;
  }
  const coachStepNumber = tutorial === 'done' ? 3 : (tutorial ?? 1);

  const showTutorialOffer = tutorialOffer && !tutorialActive && showLaunchConsole;
  const tutorialOfferBanner = (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-[540px] rounded-[12px] px-3 py-2 flex flex-wrap items-center justify-between gap-2"
      style={{
        backgroundColor: 'var(--accent-active-bg)',
        border: '1px solid var(--accent-active)',
      }}
    >
      <span
        className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold min-w-0"
        style={{ color: 'var(--text-primary)' }}
      >
        <GraduationCap
          className="w-4 h-4 shrink-0"
          style={{ color: 'var(--accent-active-text)' }}
        />
        <span>Première partie ? Apprends les règles en jouant, en 30 secondes.</span>
      </span>
      <span className="flex items-center gap-1.5 ml-auto">
        <button
          type="button"
          onClick={dismissTutorialOffer}
          className="tactile-btn rounded-lg px-2.5 py-1.5 text-xs font-semibold"
          style={{ color: 'var(--text-secondary)' }}
        >
          Plus tard
        </button>
        <button
          type="button"
          onClick={startTutorial}
          className="tactile-btn rounded-lg px-3 py-1.5 text-xs font-semibold"
          style={{
            backgroundColor: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-text)',
          }}
        >
          Commencer
        </button>
      </span>
    </motion.div>
  );

  return (
    <div className="flex-1 w-full max-w-[1160px] mx-auto px-2.5 sm:px-5 py-2.5 sm:py-4 flex flex-col justify-center">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_368px] gap-4 lg:gap-5 xl:gap-6 items-center">
        {/* Proposition de tutoriel, à la première visite (téléphone) */}
        {showTutorialOffer && (
          <div className="lg:hidden order-first w-full max-w-[540px] mx-auto">
            {tutorialOfferBanner}
          </div>
        )}

        {/* CENTER-LEFT HERO: Full-size Ready-to-Play GlobalBoard */}
        <section
          ref={boardSectionRef}
          aria-label="Plateau de jeu prêt à jouer"
          className={`flex flex-col items-center justify-center gap-2 scroll-mt-16 ${
            tutorialActive ? 'order-first' : 'order-last'
          } lg:order-none`}
        >
          {/* Proposition de tutoriel, à la première visite (ordinateur) */}
          {showTutorialOffer && (
            <div className="hidden lg:block w-full max-w-[540px]">{tutorialOfferBanner}</div>
          )}

          {tutorialActive ? (
            /* Tutoriel : consigne de l'étape en cours */
            <motion.div
              key={`coach-${tutorial}`}
              role="status"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28 }}
              className="w-full max-w-[540px] rounded-[12px] px-3 py-2.5 flex items-start justify-between gap-3"
              style={{
                backgroundColor: 'var(--bg-board)',
                border: '1.5px solid var(--accent-active)',
                boxShadow: 'var(--shadow-active)',
              }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold"
                    style={{
                      backgroundColor: 'var(--accent-active-bg)',
                      color: 'var(--accent-active-text)',
                    }}
                  >
                    {coachStepNumber}/3
                  </span>
                  <span
                    className="text-sm font-bold leading-tight"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {coachTitle}
                  </span>
                </div>
                <p
                  className="text-xs sm:text-[13px] leading-snug mt-1"
                  style={{
                    color:
                      tutorial === 3 && tutorialRetry
                        ? 'var(--danger-color)'
                        : 'var(--text-secondary)',
                  }}
                >
                  {coachBody}
                </p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1.5">
                {tutorial === 'done' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        endTutorial();
                        if (canLaunch) onJoinMatchmaking();
                      }}
                      disabled={!canLaunch}
                      className="tactile-btn rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      style={{
                        backgroundColor: 'var(--btn-primary-bg)',
                        color: 'var(--btn-primary-text)',
                      }}
                    >
                      Trouver un adversaire
                    </button>
                    <button
                      type="button"
                      onClick={endTutorial}
                      className="tactile-btn rounded-lg px-2.5 py-1 text-xs font-semibold"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Terminer
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={endTutorial}
                    className="tactile-btn rounded-lg px-2.5 py-1 text-xs font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Passer
                  </button>
                )}
              </div>
            </motion.div>
          ) : (
            /* Top Opponent / Readiness Strip */
            <div
              className="w-full max-w-[540px] rounded-[12px] px-3 py-2 flex items-center justify-between gap-2"
              style={{
                backgroundColor: 'var(--bg-board)',
                border: '1px solid var(--border-main)',
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-4 h-4 shrink-0 opacity-75">
                  <SymbolMark
                    player={sandboxState.currentPlayer}
                    size="badge"
                    pieceStyle={boardPrefs.pieceStyle}
                  />
                </div>
                <span
                  className="text-xs font-semibold truncate"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {waitingSnapshot
                    ? `Salon #${waitingSnapshot.code} · En attente d’adversaire…`
                    : boardHint}
                </span>
              </div>

              {hasSandboxMoves && !waitingSnapshot ? (
                <button
                  type="button"
                  onClick={handleResetSandbox}
                  className="tactile-btn shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-strong)',
                  }}
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Réinitialiser</span>
                </button>
              ) : (
                <span
                  className="shrink-0 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold"
                  style={{
                    backgroundColor: 'var(--accent-active-bg)',
                    color: 'var(--accent-active-text)',
                  }}
                >
                  {TIME_CONTROL_LABELS[timeControl]}
                </span>
              )}
            </div>
          )}

          {/* The Live Full-Size Super Morpion Board */}
          <GlobalBoard
            gameState={
              waitingSnapshot ? waitingSnapshot.gameState : sandboxState
            }
            canInteract={!waitingSnapshot}
            boardPrefs={boardPrefs}
            variant="lobby"
            hintMove={tutorialActive && tutorial === 3 ? LESSON_HINT : null}
            onPlayMove={handleSandboxMove}
            onPreviewChange={handlePreviewChange}
          />
        </section>

        {/* RIGHT COLUMN: Online Match Controls & Features Around the Board */}
        <aside className="w-full flex flex-col gap-3">
          {waitingSnapshot ? (
            <WaitingLobby
              snapshot={waitingSnapshot}
              onCancel={onCancelWaitingOrPrompt}
            />
          ) : routeRoomCode ? (
            <JoinPrompt
              code={routeRoomCode}
              pseudo={pseudo}
              onChangePseudo={onChangePseudo}
              peekInfo={peekInfo}
              peekError={peekError}
              error={error}
              isBusy={isBusy}
              connected={connected}
              onJoin={() => onJoinCode(routeRoomCode)}
              onBackHome={onCancelWaitingOrPrompt}
            />
          ) : (
            <>
              {/* Main Launch Console Card */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-[16px] p-4 flex flex-col gap-3.5"
                style={{
                  backgroundColor: 'var(--bg-board)',
                  border: '1px solid var(--border-main)',
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                {/* Live activity */}
                <div className="flex items-center justify-between gap-2 -mb-1">
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <span className="live-dot" aria-hidden="true" />
                    {lobby
                      ? lobby.playersOnline > 0
                        ? `${lobby.playersOnline} joueur${lobby.playersOnline > 1 ? 's' : ''} en ligne`
                        : 'Arène ouverte · sois le premier'
                      : 'Connexion à l’arène…'}
                  </span>
                  {lobby && lobby.liveGames > 0 && (
                    <span
                      className="text-xs font-medium"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {lobby.liveGames} partie{lobby.liveGames > 1 ? 's' : ''} en cours
                    </span>
                  )}
                </div>

                {/* Classement du joueur : seul endroit de l'accueil où il apparaît */}
                <div
                  className="rounded-[11px] p-2 flex items-center justify-between gap-2"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-cell)',
                  }}
                >
                  <button
                    type="button"
                    onClick={onOpenStats}
                    aria-label={`Classement ${ratingLabel}, ${playerElo.tier}. Voir mes statistiques`}
                    className="tactile-btn flex-1 min-w-0 flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-left"
                  >
                    <Award
                      className="w-5 h-5 shrink-0"
                      style={{ color: 'var(--accent-active-text)' }}
                      strokeWidth={1.9}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span
                          className="font-mono text-base font-bold tabular-nums"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {ratingLabel}
                        </span>
                        <span
                          className="text-xs font-semibold truncate"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {playerElo.tier}
                        </span>
                      </span>
                      <span
                        className="block font-mono text-[11px] tabular-nums"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {playerElo.profile.wins} V · {playerElo.profile.draws} N ·{' '}
                        {playerElo.profile.losses} D
                      </span>
                    </span>
                    <ChevronRight
                      className="w-4 h-4 shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                    />
                  </button>

                  {user ? (
                    <span
                      className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold"
                      style={{
                        backgroundColor: 'var(--x-surface)',
                        color: 'var(--x-color)',
                      }}
                    >
                      <UserCheck className="w-3 h-3" />
                      <span className="max-w-[92px] truncate">{user.username}</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={onOpenAuth}
                      className="tactile-btn shrink-0 hidden lg:inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                      style={{
                        backgroundColor: 'var(--bg-board)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-strong)',
                      }}
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Connexion</span>
                    </button>
                  )}
                </div>

                {/* Pseudo, pour les invités seulement */}
                {!user && (
                  <div>
                    <label
                      htmlFor="play-pseudo-input"
                      className="block text-xs font-semibold mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Pseudo (mode invité)
                    </label>
                    <input
                      id="play-pseudo-input"
                      type="text"
                      maxLength={20}
                      value={pseudo}
                      onChange={(e) => onChangePseudo(e.target.value)}
                      placeholder="Ex. Camille"
                      className="tactile-input w-full rounded-[10px] px-3 py-2 text-sm font-medium"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-main)',
                      }}
                    />
                  </div>
                )}

                {/* Time Control Selector */}
                <div>
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-semibold mb-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>
                      Cadence · {Math.round(MOVE_TIME_LIMIT_MS / 1000)} s par coup dans tous les cas
                    </span>
                  </span>
                  <LayoutGroup id="cadence">
                    <div
                      className="grid grid-cols-3 gap-1 p-1 rounded-[10px]"
                      style={{
                        backgroundColor: 'var(--bg-recessed)',
                        border: '1px solid var(--border-cell)',
                      }}
                      role="radiogroup"
                      aria-label="Cadence de la pendule"
                    >
                      {CADENCES.map((cadence) => {
                        const selected = timeControl === cadence;
                        return (
                          <button
                            key={cadence}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => onChangeTimeControl(cadence)}
                            className="tactile-btn relative rounded-[7px] px-1.5 py-2 text-xs font-semibold leading-tight text-center"
                            style={{
                              color: selected
                                ? 'var(--text-primary)'
                                : 'var(--text-secondary)',
                            }}
                          >
                            {selected && (
                              // Pastille qui glisse d'une cadence à l'autre
                              <motion.span
                                layoutId="cadence-pill"
                                transition={CHIP_SPRING}
                                aria-hidden="true"
                                className="absolute inset-0 rounded-[7px]"
                                style={{
                                  backgroundColor: 'var(--bg-board)',
                                  boxShadow: 'var(--shadow-card)',
                                }}
                              />
                            )}
                            <span className="relative">{TIME_CONTROL_LABELS[cadence]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </LayoutGroup>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-[10px] px-3 py-2 text-xs font-medium"
                    style={{
                      backgroundColor: 'var(--danger-bg)',
                      color: 'var(--danger-color)',
                      border: '1px solid var(--danger-color)',
                    }}
                  >
                    {error}
                  </div>
                )}

                {/* Action principale : trouver un adversaire */}
                <button
                  type="button"
                  onClick={onJoinMatchmaking}
                  disabled={!canLaunch}
                  className="tactile-btn cta-primary w-full rounded-[14px] px-4 py-3.5 flex items-center justify-between gap-3 disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--btn-primary-bg)',
                    color: 'var(--btn-primary-text)',
                  }}
                >
                  <span className="inline-flex items-center gap-3 min-w-0">
                    <span
                      className="inline-flex items-center justify-center w-10 h-10 rounded-full shrink-0"
                      style={{
                        backgroundColor: 'color-mix(in srgb, currentColor 16%, transparent)',
                      }}
                    >
                      <Swords className="w-5 h-5" strokeWidth={1.9} />
                    </span>
                    <span className="flex flex-col items-start leading-tight min-w-0">
                      <span className="text-base font-bold">Trouver un adversaire</span>
                      <span className="text-xs font-medium opacity-80 truncate max-w-full">
                        {waitingInQueue > 0
                          ? `${waitingInQueue} joueur${waitingInQueue > 1 ? 's' : ''} en attente · ${TIME_CONTROL_LABELS[timeControl]}`
                          : `À ton niveau · ${TIME_CONTROL_LABELS[timeControl]}`}
                      </span>
                    </span>
                  </span>
                  <ArrowRight className="cta-arrow w-5 h-5 shrink-0" strokeWidth={2} />
                </button>

                {/* Jouer avec un ami */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Avec un ami
                    </span>
                    <span
                      className="h-px flex-1"
                      style={{ backgroundColor: 'var(--border-cell)' }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={onCreateRoom}
                    disabled={!canLaunch}
                    className="tactile-btn w-full rounded-[11px] px-3.5 py-2.5 text-sm font-semibold flex items-center justify-between gap-2 disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-main)',
                    }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Link2 className="w-4 h-4" strokeWidth={1.85} />
                      <span>Créer un duel privé</span>
                    </span>
                    <span
                      className="text-xs font-medium inline-flex items-center gap-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <span>Lien & code</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </button>

                  {/* Join by 6-char room code */}
                  <form onSubmit={handleJoinSubmit} className="flex gap-2">
                    <label htmlFor="join-code-input" className="sr-only">
                      Code du salon à 6 caractères
                    </label>
                    <input
                      id="join-code-input"
                      type="text"
                      maxLength={7}
                      value={joinCode}
                      onChange={(e) =>
                        setJoinCode(normalizeRoomCode(e.target.value))
                      }
                      placeholder="CODE À 6 CAR."
                      className="tactile-input flex-1 min-w-0 rounded-[10px] px-3 py-2 font-mono text-sm uppercase tracking-[0.14em]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-main)',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={!canLaunch || normalizedJoin.length !== 6}
                      className="tactile-btn shrink-0 rounded-[10px] px-3.5 py-2 text-xs font-semibold disabled:opacity-45"
                      style={{
                        backgroundColor: 'var(--bg-recessed)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-strong)',
                      }}
                    >
                      Rejoindre
                    </button>
                  </form>
                </div>

                {!connected && (
                  <p
                    className="flex items-start gap-1.5 text-xs leading-snug"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <MonitorSmartphone
                      className="w-3.5 h-3.5 shrink-0 mt-0.5"
                      strokeWidth={1.75}
                    />
                    <span>
                      {connectionStatus === 'offline'
                        ? 'Serveur momentanément indisponible.'
                        : 'Connexion au serveur en ligne…'}
                    </span>
                  </p>
                )}
              </motion.div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
