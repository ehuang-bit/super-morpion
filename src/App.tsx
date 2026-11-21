import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { getEloTier } from '@shared/elo';
import type { DestinationPreview, Move, Player } from '@shared/gameEngine';
import { MOVE_TIME_LIMIT_MS, type TimeControl } from '@shared/protocol';
import { CheckCircle2, Flag, LogOut, RotateCcw } from 'lucide-react';
import { AuthModal } from './components/AuthModal';
import { BoardCustomizeModal } from './components/BoardCustomizeModal';
import { GameEndBanner } from './components/GameEndBanner';
import { GlobalBoard } from './components/GlobalBoard';
import { LeaderboardView } from './components/LeaderboardView';
import { MatchIntro } from './components/MatchIntro';
import { MatchOutcome, type OutcomeKind } from './components/MatchOutcome';
import { MatchmakingModal } from './components/MatchmakingModal';
import { MoveHistoryRibbon } from './components/MoveHistoryRibbon';
import {
  MatchMetaStrip,
  PlayerBar,
  PlayerCard,
  TacticalStatusStrip,
} from './components/PlayerBar';
import { PlayWorkspace } from './components/PlayWorkspace';
import { RulesModal } from './components/RulesModal';
import { Sidebar, type NavTab } from './components/Sidebar';
import { StatsView } from './components/StatsView';
import { TurnTimer } from './components/TurnTimer';
import { DEMO_MODE } from './dev/demoMode';
import { useAuth } from './hooks/useAuth';
import { useClockTick } from './hooks/useClockTick';
import { useOnlineGame } from './hooks/useOnlineGame';
import type { BoardPreferences } from './types/boardPrefs';
import { applyThemeToDocument, type ThemeId } from './types/theme';
import { normalizeRoomCode } from './utils/format';
import { haptics } from './utils/haptics';
import { soundEngine } from './utils/soundEngine';
import {
  getLastJoinedRoom,
  getOrCreatePlayerId,
  getOrCreateProfileId,
  getSavedBoardPrefs,
  getSavedHaptics,
  getSavedMuted,
  getSavedPseudo,
  getSavedTheme,
  saveBoardPrefs,
  saveHaptics,
  saveLastJoinedRoom,
  saveMuted,
  savePseudo,
  saveTheme,
} from './utils/storage';

function extractRoomCodeFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/room\/([A-Za-z0-9]{4,8})\/?$/i);
  if (!match) return null;
  const code = normalizeRoomCode(match[1]);
  return code.length === 6 ? code : null;
}

const BASE_TITLE = 'Super Morpion — Duel stratégique 1v1';

// Panneau du mode démo : développement uniquement, jamais dans le site en ligne
const DemoPanel =
  import.meta.env.DEV && DEMO_MODE ? lazy(() => import('./dev/DemoPanel')) : null;

export function App() {
  const playerId = useMemo(() => getOrCreatePlayerId(), []);
  const profileId = useMemo(() => getOrCreateProfileId(), []);

  const auth = useAuth(profileId);

  const [pseudo, setPseudo] = useState<string>(() => getSavedPseudo());
  const [timeControl, setTimeControl] = useState<TimeControl>('unlimited');
  const [theme, setTheme] = useState<ThemeId>(() => getSavedTheme());
  const [boardPrefs, setBoardPrefs] = useState<BoardPreferences>(() =>
    getSavedBoardPrefs(),
  );
  const [muted, setMuted] = useState<boolean>(() => getSavedMuted());
  const [hapticsEnabled, setHapticsEnabled] = useState<boolean>(() =>
    getSavedHaptics(),
  );
  const [activeTab, setActiveTab] = useState<NavTab>('play');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [routeRoomCode, setRouteRoomCode] = useState<string | null>(() =>
    extractRoomCodeFromPath(window.location.pathname),
  );

  const [previewInfo, setPreviewInfo] = useState<{
    preview: DestinationPreview | null;
    hoveredMove: Move | null;
  }>({ preview: null, hoveredMove: null });

  const autoAttemptedRef = useRef<string | null>(null);

  const onlineGame = useOnlineGame(playerId, profileId, auth.token);

  const activePseudo = auth.user?.username || pseudo.trim() || 'Joueur 1';

  // Keep pseudo synced when user logs in
  useEffect(() => {
    if (auth.user?.username) {
      setPseudo(auth.user.username);
      savePseudo(auth.user.username);
    }
  }, [auth.user?.username]);

  // Sync audio mute, haptics & theme
  useEffect(() => {
    soundEngine.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    haptics.setEnabled(hapticsEnabled);
  }, [hapticsEnabled]);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  // Reset resign confirmation when room phase changes
  useEffect(() => {
    setConfirmResign(false);
  }, [onlineGame.snapshot?.phase]);

  useEffect(() => {
    if (!confirmResign) return;
    const timer = window.setTimeout(() => setConfirmResign(false), 3200);
    return () => window.clearTimeout(timer);
  }, [confirmResign]);

  // Fetch Elo profile & stats from Netlify Database when connected, pseudo or auth changes
  useEffect(() => {
    if (!onlineGame.connected) return;
    const timer = window.setTimeout(() => {
      void onlineGame.fetchProfile(activePseudo);
      void onlineGame.fetchStats(activePseudo);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [
    onlineGame.connected,
    activePseudo,
    auth.token,
    onlineGame.fetchProfile,
    onlineGame.fetchStats,
  ]);

  // Refresh stats when switching to the stats view
  useEffect(() => {
    if (activeTab === 'stats' && onlineGame.connected) {
      void onlineGame.fetchStats(activePseudo);
    }
  }, [activeTab, onlineGame.connected, activePseudo, onlineGame.fetchStats]);

  // Classement général
  useEffect(() => {
    if (activeTab === 'leaderboard') {
      void onlineGame.fetchLeaderboard();
    }
  }, [activeTab, auth.token, onlineGame.fetchLeaderboard]);

  // Message d'information (ex. progression invité transférée)
  useEffect(() => {
    if (!auth.notice) return;
    const timer = window.setTimeout(() => auth.clearNotice(), 4500);
    return () => window.clearTimeout(timer);
  }, [auth.notice, auth.clearNotice]);

  // Onglet du navigateur : « À toi de jouer » quand l'adversaire a joué
  const snapPhase = onlineGame.snapshot?.phase;
  const snapTurn = onlineGame.snapshot?.gameState.currentPlayer;
  const snapLocal: Player | null =
    onlineGame.snapshot?.players.X?.id === playerId
      ? 'X'
      : onlineGame.snapshot?.players.O?.id === playerId
        ? 'O'
        : null;
  useEffect(() => {
    const myTurn = snapPhase === 'playing' && snapLocal !== null && snapTurn === snapLocal;
    const update = () => {
      document.title =
        document.hidden && myTurn ? '● À toi de jouer · Super Morpion' : BASE_TITLE;
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [snapPhase, snapTurn, snapLocal]);

  // Moments forts : présentation des joueurs au lancement, séquence de fin.
  // Rien n'est joué si le système demande de réduire les animations.
  const reduceMotion = useReducedMotion();
  const [intro, setIntro] = useState<{ key: string; endsAt: number } | null>(null);
  const [outcome, setOutcome] = useState<{ key: string; kind: OutcomeKind } | null>(null);
  const seenIntroRef = useRef<string | null>(null);
  const lastPhaseRef = useRef<{ key: string; phase: string } | null>(null);
  const liveSnapshot = onlineGame.snapshot;
  const liveClockOffsetMs = onlineGame.clockOffsetMs;

  useEffect(() => {
    if (!liveSnapshot) {
      lastPhaseRef.current = null;
      setIntro(null);
      setOutcome(null);
      return;
    }
    const key = `${liveSnapshot.code}-${liveSnapshot.gameNumber}`;
    const previous = lastPhaseRef.current;
    lastPhaseRef.current = { key, phase: liveSnapshot.phase };

    // Partie qui démarre : le premier chrono n'a pas encore commencé
    if (
      liveSnapshot.phase === 'playing' &&
      liveSnapshot.gameState.moveHistory.length === 0 &&
      liveSnapshot.turnStartedAt !== null &&
      seenIntroRef.current !== key
    ) {
      seenIntroRef.current = key;
      const remaining = liveSnapshot.turnStartedAt - (Date.now() + liveClockOffsetMs);
      if (!reduceMotion && remaining > 900) {
        setIntro({ key, endsAt: Date.now() + remaining - 250 });
      }
    }

    if (liveSnapshot.phase !== 'finished') {
      setOutcome(null);
    } else if (
      previous &&
      previous.key === key &&
      previous.phase === 'playing' &&
      liveSnapshot.endReason !== 'aborted' &&
      snapLocal !== null &&
      !reduceMotion
    ) {
      // Fin de partie vécue en direct (pas un rechargement de page)
      setOutcome({
        key,
        kind:
          liveSnapshot.matchWinner === null
            ? 'draw'
            : liveSnapshot.matchWinner === snapLocal
              ? 'win'
              : 'loss',
      });
    }
  }, [liveSnapshot, liveClockOffsetMs, reduceMotion, snapLocal]);

  useEffect(() => {
    if (!intro) return;
    const timer = window.setTimeout(
      () => setIntro(null),
      Math.max(0, intro.endsAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [intro]);

  const handleOutcomeDone = useCallback(() => setOutcome(null), []);

  // Browser back/forward navigation
  useEffect(() => {
    const onPopState = () => {
      const code = extractRoomCodeFromPath(window.location.pathname);
      setRouteRoomCode(code);
      if (!code && onlineGame.snapshot) {
        saveLastJoinedRoom(null);
        onlineGame.leaveRoom();
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [onlineGame.snapshot, onlineGame.leaveRoom]);

  const navigateTo = useCallback((path: string, replace = false) => {
    if (window.location.pathname === path) return;
    if (replace) {
      window.history.replaceState({}, '', path);
    } else {
      window.history.pushState({}, '', path);
    }
  }, []);

  // Keep URL synced when entering a room
  useEffect(() => {
    if (onlineGame.snapshot) {
      const code = onlineGame.snapshot.code;
      saveLastJoinedRoom(code);
      setRouteRoomCode(code);
      setActiveTab('play');
      navigateTo(`/room/${code}`, true);
    }
  }, [onlineGame.snapshot?.code, navigateTo]);

  // Handle direct visit or refresh on /room/:code
  useEffect(() => {
    if (!routeRoomCode || !onlineGame.connected || onlineGame.snapshot) {
      return;
    }

    if (autoAttemptedRef.current === routeRoomCode) {
      return;
    }
    autoAttemptedRef.current = routeRoomCode;

    const lastRoom = getLastJoinedRoom();
    if (lastRoom === routeRoomCode) {
      void onlineGame.joinRoom({
        code: routeRoomCode,
        pseudo: activePseudo,
      });
    } else {
      void onlineGame.peekRoom(routeRoomCode);
    }
  }, [
    routeRoomCode,
    onlineGame.connected,
    onlineGame.snapshot,
    onlineGame.joinRoom,
    onlineGame.peekRoom,
    activePseudo,
  ]);

  const handleChangePseudo = useCallback((value: string) => {
    setPseudo(value);
    savePseudo(value);
  }, []);

  const handleChangeTheme = useCallback((nextTheme: ThemeId) => {
    setTheme(nextTheme);
    saveTheme(nextTheme);
    applyThemeToDocument(nextTheme);
    haptics.tap();
  }, []);

  const handleChangeBoardPrefs = useCallback((next: BoardPreferences) => {
    setBoardPrefs(next);
    saveBoardPrefs(next);
    haptics.tap();
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      saveMuted(next);
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const handleToggleHaptics = useCallback(() => {
    setHapticsEnabled((prev) => {
      const next = !prev;
      saveHaptics(next);
      haptics.setEnabled(next);
      if (next) haptics.tap();
      return next;
    });
  }, []);

  const handlePreviewChange = useCallback(
    (preview: DestinationPreview | null, hoveredMove: Move | null) => {
      setPreviewInfo({ preview, hoveredMove });
    },
    [],
  );

  const handleCreateRoom = async () => {
    const snap = await onlineGame.createRoom({
      pseudo: activePseudo,
      timeControl,
    });
    if (snap) {
      autoAttemptedRef.current = snap.code;
      saveLastJoinedRoom(snap.code);
      setRouteRoomCode(snap.code);
      navigateTo(`/room/${snap.code}`);
    }
  };

  const handleJoinByCode = async (rawCode: string) => {
    const code = normalizeRoomCode(rawCode);
    if (code.length !== 6) return;
    const snap = await onlineGame.joinRoom({
      code,
      pseudo: activePseudo,
    });
    if (snap) {
      autoAttemptedRef.current = snap.code;
      saveLastJoinedRoom(snap.code);
      setRouteRoomCode(snap.code);
      navigateTo(`/room/${snap.code}`);
    }
  };

  const handleLeaveOnline = useCallback(() => {
    autoAttemptedRef.current = null;
    saveLastJoinedRoom(null);
    onlineGame.leaveRoom();
    setRouteRoomCode(null);
    setPreviewInfo({ preview: null, hoveredMove: null });
    navigateTo('/');
  }, [onlineGame, navigateTo]);

  const onlineClockValues = useClockTick({
    clocks: onlineGame.snapshot?.clocks ?? null,
    turnStartedAt: onlineGame.snapshot?.turnStartedAt ?? null,
    activePlayer: onlineGame.snapshot?.gameState.currentPlayer ?? 'X',
    isRunning: onlineGame.snapshot?.phase === 'playing',
    clockOffsetMs: onlineGame.clockOffsetMs,
  });

  const inActiveMatch = Boolean(
    onlineGame.snapshot &&
      (onlineGame.snapshot.phase === 'playing' ||
        onlineGame.snapshot.phase === 'finished'),
  );

  // Show AuthModal automatically on initial visit if user hasn't logged in or chosen guest mode yet
  const showEntryAuthModal =
    authModalOpen ||
    Boolean(auth.onboarding) ||
    auth.magicLinkNeedsEmail ||
    (!auth.loading && !auth.entryResolved && !routeRoomCode);

  const inMatchView = Boolean(
    onlineGame.snapshot &&
      (onlineGame.snapshot.phase === 'playing' ||
        onlineGame.snapshot.phase === 'finished'),
  );
  const viewKey =
    activeTab === 'stats'
      ? 'stats'
      : activeTab === 'leaderboard'
        ? 'leaderboard'
        : inMatchView
          ? `match-${onlineGame.snapshot?.code ?? ''}`
          : 'home';

  const renderMainView = () => {
    // 0. Classement général
    if (activeTab === 'leaderboard') {
      return (
        <LeaderboardView
          user={auth.user}
          data={onlineGame.leaderboard}
          loading={onlineGame.leaderboardLoading}
          onRefresh={() => void onlineGame.fetchLeaderboard()}
          onOpenAuth={() => setAuthModalOpen(true)}
          onPlay={() => setActiveTab('play')}
        />
      );
    }

    // 1. Personal Statistics View
    if (activeTab === 'stats') {
      return (
        <StatsView
          user={auth.user}
          pseudo={activePseudo}
          playerElo={onlineGame.playerElo}
          stats={onlineGame.stats}
          loading={onlineGame.statsLoading}
          pieceStyle={boardPrefs.pieceStyle}
          onRefresh={() => void onlineGame.fetchStats(activePseudo)}
          onBackToPlay={() => setActiveTab('play')}
          onOpenAuth={() => setAuthModalOpen(true)}
        />
      );
    }

    // 2. Active Online Match (Playing or Finished)
    if (
      onlineGame.snapshot &&
      (onlineGame.snapshot.phase === 'playing' ||
        onlineGame.snapshot.phase === 'finished')
    ) {
      const snap = onlineGame.snapshot;

      const localSymbol: Player | null =
        snap.players.X?.id === playerId
          ? 'X'
          : snap.players.O?.id === playerId
            ? 'O'
            : null;
      const opponent =
        localSymbol === 'X'
          ? snap.players.O
          : localSymbol === 'O'
            ? snap.players.X
            : null;

      const canInteract =
        snap.phase === 'playing' &&
        localSymbol !== null &&
        snap.gameState.currentPlayer === localSymbol;

      const selfVotedRematch = snap.rematchVotes.includes(playerId);
      const opponentVotedRematch = opponent
        ? snap.rematchVotes.includes(opponent.id)
        : false;

      const xCaptured = snap.gameState.boards.filter((b) => b.status === 'X').length;
      const oCaptured = snap.gameState.boards.filter((b) => b.status === 'O').length;
      const bottomSymbol: Player = localSymbol === 'O' ? 'O' : 'X';

      const matchKey = `${snap.code}-${snap.gameNumber}`;
      const outcomePlaying = outcome !== null && outcome.key === matchKey;
      const lostMatch =
        snap.phase === 'finished' &&
        snap.endReason !== 'aborted' &&
        localSymbol !== null &&
        snap.matchWinner !== null &&
        snap.matchWinner !== localSymbol;
      const topSymbol: Player = bottomSymbol === 'X' ? 'O' : 'X';

      const renderMobileCard = (symbol: Player) => {
        const clockMs = onlineClockValues ? onlineClockValues[symbol] : null;
        return (
          <PlayerCard
            symbol={symbol}
            player={snap.players[symbol]}
            isTurn={
              snap.phase === 'playing' && snap.gameState.currentPlayer === symbol
            }
            isSelf={localSymbol === symbol}
            isOpponent={Boolean(localSymbol && localSymbol !== symbol)}
            clockMs={clockMs}
            isLowClock={
              clockMs !== null && clockMs <= 15_000 && snap.phase === 'playing'
            }
            capturedCount={symbol === 'X' ? xCaptured : oCaptured}
            pieceStyle={boardPrefs.pieceStyle}
            variant="wide"
          />
        );
      };

      return (
        <div className="flex-1 flex flex-col items-center justify-between gap-1.5 sm:gap-2 py-2 sm:py-3 px-2">
          {/* Desktop top header */}
          <div className="hidden sm:block w-full">
            <PlayerBar
              players={snap.players}
              gameState={snap.gameState}
              phase={snap.phase}
              clocks={onlineClockValues}
              localPlayerSymbol={localSymbol}
              isOnline
              roomCode={snap.code}
              eloStakes={snap.eloStakes}
              endReason={snap.endReason}
              matchWinner={snap.matchWinner}
              preview={previewInfo.preview}
              hoveredMove={previewInfo.hoveredMove}
              pieceStyle={boardPrefs.pieceStyle}
              moveTimeouts={snap.moveTimeouts}
            />
          </div>

          {/* Mobile top match meta strip */}
          <div className="sm:hidden w-full pt-0.5">
            <MatchMetaStrip
              timeControl={snap.timeControl}
              roomCode={snap.code}
              eloStakes={snap.eloStakes}
              perspectiveSymbol={localSymbol}
            />
          </div>

          {/* Center arena */}
          <div className="w-full flex flex-col items-center gap-2 my-auto">
            <div className="sm:hidden w-full flex flex-col gap-1.5">
              {renderMobileCard(topSymbol)}
              <TacticalStatusStrip
                players={snap.players}
                gameState={snap.gameState}
                phase={snap.phase}
                localPlayerSymbol={localSymbol}
                isOnline
                endReason={snap.endReason}
                matchWinner={snap.matchWinner}
                preview={previewInfo.preview}
                hoveredMove={previewInfo.hoveredMove}
                moveTimeouts={snap.moveTimeouts}
              />
            </div>

            <div className="relative flex items-center justify-center">
              {/* Après une défaite, le plateau perd ses couleurs */}
              <div
                style={{
                  filter: lostMatch ? 'grayscale(0.9)' : 'grayscale(0)',
                  transition: 'filter 800ms ease',
                }}
              >
                <GlobalBoard
                  gameState={snap.gameState}
                  canInteract={canInteract}
                  boardPrefs={boardPrefs}
                  variant="arena"
                  onPlayMove={onlineGame.playMove}
                  onPreviewChange={handlePreviewChange}
                />
              </div>
              <TurnTimer
                turnStartedAt={snap.turnStartedAt}
                limitMs={snap.moveTimeLimitMs ?? MOVE_TIME_LIMIT_MS}
                clockOffsetMs={onlineGame.clockOffsetMs}
                activePlayer={snap.gameState.currentPlayer}
                isSelfTurn={canInteract}
                running={snap.phase === 'playing'}
                strictCorners={boardPrefs.boardShape === 'strict'}
              />
              {snap.phase === 'finished' && !outcomePlaying && (
                <GameEndBanner
                  key={`${snap.code}-${snap.gameNumber}`}
                  players={snap.players}
                  localSymbol={localSymbol}
                  matchWinner={snap.matchWinner}
                  endReason={snap.endReason}
                  eloResult={snap.eloResult}
                  isOnline
                  selfVotedRematch={selfVotedRematch}
                  opponentVotedRematch={opponentVotedRematch}
                  onRematch={onlineGame.requestRematch}
                  onLeave={handleLeaveOnline}
                />
              )}
            </div>

            <div className="sm:hidden w-full">
              {renderMobileCard(bottomSymbol)}
            </div>

            <MoveHistoryRibbon gameState={snap.gameState} />
          </div>

          {/* Compact Match Action Bar */}
          <div className="w-full max-w-[580px] mx-auto flex items-center justify-between gap-2 rounded-[11px] px-3 py-1.5"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
            }}
          >
            <span
              className="font-mono text-xs font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              Salon #{snap.code} · Manche {snap.gameNumber}
            </span>

            <div className="flex items-center gap-1.5">
              {snap.phase === 'playing' && (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmResign) {
                      setConfirmResign(true);
                      return;
                    }
                    setConfirmResign(false);
                    void onlineGame.resign();
                  }}
                  className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                  style={{
                    backgroundColor: confirmResign
                      ? 'var(--danger-bg)'
                      : 'var(--bg-surface)',
                    color: confirmResign
                      ? 'var(--danger-color)'
                      : 'var(--text-secondary)',
                    border: `1px solid ${
                      confirmResign
                        ? 'var(--danger-color)'
                        : 'var(--border-cell)'
                    }`,
                  }}
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>{confirmResign ? 'Confirmer abandon' : 'Abandonner'}</span>
                </button>
              )}

              {snap.phase === 'finished' && (
                <button
                  type="button"
                  onClick={() => void onlineGame.requestRematch()}
                  disabled={selfVotedRematch}
                  className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
                  style={{
                    backgroundColor: 'var(--btn-primary-bg)',
                    color: 'var(--btn-primary-text)',
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{selfVotedRematch ? 'Attente…' : 'Revanche'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleLeaveOnline}
                aria-label="Quitter la partie"
                title="Quitter vers le plateau d’accueil"
                className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-cell)',
                }}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Quitter</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // 3. Board-First Entry Workspace (also handles WaitingLobby & JoinPrompt alongside the board!)
    return (
      <PlayWorkspace
        user={auth.user}
        pseudo={pseudo}
        onChangePseudo={handleChangePseudo}
        timeControl={timeControl}
        onChangeTimeControl={setTimeControl}
        playerElo={onlineGame.playerElo}
        theme={theme}
        onChangeTheme={handleChangeTheme}
        boardPrefs={boardPrefs}
        connected={onlineGame.connected}
        connectionStatus={onlineGame.connectionStatus}
        isBusy={onlineGame.isBusy}
        error={onlineGame.error}
        lobby={onlineGame.lobby}
        waitingSnapshot={
          onlineGame.snapshot?.phase === 'waiting'
            ? onlineGame.snapshot
            : null
        }
        routeRoomCode={routeRoomCode}
        peekInfo={onlineGame.peekInfo}
        peekError={onlineGame.peekError}
        onCreateRoom={handleCreateRoom}
        onJoinCode={handleJoinByCode}
        onJoinMatchmaking={() =>
          void onlineGame.joinMatchmaking({
            pseudo: activePseudo,
            timeControl,
          })
        }
        onCancelWaitingOrPrompt={handleLeaveOnline}
        onOpenCustomize={() => setCustomizeOpen(true)}
        onOpenStats={() => setActiveTab('stats')}
        onOpenAuth={() => setAuthModalOpen(true)}
      />
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col lg:flex-row">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenCustomize={() => setCustomizeOpen(true)}
        onOpenRules={() => setRulesOpen(true)}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={() => void auth.logout()}
        user={auth.user}
        pseudo={activePseudo}
        playerElo={onlineGame.playerElo}
        theme={theme}
        onChangeTheme={handleChangeTheme}
        muted={muted}
        onToggleMute={handleToggleMute}
        hapticsEnabled={hapticsEnabled}
        onToggleHaptics={handleToggleHaptics}
        connected={onlineGame.connected}
        inActiveMatch={inActiveMatch}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Animation d'entrée en CSS : jamais bloquée, même onglet en arrière-plan */}
        <div key={viewKey} className="view-enter flex-1 min-w-0 flex flex-col">
          {renderMainView()}
        </div>
      </div>

      <AuthModal
        open={showEntryAuthModal}
        auth={auth}
        defaultPseudo={pseudo}
        onSignedIn={() => setAuthModalOpen(false)}
        onContinueAsGuest={(guestName) => {
          handleChangePseudo(guestName);
          auth.continueAsGuest(guestName);
          setAuthModalOpen(false);
        }}
        onClose={() => {
          if (!auth.user) auth.continueAsGuest(pseudo);
          setAuthModalOpen(false);
        }}
      />

      <AnimatePresence>
        {auth.notice && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] max-w-[92vw] rounded-full px-4 py-2 text-xs sm:text-sm font-semibold inline-flex items-center gap-2"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
              boxShadow: 'var(--shadow-board)',
            }}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{auth.notice}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <MatchmakingModal
        open={onlineGame.matchmaking.searching}
        timeControl={onlineGame.matchmaking.timeControl}
        queueSize={onlineGame.matchmaking.queueSize}
        onCancel={onlineGame.cancelMatchmaking}
      />

      <BoardCustomizeModal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        theme={theme}
        onChangeTheme={handleChangeTheme}
        boardPrefs={boardPrefs}
        onChangeBoardPrefs={handleChangeBoardPrefs}
      />

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />

      <AnimatePresence>
        {intro && liveSnapshot && liveSnapshot.phase === 'playing' && (
          <MatchIntro
            key={intro.key}
            players={liveSnapshot.players}
            localSymbol={snapLocal}
            eloStakes={liveSnapshot.eloStakes}
            timeControl={liveSnapshot.timeControl}
            pieceStyle={boardPrefs.pieceStyle}
          />
        )}
      </AnimatePresence>

      {outcome &&
        liveSnapshot &&
        liveSnapshot.phase === 'finished' &&
        (() => {
          const result =
            snapLocal && liveSnapshot.eloResult ? liveSnapshot.eloResult[snapLocal] : null;
          const promoted =
            outcome.kind === 'win' &&
            result !== null &&
            result.rated !== false &&
            getEloTier(result.after).min > getEloTier(result.before).min;
          const winner = liveSnapshot.matchWinner;
          return (
            <MatchOutcome
              key={outcome.key}
              kind={outcome.kind}
              inkColor={
                winner === 'X'
                  ? 'var(--x-color)'
                  : winner === 'O'
                    ? 'var(--o-color)'
                    : 'var(--text-secondary)'
              }
              confettiVars={[
                '--bg-board',
                '--accent-active',
                winner === 'X' ? '--o-color' : '--x-color',
              ]}
              myResult={result}
              promotionLabel={promoted && result ? getEloTier(result.after).label : null}
              onDone={handleOutcomeDone}
            />
          );
        })()}

      {DemoPanel && (
        <Suspense fallback={null}>
          <DemoPanel />
        </Suspense>
      )}
    </div>
  );
}

export default App;
