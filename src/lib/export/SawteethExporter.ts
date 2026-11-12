/**
 * SawteethExporter.ts — Export TrackerSong as Sawteeth binary (.st / SWTD) format
 *
 * Reconstructs a valid Sawteeth binary file from TrackerSong data.
 * The parser expands per-channel sequences into flat pattern rows; the exporter
 * reverses this by creating one Part per DEViLBOX pattern-channel slice and
 * building per-channel song sequences that reference those parts.
 *
 * Binary layout (big-endian, version 1200):
 *   "SWTD"       4 bytes magic
 *   stVersion    u16 BE (1200)
 *   spsPal       u16 BE (882)
 *   channelCount u8
 *   per-channel: left(1) right(1) len(2) lLoop(2) rLoop(2) + len x {part(1) transp(1) dAmp(1)}
 *   partCount    u8
 *   per-part:    sps(1) len(1) + len x {ins(1) eff(1) note(1)}
 *   instrCount-1 u8
 *   per-instrument (index 1+): filter/amp envelopes + synth params + waveform steps
 *   breakPCount  u8 (0)
 *   strings:     name(0-term) author(0-term) partNames(0-term each) insNames(0-term each)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { ST_FX_BASE } from '../import/formats/commandStreamEffectGlyphs';
import type { SawteethStored, SawteethPart } from '../import/formats/SawteethParser';

// ── Helpers ──────────────────────────────────────────────────────────────────

function writeString(parts: number[], str: string): void {
  for (let i = 0; i < str.length; i++) {
    parts.push(str.charCodeAt(i) & 0xFF);
  }
  parts.push(0x00); // null terminator
}

// ── Part structure (one per pattern-channel slice) ───────────────────────────

interface ExportPart {
  sps: number;
  steps: Array<{ ins: number; eff: number; note: number }>;
  name: string;
}


// ── Carrier path: write the stored structure back, apply grid edits onto the stored part steps ──────────

interface ExportChannel {
  left: number;
  right: number;
  lLoop: number;
  rLoop: number;
  steps: Array<{ part: number; transp: number; dAmp: number }>;
}

interface Layout {
  version: number;
  spsPal: number;
  channels: ExportChannel[];
  parts: ExportPart[];
  breakPoints: number[][];
  /** Names to write; the stored counts when carried, all of them otherwise. */
  partNamesStored: number;
  insNamesStored: number | null;
}

interface GridSource { partIdx: number; row: number }
type SongWithCarrier = TrackerSong & {
  sawteethStored?: SawteethStored;
  sawteethGridSource?: Array<Array<GridSource | null>>;
};

const clampNote = (n: number): number => Math.max(1, Math.min(96, n));

/**
 * Returns the stored layout with the grid edits applied, or a string naming why the carrier cannot express the song.
 * Fallback triggers (each returns a reason): no carrier; version below 900 (instrument layout differs); channel count
 * changed; pattern order not 0..n-1; pattern added, removed or resized (row count per channel or the 64-row pattern
 * split differs from the parsed grid); speed (row ticks) changed; a non-empty cell on a row that is not the start of a
 * stored part step. Not triggers: cell edits (note, instrument, effect), BPM (written as spsPal), channel pan,
 * instrument edits, song name.
 */
function planFromCarrier(song: SongWithCarrier): Layout | string {
  const st = song.sawteethStored;
  const source = song.sawteethGridSource;
  if (!st || !source) return 'no stored Sawteeth structure (song composed from scratch)';
  if (st.version < 900) return `file version ${st.version} is below 900 (older instrument layout)`;
  if (song.numChannels !== st.channels.length || source.length !== st.channels.length) return 'channel count changed';
  if (song.songPositions.length !== song.patterns.length || song.songPositions.some((p, i) => p !== i)) return 'pattern order changed';
  const total = song.patterns.reduce((n, p) => n + p.length, 0);
  if (source.some((c) => c.length !== total)) return 'pattern added, removed or resized';
  const PAT = 64;
  if (song.patterns.some((p, i) => p.length !== Math.min(PAT, total - PAT * i))) return 'pattern resized';
  if (song.initialSpeed !== st.rowTicks) return 'speed (row length) changed';

  const parts: ExportPart[] = st.parts.map((p: SawteethPart) => ({
    sps: p.sps,
    steps: p.steps.map((s) => ({ ...s })),
    name: p.name,
  }));
  const rowAt = (ch: number, flat: number) => {
    let rest = flat;
    for (const p of song.patterns) {
      if (rest < p.length) return p.channels[ch]?.rows[rest];
      rest -= p.length;
    }
    return undefined;
  };

  // The channel pan the parser derived; a pan the user did not touch keeps the raw stored left/right.
  const panOf = (c: { left: number; right: number }): number => Math.round(((c.right - c.left) / 255) * 50);
  const channels: ExportChannel[] = [];
  for (let ch = 0; ch < st.channels.length; ch++) {
    const sc = st.channels[ch];
    let left = sc.left;
    let right = sc.right;
    const pan = song.patterns[0]?.channels[ch]?.pan;
    if (pan !== undefined && pan !== panOf(sc)) {
      const norm = (pan + 50) / 100;
      left = Math.round((1 - norm) * 255);
      right = Math.round(norm * 255);
    }
    channels.push({ left, right, lLoop: sc.lLoop, rLoop: sc.rLoop, steps: sc.steps.map((s) => ({ ...s })) });

    // Walk the grid: the stored step behind each starting row, compared with what the parser would have shown.
    const chRows = source[ch];
    // Which channel step (and so which transpose) each grid row belongs to is recomputed as the parser walks it.
    let flat = 0;
    for (let si = 0; si <= sc.rLoop; si++) {
      const step = sc.steps[si];
      const partIdx = Math.min(step.part, st.parts.length - 1);
      const part = st.parts[partIdx];
      const rowsPerStep = part.sps / st.rowTicks;
      for (let row = 0; row < part.len; row++) {
        const orig = part.steps[row];
        const src = chRows[flat];
        const cell = rowAt(ch, flat);
        if (!src || src.partIdx !== partIdx || src.row !== row) return 'grid no longer matches the stored part steps';
        if (cell) {
          const wantNote = orig.note > 0 ? clampNote(orig.note + step.transp) : 0;
          const wantIns = orig.ins > 0 && orig.ins < st.instrumentCount ? orig.ins : 0;
          const wantEffTyp = orig.eff !== 0 ? ST_FX_BASE + (orig.eff >> 4) : 0;
          const wantEff = orig.eff & 0x0f;
          const target = parts[partIdx].steps[row];
          if ((cell.note ?? 0) !== wantNote) {
            const n = cell.note ?? 0;
            target.note = n >= 1 && n <= 96 ? Math.max(0, Math.min(255, n - step.transp)) : 0;
          }
          if ((cell.instrument ?? 0) !== wantIns) target.ins = (cell.instrument ?? 0) & 0xff;
          if ((cell.effTyp ?? 0) !== wantEffTyp || (cell.eff ?? 0) !== wantEff) {
            const t = cell.effTyp ?? 0;
            target.eff = t >= ST_FX_BASE && t <= ST_FX_BASE + 0x0f ? ((t - ST_FX_BASE) << 4) | ((cell.eff ?? 0) & 0x0f) : 0;
          }
        }
        flat++;
        for (let k = 1; k < rowsPerStep; k++) {
          const filler = rowAt(ch, flat);
          if (chRows[flat] !== null) return 'grid no longer matches the stored part steps';
          if (filler && (filler.note || filler.instrument || filler.effTyp || filler.eff)) {
            return 'a cell was filled on a row that is not the start of a stored part step';
          }
          flat++;
        }
      }
    }
    if (flat !== total) return 'grid length differs from the stored channel sequence';
  }

  // Tempo: the parser derived BPM = 110250 / spsPal.
  let spsPal = st.spsPal;
  if (Math.abs(song.initialBPM - 110250 / st.spsPal) > 1e-6 && song.initialBPM > 0) {
    spsPal = Math.max(1, Math.min(65535, Math.round(110250 / song.initialBPM)));
  }
  return { version: st.version, spsPal, channels, parts, breakPoints: st.breakPoints, partNamesStored: st.partNamesStored, insNamesStored: st.insNamesStored };
}

// ── Main export function ─────────────────────────────────────────────────────

/** Fallback: flatten everything (one part per pattern-channel slice, transpose 0, loops 0..len-1, no break points). */
function planFlatten(song: TrackerSong, warnings: string[]): Layout {

  const numChannels = Math.min(12, song.numChannels);
  if (numChannels < 1) {
    warnings.push('Song has no channels; exporting with 1 empty channel.');
  }
  const channelCount = Math.max(1, numChannels);

  // We always write version 1200 (supports lLoop + rLoop fields)
  const ST_VERSION = 1200;
  // The grid's row is initialSpeed ticks of spsPal samples (the parser's layout); each exported part
  // step is one grid row, so write that row length as the part's sps and the tempo back as spsPal.
  const SPS_PAL = song.initialBPM > 0 ? Math.max(1, Math.min(65535, Math.round(110250 / song.initialBPM))) : 882;
  const ROW_TICKS = Math.max(1, Math.min(255, Math.round(song.initialSpeed || 6)));

  // ── Build Parts ──────────────────────────────────────────────────────────
  // One Part per (songPosition, channel) pair.
  // Each Part contains the rows for that pattern-channel slice.
  const exportParts: ExportPart[] = [];
  // partIndex[songPosIdx][ch] = index into exportParts
  const partIndex: number[][] = [];

  const songLen = Math.min(song.songPositions.length, 256);

  for (let posIdx = 0; posIdx < songLen; posIdx++) {
    const patIdx = song.songPositions[posIdx] ?? 0;
    const pat = song.patterns[patIdx];
    const chIndices: number[] = [];

    for (let ch = 0; ch < channelCount; ch++) {
      const rows = pat?.channels[ch]?.rows ?? [];
      const partLen = Math.max(1, Math.min(255, rows.length));

      const steps: Array<{ ins: number; eff: number; note: number }> = [];
      for (let r = 0; r < partLen; r++) {
        const cell = rows[r];
        if (!cell) {
          steps.push({ ins: 0, eff: 0, note: 0 });
          continue;
        }
        const ins = (cell.instrument ?? 0) & 0xFF;
        // Sawteeth effect byte: the parser shows it as format-private effect ST_FX_BASE + high nibble
        // with the low nibble as the value; write the same byte back (anything else has no Sawteeth byte).
        const effTyp = cell.effTyp ?? 0;
        const eff = effTyp >= ST_FX_BASE && effTyp <= ST_FX_BASE + 0x0f
          ? ((effTyp - ST_FX_BASE) << 4) | ((cell.eff ?? 0) & 0x0f)
          : 0;
        const note = (cell.note ?? 0);
        steps.push({
          ins,
          eff,
          note: (note >= 1 && note <= 96) ? note : 0,
        });
      }

      const idx = exportParts.length;
      chIndices.push(idx);

      exportParts.push({
        sps: ROW_TICKS,
        steps,
        name: `P${posIdx}C${ch}`,
      });
    }
    partIndex.push(chIndices);
  }

  if (exportParts.length === 0) {
    // Need at least one part
    exportParts.push({ sps: ROW_TICKS, steps: [{ ins: 0, eff: 0, note: 0 }], name: '' });
    partIndex.push(Array.from({ length: channelCount }, () => 0));
  }

  if (exportParts.length > 255) {
    warnings.push(`Too many parts (${exportParts.length}); clamped to 255.`);
    exportParts.length = 255;
  }
  const partCount = exportParts.length;

  // ── Build channel sequences ──────────────────────────────────────────────
  // Each channel step: { part, transp(0), dAmp(0) }
  interface ChSeqStep { part: number; transp: number; dAmp: number }
  const channelSeqs: ChSeqStep[][] = [];

  for (let ch = 0; ch < channelCount; ch++) {
    const seq: ChSeqStep[] = [];
    for (let posIdx = 0; posIdx < songLen; posIdx++) {
      const pIdx = partIndex[posIdx]?.[ch] ?? 0;
      seq.push({
        part: Math.min(pIdx, partCount - 1),
        transp: 0,
        dAmp: 0,
      });
    }
    if (seq.length === 0) {
      seq.push({ part: 0, transp: 0, dAmp: 0 });
    }
    channelSeqs.push(seq);
  }

  // ── Pan derived from pattern channel info ───────────────────────────────
  const channelPans: Array<{ left: number; right: number }> = [];
  for (let ch = 0; ch < channelCount; ch++) {
    const pat0 = song.patterns[song.songPositions[0] ?? 0];
    const panVal = pat0?.channels[ch]?.pan ?? 0; // -50..50 range in DEViLBOX
    const norm = (panVal + 50) / 100; // 0..1
    channelPans.push({ left: Math.round((1 - norm) * 255), right: Math.round(norm * 255) });
  }
  return {
    version: ST_VERSION,
    spsPal: SPS_PAL,
    channels: channelSeqs.map((seq, ch) => ({
      left: channelPans[ch].left,
      right: channelPans[ch].right,
      lLoop: 0,
      rLoop: seq.length - 1,
      steps: seq,
    })),
    parts: exportParts,
    breakPoints: [],
    partNamesStored: exportParts.length,
    insNamesStored: null,
  };
}

export async function exportSawteeth(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];
  const carried = planFromCarrier(song as SongWithCarrier);
  let layout: Layout;
  if (typeof carried === 'string') {
    warnings.push(`Sawteeth export rewrote the song structure (parts not shared, transposes baked in, loop points and break points reset): ${carried}.`);
    layout = planFlatten(song, warnings);
  } else {
    layout = carried;
  }
  const { version: ST_VERSION, spsPal: SPS_PAL, channels: layoutChannels, parts: exportParts, breakPoints } = layout;
  const channelCount = layoutChannels.length;
  const partCount = exportParts.length;
  const insCount = Math.min(255, Math.max(1, song.instruments.length));

  // ── Serialize to binary ──────────────────────────────────────────────────
  const buf: number[] = [];

  // Magic "SWTD"
  buf.push(0x53, 0x57, 0x54, 0x44);

  // stVersion (u16 BE)
  buf.push((ST_VERSION >> 8) & 0xFF, ST_VERSION & 0xFF);

  // spsPal (u16 BE, only for version >= 900)
  buf.push((SPS_PAL >> 8) & 0xFF, SPS_PAL & 0xFF);

  // channelCount (u8)
  buf.push(channelCount);

  // Per-channel data. lLoop only for version >= 910, rLoop only for version >= 1200 (sawteeth.c L714-723).
  for (const c of layoutChannels) {
    const len = c.steps.length;
    buf.push(c.left & 0xFF, c.right & 0xFF);
    buf.push((len >> 8) & 0xFF, len & 0xFF);
    if (ST_VERSION >= 910) buf.push((c.lLoop >> 8) & 0xFF, c.lLoop & 0xFF);
    if (ST_VERSION >= 1200) buf.push((c.rLoop >> 8) & 0xFF, c.rLoop & 0xFF);
    // Steps: part(1) + transp(1 signed) + dAmp(1)
    for (const step of c.steps) {
      buf.push(step.part & 0xFF, step.transp & 0xFF, step.dAmp & 0xFF);
    }
  }

  // partCount (u8)
  buf.push(partCount & 0xFF);

  // Per-part data
  for (const part of exportParts) {
    const stepCount = Math.min(255, part.steps.length);
    buf.push(part.sps & 0xFF);    // Sps
    buf.push(stepCount & 0xFF);    // Len

    for (let i = 0; i < stepCount; i++) {
      const s = part.steps[i];
      buf.push(s.ins & 0xFF);
      buf.push(s.eff & 0xFF);
      buf.push(s.note & 0xFF);
    }
  }

  // instrumentCount - 1 (u8). The parser reads that value as the number of STORED instruments (index 0 is a
  // dummy it adds itself), so the stored count is the number of real instruments. Instruments come from the
  // parser's Sawteeth config (shared by every instrument); without one, minimal stubs are written.
  const cfgInstruments = song.instruments.find((i) => i.sawteeth)?.sawteeth?.instruments ?? [];
  const storedCount = Math.max(1, cfgInstruments.length > 0 ? cfgInstruments.length : insCount);
  buf.push(storedCount & 0xFF);

  const clampByte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  for (let i = 0; i < storedCount; i++) {
    const ins = cfgInstruments[i];
    const filterEnv = ins && ins.filterEnv.length > 0 ? ins.filterEnv : [{ time: 0, lev: 127 }];
    const ampEnv = ins && ins.ampEnv.length > 0 ? ins.ampEnv : [{ time: 0, lev: 255 }];
    const steps = ins && ins.steps.length > 0 ? ins.steps : [{ note: 36, wForm: 1, relative: false }];

    buf.push(filterEnv.length & 0xFF);
    for (const pt of filterEnv) buf.push(clampByte(pt.time), clampByte(pt.lev));
    buf.push(ampEnv.length & 0xFF);
    for (const pt of ampEnv) buf.push(clampByte(pt.time), clampByte(pt.lev));

    buf.push(clampByte(ins?.filterMode ?? 0));
    // ClipMode_Boost: clip mode in the high nibble, boost in the low nibble
    buf.push((((ins?.clipMode ?? 0) & 0x0F) << 4) | ((ins?.boost ?? 1) & 0x0F));
    buf.push(clampByte(ins?.vibS ?? 1), clampByte(ins?.vibD ?? 1), clampByte(ins?.pwmS ?? 1), clampByte(ins?.pwmD ?? 1));
    buf.push(clampByte(ins?.res ?? 0));
    buf.push(Math.max(1, clampByte(ins?.sps ?? 30)));

    // Version >= 900: Len(1) + Loop(1); Loop must be < Len
    const len = Math.min(255, steps.length);
    buf.push(len, Math.min(len - 1, clampByte(ins?.loop ?? 0)));
    for (let j = 0; j < len; j++) {
      const st = steps[j];
      buf.push(((st.relative ? 0x80 : 0) | (st.wForm & 0x0F)) & 0xFF, clampByte(st.note));
    }
  }

  // breakPCount (u8), then 8 raw bytes each (4 pal + 4 command)
  buf.push(breakPoints.length & 0xFF);
  for (const bp of breakPoints) for (const v of bp) buf.push(v & 0xFF);

  // ── Strings section ────────────────────────────────────────────────────
  // name, author, partNames[0..partCount-1], insNames[1..instrumentCount-1]
  writeString(buf, song.name || 'Untitled');
  writeString(buf, song.instruments.find((i) => i.sawteeth)?.sawteeth?.author ?? ''); // author

  for (let i = 0; i < Math.min(partCount, layout.partNamesStored); i++) {
    writeString(buf, exportParts[i].name || '');
  }

  // An instrument name the user set must be written even if the original file stored no names.
  let lastNamed = 0;
  for (let i = 0; i < storedCount; i++) if (song.instruments[i]?.name) lastNamed = i + 1;
  const insNameCount = Math.min(storedCount, Math.max(layout.insNamesStored ?? storedCount, lastNamed));
  for (let i = 0; i < insNameCount; i++) {
    const inst = song.instruments[i];
    writeString(buf, inst?.name ?? '');
  }

  // ── Build output ─────────────────────────────────────────────────────────
  const output = new Uint8Array(buf);
  // Fix up u16 fields that were written byte-by-byte (already correct)

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'untitled';
  const filename = `${baseName}.st`;

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
