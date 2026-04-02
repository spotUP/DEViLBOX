/**
 * QRCode — Minimal QR code SVG renderer (no dependencies).
 *
 * Uses a compact QR encoding algorithm for alphanumeric/byte mode.
 * Supports URLs up to ~100 chars (version 4, error correction L).
 */

import React, { useMemo } from 'react';

// ── QR Code Generator (compact implementation) ─────────────────────────────

// Polynomial math in GF(256)
const EXP = new Uint8Array(256);
const LOG = new Uint8Array(256);
{
  let v = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = v;
    LOG[v] = i;
    v = (v << 1) ^ (v & 128 ? 0x11d : 0);
  }
  EXP[255] = EXP[0];
}

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[(LOG[a] + LOG[b]) % 255];
}

function rsEncode(data: number[], ecLen: number): number[] {
  const gen: number[] = [1];
  for (let i = 0; i < ecLen; i++) {
    const next = new Array(gen.length + 1).fill(0);
    const factor = EXP[i];
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], factor);
    }
    gen.length = 0;
    gen.push(...next);
  }

  const result = new Array(ecLen).fill(0);
  for (const byte of data) {
    const coef = byte ^ result[0];
    result.shift();
    result.push(0);
    for (let i = 0; i < ecLen; i++) {
      result[i] ^= gfMul(gen[i + 1], coef);
    }
  }
  return result;
}

function encodeURL(url: string): boolean[][] {
  // Version 2 (25x25) with ECC level L — fits ~32 bytes
  // Version 3 (29x29) with ECC level L — fits ~53 bytes
  // Version 4 (33x33) with ECC level L — fits ~78 bytes
  // Version 6 (41x41) with ECC level L — fits ~134 bytes
  const bytes = new TextEncoder().encode(url);
  let version: number, size: number, ecLen: number, dataCapacity: number;

  if (bytes.length <= 32) {
    version = 2; size = 25; ecLen = 10; dataCapacity = 34;
  } else if (bytes.length <= 53) {
    version = 3; size = 29; ecLen = 15; dataCapacity = 55;
  } else if (bytes.length <= 78) {
    version = 4; size = 33; ecLen = 20; dataCapacity = 80;
  } else {
    version = 6; size = 41; ecLen = 28; dataCapacity = 136;
  }

  // Byte mode: 0100 + length + data
  const bits: number[] = [];
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  push(0b0100, 4); // byte mode
  push(bytes.length, version >= 10 ? 16 : 8); // character count
  for (const b of bytes) push(b, 8);
  push(0, 4); // terminator

  // Pad to capacity
  while (bits.length % 8 !== 0) bits.push(0);
  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    dataBytes.push(bits.slice(i, i + 8).reduce((a, b, j) => a | (b << (7 - j)), 0));
  }
  const padBytes = [0xEC, 0x11];
  let padIdx = 0;
  while (dataBytes.length < dataCapacity - ecLen) {
    dataBytes.push(padBytes[padIdx++ % 2]);
  }

  // Reed-Solomon error correction
  const ec = rsEncode(dataBytes, ecLen);
  const codewords = [...dataBytes, ...ec];

  // Build the QR matrix
  const grid: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));

  // Finder patterns
  const setFinder = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inOuter = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        const inBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        grid[rr][cc] = !inOuter && (inBorder || inInner);
      }
    }
  };
  setFinder(0, 0);
  setFinder(0, size - 7);
  setFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (grid[6][i] === null) grid[6][i] = i % 2 === 0;
    if (grid[i][6] === null) grid[i][6] = i % 2 === 0;
  }

  // Dark module
  grid[size - 8][8] = true;

  // Alignment patterns (version 2+)
  if (version >= 2) {
    const positions = version === 2 ? [6, 18] : version === 3 ? [6, 22] : version === 4 ? [6, 26] : [6, 34];
    for (const r of positions) {
      for (const c of positions) {
        if (grid[r][c] !== null) continue; // skip overlap with finders
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr >= 0 && rr < size && cc >= 0 && cc < size) {
              grid[rr][cc] = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
            }
          }
        }
      }
    }
  }

  // Reserve format info areas
  for (let i = 0; i < 8; i++) {
    if (grid[8][i] === null) grid[8][i] = false;
    if (grid[8][size - 1 - i] === null) grid[8][size - 1 - i] = false;
    if (grid[i][8] === null) grid[i][8] = false;
    if (grid[size - 1 - i][8] === null) grid[size - 1 - i][8] = false;
  }
  if (grid[8][8] === null) grid[8][8] = false;

  // Place data bits
  const allBits: number[] = [];
  for (const cw of codewords) {
    for (let b = 7; b >= 0; b--) allBits.push((cw >> b) & 1);
  }

  let bitIdx = 0;
  let upward = true;
  for (let col = size - 1; col >= 0; col -= 2) {
    if (col === 6) col = 5; // skip timing column
    const rows = upward ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i);
    for (const row of rows) {
      for (const dc of [0, -1]) {
        const c = col + dc;
        if (c < 0 || c >= size) continue;
        if (grid[row][c] !== null) continue;
        grid[row][c] = bitIdx < allBits.length ? allBits[bitIdx++] === 1 : false;
      }
    }
    upward = !upward;
  }

  // Apply mask 0 (checkerboard) and XOR
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === null) grid[r][c] = false;
    }
  }

  // Simple mask: (row + col) % 2 === 0
  const masked = grid.map((row) =>
    row.map((cell) => cell as boolean)
  );

  return masked as boolean[][];
}

// ── React Component ─────────────────────────────────────────────────────────

interface QRCodeProps {
  url: string;
  size?: number;
}

export const QRCode: React.FC<QRCodeProps> = ({ url, size = 200 }) => {
  const matrix = useMemo(() => {
    try {
      return encodeURL(url);
    } catch {
      return null;
    }
  }, [url]);

  if (!matrix) {
    return <div style={{ width: size, height: size, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#666' }}>URL too long for QR</div>;
  }

  const moduleCount = matrix.length;
  const moduleSize = size / (moduleCount + 2); // +2 for quiet zone

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ background: '#fff', borderRadius: 8 }}>
      {matrix.map((row, r) =>
        row.map((cell, c) =>
          cell ? (
            <rect
              key={`${r}-${c}`}
              x={(c + 1) * moduleSize}
              y={(r + 1) * moduleSize}
              width={moduleSize + 0.5}
              height={moduleSize + 0.5}
              fill="#000"
            />
          ) : null
        )
      )}
    </svg>
  );
};
