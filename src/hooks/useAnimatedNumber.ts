import { useEffect, useState } from 'react';

/** Fait défiler un nombre de `from` vers `to` (compteur de classement). */
export function useAnimatedNumber(
  from: number,
  to: number,
  durationMs = 900,
  delayMs = 300,
): number {
  const [value, setValue] = useState(from);

  useEffect(() => {
    if (from === to) {
      setValue(to);
      return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValue(to);
      return;
    }
    setValue(from);
    let frame = 0;
    let start: number | null = null;
    const timeout = window.setTimeout(() => {
      const step = (ts: number) => {
        if (start === null) start = ts;
        const t = Math.min(1, (ts - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(Math.round(from + (to - from) * eased));
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }, delayMs);
    return () => {
      window.clearTimeout(timeout);
      cancelAnimationFrame(frame);
    };
  }, [from, to, durationMs, delayMs]);

  return value;
}
