/**
 * vsmWordTable.test.ts — the VSM directory must be read, not guessed.
 *
 * The Speak & Spell VSM describes itself: byte 0-3 hold the entry-byte count of each of
 * the four spelling lists, byte 4-11 their start addresses, byte 0x0C onwards the system
 * phrase table, and each spelling-list entry carries a 6-bit ASCII name followed by the
 * address of its recording.
 *
 * Two earlier implementations got this wrong. The first scanned the ROM for anything that
 * decoded as LPC frames and applied gap heuristics. The second read a monotonic run of
 * 16-bit values from byte 4 as if every one were a recording address — which works for the
 * letters, digits and the four prompts, then walks straight into the INDIRECT slots
 * ("wrong", "spell", "now try", ...) and the spelling lists, so every entry from the 43rd
 * on played unrelated speech data mid-word. That is the "44-199 sound broken" symptom.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseVSMDirectory } from '../VSMROMParser';

const ROMS = join(process.cwd(), 'public/roms/snspell');
const VSM0 = join(ROMS, 'tmc0351n2l.vsm');
const VSM1 = join(ROMS, 'tmc0352n2l.vsm');
const present = [VSM0, VSM1].every(existsSync);

function directory() {
  const rom = new Uint8Array(Buffer.concat([readFileSync(VSM0), readFileSync(VSM1)]));
  return { words: parseVSMDirectory(rom), size: rom.length };
}

describe('VSM directory', () => {
  it.skipIf(!present)('reads the letters, the beep and the digits in hardware order', () => {
    const { words } = directory();
    expect(words.slice(0, 26).map(w => w.name)).toEqual('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
    expect(Math.floor(words[0].startBit / 8)).toBe(1296);
    expect(words[26].name).toBe('(beep)');
    expect(words[27].name).toBe('ZERO');
    expect(words[37].name).toBe('TEN');
    expect(words[38].name).toBe('"that is correct"');
  });

  it.skipIf(!present)('resolves the indirect phrase slots instead of playing their pointers', () => {
    const { words } = directory();
    const wrong = words.find(w => w.name === '"wrong"');
    expect(wrong).toBeDefined();
    // Slot 42 of the system table holds 3216, which is a pointer, not speech.
    expect(Math.floor(wrong!.startBit / 8)).not.toBe(3216);
    // Resolving it lands on a real recording.
    expect(wrong!.frames.length).toBeGreaterThan(8);
  });

  it.skipIf(!present)('reads the spelled vocabulary with its real names', () => {
    const { words } = directory();
    const names = words.map(w => w.name);
    expect(names).toContain('COLOR');
    expect(names).toContain('QUESTION');
    expect(names).toContain("COULDN'T");   // the ROM encodes the apostrophe as '['
    expect(names).toContain('RHYTHM');
    // 26 letters + beep + 11 numbers + 20 phrases/tones, then 117 spelling words.
    expect(words.length).toBe(175);
    // Nothing is left as a placeholder.
    expect(names.filter(n => /^Word \d+$/.test(n))).toHaveLength(0);
  });

  it.skipIf(!present)('points every entry at a decodable recording inside the ROM', () => {
    const { words, size } = directory();
    for (const word of words) {
      const byte = Math.floor(word.startBit / 8);
      expect(byte).toBeGreaterThan(0);
      expect(byte).toBeLessThan(size);
    }
    const real = words.filter(w => w.frames.length >= 6);
    expect(real.length / words.length).toBeGreaterThan(0.9);
  });

  it.skipIf(!present)('ends each recording before the next one starts', () => {
    // A recording that runs past its neighbour means the address is wrong: the decoder
    // missed the stop frame and is reading someone else's speech. The old table failed
    // this for 40 entries.
    const { words } = directory();
    const bitsPerFrame = { silent: 4, repeat: 10, unvoiced: 28, voiced: 49 };
    const sorted = [...words].sort((a, b) => a.startBit - b.startBit);
    let overruns = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      let end = sorted[i].startBit;
      for (const frame of sorted[i].frames) {
        if (frame.energy === 0) end += bitsPerFrame.silent;
        else if (frame.repeat) end += bitsPerFrame.repeat;
        else end += frame.unvoiced ? bitsPerFrame.unvoiced : bitsPerFrame.voiced;
      }
      end += 4; // the stop frame itself
      if (sorted[i + 1].startBit > sorted[i].startBit && end > sorted[i + 1].startBit + 8) overruns++;
    }
    expect(overruns).toBe(0);
  });
});
