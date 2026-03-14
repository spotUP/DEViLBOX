import { parseFurnaceSong } from '../../src/lib/import/formats/FurnaceSongParser';
import fs from 'fs';
const buf = fs.readFileSync('/Users/spot/Code/Reference Code/furnace-master/demos/nes/Rise_against_the_ashes_to_the_new_dawn.fur');
const module = await parseFurnaceSong(buf.buffer as ArrayBuffer);
const sub = module.subsongs[0];
console.log('hz:', sub.hz, 'patLen:', sub.patLen, 'ordersLen:', sub.ordersLen, 'speed1:', sub.speed1, 'speed2:', sub.speed2);
for (let ch = 5; ch < 8; ch++) {
  const chanData = sub.channels[ch];
  let firstNoteOrder = -1, firstNoteRow = -1;
  outer: for (let ord = 0; ord < sub.ordersLen; ord++) {
    const patIdx = sub.orders[ch]?.[ord] ?? 0;
    const pat = chanData?.patterns?.get(patIdx);
    if (!pat) continue;
    for (let row = 0; row < sub.patLen; row++) {
      const r = pat.rows[row];
      if (r && r.note !== -1) { firstNoteOrder = ord; firstNoteRow = row; break outer; }
    }
  }
  console.log('ch' + ch + ': firstNote at order=' + firstNoteOrder + ' row=' + firstNoteRow + ', ordersLen=' + sub.ordersLen);
}
