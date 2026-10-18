/**
 * The module an engine is loaded with when the song's grid has been edited (G19, G6).
 *
 * An engine plays the bytes the song carried when it was opened (`song[desc.fileDataKey]`); a grid
 * edit lived in the stores (and, for a few engines, in the running instance) and was lost on the
 * next play: stop, play, and the original sounded (owner, 2026-10-07, SunTronic mule.src).
 *
 * The owner's definition of "fully editable" is: export native, reload, it sounds the same and the
 * edit is heard. So the next play is exactly that: the module the native export writes from the
 * stores, run through the one parse path (parseModuleToSong) that a reload runs, and the engine is
 * loaded with the file data that parse produced for the engine's own key. No per-engine byte
 * layout lives here: the exporter and the parser already own it.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { NativeEngineDescriptor } from './wasmEngineRegistry';
import { encodeVariableBlock } from '../uade/UADEPatternEncoder';
import { patchModuleByLayout } from '@/lib/export/layoutPatch';
import { gridIsEdited, sampleIsEdited, editedCells } from '@/lib/song/gridBaseline';

/** Engines whose module is not a file the exporter writes (a one-way crunch), so a reload is not the engine's data. */
const NOT_RELOADABLE = new Set(['Cinter4']);

/**
 * A format with a fixed cell layout and no exporter of its own: the loaded module with each edited
 * cell's bytes written where the layout says that cell lives (the in-place write the TFMX route and the
 * chip-RAM route already make). Null when the song has no such layout or no edited cell has a place.
 */
function patchedByLayout(song: TrackerSong, desc: NativeEngineDescriptor): Uint8Array | null {
  const layout = song.uadePatternLayout;
  const source = song[desc.fileDataKey] as ArrayBuffer | Uint8Array | undefined;
  // A layout with its own cell writer (SidMon 1: patchModuleCell) already wrote the edit into the module the song carries.
  if (!layout?.encodeCell || layout.writeCell || !source) return null;
  const { bytes, patched } = patchModuleByLayout(source, layout, song.patterns);
  return patched > 0 ? bytes : null;
}

/**
 * A format of variable-length packed blocks and no exporter that carries the edit: each block an edited
 * cell belongs to is re-encoded (the raw carrier when the block is unedited) and written over its slot,
 * the bytes behind it zero-filled. A block that no longer fits its slot is refused here, as the chip-RAM
 * route (UADEChipEditor.rewriteVariablePattern) refuses it; growing a block needs the format's pointers
 * moved, which only the format's own exporter knows (G5).
 */
function patchedByVariableLayout(song: TrackerSong, desc: NativeEngineDescriptor): Uint8Array | null {
  const layout = song.uadeVariableLayout;
  const source = song[desc.fileDataKey] as ArrayBuffer | Uint8Array | undefined;
  if (!layout || !source) return null;
  const buf = new Uint8Array(source instanceof Uint8Array ? source : new Uint8Array(source)).slice();
  const blocks = new Set<string>();
  for (const { pattern, channel } of editedCells(song.patterns)) blocks.add(`${pattern}:${channel}`);
  let patched = 0;
  for (const key of blocks) {
    const [pattern, channel] = key.split(':').map(Number);
    const fp = layout.trackMap[pattern]?.[channel];
    const addr = fp == null || fp < 0 ? undefined : layout.filePatternAddrs[fp];
    const size = fp == null || fp < 0 ? undefined : layout.filePatternSizes[fp];
    if (addr == null || size == null || addr + size > buf.length) continue;
    const encoded = encodeVariableBlock(layout, fp!, song.patterns[pattern].channels[channel].rows, channel);
    if (encoded.length > size) {
      console.warn(`[editedModuleForPlay] pattern ${pattern} voice ${channel + 1}: the edited block (${encoded.length} bytes) does not fit its ${size}-byte slot; not written`);
      continue;
    }
    const padded = new Uint8Array(size);
    padded.set(encoded);
    for (let i = 0; i < size; i++) if (buf[addr + i] !== padded[i]) { buf[addr + i] = padded[i]; patched++; }
  }
  return patched > 0 ? buf : null;
}

export async function editedModuleForPlay(
  song: TrackerSong,
  desc: NativeEngineDescriptor,
): Promise<ArrayBuffer | Uint8Array | null> {
  if (NOT_RELOADABLE.has(desc.key) || !(gridIsEdited(song.patterns) || sampleIsEdited())) return null;
  const loaded = song[desc.fileDataKey] as ArrayBuffer | Uint8Array | undefined;
  const carriesEdit = (d: ArrayBuffer | Uint8Array | null | undefined): d is ArrayBuffer | Uint8Array => {
    if (!d) return false;
    const a = d instanceof Uint8Array ? d : new Uint8Array(d);
    const b = loaded instanceof Uint8Array ? loaded : new Uint8Array(loaded ?? new ArrayBuffer(0));
    return a.length !== b.length || a.some((v, i) => v !== b[i]);
  };
  try {
    // The exporter's output is read back through the parser to learn the bytes the engine plays. That read-back can
    // need a running scan engine (a UADE-parsed format): when it cannot run, the layout writer below still builds
    // the edited module, so a failed read-back must not end the attempt.
    try {
      const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
      const out = await exportNativeSong(null, {});
      if (out) {
        const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
        const name = song.uadeEditableFileName ?? out.filename;
        const copy = new Uint8Array(out.data).buffer as ArrayBuffer;
        const reloaded = await parseModuleToSong(new File([copy], name), 0) as unknown as Partial<TrackerSong>;
        const data = reloaded[desc.fileDataKey] as ArrayBuffer | Uint8Array | undefined;
        if (carriesEdit(data)) return data;
      }
    } catch (err) {
      console.warn(`[NativeEngineRouting] ${desc.key}: the exported module could not be read back, writing the edit through the parser's layout:`, err);
    }
    // No exporter, or one that writes the module as loaded (a native serializer that reads a running
    // engine's state): write the edited cells into the module through the parser's own layout.
    return patchedByLayout(song, desc) ?? patchedByVariableLayout(song, desc);
  } catch (err) {
    console.warn(`[NativeEngineRouting] ${desc.key}: the edited module could not be built, playing the loaded one:`, err);
    return null;
  }
}
