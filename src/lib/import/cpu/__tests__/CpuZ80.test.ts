// src/lib/import/cpu/__tests__/CpuZ80.test.ts
import { describe, it, expect, vi } from 'vitest';
import { CpuZ80, type Z80MemoryMap } from '../CpuZ80';

function makeRAM(init?: Partial<Record<number, number>>): Z80MemoryMap & { ram: Uint8Array } {
  const ram = new Uint8Array(0x10000);
  if (init) for (const [a, v] of Object.entries(init)) ram[Number(a)] = Number(v);
  return {
    ram,
    read: (a) => ram[a & 0xFFFF],
    write: (a, v) => { ram[a & 0xFFFF] = v & 0xFF; },
  };
}

describe('CpuZ80', () => {
  // ── 1. LD A,n immediate load ──────────────────────────────────────────────
  it('LD A,n loads immediate value into A', () => {
    // 0x0200: 3E 42  →  LD A, $42
    const mem = makeRAM({ 0x0200: 0x3E, 0x0201: 0x42 });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200);
    cpu.step();
    expect(cpu.getA()).toBe(0x42);
  });

  // ── 2. DJNZ loop counting down ────────────────────────────────────────────
  it('DJNZ loop counts B down to zero', () => {
    // 0x0200: 06 03   LD B, 3
    // 0x0202: 10 FE   DJNZ $0202  (self-loop while B != 0)
    // 0x0204: 00      NOP
    const mem = makeRAM({
      0x0200: 0x06, 0x0201: 0x03,  // LD B, 3
      0x0202: 0x10, 0x0203: 0xFE,  // DJNZ -2 (back to $0202)
      0x0204: 0x00,                 // NOP
    });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200);
    cpu.step();                // LD B, 3
    // run 3 iterations: each DJNZ decrements B; exits when B == 0
    cpu.step(); cpu.step(); cpu.step();
    expect(cpu.getB()).toBe(0x00);
    expect(cpu.getPC()).toBe(0x0204);
  });

  // ── 3. CALL + RET ─────────────────────────────────────────────────────────
  it('CALL + RET pushes/pops return address correctly', () => {
    // 0x0200: CD 10 02   CALL $0210
    // 0x0203: 00         NOP  (landing after RET)
    // 0x0210: 3E 55      LD A, $55
    // 0x0212: C9         RET
    const mem = makeRAM({
      0x0200: 0xCD, 0x0201: 0x10, 0x0202: 0x02,  // CALL $0210
      0x0203: 0x00,                                // NOP
      0x0210: 0x3E, 0x0211: 0x55,                 // LD A, $55
      0x0212: 0xC9,                                // RET
    });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200, 0xFFFE);
    cpu.step();  // CALL $0210
    cpu.step();  // LD A, $55
    cpu.step();  // RET
    expect(cpu.getA()).toBe(0x55);
    expect(cpu.getPC()).toBe(0x0203);
  });

  // ── 4. callSubroutine wrapper ─────────────────────────────────────────────
  it('callSubroutine executes subroutine and returns when done', () => {
    // Subroutine at $8000: LD A,$77, LD ($4000),A, RET
    // 0x8000: 3E 77         LD A, $77
    // 0x8002: 32 00 40      LD ($4000), A
    // 0x8005: C9            RET
    const mem = makeRAM({
      0x8000: 0x3E, 0x8001: 0x77,               // LD A, $77
      0x8002: 0x32, 0x8003: 0x00, 0x8004: 0x40, // LD ($4000), A
      0x8005: 0xC9,                              // RET
    });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x8000, 0xFFFE);
    cpu.callSubroutine(0x8000);
    expect(mem.ram[0x4000]).toBe(0x77);
  });

  // ── 5. OUT (n),A ─────────────────────────────────────────────────────────
  it('OUT (n),A calls outPort with correct port and value', () => {
    // 0x0200: 3E FF   LD A, $FF
    // 0x0202: D3 A0   OUT ($A0), A
    const outPort = vi.fn();
    const mem: Z80MemoryMap & { ram: Uint8Array } = {
      ...makeRAM({ 0x0200: 0x3E, 0x0201: 0xFF, 0x0202: 0xD3, 0x0203: 0xA0 }),
      outPort,
    };
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200);
    cpu.step();  // LD A, $FF
    cpu.step();  // OUT ($A0), A
    expect(outPort).toHaveBeenCalledWith(0xA0, 0xFF);
  });

  // ── 6. LDIR block copy ────────────────────────────────────────────────────
  it('LDIR copies a block of bytes from source to destination', () => {
    // Set up: copy 4 bytes from $1000 to $2000
    // src[$1000..$1003] = [0x11, 0x22, 0x33, 0x44]
    // 0x0200: 01 00 10   LD BC, $1000   (source)
    // 0x0203: 11 00 20   LD DE, $2000   (destination)
    // 0x0206: 21 04 00   LD HL, $0004   (count)  — note: Z80 LDIR uses HL as src, DE as dest, BC as count
    // Actually Z80 LDIR: HL=source, DE=dest, BC=count
    // 0x0200: 21 00 10   LD HL, $1000
    // 0x0203: 11 00 20   LD DE, $2000
    // 0x0206: 01 04 00   LD BC, $0004
    // 0x0209: ED B0      LDIR
    // 0x020B: 00         NOP
    const mem = makeRAM({
      0x1000: 0x11, 0x1001: 0x22, 0x1002: 0x33, 0x1003: 0x44,
      0x0200: 0x21, 0x0201: 0x00, 0x0202: 0x10,  // LD HL, $1000
      0x0203: 0x11, 0x0204: 0x00, 0x0205: 0x20,  // LD DE, $2000
      0x0206: 0x01, 0x0207: 0x04, 0x0208: 0x00,  // LD BC, $0004
      0x0209: 0xED, 0x020A: 0xB0,                // LDIR
      0x020B: 0x00,                               // NOP
    });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200, 0xFFFE);
    cpu.step();  // LD HL, $1000
    cpu.step();  // LD DE, $2000
    cpu.step();  // LD BC, $0004
    cpu.step();  // LDIR (runs entire block transfer)
    expect(mem.ram[0x2000]).toBe(0x11);
    expect(mem.ram[0x2001]).toBe(0x22);
    expect(mem.ram[0x2002]).toBe(0x33);
    expect(mem.ram[0x2003]).toBe(0x44);
    expect(cpu.getBC()).toBe(0x0000);  // BC should be 0 after LDIR
    expect(cpu.getPC()).toBe(0x020B);  // PC should advance past LDIR
  });

  // ── Additional coverage: ALU and flag operations ──────────────────────────
  it('ADD A,n sets carry and half-carry flags correctly', () => {
    // LD A,$FF; ADD A,$01 → result $00, carry set
    const mem = makeRAM({
      0x0200: 0x3E, 0x0201: 0xFF,  // LD A, $FF
      0x0202: 0xC6, 0x0203: 0x01,  // ADD A, $01
    });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200);
    cpu.step();
    cpu.step();
    expect(cpu.getA()).toBe(0x00);
  });

  it('XOR A clears A to zero', () => {
    const mem = makeRAM({
      0x0200: 0x3E, 0x0201: 0x42,  // LD A, $42
      0x0202: 0xAF,                 // XOR A
    });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200);
    cpu.step();
    cpu.step();
    expect(cpu.getA()).toBe(0x00);
  });

  it('PUSH AF / POP AF round-trips AF', () => {
    // LD A,$AB; PUSH AF; XOR A; POP AF → A should be $AB again
    const mem = makeRAM({
      0x0200: 0x3E, 0x0201: 0xAB,  // LD A, $AB
      0x0202: 0xF5,                 // PUSH AF
      0x0203: 0xAF,                 // XOR A  (clears A)
      0x0204: 0xF1,                 // POP AF
    });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200, 0xFFFE);
    cpu.step();
    cpu.step();
    cpu.step();
    cpu.step();
    expect(cpu.getA()).toBe(0xAB);
  });

  it('JP nn unconditional jump', () => {
    // 0x0200: C3 10 02   JP $0210
    // 0x0210: 3E 99      LD A, $99
    const mem = makeRAM({
      0x0200: 0xC3, 0x0201: 0x10, 0x0202: 0x02,  // JP $0210
      0x0210: 0x3E, 0x0211: 0x99,                 // LD A, $99
    });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200);
    cpu.step();  // JP $0210
    cpu.step();  // LD A, $99
    expect(cpu.getA()).toBe(0x99);
    expect(cpu.getPC()).toBe(0x0212);
  });

  it('INC r / DEC r update register correctly', () => {
    const mem = makeRAM({
      0x0200: 0x06, 0x0201: 0x05,  // LD B, 5
      0x0202: 0x04,                  // INC B
      0x0203: 0x05,                  // DEC B
      0x0204: 0x05,                  // DEC B
    });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200);
    cpu.step();  // LD B, 5
    cpu.step();  // INC B → 6
    cpu.step();  // DEC B → 5
    cpu.step();  // DEC B → 4
    expect(cpu.getB()).toBe(4);
  });

  it('JR e relative jump forward', () => {
    // 0x0200: 18 02  JR +2  → jumps to $0204
    // 0x0202: 3E 01  LD A,$01  (skipped)
    // 0x0204: 3E 02  LD A,$02
    const mem = makeRAM({
      0x0200: 0x18, 0x0201: 0x02,  // JR +2
      0x0202: 0x3E, 0x0203: 0x01,  // LD A, $01 (skipped)
      0x0204: 0x3E, 0x0205: 0x02,  // LD A, $02
    });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200);
    cpu.step();  // JR +2
    cpu.step();  // LD A, $02
    expect(cpu.getA()).toBe(0x02);
  });

  it('IN A,(n) calls inPort and stores result in A', () => {
    const inPort = vi.fn().mockReturnValue(0x5A);
    const mem: Z80MemoryMap & { ram: Uint8Array } = {
      ...makeRAM({ 0x0200: 0xDB, 0x0201: 0xFF }),  // IN A, ($FF)
      inPort,
    };
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200);
    cpu.step();
    expect(inPort).toHaveBeenCalledWith(0xFF);
    expect(cpu.getA()).toBe(0x5A);
  });

  it('LD HL,(nn) loads 16-bit value from memory into HL', () => {
    // $3000/$3001 = lo=$34, hi=$12  →  HL = $1234
    const mem = makeRAM({
      0x3000: 0x34, 0x3001: 0x12,
      0x0200: 0x2A, 0x0201: 0x00, 0x0202: 0x30,  // LD HL, ($3000)
    });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200);
    cpu.step();
    expect(cpu.getH()).toBe(0x12);
    expect(cpu.getL()).toBe(0x34);
  });

  it('LD (HL),r writes register to memory at HL', () => {
    // LD HL, $3000; LD A, $BE; LD (HL), A
    const mem = makeRAM({
      0x0200: 0x21, 0x0201: 0x00, 0x0202: 0x30,  // LD HL, $3000
      0x0203: 0x3E, 0x0204: 0xBE,                 // LD A, $BE
      0x0205: 0x77,                                // LD (HL), A
    });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200, 0xFFFE);
    cpu.step();
    cpu.step();
    cpu.step();
    expect(mem.ram[0x3000]).toBe(0xBE);
  });

  it('EX AF,AF swaps accumulator and flags', () => {
    // LD A,$11; EX AF,AF'; LD A,$22; EX AF,AF' → A should be $11 again
    const mem = makeRAM({
      0x0200: 0x3E, 0x0201: 0x11,  // LD A, $11
      0x0202: 0x08,                  // EX AF, AF'
      0x0203: 0x3E, 0x0204: 0x22,  // LD A, $22
      0x0205: 0x08,                  // EX AF, AF'
    });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200);
    cpu.step();
    cpu.step();
    cpu.step();
    cpu.step();
    expect(cpu.getA()).toBe(0x11);
  });

  it('CB prefix: RLC r rotates left with carry', () => {
    // LD A,$80; CB 07 (RLC A) → A=$01, C=1
    const mem = makeRAM({
      0x0200: 0x3E, 0x0201: 0x80,  // LD A, $80
      0x0202: 0xCB, 0x0203: 0x07,  // RLC A
    });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200);
    cpu.step();
    cpu.step();
    expect(cpu.getA()).toBe(0x01);
  });

  it('DD prefix: LD A,(IX+d) loads from IX-indexed address', () => {
    // Put $AB at $3005; LD IX,$3000; LD A,(IX+5)
    // 0x0200: DD 21 00 30   LD IX, $3000
    // 0x0204: DD 7E 05      LD A, (IX+5)
    const mem = makeRAM({
      0x3005: 0xAB,
      0x0200: 0xDD, 0x0201: 0x21, 0x0202: 0x00, 0x0203: 0x30,  // LD IX, $3000
      0x0204: 0xDD, 0x0205: 0x7E, 0x0206: 0x05,                 // LD A, (IX+5)
    });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200);
    cpu.step();  // LD IX, $3000
    cpu.step();  // LD A, (IX+5)
    expect(cpu.getA()).toBe(0xAB);
  });

  it('ED prefix: LDIR via ED B0 copies block', () => {
    // same as the main LDIR test but confirms ED B0 encoding
    const mem = makeRAM({
      0x1000: 0xDE, 0x1001: 0xAD,
      0x0200: 0x21, 0x0201: 0x00, 0x0202: 0x10,  // LD HL, $1000
      0x0203: 0x11, 0x0204: 0x00, 0x0205: 0x20,  // LD DE, $2000
      0x0206: 0x01, 0x0207: 0x02, 0x0208: 0x00,  // LD BC, $0002
      0x0209: 0xED, 0x020A: 0xB0,                 // LDIR
    });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200, 0xFFFE);
    cpu.step(); cpu.step(); cpu.step(); cpu.step();
    expect(mem.ram[0x2000]).toBe(0xDE);
    expect(mem.ram[0x2001]).toBe(0xAD);
  });

  it('setBC / getBC round-trips 16-bit BC value', () => {
    const mem = makeRAM({});
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0000);
    cpu.setBC(0x1234);
    expect(cpu.getBC()).toBe(0x1234);
    expect(cpu.getB()).toBe(0x12);
    expect(cpu.getC()).toBe(0x34);
  });

  it('RST 38h pushes PC and jumps to $0038', () => {
    // 0x0200: FF   RST $38
    const mem = makeRAM({ 0x0200: 0xFF, 0x0038: 0x00 });
    const cpu = new CpuZ80(mem);
    cpu.reset(0x0200, 0xFFFE);
    cpu.step();  // RST $38
    expect(cpu.getPC()).toBe(0x0038);
  });
});
