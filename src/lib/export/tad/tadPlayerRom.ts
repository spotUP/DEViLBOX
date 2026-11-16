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
  /** DEViLBOX player only: file offset of the "DVBXMETA" text block (32 titles x 28, author 28, comment 256 + 0). */
  metaOffset?: number;
}

/** Text the DEViLBOX player shows. Titles are per song, song 1 first. */
export interface TadPlayerText {
  titles: string[];
  author?: string;
  comment?: string;
}

const TITLE_LEN = 28, MAX_TITLES = 32, COMMENT_LEN = 256;

/** The player font holds upper-case ASCII only: lower case is raised, anything else outside space..'_' becomes '?'. */
function romText(s: string, len: number): number[] {
  const out = new Array<number>(len).fill(0x20);
  [...s.toUpperCase().slice(0, len)].forEach((c, i) => { const v = c.charCodeAt(0); out[i] = v >= 0x20 && v <= 0x5f ? v : 0x3f; });
  return out;
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

export function injectTadPlayerRom(base: Uint8Array, meta: TadPlayerRomMeta, exp: TadCompilerExport, text?: TadPlayerText): Uint8Array {
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
  if (meta.metaOffset !== undefined && text) {
    const m = meta.metaOffset + 8;
    if (String.fromCharCode(...rom.subarray(meta.metaOffset, m)) !== 'DVBXMETA') throw new Error('Player ROM text block not found at metaOffset');
    for (let i = 0; i < MAX_TITLES; i++) rom.set(romText(text.titles[i] ?? '', TITLE_LEN), m + i * TITLE_LEN);
    rom.set(romText(text.author ?? '', TITLE_LEN), m + MAX_TITLES * TITLE_LEN);
    rom.set(romText(text.comment ?? '', COMMENT_LEN), m + (MAX_TITLES + 1) * TITLE_LEN);
  }
  writeSnesChecksum(rom, meta.headerOffset);
  return rom;
}
