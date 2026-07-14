import { readFileSync } from 'fs';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';

const path = '/Users/spot/Code/DEViLBOX/public/data/songs/formats/SUNTronicTunes/mule.src';
const buf = new Uint8Array(readFileSync(path));
const score = parseSunTronicV13Score(buf);
console.log('deltaA', score.deltaA, 'deltaB', score.deltaB, 'blocks', score.blocks.length,
  'sampled', score.sampledInstruments.length, 'synth', score.synthInstrumentCount,
  'rowsDefault', score.rowsPerPositionDefault);
const sub = score.subsongs[0];
console.log('sub0 entries', sub.entries.length, 'endKind', sub.endKind, 'seqOff 0x'+sub.sequenceOff.toString(16));
console.log('block noteCounts:', score.blocks.map(b=>b.noteCount).join(','));
console.log('--- first 12 entries ---');
sub.entries.slice(0,12).forEach((e,i)=>{
  const fps = e.trackPtrs.map(p=>score.blockIndexByOffset.get(p) ?? -1);
  console.log(`#${i} ptrs=[${e.trackPtrs.map(p=>'0x'+p.toString(16)).join(',')}] fp=[${fps.join(',')}] tr=[${e.transposes.join(',')}]`);
});
for (let v=0; v<4; v++){
  const valid = sub.entries.filter(e=>{const p=e.trackPtrs[v]; return score.blockIndexByOffset.has(p);}).length;
  const notes = sub.entries.reduce((a,e)=>{const idx=score.blockIndexByOffset.get(e.trackPtrs[v]); return a+(idx!==undefined?score.blocks[idx].noteCount:0);},0);
  console.log(`voice ${v}: validEntries=${valid}/${sub.entries.length} totalNoteRefs=${notes}`);
}
