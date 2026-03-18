/**
 * dump-med-effects.ts — Dump ALL effects present in a MED file's patterns
 * and show side-by-side with exported MOD patterns.
 *
 * Usage: npx tsx --tsconfig tsconfig.app.json tools/dump-med-effects.ts <file>
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseMEDFile } from '../src/lib/import/formats/MEDParser';
import { exportSongToMOD } from './export-songs-openmpt';

const ROOT = join(import.meta.dirname, '..');
const TEST_DIR = join(ROOT, 'public/data/songs/formats');

const fileArg = process.argv[2] ?? 'funky nightmare.mmd1';
const filePath = join(TEST_DIR, fileArg);
const buf = readFileSync(filePath);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const song = parseMEDFile(buf.buffer, fileArg) as any;

// Export to MOD and parse it back manually (hex dump approach)
const modPath = `/tmp/dump-med-export.mod`;
exportSongToMOD(song, modPath);
const modBuf = readFileSync(modPath);

// Manual MOD parser to get the actual binary pattern data
// MOD layout: 20 title + 31*30 samples + 1 orderlen + 1 restart + 128 orders + 4 magic
// then patterns (4 * numch * 64 rows), then sample data
function parseMODPatterns(data: Buffer): Map<number, Array<Array<{note:number;inst:number;cmd:number;param:number}>>> {
  const magic = data.toString('ascii', 1080, 1084);
  let numCh = 4;
  const m = magic.match(/^(\d+)CH$/);
  if (m) numCh = parseInt(m[1]);
  else if (magic === 'M.K.' || magic === 'M!K!') numCh = 4;

  const orderLen = data[950];
  const orders = Array.from({length: orderLen}, (_,i) => data[952+i]);
  const maxPat = orders.reduce((a,b)=>Math.max(a,b),0);

  const result = new Map<number, Array<Array<{note:number;inst:number;cmd:number;param:number}>>>();
  let off = 1084;

  for (let p = 0; p <= maxPat; p++) {
    const rows: Array<Array<{note:number;inst:number;cmd:number;param:number}>> = [];
    for (let r = 0; r < 64; r++) {
      const row: Array<{note:number;inst:number;cmd:number;param:number}> = [];
      for (let c = 0; c < numCh; c++) {
        const b0 = data[off], b1 = data[off+1], b2 = data[off+2], b3 = data[off+3];
        off += 4;
        const inst  = (b0 & 0xF0) | (b2 >> 4);
        const period = ((b0 & 0x0F) << 8) | b1;
        const cmd   = b2 & 0x0F;
        const param = b3;
        // Convert period to note number
        let note = 0;
        if (period > 0) {
          // Find closest period in table
          const PT = [3424,3232,3048,2880,2712,2560,2416,2280,2152,2032,1920,1812,
            1712,1616,1524,1440,1356,1280,1208,1140,1076,1016,960,907,
            856,808,762,720,678,640,604,570,538,508,480,453,
            428,404,381,360,339,320,302,285,269,254,240,226,
            214,202,190,180,170,160,151,143,135,127,120,113,
            107,101,95,90,85,80,75,71,67,63,60,56,
            53,50,47,45,42,40,37,35,33,31,30,28];
          let best = 0, bestDiff = 99999;
          for (let i=0;i<PT.length;i++) {
            const d = Math.abs(PT[i]-period);
            if (d < bestDiff) { bestDiff=d; best=i; }
          }
          note = best + 1; // 1-indexed
        }
        row.push({note, inst, cmd, param});
      }
      rows.push(row);
    }
    result.set(p, rows);
  }
  return result;
}

const modPats = parseMODPatterns(modBuf);
const NOTE_NAMES = ['---','C-0','C#0','D-0','D#0','E-0','F-0','F#0','G-0','G#0','A-0','A#0','B-0',
  'C-1','C#1','D-1','D#1','E-1','F-1','F#1','G-1','G#1','A-1','A#1','B-1',
  'C-2','C#2','D-2','D#2','E-2','F-2','F#2','G-2','G#2','A-2','A#2','B-2',
  'C-3','C#3','D-3','D#3','E-3','F-3','F#3','G-3','G#3','A-3','A#3','B-3',
  'C-4','C#4','D-4','D#4','E-4','F-4','F#4','G-4','G#4','A-4','A#4','B-4',
  'C-5','C#5','D-5','D#5','E-5','F-5','F#5','G-5','G#5','A-5','A#5','B-5',
  '^^^'];

function noteName(n: number) { return (NOTE_NAMES[n] ?? `n${n}`).padEnd(3); }
function h2(v: number) { return v.toString(16).toUpperCase().padStart(2,'0'); }
function srcCell(c: any): string {
  if (!c) return '--- 00 000';
  const n = noteName(c.note ?? 0);
  const i = h2(c.instrument ?? 0);
  const et = (c.effTyp ?? 0).toString(16).toUpperCase();
  const ef = h2(c.eff ?? 0);
  return `${n} ${i} ${et}${ef}`;
}
function modCell(c: {note:number;inst:number;cmd:number;param:number}): string {
  const n = noteName(c.note);
  const i = h2(c.inst);
  const cmd = c.cmd.toString(16).toUpperCase();
  const p = h2(c.param);
  return `${n} ${i} ${cmd}${p}`;
}

// Show unique effects in source
const effectSummary = new Map<string, number>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const srcPats: any[] = song.patterns ?? [];
for (const pat of srcPats) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ch of (pat?.channels ?? []) as any[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const cell of (ch?.rows ?? []) as any[]) {
      if (cell && (cell.effTyp || cell.eff)) {
        const key = `${cell.effTyp?.toString(16)}${h2(cell.eff ?? 0)}`;
        effectSummary.set(key, (effectSummary.get(key) ?? 0) + 1);
      }
    }
  }
}

console.log(`\n=== ${fileArg} — Source effect summary ===`);
const sorted = [...effectSummary.entries()].sort((a,b) => b[1]-a[1]);
for (const [k,v] of sorted) {
  const et = parseInt(k[0], 16);
  const ef = parseInt(k.slice(1), 16);
  let name = '?';
  if (et===0xC) name='SetVol';
  else if (et===0xF) name='Tempo';
  else if (et===0xE) name=`Ext-${k.slice(1,2)}x`;
  else if (et===0x0 && ef>0) name='Arpeggio';
  else if (et===0x0) name='EMPTY';
  else if (et===0x1) name='PortaUp';
  else if (et===0x2) name='PortaDown';
  else if (et===0x3) name='TonePorta';
  else if (et===0x9) name='SmpOffset';
  else if (et===0xB) name='PosJump';
  else if (et===0xD) name='PatBreak';
  else if (et===0xA) name='VolSlide';
  else name=`e${et.toString(16)}`;
  console.log(`  ${k.padEnd(5)} ${String(v).padStart(4)}x  ${name}`);
}

// Side-by-side for first 6 unique patterns in order
const orders: number[] = song.songPositions ?? [];
const patsToShow = [...new Set(orders)].slice(0, 5);

console.log(`\n=== Order: ${JSON.stringify(orders.slice(0,12))} ===`);
console.log(`=== Patterns to show: ${patsToShow} ===`);

for (const p of patsToShow) {
  const sp = srcPats[p] as any;
  const mp = modPats.get(p);
  if (!sp || !mp) { console.log(`\nPat ${p}: missing src=${!sp} mod=${!mp}`); continue; }

  const numCh = Math.min(sp.channels?.length ?? 4, 4);
  const numRows = sp.channels?.[0]?.rows?.length ?? 64;

  console.log(`\n${'─'.repeat(90)}`);
  console.log(`Pattern ${p}  rows=${numRows}  src-ch=${sp.channels?.length ?? 0}`);
  console.log(`${'─'.repeat(90)}`);

  let hasContent = false;
  for (let r = 0; r < Math.min(numRows, 64); r++) {
    const parts: string[] = [];
    let rowHasContent = false;
    for (let c = 0; c < numCh; c++) {
      const sc = sp.channels?.[c]?.rows?.[r];
      const mc = mp[r]?.[c];
      const s = srcCell(sc);
      const m = mc ? modCell(mc) : '--- 00 000';
      const diff = s !== m ? '!' : ' ';
      if (s !== '--- 00 000' || m !== '--- 00 000') rowHasContent = true;
      parts.push(`${diff}${s}|${m}`);
    }
    if (rowHasContent) {
      hasContent = true;
      console.log(`${String(r).padStart(3,'0')} ${parts.join('  ')}`);
    }
  }
  if (!hasContent) console.log('  (all empty)');
}
