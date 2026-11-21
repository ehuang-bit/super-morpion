/**
 * Générateur de matrice QR Code conforme à ISO/IEC 18004 (pur TypeScript).
 *
 * - Mode Byte (UTF-8, indicateur `0100`)
 * - Niveau de correction d'erreur M (~15 % de récupération, indicateur `00`)
 * - Versions 1 à 10 (de 21×21 à 57×57 modules, jusqu'à 213 octets UTF-8)
 * - Reed-Solomon sur GF(256) avec polynôme primitif 0x11d
 * - Évaluation complète des 8 masques selon les 4 règles de pénalité standard
 */

export interface QrMatrix {
  size: number;
  modules: boolean[][];
}

interface QrVersionSpec {
  version: number;
  totalCodewords: number;
  ecPerBlock: number;
  numBlocks: number;
  dataCodewords: number;
  maxBytes: number;
  alignmentCenters: readonly number[];
}

/** Indicateur de niveau de correction d'erreur M dans l'info de format (ISO 18004). */
const EC_LEVEL_M_BITS = 0b00;

/** Indicateur de mode Byte (UTF-8). */
const MODE_BYTE_BITS = 0b0100;

/** Masque XOR standard pour l'information de format BCH(15, 5). */
const FORMAT_MASK = 0x5412;

/** Polynôme générateur BCH(15, 5) : x^10 + x^8 + x^5 + x^4 + x^2 + x + 1. */
const FORMAT_POLY = 0x537;

/** Polynôme générateur BCH(18, 6) : x^12 + x^11 + x^10 + x^9 + x^8 + x^5 + x^2 + 1. */
const VERSION_POLY = 0x1f25;

/** Polynôme primitif de GF(256) : x^8 + x^4 + x^3 + x^2 + 1. */
const GF_PRIMITIVE = 0x11d;

/**
 * Spécifications ISO/IEC 18004 (Tables 1, 3, 9 et Annexe E) pour les versions 1 à 10
 * en niveau de correction d'erreur M.
 */
const VERSION_SPECS: readonly QrVersionSpec[] = [
  {
    version: 1,
    totalCodewords: 26,
    ecPerBlock: 10,
    numBlocks: 1,
    dataCodewords: 16,
    maxBytes: 14,
    alignmentCenters: [],
  },
  {
    version: 2,
    totalCodewords: 44,
    ecPerBlock: 16,
    numBlocks: 1,
    dataCodewords: 28,
    maxBytes: 26,
    alignmentCenters: [6, 18],
  },
  {
    version: 3,
    totalCodewords: 70,
    ecPerBlock: 26,
    numBlocks: 1,
    dataCodewords: 44,
    maxBytes: 42,
    alignmentCenters: [6, 22],
  },
  {
    version: 4,
    totalCodewords: 100,
    ecPerBlock: 18,
    numBlocks: 2,
    dataCodewords: 64,
    maxBytes: 62,
    alignmentCenters: [6, 26],
  },
  {
    version: 5,
    totalCodewords: 134,
    ecPerBlock: 24,
    numBlocks: 2,
    dataCodewords: 86,
    maxBytes: 84,
    alignmentCenters: [6, 30],
  },
  {
    version: 6,
    totalCodewords: 172,
    ecPerBlock: 16,
    numBlocks: 4,
    dataCodewords: 108,
    maxBytes: 106,
    alignmentCenters: [6, 34],
  },
  {
    version: 7,
    totalCodewords: 196,
    ecPerBlock: 18,
    numBlocks: 4,
    dataCodewords: 124,
    maxBytes: 122,
    alignmentCenters: [6, 22, 38],
  },
  {
    version: 8,
    totalCodewords: 242,
    ecPerBlock: 22,
    numBlocks: 4,
    dataCodewords: 154,
    maxBytes: 152,
    alignmentCenters: [6, 24, 42],
  },
  {
    version: 9,
    totalCodewords: 292,
    ecPerBlock: 22,
    numBlocks: 5,
    dataCodewords: 182,
    maxBytes: 180,
    alignmentCenters: [6, 26, 46],
  },
  {
    version: 10,
    totalCodewords: 346,
    ecPerBlock: 26,
    numBlocks: 5,
    dataCodewords: 216,
    maxBytes: 213,
    alignmentCenters: [6, 28, 50],
  },
];

/** Capacité maximale en octets UTF-8 (Version 10, niveau M). */
export const MAX_QR_BYTE_LENGTH =
  VERSION_SPECS[VERSION_SPECS.length - 1].maxBytes;

// Tables exponentielle et logarithme dans GF(256) (polynôme primitif 0x11d)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let value = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = value;
    GF_LOG[value] = i;
    value <<= 1;
    if (value & 0x100) {
      value ^= GF_PRIMITIVE;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/**
 * Calcule le polynôme générateur Reed-Solomon de degré `degree` :
 * g(x) = Π_{i=0}^{degree-1} (x - α^i).
 * Retourne les coefficients du degré le plus élevé au terme constant.
 */
function buildRsGenerator(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

/** Calcule les `ecLen` octets de correction Reed-Solomon pour un bloc de données. */
function computeRsEcc(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = buildRsGenerator(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    for (let j = 0; j < ecLen - 1; j++) {
      rem[j] = rem[j + 1] ^ gfMul(gen[j + 1], factor);
    }
    rem[ecLen - 1] = gfMul(gen[ecLen], factor);
  }
  return rem;
}

/** Sélectionne la plus petite version (1..10) pouvant contenir `byteLength` octets en EC-M. */
function selectVersionSpec(byteLength: number): QrVersionSpec {
  for (const spec of VERSION_SPECS) {
    if (byteLength <= spec.maxBytes) {
      return spec;
    }
  }
  throw new RangeError(
    `Texte trop long pour un QR Code version 10 EC-M (${byteLength} octets UTF-8, maximum ${MAX_QR_BYTE_LENGTH}).`,
  );
}

/** Construit le flux de mots de code de données (mode Byte, terminaison, bourrage 0xEC/0x11). */
function encodeDataCodewords(
  bytes: Uint8Array,
  spec: QrVersionSpec,
): Uint8Array {
  const capacityBits = spec.dataCodewords * 8;
  const bits: number[] = [];

  const pushBits = (value: number, bitCount: number) => {
    for (let i = bitCount - 1; i >= 0; i--) {
      bits.push((value >>> i) & 1);
    }
  };

  // En-tête mode Byte (4 bits) + compteur de caractères (8 bits pour v1..9, 16 bits pour v10)
  pushBits(MODE_BYTE_BITS, 4);
  pushBits(bytes.length, spec.version <= 9 ? 8 : 16);

  // Charge utile UTF-8
  for (let i = 0; i < bytes.length; i++) {
    pushBits(bytes[i], 8);
  }

  // Terminateur (jusqu'à 4 bits à 0)
  const terminatorLen = Math.min(4, capacityBits - bits.length);
  for (let i = 0; i < terminatorLen; i++) {
    bits.push(0);
  }

  // Alignement sur une frontière d'octet
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  // Conversion en octets + remplissage alterné 0xEC / 0x11
  const out = new Uint8Array(spec.dataCodewords);
  const byteCount = bits.length / 8;
  for (let i = 0; i < byteCount; i++) {
    let b = 0;
    for (let bit = 0; bit < 8; bit++) {
      b = (b << 1) | bits[i * 8 + bit];
    }
    out[i] = b;
  }

  let padToggle = true;
  for (let i = byteCount; i < spec.dataCodewords; i++) {
    out[i] = padToggle ? 0xec : 0x11;
    padToggle = !padToggle;
  }

  return out;
}

/** Découpe les données en blocs, calcule les ECC Reed-Solomon et entrelace le flux final. */
function buildInterleavedCodewords(
  data: Uint8Array,
  spec: QrVersionSpec,
): Uint8Array {
  const { totalCodewords, ecPerBlock, numBlocks } = spec;
  const numLongBlocks = totalCodewords % numBlocks;
  const numShortBlocks = numBlocks - numLongBlocks;
  const shortDataLen = Math.floor(totalCodewords / numBlocks) - ecPerBlock;

  const dataBlocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];
  let offset = 0;

  for (let b = 0; b < numBlocks; b++) {
    const blockDataLen = b < numShortBlocks ? shortDataLen : shortDataLen + 1;
    const blockData = data.subarray(offset, offset + blockDataLen);
    offset += blockDataLen;
    dataBlocks.push(blockData);
    eccBlocks.push(computeRsEcc(blockData, ecPerBlock));
  }

  const result = new Uint8Array(totalCodewords);
  let writeIdx = 0;
  const maxDataLen = numLongBlocks > 0 ? shortDataLen + 1 : shortDataLen;

  // Entrelacement des octets de données
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i < dataBlocks[b].length) {
        result[writeIdx++] = dataBlocks[b][i];
      }
    }
  }

  // Entrelacement des octets de correction d'erreur
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < numBlocks; b++) {
      result[writeIdx++] = eccBlocks[b][i];
    }
  }

  return result;
}

/** Calcule l'information de format 15 bits BCH(15, 5) masquée par 0x5412. */
function computeFormatInfo(mask: number): number {
  const data = (EC_LEVEL_M_BITS << 3) | (mask & 0b111);
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ (((rem >>> 9) & 1) * FORMAT_POLY);
  }
  return (((data << 10) | rem) ^ FORMAT_MASK) & 0x7fff;
}

/** Calcule l'information de version 18 bits BCH(18, 6) pour les versions >= 7. */
function computeVersionInfo(version: number): number {
  let rem = version & 0x3f;
  for (let i = 0; i < 12; i++) {
    rem = (rem << 1) ^ (((rem >>> 11) & 1) * VERSION_POLY);
  }
  return ((version << 12) | rem) & 0x3ffff;
}

function createGrid(size: number): boolean[][] {
  return Array.from({ length: size }, () => Array<boolean>(size).fill(false));
}

function drawFormatInfo(
  modules: boolean[][],
  isFunction: boolean[][],
  mask: number,
): void {
  const size = modules.length;
  const bits = computeFormatInfo(mask);

  const setModule = (row: number, col: number, dark: boolean) => {
    modules[row][col] = dark;
    isFunction[row][col] = true;
  };

  // Première copie (autour du motif de recherche haut-gauche)
  for (let i = 0; i <= 5; i++) {
    setModule(i, 8, ((bits >>> i) & 1) !== 0);
  }
  setModule(7, 8, ((bits >>> 6) & 1) !== 0);
  setModule(8, 8, ((bits >>> 7) & 1) !== 0);
  setModule(8, 7, ((bits >>> 8) & 1) !== 0);
  for (let i = 9; i <= 14; i++) {
    setModule(8, 14 - i, ((bits >>> i) & 1) !== 0);
  }

  // Deuxième copie (bas-gauche et haut-droite)
  for (let i = 0; i <= 7; i++) {
    setModule(8, size - 1 - i, ((bits >>> i) & 1) !== 0);
  }
  for (let i = 8; i <= 14; i++) {
    setModule(size - 15 + i, 8, ((bits >>> i) & 1) !== 0);
  }

  // Module sombre fixe : (4 * version + 9, 8) = (size - 8, 8)
  setModule(size - 8, 8, true);
}

function drawVersionInfo(
  modules: boolean[][],
  isFunction: boolean[][],
  version: number,
): void {
  if (version < 7) return;
  const size = modules.length;
  const bits = computeVersionInfo(version);

  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) !== 0;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    // Bloc haut-droite (6 lignes × 3 colonnes)
    modules[b][a] = dark;
    isFunction[b][a] = true;
    // Bloc bas-gauche (3 lignes × 6 colonnes)
    modules[a][b] = dark;
    isFunction[a][b] = true;
  }
}

/** Place tous les motifs fonctionnels (synchronisation, recherche, alignement, format, version). */
function initFunctionPatterns(spec: QrVersionSpec): {
  modules: boolean[][];
  isFunction: boolean[][];
} {
  const size = spec.version * 4 + 17;
  const modules = createGrid(size);
  const isFunction = createGrid(size);

  // Motifs de synchronisation (ligne 6 et colonne 6)
  for (let i = 0; i < size; i++) {
    const dark = i % 2 === 0;
    modules[6][i] = dark;
    isFunction[6][i] = true;
    modules[i][6] = dark;
    isFunction[i][6] = true;
  }

  // Motifs de recherche 7×7 + séparateurs blancs de 1 module
  const finderOrigins: readonly [number, number][] = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];
  for (const [originRow, originCol] of finderOrigins) {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const r = originRow + dy;
        const c = originCol + dx;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        isFunction[r][c] = true;
        if (dy === -1 || dy === 7 || dx === -1 || dx === 7) {
          modules[r][c] = false;
        } else {
          const dist = Math.max(Math.abs(dy - 3), Math.abs(dx - 3));
          modules[r][c] = dist !== 2;
        }
      }
    }
  }

  // Motifs d'alignement 5×5 (versions >= 2)
  const centers = spec.alignmentCenters;
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      const cy = centers[i];
      const cx = centers[j];
      // Ignore les 3 coins recouverts par les motifs de recherche
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0)
      ) {
        continue;
      }
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const r = cy + dy;
          const c = cx + dx;
          isFunction[r][c] = true;
          modules[r][c] = Math.max(Math.abs(dy), Math.abs(dx)) !== 1;
        }
      }
    }
  }

  // Réservation des emplacements d'information de format et du module sombre
  drawFormatInfo(modules, isFunction, 0);

  // Information de version (versions >= 7)
  drawVersionInfo(modules, isFunction, spec.version);

  return { modules, isFunction };
}

/** Place les bits de mots de code en zigzag de droite à gauche (en sautant la colonne 6). */
function placeCodewords(
  modules: boolean[][],
  isFunction: boolean[][],
  codewords: Uint8Array,
): void {
  const size = modules.length;
  const totalBits = codewords.length * 8;
  let bitIdx = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (let dx = 0; dx < 2; dx++) {
        const col = right - dx;
        if (isFunction[row][col]) continue;
        let dark = false;
        if (bitIdx < totalBits) {
          dark = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
        }
        modules[row][col] = dark;
        bitIdx++;
      }
    }
    upward = !upward;
  }
}

function shouldFlipMask(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function applyMaskCopy(
  base: boolean[][],
  isFunction: boolean[][],
  mask: number,
): boolean[][] {
  const size = base.length;
  const masked = createGrid(size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const value = base[r][c];
      masked[r][c] =
        !isFunction[r][c] && shouldFlipMask(mask, r, c) ? !value : value;
    }
  }
  drawFormatInfo(masked, isFunction, mask);
  return masked;
}

/** Motifs de pénalité N3 (1:1:3:1:1 précédé ou suivi de 4 modules clairs). */
const FINDER_LIKE_A = [
  true,
  false,
  true,
  true,
  true,
  false,
  true,
  false,
  false,
  false,
  false,
] as const;
const FINDER_LIKE_B = [
  false,
  false,
  false,
  false,
  true,
  false,
  true,
  true,
  true,
  false,
  true,
] as const;

/** Évalue le score de pénalité ISO/IEC 18004 (règles N1, N2, N3 et N4). */
function evaluatePenalty(modules: boolean[][]): number {
  const size = modules.length;
  let penalty = 0;

  // N1 : suites d'au moins 5 modules identiques sur une ligne ou une colonne
  for (let r = 0; r < size; r++) {
    let runColor = modules[r][0];
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (modules[r][c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = modules[r][c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }

  for (let c = 0; c < size; c++) {
    let runColor = modules[0][c];
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (modules[r][c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = modules[r][c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }

  // N2 : blocs 2×2 de même couleur (+3 chacun)
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const color = modules[r][c];
      if (
        color === modules[r][c + 1] &&
        color === modules[r + 1][c] &&
        color === modules[r + 1][c + 1]
      ) {
        penalty += 3;
      }
    }
  }

  // N3 : motifs ressemblant au motif de recherche sur les lignes et les colonnes (+40 chacun)
  const limit = size - 11;
  for (let r = 0; r < size; r++) {
    const row = modules[r];
    for (let c = 0; c <= limit; c++) {
      let matchA = true;
      let matchB = true;
      for (let k = 0; k < 11; k++) {
        if (row[c + k] !== FINDER_LIKE_A[k]) matchA = false;
        if (row[c + k] !== FINDER_LIKE_B[k]) matchB = false;
        if (!matchA && !matchB) break;
      }
      if (matchA) penalty += 40;
      if (matchB) penalty += 40;
    }
  }

  for (let c = 0; c < size; c++) {
    for (let r = 0; r <= limit; r++) {
      let matchA = true;
      let matchB = true;
      for (let k = 0; k < 11; k++) {
        if (modules[r + k][c] !== FINDER_LIKE_A[k]) matchA = false;
        if (modules[r + k][c] !== FINDER_LIKE_B[k]) matchB = false;
        if (!matchA && !matchB) break;
      }
      if (matchA) penalty += 40;
      if (matchB) penalty += 40;
    }
  }

  // N4 : équilibre entre modules sombres et clairs autour de 50 %
  let darkCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) darkCount++;
    }
  }
  const total = size * size;
  const k = Math.max(
    0,
    Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1,
  );
  penalty += k * 10;

  return penalty;
}

/**
 * Génère la matrice booléenne d'un QR Code conforme ISO/IEC 18004 (mode Byte UTF-8,
 * correction d'erreur M, versions 1 à 10) avec sélection automatique du meilleur masque.
 */
export function generateQrMatrix(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  const spec = selectVersionSpec(bytes.length);
  const dataCodewords = encodeDataCodewords(bytes, spec);
  const finalCodewords = buildInterleavedCodewords(dataCodewords, spec);

  const { modules: baseModules, isFunction } = initFunctionPatterns(spec);
  placeCodewords(baseModules, isFunction, finalCodewords);

  let bestModules = applyMaskCopy(baseModules, isFunction, 0);
  let bestPenalty = evaluatePenalty(bestModules);

  for (let mask = 1; mask < 8; mask++) {
    const candidate = applyMaskCopy(baseModules, isFunction, mask);
    const penalty = evaluatePenalty(candidate);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestModules = candidate;
    }
  }

  return {
    size: bestModules.length,
    modules: bestModules,
  };
}
