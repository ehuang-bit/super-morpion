import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { getEloTier, INITIAL_ELO } from '@shared/elo';
import { getBotLevelProfile, type BotProgressState } from '@shared/botEngine';
import type { DestinationPreview, Move, Player } from '@shared/gameEngine';
import {
  MOVE_TIME_LIMIT_MS,
  type RoomEmote,
  type RoomMode,
  type TimeControl,
} from '@shared/protocol';
import { CheckCircle2, Crown, Eye, Flag, LogOut, RotateCcw, X } from 'lucide-react';
import { AuthModal } from './components/AuthModal';
import { BotMatchView } from './components/BotMatchView';
import { CustomizeView } from './components/CustomizeView';
import { DailyPuzzleView } from './components/DailyPuzzleView';
import { EmoteBar } from './components/EmoteBar';
import { GameEndBanner } from './components/GameEndBanner';
import { GlobalBoard } from './components/GlobalBoard';
import { LaunchSplash } from './components/LaunchSplash';
import { LeaderboardView } from './components/LeaderboardView';
import { MatchIntro } from './components/MatchIntro';
import { MatchOutcome, type OutcomeKind } from './components/MatchOutcome';
import { MobileTabBar } from './components/MobileTabBar';
import { MoveHistoryRibbon } from './components/MoveHistoryRibbon';
import {
  MatchMetaStrip,
  PlayerBar,
  PlayerCard,
  TacticalStatusStrip,
  TeamRelayStrip,
} from './components/PlayerBar';
import { PlayWorkspace } from './components/PlayWorkspace';
import { RulesModal } from './components/RulesModal';
import { Sidebar, type NavTab } from './components/Sidebar';
import { StatsView } from './components/StatsView';
import { StreakCelebrationToast } from './components/StreakBadge';
import { TournamentView } from './components/TournamentView';
import { TurnTimer } from './components/TurnTimer';
import { VictoryCardModal } from './components/VictoryCardModal';
import { DEMO_MODE } from './dev/demoMode';
import { useAuth } from './hooks/useAuth';
import { useClockTick } from './hooks/useClockTick';
import {
  getLocalSeat,
  getLocalSymbol,
  useOnlineGame,
} from './hooks/useOnlineGame';
import { getSavedTournamentCode, useTournament } from './hooks/useTournament';
import { useI18n } from './i18n';
import type { BoardPreferences } from './types/boardPrefs';
import {
  applyThemeToDocument,
  type ThemeId,
  type ThemeTransitionOrigin,
} from './types/theme';
import { loadBotProgress } from './utils/botStorage';
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
import type { VictoryCardData } from './utils/victoryCard';

function extractRoomCodeFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/room\/([A-Za-z0-9]{4,8})\/?$/i);
  if (!match) return null;
  const code = normalizeRoomCode(match[1]);
  return code.length === 6 ? code : null;
}

function extractTournamentCodeFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/(?:tournoi|tournament)\/([A-Za-z0-9]{4,8})\/?$/i);
  if (!match) return null;
  const code = normalizeRoomCode(match[1]);
  return code.length === 6 ? code : null;
}

// Panneau du mode démo : développement uniquement, jamais dans le site en ligne
const DemoPanel =
  import.meta.env.DEV && DEMO_MODE ? lazy(() => import('./dev/DemoPanel')) : null;

export function App() {
  const { t, translateRoundKey } = useI18n();
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
  const initialTournamentCode = useMemo(
    () => extractTournamentCodeFromPath(window.location.pathname),
    [],
  );
  const [activeTab, setActiveTab] = useState<NavTab>(() =>
    initialTournamentCode ? 'tournament' : 'play',
  );
  const [rulesOpen, setRulesOpen] = useState(false);
  const [tutorialRequest, setTutorialRequest] = useState(0);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [endBannerHidden, setEndBannerHidden] = useState(false);
  const [victoryCardOpen, setVictoryCardOpen] = useState(false);
  const [visibleEmote, setVisibleEmote] = useState<RoomEmote | null>(null);
  const lastSeenEmoteIdRef = useRef<string | null>(null);
  const [routeRoomCode, setRouteRoomCode] = useState<string | null>(() =>
    extractRoomCodeFromPath(window.location.pathname),
  );
  const [routeTournamentCode, setRouteTournamentCode] = useState<string | null>(
    () => initialTournamentCode,
  );

  const [previewInfo, setPreviewInfo] = useState<{
    preview: DestinationPreview | null;
    hoveredMove: Move | null;
  }>({ preview: null, hoveredMove: null });

  const autoAttemptedRef = useRef<string | null>(null);
  const autoTournamentRef = useRef<string | null>(null);

  const onlineGame = useOnlineGame(playerId, profileId, auth.token);
  const tournament = useTournament(playerId, profileId, auth.token);

  // Progression locale du bot adaptatif (calibrée sur l'Elo du joueur)
  const botScopeId = auth.user?.id || profileId;
  const effectiveRating = onlineGame.playerElo.profile.rating ?? INITIAL_ELO;
  const [botProgress, setBotProgress] = useState<BotProgressState>(() =>
    loadBotProgress(botScopeId, effectiveRating),
  );
  useEffect(() => {
    setBotProgress(loadBotProgress(botScopeId, effectiveRating));
  }, [botScopeId, effectiveRating]);

  const botSummary = useMemo(() => {
    const prof = getBotLevelProfile(botProgress.level);
    return {
      level: prof.level,
      label: prof.label,
      elo: prof.elo,
      wins: botProgress.wins,
    };
  }, [botProgress.level, botProgress.wins]);

  // Compte connecté : le nom en partie personnalisé prime sur le pseudo du compte
  const activePseudo =
    auth.user?.gameName || auth.user?.username || pseudo.trim() || 'Joueur 1';

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
    // Applique la palette sauvegardée au premier chargement uniquement
    // (les changements suivants passent par handleChangeTheme avec fondu doux)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset resign confirmation & souvenir modal when room phase changes
  useEffect(() => {
    setConfirmResign(false);
    if (onlineGame.snapshot?.phase !== 'finished') {
      setVictoryCardOpen(false);
    }
  }, [onlineGame.snapshot?.phase, onlineGame.snapshot?.gameNumber]);

  // Affichage éphémère des tampons d'encre / emotes reçus (2,8 s)
  const latestEmote = onlineGame.snapshot?.lastEmote ?? null;
  useEffect(() => {
    if (!latestEmote) {
      setVisibleEmote(null);
      return;
    }
    if (lastSeenEmoteIdRef.current === latestEmote.id) return;
    lastSeenEmoteIdRef.current = latestEmote.id;
    setVisibleEmote(latestEmote);
    const timer = window.setTimeout(() => {
      setVisibleEmote((curr) => (curr?.id === latestEmote.id ? null : curr));
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [latestEmote]);

  useEffect(() => {
    if (!confirmResign) return;
    const timer = window.setTimeout(() => setConfirmResign(false), 3500);
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

  // Onglet du navigateur : « À toi de jouer » quand c'est exactement notre tour (1v1 ou 2v2)
  const snapPhase = onlineGame.snapshot?.phase;
  const snapMode = onlineGame.snapshot?.mode ?? '1v1';
  const snapTurn = onlineGame.snapshot?.gameState.currentPlayer;
  const snapActiveSeat = onlineGame.snapshot?.activeSeat ?? null;
  const snapLocalSeat = getLocalSeat(onlineGame.snapshot, playerId);
  const snapLocal = getLocalSymbol(onlineGame.snapshot, playerId);

  useEffect(() => {
    const myTurn =
      snapPhase === 'playing' &&
      (snapMode === '2v2'
        ? snapLocalSeat !== null && snapActiveSeat === snapLocalSeat
        : snapLocal !== null && snapTurn === snapLocal);
    const update = () => {
      document.title =
        document.hidden && myTurn ? t('app.yourTurnTitle') : t('app.title');
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [snapPhase, snapMode, snapTurn, snapActiveSeat, snapLocalSeat, snapLocal, t]);

  // Moments forts : présentation des joueurs au lancement, séquence de fin.
  // Rien n'est joué si le système demande de réduire les animations.
  const reduceMotion = useReducedMotion();
  // Animation d'ouverture : une fois par chargement du site
  const [splashVisible, setSplashVisible] = useState(true);
  const handleSplashDone = useCallback(() => setSplashVisible(false), []);
  const [intro, setIntro] = useState<{ key: string; endsAt: number } | null>(null);
  const [outcome, setOutcome] = useState<{ key: string; kind: OutcomeKind } | null>(null);
  const [outcomeAnimatedKey, setOutcomeAnimatedKey] = useState<string | null>(null);
  const seenIntroRef = useRef<string | null>(null);
  const lastPhaseRef = useRef<{ key: string; phase: string } | null>(null);
  const liveSnapshot = onlineGame.snapshot;
  const liveClockOffsetMs = onlineGame.clockOffsetMs;

  useEffect(() => {
    if (!liveSnapshot) {
      lastPhaseRef.current = null;
      setIntro(null);
      setOutcome(null);
      setEndBannerHidden(false);
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
      setEndBannerHidden(false);
    } else if (
      previous &&
      previous.key === key &&
      previous.phase === 'playing' &&
      liveSnapshot.endReason !== 'aborted' &&
      snapLocal !== null
    ) {
      // Actualise la flamme quotidienne du compte connecté à la fin de la partie
      if (auth.token) {
        window.setTimeout(() => {
          void auth.refreshSession();
        }, 250);
      }
      if (!reduceMotion) {
        // Fin de partie vécue en direct (pas un rechargement de page)
        setOutcomeAnimatedKey(key);
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
    }
  }, [
    liveSnapshot,
    liveClockOffsetMs,
    reduceMotion,
    snapLocal,
    auth.token,
    auth.refreshSession,
  ]);

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
      const tCode = extractTournamentCodeFromPath(window.location.pathname);
      setRouteRoomCode(code);
      setRouteTournamentCode(tCode);
      if (tCode) {
        setActiveTab('tournament');
      }
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

  // Keep URL synced when viewing a tournament
  useEffect(() => {
    if (activeTab === 'tournament' && tournament.snapshot) {
      setRouteTournamentCode(tournament.snapshot.code);
      navigateTo(`/tournoi/${tournament.snapshot.code}`, true);
    }
  }, [activeTab, tournament.snapshot?.code, navigateTo]);

  // Handle direct visit on /tournoi/:code or restore last active tournament
  useEffect(() => {
    if (!onlineGame.connected) return;
    const targetCode =
      routeTournamentCode ??
      (activeTab === 'tournament' && !tournament.snapshot
        ? getSavedTournamentCode()
        : null);
    if (!targetCode) return;
    if (tournament.snapshot?.code === targetCode) return;
    if (autoTournamentRef.current === targetCode) return;
    autoTournamentRef.current = targetCode;
    void tournament.loadTournament(targetCode);
  }, [
    onlineGame.connected,
    routeTournamentCode,
    activeTab,
    tournament.snapshot?.code,
    tournament.loadTournament,
  ]);

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

  const handleChangeTheme = useCallback(
    (nextTheme: ThemeId, origin?: ThemeTransitionOrigin) => {
      saveTheme(nextTheme);
      soundEngine.playThemeSwitch();
      haptics.tap();
      const resolvedOrigin = origin ?? {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
      applyThemeToDocument(nextTheme, resolvedOrigin, () => {
        flushSync(() => {
          setTheme(nextTheme);
        });
      });
    },
    [],
  );

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

  const handleCreateRoom = async (mode: RoomMode = '1v1') => {
    const snap = await onlineGame.createRoom({
      pseudo: activePseudo,
      timeControl,
      mode,
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
    const returnTournamentCode = onlineGame.snapshot?.tournament?.code ?? null;
    autoAttemptedRef.current = null;
    saveLastJoinedRoom(null);
    onlineGame.leaveRoom();
    setRouteRoomCode(null);
    setVictoryCardOpen(false);
    setVisibleEmote(null);
    setPreviewInfo({ preview: null, hoveredMove: null });
    if (returnTournamentCode) {
      autoTournamentRef.current = null;
      setRouteTournamentCode(returnTournamentCode);
      setActiveTab('tournament');
      navigateTo(`/tournoi/${returnTournamentCode}`);
      void tournament.loadTournament(returnTournamentCode);
    } else {
      navigateTo('/');
    }
  }, [onlineGame, tournament, navigateTo]);

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

  // Ne bloque plus la première visite : la fenêtre de connexion ne s'ouvre qu'à la demande ou lors d'un flux d'inscription externe
  const showEntryAuthModal =
    authModalOpen || Boolean(auth.onboarding) || auth.magicLinkNeedsEmail;

  const inMatchView = Boolean(
    onlineGame.snapshot &&
      (onlineGame.snapshot.phase === 'playing' ||
        onlineGame.snapshot.phase === 'finished'),
  );
  const viewKey =
    activeTab === 'tournament'
      ? `tournament-${tournament.snapshot?.code ?? 'hub'}`
      : activeTab === 'bot'
        ? 'bot'
        : activeTab === 'daily'
          ? 'daily'
          : activeTab === 'stats'
            ? 'stats'
            : activeTab === 'leaderboard'
              ? 'leaderboard'
              : activeTab === 'customize'
                ? 'customize'
                : inMatchView
                  ? `match-${onlineGame.snapshot?.code ?? ''}`
                  : 'home';

  const victoryCardData: VictoryCardData | null = useMemo(() => {
    if (!liveSnapshot || liveSnapshot.phase !== 'finished') return null;
    const is2v2 = liveSnapshot.mode === '2v2' && liveSnapshot.seats !== null;
    const teamXNames = is2v2
      ? [liveSnapshot.seats!.A?.pseudo ?? 'Joueur A', liveSnapshot.seats!.B?.pseudo ?? 'Joueur B']
      : [liveSnapshot.players.X?.pseudo ?? 'Joueur X'];
    const teamONames = is2v2
      ? [liveSnapshot.seats!.C?.pseudo ?? 'Joueur C', liveSnapshot.seats!.D?.pseudo ?? 'Joueur D']
      : [liveSnapshot.players.O?.pseudo ?? 'Joueur O'];
    const myElo =
      snapLocal && liveSnapshot.eloResult ? liveSnapshot.eloResult[snapLocal] : null;
    return {
      gameState: liveSnapshot.gameState,
      mode: liveSnapshot.mode,
      teamXNames,
      teamONames,
      matchWinner: liveSnapshot.matchWinner,
      endReason: liveSnapshot.endReason,
      localSymbol: snapLocal,
      timeControl: liveSnapshot.timeControl,
      eloDelta: myElo && myElo.rated !== false ? myElo.delta : null,
      eloAfter: myElo && myElo.rated !== false ? myElo.after : null,
      pieceStyle: boardPrefs.pieceStyle,
    };
  }, [liveSnapshot, snapLocal, boardPrefs.pieceStyle]);

  const renderMainView = () => {
    // 00. Espace Tournoi entre amis (4 / 8 / 16 joueurs)
    if (activeTab === 'tournament') {
      return (
        <main className="w-full flex-1 px-3 sm:px-6 py-3 sm:py-5">
          <TournamentView
            playerId={playerId}
            pseudo={activePseudo}
            onChangePseudo={handleChangePseudo}
            hasAccount={Boolean(auth.user)}
            snapshot={tournament.snapshot}
            loading={tournament.loading}
            busyMatchId={tournament.busyMatchId}
            error={tournament.error}
            onClearError={tournament.clearError}
            onCreate={async (params) => {
              const created = await tournament.createTournament(params);
              if (created) {
                autoTournamentRef.current = created.code;
                setRouteTournamentCode(created.code);
                navigateTo(`/tournoi/${created.code}`);
              }
              return created;
            }}
            onJoin={async (params) => {
              const joined = await tournament.joinTournament(params);
              if (joined) {
                autoTournamentRef.current = joined.code;
                setRouteTournamentCode(joined.code);
                navigateTo(`/tournoi/${joined.code}`);
              }
              return joined;
            }}
            onRefresh={() => {
              if (tournament.snapshot) {
                void tournament.loadTournament(tournament.snapshot.code);
              }
            }}
            onLeaveOrKick={async (targetPlayerId) => {
              const ok = await tournament.leaveOrKick(targetPlayerId);
              if (ok && (!targetPlayerId || targetPlayerId === playerId)) {
                autoTournamentRef.current = null;
                setRouteTournamentCode(null);
                navigateTo('/');
              }
              return ok;
            }}
            onStart={tournament.startTournament}
            onPlayMatch={async (matchId) => {
              const launched = await tournament.playMatch({
                matchId,
                pseudo: activePseudo,
              });
              if (launched) {
                autoAttemptedRef.current = launched.roomCode;
                saveLastJoinedRoom(launched.roomCode);
                setRouteRoomCode(launched.roomCode);
                onlineGame.enterRoomSnapshot(launched.snapshot, launched.version);
                setActiveTab('play');
                navigateTo(`/room/${launched.roomCode}`);
              }
              return launched;
            }}
            onWatchRoom={(roomCode) => {
              void handleJoinByCode(roomCode);
            }}
            onAdvanceForfeit={tournament.advanceMatchByForfeit}
            onExitHub={() => {
              autoTournamentRef.current = null;
              tournament.clearTournament();
              setRouteTournamentCode(null);
              navigateTo('/');
            }}
            onBackToPlay={() => {
              setActiveTab('play');
              if (window.location.pathname.startsWith('/tournoi')) {
                navigateTo('/');
              }
            }}
          />
        </main>
      );
    }

    // 0. Couleurs & personnalisation du plateau
    if (activeTab === 'customize') {
      return (
        <CustomizeView
          theme={theme}
          onChangeTheme={handleChangeTheme}
          boardPrefs={boardPrefs}
          onChangeBoardPrefs={handleChangeBoardPrefs}
          inActiveMatch={inActiveMatch}
          onBackToPlay={() => setActiveTab('play')}
          hapticsEnabled={hapticsEnabled}
          onToggleHaptics={handleToggleHaptics}
        />
      );
    }

    // 0a. Bot algorithmique adaptatif
    if (activeTab === 'bot') {
      return (
        <BotMatchView
          scopeId={botScopeId}
          pseudo={activePseudo}
          playerElo={onlineGame.playerElo.profile}
          boardPrefs={boardPrefs}
          onBackToPlay={() => setActiveTab('play')}
          onProgressChange={setBotProgress}
        />
      );
    }

    // 0b. Défi tactique du jour
    if (activeTab === 'daily') {
      return (
        <DailyPuzzleView
          boardPrefs={boardPrefs}
          user={auth.user}
          onSolvedDaily={() => void auth.recordStreakActivity('daily')}
          onOpenAuth={() => setAuthModalOpen(true)}
          onBackToPlay={() => setActiveTab('play')}
        />
      );
    }

    // 1. Classement général
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

    // 2. Personal Statistics View
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
          onOpenDaily={() => setActiveTab('daily')}
          onLogout={auth.user ? () => void auth.logout() : undefined}
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
      const is2v2 = snap.mode === '2v2' && snap.seats !== null;
      const localSeat = getLocalSeat(snap, playerId);
      const localSymbol = getLocalSymbol(snap, playerId);
      const isSpectator = localSymbol === null;
      const opponent =
        localSymbol === 'X'
          ? snap.players.O
          : localSymbol === 'O'
            ? snap.players.X
            : null;

      const canInteract =
        snap.phase === 'playing' &&
        (is2v2
          ? localSeat !== null && snap.activeSeat === localSeat
          : localSymbol !== null && snap.gameState.currentPlayer === localSymbol);

      const selfVotedRematch = snap.rematchVotes.includes(playerId);
      const opponentVotedRematch = is2v2
        ? snap.rematchVotes.some((id) => id !== playerId)
        : opponent
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
      const startingPlayer: Player =
        snap.gameState.moveHistory[0]?.player ?? snap.gameState.currentPlayer;

      const renderMobileCard = (symbol: Player) => {
        const clockMs = onlineClockValues ? onlineClockValues[symbol] : null;
        const teamSeats = symbol === 'X' ? (['A', 'B'] as const) : (['C', 'D'] as const);
        const teamMembers =
          is2v2 && snap.seats
            ? teamSeats.map((seat) => ({
                seat,
                player: snap.seats![seat],
                isActiveSeat: snap.phase === 'playing' && snap.activeSeat === seat,
                isSelfSeat: localSeat === seat,
              }))
            : undefined;
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
            teamMembers={teamMembers}
            activeEmote={visibleEmote}
          />
        );
      };

      return (
        <div
          className="flex-1 flex flex-col items-center justify-between gap-1.5 sm:gap-2 py-2 sm:py-3 px-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          {/* Desktop top header */}
          <div className="hidden sm:block w-full">
            <PlayerBar
              players={snap.players}
              gameState={snap.gameState}
              phase={snap.phase}
              clocks={onlineClockValues}
              localPlayerSymbol={localSymbol}
              isOnline
              eloStakes={snap.eloStakes}
              endReason={snap.endReason}
              matchWinner={snap.matchWinner}
              preview={previewInfo.preview}
              hoveredMove={previewInfo.hoveredMove}
              pieceStyle={boardPrefs.pieceStyle}
              moveTimeouts={snap.moveTimeouts}
              mode={snap.mode}
              seats={snap.seats}
              activeSeat={snap.activeSeat}
              localSeat={localSeat}
              spectatorCount={snap.spectatorCount}
              activeEmote={visibleEmote}
            />
          </div>

          {/* Mobile top match meta strip */}
          <div className="sm:hidden w-full pt-0.5">
            <MatchMetaStrip
              timeControl={snap.timeControl}
              eloStakes={snap.eloStakes}
              perspectiveSymbol={localSymbol}
              mode={snap.mode}
              spectatorCount={snap.spectatorCount}
              isSpectator={isSpectator}
            />
          </div>

          {/* Center arena */}
          <div className="w-full flex flex-col items-center gap-2 my-auto">
            <div className="sm:hidden w-full flex flex-col gap-1.5">
              {renderMobileCard(topSymbol)}
              {is2v2 && snap.seats && (
                <TeamRelayStrip
                  seats={snap.seats}
                  activeSeat={snap.activeSeat}
                  localSeat={localSeat}
                  startingPlayer={startingPlayer}
                  phase={snap.phase}
                />
              )}
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
                mode={snap.mode}
                seats={snap.seats}
                activeSeat={snap.activeSeat}
                localSeat={localSeat}
                spectatorCount={snap.spectatorCount}
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
                  mode={snap.mode}
                  seats={snap.seats}
                  rematchVotes={snap.rematchVotes}
                  isSpectator={isSpectator}
                  selfVotedRematch={selfVotedRematch}
                  opponentVotedRematch={opponentVotedRematch}
                  skipRatingAnimation={outcomeAnimatedKey === matchKey}
                  hidden={endBannerHidden}
                  onHiddenChange={setEndBannerHidden}
                  onOpenSouvenirCard={() => setVictoryCardOpen(true)}
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
          <div
            className="w-full max-w-[580px] mx-auto flex items-center justify-between gap-2 rounded-[11px] px-3 py-1.5"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
            }}
          >
            <span
              className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold min-w-0 truncate"
              style={{ color: 'var(--text-secondary)' }}
            >
              {snap.tournament ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[10px] font-bold shrink-0"
                  style={{
                    backgroundColor: 'var(--accent-active-bg)',
                    color: 'var(--accent-active-text)',
                    border: '1px solid var(--accent-active)',
                  }}
                >
                  <Crown className="w-3 h-3" />
                  <span className="truncate max-w-[160px]">
                    {translateRoundKey(snap.tournament.roundKey)}
                  </span>
                </span>
              ) : null}
              <span className="truncate">
                {t('play.roomRound', {
                  code: snap.code,
                  round: snap.gameNumber,
                })}
                {is2v2 ? ' · 2v2' : ''}
              </span>
              {isSpectator && (
                <span
                  className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[10px] font-bold"
                  style={{
                    backgroundColor: 'var(--accent-active-bg)',
                    color: 'var(--accent-active-text)',
                  }}
                >
                  <Eye className="w-3 h-3" />
                  <span>{t('common.spectator')}</span>
                </span>
              )}
            </span>

            <div className="flex items-center gap-1.5 shrink-0">
              {!isSpectator && (
                <EmoteBar
                  onSendEmote={(emote) => void onlineGame.sendEmote(emote)}
                />
              )}

              {!isSpectator && snap.phase === 'playing' && (
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
                  className="tactile-btn relative overflow-hidden inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
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
                  <Flag className="w-3.5 h-3.5 relative z-10" />
                  <span className="relative z-10">
                    {confirmResign ? t('play.confirmResign') : t('play.resign')}
                  </span>
                  {confirmResign && (
                    <motion.span
                      key="resign-expire"
                      aria-hidden="true"
                      initial={{ scaleX: 1 }}
                      animate={{ scaleX: 0 }}
                      transition={{ duration: 3.5, ease: 'linear' }}
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-[2.5px] origin-left"
                      style={{ backgroundColor: 'var(--danger-color)' }}
                    />
                  )}
                </button>
              )}

              {/* En fin de partie, on n'affiche ces actions en bas que lorsque le bandeau de résultat est replié */}
              {snap.phase === 'finished' && !outcomePlaying && endBannerHidden && (
                <>
                  <button
                    type="button"
                    onClick={() => setEndBannerHidden(false)}
                    className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-strong)',
                    }}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Résultat</span>
                  </button>
                  {!isSpectator && (
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
                </>
              )}

              {(snap.phase === 'playing' || endBannerHidden || isSpectator) && (
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
                  <span className="hidden sm:inline">
                    {snap.tournament ? t('play.backToTournament') : t('play.leave')}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    // 3. Board-First Entry Workspace (also handles WaitingLobby & JoinPrompt alongside the board!)
    return (
      <PlayWorkspace
        user={auth.user}
        localPlayerId={playerId}
        pseudo={pseudo}
        onChangePseudo={handleChangePseudo}
        onSaveGameName={auth.changeGameName}
        timeControl={timeControl}
        onChangeTimeControl={setTimeControl}
        playerElo={onlineGame.playerElo}
        boardPrefs={boardPrefs}
        connected={onlineGame.connected}
        connectionStatus={onlineGame.connectionStatus}
        isBusy={onlineGame.isBusy}
        error={onlineGame.error}
        lobby={onlineGame.lobby}
        matchmaking={onlineGame.matchmaking}
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
        onSwitchSeat={(seat) => void onlineGame.switchSeat(seat)}
        onJoinMatchmaking={() =>
          void onlineGame.joinMatchmaking({
            pseudo: activePseudo,
            timeControl,
          })
        }
        onCancelMatchmaking={onlineGame.cancelMatchmaking}
        onCancelWaitingOrPrompt={handleLeaveOnline}
        onOpenStats={() => setActiveTab('stats')}
        onOpenDaily={() => setActiveTab('daily')}
        onOpenBot={() => setActiveTab('bot')}
        onOpenTournament={() => setActiveTab('tournament')}
        botSummary={botSummary}
        tutorialRequest={tutorialRequest}
      />
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col lg:flex-row">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenRules={() => setRulesOpen(true)}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={() => void auth.logout()}
        user={auth.user}
        pseudo={activePseudo}
        muted={muted}
        onToggleMute={handleToggleMute}
        hapticsEnabled={hapticsEnabled}
        onToggleHaptics={handleToggleHaptics}
        connected={onlineGame.connected}
        inActiveMatch={inActiveMatch}
        inActiveTournament={Boolean(
          tournament.snapshot && tournament.snapshot.phase !== 'finished',
        )}
      />

      {/* Sur téléphone, on laisse la place de la barre d'onglets (masquée en match) */}
      <div
        className={`flex-1 min-w-0 flex flex-col ${
          inMatchView ? '' : 'pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0'
        }`}
      >
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

      <StreakCelebrationToast
        notice={auth.streakNotice}
        onDismiss={auth.clearStreakNotice}
      />

      <AnimatePresence>
        {auth.notice && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="fixed bottom-[4.75rem] lg:bottom-4 left-1/2 -translate-x-1/2 z-[70] max-w-[92vw] rounded-full px-4 py-2 text-xs sm:text-sm font-semibold inline-flex items-center gap-2"
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

      {/* Pastille discrète si l'on change d'onglet pendant la recherche d'un adversaire */}
      <AnimatePresence>
        {onlineGame.matchmaking.searching && activeTab !== 'play' && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="fixed bottom-[4.5rem] lg:bottom-5 left-1/2 -translate-x-1/2 z-[65] rounded-full pl-3.5 pr-1.5 py-1.5 flex items-center gap-2.5 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--bg-board)',
              color: 'var(--text-primary)',
              border: '1.5px solid var(--accent-active)',
              boxShadow: 'var(--shadow-board)',
            }}
          >
            <span className="live-dot" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setActiveTab('play')}
              className="hover:underline"
            >
              Recherche d’un adversaire…
            </button>
            <button
              type="button"
              onClick={onlineGame.cancelMatchmaking}
              aria-label="Annuler la recherche"
              className="inline-flex items-center justify-center w-6 h-6 rounded-full"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
              }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <RulesModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        onStartTutorial={
          inMatchView
            ? undefined
            : () => {
                setRulesOpen(false);
                setActiveTab('play');
                setTutorialRequest((n) => n + 1);
              }
        }
      />

      <VictoryCardModal
        open={victoryCardOpen}
        data={victoryCardData}
        onClose={() => setVictoryCardOpen(false)}
      />

      {!inMatchView && (
        <MobileTabBar activeTab={activeTab} onSelectTab={setActiveTab} />
      )}

      <AnimatePresence>
        {intro && liveSnapshot && liveSnapshot.phase === 'playing' && (
          <MatchIntro
            key={intro.key}
            players={liveSnapshot.players}
            localSymbol={snapLocal}
            mode={liveSnapshot.mode}
            seats={liveSnapshot.seats}
            localSeat={snapLocalSeat}
            startingPlayer={
              liveSnapshot.gameState.moveHistory[0]?.player ??
              liveSnapshot.gameState.currentPlayer
            }
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
                // Une défaite se vit en rouge, quelle que soit la couleur de l'adversaire
                outcome.kind === 'loss'
                  ? 'var(--danger-color)'
                  : winner === 'X'
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

      {splashVisible && !reduceMotion && <LaunchSplash onDone={handleSplashDone} />}

      {DemoPanel && (
        <Suspense fallback={null}>
          <DemoPanel
            onSpectateMatch={(code) => void handleJoinByCode(code)}
            demoLoggedIn={Boolean(auth.user)}
            onToggleDemoAccount={() => void auth.toggleDemoAccount()}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
