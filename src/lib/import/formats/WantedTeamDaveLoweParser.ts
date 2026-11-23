/**
 * WantedTeamDaveLoweParser — parser for Wanted Team / Dave Lowe formats
 * (.spl, .riff, .hd, .bss)
 *
 * Detection only: AmigaDOS HUNK_HEADER. Used by the .spl route in
 * AmigaFormatParsers; UADE handles audio.
 */

export function isWantedTeamDaveLoweFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.length < 0x28) return false;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return dv.getUint32(0, false) === 0x000003F3;
}
