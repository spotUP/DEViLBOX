/**
 * The bridge names the engine that plays a song, not the registry entry.
 *
 * `load_file` answered `format: "Amiga Format"` for a UADE-played .gray and
 * `format: "Jochen Hippel ST"` for a .sog the TFMX decoder refused; both
 * labels name the registry entry, and both misled the 2026-10-02 triage into
 * blaming the wrong engine (ledger F22). `playingEngineFor` applies the
 * router's own activation rule, so what the bridge reports is what
 * `startNativeEngines` starts.
 */
import { describe, it, expect } from 'vitest';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { playingEngineFor, WASM_ENGINES, shouldActivate } from '../replayer/NativeEngineRouting';

const base = (extra: Partial<TrackerSong> = {}): TrackerSong => ({
  name: 'x', format: 'MOD', patterns: [], instruments: [], songPositions: [0], songLength: 1,
  restartPosition: 0, numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  ...extra,
} as unknown as TrackerSong);

describe('playingEngineFor', () => {
  it('names the registry engine whose file data the song carries', () => {
    expect(playingEngineFor(base({ hippelFileData: new ArrayBuffer(8) }))).toBe('Hippel');
    expect(playingEngineFor(base({ uadeEditableFileData: new ArrayBuffer(8) }))).toBe('UADEEditable');
  });

  it('agrees with the router for every registry descriptor', () => {
    for (const desc of WASM_ENGINES) {
      const song = base({ [desc.fileDataKey]: new ArrayBuffer(8), format: desc.formats?.[0] ?? 'MOD' } as Partial<TrackerSong>);
      const first = WASM_ENGINES.find((d) => shouldActivate(d, song))!;
      expect(playingEngineFor(song), desc.key).toBe(first.key);
    }
  });

  it('reports UADE classic streaming and the tracker scheduler', () => {
    expect(playingEngineFor(base({ instruments: [{ id: 1, name: 'u', type: 'synth', synthType: 'UADESynth' }] } as Partial<TrackerSong>))).toBe('UADE classic');
    expect(playingEngineFor(base())).toBe('tracker');
  });
});
