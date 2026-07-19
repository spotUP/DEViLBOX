/**
 * Regression: SNX (Sonix Music Driver) playback-cursor sync + readable scroll speed.
 *
 * The editor cursor follows the WASM driver's native counter, which advances ONCE per CIA
 * tick (sonix.c snx_process_tick). The SNX clock ticks ~49 Hz, so mapping one grid row to
 * one CIA tick scrolls the pattern ~49 rows/s — unreadably fast ("the patterns just fly by").
 * Amiga trackers never show one row per tick: a display row spans `speed` ticks. So the SNX
 * parser quantizes the CIA-tick timeline to display rows of SNX_TICKS_PER_ROW (=6) ticks each
 * — ~8 rows/s — and SonixEngine divides the native tick counter by the same factor, keeping
 * the cursor in sync. Playback is untouched (the raw byte carrier reproduces unedited streams
 * verbatim).
 *
 * Ground truth for the fixture (native probe of the real WASM driver): snx.theme runs an
 * 888-CIA-tick cycle before it loops. Quantized at 6 ticks/row that is ceil(888/6) = 148
 * display rows, shared by all four voices. On revert to the one-row-per-tick model each
 * voice inflates back to 888 rows (6x too fast) — the length assertion below fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSnxVoiceStream } from '../SonixMusicDriverParser';
import { encodeSnxVoiceStream } from '@/engine/uade/encoders/SonixMusicDriverEncoder';
import { SNX_TICKS_PER_ROW } from '@/engine/sonix/sonixPosition';
import { SNX_FX } from '../sonixEffectGlyphs';
import type { TrackerCell } from '@/types';

const FIXTURE = join(
  process.cwd(),
  'public/data/songs/sonix/snx/Where in Time is Carmen Sandiego/snx.theme',
);

/** Split snx.theme into its four voice streams via the 4×u32BE section-length header. */
function snxChannels(): TrackerCell[][] {
  const b = readFileSync(FIXTURE);
  const buf = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  const u32 = (o: number) =>
    ((buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]) >>> 0;
  const lens = [u32(0), u32(4), u32(8), u32(12)];
  const channels: TrackerCell[][] = [];
  let off = 20; // voice streams start after the 4-length header + 4 reserved bytes
  for (let ch = 0; ch < 4; ch++) {
    channels.push(parseSnxVoiceStream(buf, off, lens[ch]));
    off += lens[ch];
  }
  return channels;
}

describe('SNX row-grid parser (cursor sync + readable scroll)', () => {
  it('quantizes the tick axis to SNX_TICKS_PER_ROW-tick rows shared by all four voices', () => {
    const channels = snxChannels();
    const lengths = channels.map((c) => c.length);

    // Every voice ends on the same row — the shared display axis the cursor rides.
    expect(new Set(lengths).size, `channel lengths ${lengths}`).toBe(1);

    // 888-tick cycle quantized at SNX_TICKS_PER_ROW ticks/row = 148 rows. On revert to the
    // one-row-per-tick model this is 888 (6x too fast) and the assertion fails.
    expect(lengths[0]).toBe(Math.ceil(888 / SNX_TICKS_PER_ROW));
    expect(lengths[0]).toBe(148);
  });
});

describe('SNX tick-grid semantics', () => {
  const u16be = (words: number[]) => {
    const u = new Uint8Array(words.length * 2);
    for (let i = 0; i < words.length; i++) {
      u[i * 2] = (words[i] >> 8) & 0xff;
      u[i * 2 + 1] = words[i] & 0xff;
    }
    return u;
  };

  it('a note lands on floor(onsetTick / SNX_TICKS_PER_ROW); one WAIT(6) advances one row', () => {
    // NOTE(C) WAIT6  NOTE(E) WAIT6  END → 2 rows, notes at row 0 and row 1 (6 ticks apart).
    const w = SNX_TICKS_PER_ROW;
    const stream = u16be([
      (36 << 8) | 100, // note index 36 at tick 0 -> row 0
      0xc000 | w, // WAIT SNX_TICKS_PER_ROW -> advance to tick 6
      (40 << 8) | 100, // note index 40 at tick 6 -> row 1
      0xc000 | w,
      0xffff,
    ]);
    const cells = parseSnxVoiceStream(stream, 0, stream.length);

    expect(cells.length).toBe(2);
    expect(cells[0].note).toBe(36);
    expect(cells[1].note).toBe(40);
  });

  it('sub-row grace notes collapse: two onsets within one row keep the first', () => {
    // NOTE(C) WAIT1  NOTE(E) WAIT5  END → both onsets (tick 0, tick 1) fall in row 0;
    // the first note wins, the row count is 1 (6 ticks quantized to a single row).
    const stream = u16be([
      (36 << 8) | 100, // tick 0 -> row 0
      0xc000 | 1, // WAIT 1 -> tick 1 (still row 0)
      (40 << 8) | 100, // tick 1 -> row 0 (grace, dropped)
      0xc000 | 5, // WAIT 5 -> tick 6
      0xffff,
    ]);
    const cells = parseSnxVoiceStream(stream, 0, stream.length);

    expect(cells.length).toBe(1);
    expect(cells[0].note).toBe(36); // first onset in the row wins
  });

  it('encoder is the tick-grid inverse: parse -> encode -> parse is grid-identical', () => {
    // The edited-path encoder must reproduce the SAME tick grid the parser reads (the raw
    // carrier only covers unedited streams). Round-trip every real snx.theme voice through
    // encode->parse and assert the note/instrument/timing grid is preserved exactly.
    const channels = snxChannels();
    for (let ch = 0; ch < channels.length; ch++) {
      const grid = channels[ch];
      const bytes = encodeSnxVoiceStream(grid, ch);
      const reparsed = parseSnxVoiceStream(bytes, 0, bytes.length);
      expect(reparsed.length, `channel ${ch} length preserved`).toBe(grid.length);
      for (let r = 0; r < grid.length; r++) {
        expect(reparsed[r].note ?? 0, `ch${ch} row${r} note`).toBe(grid[r].note ?? 0);
        expect(reparsed[r].instrument ?? 0, `ch${ch} row${r} instr`).toBe(grid[r].instrument ?? 0);
      }
    }
  });

  it('maps 0x81/0x82/0x83 to the chanVol/tempo/detune effect columns + velocity to volume', () => {
    // NOTE(vel 64) with channel-vol 0x81=0x40, tempo 0x82=0x06, detune 0x83=0xFF, all at
    // tick 0 -> one row carrying velocity in the volume column and the three effect columns.
    // On revert to the mislabeled parser (0x83=volume, 0x81/0x82 dropped) these fail.
    const stream = u16be([
      0x8140, // channel volume = 0x40
      0x8206, // tempo = 6
      0x83ff, // detune = -1 (signed)
      (36 << 8) | 64, // note 36, velocity 64
      0xc000 | SNX_TICKS_PER_ROW,
      0xffff,
    ]);
    const cells = parseSnxVoiceStream(stream, 0, stream.length);

    expect(cells.length).toBe(1);
    const c = cells[0];
    expect(c.note).toBe(36);
    // Velocity 64/127 -> XM volume 0x10 + round(64/127*64) = 0x10 + 32 = 0x30.
    expect(c.volume).toBe(0x10 + Math.round((64 / 127) * 64));
    expect(c.effTyp).toBe(SNX_FX.chanVol);
    expect(c.eff).toBe(0x40);
    expect(c.effTyp2).toBe(SNX_FX.tempo);
    expect(c.eff2).toBe(0x06);
    expect(c.effTyp3).toBe(SNX_FX.detune);
    expect(c.eff3).toBe(0xff);
  });

  it('round-trips the effect columns: parse -> encode -> parse preserves chanVol/tempo/detune', () => {
    const stream = u16be([
      0x8155,
      0x820a,
      0x8380, // detune -128
      (48 << 8) | 100,
      0xc000 | SNX_TICKS_PER_ROW,
      0xffff,
    ]);
    const grid = parseSnxVoiceStream(stream, 0, stream.length);
    const encoded = encodeSnxVoiceStream(grid, 0);
    const reparsed = parseSnxVoiceStream(encoded, 0, encoded.length);
    expect(reparsed.length).toBe(grid.length);
    expect(reparsed[0].effTyp).toBe(SNX_FX.chanVol);
    expect(reparsed[0].eff).toBe(0x55);
    expect(reparsed[0].effTyp2).toBe(SNX_FX.tempo);
    expect(reparsed[0].eff2).toBe(0x0a);
    expect(reparsed[0].effTyp3).toBe(SNX_FX.detune);
    expect(reparsed[0].eff3).toBe(0x80);
  });

  it('0x0000 is a 0-tick no-op — it advances neither the clock nor a row', () => {
    // NOTE WAIT6  0x0000 x6  NOTE WAIT6  END. If 0x0000 spent a tick each (the old
    // "rest for 1 tick"), the six no-ops would push the 2nd note to tick 12 -> row 2 and
    // inflate the grid to 3 rows. As a true no-op the 2nd note stays at tick 6 -> row 1.
    const w = SNX_TICKS_PER_ROW;
    const stream = u16be([
      (36 << 8) | 100,
      0xc000 | w,
      0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
      (40 << 8) | 100,
      0xc000 | w,
      0xffff,
    ]);
    const cells = parseSnxVoiceStream(stream, 0, stream.length);
    expect(cells.length).toBe(2);
    expect(cells[0].note).toBe(36);
    expect(cells[1].note).toBe(40);
  });
});
