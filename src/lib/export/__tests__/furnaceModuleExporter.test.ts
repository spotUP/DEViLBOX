/**
 * Furnace module writer: build a small Neo Geo song in memory, write it, read it back
 * with the repo's own Furnace parser and compare cell for cell.
 */
import { describe, expect, it } from 'vitest';
import { xmVolToFurnace } from '@/lib/import/furnaceEditorCells';
import { exportFurnaceModule, furnaceModuleExportAvailable, FUR_SYSTEM_YM2610 } from '../FurnaceModuleExporter';
import pako from 'pako';
import { parseFurnaceSong } from '@/lib/import/formats/FurnaceSongParser';
import { DEFAULT_FURNACE } from '@/types/instrument/defaults';
import { EMPTY_CELL } from '@/types/tracker';
import type { Pattern, TrackerCell, ChannelData } from '@/types/tracker';
import type { InstrumentConfig, FurnaceConfig } from '@/types/instrument';

const ROWS = 16;

function channel(i: number): ChannelData {
  return {
    id: `c${i}`, name: `Ch ${i + 1}`, rows: Array.from({ length: ROWS }, () => ({ ...EMPTY_CELL })),
    muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
  };
}

function pattern(id: string): Pattern {
  return { id, name: id, length: ROWS, channels: Array.from({ length: 14 }, (_, i) => channel(i)) };
}

function set(p: Pattern, ch: number, row: number, cell: Partial<TrackerCell>): void {
  p.channels[ch].rows[row] = { ...EMPTY_CELL, ...cell };
}

// Distinct values per operator slot so a wrong operator order shows.
const fmConfig: FurnaceConfig = {
  ...DEFAULT_FURNACE,
  chipType: 14,
  algorithm: 5,
  feedback: 3,
  operators: DEFAULT_FURNACE.operators.map((op, i) => ({ ...op, mult: i + 1, tl: 10 * (i + 1), ar: 20 + i, dr: 5 + i, rr: 3 + i })),
  macros: [],
  opMacros: [{}, {}, {}, {}],
};

const ssgConfig: FurnaceConfig = {
  ...DEFAULT_FURNACE,
  chipType: 14,
  divInsType: 6,
  operators: [],
  macros: [
    { code: 0, type: 0, data: [15, 12, 9, 6, 3, 0], loop: 4, release: -1, mode: 0 },
    { code: 1, type: 0, data: [0, 4, 7, 12], loop: 0, release: -1, mode: 0 },
  ],
  opMacros: [],
};

function inst(id: number, name: string, furnace: FurnaceConfig): InstrumentConfig {
  return { id, name, type: 'synth', synthType: 'FurnaceOPNB', furnace } as unknown as InstrumentConfig;
}

function song() {
  const p0 = pattern('p0');
  const p1 = pattern('p1');
  set(p0, 0, 0, { note: 49, instrument: 1 }); // FM1 C-4
  set(p0, 0, 4, { note: 56, instrument: 1, effTyp: 0, eff: 0x37 }); // arpeggio 037
  set(p0, 0, 8, { note: 97 }); // note off
  set(p0, 4, 2, { note: 52, instrument: 2 }); // SSG1 E-4
  set(p1, 4, 0, { note: 61, instrument: 2 });
  set(p1, 1, 3, { note: 40, instrument: 1 });
  return {
    name: 'Round trip',
    patterns: [p0, p1],
    instruments: [inst(1, 'FM lead', fmConfig), inst(2, 'SSG pluck', ssgConfig)],
    songPositions: [1, 0, 0],
    initialSpeed: 5,
    initialBPM: 130,
  };
}

describe('exportFurnaceModule', () => {
  it('writes a YM2610 module that the Furnace parser reads back', async () => {
    const result = exportFurnaceModule(song());
    const mod = await parseFurnaceSong(result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength) as ArrayBuffer);

    expect(mod.systems[0]).toBe(FUR_SYSTEM_YM2610);
    expect(mod.chans).toBe(14);
    expect(mod.systemChans[0]).toBe(14);
    expect(mod.name).toBe('Round trip');

    const sub = mod.subsongs[0];
    expect(sub.speed1).toBe(5);
    expect(sub.patLen).toBe(ROWS);
    expect(sub.ordersLen).toBe(3);
    expect(sub.virtualTempo).toBe(130);
    for (let ch = 0; ch < 14; ch++) expect(sub.orders[ch].slice(0, 3)).toEqual([1, 0, 0]);
    expect(sub.effectColumns[0]).toBe(1);

    // Cells. File note = (octave + 5) * 12 + semitone; app C-4 (49) is file 108.
    const fileNote = (c: { note: number; octave: number }) => (c.octave + 5) * 12 + c.note;
    const cell = (key: string, row: number) => mod.patterns.get(key)!.rows[row];

    const fm0 = cell('0_0_0', 0);
    expect(fileNote(fm0)).toBe(108);
    expect(fm0.instrument).toBe(0);
    const arp = cell('0_0_0', 4);
    expect(fileNote(arp)).toBe(115);
    expect(arp.effects[0]).toEqual({ type: 0, value: 0x37 });
    expect(cell('0_0_0', 8).note).toBe(180);

    const ssg = cell('0_4_0', 2);
    expect(fileNote(ssg)).toBe(111);
    expect(ssg.instrument).toBe(1);
    expect(fileNote(cell('0_4_1', 0))).toBe(120);
    expect(fileNote(cell('0_1_1', 3))).toBe(99);
    expect(cell('0_0_0', 1).instrument).toBe(-1);

    // FM instrument: operator slots keep their order (file order op1, op3, op2, op4).
    const fm = mod.instruments[0];
    expect(fm.name).toBe('FM lead');
    expect(fm.fm?.algorithm).toBe(5);
    expect(fm.fm?.feedback).toBe(3);
    expect(fm.fm?.operators.map((o) => o.mult)).toEqual([1, 2, 3, 4]);
    expect(fm.fm?.operators.map((o) => o.tl)).toEqual([10, 20, 30, 40]);
    expect(fm.fm?.operators.map((o) => o.ar)).toEqual([20, 21, 22, 23]);

    // SSG instrument: type 6 with its two macros.
    const ay = mod.instruments[1];
    expect(ay.type).toBe(6);
    const vol = ay.macros.find((m) => m.code === 0)!;
    expect(vol.data).toEqual([15, 12, 9, 6, 3, 0]);
    expect(vol.loop).toBe(4);
    const arpMacro = ay.macros.find((m) => m.code === 1)!;
    expect(arpMacro.data).toEqual([0, 4, 7, 12]);
  });

  it('maps the volume column the way the editor does: set volume 0x10-0x50 only, anything else is dropped with a warning', async () => {
    expect([0x10, 0x30, 0x50].map(xmVolToFurnace)).toEqual([0, 64, 127]);
    expect([0x00, 0x01, 0x0f, 0x51, 0x60, 0xff].map(xmVolToFurnace)).toEqual([-1, -1, -1, -1, -1, -1]);
    const s = song();
    set(s.patterns[0], 0, 1, { note: 49, instrument: 1, volume: 0x30 });
    set(s.patterns[0], 0, 2, { note: 49, instrument: 1, volume: 0x07 });
    set(s.patterns[0], 0, 3, { note: 49, instrument: 1, volume: 0x70 });
    const r = exportFurnaceModule(s);
    const mod = await parseFurnaceSong(r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength) as ArrayBuffer);
    const cell = (row: number) => mod.patterns.get('0_0_0')!.rows[row];
    expect(cell(1).volume).toBe(64);
    expect(cell(2).volume).toBe(-1);
    expect(cell(3).volume).toBe(-1);
    expect(r.warnings.filter((w) => w.includes('volume column')).length).toBe(2);
  });

  it('writes Fxx as the store plays it: 01-1F speed (0Fxx), 20-FF BPM (F0xx), 00 stop (FF00)', async () => {
    const s = song();
    set(s.patterns[0], 0, 1, { effTyp: 0x0f, eff: 0x03 });
    set(s.patterns[0], 0, 2, { effTyp: 0x0f, eff: 0x78 });
    set(s.patterns[0], 0, 3, { effTyp: 0x0f, eff: 0x00 });
    const r = exportFurnaceModule(s);
    const mod = await parseFurnaceSong(r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength) as ArrayBuffer);
    const fx = (row: number) => mod.patterns.get('0_0_0')!.rows[row].effects[0];
    expect(fx(1)).toEqual({ type: 0x0f, value: 3 });
    expect(fx(2)).toEqual({ type: 0xf0, value: 0x78 });
    expect(fx(3)).toEqual({ type: 0xff, value: 0 });
  });

  it('round trips every note, instrument, volume and effect cell of a dense song', async () => {
    const s = song();
    const sources: Array<[number, number]> = [];
    for (let ch = 0; ch < 14; ch++) {
      const ins = ch >= 4 && ch < 7 ? 2 : 1;
      for (let row = 0; row < ROWS; row++) {
        if ((row + ch) % 3 === 0) continue;
        set(s.patterns[0], ch, row, {
          note: 13 + ((ch * 5 + row) % 60), instrument: ins, volume: 0x10 + ((row * 4 + ch) % 0x41),
          effTyp: row % 4, eff: (ch * 16 + row) & 0xff, effTyp2: 0x0a, eff2: row,
        });
        sources.push([ch, row]);
      }
    }
    const r = exportFurnaceModule(s);
    const mod = await parseFurnaceSong(r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength) as ArrayBuffer);
    for (const [ch, row] of sources) {
      const src = s.patterns[0].channels[ch].rows[row];
      const got = mod.patterns.get(`0_${ch}_0`)!.rows[row];
      expect((got.octave + 5) * 12 + got.note).toBe(src.note + 59);
      expect(got.instrument).toBe(src.instrument - 1);
      expect(got.volume).toBe(xmVolToFurnace(src.volume));
      expect(got.effects[0]).toEqual({ type: src.effTyp, value: src.eff });
      expect(got.effects[1]).toEqual({ type: 0x0a, value: row });
    }
  });

  it('marks every channel as shown in the pattern view and the channel oscilloscope', () => {
    const bytes = pako.inflate(exportFurnaceModule(song()).bytes);
    // SNG2 writes, per channel: effect column count, then the show byte (Furnace writes 3), then the collapse byte (0).
    const shown = new Array<number>(14).fill(3);
    const collapsed = new Array<number>(14).fill(0);
    const want = [...shown, ...collapsed];
    let found = false;
    for (let i = 0; i + want.length <= bytes.length && !found; i++) {
      found = want.every((v, k) => bytes[i + k] === v);
    }
    expect(found).toBe(true);
  });

  // ngdevkit's furtool.py reads `version <= 240` with the old INFO reader (assert on "INFO"), so a
  // module with INF2 blocks must carry a version above 240. 245 is DIV_ENGINE_VERSION of the vendored
  // Furnace; below it Furnace converts ADSR / LFO macros on load. furtool also takes the clock from
  // the system name (MVS or AES).
  it('writes format version 245 and the system name "Neo Geo MVS", which ngdevkit furtool needs', () => {
    const raw = pako.inflate(exportFurnaceModule(song()).bytes);
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    expect(new TextDecoder().decode(raw.subarray(0, 16))).toBe('-Furnace module-');
    expect(view.getUint16(16, true)).toBe(245);
    const infoAt = view.getUint32(20, true);
    expect(new TextDecoder().decode(raw.subarray(infoAt, infoAt + 4))).toBe('INF2');
    // INF2 body: song name, author, system name (zero-terminated strings).
    const strings: string[] = [];
    let at = infoAt + 8;
    for (let i = 0; i < 3; i++) {
      const end = raw.indexOf(0, at);
      strings.push(new TextDecoder().decode(raw.subarray(at, end)));
      at = end + 1;
    }
    expect(strings).toEqual(['Round trip', '', 'Neo Geo MVS']);
  });

  it('refuses what the module cannot hold', () => {
    const s = song();
    s.patterns[1] = { ...s.patterns[1], length: 32 };
    expect(() => exportFurnaceModule(s)).toThrow(/pattern length/);

    const t = song();
    set(t.patterns[0], 2, 0, { note: 49, instrument: 9 });
    expect(() => exportFurnaceModule(t)).toThrow(/not a Neo Geo instrument/);

    const u = song();
    u.instruments[1] = inst(2, 'Sample', { ...ssgConfig, divInsType: 37, userSample: { name: 's', data: [1, 2], loop: false } } as unknown as FurnaceConfig);
    expect(() => exportFurnaceModule(u)).toThrow(/no 16-bit data/);

    const v = song();
    v.instruments[1] = inst(2, 'Sample', { ...ssgConfig, divInsType: 37, userSample: { name: 's', data: new Int16Array([1, 2]), rate: 0 } } as unknown as FurnaceConfig);
    expect(() => exportFurnaceModule(v)).toThrow(/no rate/);
  });

  it('writes the sample of an ADPCM instrument, once per sample buffer, and the instrument names it', async () => {
    const kick = new Int16Array([0, 1200, -1200, 32767, -32768, 5]);
    const snare = new Int16Array([7, -7, 9]);
    const adpcm = (type: number, data: Int16Array, rate: number, name: string): FurnaceConfig =>
      ({ ...ssgConfig, divInsType: type, macros: [], userSample: { name, data, rate } }) as unknown as FurnaceConfig;
    const s = song();
    s.instruments.push(inst(3, 'Kick', adpcm(37, kick, 18500, 'kick')));
    s.instruments.push(inst(4, 'Kick again', adpcm(37, kick, 18500, 'kick')));
    s.instruments.push(inst(5, 'Snare B', adpcm(38, snare, 22050, 'snare')));
    set(s.patterns[0], 7, 0, { note: 49, instrument: 3 });
    set(s.patterns[0], 8, 0, { note: 49, instrument: 4 });
    set(s.patterns[0], 13, 0, { note: 49, instrument: 5 });

    const r = exportFurnaceModule(s);
    const mod = await parseFurnaceSong(r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength) as ArrayBuffer);
    expect(mod.samples.length).toBe(2);
    expect(Array.from(mod.samples[0].data as Int16Array)).toEqual(Array.from(kick));
    expect(mod.samples[0].c4Rate).toBe(18500);
    expect(mod.samples[0].name).toBe('kick');
    expect(Array.from(mod.samples[1].data as Int16Array)).toEqual(Array.from(snare));
    expect(mod.samples[1].c4Rate).toBe(22050);
    expect(mod.instruments.slice(2).map((i) => i.amiga?.initSample)).toEqual([0, 0, 1]);
    expect(mod.instruments[0].amiga?.initSample ?? -1).toBe(-1);
  });

  it('gives an ADPCM-A and an ADPCM-B instrument on one sample buffer a module sample each (ngdevkit furtool converts a module sample to one codec only)', async () => {
    const kick = new Int16Array([0, 1200, -1200, 32767, -32768, 5]);
    const adpcm = (type: number): FurnaceConfig =>
      ({ ...ssgConfig, divInsType: type, macros: [], userSample: { name: 'kick', data: kick, rate: 18500 } }) as unknown as FurnaceConfig;
    const s = song();
    s.instruments.push(inst(3, 'Kick A', adpcm(37)));
    s.instruments.push(inst(4, 'Kick B', adpcm(38)));
    s.instruments.push(inst(5, 'Kick A again', adpcm(37)));
    set(s.patterns[0], 7, 0, { note: 49, instrument: 3 });
    set(s.patterns[0], 13, 0, { note: 49, instrument: 4 });

    const r = exportFurnaceModule(s);
    const mod = await parseFurnaceSong(r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength) as ArrayBuffer);
    expect(mod.samples.length).toBe(2);
    expect(Array.from(mod.samples[0].data as Int16Array)).toEqual(Array.from(kick));
    expect(Array.from(mod.samples[1].data as Int16Array)).toEqual(Array.from(kick));
    expect(mod.instruments.slice(2).map((i) => i.amiga?.initSample)).toEqual([0, 1, 0]);
  });

  it('writes every pattern the order list names for every channel, an empty one too (ngdevkit nsstool stops on a missing pattern)', () => {
    const bytes = pako.inflate(exportFurnaceModule(song()).bytes);
    const keys = new Set<string>();
    for (let i = 0; i + 14 <= bytes.length; i++) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x41 && bytes[i + 2] === 0x54 && bytes[i + 3] === 0x4e) {
        // "PATN", u32 size, u8 subsong, u8 channel, u16 pattern index
        keys.add(`${bytes[i + 9]}_${bytes[i + 10] | (bytes[i + 11] << 8)}`);
      }
    }
    for (let ch = 0; ch < 14; ch++) {
      expect(keys.has(`${ch}_0`), `channel ${ch} pattern 0`).toBe(true);
      expect(keys.has(`${ch}_1`), `channel ${ch} pattern 1`).toBe(true);
    }
  });

  it('Neo Geo export keeps the SSG/FM balance furtool builds into the ROM: SSG volume 256, so furtool does not lower the SSG volume macros', async () => {
    // ngdevkit furtool check_chip_flags: ssgVol=128 sets HALF_SSG_VOL and every SSG vol macro step
    // drops by one (-2.7 dB), not the -6 dB Furnace applies; the ROM then plays SSG 3.3 dB louder
    // against FM than DEViLBOX. Only 256 (with fmVol at its default 256) plays the same everywhere.
    const r = exportFurnaceModule(song());
    const mod = await parseFurnaceSong(r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength) as ArrayBuffer);
    expect(mod.chipFlags).toEqual(['ssgVol=256\n']);
    expect((mod.chipFlags ?? []).join('')).not.toMatch(/fmVol=(?!256)/);
  });

  it('keeps the second speed, the grooves and the compat flags of a loaded Furnace module', async () => {
    const r = exportFurnaceModule({
      ...song(),
      speed2: 3,
      grooves: [[6, 4, 5], [2, 2]],
      compatFlags: { limitSlides: true, linearPitch: 2, pitchSlideSpeed: 9, brokenShortcutSlides: false },
    });
    const mod = await parseFurnaceSong(r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength) as ArrayBuffer);
    expect(mod.subsongs[0].speed1).toBe(5);
    expect(mod.subsongs[0].speed2).toBe(3);
    expect(mod.grooves.map((g) => g.val.slice(0, g.len))).toEqual([[6, 4, 5], [2, 2]]);
    expect(mod.compatFlags.limitSlides).toBe(true);
    expect(mod.compatFlags.linearPitch).toBe(2);
    expect(mod.compatFlags.pitchSlideSpeed).toBe(9);
    expect(mod.compatFlags.brokenShortcutSlides).toBe(false);
  });

  it('offers the export only for Neo Geo instruments', () => {
    expect(furnaceModuleExportAvailable(song().instruments)).toBe(true);
    expect(furnaceModuleExportAvailable([{ id: 1, name: 'x', type: 'synth', synthType: 'Synth' } as unknown as InstrumentConfig])).toBe(false);
  });
});
