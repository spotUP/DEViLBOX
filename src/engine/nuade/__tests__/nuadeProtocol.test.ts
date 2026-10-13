/** NE-1: the worklet protocol - one validator for everything the worklet posts. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NUADE_OUT_MESSAGES, NUADE_IN_MESSAGES, NUADE_CHANNEL_OUTPUT_MESSAGES, NuadeCap, parseNuadeOut } from '../nuadeProtocol';

describe('NE-1 nuade protocol', () => {
  it('accepts a well-formed message of every type the worklet posts', () => {
    const samples: Record<string, unknown> = {
      ready: {}, songEnd: {}, stopped: {},
      moduleLoaded: { voices: 4, subsongs: 1, defaultSubsong: 0, playerId: 'mmdc', playerName: 'OctaMED MMDC', meta: {}, instruments: [], caps: 1 },
      subsongStarted: { index: 0 },
      position: { frame: 0, order: 1, pattern: 2, row: 3, tick: 0, speed: 6, tempo: 125, voices: [] },
      vu: { levels: [0, 0.5] },
      oscData: { channels: [new Int16Array(4)], frame: 0, sampleRate: 48000 },
      swapDone: { ms: 12 },
      state: { offset: 0, bytes: new ArrayBuffer(4) },
      error: { message: 'x' },
    };
    expect(Object.keys(samples).sort()).toEqual([...NUADE_OUT_MESSAGES].sort());
    for (const [type, body] of Object.entries(samples)) {
      expect(parseNuadeOut({ type, ...(body as object) })?.type, type).toBe(type);
    }
  });

  it('rejects unknown types and malformed bodies (a moduleLoaded without a player id, a NaN position)', () => {
    expect(parseNuadeOut({ type: 'bogus' })).toBeNull();
    expect(parseNuadeOut(null)).toBeNull();
    expect(parseNuadeOut({ type: 'moduleLoaded', voices: 4 })).toBeNull();
    expect(parseNuadeOut({ type: 'position', frame: NaN, order: 0, pattern: 0, row: 0, tick: 0, speed: 6, tempo: 125, voices: [] })).toBeNull();
    expect(parseNuadeOut({ type: 'swapDone' })).toBeNull();
  });

  it('lists inbound messages without overlap between the worklet-handled and channel-output kinds', () => {
    const overlap = NUADE_IN_MESSAGES.filter((m) => (NUADE_CHANNEL_OUTPUT_MESSAGES as readonly string[]).includes(m));
    expect(overlap).toEqual([]);
    expect(NuadeCap).toEqual({ StateRead: 1, CellWrite: 2, InstrumentWrite: 4, ModuleWrite: 8 });
  });

  it('the nuade tests directory is part of test:ci', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../../package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test:ci']).toContain('src/engine/nuade/__tests__/');
  });
});
