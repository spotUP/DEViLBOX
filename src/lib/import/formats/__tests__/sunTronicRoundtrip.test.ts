/**
 * Regression: SunTronic previously round-tripped a FAKE fixed layout — the
 * raw-rip parser emitted an empty 64-row pattern plus a generic MOD codec over
 * 68k player code at offset 0 (ratchet: sunTronic fixed/decode-encode, matchPct
 * 0.1016 over 256 fabricated cells). That layout was the forbidden fake-grid
 * class and has been DELETED (raw rips are honest play-only stubs now).
 *
 * The V1.3 "Delirium" generation (.src/.pc) decodes the REAL score: per-voice
 * command-stream track blocks with byte-exact carriers (cutoff = item length,
 * period/pan/resonance = exact source bytes) on a UADEVariablePatternLayout at
 * honest file offsets, encoded by sunTronicV13Encoder (registered variable
 * encoder). Unedited blocks reproduce verbatim via the carriers; an edited
 * cell's note lane is re-encoded canonically (`~(note - 13)`, the bijective
 * inverse of sunPitchToNote), so the fallback diverges from the raw bytes —
 * the anti-fake-metric witness.
 *
 * Fails on revert: without the carrier stash in decodeSunBlock (or with the
 * old pure-concatenation encoder ignoring the note lane), testkit assertion 1
 * resp. 2 fails.
 *
 * Fixture: public/data/songs/formats/SUNTronicTunes/mule.src (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseSunTronicFile } from '../SunTronicParser';
import { describeVariableBlockCarrier } from './variableBlockCarrier.testkit';

function parse(buffer: ArrayBuffer, filename: string): TrackerSong {
  return parseSunTronicFile(buffer, filename);
}

describeVariableBlockCarrier('sunTronic', parse);

describe('sunTronic V1.3 timeline coverage', () => {
  it('every active channel still has events in the last third of the timeline', () => {
    const FIXTURE = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes/mule.src');
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = parse(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
      'mule.src',
    );

    const numPatterns = song.patterns.length;
    const numChannels = song.patterns[0]?.channels.length ?? 0;
    expect(numPatterns).toBeGreaterThan(0);

    const lastThirdStart = Math.floor((numPatterns * 2) / 3);
    let checkedActive = false;
    for (let ch = 0; ch < numChannels; ch++) {
      let notesEarly = 0;
      let notesLate = 0;
      for (let p = 0; p < numPatterns; p++) {
        const n = song.patterns[p].channels[ch].rows.filter((r) => r.note > 0 && r.note < 97).length;
        if (p < lastThirdStart) notesEarly += n;
        else notesLate += n;
      }
      if (notesEarly > 0) {
        checkedActive = true;
        expect(notesLate, `channel ${ch} plays early but is silent in the final third`).toBeGreaterThan(0);
      }
    }
    expect(checkedActive, 'fixture exercises an active channel').toBe(true);
  });
});
