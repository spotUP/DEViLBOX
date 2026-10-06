/**
 * SidMon1Exporter.ts — Export TrackerSong to SidMon 1.0 (.sid1/.smn) native format.
 *
 * A SidMon 1 module is not rebuilt from the grid: the grid is a reading of the
 * module (per-voice track lists, rows that last several global rows), so a
 * rebuilt module would no longer be the song that was loaded. The export is
 * the module as loaded with the edits written into it:
 *   - every grid cell whose note or instrument differs from the loaded grid is
 *     written through the layout's own cell writer (the same one a live edit
 *     uses), which keeps the effect and speed bytes and removes the track's
 *     transpose;
 *   - an instrument's envelope, arpeggio, phase speed, finetune and pitch fall
 *     fields that differ from the loaded instrument are written into its
 *     32-byte record. Waveform edits are not exported (warned).
 * Unedited, the export is byte-identical to the file that was loaded.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { SidMon1Config } from '@/types/instrument/exotic';

export interface SidMon1ExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

/** The instrument fields written into a record: [config key, byte offset]. */
const RECORD_FIELDS: ReadonlyArray<readonly [keyof SidMon1Config, number]> = [
  ['attackSpeed', 20], ['attackMax', 21], ['decaySpeed', 22], ['decayMin', 23], ['sustain', 24],
  ['releaseSpeed', 26], ['releaseMin', 27], ['phaseSpeed', 29], ['pitchFall', 31],
];

export async function exportSidMon1(song: TrackerSong): Promise<SidMon1ExportResult> {
  const warnings: string[] = [];
  if (!song.uadeEditableFileData) {
    throw new Error('SidMon 1 export needs the loaded module (uadeEditableFileData)');
  }
  const out = new Uint8Array(song.uadeEditableFileData.slice(0));
  const { parseSidMon1File } = await import('@/lib/import/formats/SidMon1Parser');
  const loaded = parseSidMon1File(song.uadeEditableFileData.slice(0), song.name || 'module');
  const layout = loaded.uadePatternLayout!;

  // Cells the user changed: note or instrument differs from the loaded grid.
  let written = 0;
  const steps = Math.min(loaded.patterns.length, song.patterns.length);
  for (let p = 0; p < steps; p++) {
    for (let ch = 0; ch < layout.numChannels; ch++) {
      const was = loaded.patterns[p].channels[ch].rows;
      const now = song.patterns[p].channels[ch]?.rows ?? [];
      for (let r = 0; r < Math.min(was.length, now.length); r++) {
        if ((was[r].note ?? 0) === (now[r].note ?? 0) && (was[r].instrument ?? 0) === (now[r].instrument ?? 0)) continue;
        const runs = layout.writeCell!(p, r, ch, now[r]);
        if (runs.length === 0) { warnings.push(`step ${p} row ${r} voice ${ch}: no module row to write`); continue; }
        for (const run of runs) out.set(run.bytes, run.offset);
        written++;
      }
    }
  }

  // Instrument record fields.
  const records = loaded.instruments;
  song.instruments.forEach((inst, i) => {
    const now = inst.sidmon1 as SidMon1Config | undefined;
    const was = records[i]?.sidmon1 as SidMon1Config | undefined;
    const base = records[i]?.uadeChipRam?.instrBase;
    if (!now || !was || base === undefined) return;
    for (const [key, off] of RECORD_FIELDS) {
      const v = now[key];
      if (typeof v === 'number' && v !== was[key]) out[base + off] = v & 0xFF;
    }
    if (now.finetune !== was.finetune) out[base + 30] = Math.max(0, Math.min(15, Math.round((now.finetune ?? 0) / 67)));
    now.arpeggio?.forEach((v, k) => { if (v !== was.arpeggio?.[k]) out[base + 4 + k] = v & 0xFF; });
    if (now.mainWave?.some((v, k) => v !== was.mainWave?.[k])) warnings.push(`instrument ${i + 1}: waveform edits are not exported`);
  });
  if (written > 0) warnings.push(`${written} edited cell(s) written into the module`);

  const baseName = (song.name || 'untitled')
    .replace(/\s*\[SidMon 1\.0\]\s*$/, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return {
    data: new Blob([out], { type: 'application/octet-stream' }),
    filename: `${baseName || 'untitled'}.sid1`,
    warnings,
  };
}
