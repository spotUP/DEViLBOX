/**
 * Medley (.mso): the grid is read from the module's track streams (medleyGrid.ts).
 * Unedited export is byte-identical; one edited note moves exactly the stored byte it is played from.
 * Fixture: public/data/songs/medley/combat.mso (real module). Unverified by ear.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseMedleyFile } from '../MedleyParser';
import { exportMedley } from '@/lib/export/MedleyExporter';
import { encodeVariableBlock } from '@/engine/uade/UADEPatternEncoder';
import { buildMedleyGrid, applyMedleyGridEdits, MEDLEY_ROWS_PER_PATTERN } from '../medleyGrid';
import { MD_FX } from '../commandStreamEffectGlyphs';

const FIXTURE = join(process.cwd(), 'public/data/songs/medley/combat.mso');

async function load() {
  const b = readFileSync(FIXTURE);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return { raw: new Uint8Array(ab), song: await parseMedleyFile(ab, 'combat.mso') };
}

describe('Medley track-stream grid', () => {
  it('re-encodes every track stream byte-exact and exports the module unchanged', async () => {
    const { raw, song } = await load();
    const l = song.uadeVariableLayout!;
    expect(l.formatId).toBe('medley');
    l.filePatternAddrs.forEach((addr, fp) => {
      if (!addr) return;
      const re = encodeVariableBlock(l, fp, l.blockRows![fp], fp);
      expect(Array.from(re)).toEqual(Array.from(raw.subarray(addr, addr + l.filePatternSizes[fp])));
    });
    const out = await exportMedley(song);
    expect(out.warnings).toEqual([]);
    expect(Array.from(out.data)).toEqual(Array.from(raw));
  });

  it('one changed note changes only the stored byte(s) it is played from', async () => {
    const { raw, song } = await load();
    const nb = song.uadeVariableLayout!.noteBytes!;
    // a byte played from exactly one cell
    const count = new Map<number, number>();
    nb.forEach(x => count.set(x.offset, (count.get(x.offset) ?? 0) + 1));
    const n = nb.find(x => count.get(x.offset) === 1 && raw[x.offset] > 1 && raw[x.offset] < 100)!;
    expect(n).toBeTruthy();
    const cell = song.patterns[n.pattern].channels[n.channel].rows[n.row];
    expect(cell.note).toBe(n.note);
    cell.note = n.note + 2;
    const out = await exportMedley(song);
    expect(out.warnings).toEqual([]);
    const diff: number[] = [];
    out.data.forEach((v, i) => { if (v !== raw[i]) diff.push(i); });
    expect(diff).toEqual([n.offset]);
    expect(out.data[n.offset]).toBe(raw[n.offset] + 2);
  });

  it('puts known audio time on a known row (voice 1 of subsong 1 starts a note on tick 0; every voice loops)', async () => {
    const { raw } = await load();
    const g = buildMedleyGrid(raw, 'x', 1)!;
    expect(g.unsupportedVoices).toEqual([]);
    expect(g.ticks).toBeGreaterThan(1);
    // track 10 (voice 4) is C5(2) C5(12) C0: after the call script, a note on tick 0 of that voice when one is placed there
    const first = g.placements.filter(p => p.tick === 0).map(p => p.voice);
    expect(first.length).toBeGreaterThan(0);
    // every sounding voice has notes in the last pattern's range or loops back (timeline filled)
    for (const v of [0, 3]) expect(g.placements.some(p => p.voice === v)).toBe(true);
  });

  // Stage 2. Expected values come from the reference replayer (nuade medley.c / mdl_module.c) run as a scratch mirror, not from this grid.
  it('puts notes on the replayer ticks: first step, after a loop pass, after a Call, and in the second pass of a restarted track', async () => {
    const { raw } = await load();
    const g = buildMedleyGrid(raw, 'x', 1)!;
    const at = (voice: number, tick: number) => g.placements.find(p => p.voice === voice && p.tick === tick);
    // voice:tick:stream offset:grid note. Voice 1 tick 108 is after a loop pass; voice 4 tick 114 follows a Call.
    const known: Array<[number, number, number, number]> = [[0, 0, 904, 10], [0, 108, 906, 10], [3, 0, 938, 29], [3, 114, 940, 29]];
    for (const [v, t, off, note] of known) {
      const p = at(v, t);
      expect(p, `voice ${v} tick ${t}`).toBeTruthy();
      expect(p!.offset).toBe(off);
      expect(p!.note).toBe(note);
    }
    expect(g.ticks).toBe(384);
  });

  it('a grid row is one 50 Hz replayer tick (speed * 2.5 / BPM = 0.02 s)', async () => {
    const { song } = await load();
    expect(song.initialSpeed * 2.5 / song.initialBPM).toBeCloseTo(0.02, 6);
  });

  it('keeps note offset and instrument across a track restart (replayer End does not reset them)', async () => {
    const { raw } = await load();
    const u = (o: number) => ((raw[o] << 24) | (raw[o + 1] << 16) | (raw[o + 2] << 8) | raw[o + 3]) | 0;
    const t = 8 + u(8);
    const e = t + 10 * 4 + u(t + 10 * 4) + 16; // first item of track 10, voice 4's own track
    const patched = new Uint8Array(raw);
    patched[e + 2] = 0x88; // Transpose
    patched[e + 3] = 5;
    const g = buildMedleyGrid(patched, 'x', 1)!;
    const note = (tick: number) => g.placements.find(p => p.voice === 3 && p.tick === tick)?.note;
    expect(note(180)).toBe(29); // first pass, before the transpose is reached again
    expect(note(192)).toBe(34); // second pass: the transpose set in pass one is still in force
  });

  it('maps sampled pitch from the replayer period table (entry 50 = 856, entry 62 = 428)', async () => {
    const src = readFileSync(join(process.cwd(), 'third-party/nuade/players/medley/mdl_data.c'), 'utf8');
    const body = src.slice(src.indexOf('mdl_period_table'), src.indexOf('};'));
    const table = [...body.matchAll(/0x[0-9a-fA-F]+/g)].map(m => parseInt(m[0], 16));
    expect(table[50]).toBe(0x358);
    expect(table[62]).toBe(0x1ac);
  });

  it('an instrument edit writes the Instrument command argument byte and reaches every note it serves', async () => {
    const { raw } = await load();
    const g = buildMedleyGrid(raw, 'x', 1)!;
    const served = g.placements.filter(p => p.voice === 3 && p.instrOffset === 935);
    expect(served.length).toBeGreaterThan(5);
    const edited = g.patterns.map(p => ({ ...p, channels: p.channels.map(c => ({ ...c, rows: c.rows.map(r => ({ ...r })) })) }));
    const first = served[0];
    edited[Math.floor(first.tick / 64)].channels[3].rows[first.tick % 64].instrument = 17;
    const r = applyMedleyGridEdits(raw, edited, 1);
    expect(r.warnings).toEqual([]);
    const diff: number[] = [];
    r.data.forEach((v, i) => { if (v !== raw[i]) diff.push(i); });
    expect(diff).toEqual([935]);
    expect(r.data[935]).toBe(17);
    const g2 = buildMedleyGrid(r.data, 'x', 1)!;
    for (const p of served) expect(g2.placements.find(q => q.voice === 3 && q.tick === p.tick)!.instrument).toBe(17);
  });
});

describe('Medley instruments and song length (combat.mso)', () => {
  it('lists every instrument of the module table, named from the file, numbered as the stream numbers them', async () => {
    const { song } = await load();
    expect(song.instruments.length).toBe(22);
    expect(song.instruments.map(i => i.id)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect(song.instruments[0].name).toBe('Pipe Organ');
    expect(song.instruments[13].name).toBe('Snaredrum');
    expect(song.instruments[21].name).toBe('ubba');
    const used = new Set<number>();
    for (let sub = 1; sub <= 7; sub++) for (const pl of buildMedleyGrid((await load()).raw, '', sub)!.placements) used.add(pl.instrument);
    for (const n of used) expect(song.instruments.some(i => i.id === n), `instrument ${n}`).toBe(true);
    expect(used.size).toBeGreaterThan(1);
  });

  it('subsong 7 (Combat) is walked to its real end of 123264 ticks, not cut at 60000', async () => {
    const { raw } = await load();
    const g = buildMedleyGrid(raw, '', 7)!;
    expect(g.ticks).toBe(123264);
    expect(g.patterns.length * 64).toBeGreaterThanOrEqual(g.ticks);
    expect(buildMedleyGrid(raw, '', 1)!.ticks).toBe(384);
  });
});


describe('Medley stream commands in the effect columns (combat.mso)', () => {
  const FX_KEYS = [['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5']] as const;
  const cellAt = (g: ReturnType<typeof buildMedleyGrid>, voice: number, tick: number) =>
    g!.patterns[Math.floor(tick / MEDLEY_ROWS_PER_PATTERN)].channels[voice].rows[tick % MEDLEY_ROWS_PER_PATTERN];
  /** Set the value of every cell that runs the command whose parameter byte is `offset`. */
  const setParam = (g: NonNullable<ReturnType<typeof buildMedleyGrid>>, offset: number, value: number) => {
    for (const fx of g.effects.filter(e => e.offset === offset)) cellAt(g, fx.voice, fx.tick)[FX_KEYS[fx.slot][1]] = value;
  };

  it('Volume command (track 22, parameter byte 1841) shows as V7F and an edit writes only that byte', async () => {
    const { raw } = await load();
    const sub = [1, 2, 3, 4, 5, 6, 7].find(s => buildMedleyGrid(raw, '', s)!.effects.some(e => e.offset === 1841))!;
    expect(sub).toBeTruthy();
    const g = buildMedleyGrid(raw, '', sub)!;
    const fx = g.effects.find(e => e.offset === 1841)!;
    expect(fx.effTyp).toBe(MD_FX.volume);
    expect(raw[1841]).toBe(127);
    const cell = cellAt(g, fx.voice, fx.tick);
    expect([cell[FX_KEYS[fx.slot][0]], cell[FX_KEYS[fx.slot][1]]]).toEqual([MD_FX.volume, 127]);
    setParam(g, 1841, 64);
    const r = applyMedleyGridEdits(raw, g.patterns, sub);
    expect(r.warnings).toEqual([]);
    const diff: number[] = [];
    r.data.forEach((v, i) => { if (v !== raw[i]) diff.push(i); });
    expect(diff).toEqual([1841]);
    expect(r.data[1841]).toBe(64);
    // the replayer's view of the edited module: the command now carries 64
    expect(buildMedleyGrid(r.data, '', sub)!.effects.find(e => e.offset === 1841)!.value).toBe(64);
  });

  it('Transpose command shows as T and an edit moves the notes after it, byte-exact', async () => {
    const { raw } = await load();
    const g = buildMedleyGrid(raw, '', 1)!;
    const fx = g.effects.find(e => e.effTyp === MD_FX.transpose && e.voice === 0 && e.offset === 1199)!;
    expect(fx).toBeTruthy();
    expect(raw[1199]).toBe(253);
    const before = g.placements.find(p => p.voice === 0 && p.tick >= fx.tick)!;
    setParam(g, 1199, 255);
    const r = applyMedleyGridEdits(raw, g.patterns, 1);
    expect(r.warnings).toEqual([]);
    const diff: number[] = [];
    r.data.forEach((v, i) => { if (v !== raw[i]) diff.push(i); });
    expect(diff).toEqual([1199]);
    const after = buildMedleyGrid(r.data, '', 1)!.placements.find(p => p.voice === 0 && p.tick === before.tick)!;
    expect(after.note - before.note).toBe(2);
  });

  it('RandomTrack is shown as an effect with its bytes kept, and no note is invented after it', async () => {
    const { raw } = await load();
    const patched = new Uint8Array(raw);
    patched[1840] = 0x84; // the Volume command of track 22 becomes RandomTrack with 2 choices
    patched[1841] = 2;
    const sub = [1, 2, 3, 4, 5, 6, 7].find(s => buildMedleyGrid(patched, '', s)!.effects.some(e => e.offset === 1841))!;
    const g = buildMedleyGrid(patched, '', sub)!;
    const fx = g.effects.find(e => e.offset === 1841)!;
    expect(fx.effTyp).toBe(MD_FX.randomTrack);
    expect(g.unsupportedVoices).toContain(fx.voice);
    expect(cellAt(g, fx.voice, fx.tick)[FX_KEYS[fx.slot][1]]).toBe(2);
    expect(g.placements.some(p => p.voice === fx.voice && p.tick > fx.tick)).toBe(false);
    const r = applyMedleyGridEdits(patched, g.patterns, sub);
    expect(r.warnings).toEqual([]);
    expect(Array.from(r.data)).toEqual(Array.from(patched));
  });
});
