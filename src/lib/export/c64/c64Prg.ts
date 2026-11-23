/**
 * Runnable C64 program around a GoatTracker relocated player (.prg at $1000:
 * $1000 = init with the subtune in A, $1003 = play once per frame).
 * Layout: BASIC line `10 SYS2061` at $0801, boot code at $080D, zero padding,
 * the player at $1000, then the player screen (1000 screen codes + 1000
 * colours) right after the player. The boot code copies the screen to $0400 /
 * colour RAM, inits subtune 0 and starts a raster IRQ at line $80 that calls
 * play, counts the time and scrolls the message line.
 *
 * Screen = the 'c64' tile of thoughts/shared/design/player-ui/player-screens.html
 * (40x25 text, m 0, mx 1, three voice labels, time + song counter, coarse scroll).
 */
const BASIC = 0x0801;
const CODE = 0x080d;
const PLAYER = 0x1000;
const SCREEN = 0x0400;
const COLS = 40, ROWS = 25;

/** VIC-II colour index per design role (npal(C64_HW) in player-screens.html). */
export const C64_ROLE_COLOUR = { bg: 0, rule: 11, text: 1, dim: 15, bar: 7, barlo: 8, cap: 3, logo: 10, time: 3 } as const;
type Role = keyof typeof C64_ROLE_COLOUR;

/** ASCII -> C64 screen code (uppercase/graphics set); unknown characters become a space. */
function screenCode(ch: string): number {
  const c = ch.toUpperCase().charCodeAt(0);
  if (c >= 0x41 && c <= 0x5a) return c - 0x40;
  if (c >= 0x20 && c <= 0x3f) return c;
  return 0x20;
}

/** The static player screen: [screen codes, colours], 1000 bytes each. */
export function c64Screen(title: string, author: string, songCount = 1): [Uint8Array, Uint8Array] {
  const scr = new Uint8Array(COLS * ROWS).fill(0x20), col = new Uint8Array(COLS * ROWS).fill(C64_ROLE_COLOUR.text);
  const put = (x: number, y: number, s: string, role: Role) => {
    for (let i = 0; i < s.length && x + i < COLS; i++) { scr[y * COLS + x + i] = screenCode(s[i]); col[y * COLS + x + i] = C64_ROLE_COLOUR[role]; }
  };
  const rule = (y: number) => { for (let x = 1; x < COLS - 1; x++) { scr[y * COLS + x] = 0x40; col[y * COLS + x] = C64_ROLE_COLOUR.rule; } };
  const mx = 1, tw = COLS - mx - 10, B = ROWS;
  put(mx, 0, 'DEVILBOX', 'logo');
  put(10, 0, (title || 'UNTITLED').padEnd(tw).slice(0, tw), 'text');
  put(mx, 1, `BY ${author}`.slice(0, COLS - 2 * mx), 'dim');
  put(mx, 2, 'SID', 'bar');
  put(COLS - mx - 12, 2, 'COMMODORE 64', 'dim');
  rule(3);
  // Bars: bw 4, bx 14 (design formula); the labels sit under each bar.
  for (let i = 0; i < 3; i++) put(14 + i * 4 + 1, B - 4, String(i + 1), 'dim');
  put(mx, B - 3, '> 00:00', 'time');
  const sng = `SONG 1/${songCount}`;
  put(COLS - mx - sng.length, B - 3, sng, 'text');
  rule(B - 2);
  for (let x = mx; x < COLS - mx; x++) col[(B - 1) * COLS + x] = C64_ROLE_COLOUR.text;
  return [scr, col];
}

/** Two-pass-free 6502 emitter: absolute / relative label references patched at the end. */
class Asm {
  b: number[] = [];
  private labels = new Map<string, number>();
  private fix: Array<{ at: number; label: string; rel: boolean }> = [];
  private org: number;
  constructor(org: number) { this.org = org; }
  get pc(): number { return this.org + this.b.length; }
  l(name: string): void { this.labels.set(name, this.pc); }
  o(...x: number[]): void { this.b.push(...x); }
  /** opcode + 16-bit address (number or label, label may carry +offset as `name+5`). */
  a(op: number, addr: number | string): void {
    this.o(op);
    if (typeof addr === 'number') this.o(addr & 0xff, addr >> 8);
    else { this.fix.push({ at: this.b.length, label: addr, rel: false }); this.o(0, 0); }
  }
  br(op: number, label: string): void { this.o(op); this.fix.push({ at: this.b.length, label, rel: true }); this.o(0); }
  set(name: string, addr: number): void { this.labels.set(name, addr); }
  done(): number[] {
    for (const f of this.fix) {
      const [name, off] = f.label.split('+');
      const t = this.labels.get(name);
      if (t === undefined) throw new Error(`label ${name}`);
      const v = t + Number(off ?? 0);
      if (f.rel) {
        const d = v - (this.org + f.at + 1);
        if (d < -128 || d > 127) throw new Error(`branch to ${name} out of range`);
        this.b[f.at] = d & 0xff;
      } else { this.b[f.at] = v & 0xff; this.b[f.at + 1] = v >> 8; }
    }
    return this.b;
  }
}

/** CPU clock of the machine the .prg targets: NTSC 1022727 Hz, PAL 985248 Hz. */
export const c64CpuClock = (ntsc: boolean): number => (ntsc ? 1022727 : 985248);

/** `hz` player calls per second, driven by CIA 1 timer A so any rate plays exact on the target machine (`ntsc`). */
export function buildC64Prg(playerPrg: Uint8Array, title: string, author: string, message?: string, timing = { hz: 50, ntsc: false }): Uint8Array {
  const latch = Math.round(c64CpuClock(timing.ntsc) / timing.hz) - 1, fps = Math.min(255, Math.max(1, Math.round(timing.hz))); // shortcut: clock runs fast above 255 Hz, upgrade if a song needs it
  if (latch < 0x400 || latch > 0xffff) throw new Error(`tick rate ${timing.hz} Hz does not fit the CIA timer`);
  if (playerPrg.length < 3 || (playerPrg[0] | (playerPrg[1] << 8)) !== PLAYER) throw new Error('player must load at $1000');
  const playerEnd = PLAYER + playerPrg.length - 2;
  const [scr, col] = c64Screen(title, author);
  const msg = (message || `${title} BY ${author}   ***   `).slice(0, 250);
  const msgCodes = [...msg].map(screenCode);
  const timeAt = SCREEN + (ROWS - 3) * COLS + 3, rowMsg = SCREEN + (ROWS - 1) * COLS;
  const LDA_I = 0xa9, STA = 0x8d, LDA = 0xad, LDA_X = 0xbd, STA_X = 0x9d, INC = 0xee, DEC = 0xce, CMP_I = 0xc9, BNE = 0xd0;

  const s = new Asm(CODE);
  s.set('SCR', playerEnd); s.set('COL', playerEnd + 1000);
  s.o(0x78); //                                   sei
  s.o(LDA_I, 0x7f); s.a(STA, 0xdc0d); s.a(LDA, 0xdc0d); // CIA timer IRQ off
  s.o(LDA_I, C64_ROLE_COLOUR.bg); s.a(STA, 0xd020); s.a(STA, 0xd021);
  s.o(0xa2, 0x00); //                             ldx #0
  s.l('copy'); // 4 pages each; the last page runs past 1000 bytes into sprite pointers / spare colour RAM, harmless
  for (let p = 0; p < 4; p++) { s.a(LDA_X, `SCR+${p * 256}`); s.a(STA_X, SCREEN + p * 256); s.a(LDA_X, `COL+${p * 256}`); s.a(STA_X, 0xd800 + p * 256); }
  s.o(0xe8); s.br(BNE, 'copy'); //               inx / bne copy
  s.o(LDA_I, 0x00); s.a(0x20, PLAYER); //         jsr init (subtune 0)
  s.o(LDA_I, 0); const irqLo = s.b.length - 1; s.a(STA, 0x0314);
  s.o(LDA_I, 0); const irqHi = s.b.length - 1; s.a(STA, 0x0315);
  s.o(LDA_I, latch & 0xff); s.a(STA, 0xdc04); s.o(LDA_I, latch >> 8); s.a(STA, 0xdc05); // CIA 1 timer A period = clock / hz
  s.o(LDA_I, 0x81); s.a(STA, 0xdc0d); //          timer A IRQ on
  s.o(LDA_I, 0x11); s.a(STA, 0xdc0e); //          load latch, run continuous
  s.o(LDA_I, 0x1b); s.a(STA, 0xd011); //          text mode
  s.o(0x58); //                                   cli
  s.l('loop'); s.a(0x4c, 'loop');
  const irq = s.pc;
  s.a(LDA, 0xdc0d); //                            ack the timer IRQ
  s.a(0x20, PLAYER + 3); //                       jsr play
  // Time: mm:ss in screen RAM, one second per `fps` player calls.
  s.a(DEC, 'FRM'); s.br(BNE, 'scroll');
  s.o(LDA_I, fps); s.a(STA, 'FRM');
  for (const [d, lim] of [[4, 0x3a], [3, 0x36], [1, 0x3a]] as const) {
    s.a(INC, timeAt + d); s.a(LDA, timeAt + d); s.o(CMP_I, lim); s.br(BNE, 'scroll'); s.o(LDA_I, 0x30); s.a(STA, timeAt + d);
  }
  s.a(INC, timeAt);
  // Message: coarse scroll, one character every 8 frames over columns 1-38 of the last row.
  s.l('scroll'); s.a(DEC, 'SCF'); s.br(BNE, 'out');
  s.o(LDA_I, 8); s.a(STA, 'SCF');
  s.o(0xa2, 0x00); s.l('sh'); s.a(LDA_X, rowMsg + 2); s.a(STA_X, rowMsg + 1); s.o(0xe8, 0xe0, 37); s.br(BNE, 'sh');
  s.a(0xae, 'MP'); s.a(LDA_X, 'MSG'); s.br(BNE, 'put'); s.o(0xa2, 0x00); s.a(LDA, 'MSG');
  s.l('put'); s.a(STA, rowMsg + 38); s.o(0xe8); s.a(0x8e, 'MP');
  s.l('out'); s.a(0x4c, 0xea31); //               KERNAL keyboard scan + register restore
  s.l('FRM'); s.o(fps); s.l('SCF'); s.o(8); s.l('MP'); s.o(0);
  // Screen code 0 is '@' and ends the message; screenCode never yields it.
  s.l('MSG'); s.o(...msgCodes, 0);
  const code = s.done();
  code[irqLo] = irq & 0xff; code[irqHi] = irq >> 8;

  const stub = [0x0b, 0x08, 0x0a, 0x00, 0x9e, ...'2061'.split('').map((c) => c.charCodeAt(0)), 0x00, 0x00, 0x00, ...code];
  if (BASIC + stub.length > PLAYER) throw new Error('boot code overlaps the player');
  if (playerEnd + 2000 > 0xd000) throw new Error('player screen does not fit below $D000');
  const out = new Uint8Array(2 + (playerEnd - BASIC) + 2000);
  out[0] = BASIC & 0xff; out[1] = BASIC >> 8;
  out.set(stub, 2);
  out.set(playerPrg.subarray(2), 2 + (PLAYER - BASIC));
  out.set(scr, 2 + (playerEnd - BASIC));
  out.set(col, 2 + (playerEnd - BASIC) + 1000);
  return out;
}
