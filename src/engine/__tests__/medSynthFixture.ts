/**
 * A one-note MMD0 module around one OctaMED synthetic instrument, for UADE's
 * own OctaMED player to play: the corpus (public/data/songs) holds no synth or
 * hybrid MED instrument, so the oracle for the keyboard preview is built here.
 * Layout as MEDParser reads it (and OpenMPT's Load_med.cpp): MMD0 header,
 * MMD0Song (63 instrument headers + block/sequence/tempo fields), one 4-track
 * 64-line block, a sample pointer array, and the SynthInstr chunk.
 */
export interface MedSynthFixture {
  /** Waveforms, each 2 x length-in-words signed bytes. */
  waveforms: Int8Array[];
  voltbl: number[];
  wftbl: number[];
  volSpeed: number;
  wfSpeed: number;
  /** Raw MED note byte (1..63): the note the block plays on track 0, line 0. */
  note: number;
  /** Ticks per line. */
  speed?: number;
  /** The instrument's own volume (InstrHdr sampleVolume, 0..64). */
  volume?: number;
}

export function buildMedSynthModule(f: MedSynthFixture): Uint8Array {
  const out: number[] = [];
  const u8 = (v: number) => out.push(v & 0xff);
  const u16 = (v: number) => { u8(v >> 8); u8(v); };
  const u32 = (v: number) => { u16(v >>> 16); u16(v & 0xffff); };
  const pad = (n: number) => { for (let i = 0; i < n; i++) u8(0); };
  const at = (off: number, v: number) => { out[off] = (v >>> 24) & 0xff; out[off + 1] = (v >>> 16) & 0xff; out[off + 2] = (v >>> 8) & 0xff; out[off + 3] = v & 0xff; };

  // Header (52 bytes)
  out.push(...'MMD0'.split('').map((c) => c.charCodeAt(0)));
  u32(0); // modlen, patched
  u32(52); // songOffset
  u32(0); // playerSettings1
  const blockArrAt = out.length; u32(0);
  u32(0); // flags
  const sampleArrAt = out.length; u32(0);
  u32(0); // reserved
  u32(0); // expData
  pad(52 - out.length);

  // MMD0Song at 52: 63 x InstrHdr (loopStart u16, loopLen u16, midiCh, midiPreset, volume, transpose)
  for (let i = 0; i < 63; i++) { u16(0); u16(0); u8(0); u8(0); u8(i === 0 ? (f.volume ?? 64) : 0); u8(0); }
  u16(1); // numblocks
  u16(1); // songlen
  for (let i = 0; i < 256; i++) u8(0); // playseq
  u16(33); // deftempo (VBL timing, flags2 bpm off)
  u8(0); // playtransp
  u8(0x10); // flags: volume hex
  u8(0); // flags2
  u8(f.speed ?? 6); // tempo2
  for (let i = 0; i < 16; i++) u8(64); // trkvol
  u8(64); // mastervol
  u8(1); // numsamples

  // Block array + block
  at(blockArrAt, out.length); const blkPtrAt = out.length; u32(0);
  at(blkPtrAt, out.length);
  u8(4); u8(63); // numtracks, numlines (= lines - 1)
  for (let line = 0; line < 64; line++) for (let t = 0; t < 4; t++) {
    if (line === 0 && t === 0) { u8(f.note & 0x3f); u8(0x10); u8(0); } // note, instrument 1, no command
    else { u8(0); u8(0); u8(0); }
  }

  // Sample pointer array (1 entry) and the synth chunk
  at(sampleArrAt, out.length); const instrPtrAt = out.length; u32(0);
  const instrAt = out.length; at(instrPtrAt, instrAt);
  const nw = f.waveforms.length;
  const wfAreaStart = 278 + nw * 4;
  const chunkLen = wfAreaStart + f.waveforms.reduce((s, w) => s + 2 + w.length, 0) - 6; // length after the 6-byte header
  u32(chunkLen); u16(0xffff); // type -1 = synth
  u8(0); pad(3); // defaultdecay, reserved[3]
  u16(0); u16(0); // loopStart, loopLength (hybrid only)
  u16(f.voltbl.length); u16(f.wftbl.length);
  u8(f.volSpeed); u8(f.wfSpeed);
  u16(nw);
  for (let i = 0; i < 128; i++) u8(f.voltbl[i] ?? 0);
  for (let i = 0; i < 128; i++) u8(f.wftbl[i] ?? 0);
  let wfOff = wfAreaStart;
  for (const w of f.waveforms) { u32(wfOff); wfOff += 2 + w.length; }
  for (const w of f.waveforms) { u16(w.length / 2); for (const b of w) u8(b); }
  at(4, out.length);
  return new Uint8Array(out);
}
