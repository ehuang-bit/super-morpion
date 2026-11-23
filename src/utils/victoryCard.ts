import {
  BOARD_COORDS,
  type GameState,
  type Player,
  type SubBoardState,
  type WinLine,
} from '@shared/gameEngine';
import {
  TIME_CONTROL_LABELS,
  type EndReason,
  type TimeControl,
} from '@shared/protocol';
import type { PieceStyle } from '../types/boardPrefs';

export interface VictoryCardData {
  gameState: GameState;
  mode: '1v1' | '2v2';
  teamXNames: string[];
  teamONames: string[];
  matchWinner: Player | null;
  endReason: EndReason | null;
  localSymbol: Player | null;
  timeControl: TimeControl;
  eloDelta?: number | null;
  eloAfter?: number | null;
  pieceStyle: PieceStyle;
}

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const CARD_FILENAME = 'super-morpion-souvenir.png';

const FONT_SANS =
  "'Figtree', ui-sans-serif, system-ui, -apple-system, sans-serif";
const FONT_MONO =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface CardPalette {
  bgCanvas: string;
  bgBoard: string;
  bgSurface: string;
  bgRecessed: string;
  borderMain: string;
  borderCell: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  xColor: string;
  xSurface: string;
  oColor: string;
  oSurface: string;
  oPieceColor: string;
  oPieceOutline: string;
  xPionFill: string;
  xPionRim: string;
  xPionInk: string;
  oPionFill: string;
  oPionRim: string;
  oPionInk: string;
  drawSurface: string;
  accentActive: string;
  accentActiveBg: string;
  accentActiveText: string;
  dangerColor: string;
  isDark: boolean;
}

const ATELIER_FALLBACK: Omit<CardPalette, 'isDark'> = {
  bgCanvas: '#EDEAE4',
  bgBoard: '#F7F5F0',
  bgSurface: '#EFECE6',
  bgRecessed: '#E3DFD7',
  borderMain: '#D7D2C8',
  borderCell: '#E3DED5',
  borderStrong: '#C2BCB0',
  textPrimary: '#2B2926',
  textSecondary: '#5B5750',
  textMuted: '#68635B',
  xColor: '#3D679A',
  xSurface: '#E4ECF4',
  oColor: '#B05634',
  oSurface: '#F3E6DF',
  oPieceColor: '#B05634',
  oPieceOutline: 'transparent',
  xPionFill: '#E4ECF4',
  xPionRim: '#3D679A',
  xPionInk: '#3D679A',
  oPionFill: '#F3E6DF',
  oPionRim: '#B05634',
  oPionInk: '#B05634',
  drawSurface: '#E5E1D9',
  accentActive: '#4E7D3F',
  accentActiveBg: 'rgba(78, 125, 63, 0.13)',
  accentActiveText: '#3A612E',
  dangerColor: '#A63E33',
};

function parseRgb(color: string): [number, number, number] | null {
  const trimmed = color.trim();
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (hexMatch) {
    const raw = hexMatch[1];
    if (raw.length === 3) {
      return [
        parseInt(raw[0] + raw[0], 16),
        parseInt(raw[1] + raw[1], 16),
        parseInt(raw[2] + raw[2], 16),
      ];
    }
    return [
      parseInt(raw.slice(0, 2), 16),
      parseInt(raw.slice(2, 4), 16),
      parseInt(raw.slice(4, 6), 16),
    ];
  }

  const rgbMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(trimmed);
  if (rgbMatch) {
    return [
      Math.round(Number(rgbMatch[1])),
      Math.round(Number(rgbMatch[2])),
      Math.round(Number(rgbMatch[3])),
    ];
  }

  return null;
}

function withAlpha(color: string, alpha: number): string {
  const rgb = parseRgb(color);
  if (!rgb) return color;
  const clamped = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${clamped})`;
}

function isColorDark(color: string): boolean {
  const rgb = parseRgb(color);
  if (!rgb) return false;
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luminance < 0.45;
}

function readActivePalette(): CardPalette {
  const styles =
    typeof document !== 'undefined' && typeof getComputedStyle === 'function'
      ? getComputedStyle(document.documentElement)
      : null;

  const pick = (cssVar: string, fallback: string): string => {
    const value = styles?.getPropertyValue(cssVar).trim();
    return value && value.length > 0 ? value : fallback;
  };

  const bgCanvas = pick('--bg-canvas', ATELIER_FALLBACK.bgCanvas);

  const xColor = pick('--x-color', ATELIER_FALLBACK.xColor);
  const xSurface = pick('--x-surface', ATELIER_FALLBACK.xSurface);
  const oColor = pick('--o-color', ATELIER_FALLBACK.oColor);
  const oSurface = pick('--o-surface', ATELIER_FALLBACK.oSurface);

  return {
    bgCanvas,
    bgBoard: pick('--bg-board', ATELIER_FALLBACK.bgBoard),
    bgSurface: pick('--bg-surface', ATELIER_FALLBACK.bgSurface),
    bgRecessed: pick('--bg-recessed', ATELIER_FALLBACK.bgRecessed),
    borderMain: pick('--border-main', ATELIER_FALLBACK.borderMain),
    borderCell: pick('--border-cell', ATELIER_FALLBACK.borderCell),
    borderStrong: pick('--border-strong', ATELIER_FALLBACK.borderStrong),
    textPrimary: pick('--text-primary', ATELIER_FALLBACK.textPrimary),
    textSecondary: pick('--text-secondary', ATELIER_FALLBACK.textSecondary),
    textMuted: pick('--text-muted', ATELIER_FALLBACK.textMuted),
    xColor,
    xSurface,
    oColor,
    oSurface,
    oPieceColor: pick('--o-piece-color', oColor),
    oPieceOutline: pick('--o-piece-outline', 'transparent'),
    xPionFill: pick('--x-pion-fill', xSurface),
    xPionRim: pick('--x-pion-rim', xColor),
    xPionInk: pick('--x-pion-ink', xColor),
    oPionFill: pick('--o-pion-fill', oSurface),
    oPionRim: pick('--o-pion-rim', oColor),
    oPionInk: pick('--o-pion-ink', oColor),
    drawSurface: pick('--draw-surface', ATELIER_FALLBACK.drawSurface),
    accentActive: pick('--accent-active', ATELIER_FALLBACK.accentActive),
    accentActiveBg: pick('--accent-active-bg', ATELIER_FALLBACK.accentActiveBg),
    accentActiveText: pick('--accent-active-text', ATELIER_FALLBACK.accentActiveText),
    dangerColor: pick('--danger-color', ATELIER_FALLBACK.dangerColor),
    isDark: isColorDark(bgCanvas),
  };
}

/** Générateur pseudo-aléatoire déterministe pour un grain papier constant. */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function measureSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  spacing: number,
): number {
  if (!text) return 0;
  const chars = Array.from(text);
  let width = 0;
  for (let i = 0; i < chars.length; i++) {
    width += ctx.measureText(chars[i]).width;
    if (i < chars.length - 1) width += spacing;
  }
  return width;
}

function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: 'left' | 'center' | 'right' = 'left',
): void {
  if (!text) return;
  const chars = Array.from(text);
  const totalWidth = measureSpacedText(ctx, text, spacing);
  let cursor =
    align === 'center' ? x - totalWidth / 2 : align === 'right' ? x - totalWidth : x;

  ctx.save();
  ctx.textAlign = 'left';
  for (const ch of chars) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
  ctx.restore();
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  let trimmed = text.trim();
  while (trimmed.length > 1 && ctx.measureText(trimmed + ellipsis).width > maxWidth) {
    trimmed = trimmed.slice(0, -1).trimEnd();
  }
  return `${trimmed}${ellipsis}`;
}

function formatTeamLabel(
  names: string[],
  symbol: Player,
  mode: '1v1' | '2v2',
): string {
  const cleaned = names.map((name) => name.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return mode === '2v2' ? `Équipe ${symbol}` : `Joueur ${symbol}`;
  }
  return cleaned.join(' & ');
}

function countMoves(gameState: GameState): number {
  if (gameState.moveHistory.length > 0) {
    return gameState.moveHistory.length;
  }
  let pieces = 0;
  for (const board of gameState.boards) {
    for (const cell of board.cells) {
      if (cell !== null) pieces += 1;
    }
  }
  return pieces;
}

function formatTodayFr(): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function formatEloDelta(delta: number): string {
  const rounded = Math.round(delta);
  if (rounded > 0) return `+${rounded}`;
  if (rounded < 0) return `−${Math.abs(rounded)}`;
  return '0';
}

function resolveHeadline(
  data: VictoryCardData,
  palette: CardPalette,
): { title: string; subtitle: string; inkColor: string; barColor: string } {
  const moves = countMoves(data.gameState);
  const movesSuffix =
    moves > 0 ? ` · ${moves} ${moves > 1 ? 'coups' : 'coup'}` : '';

  const winnerInk =
    data.matchWinner === 'X'
      ? palette.xColor
      : data.matchWinner === 'O'
        ? palette.oColor
        : palette.textPrimary;

  const barColor =
    data.matchWinner === 'X'
      ? palette.xColor
      : data.matchWinner === 'O'
        ? palette.oColor
        : palette.accentActive;

  if (data.endReason === 'aborted') {
    return {
      title: 'PARTIE ANNULÉE',
      subtitle: `Interrompue avant le début du duel${movesSuffix}`,
      inkColor: palette.textSecondary,
      barColor: palette.borderStrong,
    };
  }

  if (data.matchWinner === null) {
    return {
      title: 'MATCH NUL',
      subtitle: `Égalité sur le grand plateau${movesSuffix}`,
      inkColor: palette.textPrimary,
      barColor: palette.accentActive,
    };
  }

  const isLocalWin =
    data.localSymbol !== null && data.matchWinner === data.localSymbol;
  const isLocalLoss =
    data.localSymbol !== null && data.matchWinner !== data.localSymbol;

  const title = isLocalWin
    ? 'VICTOIRE'
    : isLocalLoss
      ? 'DÉFAITE'
      : 'DUEL TERMINÉ';

  let reasonText = 'Trois zones alignées';
  switch (data.endReason) {
    case 'timeout':
      reasonText = isLocalLoss ? 'Temps écoulé' : 'Victoire au temps';
      break;
    case 'resign':
      reasonText = isLocalLoss ? 'Partie abandonnée' : 'Victoire par abandon';
      break;
    case 'abandoned':
      reasonText = isLocalLoss ? 'Partie quittée' : 'Adversaire déconnecté';
      break;
    case 'draw':
      reasonText = 'Plateau complet';
      break;
    case 'alignment':
    default:
      reasonText = 'Trois zones alignées';
      break;
  }

  return {
    title,
    subtitle: `${reasonText}${movesSuffix}`,
    inkColor: winnerInk,
    barColor,
  };
}

/**
 * Dessine une pièce X ou O centrée dans un carré [x, y, size] en respectant
 * fidèlement le style choisi (`classique`, `calligraphie`, `geometrique`, `pions`).
 */
function drawPiece(
  ctx: CanvasRenderingContext2D,
  player: Player,
  x: number,
  y: number,
  size: number,
  pieceStyle: PieceStyle,
  variant: 'cell' | 'captured' | 'badge',
  palette: CardPalette,
): void {
  const color = player === 'X' ? palette.xColor : palette.oPieceColor;
  const hasOutline =
    player === 'O' &&
    palette.oPieceOutline !== 'transparent' &&
    palette.oPieceOutline.length > 0;
  const outlineBoost = size * (variant === 'badge' ? 0.032 : 0.025);
  const strokeRatio =
    variant === 'badge' ? 0.112 : variant === 'captured' ? 0.084 : 0.098;
  const strokeWidth = size * strokeRatio;
  const u = (pct: number) => (pct / 100) * size;

  ctx.save();
  ctx.translate(x, y);

  if (pieceStyle === 'pions') {
    const innerStroke = size * (variant === 'badge' ? 0.095 : 0.078);
    const fill = player === 'X' ? palette.xPionFill : palette.oPionFill;
    const rim = player === 'X' ? palette.xPionRim : palette.oPionRim;
    const ink = player === 'X' ? palette.xPionInk : palette.oPionInk;
    ctx.beginPath();
    ctx.arc(u(50), u(50), u(40), 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = size * (variant === 'badge' ? 0.07 : 0.06);
    ctx.strokeStyle = rim;
    ctx.stroke();

    ctx.strokeStyle = ink;
    ctx.lineWidth = innerStroke;
    ctx.lineCap = 'round';
    if (player === 'X') {
      ctx.beginPath();
      ctx.moveTo(u(33), u(33));
      ctx.lineTo(u(67), u(67));
      ctx.moveTo(u(67), u(33));
      ctx.lineTo(u(33), u(67));
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(u(50), u(50), u(17.5), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (pieceStyle === 'calligraphie') {
    ctx.lineCap = 'round';
    if (player === 'X') {
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      ctx.moveTo(u(22), u(25));
      ctx.quadraticCurveTo(u(49), u(48), u(77), u(77));
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(u(78), u(22));
      ctx.quadraticCurveTo(u(51), u(50), u(23), u(78));
      ctx.stroke();
    } else {
      // Cercle ensō légèrement ouvert près du sommet gauche
      if (hasOutline) {
        ctx.strokeStyle = palette.oPieceOutline;
        ctx.lineWidth = strokeWidth + outlineBoost;
        ctx.beginPath();
        ctx.arc(u(50), u(50), u(29), -Math.PI * 0.45, Math.PI * 1.36, false);
        ctx.stroke();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      ctx.arc(u(50), u(50), u(29), -Math.PI * 0.45, Math.PI * 1.36, false);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (pieceStyle === 'geometrique') {
    if (player === 'X') {
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth * 0.92;
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(u(22), u(22));
      ctx.lineTo(u(78), u(78));
      ctx.moveTo(u(78), u(22));
      ctx.lineTo(u(22), u(78));
      ctx.stroke();
    } else {
      if (hasOutline) {
        ctx.strokeStyle = palette.oPieceOutline;
        ctx.lineWidth = strokeWidth * 0.78 + outlineBoost;
        ctx.beginPath();
        ctx.arc(u(50), u(50), u(30), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth * 0.78;
      ctx.beginPath();
      ctx.arc(u(50), u(50), u(30), 0, Math.PI * 2);
      ctx.stroke();

      ctx.save();
      ctx.globalAlpha *= 0.8;
      if (hasOutline) {
        ctx.strokeStyle = palette.oPieceOutline;
        ctx.lineWidth = strokeWidth * 0.55 + outlineBoost * 0.72;
        ctx.beginPath();
        ctx.arc(u(50), u(50), u(15), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth * 0.55;
      ctx.beginPath();
      ctx.arc(u(50), u(50), u(15), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  // Style classique : traits arrondis fluides
  ctx.lineCap = 'round';
  if (player === 'X') {
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    ctx.moveTo(u(23), u(23));
    ctx.lineTo(u(77), u(77));
    ctx.moveTo(u(77), u(23));
    ctx.lineTo(u(23), u(77));
    ctx.stroke();
  } else {
    if (hasOutline) {
      ctx.strokeStyle = palette.oPieceOutline;
      ctx.lineWidth = strokeWidth + outlineBoost;
      ctx.beginPath();
      ctx.arc(u(50), u(50), u(28), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    ctx.arc(u(50), u(50), u(28), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Fond papier texturé Atelier + double filet éditorial aux coins arrondis. */
function drawEditorialPaper(
  ctx: CanvasRenderingContext2D,
  palette: CardPalette,
  heroTint: string,
): void {
  // Fond principal plat (sans halo radial)
  ctx.fillStyle = palette.bgCanvas;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Filet supérieur éditorial dans la teinte du vainqueur
  ctx.fillStyle = heroTint;
  ctx.fillRect(46, 32, CARD_WIDTH - 92, 4);

  // Feuillet intérieur passe-partout
  ctx.save();
  roundedRectPath(ctx, 46, 46, CARD_WIDTH - 92, CARD_HEIGHT - 92, 24);
  ctx.fillStyle = withAlpha(palette.bgBoard, palette.isDark ? 0.52 : 0.72);
  ctx.fill();
  ctx.restore();

  // Grain papier & fines fibres de lin (déterministes)
  const rng = createRng(0x534d4154);
  const darkDot = palette.isDark ? '#FFFFFF' : '#1F1E1C';
  const lightDot = palette.bgBoard;

  ctx.save();
  for (let i = 0; i < 2400; i++) {
    const px = rng() * CARD_WIDTH;
    const py = rng() * CARD_HEIGHT;
    const sz = rng() > 0.72 ? 2 : 1.2;
    const isLight = rng() > 0.55;
    ctx.fillStyle = withAlpha(
      isLight ? lightDot : darkDot,
      isLight ? 0.025 + rng() * 0.025 : 0.014 + rng() * 0.022,
    );
    ctx.fillRect(px, py, sz, sz);
  }

  ctx.lineWidth = 0.8;
  for (let i = 0; i < 120; i++) {
    const fx = rng() * CARD_WIDTH;
    const fy = rng() * CARD_HEIGHT;
    const len = 16 + rng() * 38;
    const horizontal = rng() > 0.45;
    ctx.strokeStyle = withAlpha(
      rng() > 0.5 ? darkDot : lightDot,
      0.015 + rng() * 0.02,
    );
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(horizontal ? fx + len : fx, horizontal ? fy : fy + len);
    ctx.stroke();
  }
  ctx.restore();

  // Double filet fin d'encadrement éditorial
  ctx.save();
  roundedRectPath(ctx, 32, 32, CARD_WIDTH - 64, CARD_HEIGHT - 64, 32);
  ctx.strokeStyle = withAlpha(palette.borderStrong, palette.isDark ? 0.85 : 0.9);
  ctx.lineWidth = 1.6;
  ctx.stroke();

  roundedRectPath(ctx, 46, 46, CARD_WIDTH - 92, CARD_HEIGHT - 92, 24);
  ctx.strokeStyle = palette.borderMain;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/** Petit sceau 3×3 dessiné au Canvas (fidèle à l'emblème BrandLogo). */
function drawAtelierSeal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  palette: CardPalette,
): void {
  const s = size / 40;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  roundedRectPath(ctx, 1.5, 1.5, 37, 37, 9);
  ctx.fillStyle = palette.bgSurface;
  ctx.fill();
  ctx.strokeStyle = palette.borderStrong;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Grille 3×3 gravée
  ctx.save();
  ctx.strokeStyle = withAlpha(palette.borderStrong, 0.75);
  ctx.lineWidth = 1.15;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(15, 7.5);
  ctx.lineTo(15, 32.5);
  ctx.moveTo(25, 7.5);
  ctx.lineTo(25, 32.5);
  ctx.moveTo(7.5, 15);
  ctx.lineTo(32.5, 15);
  ctx.moveTo(7.5, 25);
  ctx.lineTo(32.5, 25);
  ctx.stroke();
  ctx.restore();

  // Case cible active en bas à droite
  roundedRectPath(ctx, 26.2, 26.2, 7.4, 7.4, 2.1);
  ctx.fillStyle = palette.accentActiveBg;
  ctx.fill();
  ctx.strokeStyle = palette.accentActive;
  ctx.lineWidth = 1.45;
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = palette.accentActiveText;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.moveTo(29.9, 28.1);
  ctx.lineTo(29.9, 31.9);
  ctx.moveTo(28, 30);
  ctx.lineTo(31.8, 30);
  ctx.stroke();

  // X en haut à gauche
  ctx.beginPath();
  ctx.strokeStyle = palette.xColor;
  ctx.lineWidth = 2.15;
  ctx.lineCap = 'round';
  ctx.moveTo(8.5, 8.5);
  ctx.lineTo(12.9, 12.9);
  ctx.moveTo(12.9, 8.5);
  ctx.lineTo(8.5, 12.9);
  ctx.stroke();

  // O au centre
  ctx.beginPath();
  ctx.arc(20, 20, 2.9, 0, Math.PI * 2);
  ctx.fillStyle = palette.oSurface;
  ctx.fill();
  ctx.strokeStyle = palette.oColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  label: string,
  rightEdgeX: number,
  centerY: number,
  options: {
    bg: string;
    border: string;
    color: string;
    font: string;
    padX?: number;
    height?: number;
  },
): number {
  const padX = options.padX ?? 16;
  const height = options.height ?? 36;
  ctx.save();
  ctx.font = options.font;
  const textWidth = ctx.measureText(label).width;
  const width = Math.ceil(textWidth + padX * 2);
  const leftX = rightEdgeX - width;
  const topY = centerY - height / 2;

  roundedRectPath(ctx, leftX, topY, width, height, height / 2);
  ctx.fillStyle = options.bg;
  ctx.fill();
  ctx.strokeStyle = options.border;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.fillStyle = options.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, leftX + width / 2, centerY + 0.5);
  ctx.restore();

  return width;
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  data: VictoryCardData,
  palette: CardPalette,
): void {
  const leftX = 78;
  const rightX = CARD_WIDTH - 78;

  // Sceau 3×3
  drawAtelierSeal(ctx, leftX, 78, 56, palette);

  // Logotype « SUPER MORPION » + date du jour
  ctx.save();
  ctx.fillStyle = palette.textPrimary;
  ctx.font = `800 22px ${FONT_SANS}`;
  ctx.textBaseline = 'alphabetic';
  drawSpacedText(ctx, 'SUPER MORPION', leftX + 72, 104, 2.2, 'left');

  ctx.fillStyle = palette.textMuted;
  ctx.font = `500 14.5px ${FONT_MONO}`;
  ctx.textAlign = 'left';
  ctx.fillText(formatTodayFr(), leftX + 72, 127);
  ctx.restore();

  // Badges à droite : cadence (+ badge 2v2 si mode équipes)
  const cadenceLabel = TIME_CONTROL_LABELS[data.timeControl] ?? 'Classique';
  const cadenceW = drawPill(ctx, cadenceLabel, rightX, 106, {
    bg: palette.bgSurface,
    border: palette.borderMain,
    color: palette.textSecondary,
    font: `600 14.5px ${FONT_MONO}`,
  });

  if (data.mode === '2v2') {
    drawPill(ctx, '2v2 · Équipes', rightX - cadenceW - 10, 106, {
      bg: palette.accentActiveBg,
      border: withAlpha(palette.accentActive, 0.7),
      color: palette.accentActiveText,
      font: `700 14px ${FONT_SANS}`,
    });
  }

  // Filet séparateur éditorial
  ctx.save();
  ctx.strokeStyle = withAlpha(palette.borderMain, 0.85);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(leftX, 158);
  ctx.lineTo(rightX, 158);
  ctx.stroke();
  ctx.restore();
}

function drawHeadlineBanner(
  ctx: CanvasRenderingContext2D,
  data: VictoryCardData,
  palette: CardPalette,
): void {
  const { title, subtitle, inkColor, barColor } = resolveHeadline(data, palette);
  const centerX = CARD_WIDTH / 2;
  const isLongTitle = title.length > 10;

  ctx.save();
  ctx.fillStyle = inkColor;
  ctx.font = `800 ${isLongTitle ? 58 : 68}px ${FONT_SANS}`;
  ctx.textBaseline = 'alphabetic';
  drawSpacedText(ctx, title, centerX, 248, isLongTitle ? 3.5 : 5, 'center');

  // Trait d'encre décoratif sous le titre
  roundedRectPath(ctx, centerX - 48, 266, 96, 4.5, 2.25);
  ctx.fillStyle = withAlpha(barColor, 0.82);
  ctx.fill();

  // Sous-titre court
  ctx.fillStyle = palette.textSecondary;
  ctx.font = `500 22px ${FONT_SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitText(ctx, subtitle, CARD_WIDTH - 180), centerX, 305);
  ctx.restore();
}

function drawSubBoard(
  ctx: CanvasRenderingContext2D,
  subBoard: SubBoardState,
  boardIndex: number,
  x: number,
  y: number,
  size: number,
  pieceStyle: PieceStyle,
  lastMoveCell: number | null,
  isInGlobalWinLine: boolean,
  palette: CardPalette,
): void {
  const isCaptured = subBoard.status === 'X' || subBoard.status === 'O';
  const isDraw = subBoard.status === 'draw';

  let containerBg = palette.bgBoard;
  let containerBorder = palette.borderMain;
  let borderWidth = 1.5;

  if (subBoard.status === 'X') {
    containerBg = palette.xSurface;
    containerBorder = withAlpha(palette.xColor, isInGlobalWinLine ? 0.72 : 0.4);
    borderWidth = isInGlobalWinLine ? 2.4 : 1.6;
  } else if (subBoard.status === 'O') {
    containerBg = palette.oSurface;
    containerBorder = withAlpha(palette.oColor, isInGlobalWinLine ? 0.72 : 0.4);
    borderWidth = isInGlobalWinLine ? 2.4 : 1.6;
  } else if (isDraw) {
    containerBg = palette.drawSurface;
    containerBorder = palette.borderStrong;
  }

  // Boîtier de la sous-grille
  ctx.save();
  roundedRectPath(ctx, x, y, size, size, 14);
  ctx.fillStyle = containerBg;
  ctx.fill();
  ctx.strokeStyle = containerBorder;
  ctx.lineWidth = borderWidth;
  ctx.stroke();

  // Coordonnée architecturale discrète (A1..C3)
  ctx.fillStyle = withAlpha(palette.textMuted, 0.45);
  ctx.font = `500 10.5px ${FONT_MONO}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(BOARD_COORDS[boardIndex] ?? '', x + 7, y + 5);

  // Les 9 cases internes
  const subPad = 11;
  const cellGap = 6;
  const cellSize = (size - subPad * 2 - cellGap * 2) / 3;
  const cellsAlpha = isCaptured ? 0.22 : isDraw ? 0.34 : 1;

  for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
    const cRow = Math.floor(cellIndex / 3);
    const cCol = cellIndex % 3;
    const cx = x + subPad + cCol * (cellSize + cellGap);
    const cy = y + subPad + cRow * (cellSize + cellGap);
    const cellValue = subBoard.cells[cellIndex];
    const isLastMove = lastMoveCell === cellIndex;

    ctx.save();
    ctx.globalAlpha = cellsAlpha;

    roundedRectPath(ctx, cx, cy, cellSize, cellSize, 6);
    ctx.fillStyle = isLastMove ? palette.accentActiveBg : palette.bgSurface;
    ctx.fill();
    ctx.strokeStyle = isLastMove ? palette.accentActive : palette.borderCell;
    ctx.lineWidth = isLastMove ? 1.4 : 1;
    ctx.stroke();

    if (cellValue !== null) {
      const piecePad = cellSize * 0.14;
      drawPiece(
        ctx,
        cellValue,
        cx + piecePad,
        cy + piecePad,
        cellSize - piecePad * 2,
        pieceStyle,
        'cell',
        palette,
      );
    }

    if (isLastMove && !isCaptured) {
      ctx.beginPath();
      ctx.arc(cx + cellSize - 5.5, cy + cellSize - 5.5, 2.3, 0, Math.PI * 2);
      ctx.fillStyle = palette.accentActive;
      ctx.fill();
    }

    ctx.restore();
  }

  // Emblème de capture sur la zone gagnée
  if (isCaptured) {
    const owner: Player = subBoard.status === 'X' ? 'X' : 'O';
    const ownerColor = owner === 'X' ? palette.xColor : palette.oColor;

    // Trait gagnant local discret sous le grand emblème
    if (subBoard.winLine) {
      const cellCenter = (idx: number) => ({
        x: x + subPad + (idx % 3) * (cellSize + cellGap) + cellSize / 2,
        y:
          y +
          subPad +
          Math.floor(idx / 3) * (cellSize + cellGap) +
          cellSize / 2,
      });
      const start = cellCenter(subBoard.winLine[0]);
      const end = cellCenter(subBoard.winLine[2]);

      ctx.save();
      ctx.strokeStyle = withAlpha(ownerColor, 0.3);
      ctx.lineWidth = 7.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.restore();
    }

    const emblemSize = size * 0.64;
    const emblemOffset = (size - emblemSize) / 2;
    drawPiece(
      ctx,
      owner,
      x + emblemOffset,
      y + emblemOffset,
      emblemSize,
      pieceStyle,
      'captured',
      palette,
    );
  } else if (isDraw) {
    // Pastille « Nul » centrée sur la sous-grille nulle
    const pillW = 54;
    const pillH = 26;
    const px = x + (size - pillW) / 2;
    const py = y + (size - pillH) / 2;
    roundedRectPath(ctx, px, py, pillW, pillH, 7);
    ctx.fillStyle = palette.bgBoard;
    ctx.fill();
    ctx.strokeStyle = palette.borderStrong;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = palette.textSecondary;
    ctx.font = `600 13px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Nul', x + size / 2, y + size / 2 + 0.5);
  }

  ctx.restore();
}

function drawGlobalWinLine(
  ctx: CanvasRenderingContext2D,
  winLine: WinLine,
  winner: Player,
  boardX: number,
  boardY: number,
  boardPad: number,
  subSize: number,
  subGap: number,
  palette: CardPalette,
): void {
  const center = (idx: number) => ({
    x: boardX + boardPad + (idx % 3) * (subSize + subGap) + subSize / 2,
    y:
      boardY +
      boardPad +
      Math.floor(idx / 3) * (subSize + subGap) +
      subSize / 2,
  });

  const start = center(winLine[0]);
  const end = center(winLine[2]);
  const strokeColor = winner === 'X' ? palette.xColor : palette.oColor;

  ctx.save();
  ctx.lineCap = 'round';

  // Halo extérieur d'encre
  ctx.strokeStyle = withAlpha(strokeColor, 0.22);
  ctx.lineWidth = 40;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  // Fin contour papier pour détacher le trait au-dessus des emblèmes capturés
  ctx.strokeStyle = withAlpha(palette.bgBoard, palette.isDark ? 0.55 : 0.65);
  ctx.lineWidth = 23;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  // Trait gagnant principal
  ctx.strokeStyle = withAlpha(strokeColor, 0.96);
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.restore();
}

function drawFinalBoard(
  ctx: CanvasRenderingContext2D,
  data: VictoryCardData,
  palette: CardPalette,
): void {
  const boardSize = 660;
  const boardX = (CARD_WIDTH - boardSize) / 2;
  const boardY = 342;
  const boardPad = 15;
  const subGap = 12;
  const subSize = (boardSize - boardPad * 2 - subGap * 2) / 3;

  // Boîtier principal du plateau avec ombre douce
  ctx.save();
  ctx.shadowColor = palette.isDark
    ? 'rgba(0, 0, 0, 0.45)'
    : 'rgba(31, 29, 25, 0.1)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 12;

  roundedRectPath(ctx, boardX, boardY, boardSize, boardSize, 24);
  ctx.fillStyle = palette.bgRecessed;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRectPath(ctx, boardX, boardY, boardSize, boardSize, 24);
  ctx.strokeStyle = palette.borderStrong;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();

  const winLineSet = new Set<number>(data.gameState.winLine ?? []);

  for (let boardIndex = 0; boardIndex < 9; boardIndex++) {
    const subBoard = data.gameState.boards[boardIndex];
    if (!subBoard) continue;
    const row = Math.floor(boardIndex / 3);
    const col = boardIndex % 3;
    const sx = boardX + boardPad + col * (subSize + subGap);
    const sy = boardY + boardPad + row * (subSize + subGap);
    const lastMoveCell =
      data.gameState.lastMove?.boardIndex === boardIndex
        ? data.gameState.lastMove.cellIndex
        : null;

    drawSubBoard(
      ctx,
      subBoard,
      boardIndex,
      sx,
      sy,
      subSize,
      data.pieceStyle,
      lastMoveCell,
      winLineSet.has(boardIndex),
      palette,
    );
  }

  const globalWinner = data.gameState.winner ?? data.matchWinner;
  if (data.gameState.winLine && globalWinner) {
    drawGlobalWinLine(
      ctx,
      data.gameState.winLine,
      globalWinner,
      boardX,
      boardY,
      boardPad,
      subSize,
      subGap,
      palette,
    );
  }
}

function drawPlayerPlaque(
  ctx: CanvasRenderingContext2D,
  options: {
    symbol: Player;
    name: string;
    isWinner: boolean;
    mode: '1v1' | '2v2';
    pieceStyle: PieceStyle;
    x: number;
    y: number;
    w: number;
    h: number;
    align: 'left' | 'right';
  },
  palette: CardPalette,
): void {
  const { symbol, name, isWinner, mode, pieceStyle, x, y, w, h, align } =
    options;
  const color = symbol === 'X' ? palette.xColor : palette.oColor;
  const surface = symbol === 'X' ? palette.xSurface : palette.oSurface;

  ctx.save();
  roundedRectPath(ctx, x, y, w, h, 18);
  ctx.fillStyle = isWinner ? surface : palette.bgSurface;
  ctx.fill();
  ctx.strokeStyle = isWinner
    ? withAlpha(color, 0.72)
    : palette.borderMain;
  ctx.lineWidth = isWinner ? 2 : 1.4;
  ctx.stroke();

  // Pastille X ou O
  const badgeSize = 48;
  const badgeInset = 18;
  const badgeX = align === 'left' ? x + badgeInset : x + w - badgeInset - badgeSize;
  const badgeY = y + (h - badgeSize) / 2;

  roundedRectPath(ctx, badgeX, badgeY, badgeSize, badgeSize, 13);
  ctx.fillStyle = isWinner ? palette.bgBoard : surface;
  ctx.fill();
  ctx.strokeStyle = withAlpha(color, isWinner ? 0.5 : 0.34);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const pieceSize = 30;
  drawPiece(
    ctx,
    symbol,
    badgeX + (badgeSize - pieceSize) / 2,
    badgeY + (badgeSize - pieceSize) / 2,
    pieceSize,
    pieceStyle,
    'badge',
    palette,
  );

  // Nom(s) + statut
  const textX =
    align === 'left'
      ? badgeX + badgeSize + 15
      : badgeX - 15;
  const maxTextW = w - badgeInset - badgeSize - 33;

  ctx.font = `700 22px ${FONT_SANS}`;
  ctx.fillStyle = palette.textPrimary;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitText(ctx, name, maxTextW), textX, y + 42);

  const roleLabel = isWinner
    ? mode === '2v2'
      ? 'Équipe gagnante'
      : 'Vainqueur'
    : mode === '2v2'
      ? `Équipe ${symbol}`
      : `Joueur ${symbol}`;

  ctx.font = `600 14px ${FONT_SANS}`;
  ctx.fillStyle = isWinner ? color : palette.textMuted;
  ctx.fillText(roleLabel, textX, y + 66);

  ctx.restore();
}

function drawEloBadge(
  ctx: CanvasRenderingContext2D,
  eloAfter: number,
  eloDelta: number,
  centerY: number,
  palette: CardPalette,
): void {
  const afterText = `${Math.round(eloAfter)}`;
  const sepText = ' · ';
  const deltaText = `${formatEloDelta(eloDelta)} Elo`;

  const deltaColor =
    eloDelta > 0
      ? palette.xColor
      : eloDelta < 0
        ? palette.dangerColor
        : palette.textSecondary;

  const borderColor =
    eloDelta > 0
      ? withAlpha(palette.xColor, 0.45)
      : eloDelta < 0
        ? withAlpha(palette.dangerColor, 0.42)
        : palette.borderStrong;

  ctx.save();
  ctx.font = `700 20px ${FONT_MONO}`;
  const afterW = ctx.measureText(afterText).width;
  const sepW = ctx.measureText(sepText).width;
  const deltaW = ctx.measureText(deltaText).width;

  const dotDiameter = 9;
  const dotGap = 11;
  const contentW = dotDiameter + dotGap + afterW + sepW + deltaW;
  const padX = 28;
  const pillW = Math.ceil(contentW + padX * 2);
  const pillH = 48;
  const pillX = (CARD_WIDTH - pillW) / 2;
  const pillY = centerY - pillH / 2;

  roundedRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = palette.bgBoard;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  let cursor = pillX + padX;

  // Pastille colorée
  ctx.beginPath();
  ctx.arc(cursor + dotDiameter / 2, centerY, dotDiameter / 2, 0, Math.PI * 2);
  ctx.fillStyle = deltaColor;
  ctx.fill();
  cursor += dotDiameter + dotGap;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = palette.textPrimary;
  ctx.fillText(afterText, cursor, centerY + 0.5);
  cursor += afterW;

  ctx.fillStyle = palette.textMuted;
  ctx.fillText(sepText, cursor, centerY + 0.5);
  cursor += sepW;

  ctx.fillStyle = deltaColor;
  ctx.fillText(deltaText, cursor, centerY + 0.5);

  ctx.restore();
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  data: VictoryCardData,
  palette: CardPalette,
): void {
  const hasElo = data.eloAfter != null && data.eloDelta != null;
  const matchupY = hasElo ? 1044 : 1072;
  const plaqueH = 88;
  const plaqueW = 416;

  const teamXLabel = formatTeamLabel(data.teamXNames, 'X', data.mode);
  const teamOLabel = formatTeamLabel(data.teamONames, 'O', data.mode);

  drawPlayerPlaque(
    ctx,
    {
      symbol: 'X',
      name: teamXLabel,
      isWinner: data.matchWinner === 'X',
      mode: data.mode,
      pieceStyle: data.pieceStyle,
      x: 84,
      y: matchupY,
      w: plaqueW,
      h: plaqueH,
      align: 'left',
    },
    palette,
  );

  drawPlayerPlaque(
    ctx,
    {
      symbol: 'O',
      name: teamOLabel,
      isWinner: data.matchWinner === 'O',
      mode: data.mode,
      pieceStyle: data.pieceStyle,
      x: CARD_WIDTH - 84 - plaqueW,
      y: matchupY,
      w: plaqueW,
      h: plaqueH,
      align: 'right',
    },
    palette,
  );

  // Médaillon VS centré
  const vsCenterX = CARD_WIDTH / 2;
  const vsCenterY = matchupY + plaqueH / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(vsCenterX, vsCenterY, 22, 0, Math.PI * 2);
  ctx.fillStyle = palette.bgBoard;
  ctx.fill();
  ctx.strokeStyle = palette.borderStrong;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = palette.textMuted;
  ctx.font = `700 13.5px ${FONT_MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VS', vsCenterX, vsCenterY + 0.5);
  ctx.restore();

  // Pastille Elo si classé
  if (hasElo && data.eloAfter != null && data.eloDelta != null) {
    drawEloBadge(ctx, data.eloAfter, data.eloDelta, 1184, palette);
  }

  // Mention discrète en bas de page
  const footnoteY = hasElo ? 1264 : 1254;
  const footnote = 'SUPER MORPION · CARTE SOUVENIR';
  ctx.save();
  ctx.font = `600 13px ${FONT_MONO}`;
  ctx.fillStyle = withAlpha(palette.textMuted, 0.78);
  ctx.textBaseline = 'middle';
  const noteW = measureSpacedText(ctx, footnote, 2);
  drawSpacedText(ctx, footnote, CARD_WIDTH / 2, footnoteY, 2, 'center');

  // Filets fins encadrant la mention
  const ruleGap = 18;
  const ruleLen = 36;
  ctx.strokeStyle = withAlpha(palette.borderStrong, 0.65);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(CARD_WIDTH / 2 - noteW / 2 - ruleGap - ruleLen, footnoteY);
  ctx.lineTo(CARD_WIDTH / 2 - noteW / 2 - ruleGap, footnoteY);
  ctx.moveTo(CARD_WIDTH / 2 + noteW / 2 + ruleGap, footnoteY);
  ctx.lineTo(CARD_WIDTH / 2 + noteW / 2 + ruleGap + ruleLen, footnoteY);
  ctx.stroke();
  ctx.restore();
}

/**
 * Génère la carte souvenir au format affiche portrait 1080×1350 sur un Canvas 2D
 * en reprenant les couleurs exactes du thème actif.
 */
export function renderVictoryCardCanvas(data: VictoryCardData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return canvas;
  }

  const palette = readActivePalette();
  const heroTint =
    data.matchWinner === 'X'
      ? palette.xColor
      : data.matchWinner === 'O'
        ? palette.oColor
        : palette.accentActive;

  drawEditorialPaper(ctx, palette, heroTint);
  drawHeader(ctx, data, palette);
  drawHeadlineBanner(ctx, data, palette);
  drawFinalBoard(ctx, data, palette);
  drawFooter(ctx, data, palette);

  return canvas;
}

/** Retourne l'image PNG encodée en Data URL pour un aperçu immédiat. */
export function renderVictoryCardDataUrl(data: VictoryCardData): string {
  return renderVictoryCardCanvas(data).toDataURL('image/png');
}

/** Génère le Blob PNG prêt pour le téléchargement ou le partage natif. */
export function renderVictoryCardBlob(data: VictoryCardData): Promise<Blob | null> {
  const canvas = renderVictoryCardCanvas(data);
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
      return;
    }
    resolve(null);
  });
}

function triggerUrlDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  triggerUrlDownload(objectUrl, filename);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

/** Télécharge la carte souvenir au format PNG (`super-morpion-souvenir.png`). */
export async function downloadVictoryCard(data: VictoryCardData): Promise<void> {
  const blob = await renderVictoryCardBlob(data);
  if (blob) {
    triggerBlobDownload(blob, CARD_FILENAME);
    return;
  }
  triggerUrlDownload(renderVictoryCardDataUrl(data), CARD_FILENAME);
}

/** Indique si le navigateur prend en charge le partage natif de fichiers PNG. */
export function canShareVictoryCardFiles(): boolean {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.share !== 'function' ||
    typeof navigator.canShare !== 'function' ||
    typeof File === 'undefined'
  ) {
    return false;
  }
  try {
    const probe = new File([new Uint8Array(1)], CARD_FILENAME, {
      type: 'image/png',
    });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function buildShareText(data: VictoryCardData): string {
  const teamX = formatTeamLabel(data.teamXNames, 'X', data.mode);
  const teamO = formatTeamLabel(data.teamONames, 'O', data.mode);
  const eloBit =
    data.eloAfter != null && data.eloDelta != null
      ? ` (${Math.round(data.eloAfter)} · ${formatEloDelta(data.eloDelta)} Elo)`
      : '';

  if (data.matchWinner === null) {
    return `Match nul au Super Morpion : ${teamX} vs ${teamO}${eloBit}.`;
  }
  const isLocalWin =
    data.localSymbol !== null && data.matchWinner === data.localSymbol;
  if (isLocalWin) {
    return `Victoire au Super Morpion face à ${data.localSymbol === 'X' ? teamO : teamX}${eloBit} !`;
  }
  return `Partie de Super Morpion : ${teamX} vs ${teamO}${eloBit}.`;
}

/**
 * Partage l'image PNG via Web Share API si disponible, sinon télécharge
 * directement `super-morpion-souvenir.png`.
 */
export async function shareVictoryCard(
  data: VictoryCardData,
): Promise<'shared' | 'downloaded'> {
  const blob = await renderVictoryCardBlob(data);

  if (
    blob &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    typeof File !== 'undefined'
  ) {
    const file = new File([blob], CARD_FILENAME, { type: 'image/png' });
    const sharePayload: ShareData = {
      files: [file],
      title: 'Super Morpion — Carte souvenir',
      text: buildShareText(data),
    };

    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share(sharePayload);
        return 'shared';
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw err;
        }
        // En cas d'échec non volontaire du partage natif, bascule vers le téléchargement
      }
    }
  }

  if (blob) {
    triggerBlobDownload(blob, CARD_FILENAME);
  } else {
    triggerUrlDownload(renderVictoryCardDataUrl(data), CARD_FILENAME);
  }
  return 'downloaded';
}
