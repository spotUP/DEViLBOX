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

// ── Main export function ─────────────────────────────────────────────────────

export async function exportSawteeth(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];

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

  // ── Build instrument data ────────────────────────────────────────────────
  // Sawteeth instruments are synth-based. We create minimal valid instruments
  // from TrackerSong instrument configs. Instrument 0 is a dummy (not written).
  const insCount = Math.min(255, Math.max(1, song.instruments.length));

  // ── Derive panning from pattern channel info ─────────────────────────────
  const channelPans: Array<{ left: number; right: number }> = [];
  for (let ch = 0; ch < channelCount; ch++) {
    // Try to recover pan from pattern channel data
    const pat0 = song.patterns[song.songPositions[0] ?? 0];
    const panVal = pat0?.channels[ch]?.pan ?? 0; // -50..50 range in DEViLBOX
    // Convert back: left = 255 when pan=-50, right = 255 when pan=50
    const norm = (panVal + 50) / 100; // 0..1
    const left = Math.round((1 - norm) * 255);
    const right = Math.round(norm * 255);
    channelPans.push({ left, right });
  }

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

  // Per-channel data
  for (let ch = 0; ch < channelCount; ch++) {
    const seq = channelSeqs[ch];
    const pan = channelPans[ch];
    const len = seq.length;

    buf.push(pan.left & 0xFF);   // Left
    buf.push(pan.right & 0xFF);  // Right

    // Len (u16 BE)
    buf.push((len >> 8) & 0xFF, len & 0xFF);

    // lLoop (u16 BE, version >= 910)
    buf.push(0, 0); // loop start = 0

    // rLoop (u16 BE, version >= 1200)
    const rLoop = len - 1;
    buf.push((rLoop >> 8) & 0xFF, rLoop & 0xFF);

    // Steps: part(1) + transp(1 signed) + dAmp(1)
    for (const step of seq) {
      buf.push(step.part & 0xFF);
      buf.push(step.transp & 0xFF); // signed as unsigned byte
      buf.push(step.dAmp & 0xFF);
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

  // breakPCount (u8) = 0
  buf.push(0);

  // ── Strings section ────────────────────────────────────────────────────
  // name, author, partNames[0..partCount-1], insNames[1..instrumentCount-1]
  writeString(buf, song.name || 'Untitled');
  writeString(buf, song.instruments.find((i) => i.sawteeth)?.sawteeth?.author ?? ''); // author

  for (let i = 0; i < partCount; i++) {
    writeString(buf, exportParts[i].name || '');
  }

  for (let i = 0; i < storedCount; i++) {
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
