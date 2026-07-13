/**
 * Regression: SunTronic V1.3 hybrid routing.
 *
 * Auditioning a SunTronic synth instrument must play THAT native voice, not
 * restart the whole module. That requires two wiring points to hold together:
 *
 *   1. the parser decodes each synth record into a `SunTronicSynth` instrument
 *      carrying its `sunTronic` config (buildV13Instruments), and
 *   2. the native→UADE fallback (withNativeThenUADE + injectUADE) preserves that
 *      native synthType instead of clobbering every instrument to
 *      `UADEEditableSynth`, while STILL injecting `uadeEditableFileData` so the
 *      song itself plays through UADE (suppressNotes).
 *
 * Reverting either — the parser marking or the NATIVE_AUDITION_SYNTHS guard in
 * withFallback — flips the synth instruments back to UADEEditableSynth and this
 * fails (the "auditioning a synth plays the whole song" bug).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicFile } from '@/lib/import/formats/SunTronicParser';
import { withNativeThenUADE, type FallbackContext } from '@/lib/import/parsers/withFallback';

function muleBuffer(): ArrayBuffer {
  const bytes = new Uint8Array(
    readFileSync(join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes/mule.src')),
  );
  // Copy into a standalone ArrayBuffer (Node may hand back a pooled buffer).
  return bytes.slice().buffer;
}

describe('SunTronic V1.3 hybrid routing', () => {
  it('parser decodes synth records as native SunTronicSynth voices with config', async () => {
    const song = await parseSunTronicFile(muleBuffer(), 'mule.src', undefined);
    const synths = song.instruments.filter((i) => i.synthType === 'SunTronicSynth');
    expect(synths.length).toBeGreaterThan(0);
    for (const s of synths) {
      expect(s.sunTronic?.sunTronic).toBe(1);
      expect(s.sunTronic!.waveWordLen).toBeGreaterThanOrEqual(0);
    }
  });

  it('fallback keeps SunTronicSynth voices AND injects UADE song playback', async () => {
    const buffer = muleBuffer();
    const ctx: FallbackContext = {
      buffer,
      originalFileName: 'mule.src',
      prefs: {} as FallbackContext['prefs'],
      subsong: 0,
    };
    const song = await withNativeThenUADE(
      'suntronic',
      ctx,
      (buf: ArrayBuffer, name: string) => parseSunTronicFile(buf, name, undefined),
      'SunTronicParser',
      { injectUADE: true },
    );

    // Song plays through UADE (whole-module), grid notes suppressed by the engine.
    expect((song as unknown as { uadeEditableFileData?: ArrayBuffer }).uadeEditableFileData).toBeTruthy();

    // Native audition voices survived the UADEEditableSynth clobber.
    const synths = song.instruments.filter((i) => i.synthType === 'SunTronicSynth');
    expect(synths.length).toBeGreaterThan(0);
    expect(synths.every((s) => s.sunTronic?.sunTronic === 1)).toBe(true);
  });
});
