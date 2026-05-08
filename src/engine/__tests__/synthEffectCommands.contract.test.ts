/**
 * Contract test: Effect commands (portamento, volume slide, arpeggio, etc.)
 * must work for WASM synths (DevilboxSynth), not just Tone.js instruments.
 *
 * Regression: applySynthFrequency only looked for Tone.js `.frequency` param,
 * silently returning for WASM synths. applySynthVolume only checked Tone.js
 * `.volume` (dB). setChannelGain in TrackerReplayer only modulated per-channel
 * gainNodes that WASM synths don't route through.
 *
 * The fix:
 * 1. applySynthFrequency checks isDevilboxSynth → calls setFrequency()
 * 2. applySynthVolume checks isDevilboxSynth → modulates output GainNode
 * 3. applySynthPitch checks isDevilboxSynth → converts semitones → setFrequency()
 * 4. setChannelGain callback also routes through ToneEngine.applySynthVolume
 * 5. DB303Synth, VSTBridgeSynth, DX7Synth, OPL3Synth, TunefishSynth, SfizzSynth,
 *    RdPianoSynth all implement setFrequency() via their pitch bend mechanisms
 *
 * Guard: statically verify that:
 * - applySynthFrequency has isDevilboxSynth branch
 * - applySynthVolume has isDevilboxSynth branch with GainNode
 * - applySynthPitch has isDevilboxSynth branch
 * - setChannelGain callback routes to applySynthVolume
 * - DevilboxSynth interface declares setFrequency
 * - Key WASM synths implement setFrequency
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('Effect commands work for WASM synths (DevilboxSynth)', () => {
  const toneEngine = read('engine/ToneEngine.ts');
  const replayer = read('engine/TrackerReplayer.ts');
  const synthInterface = read('types/synth.ts');

  it('DevilboxSynth interface declares setFrequency', () => {
    expect(synthInterface).toContain('setFrequency?(hz: number');
  });

  it('applySynthFrequency has isDevilboxSynth fallback path', () => {
    // Extract the applySynthFrequency method
    const match = toneEngine.match(/applySynthFrequency\([\s\S]*?isDevilboxSynth\(instrument\)/);
    expect(match, 'applySynthFrequency should check isDevilboxSynth').not.toBeNull();
    // Verify it calls setFrequency on the DevilboxSynth
    const methodBlock = toneEngine.slice(
      toneEngine.indexOf('public applySynthFrequency('),
      toneEngine.indexOf('public applySynthFrequency(') + 2000
    );
    expect(methodBlock).toContain('instrument.setFrequency');
  });

  it('applySynthVolume has isDevilboxSynth fallback with GainNode', () => {
    const methodStart = toneEngine.indexOf('public applySynthVolume(');
    expect(methodStart).toBeGreaterThan(-1);
    const methodBlock = toneEngine.slice(methodStart, methodStart + 1500);
    expect(methodBlock).toContain('isDevilboxSynth(instrument)');
    expect(methodBlock).toContain('GainNode');
  });

  it('applySynthPitch has isDevilboxSynth fallback', () => {
    const methodStart = toneEngine.indexOf('public applySynthPitch(');
    expect(methodStart).toBeGreaterThan(-1);
    const methodBlock = toneEngine.slice(methodStart, methodStart + 1500);
    expect(methodBlock).toContain('isDevilboxSynth(instrument)');
    expect(methodBlock).toContain('setFrequency');
  });

  it('setChannelGain callback routes through ToneEngine.applySynthVolume', () => {
    // The setChannelGain callback in TrackerReplayer should call applySynthVolume
    const gainCallback = replayer.match(/setChannelGain:[\s\S]*?applySynthVolume/);
    expect(gainCallback, 'setChannelGain should call applySynthVolume for WASM synths').not.toBeNull();
  });
});

describe('Key WASM synths implement setFrequency', () => {
  const synths = [
    { name: 'DB303Synth', path: 'engine/db303/DB303Synth.ts' },
    { name: 'VSTBridgeSynth', path: 'engine/vstbridge/VSTBridgeSynth.ts' },
    { name: 'DX7Synth', path: 'engine/dx7/DX7Synth.ts' },
    { name: 'OPL3Synth', path: 'engine/opl3/OPL3Synth.ts' },
    { name: 'TunefishSynth', path: 'engine/tunefish/TunefishSynth.ts' },
    { name: 'SfizzSynthEngine', path: 'engine/sfizz/SfizzSynth.ts' },
    { name: 'RdPianoSynth', path: 'engine/rdpiano/RdPianoSynth.ts' },
  ];

  for (const { name, path } of synths) {
    it(`${name} implements setFrequency`, () => {
      const src = read(path);
      expect(src).toContain('setFrequency(');
      // Should track current note for pitch bend conversion
      expect(src).toContain('_currentMidiNote');
    });
  }
});

describe('SynthEffectProcessor has no diagnostic logging', () => {
  it('does not contain debug log count or diagnostic console.log', () => {
    const src = read('engine/replayer/SynthEffectProcessor.ts');
    expect(src).not.toContain('_debugLogCount');
    expect(src).not.toContain('[SynthEffectProcessor] row=');
    expect(src).not.toContain('[SynthEffectProcessor] ch');
  });
});
