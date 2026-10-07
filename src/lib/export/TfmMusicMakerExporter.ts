/**
 * TfmMusicMakerExporter.ts - export a TFM Music Maker (.tfe) song with the grid's edits (G24).
 *
 * The file is one RLE stream that unpacks to a fixed header holding every pattern column-planar
 * (TFMMusicMakerParser). The export unpacks the loaded module, writes each edited cell's note, instrument and
 * volume into its columns, and packs it again (compressTfm, the inverse of the parser's decompressTfm).
 * Effects stay as the file has them (the grid does not show them).
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { editedCells } from '@/lib/song/gridBaseline';
import { decompressTfm, compressTfm, hasSignature, V05, V13 } from '@/lib/import/formats/TFMMusicMakerParser';

const LINES = 256;
const XM_KEY_OFF = 97;

export interface TfmExportResult { data: Uint8Array; filename: string; warnings: string[] }

export function exportTfmMusicMaker(song: TrackerSong): TfmExportResult {
  const source = song.tfmFileData;
  if (!source) throw new Error('TFM Music Maker export needs the loaded module');
  const bytes = new Uint8Array(source);
  const layout = hasSignature(bytes) ? V13 : V05;
  const h = decompressTfm(bytes, layout);
  if (!h) throw new Error('TFM Music Maker module does not unpack');
  const warnings: string[] = [];
  for (const { pattern, row, channel, cell } of editedCells(song.patterns)) {
    // The parser names each grid pattern after the TFM pattern it shows: `p<number>`.
    const tfm = Number(/^p(\d+)$/.exec(song.patterns[pattern].id)?.[1] ?? NaN);
    if (!Number.isInteger(tfm) || channel >= 6 || row >= LINES) { warnings.push(`Cell ${pattern}:${row}:${channel} has no place in the module.`); continue; }
    const col = layout.patterns + tfm * layout.patternSize + channel * layout.channelSize;
    // The note column holds the player note XOR 0xff: 0xfe is a key off, 0xff empty (parser: XM note = player note - 12 + 13).
    const player = cell.note === XM_KEY_OFF ? 0xfe : cell.note > 0 ? cell.note - 1 : 0xff;
    h[col + row] = player ^ 0xff;
    h[col + 2 * LINES + row] = cell.note > 0 && cell.note !== XM_KEY_OFF ? cell.instrument : h[col + 2 * LINES + row];
    const shown = h[col + LINES + row] ? 0x10 + Math.min(64, Math.round(h[col + LINES + row] * 64 / 31)) : 0;
    if (cell.volume !== shown) h[col + LINES + row] = cell.volume >= 0x10 ? Math.max(1, Math.min(31, Math.round((cell.volume - 0x10) * 31 / 64))) : 0;
  }
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return { data: compressTfm(h, layout), filename: `${baseName}.tfe`, warnings };
}
