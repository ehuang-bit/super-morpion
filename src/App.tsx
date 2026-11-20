import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DestinationPreview, Move, Player } from '@shared/gameEngine';
import type { TimeControl } from '@shared/protocol';
import { Flag, LogOut, RotateCcw } from 'lucide-react';
import { AuthModal } from './components/AuthModal';
import { BoardCustomizeModal } from './components/BoardCustomizeModal';
import { GameEndBanner } from './components/GameEndBanner';
import { GlobalBoard } from './components/GlobalBoard';
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

export function App() {
  const playerId = useMemo(() => getOrCreatePlayerId(), []);
  const profileId = useMemo(() => getOrCreateProfileId(), []);

  const auth = useAuth();

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
    authModalOpen || (!auth.loading && !auth.entryResolved && !routeRoomCode);

  const renderMainView = () => {
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
              />
            </div>

            <div className="relative flex items-center justify-center">
              <GlobalBoard
                gameState={snap.gameState}
                canInteract={canInteract}
                boardPrefs={boardPrefs}
                variant="arena"
                onPlayMove={onlineGame.playMove}
                onPreviewChange={handlePreviewChange}
              />
              {snap.phase === 'finished' && (
                <GameEndBanner
                  key={`${snap.code}-${snap.gameNumber}`}
                  players={snap.players}
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
        {renderMainView()}
      </div>

      <AuthModal
        open={showEntryAuthModal}
        defaultPseudo={pseudo}
        loading={auth.loading}
        error={auth.error}
        onClearError={auth.clearError}
        onLogin={async (u, p) => {
          const res = await auth.login(u, p);
          if (res.ok) {
            setAuthModalOpen(false);
          }
          return res.ok;
        }}
        onRegister={async (u, p) => {
          const res = await auth.register(u, p);
          if (res.ok) {
            setAuthModalOpen(false);
          }
          return res.ok;
        }}
        onContinueAsGuest={(guestName) => {
          handleChangePseudo(guestName);
          auth.continueAsGuest(guestName);
          setAuthModalOpen(false);
        }}
        onClose={() => {
          auth.continueAsGuest(pseudo);
          setAuthModalOpen(false);
        }}
      />

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
    </div>
  );
}

export default App;
