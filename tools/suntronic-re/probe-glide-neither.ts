import { readFileSync } from 'fs';
import { parseSunTronicFile } from '../../src/lib/import/formats/SunTronicParser';
const clamp=(n:number)=>n<=0?0:n>96?96:n;
for (const song of ['shades.src']) {
  const buf = readFileSync(`public/data/songs/formats/SUNTronicTunes/${song}`);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const ts = parseSunTronicFile(ab, song);
  const nat = ts.sunTronicNative!;
  let printed = 0;
  for (let pi=0; pi<ts.patterns.length; pi++) for (let ch=0; ch<4; ch++) {
    const rows = ts.patterns[pi].channels[ch].rows;
    for (let r=0; r<rows.length; r++) {
      const c = rows[r];
      const bi=c.sunBlockIndex, ri=c.sunRowInBlock, pos=c.sunPosition;
      if (bi===undefined||bi<0||ri===undefined||pos===undefined) continue;
      if (bi>=nat.blocks.length||pos>=nat.positions.length||ri>=nat.blocks[bi].length) continue;
      const T = nat.positions[pos].transpose[ch as 0|1|2|3];
      const pool = nat.blocks[bi][ri].note ?? 0;
      const before = c.note ?? 0;
      if (before<=0||pool<=0) continue;
      const cm=clamp(pool-T), cp=clamp(pool+T);
      if (before===cm||before===cp) continue;
      // NEITHER — inspect glide carrier
      const fx = [[c.effTyp,c.eff],[c.effTyp2,c.eff2],[c.effTyp3,c.eff3],[c.effTyp4,c.eff4],[c.effTyp5,c.eff5]];
      const glideArg = fx.find(([t])=>t===3)?.[1];
      const poolFx = (nat.blocks[bi][ri] as any);
      const poolGlideArg = [[poolFx.effTyp,poolFx.eff],[poolFx.effTyp2,poolFx.eff2],[poolFx.effTyp3,poolFx.eff3],[poolFx.effTyp4,poolFx.eff4],[poolFx.effTyp5,poolFx.eff5]].find(([t]:any)=>t===3)?.[1];
      if (printed++ < 20) {
        console.log(`pat${pi} ch${ch} r${r} pos=${pos} bi=${bi} ri=${ri} T=${T} pool=${pool} before=${before} (pool-T=${cm} pool+T=${cp}) gridGlideArg=${glideArg} poolGlideArg=${poolGlideArg}`);
      }
    }
  }
  console.log('total NEITHER printed (cap 20):', Math.min(printed,20), 'of', printed);
}
