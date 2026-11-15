// Injects compiled Terrific Audio Driver data into the prebuilt SNES player ROM (public/tad/player-lorom.sfc,
// built by tools/build-tad-player.sh from the upstream ca65 sound-test program). No assembler needed at export time.

export interface TadPlayerRomMeta {
  romSize: number;
  /** File offset of the compiler's .bin (the LoadAudioData code sits in the 51 bytes before it). */
  dataOffset: number;
  dataCapacity: number;
  loaderSize: number;
  driverSize: number;
  headerOffset: number;
  patches: { lastSongId: number[]; lastSfxId: number[]; dataItems: number[] };
}

export interface TadCompilerExport {
  /** ca65_lorom_audio.bin */
  bin: Uint8Array;
  /** ca65_lorom_audio.asm */
  asm: string;
  /** ca65_lorom_audio.inc */
  inc: string;
}

const num = (text: string, re: RegExp, what: string): number => {
  const m = re.exec(text);
  if (!m) throw new Error(`TAD export: ${what} not found`);
  return Number(m[1]);
};

/** SNES header checksum: sum of all bytes with the 4 checksum bytes counted as FF FF 00 00; complement = checksum ^ FFFF. */
export function writeSnesChecksum(rom: Uint8Array, headerOffset: number): void {
  const at = headerOffset + 0x2c;
  rom.fill(0, at, at + 4);
  let sum = 0xff + 0xff;
  for (let i = 0; i < rom.length; i++) sum += rom[i];
  sum &= 0xffff;
  const comp = sum ^ 0xffff;
  rom[at] = comp & 0xff; rom[at + 1] = comp >> 8;
  rom[at + 2] = sum & 0xff; rom[at + 3] = sum >> 8;
}

export function injectTadPlayerRom(base: Uint8Array, meta: TadPlayerRomMeta, exp: TadCompilerExport): Uint8Array {
  if (base.length !== meta.romSize) throw new Error(`Player ROM is ${base.length} bytes, expected ${meta.romSize}`);
  if (num(exp.asm, /Tad_Loader_SIZE\s*=\s*(\d+)/, 'Tad_Loader_SIZE') !== meta.loaderSize
    || num(exp.asm, /Tad_AudioDriver_SIZE\s*=\s*(\d+)/, 'Tad_AudioDriver_SIZE') !== meta.driverSize) {
    throw new Error('TAD export: loader or driver size differs from the player ROM build; rebuild it with tools/build-tad-player.sh');
  }
  if (exp.bin.length > meta.dataCapacity) throw new Error(`Audio data is ${exp.bin.length} bytes, the player ROM holds ${meta.dataCapacity}`);
  const rom = base.slice();
  rom.fill(0, meta.dataOffset, meta.dataOffset + meta.dataCapacity);
  rom.set(exp.bin, meta.dataOffset);
  const set = (offsets: number[], v: number) => offsets.forEach((o) => { rom[o] = v & 0xff; });
  set(meta.patches.lastSongId, num(exp.inc, /LAST_SONG_ID\s*=\s*(\d+)/, 'LAST_SONG_ID'));
  set(meta.patches.lastSfxId, Math.max(0, num(exp.inc, /N_SOUND_EFFECTS\s*=\s*(\d+)/, 'N_SOUND_EFFECTS') - 1));
  set(meta.patches.dataItems, num(exp.asm, /N_DATA_ITEMS\s*=\s*(\d+)/, 'N_DATA_ITEMS'));
  writeSnesChecksum(rom, meta.headerOffset);
  return rom;
}
