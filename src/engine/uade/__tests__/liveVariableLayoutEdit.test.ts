/**
 * G6: a grid edit of a variable-length-layout format that has no exporter reaches the chip RAM UADE plays from.
 * Drives the store's live route (applyEditedModuleToChipRam) with a fake chip RAM holding the module: the edited block
 * must be re-encoded into its slot in chip RAM (UADEChipEditor.rewriteVariablePattern, now removed, had no caller).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TrackerSong } from '../../TrackerReplayer';

const ram = new Uint8Array(0x300000);
vi.mock('../UADEEngine', () => ({
  UADEEngine: {
    hasInstance: () => true,
    getInstance: () => ({
      readMemory: async (a: number, n: number) => ram.slice(a, a + n),
      writeMemory: async (a: number, d: Uint8Array) => { ram.set(d, a); },
    }),
  },
}));
vi.mock('@/lib/export/nativeExportRouter', () => ({ exportNativeSong: async () => null }));

import { applyEditedModuleToChipRam } from '../liveModuleEdits';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';
import type { UADEVariablePatternLayout } from '../UADEPatternEncoder';

const BASE = 0x20000;
const SLOT_AT = 8;

function song(edited: boolean): TrackerSong {
  const module = new Uint8Array(32).fill(0xee);
  module.set([1, 2, 3, 4], SLOT_AT);
  ram.fill(0);
  ram.set([0, 0x02, 0, 0], 0x100); // load address 0x20000
  ram.set(module, BASE);
  const baseline = [{ note: 0 }, { note: 0 }];
  const layout = {
    formatId: 'g6test', numChannels: 1, numFilePatterns: 1,
    filePatternAddrs: [SLOT_AT], filePatternSizes: [4], trackMap: [[0]],
    // raw carrier: baseline rows reproduce the raw bytes, any edit runs the packer
    blockRawBytes: [new Uint8Array([1, 2, 3, 4])], blockRows: [baseline],
    encoder: { encodePattern: (rows: Array<{ note?: number }>) => new Uint8Array([9, rows[0].note ?? 0, 0, 0]) },
  } as unknown as UADEVariablePatternLayout;
  const rows = [{ note: edited ? 40 : 0 }, { note: 0 }];
  const base = [{ channels: [{ rows: baseline }] }];
  setGridBaseline(baselineOf(base as never));
  return {
    uadeEditableFileData: module.buffer, uadeVariableLayout: layout,
    patterns: [{ channels: [{ rows }] }],
  } as unknown as TrackerSong;
}

describe('live edit of a variable-layout module without an exporter (G6)', () => {
  beforeEach(() => { ram.fill(0); });
  it('writes the re-encoded block into the chip RAM slot', async () => {
    const s = song(true);
    const result = await applyEditedModuleToChipRam(s);
    expect(result?.status).toBe('live');
    expect([...ram.slice(BASE + SLOT_AT, BASE + SLOT_AT + 4)]).toEqual([9, 40, 0, 0]);
  });
});
