import { useMemo } from 'react';
import { generateQrMatrix } from '../utils/qrCode';

interface QrCodeProps {
  value: string;
  size?: number;
  label?: string;
  className?: string;
}

/** Zone calme réglementaire ISO/IEC 18004 (4 modules sur chaque bord). */
const QUIET_ZONE = 4;

/** Carte papier claire fixe pour garantir une lecture fiable même en thème sombre. */
const PAPER_BG = '#FAF6EE';

/** Encre sombre principale (contraste > 16:1 sur #FAF6EE). */
const INK_DARK = '#1C1B18';

/**
 * Encre vert forêt très sombre pour le cœur du motif haut-gauche
 * (clin d'œil Atelier, contraste ~11:1 sur #FAF6EE, bien au-delà de 7:1).
 */
const INK_FINDER_ACCENT = '#153E2D';

function isInFinderPattern(row: number, col: number, size: number): boolean {
  return (
    (row < 7 && col < 7) ||
    (row < 7 && col >= size - 7) ||
    (row >= size - 7 && col < 7)
  );
}

/**
 * Affiche un QR Code SVG haute lisibilité dans la DA « Atelier vivant » :
 * carte papier claire, motifs de recherche arrondis inspirés des zones 3×3
 * du plateau et centre dégagé pour préserver toute la correction d'erreur.
 */
export function QrCode({
  value,
  size = 116,
  label,
  className = '',
}: QrCodeProps) {
  const layout = useMemo(() => {
    try {
      const matrix = generateQrMatrix(value);
      const dataModules: { row: number; col: number }[] = [];
      for (let r = 0; r < matrix.size; r++) {
        for (let c = 0; c < matrix.size; c++) {
          if (matrix.modules[r][c] && !isInFinderPattern(r, c, matrix.size)) {
            dataModules.push({ row: r, col: c });
          }
        }
      }
      return {
        size: matrix.size,
        viewSize: matrix.size + QUIET_ZONE * 2,
        dataModules,
      };
    } catch {
      return null;
    }
  }, [value]);

  if (!layout) {
    return null;
  }

  const finders: readonly { row: number; col: number; accent: boolean }[] = [
    { row: 0, col: 0, accent: true },
    { row: 0, col: layout.size - 7, accent: false },
    { row: layout.size - 7, col: 0, accent: false },
  ];

  return (
    <div
      className={`inline-flex items-center justify-center rounded-[12px] overflow-hidden shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: PAPER_BG,
        border: '1px solid var(--border-main)',
      }}
    >
      <svg
        viewBox={`0 0 ${layout.viewSize} ${layout.viewSize}`}
        className="w-full h-full block"
        role="img"
        aria-label={label ?? `QR code d’invitation pour ${value}`}
        shapeRendering="geometricPrecision"
      >
        {/* Fond papier + zone calme réglementaire */}
        <rect
          x={0}
          y={0}
          width={layout.viewSize}
          height={layout.viewSize}
          fill={PAPER_BG}
        />

        {/* 3 motifs de recherche 7×7 en cadres géométriques arrondis */}
        {finders.map((finder) => {
          const ox = QUIET_ZONE + finder.col;
          const oy = QUIET_ZONE + finder.row;
          return (
            <g key={`finder-${finder.row}-${finder.col}`}>
              <rect
                x={ox + 0.5}
                y={oy + 0.5}
                width={6}
                height={6}
                rx={1.25}
                fill="none"
                stroke={INK_DARK}
                strokeWidth={1}
              />
              <rect
                x={ox + 2}
                y={oy + 2}
                width={3}
                height={3}
                rx={0.65}
                fill={finder.accent ? INK_FINDER_ACCENT : INK_DARK}
              />
            </g>
          );
        })}

        {/* Modules de données, synchronisation, alignement, format et version */}
        {layout.dataModules.map((mod) => (
          <rect
            key={`${mod.row}-${mod.col}`}
            x={QUIET_ZONE + mod.col}
            y={QUIET_ZONE + mod.row}
            width={1}
            height={1}
            rx={0.28}
            fill={INK_DARK}
          />
        ))}
      </svg>
    </div>
  );
}
