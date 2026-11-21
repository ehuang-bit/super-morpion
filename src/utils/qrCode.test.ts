import { describe, expect, it } from 'vitest';
import {
  MAX_QR_BYTE_LENGTH,
  generateQrMatrix,
  type QrMatrix,
} from './qrCode';

/** Tables ISO/IEC 18004 EC-M utilisées par le vérificateur indépendant de décodage. */
const TEST_SPECS: Record<
  number,
  {
    totalCodewords: number;
    ecPerBlock: number;
    numBlocks: number;
    alignment: readonly number[];
  }
> = {
  1: { totalCodewords: 26, ecPerBlock: 10, numBlocks: 1, alignment: [] },
  2: { totalCodewords: 44, ecPerBlock: 16, numBlocks: 1, alignment: [6, 18] },
  3: { totalCodewords: 70, ecPerBlock: 26, numBlocks: 1, alignment: [6, 22] },
  4: { totalCodewords: 100, ecPerBlock: 18, numBlocks: 2, alignment: [6, 26] },
  5: { totalCodewords: 134, ecPerBlock: 24, numBlocks: 2, alignment: [6, 30] },
  6: { totalCodewords: 172, ecPerBlock: 16, numBlocks: 4, alignment: [6, 34] },
  7: { totalCodewords: 196, ecPerBlock: 18, numBlocks: 4, alignment: [6, 22, 38] },
  8: { totalCodewords: 242, ecPerBlock: 22, numBlocks: 4, alignment: [6, 24, 42] },
  9: { totalCodewords: 292, ecPerBlock: 22, numBlocks: 5, alignment: [6, 26, 46] },
  10: { totalCodewords: 346, ecPerBlock: 26, numBlocks: 5, alignment: [6, 28, 50] },
};

/** Information de format attendue (ISO 18004 Annexe C, niveau M, masques 0..7). */
const EXPECTED_FORMAT_M: readonly number[] = [
  0x5412, // masque 0
  0x5125, // masque 1
  0x5e7c, // masque 2
  0x5b4b, // masque 3
  0x45f9, // masque 4
  0x40ce, // masque 5
  0x4f97, // masque 6
  0x4aa0, // masque 7
];

/** Information de version attendue (ISO 18004 Annexe D, versions 7..10). */
const EXPECTED_VERSION_BITS: Record<number, number> = {
  7: 0x07c94,
  8: 0x085bc,
  9: 0x09a99,
  10: 0x0a4d3,
};

function gfMulTest(a: number, b: number): number {
  let x = a;
  let y = b;
  let res = 0;
  while (y > 0) {
    if (y & 1) res ^= x;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
    y >>>= 1;
  }
  return res;
}

function gfPowAlpha(exp: number): number {
  let val = 1;
  for (let i = 0; i < exp; i++) {
    val <<= 1;
    if (val & 0x100) val ^= 0x11d;
  }
  return val;
}

/** Évalue le polynôme d'un bloc complet (données + ECC) en α^root : doit valoir 0. */
function evalSyndrome(block: Uint8Array, rootExp: number): number {
  const alpha = gfPowAlpha(rootExp);
  let acc = 0;
  for (let i = 0; i < block.length; i++) {
    acc = gfMulTest(acc, alpha) ^ block[i];
  }
  return acc;
}

/** Lit les deux copies de l'information de format 15 bits depuis la matrice. */
function readFormatCopies(matrix: QrMatrix): [number, number] {
  const { size, modules } = matrix;
  let copy1 = 0;
  for (let i = 0; i <= 5; i++) {
    if (modules[i][8]) copy1 |= 1 << i;
  }
  if (modules[7][8]) copy1 |= 1 << 6;
  if (modules[8][8]) copy1 |= 1 << 7;
  if (modules[8][7]) copy1 |= 1 << 8;
  for (let i = 9; i <= 14; i++) {
    if (modules[8][14 - i]) copy1 |= 1 << i;
  }

  let copy2 = 0;
  for (let i = 0; i <= 7; i++) {
    if (modules[8][size - 1 - i]) copy2 |= 1 << i;
  }
  for (let i = 8; i <= 14; i++) {
    if (modules[size - 15 + i][8]) copy2 |= 1 << i;
  }

  return [copy1, copy2];
}

/** Lit les deux copies de l'information de version 18 bits (versions >= 7). */
function readVersionCopies(matrix: QrMatrix): [number, number] {
  const { size, modules } = matrix;
  let topRight = 0;
  let bottomLeft = 0;
  for (let i = 0; i < 18; i++) {
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    if (modules[b][a]) topRight |= 1 << i;
    if (modules[a][b]) bottomLeft |= 1 << i;
  }
  return [topRight, bottomLeft];
}

function isFunctionModule(version: number, r: number, c: number): boolean {
  const size = version * 4 + 17;
  // Motifs de recherche + séparateurs + format
  if (r <= 8 && c <= 8) return true;
  if (r <= 8 && c >= size - 8) return true;
  if (r >= size - 8 && c <= 8) return true;
  // Synchronisation
  if (r === 6 || c === 6) return true;
  // Blocs d'information de version
  if (version >= 7) {
    if (r < 6 && c >= size - 11 && c <= size - 9) return true;
    if (c < 6 && r >= size - 11 && r <= size - 9) return true;
  }
  // Motifs d'alignement
  const centers = TEST_SPECS[version].alignment;
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0)
      ) {
        continue;
      }
      if (Math.abs(r - centers[i]) <= 2 && Math.abs(c - centers[j]) <= 2) {
        return true;
      }
    }
  }
  return false;
}

function maskBit(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0;
    case 1:
      return r % 2 === 0;
    case 2:
      return c % 3 === 0;
    case 3:
      return (r + c) % 3 === 0;
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default:
      throw new Error(`Masque invalide : ${mask}`);
  }
}

/**
 * Décode intégralement la matrice (format, démasquage, zigzag, désentrelacement,
 * vérification des syndromes Reed-Solomon de chaque bloc, et décodage UTF-8).
 */
function decodeAndVerifyQr(matrix: QrMatrix): { version: number; text: string } {
  const { size, modules } = matrix;
  const version = (size - 17) / 4;
  expect(Number.isInteger(version)).toBe(true);
  expect(version).toBeGreaterThanOrEqual(1);
  expect(version).toBeLessThanOrEqual(10);

  const [copy1, copy2] = readFormatCopies(matrix);
  expect(copy1).toBe(copy2);
  const mask = EXPECTED_FORMAT_M.indexOf(copy1);
  expect(mask).toBeGreaterThanOrEqual(0);

  if (version >= 7) {
    const [vTopRight, vBottomLeft] = readVersionCopies(matrix);
    expect(vTopRight).toBe(EXPECTED_VERSION_BITS[version]);
    expect(vBottomLeft).toBe(EXPECTED_VERSION_BITS[version]);
  }

  // Lecture zigzag des bits démasqués
  const bits: number[] = [];
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let dx = 0; dx < 2; dx++) {
        const c = right - dx;
        if (isFunctionModule(version, r, c)) continue;
        const raw = modules[r][c];
        const unmasked = maskBit(mask, r, c) ? !raw : raw;
        bits.push(unmasked ? 1 : 0);
      }
    }
    upward = !upward;
  }

  const spec = TEST_SPECS[version];
  expect(Math.floor(bits.length / 8)).toBe(spec.totalCodewords);

  const codewords = new Uint8Array(spec.totalCodewords);
  for (let i = 0; i < spec.totalCodewords; i++) {
    let val = 0;
    for (let b = 0; b < 8; b++) {
      val = (val << 1) | bits[i * 8 + b];
    }
    codewords[i] = val;
  }

  // Désentrelacement des blocs de données et d'ECC
  const numLong = spec.totalCodewords % spec.numBlocks;
  const numShort = spec.numBlocks - numLong;
  const shortDataLen =
    Math.floor(spec.totalCodewords / spec.numBlocks) - spec.ecPerBlock;
  const maxDataLen = numLong > 0 ? shortDataLen + 1 : shortDataLen;

  const dataBlocks = Array.from({ length: spec.numBlocks }, (_, b) =>
    new Uint8Array(b < numShort ? shortDataLen : shortDataLen + 1),
  );
  const eccBlocks = Array.from(
    { length: spec.numBlocks },
    () => new Uint8Array(spec.ecPerBlock),
  );

  let readIdx = 0;
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < spec.numBlocks; b++) {
      if (i < dataBlocks[b].length) {
        dataBlocks[b][i] = codewords[readIdx++];
      }
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (let b = 0; b < spec.numBlocks; b++) {
      eccBlocks[b][i] = codewords[readIdx++];
    }
  }
  expect(readIdx).toBe(spec.totalCodewords);

  // Vérification de tous les syndromes Reed-Solomon pour chaque bloc
  const allData: number[] = [];
  for (let b = 0; b < spec.numBlocks; b++) {
    const fullBlock = new Uint8Array(
      dataBlocks[b].length + eccBlocks[b].length,
    );
    fullBlock.set(dataBlocks[b], 0);
    fullBlock.set(eccBlocks[b], dataBlocks[b].length);
    for (let root = 0; root < spec.ecPerBlock; root++) {
      expect(evalSyndrome(fullBlock, root)).toBe(0);
    }
    for (const byte of dataBlocks[b]) {
      allData.push(byte);
    }
  }

  // Décodage du flux binaire en mode Byte
  const dataBits: number[] = [];
  for (const byte of allData) {
    for (let i = 7; i >= 0; i--) {
      dataBits.push((byte >>> i) & 1);
    }
  }

  let cursor = 0;
  const take = (n: number): number => {
    let val = 0;
    for (let i = 0; i < n; i++) {
      val = (val << 1) | dataBits[cursor++];
    }
    return val;
  };

  expect(take(4)).toBe(0b0100); // Mode Byte
  const countBits = version <= 9 ? 8 : 16;
  const byteLen = take(countBits);
  const payload = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    payload[i] = take(8);
  }

  return {
    version,
    text: new TextDecoder().decode(payload),
  };
}

function expectFinderPatternAt(
  matrix: QrMatrix,
  originRow: number,
  originCol: number,
): void {
  const expected7x7 = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];
  for (let dy = 0; dy < 7; dy++) {
    for (let dx = 0; dx < 7; dx++) {
      expect(matrix.modules[originRow + dy][originCol + dx]).toBe(
        expected7x7[dy][dx] === 1,
      );
    }
  }
}

describe('generateQrMatrix (ISO/IEC 18004, EC-M, Versions 1..10)', () => {
  it('respecte la géométrie standard (taille 4v+17, 3 motifs de recherche, séparateurs, synchronisation, module sombre)', () => {
    const url = 'https://super-morpion.app/room/A7K2P9';
    const qr = generateQrMatrix(url);

    // 36 octets -> Version 3 (capacité 42 octets) -> taille 29×29
    expect(qr.size).toBe(29);
    expect(qr.modules).toHaveLength(29);
    for (const row of qr.modules) {
      expect(row).toHaveLength(29);
    }

    // 3 motifs de recherche 7×7 aux coins
    expectFinderPatternAt(qr, 0, 0);
    expectFinderPatternAt(qr, 0, qr.size - 7);
    expectFinderPatternAt(qr, qr.size - 7, 0);

    // Séparateurs blancs autour des motifs de recherche
    for (let i = 0; i < 8; i++) {
      expect(qr.modules[7][i]).toBe(false);
      expect(qr.modules[i][7]).toBe(false);
      expect(qr.modules[7][qr.size - 1 - i]).toBe(false);
      expect(qr.modules[i][qr.size - 8]).toBe(false);
      expect(qr.modules[qr.size - 8][i]).toBe(false);
      expect(qr.modules[qr.size - 1 - i][7]).toBe(false);
    }

    // Motifs de synchronisation (ligne 6 et colonne 6 entre les séparateurs)
    for (let i = 8; i < qr.size - 8; i++) {
      expect(qr.modules[6][i]).toBe(i % 2 === 0);
      expect(qr.modules[i][6]).toBe(i % 2 === 0);
    }

    // Module sombre fixe : (4*v + 9, 8) = (size - 8, 8)
    expect(qr.modules[qr.size - 8][8]).toBe(true);
  });

  it('est totalement déterministe pour une même entrée', () => {
    const url = 'https://super-morpion.example/room/X9M4Q2';
    const first = generateQrMatrix(url);
    const second = generateQrMatrix(url);
    expect(second).toEqual(first);
  });

  it('encode et vérifie les syndromes Reed-Solomon sur toutes les versions 1 à 10 (y compris URLs courtes et longues ~160 caractères)', () => {
    const cases: { label: string; text: string; expectedVersion: number }[] = [
      { label: 'chaîne vide', text: '', expectedVersion: 1 },
      { label: 'code court (v1)', text: '/room/ABC123', expectedVersion: 1 },
      {
        label: 'URL locale (v2)',
        text: 'http://localhost:5173/r/1',
        expectedVersion: 2,
      },
      {
        label: 'URL de salon standard (v3)',
        text: 'https://super-morpion.app/room/K8T3N5',
        expectedVersion: 3,
      },
      {
        label: 'URL moyenne (v4)',
        text: 'https://super-morpion.netlify.app/room/K8T3N5?ref=invite',
        expectedVersion: 4,
      },
      {
        label: 'URL avec paramètres (v5)',
        text: 'https://super-morpion.netlify.app/room/K8T3N5?cadence=rapid&invite=atelier-75',
        expectedVersion: 5,
      },
      {
        label: 'URL étendue (v6)',
        text: `https://super-morpion.netlify.app/room/K8T3N5?${'a=1&'.repeat(12)}end=1`,
        expectedVersion: 6,
      },
      {
        label: 'URL longue v7 (infos de version BCH 18,6)',
        text: `https://super-morpion.netlify.app/room/K8T3N5?token=${'x'.repeat(65)}`,
        expectedVersion: 7,
      },
      {
        label: 'URL longue v8 (~140 caractères)',
        text: `https://super-morpion.netlify.app/room/K8T3N5?token=${'y'.repeat(88)}`,
        expectedVersion: 8,
      },
      {
        label: 'URL longue v9 (~165 caractères)',
        text: `https://super-morpion.netlify.app/room/K8T3N5?token=${'z'.repeat(113)}`,
        expectedVersion: 9,
      },
      {
        label: 'URL très longue v10 (compteur 16 bits, limite 213 octets)',
        text: `https://super-morpion.netlify.app/room/K8T3N5?token=${'w'.repeat(161)}`,
        expectedVersion: 10,
      },
    ];

    for (const item of cases) {
      const qr = generateQrMatrix(item.text);
      const expectedSize = item.expectedVersion * 4 + 17;
      expect(qr.size, item.label).toBe(expectedSize);

      // Vérification complète : format, version, démasquage, syndromes RS et texte décodé
      const decoded = decodeAndVerifyQr(qr);
      expect(decoded.version, item.label).toBe(item.expectedVersion);
      expect(decoded.text, item.label).toBe(item.text);
    }
  });

  it('gère correctement les caractères UTF-8 accentués', () => {
    const text = 'https://super-morpion.fr/salon/ÉÉÇ42?défi=rapide';
    const qr = generateQrMatrix(text);
    const decoded = decodeAndVerifyQr(qr);
    expect(decoded.text).toBe(text);
  });

  it('place les motifs d’alignement 5×5 aux centres attendus pour les versions >= 2', () => {
    // Version 7 : centres [6, 22, 38] -> 6 motifs d'alignement (hors 3 coins)
    const qr = generateQrMatrix('a'.repeat(120));
    expect(qr.size).toBe(45);
    const validCenters: readonly [number, number][] = [
      [6, 22],
      [22, 6],
      [22, 22],
      [22, 38],
      [38, 22],
      [38, 38],
    ];
    for (const [cy, cx] of validCenters) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const expected = Math.max(Math.abs(dy), Math.abs(dx)) !== 1;
          expect(qr.modules[cy + dy][cx + dx]).toBe(expected);
        }
      }
    }
  });

  it('rejette proprement les chaînes dépassant la capacité maximale (213 octets UTF-8)', () => {
    expect(MAX_QR_BYTE_LENGTH).toBe(213);
    expect(() => generateQrMatrix('a'.repeat(MAX_QR_BYTE_LENGTH))).not.toThrow();
    expect(() => generateQrMatrix('a'.repeat(MAX_QR_BYTE_LENGTH + 1))).toThrow(
      RangeError,
    );
    // Vérifie aussi que le dépassement est mesuré en octets UTF-8 (é = 2 octets)
    expect(() => generateQrMatrix('é'.repeat(107))).toThrow(RangeError);
  });
});
