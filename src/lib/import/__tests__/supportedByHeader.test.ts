/**
 * Regression: extensionless SunTronic V1.3 songs must be droppable.
 *
 * Many "Delirium" songs ship without a .src/.sun/.tsm/.pc extension (Lightforce,
 * tank, paradroid.final, newest_play, playroutine…). The drag-drop main-file gate
 * (GlobalDragDropHandler.pickMainFile) and the loader gate (UnifiedFileLoader.
 * loadFile) both reject unknown-name files unless `isSupportedByHeader` recognises
 * the content. Reverting that content fallback strands every extensionless song.
 *
 * This asserts the shared sniff both gates depend on: a real V1.3 header is
 * accepted, and unrelated bytes are rejected (no drop theft).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isSupportedByHeader } from '@/lib/import/FormatRegistry';

const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');

describe('isSupportedByHeader — content fallback for extensionless songs', () => {
  it('accepts a real SunTronic V1.3 header (only the first 0x200 bytes)', () => {
    const full = new Uint8Array(readFileSync(join(CORPUS, 'mule.src')));
    // The drop handler only reads a header slice — prove that suffices.
    expect(isSupportedByHeader(full.slice(0, 0x200))).toBe(true);
    expect(isSupportedByHeader(full)).toBe(true);
  });

  it('rejects unrelated / junk buffers (never steals a drop)', () => {
    expect(isSupportedByHeader(new Uint8Array(0x200))).toBe(false); // all-zero
    const txt = new TextEncoder().encode('this is not a module '.repeat(32));
    expect(isSupportedByHeader(txt)).toBe(false);
    expect(isSupportedByHeader(new Uint8Array([1, 2, 3]))).toBe(false); // too short
  });
});
