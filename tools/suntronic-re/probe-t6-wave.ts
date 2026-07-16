/**
 * probe-t6-wave.ts — Gate C.0: where does the type-6 synth wave data come from?
 *
 * Static question first (no WASM): for every synth record, is its wave1 pointer
 * (record+0x1a) covered by a RELOC32 entry, and does the RELOCATED value land
 * inside hunk1 (data) or past its END (BSS / runtime workspace)? Prints hunk
 * geometry + declaredSize (BSS extension) so we can tell whether the loud t6
 * lead wave lives in a runtime-populated region the disk parse can't slice.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseHunks, parseSunTronicV13Score, u32BE } from '../../src/lib/import/formats/SunTronicV13';
import { CORPUS_DIR } from './suntronicLib';

for (const name of ['gliders.src', 'ballblaser.src']) {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const hf = parseHunks(data);
  console.log(`\n===== ${name} =====`);
  console.log(`numHunks=${hf.numHunks}`);
  for (const h of hf.hunks) {
    const relocTargets = [...h.reloc32.entries()].map(([t, o]) => `t${t}:${o.length}`).join(' ');
    console.log(
      `  hunk${h.index} type=0x${(h.hunkType & 0x3fffffff).toString(16)} len=${h.length} declaredSize=${h.declaredSize} memFlags=${h.memFlags} reloc[${relocTargets}]`,
    );
  }
  const h1 = hf.hunks[1];
  const relocSet = new Map<number, number>(); // hunk1 field-offset -> target hunk
  for (const [target, offs] of h1.reloc32) for (const o of offs) relocSet.set(o, target);

  const score = parseSunTronicV13Score(data);
  console.log(`  synthTableOff=${score.synthTableOff} synthCount=${score.synthInstruments.length} hunk1.len=${h1.length} declared=${h1.declaredSize}`);
  console.log(`  idx recOff  type  wave1Off(+0x1a raw)  reloc?  resolved(=base+val if reloc)  inHunk1?  waveWordLen`);
  for (const inst of score.synthInstruments) {
    const fieldOff = inst.recordOff + 0x1a;
    const raw = u32BE(h1.data, fieldOff);
    const relocTgt = relocSet.get(fieldOff);
    // If reloc'd, the disk value is the offset WITHIN target hunk; resolved live
    // ptr = targetBase + raw, but statically the in-hunk offset IS raw.
    const inH1 = raw < h1.length;
    const inDeclared = raw < h1.declaredSize;
    const idx = (inst.recordOff - score.synthTableOff) / 0x24;
    console.log(
      `  ${String(idx).padStart(3)} ${String(inst.recordOff).padStart(5)}  t${inst.synthType}   0x${raw.toString(16).padStart(6, '0')}=${String(raw).padStart(6)}  ${relocTgt === undefined ? 'NO ' : 'YES(t' + relocTgt + ')'}   inH1=${inH1} inDeclared=${inDeclared}  wwl=${inst.waveWordLen}`,
    );
  }
}
