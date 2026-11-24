import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BOT_MAX_LEVEL,
  BOT_MIN_LEVEL,
  calibrateBotLevelFromElo,
  chooseBotMove,
  clampBotLevel,
  evolveBotProgress,
  getBotLevelProfile,
  type BotMatchOutcomeUpdate,
  type BotProgressState,
} from '@shared/botEngine';
import { getEloTier, INITIAL_ELO, type EloProfile } from '@shared/elo';
import {
  BOARD_COORDS,
  applyMove,
  createInitialState,
  getOpponent,
  type DestinationPreview,
  type GameState,
  type Move,
  type Player,
} from '@shared/gameEngine';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Crown,
  Download,
  Flag,
  Flame,
  RotateCcw,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import type { BoardPreferences } from '../types/boardPrefs';
import { getBoardTension } from '../utils/boardTension';
import { loadBotProgress, saveBotProgress } from '../utils/botStorage';
import { haptics } from '../utils/haptics';
import { useI18n } from '../i18n';
import { CHIP_SPRING, SMOOTH_EASE } from '../utils/motion';
import { soundEngine } from '../utils/soundEngine';
import type { VictoryCardData } from '../utils/victoryCard';
import { GlobalBoard } from './GlobalBoard';
import { MoveHistoryRibbon } from './MoveHistoryRibbon';
import { SymbolMark } from './Symbols';
import { VictoryCardModal } from './VictoryCardModal';

interface BotMatchViewProps {
  scopeId: string;
  pseudo: string;
  playerElo: EloProfile | null;
  boardPrefs: BoardPreferences;
  onBackToPlay: () => void;
  onProgressChange?: (progress: BotProgressState) => void;
}

type SidePreference = 'auto' | 'X' | 'O';

interface MatchFinishState {
  outcome: 'win' | 'loss' | 'draw';
  reason: 'win' | 'draw' | 'resign';
  playedLevel: number;
  evolution: BotMatchOutcomeUpdate;
}

export function BotMatchView({
  scopeId,
  pseudo,
  playerElo,
  boardPrefs,
  onBackToPlay,
  onProgressChange,
}: BotMatchViewProps) {
  const { t, translateTier } = useI18n();
  const effectivePlayerElo = playerElo?.rating ?? INITIAL_ELO;
  const calibratedLevel = useMemo(
    () => calibrateBotLevelFromElo(effectivePlayerElo),
    [effectivePlayerElo],
  );
  const playerTier = useMemo(
    () => getEloTier(effectivePlayerElo),
    [effectivePlayerElo],
  );

  const [progress, setProgress] = useState<BotProgressState>(() =>
    loadBotProgress(scopeId, effectivePlayerElo),
  );
  const [sidePref, setSidePref] = useState<SidePreference>('auto');
  const [matchIndex, setMatchIndex] = useState(1);
  const [humanSymbol, setHumanSymbol] = useState<Player>('X');
  const [activeMatchLevel, setActiveMatchLevel] = useState<number>(
    () => loadBotProgress(scopeId, effectivePlayerElo).level,
  );
  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialState('X'),
  );
  const [botThinking, setBotThinking] = useState(false);
  const [lastBotDepth, setLastBotDepth] = useState<number | null>(null);
  const [finishState, setFinishState] = useState<MatchFinishState | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [victoryCardOpen, setVictoryCardOpen] = useState(false);
  const [previewInfo, setPreviewInfo] = useState<{
    preview: DestinationPreview | null;
    hoveredMove: Move | null;
  }>({ preview: null, hoveredMove: null });

  const botTimerRef = useRef<number | null>(null);

  // Recharge la progression si le compte/profil change
  useEffect(() => {
    const loaded = loadBotProgress(scopeId, effectivePlayerElo);
    setProgress(loaded);
    onProgressChange?.(loaded);
    if (gameState.moveHistory.length === 0 && !finishState) {
      setActiveMatchLevel(loaded.level);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId, effectivePlayerElo]);

  useEffect(() => {
    if (!confirmResign) return;
    const t = window.setTimeout(() => setConfirmResign(false), 3500);
    return () => window.clearTimeout(t);
  }, [confirmResign]);

  const botSymbol: Player = getOpponent(humanSymbol);
  const matchProfile = useMemo(
    () => getBotLevelProfile(activeMatchLevel),
    [activeMatchLevel],
  );
  const nextProfile = useMemo(
    () =>
      progress.level < BOT_MAX_LEVEL
        ? getBotLevelProfile(progress.level + 1)
        : null,
    [progress.level],
  );

  const isPlaying = gameState.status === 'playing' && finishState === null;
  const isHumanTurn = isPlaying && gameState.currentPlayer === humanSymbol;

  const commitProgress = useCallback(
    (next: BotProgressState) => {
      setProgress(next);
      saveBotProgress(scopeId, next);
      onProgressChange?.(next);
    },
    [scopeId, onProgressChange],
  );

  const finalizeMatch = useCallback(
    (
      outcome: 'win' | 'loss' | 'draw',
      reason: 'win' | 'draw' | 'resign',
      levelPlayed: number,
    ) => {
      setBotThinking(false);
      setConfirmResign(false);
      setProgress((prev) => {
        const evolution = evolveBotProgress(prev, outcome);
        saveBotProgress(scopeId, evolution.next);
        onProgressChange?.(evolution.next);
        setFinishState({
          outcome,
          reason,
          playedLevel: levelPlayed,
          evolution,
        });

        if (outcome === 'win') {
          if (evolution.evolved || evolution.masteredMaxLevel) {
            soundEngine.playPromotion();
          } else {
            soundEngine.playVictory();
          }
          haptics.victory();
        } else if (outcome === 'draw') {
          soundEngine.playDraw();
          haptics.tap();
        } else {
          soundEngine.playDefeat();
          haptics.capture();
        }

        return evolution.next;
      });
    },
    [scopeId, onProgressChange],
  );

  const startNewMatch = useCallback(
    (levelToPlay: number, nextSide?: Player) => {
      if (botTimerRef.current !== null) {
        window.clearTimeout(botTimerRef.current);
        botTimerRef.current = null;
      }
      const clamped = clampBotLevel(levelToPlay);
      const chosenSide: Player =
        nextSide ??
        (sidePref === 'X'
          ? 'X'
          : sidePref === 'O'
            ? 'O'
            : matchIndex % 2 === 0
              ? 'X'
              : 'O');

      setActiveMatchLevel(clamped);
      setHumanSymbol(chosenSide);
      setMatchIndex((n) => n + 1);
      setGameState(createInitialState('X'));
      setFinishState(null);
      setBotThinking(false);
      setLastBotDepth(null);
      setConfirmResign(false);
      setVictoryCardOpen(false);
      setPreviewInfo({ preview: null, hoveredMove: null });
    },
    [sidePref, matchIndex],
  );

  // Déclenche le coup algorithmique du bot quand c'est son tour
  useEffect(() => {
    if (!isPlaying || gameState.currentPlayer !== botSymbol) {
      setBotThinking(false);
      return;
    }

    setBotThinking(true);
    // Délai naturel (légèrement plus posé en milieu/fin de partie) pour un rythme lisible
    const delayMs =
      gameState.moveHistory.length === 0
        ? 360
        : 380 + Math.min(260, activeMatchLevel * 22);

    const timer = window.setTimeout(() => {
      botTimerRef.current = null;
      const choice = chooseBotMove(gameState, activeMatchLevel);
      if (!choice) {
        setBotThinking(false);
        return;
      }

      const applied = applyMove(gameState, choice.move, botSymbol);
      if (!applied.ok) {
        setBotThinking(false);
        return;
      }

      setLastBotDepth(choice.depthReached);
      const tension = getBoardTension(applied.state);
      soundEngine.playMove(botSymbol, tension);
      if (applied.capturedBoard) {
        soundEngine.playCapture(botSymbol, tension === 'match-point');
        haptics.capture();
      } else if (applied.triggeredFreeMove) {
        soundEngine.playFreeMove();
      }

      setGameState(applied.state);
      setBotThinking(false);

      if (applied.state.status === 'won') {
        const outcome =
          applied.state.winner === humanSymbol ? 'win' : 'loss';
        finalizeMatch(outcome, 'win', activeMatchLevel);
      } else if (applied.state.status === 'draw') {
        finalizeMatch('draw', 'draw', activeMatchLevel);
      }
    }, delayMs);

    botTimerRef.current = timer;
    return () => {
      if (botTimerRef.current !== null) {
        window.clearTimeout(botTimerRef.current);
        botTimerRef.current = null;
      }
    };
  }, [
    isPlaying,
    gameState,
    botSymbol,
    humanSymbol,
    activeMatchLevel,
    finalizeMatch,
  ]);

  const handleHumanMove = useCallback(
    (move: Move) => {
      if (!isHumanTurn) return;
      const applied = applyMove(gameState, move, humanSymbol);
      if (!applied.ok) return;

      const tension = getBoardTension(applied.state);
      soundEngine.playMove(humanSymbol, tension);
      haptics.tap();
      if (applied.capturedBoard) {
        soundEngine.playCapture(humanSymbol, tension === 'match-point');
        haptics.capture();
      } else if (applied.triggeredFreeMove) {
        soundEngine.playFreeMove();
      }

      setPreviewInfo({ preview: null, hoveredMove: null });
      setGameState(applied.state);

      if (applied.state.status === 'won') {
        const outcome =
          applied.state.winner === humanSymbol ? 'win' : 'loss';
        finalizeMatch(outcome, 'win', activeMatchLevel);
      } else if (applied.state.status === 'draw') {
        finalizeMatch('draw', 'draw', activeMatchLevel);
      }
    },
    [isHumanTurn, gameState, humanSymbol, activeMatchLevel, finalizeMatch],
  );

  const handlePreviewChange = useCallback(
    (preview: DestinationPreview | null, hoveredMove: Move | null) => {
      setPreviewInfo((curr) =>
        curr.preview === preview && curr.hoveredMove === hoveredMove
          ? curr
          : { preview, hoveredMove },
      );
    },
    [],
  );

  const handleResign = () => {
    if (!isPlaying) return;
    if (!confirmResign) {
      setConfirmResign(true);
      haptics.tap();
      return;
    }
    if (botTimerRef.current !== null) {
      window.clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }
    finalizeMatch('loss', 'resign', activeMatchLevel);
  };

  const handleRecalibrateToElo = () => {
    haptics.tap();
    const next: BotProgressState = {
      ...progress,
      level: calibratedLevel,
      consecutiveLosses: 0,
      calibratedElo: Math.round(effectivePlayerElo),
    };
    commitProgress(next);
    startNewMatch(calibratedLevel, humanSymbol);
  };

  const handleStepDownLevel = () => {
    const lower = clampBotLevel(progress.level - 1);
    haptics.tap();
    const next: BotProgressState = {
      ...progress,
      level: lower,
      consecutiveLosses: 0,
    };
    commitProgress(next);
    startNewMatch(lower, humanSymbol);
  };

  const handleChangeSidePref = (pref: SidePreference) => {
    setSidePref(pref);
    haptics.tap();
    const nextSide: Player =
      pref === 'X' ? 'X' : pref === 'O' ? 'O' : humanSymbol;
    if (gameState.moveHistory.length === 0 && !finishState && nextSide !== humanSymbol) {
      startNewMatch(activeMatchLevel, nextSide);
    }
  };

  const xCaptured = gameState.boards.filter((b) => b.status === 'X').length;
  const oCaptured = gameState.boards.filter((b) => b.status === 'O').length;
  const humanCaptured = humanSymbol === 'X' ? xCaptured : oCaptured;
  const botCaptured = botSymbol === 'X' ? xCaptured : oCaptured;

  // Données de la carte souvenir PNG pour le partage après la manche
  const victoryCardData = useMemo<VictoryCardData | null>(() => {
    if (!finishState) return null;
    const botLabel = `Bot Niv.${finishState.playedLevel} · ${matchProfile.label}`;
    const matchWinner: Player | null =
      finishState.outcome === 'win'
        ? humanSymbol
        : finishState.outcome === 'loss'
          ? botSymbol
          : null;

    return {
      gameState,
      mode: '1v1',
      teamXNames: [humanSymbol === 'X' ? pseudo : botLabel],
      teamONames: [humanSymbol === 'O' ? pseudo : botLabel],
      matchWinner,
      endReason:
        finishState.reason === 'win'
          ? 'alignment'
          : finishState.reason === 'resign'
            ? 'resign'
            : 'draw',
      localSymbol: humanSymbol,
      timeControl: 'unlimited',
      eloDelta: null,
      eloAfter: null,
      pieceStyle: boardPrefs.pieceStyle,
    };
  }, [
    finishState,
    matchProfile.label,
    humanSymbol,
    botSymbol,
    gameState,
    pseudo,
    boardPrefs.pieceStyle,
  ]);

  const statusText = useMemo(() => {
    if (finishState) {
      if (finishState.outcome === 'win') {
        return finishState.evolution.evolved
          ? `Victoire · Le bot passe au Niv. ${finishState.evolution.next.level}`
          : 'Victoire · Palier maximal maîtrisé';
      }
      if (finishState.outcome === 'draw') {
        return 'Match nul · Le bot reste au même palier';
      }
      return finishState.reason === 'resign'
        ? 'Partie abandonnée'
        : `Le bot (Niv. ${finishState.playedLevel}) l’emporte`;
    }
    if (botThinking) {
      return `Bot Niv. ${activeMatchLevel} réfléchit…`;
    }
    if (previewInfo.preview) {
      return previewInfo.preview.willBeFreeMove
        ? 'Coup libre offert au bot'
        : previewInfo.preview.isSelfRedirect
          ? 'Renvoie le bot dans la même zone'
          : `Envoie le bot en ${BOARD_COORDS[previewInfo.preview.targetBoard]}`;
    }
    if (gameState.activeBoard === null) {
      return 'À toi · Coup libre sur le plateau';
    }
    return `À toi · Zone imposée ${BOARD_COORDS[gameState.activeBoard]}`;
  }, [
    finishState,
    botThinking,
    activeMatchLevel,
    previewInfo.preview,
    gameState.activeBoard,
  ]);

  return (
    <div className="flex-1 w-full max-w-[1120px] mx-auto px-3 sm:px-5 py-3 sm:py-5 flex flex-col gap-3 sm:gap-4">
      {/* En-tête compacte */}
      <header className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
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
            <span className="hidden sm:inline">{t('common.play')}</span>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <Bot
              className="w-5 h-5 shrink-0"
              style={{ color: 'var(--accent-active-text)' }}
              strokeWidth={2}
            />
            <h1
              className="text-lg sm:text-xl font-bold tracking-tight truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('bot.title')}
            </h1>
          </div>

          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold"
            style={{
              backgroundColor: 'var(--accent-active-bg)',
              color: 'var(--accent-active-text)',
              border: '1px solid var(--accent-active)',
            }}
          >
            <span>
              {t('bot.levelBadge', {
                level: activeMatchLevel,
                elo: matchProfile.elo,
              })}
            </span>
            <span>·</span>
            <span className="font-sans">{translateTier(matchProfile.label)}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {progress.level !== calibratedLevel && (
            <button
              type="button"
              onClick={handleRecalibrateToElo}
              className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-main)',
                color: 'var(--text-secondary)',
              }}
              title={`Recalibrer sur ton Elo actuel (${Math.round(effectivePlayerElo)} → Niv. ${calibratedLevel})`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                Calibrer (Niv. {calibratedLevel})
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              haptics.tap();
              startNewMatch(progress.level);
            }}
            className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Nouvelle manche</span>
          </button>
        </div>
      </header>

      {/* Grille principale : Plateau prioritaire + Panneau de progression du bot */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_336px] gap-4 items-start">
        {/* Colonne gauche : Plateau + bande tactique + historique */}
        <div className="flex flex-col items-center gap-2.5 min-w-0">
          {/* Barre de statut en direct */}
          <div
            className="w-full max-w-[560px] rounded-[12px] px-3 py-2 flex items-center justify-between gap-2"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: `1px solid ${
                botThinking ? 'var(--accent-active)' : 'var(--border-main)'
              }`,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-4 h-4 shrink-0">
                <SymbolMark
                  player={
                    finishState
                      ? finishState.outcome === 'win'
                        ? humanSymbol
                        : botSymbol
                      : gameState.currentPlayer
                  }
                  size="badge"
                  pieceStyle={boardPrefs.pieceStyle}
                />
              </span>
              <span
                className="text-xs sm:text-sm font-semibold truncate"
                style={{
                  color: botThinking
                    ? 'var(--accent-active-text)'
                    : 'var(--text-primary)',
                }}
              >
                {statusText}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0 font-mono text-xs font-bold tabular-nums">
              <span style={{ color: 'var(--x-color)' }}>
                {humanSymbol === 'X' ? 'Toi' : 'Bot'} {xCaptured}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>–</span>
              <span style={{ color: 'var(--o-color)' }}>
                {oCaptured} {humanSymbol === 'O' ? 'Toi' : 'Bot'}
              </span>
            </div>
          </div>

          {/* Plateau 9×9 complet */}
          <div
            className="relative flex items-center justify-center"
            style={{
              filter:
                finishState?.outcome === 'loss' ? 'grayscale(0.75)' : 'none',
              transition: 'filter 650ms ease',
            }}
          >
            <GlobalBoard
              gameState={gameState}
              canInteract={isHumanTurn}
              boardPrefs={boardPrefs}
              variant="arena"
              onPlayMove={handleHumanMove}
              onPreviewChange={handlePreviewChange}
            />
          </div>

          {/* Ruban d'historique des coups */}
          <MoveHistoryRibbon gameState={gameState} />

          {/* Barre d'action discrète sous le plateau */}
          {isPlaying && gameState.moveHistory.length > 0 && (
            <div className="w-full max-w-[560px] flex items-center justify-between gap-2 px-1">
              <span
                className="font-mono text-[11px]"
                style={{ color: 'var(--text-muted)' }}
              >
                {lastBotDepth
                  ? `Moteur alpha-bêta · profondeur ${lastBotDepth}`
                  : `Calibré sur ton niveau (${Math.round(effectivePlayerElo)} Elo)`}
              </span>

              <button
                type="button"
                onClick={handleResign}
                className="tactile-btn relative overflow-hidden inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                style={{
                  backgroundColor: confirmResign
                    ? 'var(--danger-bg)'
                    : 'var(--bg-surface)',
                  color: confirmResign
                    ? 'var(--danger-color)'
                    : 'var(--text-secondary)',
                  border: `1px solid ${
                    confirmResign ? 'var(--danger-color)' : 'var(--border-cell)'
                  }`,
                }}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>{confirmResign ? 'Confirmer abandon' : 'Abandonner'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Colonne droite : Résultat / Évolution du bot + Carte du palier + Options */}
        <aside className="flex flex-col gap-3 min-w-0">
          {/* Carte d'évolution & fin de manche */}
          <AnimatePresence mode="wait">
            {finishState && (
              <motion.section
                key={`bot-finish-${matchIndex}`}
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.28, ease: SMOOTH_EASE }}
                className="rounded-[16px] p-4 flex flex-col gap-3"
                style={{
                  backgroundColor: 'var(--bg-board)',
                  border: `1.5px solid ${
                    finishState.outcome === 'win'
                      ? 'var(--accent-active)'
                      : finishState.outcome === 'loss'
                        ? 'var(--danger-color)'
                        : 'var(--border-strong)'
                  }`,
                  boxShadow: 'var(--shadow-board)',
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p
                      className="text-[11px] font-bold uppercase tracking-[0.12em]"
                      style={{
                        color:
                          finishState.outcome === 'win'
                            ? 'var(--accent-active-text)'
                            : finishState.outcome === 'loss'
                              ? 'var(--danger-color)'
                              : 'var(--text-muted)',
                      }}
                    >
                      {finishState.outcome === 'win'
                        ? 'Manche remportée'
                        : finishState.outcome === 'draw'
                          ? 'Égalité'
                          : 'Manche perdue'}
                    </p>
                    <h2
                      className="text-xl font-extrabold tracking-tight mt-0.5"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {finishState.outcome === 'win'
                        ? 'Victoire !'
                        : finishState.outcome === 'draw'
                          ? 'Match nul'
                          : 'Le bot résiste'}
                    </h2>
                  </div>

                  <span
                    className="font-mono text-xs font-bold rounded-md px-2 py-1"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-cell)',
                    }}
                  >
                    {humanCaptured}–{botCaptured} zones
                  </span>
                </div>

                {/* Bandeau d'évolution du bot après victoire */}
                {finishState.outcome === 'win' && (
                  <div
                    className="rounded-[12px] p-3 flex items-center gap-2.5"
                    style={{
                      backgroundColor: 'var(--accent-active-bg)',
                      border: '1px solid var(--accent-active)',
                    }}
                  >
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-board)',
                        color: 'var(--accent-active-text)',
                      }}
                    >
                      {finishState.evolution.masteredMaxLevel ? (
                        <Crown className="w-4 h-4" strokeWidth={2.2} />
                      ) : (
                        <TrendingUp className="w-4 h-4" strokeWidth={2.2} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p
                        className="text-xs font-bold leading-snug"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {finishState.evolution.evolved
                          ? `Le bot évolue : Niv. ${finishState.evolution.previousLevel} → Niv. ${finishState.evolution.next.level}`
                          : 'Bot Souverain (Niv. 10) vaincu !'}
                      </p>
                      <p
                        className="text-[11px] leading-snug mt-0.5"
                        style={{ color: 'var(--accent-active-text)' }}
                      >
                        {finishState.evolution.evolved
                          ? `Nouveau palier : ${getBotLevelProfile(finishState.evolution.next.level).label} (${getBotLevelProfile(finishState.evolution.next.level).elo} Elo)`
                          : 'Tu as battu le plus haut niveau algorithmique.'}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      haptics.tap();
                      startNewMatch(progress.level);
                    }}
                    className="tactile-btn cta-primary w-full rounded-[12px] px-3.5 py-2.5 text-sm font-bold inline-flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: 'var(--btn-primary-bg)',
                      color: 'var(--btn-primary-text)',
                    }}
                  >
                    <span>
                      {finishState.evolution.evolved
                        ? `Affronter le Niv. ${progress.level} (${getBotLevelProfile(progress.level).label})`
                        : `Revanche · Niv. ${progress.level}`}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        haptics.tap();
                        setVictoryCardOpen(true);
                      }}
                      className="tactile-btn rounded-[10px] px-2.5 py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-main)',
                      }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Carte PNG</span>
                    </button>

                    {finishState.outcome === 'loss' &&
                    progress.consecutiveLosses >= 2 &&
                    progress.level > BOT_MIN_LEVEL ? (
                      <button
                        type="button"
                        onClick={handleStepDownLevel}
                        className="tactile-btn rounded-[10px] px-2.5 py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border-main)',
                        }}
                      >
                        <span>Baisser Niv. {progress.level - 1}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          haptics.tap();
                          startNewMatch(finishState.playedLevel, humanSymbol);
                        }}
                        className="tactile-btn rounded-[10px] px-2.5 py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border-main)',
                        }}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Rejouer Niv. {finishState.playedLevel}</span>
                      </button>
                    )}
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Carte profil & échelle évolutive du bot */}
          <section
            className="rounded-[16px] p-4 flex flex-col gap-3.5"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-10 h-10 rounded-[11px] flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: 'var(--accent-active-bg)',
                    color: 'var(--accent-active-text)',
                    border: '1px solid var(--accent-active)',
                  }}
                >
                  <Bot className="w-5 h-5" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-sm font-bold truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {matchProfile.label}
                    </span>
                    <span
                      className="font-mono text-[11px] font-bold"
                      style={{ color: 'var(--accent-active-text)' }}
                    >
                      {matchProfile.elo}
                    </span>
                  </div>
                  <p
                    className="text-xs leading-snug"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {matchProfile.style}
                  </p>
                </div>
              </div>

              <span className="w-6 h-6 shrink-0" title={`Le bot joue ${botSymbol}`}>
                <SymbolMark
                  player={botSymbol}
                  size="badge"
                  pieceStyle={boardPrefs.pieceStyle}
                />
              </span>
            </div>

            {/* Échelle des 10 paliers évolutifs */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span
                  className="font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Progression du bot
                </span>
                <span
                  className="font-mono font-bold tabular-nums"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Niv. {progress.level} / {BOT_MAX_LEVEL}
                </span>
              </div>

              <div
                className="grid grid-cols-10 gap-1"
                role="progressbar"
                aria-valuenow={progress.level}
                aria-valuemin={BOT_MIN_LEVEL}
                aria-valuemax={BOT_MAX_LEVEL}
                aria-label="Niveau actuel du bot"
              >
                {Array.from({ length: BOT_MAX_LEVEL }, (_, i) => {
                  const lvl = i + 1;
                  const defeated =
                    progress.highestDefeatedLevel !== null &&
                    lvl <= progress.highestDefeatedLevel;
                  const isCurrent = lvl === progress.level;
                  return (
                    <span
                      key={lvl}
                      title={`Niv. ${lvl} · ${getBotLevelProfile(lvl).label} (${getBotLevelProfile(lvl).elo})`}
                      className="h-2.5 rounded-full transition-colors duration-300"
                      style={{
                        backgroundColor: isCurrent
                          ? 'var(--accent-active)'
                          : defeated
                            ? 'var(--x-color)'
                            : 'var(--bg-recessed)',
                        border: isCurrent
                          ? '1px solid var(--accent-active)'
                          : '1px solid var(--border-cell)',
                      }}
                    />
                  );
                })}
              </div>

              <p
                className="text-[11px] leading-snug mt-0.5"
                style={{ color: 'var(--text-muted)' }}
              >
                {nextProfile
                  ? `Gagne cette manche pour faire évoluer le bot vers le Niv. ${nextProfile.level} · ${nextProfile.label} (${nextProfile.elo}).`
                  : 'Palier Souverain (2100) atteint — le bot joue à sa force maximale.'}
              </p>
            </div>

            {/* Bilan du joueur face au bot */}
            <div
              className="rounded-[12px] p-3 flex items-center justify-between gap-2"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-cell)',
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-5 h-5 shrink-0">
                  <SymbolMark
                    player={humanSymbol}
                    size="badge"
                    pieceStyle={boardPrefs.pieceStyle}
                  />
                </span>
                <div className="min-w-0">
                  <p
                    className="text-xs font-bold truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {pseudo}
                  </p>
                  <p
                    className="font-mono text-[11px]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {Math.round(effectivePlayerElo)} · {playerTier.label}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {progress.winStreak >= 2 && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-bold"
                    style={{
                      backgroundColor: 'var(--accent-active-bg)',
                      color: 'var(--accent-active-text)',
                    }}
                  >
                    <Flame className="w-3 h-3" />
                    {progress.winStreak}
                  </span>
                )}
                <span
                  className="font-mono text-xs font-bold tabular-nums"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {progress.wins}V · {progress.draws}N · {progress.losses}D
                </span>
              </div>
            </div>

            {/* Choix du camp (Alterner / X / O) */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span
                className="text-xs font-semibold"
                style={{ color: 'var(--text-secondary)' }}
              >
                Ton camp
              </span>
              <div
                className="inline-flex items-center gap-0.5 p-0.5 rounded-[9px]"
                style={{
                  backgroundColor: 'var(--bg-recessed)',
                  border: '1px solid var(--border-cell)',
                }}
                role="radiogroup"
                aria-label="Camp du joueur"
              >
                {(
                  [
                    { id: 'auto', label: 'Alterner' },
                    { id: 'X', label: 'X (1er)' },
                    { id: 'O', label: 'O (2e)' },
                  ] as const
                ).map((opt) => {
                  const selected = sidePref === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => handleChangeSidePref(opt.id)}
                      className="relative rounded-[7px] px-2.5 py-1 text-[11px] font-bold transition-colors"
                      style={{
                        color: selected
                          ? 'var(--text-primary)'
                          : 'var(--text-muted)',
                      }}
                    >
                      {selected && (
                        <motion.span
                          layoutId="bot-side-pill"
                          transition={CHIP_SPRING}
                          aria-hidden="true"
                          className="absolute inset-0 rounded-[7px]"
                          style={{
                            backgroundColor: 'var(--bg-board)',
                            boxShadow: 'var(--shadow-card)',
                          }}
                        />
                      )}
                      <span className="relative">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </aside>
      </div>

      <VictoryCardModal
        open={victoryCardOpen}
        data={victoryCardData}
        onClose={() => setVictoryCardOpen(false)}
      />
    </div>
  );
}
