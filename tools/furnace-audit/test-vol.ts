import { readFileSync } from 'fs';
import { parseFurnaceSong } from '../../src/lib/import/formats/FurnaceSongParser.js';

async function main() {
  const songs = [
    '/Users/spot/Code/Reference Code/furnace-master/demos/gameboy/cheap.fur',
    '/Users/spot/Code/Reference Code/furnace-master/demos/gameboy/contested.fur',
    '/Users/spot/Code/Reference Code/furnace-master/demos/gameboy/snowdin.fur',
  ];
  
  for (const path of songs) {
    const buf = readFileSync(path);
    const module = await parseFurnaceSong(buf.buffer);
    const name = path.split('/').pop();
    console.log(`\n=== ${name} ===`);
    console.log('version:', module.version);
    console.log('masterVol:', module.masterVol);
    console.log('systemVol:', module.systemVol);
    console.log('systemPan:', module.systemPan);
    console.log('systemPanFR:', module.systemPanFR);
    console.log('systemLen:', module.systemLen);
    console.log('systems:', module.systems?.map((s: number) => '0x' + s.toString(16)));
  }
}
main().catch(e => console.error(e));
