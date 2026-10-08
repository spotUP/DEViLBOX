/**
 * JochenHippelSTNative.ts - what the native Hippel ST player (hippelst-wasm)
 * is given: the COSO song of a playback image and the three mode flags the
 * original player derives while loading (InitPlayer: CheckReplay and SIDCheck).
 *
 * A playback image (HstSongEdit.image) is [replay code][COSO song][digi drums].
 * The native player runs the song part; the replay code in front only decides
 * the player generation.
 */
import { decodeHstModule, hstU16, hstU32 } from './JochenHippelSTModule';

export interface HstNativeSong {
  /** The COSO song with whatever follows it (digi drums), pointers relative to its start. */
  song: Uint8Array;
  /** Pointer tables hold words (true) or longs (false). */
  shortPointers: boolean;
  /** Player generation: false = the original commands, true = the later ones. */
  laterPlayer: boolean;
  /** MMME song using the $EF SID command. */
  newSid: boolean;
  /** TFMX (false) or MMME (true) song: the two play with different vibrato code. */
  mmme: boolean;
  subsongs: number;
}

const JMP_PC_INDEX = 0x4efb;

export function hstNativeSong(image: Uint8Array): HstNativeSong {
  const m = decodeHstModule(image);
  if (m.song.kind !== 'coso') throw new Error('Hippel ST: the native player takes a COSO playback image');
  const song = image.slice(m.prefix.length);
  const shortPointers = !m.song.longPointers;
  // CheckReplay: with replay code in front, the generation is the old one unless
  // the code holds a JMP d8(PC,Dn) word (the dispatch of the later players).
  let laterPlayer = shortPointers;
  if (m.prefix.length > 0) {
    let found = false;
    for (let o = 0; o + 1 < m.prefix.length; o += 2) if (hstU16(m.prefix, o) === JMP_PC_INDEX) { found = true; break; }
    if (!found) laterPlayer = false;
  }
  const mmme = song[32] === 0x4d && song[33] === 0x4d && song[34] === 0x4d && song[35] === 0x45;
  let newSid = false;
  if (mmme) {
    const soundTable = hstU32(song, 4);
    const volTable = hstU32(song, 8);
    const first = shortPointers ? (hstU16(song, soundTable) << 16) >> 16 : hstU32(song, soundTable);
    for (let o = soundTable + first; o >= 0 && o < volTable && o < song.length; o++) if (song[o] === 0xef) { newSid = true; break; }
  }
  return { song, shortPointers, laterPlayer, newSid, mmme, subsongs: hstU16(song, 48) + 1 };
}
