import { useEffect, useRef } from 'react';

interface ConfettiProps {
  /** Variables CSS des couleurs à utiliser. */
  colorVars?: string[];
  particleCount?: number;
  durationMs?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
  shape: 'rect' | 'circle';
  wobble: number;
}

/**
 * Pluie de confettis sur canvas, aux couleurs du thème actif.
 * Ne fait rien si l'utilisateur a demandé à réduire les animations.
 */
const DEFAULT_COLOR_VARS = ['--x-color', '--o-color', '--accent-active'];

export function Confetti({
  colorVars = DEFAULT_COLOR_VARS,
  particleCount = 110,
  durationMs = 2200,
}: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorKey = colorVars.join(',');

  useEffect(() => {
    const colorVarList = colorKey.split(',');
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const styles = getComputedStyle(document.documentElement);
    const colors = colorVarList
      .map((v) => styles.getPropertyValue(v).trim())
      .filter(Boolean);
    if (colors.length === 0) colors.push('#4E7D3F');

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const { width, height } = canvas.getBoundingClientRect();
    const particles: Particle[] = Array.from({ length: particleCount }, (_, i) => {
      const fromLeft = i % 2 === 0;
      const angle = (fromLeft ? -60 : -120) + (Math.random() - 0.5) * 50;
      const speed = 7 + Math.random() * 8;
      return {
        x: fromLeft ? width * 0.08 : width * 0.92,
        y: height * 0.92,
        vx: Math.cos((angle * Math.PI) / 180) * speed,
        vy: Math.sin((angle * Math.PI) / 180) * speed,
        size: 5 + Math.random() * 6,
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        color: colors[i % colors.length],
        shape: Math.random() > 0.35 ? 'rect' : 'circle',
        wobble: Math.random() * Math.PI * 2,
      };
    });

    let frame = 0;
    const start = performance.now();
    const tick = (nowTs: number) => {
      const elapsed = nowTs - start;
      const progress = elapsed / durationMs;
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.vy += 0.28;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.wobble += 0.12;
        p.x += p.vx + Math.sin(p.wobble) * 0.6;
        p.y += p.vy;
        p.rotation += p.spin;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, progress - 0.6) / 0.4);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (elapsed < durationMs) {
        frame = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [colorKey, particleCount, durationMs]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[60] w-full h-full"
    />
  );
}
