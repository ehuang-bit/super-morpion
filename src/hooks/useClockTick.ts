import { useEffect, useState } from 'react';
import type { Player } from '@shared/gameEngine';

interface UseClockTickParams {
  clocks: { X: number; O: number } | null;
  turnStartedAt: number | null;
  activePlayer: Player;
  isRunning: boolean;
  clockOffsetMs?: number;
}

export function useClockTick({
  clocks,
  turnStartedAt,
  activePlayer,
  isRunning,
  clockOffsetMs = 0,
}: UseClockTickParams): { X: number; O: number } | null {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!isRunning || !clocks || turnStartedAt === null) {
      return;
    }

    const interval = window.setInterval(() => {
      setTick((t) => (t + 1) % 100000);
    }, 100);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRunning, clocks, turnStartedAt, activePlayer]);

  if (!clocks) {
    return null;
  }

  if (!isRunning || turnStartedAt === null) {
    return clocks;
  }

  const estimatedServerNow = Date.now() + clockOffsetMs;
  const elapsed = Math.max(0, estimatedServerNow - turnStartedAt);

  return {
    X: activePlayer === 'X' ? Math.max(0, clocks.X - elapsed) : clocks.X,
    O: activePlayer === 'O' ? Math.max(0, clocks.O - elapsed) : clocks.O,
  };
}
