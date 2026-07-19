import * as fs from 'fs';
import * as path from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';

// Re-parse hunks the same way the score parser does, but expose h1 for dumping.
// We can't import parseHunks (not exported); instead re-run the score parse in a
// try and, for the drin scan, replicate it here against h1 we reconstruct.
// Simpler: monkeypatch by copying the hunk-parse logic is overkill — instead we
// re-read h1 by catching. We'll re-implement a minimal hunk walk here.

function u32(b: Uint8Array, o: number) { return ((b[o]<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3])>>>0; }

// Minimal AmigaHunk walk to extract hunk#1 data + its file offset (mirrors parseHunks).
function extractHunks(buf: Uint8Array): { data: Uint8Array; fileOffset: number }[] {
  let p = 0;
  if (u32(buf, 0) !== 0x000003f3) throw new Error('not HUNK_HEADER');
  p = 4;
  // skip resident library names
  while (u32(buf, p) !== 0) { const n = u32(buf, p); p += 4 + n*4; }
  p += 4; // null terminator
  const tableSize = u32(buf, p); p += 4;
  const first = u32(buf, p); p += 4;
  const last = u32(buf, p); p += 4;
  const count = last - first + 1;
  const sizes: number[] = [];
  for (let i = 0; i < count; i++) { sizes.push(u32(buf, p) & 0x3fffffff); p += 4; }
  void tableSize; void first;
  const hunks: { data: Uint8Array; fileOffset: number }[] = [];
  let hi = 0;
  while (p < buf.length && hi < count) {
    const type = u32(buf, p) & 0x3fffffff; p += 4;
    if (type === 0x3f3) break;
    if (type === 0x3e9 || type === 0x3ea || type === 0x3eb) { // CODE/DATA/BSS
      const words = u32(buf, p); p += 4;
      if (type === 0x3eb) { // BSS no data
        hunks.push({ data: new Uint8Array(0), fileOffset: p });
        hi++;
      } else {
        const bytes = words * 4;
        hunks.push({ data: buf.subarray(p, p + bytes), fileOffset: p });
        p += bytes; hi++;
      }
    } else if (type === 0x3ec) { // RELOC32
      while (true) { const n = u32(buf, p); p += 4; if (n === 0) break; p += 4; p += n*4; }
    } else if (type === 0x3f2) { // HUNK_END
      // continue
    } else if (type === 0x3f0) { // SYMBOL
      while (true) { const n = u32(buf, p); p += 4; if (n===0) break; p += 4*(n); p += 4; }
    } else {
      // unknown; bail to avoid infinite loop
      break;
    }
  }
  return hunks;
}

const REF_DRIN_SIG = [0x42, 0x45, 0x1a, 0x28, 0x00, 0x0e];
const DRIN_SHIFT_MAIN = 0xe94d, DRIN_SHIFT_VERSA = 0xe74d;

function scanDrin(h1: Uint8Array) {
  const hits: { i: number; shiftWord: number; okSig: boolean }[] = [];
  // Scan for lea d16(pc),a3 (0x47FA) anywhere, report near-misses
  for (let i = 0; i + 12 <= h1.length; i += 2) {
    if (h1[i] !== 0x47 || h1[i+1] !== 0xfa) continue;
    let okSig = true;
    for (let k = 0; k < REF_DRIN_SIG.length; k++) {
      if (h1[i+4+k] !== REF_DRIN_SIG[k]) { okSig = false; break; }
    }
    const shiftWord = (h1[i+10]<<8)|h1[i+11];
    hits.push({ i, shiftWord, okSig });
  }
  return hits;
}

const dir = path.resolve(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const targets = process.argv.slice(2);
const files = targets.length ? targets : ['ready', 'time10.src', 'witõka.src', 'tank', 'Lightforce', 'orbital.src', 'paradroid.01'];

for (const f of files) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) { console.log(`MISSING ${f}`); continue; }
  const buf = new Uint8Array(fs.readFileSync(p));
  console.log(`\n===== ${f} (${buf.length} bytes) =====`);
  let h1: Uint8Array;
  try {
    const hunks = extractHunks(buf);
    console.log(`  hunks: ${hunks.length}, sizes: ${hunks.map(h=>h.data.length).join(', ')}`);
    if (hunks.length < 2) continue;
    h1 = hunks[1].data;
  } catch (e:any) { console.log('  hunk-walk error: '+e.message); continue; }

  // full lea 0x47FA occurrences
  const allLea: number[] = [];
  for (let i = 0; i+2 <= h1.length; i++) if (h1[i]===0x47 && h1[i+1]===0xfa) allLea.push(i);
  console.log(`  0x47FA (lea d16(pc),a3) occurrences: ${allLea.length}`);

  const hits = scanDrin(h1);
  const sigHits = hits.filter(h=>h.okSig);
  console.log(`  lea+drinSig matches: ${sigHits.length}`);
  for (const h of sigHits) {
    const shiftName = h.shiftWord===DRIN_SHIFT_MAIN?'MAIN(lsl#4)':h.shiftWord===DRIN_SHIFT_VERSA?'VERSA(lsl#3)':`OTHER(0x${h.shiftWord.toString(16)})`;
    console.log(`    @${h.i} shiftWord=0x${h.shiftWord.toString(16)} ${shiftName}`);
  }
  // For failing files: dump bytes after each lea site to see what the sig actually is
  if (sigHits.length === 0) {
    console.log('  -- near-miss dump: bytes at each lea 0x47FA site (offset+2..+12):');
    for (const i of allLea.slice(0, 12)) {
      const win = Array.from(h1.subarray(i, i+12)).map(b=>b.toString(16).padStart(2,'0')).join(' ');
      console.log(`     @${i}: ${win}`);
    }
    // Also: search for the REF_DRIN_SIG bytes ANYWHERE (maybe lea opcode differs)
    let sigAnywhere = 0; const sigLocs: number[] = [];
    for (let i=0;i+6<=h1.length;i++){let ok=true;for(let k=0;k<6;k++)if(h1[i+k]!==REF_DRIN_SIG[k]){ok=false;break;}if(ok){sigAnywhere++;if(sigLocs.length<6)sigLocs.push(i);}}
    console.log(`  -- REF_DRIN_SIG (42 45 1a 28 00 0e) anywhere in h1: ${sigAnywhere} at ${sigLocs.join(', ')}`);
    if (sigLocs.length) {
      for (const loc of sigLocs.slice(0,3)) {
        const back = Math.max(0, loc-6);
        const win = Array.from(h1.subarray(back, loc+8)).map(b=>b.toString(16).padStart(2,'0')).join(' ');
        console.log(`     ctx @${back}: ${win}   (sig starts at +${loc-back})`);
      }
    }
    // Search for shift words to see if a variant shift exists
    let mainW=0, versaW=0;
    for(let i=0;i+2<=h1.length;i+=2){const w=(h1[i]<<8)|h1[i+1];if(w===DRIN_SHIFT_MAIN)mainW++;if(w===DRIN_SHIFT_VERSA)versaW++;}
    console.log(`  -- shift-word counts in h1: MAIN(e94d)=${mainW} VERSA(e74d)=${versaW}`);
  }
}
