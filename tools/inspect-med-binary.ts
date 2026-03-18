// Inspect raw MED binary fields to verify tempo and structure
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const TEST_DIR = join(ROOT, 'public/data/songs/formats');

function u8(b: Uint8Array, o: number) { return b[o]; }
function u16(b: Uint8Array, o: number) { return (b[o] << 8) | b[o+1]; }
function s16(b: Uint8Array, o: number) { const v=(b[o]<<8)|b[o+1]; return v>=32768?v-65536:v; }
function s8(b: Uint8Array, o: number) { const v=b[o]; return v>=128?v-256:v; }
function u32(b: Uint8Array, o: number) { return ((b[o]<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3])>>>0; }

const files = [
  'funky nightmare.mmd1',
  'med.sadman',
  'bounty hunter - outro (remixed).mmd3',
  'universal monsters - dracula.mmd0',
];

for (const f of files) {
  const raw = readFileSync(join(TEST_DIR, f));
  const buf = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);

  const magic = String.fromCharCode(buf[0],buf[1],buf[2],buf[3]);
  const songOffset = u32(buf, 8);
  const so = songOffset;

  // MMDSong structure
  const MAX_INSTR = 63;
  const soBase = so + MAX_INSTR * 8; // after 63 MMD0Sample structs

  const numBlocks = u16(buf, soBase);
  const songLen   = u16(buf, soBase + 2);
  const defTempo  = u16(buf, soBase + 260);
  const playTranspose = s8(buf, soBase + 262);
  const flags     = u8(buf, soBase + 263);
  const flags2    = u8(buf, soBase + 264);
  const tempo2    = u8(buf, soBase + 265);
  const masterVol = u8(buf, soBase + 282);
  const numSamples= u8(buf, soBase + 283);

  const is8Ch       = (flags  & 0x40) !== 0;
  const bpmMode     = (flags2 & 0x20) !== 0;
  const softwareMix = (flags2 & 0x80) !== 0;
  const rowsPerBeat = 1 + (flags2 & 0x1F);

  console.log(`\n=== ${f} ===`);
  console.log(`  magic=${magic} songOffset=0x${so.toString(16)}`);
  console.log(`  numBlocks=${numBlocks} songLen=${songLen}`);
  console.log(`  defTempo=${defTempo} (0x${defTempo.toString(16)})`);
  console.log(`  tempo2=${tempo2} (ticks/row = speed)`);
  console.log(`  playTranspose=${playTranspose}`);
  console.log(`  flags=0x${flags.toString(16)} (is8Ch=${is8Ch})`);
  console.log(`  flags2=0x${flags2.toString(16)} (bpmMode=${bpmMode}, softwareMix=${softwareMix}, rowsPerBeat=${rowsPerBeat})`);
  console.log(`  masterVol=${masterVol} numSamples=${numSamples}`);

  // Compute BPM the same way MEDParser does
  let computedBPM: number;
  if (bpmMode && !is8Ch) {
    computedBPM = defTempo < 7 ? 111.5 : (defTempo * rowsPerBeat) / 4.0;
  } else if (is8Ch && defTempo > 0) {
    const MED_8CH_TEMPOS = [179, 164, 152, 141, 131, 123, 116, 110, 104, 99];
    computedBPM = MED_8CH_TEMPOS[Math.min(10, defTempo) - 1] ?? 125;
  } else if (!softwareMix && defTempo > 0 && defTempo <= 10) {
    computedBPM = (6.0 * 1773447 / 14500) / defTempo;
  } else if (softwareMix && defTempo < 8) {
    computedBPM = 157.86;
  } else {
    computedBPM = defTempo / 0.264;
  }
  console.log(`  → computedBPM=${computedBPM.toFixed(1)} (clamped: ${Math.max(32,Math.min(255,Math.round(computedBPM)))})`);
  console.log(`  → initialSpeed=${tempo2 || 6}, initialBPM=${Math.max(32,Math.min(255,Math.round(computedBPM)))}`);

  // Check first block's numtracks to verify numChannels
  const blockOffset = u32(buf, 0x10);  // header offset 0x10 = blockArrOffset
  if (blockOffset > 0 && blockOffset < buf.length) {
    const firstBlockPtr = u32(buf, blockOffset);
    if (firstBlockPtr > 0 && firstBlockPtr < buf.length) {
      const nTracks = u16(buf, firstBlockPtr);
      const nLines  = u16(buf, firstBlockPtr + 2);
      console.log(`  firstBlock: nTracks=${nTracks}, nLines=${nLines}`);
    }
  }
}
