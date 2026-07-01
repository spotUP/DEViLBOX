import { describe, it, expect } from 'vitest';
import type { InstrumentConfig } from '@typedefs/instrument';
import {
  isHarvestableSynth,
  presetFingerprint,
  harvestNewPresets,
  toRippedPreset,
} from '../harvestSongPresets';

// Minimal InstrumentConfig fixtures — the harvest logic only reads
// id/name/type/synthType and the config body, so partial objects (cast) suffice.
const synthInst = (over: Partial<InstrumentConfig>): InstrumentConfig =>
  ({ id: 1, name: 'Lead', type: 'synth', synthType: 'TB303', ...over }) as InstrumentConfig;

describe('harvestSongPresets — rip synth voices from a loaded song', () => {
  it('harvests real synth voices', () => {
    expect(isHarvestableSynth(synthInst({}))).toBe(true);
  });

  it('rejects PCM sample instruments (type: sample)', () => {
    expect(isHarvestableSynth({ type: 'sample', synthType: 'Sampler' })).toBe(false);
  });

  it('rejects sample-playback synth types even when type is synth', () => {
    expect(isHarvestableSynth({ type: 'synth', synthType: 'Sampler' })).toBe(false);
    expect(isHarvestableSynth({ type: 'synth', synthType: 'Player' })).toBe(false);
    expect(isHarvestableSynth({ type: 'synth', synthType: 'GranularSynth' })).toBe(false);
  });

  it('fingerprint ignores id/name/volume/pan so the same voice dedupes across songs', () => {
    const a = synthInst({ id: 1, name: 'A', volume: 100, tb303: { cutoff: 0.5 } as never });
    const b = synthInst({ id: 7, name: 'B', volume: 40, tb303: { cutoff: 0.5 } as never });
    expect(presetFingerprint(a)).toBe(presetFingerprint(b));
  });

  it('fingerprint distinguishes genuinely different voices', () => {
    const a = synthInst({ tb303: { cutoff: 0.5 } as never });
    const b = synthInst({ tb303: { cutoff: 0.9 } as never });
    expect(presetFingerprint(a)).not.toBe(presetFingerprint(b));
  });

  it('harvestNewPresets filters samples, dedupes against existing, and dedupes within the song', () => {
    const instruments: InstrumentConfig[] = [
      synthInst({ id: 1, name: 'Bass', tb303: { cutoff: 0.5 } as never }),
      { id: 2, name: 'Kick', type: 'sample', synthType: 'Sampler' } as InstrumentConfig, // skipped
      synthInst({ id: 3, name: 'Bass dup', tb303: { cutoff: 0.5 } as never }),          // dup of #1
      synthInst({ id: 4, name: 'Lead', synthType: 'FMSynth' }),
    ];
    const fresh = harvestNewPresets(instruments, 'Cool Song.mod', new Set(), 1000);
    expect(fresh.map((p) => p.synthType).sort()).toEqual(['FMSynth', 'TB303']);
  });

  it('does not re-add a voice already present in existing fingerprints', () => {
    const inst = synthInst({ tb303: { cutoff: 0.5 } as never });
    const existing = new Set([presetFingerprint(inst)]);
    expect(harvestNewPresets([inst], 'song', existing, 1000)).toHaveLength(0);
  });

  it('toRippedPreset produces a deterministic id and drops the numeric instrument id', () => {
    const inst = synthInst({ id: 42, name: 'Acid' });
    const p1 = toRippedPreset(inst, 'Track.mod', 1000);
    const p2 = toRippedPreset({ ...inst, id: 99 }, 'Track.mod', 2000);
    expect(p1.id).toBe(p2.id); // id derived from voice fingerprint, not instance id
    expect(p1.id.startsWith('ripped-')).toBe(true);
    expect('id' in p1.config).toBe(false);
    expect(p1.synthType).toBe('TB303');
  });
});
