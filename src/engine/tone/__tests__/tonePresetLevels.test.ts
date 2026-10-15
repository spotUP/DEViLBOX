/**
 * Choosing a factory preset in the editor must not change how loud a Tone core synth is, beyond the preset's own Volume.
 * The editor applies a preset as a partial config to the live instrument (PresetDropdown -> updateInstrumentRealtime ->
 * ToneEngine.updateToneJsSynthInPlace), so each preset is rendered offline exactly that way: the default instrument is
 * built by the engine's creation path, the preset is applied through the real live-update function, a note is played.
 *
 * Reference level: the peak of the same synth type at its default config and Volume -12 dBFS, moved by the preset's
 * Volume relative to -12. A preset more than 7 dB from that reference is a units or normalisation bug (6 dB of room for a
 * resonant filter or a noise voice peaking above a plain saw, 1 dB of render noise; this caught the live
 * Volume ramp dropping the synth's normalisation offset: every preset change made FM 16 dB and AM 22 dB quieter).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import type * as ToneNS from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';
import { renderOffline, peakAbs } from './toneKnobRender';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let Tone: typeof ToneNS;
let K: typeof import('../toneSynthKnobs');
let U: typeof import('../SynthParameterUpdates');
let presets: InstrumentConfig[];
let Factory: typeof import('../../InstrumentFactory').InstrumentFactory;

const TYPES = ['Synth', 'MonoSynth', 'DuoSynth', 'FMSynth', 'ToneAM', 'MetalSynth', 'MembraneSynth', 'NoiseSynth'];
const db = (x: number) => 20 * Math.log10(Math.max(1e-9, x));

beforeAll(async () => {
  installRealWebAudio();
  Tone = await import('tone');
  K = await import('../toneSynthKnobs');
  U = await import('../SynthParameterUpdates');
  Factory = (await import('../../InstrumentFactory')).InstrumentFactory;
  presets = (await import('@/constants/factoryPresets')).FACTORY_PRESETS as unknown as InstrumentConfig[];
}, 240000);

const defaultConfig = (synthType: string): InstrumentConfig => ({
  id: 1, name: 'default', type: 'synth', synthType, volume: -12, pan: 0,
  // Tone's own MonoSynth default sweeps a lowpass 200 -> 1600 Hz, which darkens a saw by ~4 dB at the peak; the reference
  // level is the synth with the filter out of the way, so a preset's own filter is what the comparison shows.
  ...(synthType === 'MonoSynth' ? { filterEnvelope: { baseFrequency: 20000, octaves: 0 } } : {}),
  oscillator: { type: synthType === 'FMSynth' || synthType === 'ToneAM' ? 'sine' : 'sawtooth', detune: 0, octave: 0 },
  envelope: { attack: 10, decay: 200, sustain: 50, release: 1000 },
}) as unknown as InstrumentConfig;

/** Peak (dBFS) of one note after `preset` was applied live to the default instrument of its type. */
async function levelAfterPreset(synthType: string, preset: Partial<InstrumentConfig> | null): Promise<number> {
  const base = defaultConfig(synthType);
  const merged = { ...base, ...(preset ?? {}) } as InstrumentConfig;
  // hold the note until the attack and decay have run (a pad's 1.5 s attack peaks late), capped at 3 s
  const hold = Math.min(3, Math.max(0.5, ((merged.envelope?.attack ?? 10) + (merged.envelope?.decay ?? 200)) / 1000 + 0.2));
  const seconds = hold + 1.2;
  const r = await renderOffline(Tone, seconds, () => {
    const node = (K.TONE_KNOB_SYNTH_TYPES.has(synthType) && ['MetalSynth', 'MembraneSynth', 'NoiseSynth'].includes(synthType)
      ? Factory.createInstrument(base)
      : K.createToneSynthNode(synthType, base, { polyphony: 8 })) as unknown as Any;
    const ctx = { instruments: new Map([[1, node]]), instrumentIdFromKey: (k: number) => k } as unknown as Parameters<typeof U.updateToneJsSynthInPlace>[0];
    if (preset) U.updateToneJsSynthInPlace(ctx, 1, merged);
    node.connect(Tone.getDestination());
    if (synthType === 'MetalSynth' || synthType === 'NoiseSynth') node.triggerAttackRelease(hold, 0.2);
    else node.triggerAttackRelease('C3', hold, 0.2);
  });
  return db(peakAbs(r, 0, seconds));
}

describe('the live volume ramp keeps the synth\'s normalisation offset', () => {
  it.each(TYPES)('%s: editing Volume alone moves the level by exactly that much', async (type) => {
    const at = async (volume: number) => levelAfterPreset(type, { volume } as Partial<InstrumentConfig>);
    const a = await at(-12);
    const b = await at(-6);
    expect(b - a).toBeGreaterThan(3); // 6 dB; noise-based voices peak a little differently from run to run
    expect(b - a).toBeLessThan(9);
    // applying the config the instrument was created from changes nothing (the old ramp went to the raw -12 dB: -16 dB for FM)
    const unchanged = await levelAfterPreset(type, {});
    const created = await levelAfterPreset(type, null);
    expect(Math.abs(unchanged - created)).toBeLessThan(2); // noise voices peak differently from run to run; the old ramp was 16 to 22 dB off
  });
});

describe('every Tone factory preset sounds at its Volume (reference level +-7 dB)', () => {
  it('renders each preset of each Tone core synth, applied live, within 7 dB of the reference', async () => {
    const reference: Record<string, number> = {};
    for (const type of TYPES) reference[type] = await levelAfterPreset(type, null);
    const rows: Array<{ label: string; delta: number }> = [];
    for (const type of TYPES) {
      for (const p of presets.filter((x) => x.synthType === type)) {
        const { type: _t, synthType: _s, ...rest } = p as unknown as Record<string, unknown>;
        void _t; void _s;
        const level = await levelAfterPreset(type, rest as Partial<InstrumentConfig>);
        const expected = reference[type] + ((p.volume ?? -12) - -12);
        rows.push({ label: `${type} / ${p.name}`, delta: level - expected });
      }
    }
    expect(rows.length).toBeGreaterThan(30); // sentinel: the loop reached the presets
    const worst = [...rows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8).map((r) => `${r.label}: ${r.delta.toFixed(1)} dB`);
    expect(rows.filter((r) => Math.abs(r.delta) > 7).map((r) => `${r.label}: ${r.delta.toFixed(1)} dB`), `worst: ${worst.join('; ')}`).toEqual([]);
  }, 300000);
});

describe('envelope units', () => {
  const env = { attack: 0.5, decay: 0.25, sustain: 0.4, release: 1.5 };
  it('the pad collections (seconds, sustain 0..1) become milliseconds and percent, once', () => {
    const c = K.toneSecondsPresetToConfig({ envelope: env, modulationEnvelope: { attack: 0.001, decay: 0, sustain: 1, release: 0.1 }, modulationIndex: 3 });
    expect(c.envelope).toEqual({ attack: 500, decay: 250, sustain: 40, release: 1500 });
    expect(c.modulationEnvelope).toEqual({ attack: 1, decay: 0, sustain: 100, release: 100 });
    expect(c.modulationIndex).toBe(3);
  });
  it('the builder reads config envelopes as milliseconds and percent: seconds-sized numbers collapse to nothing (why the conversion exists)', () => {
    const asConfig = (e: Record<string, number>) => K.toneVoiceOptions('FMSynth', { ...defaultConfig('FMSynth'), envelope: e } as unknown as InstrumentConfig) as Any;
    expect(asConfig({ attack: 500, decay: 250, sustain: 40, release: 1500 }).envelope).toEqual({ attack: 0.5, decay: 0.25, sustain: 0.4, release: 1.5 });
    expect(asConfig(env).envelope.sustain).toBeCloseTo(0.004, 6);
  });
  it('no Tone core synth factory preset or DJ one-shot carries a fractional sustain (0 < sustain <= 1 would be a percent of a percent)', () => {
    for (const p of presets.filter((x) => TYPES.includes(x.synthType as string))) {
      for (const e of [p.envelope, p.filterEnvelope] as Array<{ sustain?: number } | undefined>) {
        if (e?.sustain !== undefined) expect(e.sustain === 0 || e.sustain > 1, `${p.name} sustain ${e.sustain}`).toBe(true);
      }
    }
  });
});
