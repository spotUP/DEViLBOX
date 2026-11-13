/**
 * A UADE-played song whose grid is one tune must carry a subsong model that switches by reopening the file
 * (rebuild), so the grid, the instruments and UADE's subsong change together. Without it the live switch wrote
 * order [index] (a pattern the song does not have) while UADE played another tune than the grid showed.
 * Real file: mark-cooksey/mighty bombjack.mc (12 tunes, 4 patterns, no per-tune orders).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UADEMetadata } from '@/engine/uade/UADEEngine';

const FILE = join(process.cwd(), 'public/data/songs/mark-cooksey/mighty bombjack.mc');
const NAME = 'mighty bombjack.mc';

const engineStub = vi.hoisted(() => ({
  ready: async () => undefined,
  enableTickSnapshots: () => undefined,
  resetTickSnapshots: () => undefined,
  scanSubsong: async () => { throw new Error('no wasm'); },
  scanMemoryForMagic: async () => -1,
}));
vi.mock('@engine/uade/UADEEngine', () => ({ UADEEngine: { hasInstance: () => true, getInstance: () => engineStub } }));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import { parseUADEFile } from '../formats/UADEParser';

const meta = { formatName: 'Mark_Cooksey', subsongCount: 12, scanData: [] } as unknown as UADEMetadata;

describe('UADEParser subsong model', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reopens the file on a switch and starts at the tune the grid was built for', async () => {
    const b = readFileSync(FILE);
    const bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const song = await parseUADEFile(bytes, NAME, 'enhanced', 5, meta);
    const subs = song.uadeEditableSubsongs as { count: number; rebuild?: boolean; start?: number; orders?: unknown };
    expect(subs.count).toBe(12);
    expect(subs.orders).toBeUndefined();
    expect(subs.rebuild).toBe(true);
    expect(subs.start).toBe(5);
  });
});
