// src/lib/formats/__tests__/editableFormatRegistry.parity.test.ts
/**
 * Parity net for the EditableFormatRegistry refactor (plan Task 2.1).
 *
 * `getFormatCapabilities` used to read two hand-maintained label lists
 * (`EDITABLE_FORMAT_LABELS` + `NATIVE_EXPORTABLE_LABELS`). It now DERIVES most
 * of those from `EditableFormatRegistry` and keeps only shrunken survivor lists.
 *
 * This is a MECHANICAL, behavior-preserving refactor: NO format may lose or gain
 * a capability. `editableFormatRegistry.parity.snapshot.json` was captured from
 * the ORIGINAL hand-list implementation (every FormatRegistry label paired with
 * its real family/families + a neutral variant, plus family-only and
 * extension-only probes). Each entry is `[isEditable, isNativeExportable,
 * hasPatternData, hasFurnaceAlternative]` as 0/1.
 *
 * If this fails after touching the registry or the survivor lists, a format's
 * editability / exportability changed — reconcile intentionally, don't loosen
 * the snapshot.
 */

import { describe, it, expect } from 'vitest';
import { getFormatCapabilities } from '@lib/import/FormatCapabilities';
import snapshot from './editableFormatRegistry.parity.snapshot.json';

type Row = [number, number, number, number];
const SNAP = snapshot as unknown as Record<string, Row>;

/** Decode a `label|ext|family` key back into getFormatCapabilities arguments. */
function decodeKey(key: string): { label: string; ext: string; family?: string } {
  const [label, ext, famRaw] = key.split('|');
  return { label, ext, family: famRaw === '∅' ? undefined : famRaw };
}

describe('EditableFormatRegistry parity — capabilities unchanged by the refactor', () => {
  it('reproduces the frozen pre-refactor snapshot for every (label, ext, family)', () => {
    const diffs: string[] = [];
    for (const [key, expected] of Object.entries(SNAP)) {
      const { label, ext, family } = decodeKey(key);
      const c = getFormatCapabilities(label, `x${ext}`, family);
      const got: Row = [
        c.isEditable ? 1 : 0,
        c.isNativeExportable ? 1 : 0,
        c.hasPatternData ? 1 : 0,
        c.furnaceAlternative ? 1 : 0,
      ];
      if (JSON.stringify(got) !== JSON.stringify(expected)) {
        diffs.push(`${key}: expected ${JSON.stringify(expected)} got ${JSON.stringify(got)}`);
      }
    }
    expect(diffs, `capability drift for ${diffs.length} case(s):\n${diffs.slice(0, 40).join('\n')}`).toEqual([]);
  });

  it('snapshot is non-trivial (guards against an empty/renamed fixture)', () => {
    expect(Object.keys(SNAP).length).toBeGreaterThan(400);
  });
});
