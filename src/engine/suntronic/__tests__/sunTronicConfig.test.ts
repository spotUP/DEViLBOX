/**
 * Regression: SunTronic config serialization round-trip.
 *
 * The native synth voice is constructed from a persisted `SunTronicConfig` whose
 * waveform/envelope tables are plain number[] (Int8Arrays don't survive JSON —
 * they corrupt to index-objects on localStorage reload). These pin that
 * sunSynthToConfig → JSON → sunConfigToInstrument reproduces a render-identical
 * instrument, and that a config-derived instrument renders the same non-silent
 * voice as the raw descriptor. Fails on revert (a dropped table or type mismatch
 * changes the rendered PCM).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import {
  sunSynthToConfig,
  sunConfigToInstrument,
  renderSunSynthPreview,
} from '../SunTronicVoiceRenderer';

function mule0() {
  const buf = new Uint8Array(
    readFileSync(join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes/mule.src')),
  );
  return parseSunTronicV13Score(buf).synthInstruments[0];
}

describe('SunTronic config serialization round-trip', () => {
  it('survives JSON stringify/parse without losing table data', () => {
    const cfg = sunSynthToConfig(mule0());
    const revived = JSON.parse(JSON.stringify(cfg));
    expect(revived.sunTronic).toBe(1);
    expect(revived.synthType).toBe(cfg.synthType);
    expect(revived.waveWordLen).toBe(cfg.waveWordLen);
    expect(revived.wave1).toEqual(cfg.wave1);
    expect(revived.volEnv).toEqual(cfg.volEnv);
    expect(revived.arpTable).toEqual(cfg.arpTable);
  });

  it('config-derived instrument renders identically to the raw descriptor', () => {
    const raw = mule0();
    const viaConfig = sunConfigToInstrument(JSON.parse(JSON.stringify(sunSynthToConfig(raw))));
    const opts = { periodIndex: 36, seconds: 0.25, sampleRate: 22050 };
    const a = renderSunSynthPreview(raw, opts);
    const b = renderSunSynthPreview(viaConfig, opts);
    expect(Array.from(b)).toEqual(Array.from(a));
    expect(b.some((v) => v !== 0)).toBe(true);
  });
});
