/**
 * COMPLETENESS RATCHET — FILE_DATA_FIELDS must stay in sync with TrackerSong.
 *
 * Background: the persistence layer (exporters.ts) base64-encodes exactly the
 * fields in `FILE_DATA_FIELDS` when saving a project. That list had drifted far
 * behind the ~60 `*FileData` fields on `TrackerSong`, so ~30 formats silently
 * lost their engine bytes on save/reload.
 *
 * This test parses the `TrackerSong` interface source and fails when a
 * `*FileData` / `*RawData` / `*SmplData` field exists on `TrackerSong` but is
 * NOT registered in `FILE_DATA_FIELDS` (and is not in the documented exclusion
 * set). Adding a new native-engine format now forces a conscious decision:
 * either wire it into persistence (add to FILE_DATA_FIELDS) or document why it
 * is excluded.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FILE_DATA_FIELDS } from '@engine/formatFileDataFields';

const TRACKER_REPLAYER = join(process.cwd(), 'src/engine/TrackerReplayer.ts');

/**
 * Fields that match the binary-buffer naming pattern on `TrackerSong` but are
 * DELIBERATELY not persisted through `useFormatStore`. Each needs a reason.
 *
 * These three formats are standalone WASM engines whose file bytes are set on
 * the `TrackerSong` by their parser but are NOT mirrored into `useFormatStore`
 * — and `useFormatStore` is the serialization source for project save/reload.
 * They therefore do not round-trip today regardless of this list; wiring them
 * into the format store is separate coverage work (see the UADE-editability
 * plan). Listing them here documents the gap and keeps the ratchet honest.
 */
const EXCLUDED_FIELDS = new Set<string>([
  'pmdFileData',     // PMD (PC-98 YM2608) — not carried in useFormatStore
  'mdxminiFileData', // MDX (X68000 YM2151) — not carried in useFormatStore
  'asapFileData',    // ASAP (Atari POKEY) — not carried in useFormatStore
  // NOTE: sunTronicSongFileData WAS excluded here (Gate B.2, before it was wired
  // into useFormatStore). Gate E mirrors it through applyEditorMode so it now
  // round-trips like the other native-engine buffers — it belongs in
  // FILE_DATA_FIELDS, not this exclusion set.
]);

describe('FILE_DATA_FIELDS completeness ratchet', () => {
  it('registers every binary *FileData/*RawData/*SmplData field on TrackerSong', () => {
    const src = readFileSync(TRACKER_REPLAYER, 'utf8');

    // Only scan the TrackerSong interface body so we don't pick up field
    // references elsewhere in the file (assignments, comments in methods).
    const ifaceStart = src.indexOf('interface TrackerSong');
    expect(ifaceStart, 'TrackerSong interface not found').toBeGreaterThan(-1);
    // The interface ends at the first `}` at column 0 after its opening.
    const ifaceBodyEnd = src.indexOf('\n}', ifaceStart);
    expect(ifaceBodyEnd, 'TrackerSong interface end not found').toBeGreaterThan(ifaceStart);
    const ifaceBody = src.slice(ifaceStart, ifaceBodyEnd);

    const fieldRegex = /(\w+FileData|\w+RawData|\w+SmplData)\??:/g;
    const declared = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = fieldRegex.exec(ifaceBody)) !== null) {
      declared.add(m[1]);
    }

    expect(declared.size, 'regex found no binary fields — regex or source changed').toBeGreaterThan(20);

    const registered = new Set<string>(FILE_DATA_FIELDS as readonly string[]);
    const missing: string[] = [];
    for (const field of declared) {
      if (registered.has(field)) continue;
      if (EXCLUDED_FIELDS.has(field)) continue;
      missing.push(field);
    }

    expect(
      missing,
      `TrackerSong has binary field(s) not registered in FILE_DATA_FIELDS: ${missing.join(', ')}. ` +
      'Add them to src/engine/formatFileDataFields.ts (so they survive project save/reload) ' +
      'or, if intentionally not persisted, add them to EXCLUDED_FIELDS with a reason.',
    ).toEqual([]);
  });

  it('every excluded field is genuinely absent from FILE_DATA_FIELDS (no dead exclusions)', () => {
    const registered = new Set<string>(FILE_DATA_FIELDS as readonly string[]);
    for (const excluded of EXCLUDED_FIELDS) {
      expect(
        registered.has(excluded),
        `${excluded} is both excluded AND registered — remove it from EXCLUDED_FIELDS`,
      ).toBe(false);
    }
  });

  it('has no duplicate entries', () => {
    const arr = FILE_DATA_FIELDS as readonly string[];
    expect(new Set(arr).size).toBe(arr.length);
  });
});
