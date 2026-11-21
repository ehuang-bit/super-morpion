import { useCallback, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
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
  BarChart3,
  Clock,
  Link2,
  LogIn,
  MonitorSmartphone,
  RotateCcw,
  SlidersHorizontal,
  Swords,
  UserCheck,
} from 'lucide-react';
import type { ConnectionStatus } from '../hooks/useOnlineGame';
import type { BoardPreferences } from '../types/boardPrefs';
import { THEMES, type ThemeId } from '../types/theme';
import { normalizeRoomCode } from '../utils/format';
import { haptics } from '../utils/haptics';
import { soundEngine } from '../utils/soundEngine';
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
  theme: ThemeId;
  onChangeTheme: (theme: ThemeId) => void;
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
  onOpenCustomize: () => void;
  onOpenStats: () => void;
  onOpenAuth: () => void;
}

const CADENCES: readonly TimeControl[] = ['unlimited', 'rapid', 'blitz'];

export function PlayWorkspace({
  user,
  pseudo,
  onChangePseudo,
  timeControl,
  onChangeTimeControl,
  playerElo,
  theme,
  onChangeTheme,
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
  onOpenCustomize,
  onOpenStats,
  onOpenAuth,
}: PlayWorkspaceProps) {
  const [joinCode, setJoinCode] = useState('');
  const [sandboxState, setSandboxState] = useState<GameState>(() =>
    createInitialState('X'),
  );
  const [sandboxPreview, setSandboxPreview] = useState<{
    preview: DestinationPreview | null;
    hoveredMove: Move | null;
  }>({ preview: null, hoveredMove: null });

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

  const handleJoinSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeRoomCode(joinCode);
    if (cleaned.length === 6) {
      onJoinCode(cleaned);
    }
  };

  const normalizedJoin = normalizeRoomCode(joinCode);
  const displayName = user?.username || pseudo.trim() || 'Invité';
  const hasSandboxMoves = sandboxState.moveHistory.length > 0;
  const ratingLabel = formatRating(playerElo.profile.rating, playerElo.profile.rd);
  const waitingInQueue = lobby ? lobby.queue[timeControl] : 0;

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

  return (
    <div className="flex-1 w-full max-w-[1160px] mx-auto px-2.5 sm:px-5 py-2.5 sm:py-4 flex flex-col justify-center">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_368px] gap-4 lg:gap-5 xl:gap-6 items-center">
        {/* CENTER-LEFT HERO: Full-size Ready-to-Play GlobalBoard */}
        <section
          aria-label="Plateau de jeu prêt à jouer"
          className="flex flex-col items-center justify-center gap-2"
        >
          {/* Top Opponent / Readiness Strip */}
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
                  player="O"
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

            {hasSandboxMoves ? (
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

          {/* The Live Full-Size Super Morpion Board */}
          <GlobalBoard
            gameState={
              waitingSnapshot ? waitingSnapshot.gameState : sandboxState
            }
            canInteract={!waitingSnapshot}
            boardPrefs={boardPrefs}
            variant="lobby"
            onPlayMove={handleSandboxMove}
            onPreviewChange={handlePreviewChange}
          />

          {/* Bottom Self Player Strip */}
          <div
            className="w-full max-w-[540px] rounded-[12px] px-3 py-2 flex items-center justify-between gap-2"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-4 h-4 shrink-0">
                <SymbolMark
                  player="X"
                  size="badge"
                  pieceStyle={boardPrefs.pieceStyle}
                />
              </div>
              <span
                className="text-xs sm:text-sm font-bold truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {displayName}
              </span>
              <span
                className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums"
                style={{
                  backgroundColor: 'var(--bg-recessed)',
                  color: 'var(--text-primary)',
                }}
              >
                {ratingLabel}
              </span>
              <span
                className="hidden sm:inline text-xs font-medium truncate"
                style={{ color: 'var(--text-secondary)' }}
              >
                · {playerElo.tier}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onOpenStats}
                className="tactile-btn inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-cell)',
                }}
              >
                <BarChart3 className="w-3 h-3" />
                <span>Stats</span>
              </button>
              <button
                type="button"
                onClick={onOpenCustomize}
                className="tactile-btn inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-cell)',
                }}
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>Plateau</span>
              </button>
            </div>
          </div>
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
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold"
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
                      className="text-[11px] font-medium"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {lobby.liveGames} partie{lobby.liveGames > 1 ? 's' : ''} en cours
                    </span>
                  )}
                </div>
                {/* Account / Elo / Stats Quick Header */}
                <div
                  className="rounded-[11px] p-2.5 flex items-center justify-between gap-2"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-cell)',
                  }}
                >
                  <button
                    type="button"
                    onClick={onOpenStats}
                    className="flex items-center gap-2 min-w-0 text-left group"
                  >
                    <Award
                      className="w-4 h-4 shrink-0"
                      style={{ color: 'var(--accent-active-text)' }}
                      strokeWidth={1.9}
                    />
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className="font-mono text-sm font-bold tabular-nums"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {ratingLabel} Elo
                        </span>
                        <span
                          className="text-xs font-semibold truncate"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          · {playerElo.tier}
                        </span>
                      </div>
                      <span
                        className="block font-mono text-[10px] tabular-nums"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {playerElo.profile.wins}V · {playerElo.profile.draws}N ·{' '}
                        {playerElo.profile.losses}D · Voir mes stats →
                      </span>
                    </div>
                  </button>

                  {user ? (
                    <span
                      className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold"
                      style={{
                        backgroundColor: 'var(--x-surface)',
                        color: 'var(--x-color)',
                      }}
                    >
                      <UserCheck className="w-3 h-3" />
                      <span>Connecté</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={onOpenAuth}
                      className="tactile-btn shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold"
                      style={{
                        backgroundColor: 'var(--bg-board)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-strong)',
                      }}
                    >
                      <LogIn className="w-3 h-3" />
                      <span>Connexion</span>
                    </button>
                  )}
                </div>

                {/* Pseudo Input (editable for guests, locked badge for logged-in accounts) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="play-pseudo-input"
                      className="text-xs font-semibold"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {user ? 'Compte joueur' : 'Pseudo (mode invité)'}
                    </label>
                    {!user && (
                      <button
                        type="button"
                        onClick={onOpenAuth}
                        className="text-[11px] font-semibold hover:underline"
                        style={{ color: 'var(--accent-active-text)' }}
                      >
                        Sauvegarder mon Elo →
                      </button>
                    )}
                  </div>
                  <input
                    id="play-pseudo-input"
                    type="text"
                    maxLength={20}
                    readOnly={Boolean(user)}
                    value={user ? user.username : pseudo}
                    onChange={(e) => {
                      if (!user) onChangePseudo(e.target.value);
                    }}
                    placeholder="Ex. Camille"
                    className="tactile-input w-full rounded-[10px] px-3 py-2 text-sm font-medium"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-main)',
                    }}
                  />
                </div>

                {/* Time Control Selector */}
                <div>
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-semibold mb-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>Cadence de la pendule</span>
                  </span>
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
                          className="tactile-btn rounded-[7px] px-1.5 py-2 text-xs font-semibold leading-tight text-center"
                          style={{
                            backgroundColor: selected
                              ? 'var(--bg-board)'
                              : 'transparent',
                            color: selected
                              ? 'var(--text-primary)'
                              : 'var(--text-secondary)',
                            boxShadow: selected ? 'var(--shadow-card)' : 'none',
                          }}
                        >
                          {TIME_CONTROL_LABELS[cadence]}
                        </button>
                      );
                    })}
                  </div>
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

                {/* Primary CTA: Matchmaking en ligne */}
                <button
                  type="button"
                  onClick={onJoinMatchmaking}
                  disabled={!connected || isBusy}
                  className="tactile-btn w-full rounded-[11px] px-4 py-2.5 text-sm font-semibold flex items-center justify-between gap-2 disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--btn-primary-bg)',
                    color: 'var(--btn-primary-text)',
                  }}
                >
                  <span className="inline-flex items-center gap-2">
                    <Swords className="w-4 h-4" strokeWidth={1.9} />
                    <span>Trouver un adversaire</span>
                  </span>
                  <span className="text-xs font-normal opacity-80 inline-flex items-center gap-1">
                    <span>
                      {waitingInQueue > 0
                        ? `${waitingInQueue} en attente`
                        : 'Matchmaking'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
                  </span>
                </button>

                {/* Secondary CTA: Créer un duel privé */}
                <button
                  type="button"
                  onClick={onCreateRoom}
                  disabled={!connected || isBusy}
                  className="tactile-btn w-full rounded-[11px] px-3.5 py-2.5 text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 disabled:opacity-50"
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
                    disabled={
                      !connected || isBusy || normalizedJoin.length !== 6
                    }
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

                {!connected && (
                  <p
                    className="flex items-start gap-1.5 text-[11px] leading-snug"
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

              {/* Sophisticated Palettes & Board Studio Card right beside the board */}
              <div
                className="rounded-[16px] p-3.5 flex flex-col gap-2.5"
                style={{
                  backgroundColor: 'var(--bg-board)',
                  border: '1px solid var(--border-main)',
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Palettes sophistiquées & pièces
                  </span>
                  <button
                    type="button"
                    onClick={onOpenCustomize}
                    className="tactile-btn inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-cell)',
                    }}
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    <span>Studio complet</span>
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {THEMES.map((item) => {
                    const selected = item.id === theme;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onChangeTheme(item.id)}
                        aria-pressed={selected}
                        title={`${item.label} — ${item.description}`}
                        className="tactile-btn rounded-[9px] px-2 py-1.5 flex flex-col items-center gap-1 text-center"
                        style={{
                          backgroundColor: selected
                            ? 'var(--bg-recessed)'
                            : 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          border: `1.5px solid ${
                            selected
                              ? 'var(--accent-active)'
                              : 'var(--border-cell)'
                          }`,
                        }}
                      >
                        <span className="inline-flex items-center -space-x-1">
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-black/15"
                            style={{ backgroundColor: item.swatches.canvas }}
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-black/15"
                            style={{ backgroundColor: item.swatches.x }}
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-black/15"
                            style={{ backgroundColor: item.swatches.o }}
                          />
                        </span>
                        <span className="text-[10px] font-semibold truncate w-full">
                          {item.label.split(' ')[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
