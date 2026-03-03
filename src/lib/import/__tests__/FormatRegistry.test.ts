/**
 * FormatRegistry Tests
 *
 * Validates the single source of truth for all 130+ supported music formats.
 */
import { describe, it, expect } from 'vitest';
import {
  FORMAT_REGISTRY,
  getFormatExtensions,
  isSupportedFormat,
  detectFormat,
  getLibopenmptPlayableKeys,
  getNativeOnlyKeys,
} from '../FormatRegistry';

// ─── Registry Integrity ──────────────────────────────────────────────────────

describe('FORMAT_REGISTRY integrity', () => {
  it('contains at least 160 format definitions', () => {
    expect(FORMAT_REGISTRY.length).toBeGreaterThanOrEqual(160);
  });

  it('has unique keys', () => {
    const keys = FORMAT_REGISTRY.map(f => f.key);
    const unique = new Set(keys);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes).toEqual([]);
    expect(unique.size).toBe(keys.length);
  });

  it('every entry has required fields', () => {
    for (const fmt of FORMAT_REGISTRY) {
      expect(fmt.key, `${fmt.key}: missing key`).toBeTruthy();
      expect(fmt.label, `${fmt.key}: missing label`).toBeTruthy();
      expect(fmt.family, `${fmt.key}: missing family`).toBeTruthy();
      expect(fmt.matchMode, `${fmt.key}: missing matchMode`).toBeTruthy();
    }
  });

  it('extension-matched formats have extRegex (unless customDispatch)', () => {
    const extFormats = FORMAT_REGISTRY.filter(
      f => (f.matchMode === 'extension' || f.matchMode === 'both') && !f.customDispatch
    );
    for (const fmt of extFormats) {
      expect(fmt.extRegex, `${fmt.key}: matchMode=${fmt.matchMode} but no extRegex`).toBeTruthy();
    }
  });

  it('prefix-matched formats have prefixes array', () => {
    const prefFormats = FORMAT_REGISTRY.filter(
      f => f.matchMode === 'prefix' || f.matchMode === 'both'
    );
    for (const fmt of prefFormats) {
      expect(fmt.prefixes?.length, `${fmt.key}: matchMode=${fmt.matchMode} but no prefixes`).toBeGreaterThan(0);
    }
  });

  it('every family is a valid FormatFamily value', () => {
    const validFamilies = new Set([
      'midi', 'furnace', 'amiga-native', 'c64-chip',
      'chip-dump', 'pc-tracker', 'libopenmpt', 'uade-only',
    ]);
    for (const fmt of FORMAT_REGISTRY) {
      expect(validFamilies.has(fmt.family), `${fmt.key}: invalid family "${fmt.family}"`).toBe(true);
    }
  });
});

// ─── getFormatExtensions ─────────────────────────────────────────────────────

describe('getFormatExtensions', () => {
  it('returns a sorted array of extensions', () => {
    const exts = getFormatExtensions();
    expect(Array.isArray(exts)).toBe(true);
    expect(exts.length).toBeGreaterThan(100);
    // Check sorted
    const sorted = [...exts].sort();
    expect(exts).toEqual(sorted);
  });

  it('all extensions start with a dot', () => {
    for (const ext of getFormatExtensions()) {
      expect(ext.startsWith('.'), `Extension "${ext}" should start with "."`).toBe(true);
    }
  });

  it('all extensions are lowercase', () => {
    for (const ext of getFormatExtensions()) {
      expect(ext, `Extension "${ext}" should be lowercase`).toBe(ext.toLowerCase());
    }
  });

  it('includes well-known extensions', () => {
    const exts = new Set(getFormatExtensions());
    for (const known of ['.mod', '.xm', '.it', '.s3m', '.sid', '.hvl', '.ahx', '.okt', '.med', '.fur', '.mid', '.vgm', '.ym', '.sap']) {
      expect(exts.has(known), `Missing well-known extension: ${known}`).toBe(true);
    }
  });
});

// ─── isSupportedFormat ───────────────────────────────────────────────────────

describe('isSupportedFormat', () => {
  it('recognizes extension-based formats', () => {
    expect(isSupportedFormat('test.mod')).toBe(true);
    expect(isSupportedFormat('song.xm')).toBe(true);
    expect(isSupportedFormat('music.sid')).toBe(true);
    expect(isSupportedFormat('track.hvl')).toBe(true);
    expect(isSupportedFormat('tune.fur')).toBe(true);
  });

  it('recognizes prefix-based formats (UADE)', () => {
    expect(isSupportedFormat('bd.song')).toBe(true);
    expect(isSupportedFormat('hot.track')).toBe(true);
    expect(isSupportedFormat('cust.module')).toBe(true);
  });

  it('is case-insensitive for extensions', () => {
    expect(isSupportedFormat('file.MOD')).toBe(true);
    expect(isSupportedFormat('file.Xm')).toBe(true);
    expect(isSupportedFormat('file.SID')).toBe(true);
  });

  it('handles paths correctly', () => {
    expect(isSupportedFormat('/path/to/file.mod')).toBe(true);
    expect(isSupportedFormat('C:\\Music\\file.xm')).toBe(true);
  });

  it('rejects unknown formats', () => {
    expect(isSupportedFormat('file.txt')).toBe(false);
    expect(isSupportedFormat('file.mp3')).toBe(false);
    expect(isSupportedFormat('file.wav')).toBe(false);
    expect(isSupportedFormat('file.pdf')).toBe(false);
  });
});

// ─── detectFormat ────────────────────────────────────────────────────────────

describe('detectFormat', () => {
  it('detects extension-based formats', () => {
    const hvl = detectFormat('music.hvl');
    expect(hvl).not.toBeNull();
    expect(hvl!.key).toBe('hvl');

    const fur = detectFormat('track.fur');
    expect(fur).not.toBeNull();
    expect(fur!.key).toBe('fur');
  });

  it('detects prefix-based formats', () => {
    const bd = detectFormat('bd.mysong');
    expect(bd).not.toBeNull();
    expect(bd!.key).toBe('benDaglish');
  });

  it('detects formats with paths', () => {
    const result = detectFormat('/music/archive/song.mod');
    expect(result).not.toBeNull();
    expect(result!.key).toBe('mod');
  });

  it('returns null for unknown formats', () => {
    expect(detectFormat('file.txt')).toBeNull();
    expect(detectFormat('file.mp3')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(detectFormat('file.MOD')?.key).toBe('mod');
    expect(detectFormat('file.SID')?.key).toBe('c64sid');
  });

  // Spot-check specific format families
  it('detects Furnace formats', () => {
    expect(detectFormat('file.fur')?.family).toBe('furnace');
    expect(detectFormat('file.dmf')?.family).toBe('furnace');
  });

  it('detects chip-dump formats', () => {
    expect(detectFormat('file.vgm')?.family).toBe('chip-dump');
    expect(detectFormat('file.ym')?.family).toBe('chip-dump');
    expect(detectFormat('file.nsf')?.family).toBe('chip-dump');
  });

  it('detects C64 SID', () => {
    const sid = detectFormat('file.sid');
    expect(sid).not.toBeNull();
    expect(sid!.family).toBe('c64-chip');
  });

  it('detects MIDI', () => {
    expect(detectFormat('file.mid')?.family).toBe('midi');
    expect(detectFormat('file.midi')?.family).toBe('midi');
  });
});

// ─── getLibopenmptPlayableKeys ───────────────────────────────────────────────

describe('getLibopenmptPlayableKeys', () => {
  it('returns a set of keys', () => {
    const keys = getLibopenmptPlayableKeys();
    expect(keys).toBeInstanceOf(Set);
    expect(keys.size).toBeGreaterThan(0);
  });

  it('includes formats marked libopenmptPlayable', () => {
    const keys = getLibopenmptPlayableKeys();
    // Check that all entries match the flag
    const expected = FORMAT_REGISTRY.filter(f => f.libopenmptPlayable).map(f => f.key);
    for (const k of expected) {
      expect(keys.has(k), `Missing libopenmpt-playable key: ${k}`).toBe(true);
    }
  });

  it('does not include non-playable formats like MIDI', () => {
    const keys = getLibopenmptPlayableKeys();
    expect(keys.has('midi')).toBe(false);
    expect(keys.has('fur')).toBe(false);
  });
});

// ─── getNativeOnlyKeys ───────────────────────────────────────────────────────

describe('getNativeOnlyKeys', () => {
  it('returns a set of keys', () => {
    const keys = getNativeOnlyKeys();
    expect(keys).toBeInstanceOf(Set);
    expect(keys.size).toBeGreaterThan(0);
  });

  it('includes MIDI and Furnace (no UADE fallback)', () => {
    const keys = getNativeOnlyKeys();
    expect(keys.has('midi')).toBe(true);
    expect(keys.has('fur')).toBe(true);
  });
});

// ─── Cross-validation ────────────────────────────────────────────────────────

describe('cross-validation', () => {
  it('every extension from getFormatExtensions matches at least one registry entry', () => {
    const exts = getFormatExtensions();
    const unmatched: string[] = [];
    for (const ext of exts) {
      if (!isSupportedFormat(`test${ext}`)) {
        unmatched.push(ext);
      }
    }
    expect(unmatched).toEqual([]);
  });

  it('detectFormat returns the same format for all extensions of a multi-ext format', () => {
    // MOD has .mod extension
    const modResult = detectFormat('file.mod');
    expect(modResult).not.toBeNull();
    // HVL has both .hvl and .ahx
    const hvl = detectFormat('file.hvl');
    const ahx = detectFormat('file.ahx');
    expect(hvl?.key).toBe(ahx?.key);
  });
});
