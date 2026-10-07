/**
 * Corpus and module variants for the Music Assembler grid tests (not a test file).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadMaModule } from '@/lib/import/formats/maModule';
import { walkMusicAssembler, MA_WALK } from '@/lib/import/formats/maWalk';

export const MA_SONGS = join(process.cwd(), 'public/data/songs');

function corpus(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) corpus(p, out);
    else if (f.toLowerCase().endsWith('.ma')) out.push(p);
  }
  return out;
}

/** Every distinct Music Assembler module of the corpus (the same bytes in two folders count once). */
export const MA_FILES: string[] = (() => {
  const seen = new Map<string, string>();
  for (const f of corpus(MA_SONGS).sort()) {
    const key = readFileSync(f).toString('base64');
    if (!seen.has(key)) seen.set(key, f);
  }
  return [...seen.values()];
})();

/**
 * The corpus has no release event (a one-byte event: 0x80 | delay), the one command that stops a voice. A note
 * event [note, delay] with a delay of 1..63 becomes two release events [0x80, 0x80 | delay - 1]: the same two
 * bytes and the same number of rows. `count` notes of instruments that release are turned (the voice stops) and
 * `count` of instruments that do not (the voice holds its level).
 */
export function withReleases(bytes: Uint8Array, count = 12): { bytes: Uint8Array; turned: number } {
  const m = loadMaModule(bytes)!;
  const walk = walkMusicAssembler(m, 0)!;
  const out = bytes.slice();
  const done = new Set<number>();
  let releasing = 0, holding = 0;
  for (const e of walk.events) {
    if (e.kind !== MA_WALK.note || (releasing >= count && holding >= count)) continue;
    const ins = m.instruments[e.instr];
    const track = m.tracks[e.track];
    if (!ins || !track) continue;
    if (ins.release === 0 ? holding >= count : releasing >= count) continue;
    const at = e.trackOffset;
    const off = m.tracksStartOffset + m.trackOffsetTable[e.track] + at;
    const isPlainNote = (track[at] & 0x80) === 0 && (track[at + 1] & 0x80) === 0;
    const d = track[at + 1];
    if (!isPlainNote || d < 1 || d > 63 || done.has(off)) continue;
    out[off] = 0x80;
    out[off + 1] = 0x80 | (d - 1);
    done.add(off);
    if (ins.release === 0) holding++; else releasing++;
  }
  return { bytes: out, turned: done.size };
}
