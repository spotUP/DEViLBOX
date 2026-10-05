/**
 * One extension, two formats: the content decides, and the loader, the song
 * index and the headless sweep all ask the same function.
 *
 * 2026-10-05 broken-formats sweep: 16 GoatTracker songs were indexed as
 * Zound Monitor (the prefix format's extension form matched first) and
 * rendered through UADE, which refused them; Digital Tracker and Imago
 * Orpheus modules went to AdPlug ("AdPlug could not load"); PiyoPiyo went to
 * the PC-98 PMD parser. Real corpus files throughout.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { detectFormat, detectFormatFromContent } from '../FormatRegistry';

const SONGS = join(process.cwd(), 'public/data/songs');
const head = (rel: string): Uint8Array => new Uint8Array(readFileSync(join(SONGS, rel))).subarray(0, 128);
const keyOf = (rel: string): string | undefined => detectFormatFromContent(rel.split('/').pop()!, head(rel))?.key;

describe('detectFormatFromContent', () => {
  it('a GoatTracker .sng is GoatTracker, not Zound Monitor', () => {
    const rel = 'Goat Tracker Ultra/LMan/$3LMan-SID-Chip-Club-Menu.sng';
    expect(detectFormat('$3LMan-SID-Chip-Club-Menu.sng')?.key).toBe('zoundMonitor'); // by name alone
    expect(keyOf(rel)).toBe('goatTracker');
  });
  it('Digital Tracker (D.T.) and Imago Orpheus (IM10) are not AdPlug', () => {
    expect(keyOf('digital-tracker-dtm/sonic subspace.dtm')).toBe('dtm');
    expect(keyOf('formats/astaris.imf')).toBe('imagoOrpheus');
  });
  it('PiyoPiyo (PMD magic) is not PC-98 PMD, and names itself', () => {
    expect(keyOf('studio-pixel---piyopiyo/obj0176-1.pmd')).toBe('piyoPiyo');
    expect(detectFormat('song.pmd')?.key).toBe('pmd');
  });
  it('StoneTracker, TFM Music Maker and Composer 670 resolve by name', () => {
    expect(keyOf('stonetracker/hypnosphere.spm')).toBe('stoneTracker');
    expect(keyOf('tfm-music-maker/rainstorm.tfe')).toBe('tfmMusicMaker');
    expect(keyOf('composer-670-cdfm/black glass ][ - muzik0.670')).toBe('cdfm67');
  });
  it('FM Tracker goes to libopenmpt: no native parser, not UADE', () => {
    const fmt = detectFormatFromContent('fm dance.fmt', head('fm-tracker/fm dance.fmt'));
    expect(fmt?.key).toBe('fmTracker');
    expect(fmt?.nativeParser).toBeUndefined();
    expect(fmt?.libopenmptFallback).toBe(true);
  });
  it('a name with no collision keeps its name-only answer', () => {
    expect(keyOf('formats/mdat.turrican_bonus')).toBe(detectFormat('mdat.turrican_bonus')?.key);
  });
});
