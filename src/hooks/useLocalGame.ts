import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyOutcomeToProfile,
  calculateEloUpdate,
  getEloStakes,
  getEloTier,
  type EloMatchDelta,
  type EloStakes,
} from '@shared/elo';
import {
  applyMove,
  createInitialState,
  getOpponent,
  type GameState,
  type Move,
  type Player,
} from '@shared/gameEngine';
import {
  TIME_CONTROL_MS,
  type EndReason,
  type RoomPlayer,
  type TimeControl,
} from '@shared/protocol';
import { haptics } from '../utils/haptics';
import { soundEngine } from '../utils/soundEngine';
import { getSavedLocalElo, saveLocalElo } from '../utils/storage';

export interface LocalMatchState {
  phase: 'playing' | 'finished';
  timeControl: TimeControl;
  initialTimeMs: number | null;
  players: {
    X: RoomPlayer;
    O: RoomPlayer;
  };
  gameState: GameState;
  clocks: { X: number; O: number } | null;
  turnStartedAt: number | null;
  endReason: EndReason | null;
  matchWinner: Player | null;
  gameNumber: number;
  eloStakes: EloStakes;
  eloResult: {
    X: EloMatchDelta;
    O: EloMatchDelta;
  } | null;
}

function finalizeLocalMatchState(
  prev: LocalMatchState,
  winner: Player | null,
  endReason: EndReason,
  clocks: { X: number; O: number } | null,
  gameState: GameState = prev.gameState,
): LocalMatchState {
  const outcomeX: 1 | 0.5 | 0 = winner === 'X' ? 1 : winner === 'O' ? 0 : 0.5;
  const profX = getSavedLocalElo(prev.players.X.pseudo);
  const profO = getSavedLocalElo(prev.players.O.pseudo);

  const update = calculateEloUpdate(profX, profO, outcomeX);
  const nextProfX = applyOutcomeToProfile(profX, update.newRatingA, outcomeX);
  const nextProfO = applyOutcomeToProfile(
    profO,
    update.newRatingB,
    (1 - outcomeX) as 1 | 0.5 | 0,
  );

  saveLocalElo(prev.players.X.pseudo, nextProfX);
  saveLocalElo(prev.players.O.pseudo, nextProfO);

  const tierX = getEloTier(nextProfX.rating).label;
  const tierO = getEloTier(nextProfO.rating).label;

  return {
    ...prev,
    phase: 'finished',
    gameState,
    clocks,
    turnStartedAt: null,
    endReason,
    matchWinner: winner,
    players: {
      X: {
        ...prev.players.X,
        score: prev.players.X.score + (winner === 'X' ? 1 : 0),
        elo: nextProfX.rating,
        gamesPlayed: nextProfX.gamesPlayed,
        tier: tierX,
      },
      O: {
        ...prev.players.O,
        score: prev.players.O.score + (winner === 'O' ? 1 : 0),
        elo: nextProfO.rating,
        gamesPlayed: nextProfO.gamesPlayed,
        tier: tierO,
      },
    },
    eloResult: {
      X: {
        before: profX.rating,
        after: nextProfX.rating,
        delta: update.deltaA,
        tier: tierX,
      },
      O: {
        before: profO.rating,
        after: nextProfO.rating,
        delta: update.deltaB,
        tier: tierO,
      },
    },
  };
}

export function useLocalGame() {
  const [match, setMatch] = useState<LocalMatchState | null>(null);
  const matchRef = useRef<LocalMatchState | null>(null);

  const commitMatch = useCallback((next: LocalMatchState | null) => {
    matchRef.current = next;
    setMatch(next);
  }, []);

  const startLocalGame = useCallback(
    (params: {
      player1Name: string;
      player2Name: string;
      timeControl: TimeControl;
    }) => {
      const p1 = params.player1Name.trim() || 'Joueur 1';
      const p2 = params.player2Name.trim() || 'Joueur 2';
      const prof1 = getSavedLocalElo(p1);
      const prof2 = getSavedLocalElo(p2);
      const initialTimeMs = TIME_CONTROL_MS[params.timeControl];
      const now = Date.now();

      const next: LocalMatchState = {
        phase: 'playing',
        timeControl: params.timeControl,
        initialTimeMs,
        players: {
          X: {
            id: 'local-1',
            pseudo: p1,
            symbol: 'X',
            connected: true,
            score: 0,
            elo: prof1.rating,
            gamesPlayed: prof1.gamesPlayed,
            tier: getEloTier(prof1.rating).label,
          },
          O: {
            id: 'local-2',
            pseudo: p2,
            symbol: 'O',
            connected: true,
            score: 0,
            elo: prof2.rating,
            gamesPlayed: prof2.gamesPlayed,
            tier: getEloTier(prof2.rating).label,
          },
        },
        gameState: createInitialState('X'),
        clocks:
          initialTimeMs !== null
            ? { X: initialTimeMs, O: initialTimeMs }
            : null,
        turnStartedAt: initialTimeMs !== null ? now : null,
        endReason: null,
        matchWinner: null,
        gameNumber: 1,
        eloStakes: getEloStakes(prof1, prof2),
        eloResult: null,
      };
      commitMatch(next);
    },
    [commitMatch],
  );

  // Local timeout watcher when a timed local match is running
  useEffect(() => {
    if (!match || match.phase !== 'playing' || !match.clocks || match.turnStartedAt === null) {
      return;
    }

    const activeSymbol = match.gameState.currentPlayer;
    const elapsed = Math.max(0, Date.now() - match.turnStartedAt);
    const remainingMs = Math.max(0, match.clocks[activeSymbol] - elapsed);

    const timer = window.setTimeout(() => {
      const prev = matchRef.current;
      if (!prev || prev.phase !== 'playing' || !prev.clocks) return;

      const winner = getOpponent(prev.gameState.currentPlayer);
      soundEngine.playVictory();
      haptics.victory();
      commitMatch(
        finalizeLocalMatchState(
          prev,
          winner,
          'timeout',
          {
            ...prev.clocks,
            [prev.gameState.currentPlayer]: 0,
          },
        ),
      );
    }, remainingMs);

    return () => window.clearTimeout(timer);
  }, [
    match?.phase,
    match?.gameState.currentPlayer,
    match?.turnStartedAt,
    match?.gameNumber,
    commitMatch,
  ]);

  const playMove = useCallback(
    (move: Move) => {
      const prev = matchRef.current;
      if (!prev || prev.phase !== 'playing') return;

      const now = Date.now();
      const activeSymbol = prev.gameState.currentPlayer;
      let updatedClocks = prev.clocks;

      if (prev.clocks && prev.turnStartedAt !== null) {
        const elapsed = Math.max(0, now - prev.turnStartedAt);
        const remaining = prev.clocks[activeSymbol] - elapsed;
        if (remaining <= 0) {
          const winner = getOpponent(activeSymbol);
          soundEngine.playVictory();
          haptics.victory();
          commitMatch(
            finalizeLocalMatchState(
              prev,
              winner,
              'timeout',
              { ...prev.clocks, [activeSymbol]: 0 },
            ),
          );
          return;
        }
        updatedClocks = {
          ...prev.clocks,
          [activeSymbol]: remaining,
        };
      }

      const result = applyMove(prev.gameState, move);
      if (!result.ok) {
        return;
      }

      if (result.state.status === 'won' && result.state.winner) {
        soundEngine.playVictory();
        haptics.victory();
        commitMatch(
          finalizeLocalMatchState(
            prev,
            result.state.winner,
            'alignment',
            updatedClocks,
            result.state,
          ),
        );
        return;
      }

      if (result.state.status === 'draw') {
        soundEngine.playDraw();
        haptics.draw();
        commitMatch(
          finalizeLocalMatchState(
            prev,
            null,
            'draw',
            updatedClocks,
            result.state,
          ),
        );
        return;
      }

      if (result.capturedBoard) {
        soundEngine.playCapture(activeSymbol);
        haptics.capture();
      } else {
        soundEngine.playMove(activeSymbol);
        if (result.triggeredFreeMove) {
          haptics.freeMove();
        } else {
          haptics.move();
        }
      }

      commitMatch({
        ...prev,
        gameState: result.state,
        clocks: updatedClocks,
        turnStartedAt: updatedClocks !== null ? now : null,
      });
    },
    [commitMatch],
  );

  const resign = useCallback(() => {
    const prev = matchRef.current;
    if (!prev || prev.phase !== 'playing') return;

    const winner = getOpponent(prev.gameState.currentPlayer);
    soundEngine.playVictory();
    haptics.victory();
    commitMatch(finalizeLocalMatchState(prev, winner, 'resign', prev.clocks));
  }, [commitMatch]);

  const rematch = useCallback(() => {
    const prev = matchRef.current;
    if (!prev) return;
    const now = Date.now();
    const prevX = prev.players.X;
    const prevO = prev.players.O;

    const nextX: RoomPlayer = { ...prevO, symbol: 'X' };
    const nextO: RoomPlayer = { ...prevX, symbol: 'O' };

    commitMatch({
      ...prev,
      phase: 'playing',
      players: {
        X: nextX,
        O: nextO,
      },
      gameState: createInitialState('X'),
      clocks:
        prev.initialTimeMs !== null
          ? { X: prev.initialTimeMs, O: prev.initialTimeMs }
          : null,
      turnStartedAt: prev.initialTimeMs !== null ? now : null,
      endReason: null,
      matchWinner: null,
      gameNumber: prev.gameNumber + 1,
      eloStakes: getEloStakes(
        { rating: nextX.elo, gamesPlayed: nextX.gamesPlayed },
        { rating: nextO.elo, gamesPlayed: nextO.gamesPlayed },
      ),
      eloResult: null,
    });
  }, [commitMatch]);

  const exitLocalGame = useCallback(() => {
    commitMatch(null);
  }, [commitMatch]);

  return {
    match,
    startLocalGame,
    playMove,
    resign,
    rematch,
    exitLocalGame,
  };
}
