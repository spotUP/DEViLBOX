/**
 * The rules the headless corpus sweep judges songs by
 * (tools/uade-audit/corpus-sweep.ts).
 *
 * These are measurement rules, and a measurement rule that drifts turns the
 * whole table into confident noise — so each one is pinned to the case that
 * made it exist. Named after what a reader of the table would see.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyRender,
  isNonMusic,
  missingCompanion,
  refusalReason,
  routesToUADE,
  BAD_VERDICTS,
  SILENCE_PEAK,
} from '../../tools/uade-audit/soundVerdict';

const FULL = 44100 * 6;

describe('classifyRender', () => {
  it('calls a full render of audible audio PLAYS', () => {
    expect(classifyRender({ frames: FULL, requestedFrames: FULL, peak: 0.3 })).toBe('PLAYS');
  });

  it('separates an empty subsong from a silent one', () => {
    // Zero frames is the player saying "this subsong is over" before a single
    // sample — a different fix (pick another subsong) from a song that runs
    // and makes no sound (a missing sample, a dead voice).
    expect(classifyRender({ frames: 0, requestedFrames: FULL, peak: 0 })).toBe('INSTANT-END');
    expect(classifyRender({ frames: FULL, requestedFrames: FULL, peak: 0 })).toBe('SILENT');
  });

  it('calls a peak below one 16-bit step SILENT, and one step above it audible', () => {
    expect(classifyRender({ frames: FULL, requestedFrames: FULL, peak: SILENCE_PEAK / 2 })).toBe('SILENT');
    expect(classifyRender({ frames: FULL, requestedFrames: FULL, peak: SILENCE_PEAK * 2 })).toBe('PLAYS');
  });

  it('reports a song that ends before half the requested length as SHORT', () => {
    expect(classifyRender({ frames: FULL * 0.4, requestedFrames: FULL, peak: 0.3 })).toBe('SHORT');
    expect(classifyRender({ frames: FULL * 0.6, requestedFrames: FULL, peak: 0.3 })).toBe('PLAYS');
  });

  it('prefers SILENT over SHORT when a short render is also inaudible', () => {
    expect(classifyRender({ frames: 100, requestedFrames: FULL, peak: 0 })).toBe('SILENT');
  });

  it('lists every failing verdict as one a human should look at', () => {
    for (const v of ['SILENT', 'INSTANT-END', 'SHORT', 'MISSING-COMPANION', 'REFUSED', 'CRASHED', 'TIMEOUT'] as const) {
      expect(BAD_VERDICTS).toContain(v);
    }
    for (const v of ['PLAYS', 'COMPANION', 'NOT-UADE', 'SKIPPED'] as const) {
      expect(BAD_VERDICTS).not.toContain(v);
    }
  });
});

describe('missingCompanion', () => {
  it('names the sidecar UADE asked the host for', () => {
    // The real line, from mdat.rocknroll: the corpus ships the song without
    // its sample file, and this is the only thing that says so.
    expect(missingCompanion([
      '[uade-wasm] some other chatter',
      "[uade-wasm] uade_request_amiga_file: file not found '/uade/smpl.rocknroll'",
    ])).toBe('smpl.rocknroll');
  });

  it('keeps a sidecar that lives in a subdirectory whole', () => {
    expect(missingCompanion([
      "[uade-wasm] uade_request_amiga_file: file not found '/uade/Instruments/SnareDrum.instr'",
    ])).toBe('Instruments/SnareDrum.instr');
  });

  it('is null when the player never asked for a file', () => {
    expect(missingCompanion(['[uade-wasm] Cannot play file: hexplosion.hvl (ret=0)'])).toBeNull();
    expect(missingCompanion([])).toBeNull();
  });
});

describe('refusalReason', () => {
  it('picks the line that names the cause, not the first line printed', () => {
    expect(refusalReason([
      'uade: starting',
      'uade warning: Song ended prematurely due to error: module check failed',
    ])).toContain('module check failed');
  });

  it('is empty rather than undefined when UADE said nothing', () => {
    expect(refusalReason([])).toBe('');
  });
});

describe('routesToUADE', () => {
  it('sends a file the registry cannot name to UADE anyway', () => {
    // Corpus files with no extension at all (`play`, `Lightforce`, `routine`)
    // are real modules; UADE content-detects them. Skipping them would hide
    // every SunTronic tune whose name carries no format.
    expect(routesToUADE(null)).toBe(true);
  });

  it('sends Amiga formats to UADE and leaves other engines alone', () => {
    expect(routesToUADE({ family: 'amiga-native' })).toBe(true);
    expect(routesToUADE({ family: 'uade-only' })).toBe(true);
    expect(routesToUADE({ family: 'libopenmpt', uadeFallback: true })).toBe(true);
    expect(routesToUADE({ family: 'libopenmpt' })).toBe(false);
    expect(routesToUADE({ family: 'furnace' })).toBe(false);
    expect(routesToUADE({ family: 'midi' })).toBe(false);
  });
});

describe('isNonMusic', () => {
  it('keeps modules whose name has no extension', () => {
    expect(isNonMusic('Lightforce')).toBe(false);
    expect(isNonMusic('mdat.rocknroll')).toBe(false);
  });

  it('drops readmes and rendered audio', () => {
    expect(isNonMusic('readme.txt')).toBe(true);
    expect(isNonMusic('render.wav')).toBe(true);
    expect(isNonMusic('cover.png')).toBe(true);
  });
});
