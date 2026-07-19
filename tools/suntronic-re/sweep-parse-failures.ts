import * as fs from 'fs';
import * as path from 'path';
import { parseSunTronicFile } from '../../src/lib/import/formats/SunTronicParser';
import { isSunTronicV13Format, parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';

const dir = path.resolve(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const files = fs.readdirSync(dir).filter((f) => {
  const p = path.join(dir, f);
  return fs.statSync(p).isFile();
});

const buckets = new Map<string, string[]>();
let okCount = 0;
const notV13: string[] = [];

for (const f of files.sort()) {
  const buf = fs.readFileSync(path.join(dir, f));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const u8 = new Uint8Array(ab);
  if (!isSunTronicV13Format(u8)) {
    notV13.push(f);
    continue;
  }
  try {
    parseSunTronicV13Score(u8);
    okCount++;
  } catch (e: any) {
    const msg = (e && e.message) ? e.message : String(e);
    if (!buckets.has(msg)) buckets.set(msg, []);
    buckets.get(msg)!.push(f);
  }
}

console.log(`Total files: ${files.length}`);
console.log(`Parsed OK (V1.3): ${okCount}`);
console.log(`Not V1.3 format (skipped, would go raw-rip path): ${notV13.length}`);
console.log('');
console.log('=== THROW BUCKETS (V1.3 files) ===');
const sorted = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [msg, fs2] of sorted) {
  console.log(`\n[${fs2.length}] "${msg}"`);
  console.log('   ' + fs2.join(', '));
}
console.log('\n=== NOT V1.3 (first 40) ===');
console.log(notV13.slice(0, 40).join(', '));
