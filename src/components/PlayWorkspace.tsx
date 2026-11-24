import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
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
  type RoomMode,
  type RoomPeekInfo,
  type RoomSnapshot,
  type TeamSeat,
  type TimeControl,
} from '@shared/protocol';
import {
  ArrowRight,
  Award,
  Bot,
  Check,
  ChevronRight,
  Clock,
  Crown,
  GraduationCap,
  KeyRound,
  Link2,
  MonitorSmartphone,
  RotateCcw,
  Swords,
  Target,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { getDailyPuzzle } from '../data/dailyPuzzles';
import type { ConnectionStatus } from '../hooks/useOnlineGame';
import { useI18n } from '../i18n';
import type { BoardPreferences } from '../types/boardPrefs';
import { getDailyStatus } from '../utils/dailyStorage';
import { formatElapsedSeconds, normalizeRoomCode } from '../utils/format';
import { haptics } from '../utils/haptics';
import { CHIP_SPRING, SMOOTH_EASE } from '../utils/motion';
import { soundEngine } from '../utils/soundEngine';
import { getTutorialSeen, saveTutorialSeen } from '../utils/storage';
import { GameNameField } from './GameNameField';
import { GlobalBoard } from './GlobalBoard';
import { JoinPrompt } from './JoinPrompt';
import { StreakPill } from './StreakBadge';
import { SymbolMark } from './Symbols';
import { WaitingLobby } from './WaitingLobby';

interface PlayWorkspaceProps {
  user: AuthUser | null;
  localPlayerId: string;
  pseudo: string;
  onChangePseudo: (value: string) => void;
  /** Enregistre le nom en partie du compte connecté (vide = pseudo du compte). */
  onSaveGameName: (gameName: string) => Promise<{ ok: boolean; error?: string }>;
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
  matchmaking: {
    searching: boolean;
    timeControl: TimeControl | null;
    queueSize: number;
  };
  waitingSnapshot: RoomSnapshot | null;
  routeRoomCode: string | null;
  peekInfo: RoomPeekInfo | null;
  peekError: string | null;
  onCreateRoom: (mode: RoomMode) => void;
  onJoinCode: (code: string) => void;
  onSwitchSeat?: (seat: TeamSeat) => void;
  onJoinMatchmaking: () => void;
  onCancelMatchmaking: () => void;
  onCancelWaitingOrPrompt: () => void;
  onOpenStats: () => void;
  onOpenDaily: () => void;
  onOpenBot: () => void;
  onOpenTournament: () => void;
  onOpenAuth: () => void;
  botSummary: {
    level: number;
    label: string;
    elo: number;
    wins: number;
  };
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
  localPlayerId,
  pseudo,
  onChangePseudo,
  onSaveGameName,
  timeControl,
  onChangeTimeControl,
  playerElo,
  boardPrefs,
  connected,
  connectionStatus,
  isBusy,
  error,
  lobby,
  matchmaking,
  waitingSnapshot,
  routeRoomCode,
  peekInfo,
  peekError,
  onCreateRoom,
  onJoinCode,
  onSwitchSeat,
  onJoinMatchmaking,
  onCancelMatchmaking,
  onCancelWaitingOrPrompt,
  onOpenStats,
  onOpenDaily,
  onOpenBot,
  onOpenTournament,
  onOpenAuth,
  botSummary,
  tutorialRequest,
}: PlayWorkspaceProps) {
  const { t, translateTier, translateTimeControl } = useI18n();
  const [joinCode, setJoinCode] = useState('');
  const [showJoinCode, setShowJoinCode] = useState(false);
  const [friendMode, setFriendMode] = useState<RoomMode>('1v1');
  const [elapsed, setElapsed] = useState(0);
  const dailyInfo = getDailyPuzzle(new Date());
  const dailyStatus = getDailyStatus(new Date());
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
  const joinInputRef = useRef<HTMLInputElement>(null);

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

  // Chrono local tant que la recherche d'adversaire est active
  useEffect(() => {
    if (!matchmaking.searching) {
      setElapsed(0);
      return;
    }
    setShowJoinCode(false);
    const start = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [matchmaking.searching]);

  // Focus automatique du champ de code à l'ouverture
  useEffect(() => {
    if (showJoinCode && !matchmaking.searching) {
      joinInputRef.current?.focus();
    }
  }, [showJoinCode, matchmaking.searching]);

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
    if (matchmaking.searching) return;
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
  let boardHint = t('play.sandboxFreeHint');
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
        <span>{t('play.tutorialBanner')}</span>
      </span>
      <span className="flex items-center gap-1.5 ms-auto">
        <button
          type="button"
          onClick={dismissTutorialOffer}
          className="tactile-btn rounded-lg px-2.5 py-1.5 text-xs font-semibold"
          style={{ color: 'var(--text-secondary)' }}
        >
          {t('play.later')}
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
          {t('play.start')}
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
                        if (canLaunch && !matchmaking.searching) {
                          onJoinMatchmaking();
                        }
                      }}
                      disabled={!canLaunch || matchmaking.searching}
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
            /* Bandeau d'état au-dessus du plateau d'essai */
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

              {hasSandboxMoves && !waitingSnapshot && (
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
              localPlayerId={localPlayerId}
              onSwitchSeat={onSwitchSeat}
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
                        ? `${lobby.playersOnline} ${t('common.players')} · ${t('common.online')}`
                        : t('play.arenaOnline')
                      : t('play.connectingArena')}
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
                          {translateTier(playerElo.tier)}
                        </span>
                      </span>
                      <span
                        className="block font-mono text-[11px] tabular-nums"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {playerElo.profile.wins} {t('common.winsShort')} ·{' '}
                        {playerElo.profile.draws} {t('common.drawsShort')} ·{' '}
                        {playerElo.profile.losses} {t('common.lossesShort')}
                      </span>
                    </span>
                    <ChevronRight
                      className="w-4 h-4 shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                    />
                  </button>

                  {user && (
                    <div className="shrink-0 flex items-center gap-1.5">
                      {user.streak && (
                        <StreakPill
                          streak={user.streak}
                          size="xs"
                          onClick={onOpenStats}
                        />
                      )}
                      <span
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold"
                        style={{
                          backgroundColor: 'var(--x-surface)',
                          color: 'var(--x-color)',
                        }}
                      >
                        <UserCheck className="w-3 h-3" />
                        <span className="max-w-[78px] truncate">{user.username}</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Compte connecté : nom affiché en partie, distinct du pseudo du compte */}
                {user && (
                  <GameNameField
                    username={user.username}
                    gameName={user.gameName ?? null}
                    onSave={onSaveGameName}
                    disabled={matchmaking.searching}
                  />
                )}

                {/* Pseudo, pour les invités seulement */}
                {!user && (
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label
                        htmlFor="play-pseudo-input"
                        className="text-xs font-semibold"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {t('play.pseudoGuest')}
                      </label>
                      <button
                        type="button"
                        onClick={onOpenAuth}
                        className="tactile-btn inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          backgroundColor: 'var(--accent-active-bg)',
                          color: 'var(--accent-active-text)',
                        }}
                      >
                        <span>{t('auth.quickGoogleEmail')}</span>
                      </button>
                    </div>
                    <input
                      id="play-pseudo-input"
                      type="text"
                      maxLength={20}
                      value={pseudo}
                      onChange={(e) => onChangePseudo(e.target.value)}
                      placeholder={t('play.pseudoPlaceholder')}
                      className="tactile-input w-full rounded-[10px] px-3 py-2 text-sm font-medium"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-main)',
                      }}
                    />
                  </div>
                )}

                {/* Sélecteur de cadence */}
                <div
                  className={`transition-opacity ${
                    matchmaking.searching ? 'opacity-50' : ''
                  }`}
                >
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-semibold mb-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>{t('tc.moveLimitNote')}</span>
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
                      aria-disabled={matchmaking.searching}
                    >
                      {CADENCES.map((cadence) => {
                        const selected = timeControl === cadence;
                        return (
                          <button
                            key={cadence}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={matchmaking.searching}
                            onClick={() => onChangeTimeControl(cadence)}
                            className="tactile-btn relative rounded-[7px] px-1.5 py-2 text-xs font-semibold leading-tight text-center disabled:cursor-not-allowed"
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
                            <span className="relative">
                              {translateTimeControl(cadence)}
                            </span>
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

                {/* Action principale : trouver un adversaire ou recherche intégrée */}
                {matchmaking.searching ? (
                  <motion.div
                    role="status"
                    aria-live="polite"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: SMOOTH_EASE }}
                    className="w-full rounded-[14px] p-3.5 flex flex-col gap-2.5"
                    style={{
                      backgroundColor: 'var(--accent-active-bg)',
                      border: '1.5px solid var(--accent-active)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="inline-flex items-center gap-2 text-sm font-bold min-w-0"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <span className="live-dot" aria-hidden="true" />
                        <span className="truncate">{t('play.searching')}</span>
                      </span>
                      <span
                        className="shrink-0 font-mono text-xs font-bold tabular-nums rounded-md px-2 py-0.5"
                        style={{
                          backgroundColor: 'var(--bg-board)',
                          color: 'var(--accent-active-text)',
                          border: '1px solid var(--border-cell)',
                        }}
                      >
                        {formatElapsedSeconds(elapsed)}
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <p
                        className="text-xs font-semibold"
                        style={{ color: 'var(--accent-active-text)' }}
                      >
                        {matchmaking.queueSize > 1
                          ? `${matchmaking.queueSize} joueurs en file`
                          : 'En attente d’un joueur'}{' '}
                        · {TIME_CONTROL_LABELS[matchmaking.timeControl ?? timeControl]}
                      </p>
                      <p
                        className="text-xs leading-snug"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Échauffe-toi sur le plateau en attendant.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={onCancelMatchmaking}
                      className="tactile-btn w-full rounded-[10px] px-3 py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                      style={{
                        backgroundColor: 'var(--bg-board)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-strong)',
                      }}
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={2} />
                      <span>{t('common.cancel')}</span>
                    </button>
                  </motion.div>
                ) : (
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
                        <span className="text-base font-bold">
                          {t('play.findOpponent')}
                        </span>
                        <span className="text-xs font-medium opacity-80 truncate max-w-full">
                          {waitingInQueue > 0
                            ? `${waitingInQueue} ${t('common.players')} · ${translateTimeControl(timeControl)}`
                            : t('play.findOpponentSub', {
                                tc: translateTimeControl(timeControl),
                              })}
                        </span>
                      </span>
                    </span>
                    <ArrowRight className="cta-arrow w-5 h-5 shrink-0" strokeWidth={2} />
                  </button>
                )}

                {/* Jouer avec un ami (1v1 ou 2v2 manuel uniquement) */}
                <div
                  className={`flex flex-col gap-2 transition-opacity ${
                    matchmaking.searching ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-semibold shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {t('play.withFriend')}
                    </span>
                    <span
                      className="h-px flex-1"
                      style={{ backgroundColor: 'var(--border-cell)' }}
                    />
                    <LayoutGroup id="friend-mode">
                      <div
                        className="inline-flex items-center gap-0.5 p-0.5 rounded-[8px] shrink-0"
                        style={{
                          backgroundColor: 'var(--bg-recessed)',
                          border: '1px solid var(--border-cell)',
                        }}
                        role="radiogroup"
                        aria-label="Format du salon privé"
                      >
                        {(['1v1', '2v2'] as const).map((m) => {
                          const selected = friendMode === m;
                          return (
                            <button
                              key={m}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              disabled={matchmaking.searching}
                              onClick={() => {
                                setFriendMode(m);
                                haptics.tap();
                              }}
                              className="relative rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-bold leading-tight transition-colors disabled:cursor-not-allowed"
                              style={{
                                color: selected
                                  ? 'var(--text-primary)'
                                  : 'var(--text-muted)',
                              }}
                            >
                              {selected && (
                                <motion.span
                                  layoutId="friend-mode-pill"
                                  transition={CHIP_SPRING}
                                  aria-hidden="true"
                                  className="absolute inset-0 rounded-[6px]"
                                  style={{
                                    backgroundColor: 'var(--bg-board)',
                                    boxShadow: 'var(--shadow-card)',
                                  }}
                                />
                              )}
                              <span className="relative">{m}</span>
                            </button>
                          );
                        })}
                      </div>
                    </LayoutGroup>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onCreateRoom(friendMode)}
                      disabled={!canLaunch || matchmaking.searching}
                      className={`tactile-btn rounded-[11px] px-2.5 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:cursor-not-allowed ${
                        matchmaking.searching ? '' : 'disabled:opacity-50'
                      }`}
                      style={{
                        backgroundColor:
                          friendMode === '2v2'
                            ? 'var(--accent-active-bg)'
                            : 'var(--bg-surface)',
                        color:
                          friendMode === '2v2'
                            ? 'var(--accent-active-text)'
                            : 'var(--text-primary)',
                        border: `1px solid ${
                          friendMode === '2v2'
                            ? 'var(--accent-active)'
                            : 'var(--border-main)'
                        }`,
                      }}
                    >
                      {friendMode === '2v2' ? (
                        <Users className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                      ) : (
                        <Link2 className="w-3.5 h-3.5 shrink-0" strokeWidth={1.9} />
                      )}
                      <span>
                        {friendMode === '2v2' ? '2v2' : t('play.createRoom')}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowJoinCode((prev) => !prev)}
                      disabled={!canLaunch || matchmaking.searching}
                      aria-expanded={showJoinCode}
                      aria-controls="join-code-form"
                      className={`tactile-btn rounded-[11px] px-2.5 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:cursor-not-allowed ${
                        matchmaking.searching ? '' : 'disabled:opacity-50'
                      }`}
                      style={{
                        backgroundColor: showJoinCode
                          ? 'var(--bg-recessed)'
                          : 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        border: `1px solid ${
                          showJoinCode ? 'var(--accent-active)' : 'var(--border-main)'
                        }`,
                      }}
                    >
                      <KeyRound className="w-3.5 h-3.5 shrink-0" strokeWidth={1.9} />
                      <span>{t('play.enterCode')}</span>
                    </button>
                  </div>

                  {/* Aperçu discret du relais 2v2 lorsque l'option 2v2 est choisie */}
                  <AnimatePresence initial={false}>
                    {friendMode === '2v2' && (
                      <motion.div
                        key="mode-2v2-hint"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: SMOOTH_EASE }}
                        className="overflow-hidden"
                      >
                        <div
                          className="rounded-[10px] px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px]"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-cell)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <span className="font-semibold">AB vs CD · amical</span>
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-[10px]">
                            <span
                              className="rounded px-1 py-0.5"
                              style={{
                                backgroundColor: 'var(--x-surface)',
                                color: 'var(--x-color)',
                              }}
                            >
                              A
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>→</span>
                            <span
                              className="rounded px-1 py-0.5"
                              style={{
                                backgroundColor: 'var(--o-surface)',
                                color: 'var(--o-color)',
                              }}
                            >
                              C
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>→</span>
                            <span
                              className="rounded px-1 py-0.5"
                              style={{
                                backgroundColor: 'var(--x-surface)',
                                color: 'var(--x-color)',
                              }}
                            >
                              B
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>→</span>
                            <span
                              className="rounded px-1 py-0.5"
                              style={{
                                backgroundColor: 'var(--o-surface)',
                                color: 'var(--o-color)',
                              }}
                            >
                              D
                            </span>
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Champ de code dépliable à la demande (marge interne anti-rognage au focus) */}
                  <AnimatePresence initial={false}>
                    {showJoinCode && !matchmaking.searching && (
                      <motion.form
                        id="join-code-form"
                        key="join-code-form"
                        onSubmit={handleJoinSubmit}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: SMOOTH_EASE }}
                        className="overflow-hidden -mx-1"
                      >
                        <div className="flex gap-2 p-1">
                          <label htmlFor="join-code-input" className="sr-only">
                            Code du salon à 6 caractères
                          </label>
                          <input
                            ref={joinInputRef}
                            id="join-code-input"
                            type="text"
                            maxLength={7}
                            value={joinCode}
                            onChange={(e) =>
                              setJoinCode(normalizeRoomCode(e.target.value))
                            }
                            placeholder={t('play.codePlaceholder')}
                            disabled={matchmaking.searching}
                            className="tactile-input flex-1 min-w-0 rounded-[10px] px-3 py-2 font-mono text-sm uppercase tracking-[0.14em]"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              color: 'var(--text-primary)',
                              border: '1px solid var(--border-main)',
                            }}
                          />
                          <button
                            type="submit"
                            disabled={
                              !canLaunch ||
                              matchmaking.searching ||
                              normalizedJoin.length !== 6
                            }
                            className="tactile-btn shrink-0 rounded-[10px] px-3.5 py-2 text-xs font-semibold disabled:opacity-45"
                            style={{
                              backgroundColor: 'var(--bg-recessed)',
                              color: 'var(--text-primary)',
                              border: '1px solid var(--border-strong)',
                            }}
                          >
                            {t('play.join')}
                          </button>
                        </div>
                      </motion.form>
                    )}
                  </AnimatePresence>
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
                        ? t('play.serverUnavailable')
                        : t('play.connectingArena')}
                    </span>
                  </p>
                )}
              </motion.div>

              {/* Carte compacte : Tournoi entre amis (4 / 8 / 16 joueurs) */}
              <motion.button
                type="button"
                onClick={() => {
                  haptics.tap();
                  onOpenTournament();
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.34, delay: 0.02, ease: [0.22, 1, 0.36, 1] }}
                className="tactile-btn w-full rounded-[15px] px-3.5 py-3 flex items-center justify-between gap-3 text-start"
                style={{
                  backgroundColor: 'var(--bg-board)',
                  border: '1px solid var(--accent-active)',
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: 'var(--accent-active-bg)',
                      color: 'var(--accent-active-text)',
                      border: '1px solid var(--accent-active)',
                    }}
                  >
                    <Crown className="w-4 h-4" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex flex-col">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="text-xs font-bold leading-tight"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {t('play.tournamentCardTitle')}
                      </span>
                      <span
                        className="font-mono text-[10px] font-bold rounded px-1.5 py-0.5 leading-none"
                        style={{
                          backgroundColor: 'var(--accent-active-bg)',
                          color: 'var(--accent-active-text)',
                        }}
                      >
                        4 · 8 · 16
                      </span>
                    </span>
                    <span
                      className="text-[11px] truncate mt-0.5"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {t('play.tournamentCardSub')}
                    </span>
                  </span>
                </span>
                <ChevronRight
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                />
              </motion.button>

              {/* Carte compacte : Bot algorithmique adaptatif */}
              <motion.button
                type="button"
                onClick={() => {
                  haptics.tap();
                  onOpenBot();
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.34, delay: 0.03, ease: [0.22, 1, 0.36, 1] }}
                className="tactile-btn w-full rounded-[15px] px-3.5 py-3 flex items-center justify-between gap-3 text-start"
                style={{
                  backgroundColor: 'var(--bg-board)',
                  border: '1px solid var(--border-main)',
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: 'var(--x-surface)',
                      color: 'var(--x-color)',
                      border: '1px solid var(--x-color)',
                    }}
                  >
                    <Bot className="w-4 h-4" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex flex-col">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="text-xs font-bold leading-tight"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {t('play.botCardTitle')}
                      </span>
                      <span
                        className="font-mono text-[10px] font-bold rounded px-1.5 py-0.5 leading-none"
                        style={{
                          backgroundColor: 'var(--accent-active-bg)',
                          color: 'var(--accent-active-text)',
                        }}
                      >
                        {t('bot.levelBadge', {
                          level: botSummary.level,
                          elo: botSummary.elo,
                        })}
                      </span>
                    </span>
                    <span
                      className="text-[11px] truncate mt-0.5"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {t('play.botCardSub', {
                        tier: translateTier(botSummary.label),
                      })}
                    </span>
                  </span>
                </span>
                <ChevronRight
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                />
              </motion.button>

              {/* Carte compacte : Défi tactique du jour */}
              <motion.button
                type="button"
                onClick={onOpenDaily}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.34, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
                className="tactile-btn w-full rounded-[15px] px-3.5 py-3 flex items-center justify-between gap-3 text-start"
                style={{
                  backgroundColor: 'var(--bg-board)',
                  border: `1px solid ${
                    dailyStatus.solvedToday ? 'var(--x-color)' : 'var(--border-main)'
                  }`,
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: dailyStatus.solvedToday
                        ? 'var(--x-surface)'
                        : 'var(--accent-active-bg)',
                      color: dailyStatus.solvedToday
                        ? 'var(--x-color)'
                        : 'var(--accent-active-text)',
                      border: `1px solid ${
                        dailyStatus.solvedToday
                          ? 'var(--x-color)'
                          : 'var(--accent-active)'
                      }`,
                    }}
                  >
                    {dailyStatus.solvedToday ? (
                      <Check className="w-4 h-4" strokeWidth={2.4} />
                    ) : (
                      <Target className="w-4 h-4" strokeWidth={2} />
                    )}
                  </span>
                  <span className="min-w-0 flex flex-col">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="text-xs font-bold leading-tight"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {t('play.dailyCardTitle', { num: dailyInfo.number })}
                      </span>
                      <span
                        className="font-mono text-[10px] font-bold"
                        style={{ color: 'var(--accent-active-text)' }}
                        aria-label={`Difficulté ${dailyInfo.puzzle.difficulty} sur 3`}
                      >
                        {'★'.repeat(dailyInfo.puzzle.difficulty)}
                      </span>
                    </span>
                    <span
                      className="text-[11px] truncate mt-0.5"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {dailyStatus.solvedToday
                        ? 'Résolu aujourd’hui · Rejouer ou s’entraîner'
                        : dailyInfo.puzzle.title}
                    </span>
                  </span>
                </span>
                <ChevronRight
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                />
              </motion.button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
