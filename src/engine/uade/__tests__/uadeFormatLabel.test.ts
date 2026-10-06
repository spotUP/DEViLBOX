/**
 * "the punisher - title.psa": UADE formatName Unknown (2026-10-06). The module
 * plays (sweep row: player "Professional Sound Artist", formatName ""); the
 * eagleplayer reports no format name, so the label falls back to the player.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { uadeFormatLabel } from '../uadeFormatLabel';

describe('uadeFormatLabel', () => {
  it('names a PSA module by its player when the format name is empty', () => {
    expect(uadeFormatLabel('', 'Professional Sound Artist')).toBe('Professional Sound Artist');
  });
  it('keeps a reported format name, and says Unknown only when UADE reports neither', () => {
    expect(uadeFormatLabel('Jochen Hippel', 'Hippel')).toBe('Jochen Hippel');
    expect(uadeFormatLabel(undefined, undefined)).toBe('Unknown');
  });
  it('the engine builds its metadata label through it', () => {
    expect(readFileSync('src/engine/uade/UADEEngine.ts', 'utf8')).toContain('uadeFormatLabel(data.formatName, data.player)');
  });
});
