// src/lib/import/cpu/__tests__/Cpu6502.test.ts
import { describe, it, expect } from 'vitest';
import { Cpu6502, type MemoryMap } from '../Cpu6502';

function makeRAM(init?: Partial<Record<number,number>>): MemoryMap & { ram: Uint8Array } {
  const ram = new Uint8Array(0x10000);
  if (init) for (const [a, v] of Object.entries(init)) ram[Number(a)] = Number(v);
  return { ram, read: (a) => ram[a & 0xFFFF], write: (a, v) => { ram[a & 0xFFFF] = v & 0xFF; } };
}

describe('Cpu6502', () => {
  it('executes LDA #imm', () => {
    const mem = makeRAM({ 0x0200: 0xA9, 0x0201: 0x42, 0x0202: 0xEA });
    const cpu = new Cpu6502(mem);
    cpu.reset(0x0200);
    cpu.runSteps(1);
    expect(cpu.getA()).toBe(0x42);
  });

  it('executes JSR + RTS correctly', () => {
    // 0x0200: JSR $0210   [20 10 02]
    // 0x0203: NOP          [EA]
    // 0x0204: (stop here)
    // 0x0210: LDA #$55    [A9 55]
    // 0x0212: RTS          [60]
    const mem = makeRAM({
      0x0200: 0x20, 0x0201: 0x10, 0x0202: 0x02, // JSR $0210
      0x0203: 0xEA,                               // NOP (after return)
      0x0204: 0xEA,                               // NOP
      0x0210: 0xA9, 0x0211: 0x55,                // LDA #$55
      0x0212: 0x60,                               // RTS
    });
    const cpu = new Cpu6502(mem);
    cpu.reset(0x0200);
    cpu.runSteps(4); // JSR, LDA, RTS, NOP
    expect(cpu.getA()).toBe(0x55);
    expect(cpu.getPC()).toBe(0x0204);
  });

  it('handles branch (BEQ)', () => {
    // LDA #0 → BEQ +2 → LDA #1 → LDA #2 → (stop)
    // Branch taken: skips LDA #1
    const mem = makeRAM({
      0x0200: 0xA9, 0x0201: 0x00, // LDA #0 (sets Z)
      0x0202: 0xF0, 0x0203: 0x02, // BEQ +2 (skip LDA #1)
      0x0204: 0xA9, 0x0205: 0x01, // LDA #1 (skipped)
      0x0206: 0xA9, 0x0207: 0x02, // LDA #2
      0x0208: 0xEA,               // NOP
    });
    const cpu = new Cpu6502(mem);
    cpu.reset(0x0200);
    cpu.runSteps(4); // LDA, BEQ, LDA #2, NOP
    expect(cpu.getA()).toBe(0x02);
  });

  it('callSubroutine runs init+play pattern and stops at RTS', () => {
    // play routine: LDA #0x77, STA $4000, RTS
    const mem = makeRAM({
      0x8000: 0xA9, 0x8001: 0x77, // LDA #$77
      0x8002: 0x8D, 0x8003: 0x00, 0x8004: 0x40, // STA $4000
      0x8005: 0x60,               // RTS
    });
    const cpu = new Cpu6502(mem);
    cpu.reset(0x8000);
    cpu.callSubroutine(0x8000);
    expect(mem.ram[0x4000]).toBe(0x77);
  });

  it('LDA (zp),Y indirect indexed reads correct address', () => {
    // Zero page $10 = $00, $11 = $20 (pointer to $2000)
    // Y = $05 → effective address = $2005
    // mem[$2005] = $AB
    const mem = makeRAM({
      0x0010: 0x00, 0x0011: 0x20, // pointer at zp $10 → $2000
      0x2005: 0xAB,               // value at $2000 + Y(5)
      0x0200: 0xA0, 0x0201: 0x05, // LDY #5
      0x0202: 0xB1, 0x0203: 0x10, // LDA ($10),Y
      0x0204: 0xEA,               // NOP
    });
    const cpu = new Cpu6502(mem);
    cpu.reset(0x0200);
    cpu.runSteps(3);
    expect(cpu.getA()).toBe(0xAB);
  });

  it('DEX + BNE loop counts down correctly', () => {
    // LDX #3
    // loop: DEX
    //        BNE loop   (backward branch)
    // NOP
    const mem = makeRAM({
      0x0200: 0xA2, 0x0201: 0x03, // LDX #3
      0x0202: 0xCA,               // DEX
      0x0203: 0xD0, 0x0204: 0xFD, // BNE -3 (back to $0202)
      0x0205: 0xEA,               // NOP
    });
    const cpu = new Cpu6502(mem);
    cpu.reset(0x0200);
    cpu.runSteps(1 + 3*2 + 1); // LDX + 3x(DEX+BNE) + final NOP
    expect(cpu.getX()).toBe(0x00);
    expect(cpu.getPC()).toBe(0x0206);
  });

  it('ADC carry and overflow flags', () => {
    // $7F + $01 = $80: overflow (V=1), no carry (C=0)
    const mem = makeRAM({
      0x0200: 0xA9, 0x0201: 0x7F, // LDA #$7F
      0x0202: 0x69, 0x0203: 0x01, // ADC #$01
      0x0204: 0xEA,
    });
    const cpu = new Cpu6502(mem);
    cpu.reset(0x0200);
    cpu.runSteps(3);
    expect(cpu.getA()).toBe(0x80);
  });
});
