/** Mega Drive ROM: byte placement only. player.bin (public/md, built by tools/build-md-player.sh) = shell + MDSDRV padded to $4000; the sequence follows. */
export interface MdPlayerLayout { seqAddress: number; pcmPtrSlot: number }
export const MD_LAYOUT: MdPlayerLayout = { seqAddress: 0x4000, pcmPtrSlot: 0x200 };

export function buildMdRom(player: Uint8Array, seq: Uint8Array, pcm: Uint8Array, layout: MdPlayerLayout = MD_LAYOUT): Uint8Array {
  if (player.length !== layout.seqAddress) throw new Error(`player.bin must be ${layout.seqAddress} bytes`);
  const seqEnd = layout.seqAddress + seq.length;
  const pcmAt = pcm.length ? Math.ceil(seqEnd / 0x8000) * 0x8000 : 0; // mds_init wants the PCM blob 32 KiB aligned
  const total = Math.max(0x20000, 1 << Math.ceil(Math.log2(pcm.length ? pcmAt + pcm.length : seqEnd)));
  if (total > 0x400000) throw new Error('Song does not fit a 4 MB Mega Drive ROM.');
  const rom = new Uint8Array(total);
  const dv = new DataView(rom.buffer);
  rom.set(player);
  rom.set(seq, layout.seqAddress);
  if (pcm.length) rom.set(pcm, pcmAt);
  dv.setUint32(layout.pcmPtrSlot, pcmAt);
  dv.setUint32(0x1a4, total - 1);
  let sum = 0;
  for (let i = 0x200; i < total; i += 2) sum = (sum + ((rom[i] << 8) | rom[i + 1])) & 0xffff;
  dv.setUint16(0x18e, sum);
  return rom;
}
