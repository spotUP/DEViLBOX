/**
 * Owner 2026-11-03: "the plague plays from the 1st position not the current" (the_plague_game_end.cm, an opaque UADE
 * song). ef529f7cf taught startNativeEngines to seek UADE, but an opaque UADE song never reaches it: usePatternPlayback
 * starts the UADESynth engine itself and called play() with no seek, so Play and Play Pattern always started at the top.
 *
 * The opaque Play branch now starts through playOpaqueUadeFrom, which seeks to the row's first frame on the row map the
 * opaque playhead follow reads (uadeRowFrames, opaque) before play(). The plague also carries editable data, so the
 * engine's targetOf answers it on the CIA tick clock; the first fix read targetOf and never seeked.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { playOpaqueUadeFrom } from '../opaqueUadeStart';
import { OPAQUE_UADE_FRAMES_PER_ROW } from '../uadeLoadArgs';
import type { TrackerSong } from '@engine/TrackerReplayer';

function fakeEngine() {
  const calls: string[] = [];
  return {
    calls,
    seek: (frame: number) => { calls.push(`seek ${frame}`); },
    play: () => { calls.push('play'); },
  };
}

const song = {
  patterns: [{ length: 64 }, { length: 64 }, { length: 64 }],
  songPositions: [0, 1, 2],
  initialSpeed: 6,
  initialBPM: 125,
} as unknown as TrackerSong;

describe('opaque UADE Play starts at the transport position', () => {
  it('seeks to the row first frame before play, away from the top', () => {
    const engine = fakeEngine();
    playOpaqueUadeFrom(engine as never, song, { songPos: 2, row: 5 }, 44100);
    expect(engine.calls).toEqual([`seek ${(2 * 64 + 5) * OPAQUE_UADE_FRAMES_PER_ROW}`, 'play']);
  });

  it('seeks a song that also carries editable data (the plague: CIA tick clock) on the opaque follow row map', () => {
    const engine = fakeEngine();
    const plague = { ...song, uadeEditableFileData: new Uint8Array(4), uadeFirstTick: 2 } as unknown as TrackerSong;
    playOpaqueUadeFrom(engine as never, plague, { songPos: 2, row: 0 }, 44100);
    expect(engine.calls).toEqual([`seek ${2 * 64 * OPAQUE_UADE_FRAMES_PER_ROW}`, 'play']);
  });

  it('plays from the top with no seek at position 0 row 0', () => {
    const engine = fakeEngine();
    playOpaqueUadeFrom(engine as never, song, { songPos: 0, row: 0 }, 44100);
    expect(engine.calls).toEqual(['play']);
  });

  it('plays from the top with no seek for a TFMX row the timing table never names', () => {
    const engine = fakeEngine();
    const tfmx = { ...song, tfmxTimingTable: [{ patternIndex: 0, row: 0, cumulativeJiffies: 0 }] } as unknown as TrackerSong;
    playOpaqueUadeFrom(engine as never, tfmx, { songPos: 1, row: 3 }, 44100);
    expect(engine.calls).toEqual(['play']);
  });

  it('the opaque Play branch of usePatternPlayback starts through playOpaqueUadeFrom, never a bare play()', () => {
    const src = readFileSync(join(process.cwd(), 'src/hooks/audio/usePatternPlayback.ts'), 'utf8');
    const at = src.indexOf("format === 'UADE' && playsAsOpaqueUADE(");
    expect(at).toBeGreaterThan(-1);
    const branch = src.slice(at, src.indexOf('// ── JamCracker', at));
    expect(branch).toContain('playOpaqueUadeFrom(uadeEngine,');
    expect(branch).not.toMatch(/uadeEngine\.play\(\)/);
  });
});
