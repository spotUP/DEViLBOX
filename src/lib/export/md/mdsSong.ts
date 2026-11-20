/**
 * Mega Drive native player, MDSDRV route (plan 2026-11-20-megadrive-native-player, Phase 1):
 * Furnace Genesis song -> MDSDRV sequence data (third-party/mdsdrv/doc/mdsseq.md), the song data
 * for the real driver, never a register stream.
 *
 * Blob layout (offsets from `sdtop`, so the blob is position independent and must sit on an even address):
 *   header  `10 01 1f 00`, version word 3, sequence count word 2
 *   sdtop   dc.l pcm_tab-sdtop, dc.l bgm-sdtop
 *   items   pcm_tab (`dc.w 0`), FM voices, PSG envelopes, pitch envelopes, macro tables, subroutines
 *   bgm     dc.w tbase-bgm, dc.b tvol, tcount, per track `dc.b chan,0; dc.w pos-tbase`
 *   tbase   dc.w item-sdtop (song table, index 0..255; E1/E8/EB/FE take this index)
 *   tracks  one command stream per used channel
 *
 * One Furnace order occurrence becomes one chunk per channel. Chunks whose bytes repeat become `FE`
 * subroutines. The song loop is `FA` at the loop chunk and `FB 00` at the end. The driver ticks once per
 * NTSC frame at `F9 7F` (Phase 0), and every length byte is ticks-1 (max 128 ticks per byte).
 */
import type { FurnaceModule } from '../../import/formats/FurnaceSongParser';
import type { FurnaceInstrument, FurnaceMacro } from '../../import/formats/furnace/FurnaceInstrumentParser';
import { convertFurnaceNoteValue } from '../../import/formats/furnace/FurnacePatternParser';
import { arpIsFixed, expandProcMacro } from '../nes/famistudioSong';

export interface MdsKeyOn { tick: number; ch: number; note: number }
export interface MdsSong {
  /** The sequence, to `incbin` at the driver's sequence address (even aligned). */
  seq: Uint8Array;
  /** One line per lossy Furnace item with its count. */
  lossy: string[];
  /** Furnace note-ons in play order (Furnace note value, C-4 = 48), for the MAME key-on check. */
  keyOns: MdsKeyOn[];
}

type Kind = 'fm' | 'psg' | 'noise';
const MDS_CHAN: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const KIND: Kind[] = ['fm', 'fm', 'fm', 'fm', 'fm', 'fm', 'psg', 'psg', 'psg', 'noise'];
/** With voice transpose $30 the FM note equals the Furnace note value; PSG note 0 is Furnace C-2 (value 24). */
const FM_TRANSPOSE = 0x30;
const PSG_OFFSET = 24;
const MAX_NOTE = 0xdf - 0x82;
const MACRO_VOL = 0, MACRO_ARP = 1, MACRO_PITCH = 4;
const FX_FLOW = new Set([0x0b, 0x0d, 0x09, 0x0f, 0xff]);
const NTSC_HZ = 59.922743;
/** Furnace SN noise mode bits (sms.cpp snNoiseMode: bit 0 white, bit 1 PSG3 period) -> MDSDRV `EA` (mdsseq.md). Reset value 3. */
const NOISE_EA = [0, 0, 0xe3, 0xe7];

/** MDSDRV PSG period at keycode k with fine pitch 0: mds_psg_freq_tab >> octave (mdsdrv.68k mds_get_psg_pitch). */
const PSG_TAB = [1710, 1614, 1524, 1438, 1357, 1281, 1209, 1141, 1077, 1017, 960, 906];
const psgPeriod = (k: number): number => PSG_TAB[k % 12] >> Math.floor(k / 12);

/**
 * MDSDRV keycode for a noise note in a PSG3-rate mode (20xy, x=1). Furnace "easy noise" (sms.cpp snCalcFreq / NOTE_SN):
 * above the threshold each semitone steps the PSG3 period down by one from 16, and with snNoLowPeriods any
 * note above 153 writes period 1. Below the threshold the tone mapping applies (nv - PSG_OFFSET).
 * shortcut: assumes noiseDivider 64 (Sega PSG chipType 0) and no pitch/arp offset; upgrade when a song uses chipType 1/2.
 */
function noiseKey(m: FurnaceModule, nv: number, lossy: { add(s: string): void }): number {
  const N = nv + 60; // FurnacePatternParser drops the +60 of splitNoteToNote; actualNote is the full note.
  const oct = Math.log2(3579545 / (16 * 64) / (0.0625 * (m.tuning || 440)));
  let p: number;
  if (m.compatFlags.linearPitch) { // snCalcFreq, 1/128-semitone units
    const thr = Math.round(128 * 12 * oct) - 384 + 64 + 60 * 128;
    if ((N << 7) <= thr) return nv - PSG_OFFSET;
    p = Math.max(0, (2048 - ((N << 7) - thr)) >> 7);
  } else { // NOTE_SN, whole notes
    const thr = Math.round(12 * oct) - 3 + 60;
    if (N <= thr) return nv - PSG_OFFSET;
    p = Math.max(0, 16 - (N - thr));
  }
  if (m.compatFlags.snNoLowPeriods && N > 153) p = 1;
  if (p < 1) { lossy.add('noise PSG3 period 0 (MDSDRV minimum 1)'); p = 1; }
  for (let k = 119; k >= 0; k--) if (psgPeriod(k) >= p) return k; // highest key at or above the period: exact for 1..16
  return 0;
}

class Lossy {
  private counts = new Map<string, number>();
  add(item: string, n = 1): void { this.counts.set(item, (this.counts.get(item) ?? 0) + n); }
  list(): string[] { return [...this.counts].map(([k, n]) => `${k}: ${n}`); }
}

function macro(ins: FurnaceInstrument | undefined, code: number, version: number): FurnaceMacro | undefined {
  const m = ins?.macros.find((x) => x.code === code && x.length > 0);
  return m && m.type !== 0 ? expandProcMacro(m, version) : m;
}

/** Macro steps as per-tick values; `loop` is a tick index or -1. */
function ticksOf(m: FurnaceMacro, lossy: Lossy, what: string): { vals: number[]; loop: number } {
  const sp = Math.max(1, m.speed);
  if (m.delay > 0) lossy.add(`${what} macro delay (ignored)`);
  if (m.release >= 0 && m.release < m.length) lossy.add(`${what} macro release point (ignored)`);
  const vals = m.data.slice(0, m.length).flatMap((v) => Array<number>(sp).fill(v));
  return { vals, loop: m.loop >= 0 && m.loop < m.length && m.loop !== 255 ? m.loop * sp : -1 };
}

/** 30-byte FM voice in register order (op slots 1,3,2,4 = Furnace operators 0,2,1,3). */
function fmVoice(ins: FurnaceInstrument | undefined, lossy: Lossy): number[] {
  const fm = ins?.fm;
  if (!fm || fm.operators.length < 4) { lossy.add('FM channel instrument without FM data (default voice)'); return [...Array<number>(24).fill(0), 0x7f, 0x7f, 0x7f, 0, 7, FM_TRANSPOSE]; }
  if ((fm.fms ?? 0) || (fm.ams ?? 0)) lossy.add('FM LFO sensitivity (FMS/AMS)');
  const DT = [7, 6, 5, 0, 1, 2, 3, 4];
  const ops = [0, 2, 1, 3].map((i) => fm.operators[i]);
  const row = (f: (o: (typeof ops)[number]) => number) => ops.map(f);
  return [
    ...row((o) => (DT[o.dt & 7] << 4) | (o.mult & 15)),
    ...row((o) => ((o.rs ?? 0) << 6) | (o.ar & 31)),
    ...row((o) => (o.am ? 0x80 : 0) | (o.dr & 31)),
    ...row((o) => o.d2r & 31),
    ...row((o) => ((o.sl & 15) << 4) | (o.rr & 15)),
    ...row((o) => (o.ssg ?? 0) & 15),
    ...row((o) => o.tl & 127),
    ((fm.feedback & 7) << 3) | (fm.algorithm & 7),
    FM_TRANSPOSE,
  ];
}

/** PSG envelope: `xy` nodes (x frames 1..15, y attenuation), `01` sustain + `00` end, or `02 pos` loop. */
function psgEnvelope(ins: FurnaceInstrument | undefined, version: number, lossy: Lossy): number[] {
  const m = macro(ins, MACRO_VOL, version);
  if (!m) return [0x10, 0x01, 0x00];
  const { vals, loop } = ticksOf(m, lossy, 'PSG volume');
  const out: number[] = [];
  let loopPos = -1;
  for (let t = 0; t < vals.length;) {
    if (t === loop) loopPos = out.length;
    let n = 1;
    while (n < 15 && t + n < vals.length && vals[t + n] === vals[t] && t + n !== loop) n++;
    out.push((n << 4) | (15 - Math.max(0, Math.min(15, vals[t]))));
    t += n;
  }
  return loopPos >= 0 ? [...out, 0x02, loopPos] : [...out, 0x01, 0x00];
}

/** Pitch envelope from an absolute pitch macro (1/128 semitone, Furnace linear pitch) in $100-per-semitone units. */
function pitchEnvelope(m: FurnaceMacro, lossy: Lossy): number[] | undefined {
  if (m.mode & 1) { lossy.add('relative pitch macro'); return undefined; }
  const { vals, loop } = ticksOf(m, lossy, 'pitch');
  const nodes: Array<[number, number]> = []; // [value, ticks]
  for (let t = 0; t < vals.length; t++) {
    const last = nodes[nodes.length - 1];
    if (last && last[0] === vals[t] && last[1] < 255 && t !== loop) last[1]++; else nodes.push([vals[t], 1]);
  }
  const loopNode = loop < 0 ? nodes.length - 1 : nodes.findIndex((_, i) => nodes.slice(0, i).reduce((a, n) => a + n[1], 0) === loop);
  if (loop < 0) nodes[nodes.length - 1][1] = 255; // hold the last value
  const out: number[] = [];
  for (const [v, n] of nodes) { const w = Math.max(-0x8000, Math.min(0x7eff, v * 2)) & 0xffff; out.push(w >> 8, w & 0xff, 0, n); }
  return [...out, 0x7f, Math.max(0, loopNode)];
}

/** Macro table for a relative arpeggio: `16 tt` set transpose, `81 nn` hold nn+1 ticks, `80 nn` jump / `80 00` end. */
function arpTable(m: FurnaceMacro, lossy: Lossy): number[] | undefined {
  if (m.data.slice(0, m.length).some(arpIsFixed)) { lossy.add('fixed arpeggio macro'); return undefined; }
  const sp = Math.max(1, m.speed);
  const out: number[] = [];
  const loop = m.loop >= 0 && m.loop < m.length && m.loop !== 255 ? m.loop : -1;
  if (m.delay > 0) lossy.add('arpeggio macro delay (ignored)');
  m.data.slice(0, m.length).forEach((v) => out.push(0x16, ((v << 2) >> 2) & 0xff, 0x81, sp - 1));
  const after = out.length / 2 + 1; // node position after the jump
  out.push(0x80, loop < 0 ? 0 : (loop * 2 - after) & 0xff);
  return out;
}

const be16 = (v: number): number[] => [(v >> 8) & 0xff, v & 0xff];

export function furnaceToMds(m: FurnaceModule, subsong = 0): MdsSong {
  const lossy = new Lossy();
  const sys = m.systems;
  const fmOnly = sys.length === 1 && sys[0] === 0x83;
  if (!fmOnly && !(sys.length === 1 && sys[0] === 0x02) && !(sys.length === 2 && sys[0] === 0x83 && sys[1] === 0x03)) {
    throw new Error(`MDSDRV export needs a Genesis song (YM2612 + SN76489); systems are ${sys.map((x) => x.toString(16)).join(',')}`);
  }
  const s = m.subsongs[subsong];
  const nCh = fmOnly ? 6 : KIND.length;
  // Driver: each NTSC VINT adds tempo+1 to a counter and steps one tick per 128 (Phase 0), so ticks/s = (dd+1)*NTSC/128.
  const rate = s.hz * (s.virtualTempo || 1) / (s.virtualTempoD || 1);
  const tempo = Math.max(0, Math.min(255, Math.round(rate * 128 / NTSC_HZ) - 1));
  if (Math.abs(rate - NTSC_HZ) > 0.5) lossy.add(`tick rate ${rate.toFixed(2)} Hz: F9 ${tempo.toString(16)} = ${((tempo + 1) * NTSC_HZ / 128).toFixed(2)} Hz, ticks land on NTSC frames (up to 1 frame early or late)`);
  if (Math.abs((m.tuning || 440) - 440) > 0.5) lossy.add(`tuning ${m.tuning} Hz: played at 440 Hz`);
  const cellAt = (ch: number, o: number, r: number) => m.patterns.get(`${subsong}_${ch}_${s.orders[ch]?.[o]}`)?.rows[r];

  // 1. Order flow: (order, start row) pairs until one repeats (the loop target) or FFxx stops the song.
  const speeds = s.speedPattern?.length ? [...s.speedPattern] : [s.speed1, s.speed2];
  const chunks: Array<{ o: number; rows: number[]; ticks: number[] }> = [];
  const seen = new Map<string, number>();
  let o = 0, start = 0, speedIdx = 0, loopChunk = -1;
  while (chunks.length < 4096) {
    const key = `${o}:${start}`;
    if (seen.has(key)) { loopChunk = seen.get(key)!; break; }
    seen.set(key, chunks.length);
    const c = { o, rows: [] as number[], ticks: [] as number[] };
    chunks.push(c);
    let next: [number, number] | null = null, stop = false;
    for (let r = start; r < s.patLen && !next && !stop; r++) {
      for (let ch = 0; ch < nCh; ch++) for (const e of cellAt(ch, o, r)?.effects ?? []) {
        if (e.type === 0x09 && e.value > 0) speeds[0] = e.value;
        if (e.type === 0x0f && e.value > 0) speeds[speeds.length > 1 ? 1 : 0] = e.value;
        if (e.type === 0x0b) next = [e.value, 0];
        if (e.type === 0x0d && !next) next = [o + 1, e.value];
        if (e.type === 0xff) stop = true;
      }
      c.rows.push(r);
      c.ticks.push(Math.max(1, speeds[speedIdx++ % speeds.length]));
    }
    if (stop) break;
    [o, start] = next ?? [o + 1, 0];
    if (o >= s.ordersLen) o = 0;
    if (start >= s.patLen) start = 0;
  }

  // 2. Song table items.
  const items: number[][] = [];
  const item = (bytes: number[]): number => { items.push(bytes); return items.length - 1; };
  const insCache = new Map<string, { ins: number; peg: number; mtab: number }>();
  const insRef = (kind: Kind, idx: number) => {
    const key = `${kind === 'fm' ? 'fm' : 'psg'}:${idx}`;
    let v = insCache.get(key);
    if (!v) {
      const ins = m.instruments[idx];
      const pm = macro(ins, MACRO_PITCH, m.version), am = macro(ins, MACRO_ARP, m.version);
      const peg = pm && pitchEnvelope(pm, lossy), mt = am && arpTable(am, lossy);
      if (kind === 'fm' && macro(ins, MACRO_VOL, m.version)) lossy.add('FM volume macro (ignored)');
      v = { ins: item(kind === 'fm' ? fmVoice(ins, lossy) : psgEnvelope(ins, m.version, lossy)), peg: peg ? item(peg) : -1, mtab: mt ? item(mt) : -1 };
      insCache.set(key, v);
    }
    return v;
  };

  // 3. Per channel, per chunk: standalone command bytes.
  const keyOns: MdsKeyOn[] = [];
  const tracks: Array<{ ch: number; chunks: Array<{ bytes: number[]; tieStart: boolean }> }> = [];
  for (let ch = 0; ch < nCh; ch++) {
    const kind = KIND[ch];
    let trs = 0, ins = 0, vol = kind === 'fm' ? 127 : 15, pan = 0xc0, dtn = 0, noise = 3, sounding = false, any = false, tick = 0;
    const out: Array<{ bytes: number[]; tieStart: boolean }> = [];
    for (const c of chunks) {
      const volCmd = (v: number) => [0xe2, kind === 'fm' ? 127 - v : v <= 0 ? 0x7f : Math.round((15 - v) * 8 / 3)];
      const insCmd = () => { const r = insRef(kind, ins); return [0xe1, r.ins, 0xe8, r.peg + 1, 0xeb, r.mtab + 1]; };
      const bytes: number[] = [...insCmd(), ...volCmd(vol), ...(kind === 'fm' ? [0xe9, pan] : []), ...(kind === 'noise' ? [0xea, NOISE_EA[noise]] : []), ...(dtn ? [0xe6, dtn & 0xff] : [])];
      let curIns = ins;
      type Tok = { cmd: 'note' | 'tie' | 'rest'; n: number; t: number; pre: number[] };
      const tok: Tok[] = [];
      const emit = (t: Tok) => {
        bytes.push(...t.pre);
        let left = t.t, first = true;
        while (left > 0) {
          const len = Math.min(128, left);
          if (t.cmd === 'note' && first) bytes.push(0x82 + t.n, len - 1);
          else if (t.cmd === 'rest') bytes.push(len - 1);
          else bytes.push(0x81, len - 1);
          left -= len; first = false;
        }
      };
      let tieStart = false;
      c.rows.forEach((r, i) => {
        const cell = cellAt(ch, c.o, r);
        const nv = cell ? convertFurnaceNoteValue(cell) : -1;
        if (cell && cell.instrument >= 0) ins = cell.instrument;
        const cmds: number[] = [];
        if (cell && cell.volume >= 0) { vol = cell.volume; cmds.push(...volCmd(vol)); }
        for (const e of cell?.effects ?? []) {
          if (e.type < 0 || FX_FLOW.has(e.type)) continue;
          if (e.type === 0x08 && kind === 'fm') { const l = e.value >> 4, rr = e.value & 15; pan = l && rr ? 0xc0 : l ? 0x80 : rr ? 0x40 : 0xc0; cmds.push(0xe9, pan); continue; }
          // E5xx: Furnace linear pitch offset xx-80 in 1/128 semitone (playback.cpp); MDSDRV dtn is 1/256 semitone, signed byte.
          if (e.type === 0xe5) {
            const d = (e.value - 0x80) * 2;
            if (d < -128 || d > 127) lossy.add('E5xx beyond 1/2 semitone (clamped)');
            dtn = Math.max(-128, Math.min(127, d)); cmds.push(0xe6, dtn & 0xff); continue;
          }
          if (e.type === 0x20 && kind === 'noise') {
            noise = ((e.value >> 4) & 1) << 1 | (e.value & 1);
            if (!(noise & 2)) lossy.add('noise fixed-rate mode (20xy, x=0)');
            cmds.push(0xea, NOISE_EA[noise]); continue;
          }
          lossy.add(`effect ${e.type.toString(16).padStart(2, '0').toUpperCase()}`);
        }
        const isNote = nv >= 0 && nv < 253, isOff = nv >= 253;
        if (isNote && ins !== curIns) { curIns = ins; cmds.unshift(...insCmd()); }
        if (isNote || isOff || cmds.length || i === 0) {
          if (tok.length) emit(tok.pop()!);
          if (isNote) {
            let n = kind === 'fm' ? nv : kind === 'noise' && noise & 2 ? noiseKey(m, nv, lossy) : nv - PSG_OFFSET;
            // Keys above the note-byte range go through track transpose (E4). shortcut: trs state is linear, not re-set at the loop point.
            if (kind === 'noise' && (n - trs < 0 || n - trs > MAX_NOTE)) { trs = n > MAX_NOTE ? n - MAX_NOTE : 0; cmds.push(0xe4, trs); }
            n -= trs;
            if (n < 0 || n > MAX_NOTE) { lossy.add(`${kind.toUpperCase()} note out of range (clamped)`); n = Math.max(0, Math.min(MAX_NOTE, n)); }
            tok.push({ cmd: 'note', n, t: 0, pre: cmds }); sounding = true; any = true;
            keyOns.push({ tick, ch, note: nv });
          } else if (isOff) { tok.push({ cmd: 'rest', n: 0, t: 0, pre: cmds }); sounding = false; }
          else { tok.push({ cmd: sounding ? 'tie' : 'rest', n: 0, t: 0, pre: cmds }); if (i === 0) tieStart = sounding; }
        }
        tok[tok.length - 1].t += c.ticks[i];
        tick += c.ticks[i];
      });
      if (tok.length) emit(tok.pop()!);
      out.push({ bytes, tieStart });
    }
    if (any) tracks.push({ ch, chunks: out });
  }

  // 4. Subroutines: repeated chunk bytes, only where neither this chunk nor the next starts with a tie
  //    (the driver looks ahead for 81 to skip the key-off; a call or return hides it).
  const uses = new Map<string, number>();
  const key = (b: number[]) => b.join(',');
  for (const t of tracks) for (const c of t.chunks) uses.set(key(c.bytes), (uses.get(key(c.bytes)) ?? 0) + 1);
  const subs = new Map<string, number>();
  const streams = tracks.map((t) => {
    const b: number[] = t.ch === tracks[0].ch ? [0xf9, tempo] : [];
    t.chunks.forEach((c, i) => {
      if (i === loopChunk) b.push(0xfa);
      const k = key(c.bytes);
      const nextTie = t.chunks[(i + 1) % t.chunks.length]?.tieStart ?? false;
      if (c.bytes.length > 2 && (uses.get(k) ?? 0) > 1 && !c.tieStart && !nextTie && items.length < 255) {
        if (!subs.has(k)) subs.set(k, item([...c.bytes, 0xff]));
        b.push(0xfe, subs.get(k)!);
      } else b.push(...c.bytes);
    });
    // shortcut: a loop chunk that starts with a tie loses its legato at the wrap; Furnace songs rarely do this.
    b.push(...(loopChunk >= 0 ? [0xfb, 0x00] : []), 0xff);
    return b;
  });
  if (items.length > 256) throw new Error(`MDSDRV song table holds 256 items; this song needs ${items.length}`);

  // 5. Layout.
  const sd: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // two dc.l + pcm_tab dc.w 0
  const even = () => { if (sd.length & 1) sd.push(0); };
  const itemOff = items.map((it) => { even(); const at = sd.length; sd.push(...it); return at; });
  even();
  const bgm = sd.length;
  sd.push(0, 0, 0, tracks.length);
  const trackHdr = sd.length;
  tracks.forEach(() => sd.push(0, 0, 0, 0));
  const tbase = sd.length;
  itemOff.forEach((a) => sd.push(...be16(a)));
  tracks.forEach((t, i) => {
    const pos = sd.length - tbase;
    sd.splice(trackHdr + i * 4, 4, MDS_CHAN[t.ch], 0, ...be16(pos));
    sd.push(...streams[i]);
  });
  even();
  if (sd.length > 0xffff) throw new Error('MDSDRV sequence over 64 KiB');
  sd.splice(0, 4, 0, 0, 0, 8);       // pcm_tab-sdtop
  sd.splice(4, 4, 0, 0, ...be16(bgm));
  sd.splice(bgm, 2, ...be16(tbase - bgm));
  return { seq: Uint8Array.from([0x10, 0x01, 0x1f, 0x00, 0x00, 0x03, 0x00, 0x02, ...sd]), lossy: lossy.list(), keyOns };
}
