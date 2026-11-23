/**
 * Runnable C64 program around a GoatTracker relocated player (.prg at $1000:
 * $1000 = init with the subtune in A, $1003 = play once per frame).
 * Layout: BASIC line `10 SYS2061` at $0801, boot code at $080D (clear screen,
 * print title and author through CHROUT, init subtune 0, raster IRQ at line
 * $80 calling play), zero padding, then the player at $1000.
 */
const BASIC = 0x0801;
const CODE = 0x080d;
const PLAYER = 0x1000;

function petscii(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.toUpperCase().charCodeAt(0);
    out.push(c >= 0x20 && c < 0x5f ? c : 0x20);
  }
  return out;
}

export function buildC64Prg(playerPrg: Uint8Array, title: string, author: string): Uint8Array {
  if (playerPrg.length < 3 || (playerPrg[0] | (playerPrg[1] << 8)) !== PLAYER) throw new Error('player must load at $1000');
  const lo = (a: number) => a & 0xff, hi = (a: number) => a >> 8;
  // Code with the text and IRQ addresses patched below (offsets from CODE).
  const code = [
    0xa2, 0x00, //           ldx #0
    0xbd, 0, 0, //    text:  lda TEXT,x   (patched)
    0xf0, 0x06, //           beq done
    0x20, 0xd2, 0xff, //     jsr $ffd2
    0xe8, //                 inx
    0xd0, 0xf5, //           bne text
    0x78, //          done:  sei
    0xa9, 0x7f, 0x8d, 0x0d, 0xdc, //  lda #$7f / sta $dc0d (CIA timer IRQ off)
    0xad, 0x0d, 0xdc, //     lda $dc0d
    0xa9, 0x00, 0x20, lo(PLAYER), hi(PLAYER), // lda #0 / jsr init
    0xa9, 0, 0x8d, 0x14, 0x03, //   lda #<irq / sta $0314 (patched)
    0xa9, 0, 0x8d, 0x15, 0x03, //   lda #>irq / sta $0315 (patched)
    0xa9, 0x01, 0x8d, 0x1a, 0xd0, // raster IRQ on
    0xa9, 0x1b, 0x8d, 0x11, 0xd0, // raster bit 8 clear
    0xa9, 0x80, 0x8d, 0x12, 0xd0, // raster line $80
    0x58, //                 cli
    0x4c, 0, 0, //    loop:  jmp loop (patched)
    0xee, 0x19, 0xd0, // irq: inc $d019 (ack)
    0x20, lo(PLAYER + 3), hi(PLAYER + 3), // jsr play
    0x4c, 0x31, 0xea, //     jmp $ea31 (KERNAL keyboard scan + register restore)
  ];
  const loopAt = CODE + code.length - 12;
  const irqAt = CODE + code.length - 9;
  const textAt = CODE + code.length;
  code[3] = lo(textAt); code[4] = hi(textAt);
  code[28] = lo(irqAt); code[33] = hi(irqAt);
  code[code.length - 11] = lo(loopAt); code[code.length - 10] = hi(loopAt);
  const text = [0x93, ...petscii(title || 'untitled'), 0x0d, ...petscii(author), 0x0d, 0x00];
  const stub = [0x0b, 0x08, 0x0a, 0x00, 0x9e, ...petscii('2061'), 0x00, 0x00, 0x00, ...code, ...text];
  if (BASIC + stub.length > PLAYER) throw new Error('boot code overlaps the player');
  const out = new Uint8Array(2 + (PLAYER - BASIC) + playerPrg.length - 2);
  out[0] = lo(BASIC); out[1] = hi(BASIC);
  out.set(stub, 2);
  out.set(playerPrg.subarray(2), 2 + (PLAYER - BASIC));
  return out;
}
