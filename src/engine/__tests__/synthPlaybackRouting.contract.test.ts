/**
 * Contract test: instrument-level synths (TB303, TR909, DubSiren, etc.)
 * must always route through libopenmpt for sequencing.
 *
 * Regression: commit 8dcb23a2b introduced a `hasOnlyNativePlayerSynths`
 * gate that blocked libopenmpt XM creation for songs whose instruments
 * had non-Sampler synthTypes. This caused .dbx songs with TB303/TR909
 * to fall back to the minimal TS scheduler, which lacked proper looping,
 * position tracking, and effect processing.
 *
 * The fix: remove the gate entirely. The other conditions (_suppressNotes,
 * hasActiveDispatch, useWasmSequencer, furnaceNative) already correctly
 * handle native-player engines. Instrument-level synths need libopenmpt.
 *
 * Guard: statically inspect TrackerReplayer.ts Phase 5.4 to ensure no
 * synthType-based gate blocks libopenmpt creation for instrument synths.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('Synth playback routing — libopenmpt creation contract', () => {
  const src = read('engine/TrackerReplayer.ts');
  const nativeRouting = read('engine/replayer/NativeEngineRouting.ts');
  const instrumentFactory = read('engine/InstrumentFactory.ts');

  it('Phase 5.4 does not gate on synthType or hasOnlyNativePlayerSynths', () => {
    // Extract the Phase 5.4 section (between "Phase 5.4" comment and the try block)
    const phase54Match = src.match(/Phase 5\.4[\s\S]*?if\s*\(!this\.song\.libopenmptFileData[\s\S]*?\{/);
    expect(phase54Match, 'Phase 5.4 block should exist').not.toBeNull();
    const phase54 = phase54Match![0];

    // Must NOT contain synthType-based gates
    expect(phase54).not.toMatch(/hasOnlyNativePlayerSynths/);
    expect(phase54).not.toMatch(/inst\.synthType/);
    expect(phase54).not.toMatch(/synthType.*!==.*'Sampler'/);
  });

  it('Phase 5.4 still gates on _suppressNotes (native engine already active)', () => {
    const phase54Match = src.match(/Phase 5\.4[\s\S]*?if\s*\(!this\.song\.libopenmptFileData[^{]*\{/);
    expect(phase54Match).not.toBeNull();
    const condition = phase54Match![0];
    expect(condition).toMatch(/!this\._suppressNotes/);
  });

  it('Phase 5.4 still gates on hasActiveDispatch (engine driving position)', () => {
    const phase54Match = src.match(/Phase 5\.4[\s\S]*?if\s*\(!this\.song\.libopenmptFileData[^{]*\{/);
    expect(phase54Match).not.toBeNull();
    const condition = phase54Match![0];
    expect(condition).toMatch(/!this\.coordinator\.hasActiveDispatch/);
  });

  it('startNativeEngines sets _suppressNotes before Phase 5.4 runs', () => {
    // startNativeEngines must appear BEFORE Phase 5.4 in the source
    const nativeIdx = src.indexOf('startNativeEngines(');
    const phase54Idx = src.indexOf('Phase 5.4');
    expect(nativeIdx).toBeGreaterThan(0);
    expect(phase54Idx).toBeGreaterThan(0);
    expect(nativeIdx).toBeLessThan(phase54Idx);
  });

  it('Hively whole-song playback suppresses tracker note synthesis', () => {
    expect(nativeRouting).toMatch(/key:\s*'Hively'[\s\S]*?suppressNotes:\s*true/);
  });

  it('Hively instrument wrapper skips standalone player setup when a tune is already loaded', () => {
    expect(instrumentFactory).toMatch(/config\.hively && !hvlSynth\.getEngine\(\)\.hasLoadedTune\(\)/);
  });

  it('TFMX playback uses the wasm position store directly, not the global FormatPlaybackState singleton', () => {
    const tfmxBlockMatch = nativeRouting.match(/if\s*\(desc\.key === 'TFMXModule'[\s\S]*?console\.log\(`\[NativeEngineRouting\] TFMXModule position sync wired[\s\S]*?\n\s*\}/);
    expect(tfmxBlockMatch, 'TFMXModule position sync block should exist').not.toBeNull();
    const tfmxBlock = tfmxBlockMatch![0];
    expect(tfmxBlock).toContain('useWasmPositionStore.getState().setPosition(row, position);');
    expect(tfmxBlock).not.toContain('setFormatPlaybackPlaying(true)');
    expect(tfmxBlock).not.toContain('setFormatPlaybackRow(row)');
  });
});
