// src/lib/export/__tests__/nativeExportRouter.test.ts
/**
 * nativeExportRouter — single-source-of-truth dispatch tests.
 *
 * (a) Every `layoutFormatId` in the dispatch map resolves to a real module whose
 *     named export exists — guards against the stale-duplicate class of bug that
 *     originally motivated this router (the MCP copy had missing/renamed branches).
 *
 * (b) Regression for "MCP export of an edited chip-RAM format returned the
 *     UN-edited original bytes": with a live UADE engine and a song carrying a
 *     `uadePatternLayout` (but no dedicated exporter), the router MUST fall back
 *     to `UADEChipEditor.readEditedModule` so live pattern edits are captured —
 *     the output must differ from the original module bytes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LAYOUT_EXPORTERS } from '../nativeExportRouter';
import type { TrackerSong } from '@engine/TrackerReplayer';

describe('nativeExportRouter — LAYOUT_EXPORTERS dispatch map', () => {
  it('has at least the known chip-RAM layout exporters', () => {
    // Sanity floor so an accidental map truncation is caught.
    expect(Object.keys(LAYOUT_EXPORTERS).length).toBeGreaterThanOrEqual(35);
  });

  it('routes sunTronic byLayout to SunTronicExporter.exportAsSunTronic', () => {
    const entry = LAYOUT_EXPORTERS['sunTronic'];
    expect(entry, 'sunTronic must be a byLayout exporter').toBeDefined();
    expect(entry.module).toBe('SunTronicExporter');
    expect(entry.fn).toBe('exportAsSunTronic');
    expect(entry.ext).toBe('src');
  });

  for (const [formatId, entry] of Object.entries(LAYOUT_EXPORTERS)) {
    // Generous timeout: a few exporters pull a heavy WASM engine at import time.
    it(`resolves module + fn for layoutFormatId "${formatId}" (${entry.module}.${entry.fn})`, async () => {
      const mod = await import(/* @vite-ignore */ `../${entry.module}`);
      expect(typeof mod[entry.fn], `${entry.module} must export ${entry.fn}`).toBe('function');
    }, 30000);
  }
});

describe('nativeExportRouter — chip-RAM readback captures edits', () => {
  const ORIGINAL = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
  const EDITED = new Uint8Array([0x11, 0x22, 0x99, 0x44, 0x55, 0x66, 0x77, 0x88]); // one cell changed

  beforeEach(() => {
    // Live UADE engine present.
    vi.doMock('@engine/uade/UADEEngine', () => ({
      UADEEngine: {
        hasInstance: () => true,
        getInstance: () => ({ __fake: true }),
      },
    }));
    // Chip editor whose readEditedModule returns the EDITED module (edits applied).
    vi.doMock('@engine/uade/UADEChipEditor', () => ({
      UADEChipEditor: class {
        constructor(_engine: unknown) { /* noop */ }
        async readEditedModule(size: number): Promise<Uint8Array> {
          return EDITED.subarray(0, size);
        }
      },
    }));
    // Format store holds the ORIGINAL (un-edited) module bytes + name.
    vi.doMock('@stores/useFormatStore', () => ({
      useFormatStore: {
        getState: () => ({
          uadeEditableFileData: ORIGINAL.buffer,
          uadeEditableFileName: 'edited.bd',
          editorMode: 'uade',
          libopenmptFileData: undefined,
          hivelyNative: undefined,
        }),
      },
    }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@engine/uade/UADEEngine');
    vi.doUnmock('@engine/uade/UADEChipEditor');
    vi.doUnmock('@stores/useFormatStore');
  });

  it('exports EDITED bytes (not the original) for a layout format with no dedicated exporter', async () => {
    // Re-import the router AFTER the mocks are registered so its dynamic imports
    // resolve to the mocked modules.
    const { exportNativeSong } = await import('../nativeExportRouter');

    const song = {
      name: 'edited',
      format: 'UADE',
      // A chip-RAM layout whose formatId is intentionally NOT in LAYOUT_EXPORTERS and
      // not a named-format branch, so dispatch falls through to chip-RAM readback.
      uadePatternLayout: { formatId: '__unmapped_layout__' },
      instruments: [],
    } as unknown as TrackerSong;

    const result = await exportNativeSong(song, {});

    expect(result).not.toBeNull();
    expect(result!.data).toEqual(EDITED);
    // Root of the bug: must NOT be the un-edited original.
    expect(Array.from(result!.data)).not.toEqual(Array.from(ORIGINAL));
    expect(result!.warnings.join(' ')).toMatch(/chip RAM readback/i);
  });
});
