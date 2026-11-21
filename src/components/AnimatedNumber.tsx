import { useAnimatedNumber } from '../hooks/useAnimatedNumber';

interface AnimatedNumberProps {
  value: number;
  /** Valeur de départ du défilement (0 par défaut). */
  from?: number;
  durationMs?: number;
  delayMs?: number;
  prefix?: string;
  suffix?: string;
}

/**
 * Nombre qui défile jusqu'à sa valeur à l'affichage.
 * Affiche directement la valeur si le système demande de réduire les animations.
 */
export function AnimatedNumber({
  value,
  from = 0,
  durationMs = 800,
  delayMs = 120,
  prefix = '',
  suffix = '',
}: AnimatedNumberProps) {
  const shown = useAnimatedNumber(from, value, durationMs, delayMs);
  return (
    <>
      {prefix}
      {shown}
      {suffix}
    </>
  );
}
