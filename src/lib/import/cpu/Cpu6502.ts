// src/lib/import/cpu/Cpu6502.ts

export interface MemoryMap {
  read(addr: number): number;
  write(addr: number, value: number): void;
}

export class Cpu6502 {
  private mem: MemoryMap;
  private A = 0; private X = 0; private Y = 0;
  private SP = 0xFD; private PC = 0;
  // Status flags as individual bits
  private N = 0; private V = 0; private B = 1;
  private D = 0; private I = 1; private Z = 0; private C = 0;

  constructor(mem: MemoryMap) { this.mem = mem; }

  reset(pc: number, sp = 0xFD): void {
    this.PC = pc; this.SP = sp;
    this.A = 0; this.X = 0; this.Y = 0;
    this.N = 0; this.V = 0; this.B = 1; this.D = 0; this.I = 1; this.Z = 1; this.C = 0;
  }

  getA(): number { return this.A; }
  getX(): number { return this.X; }
  getY(): number { return this.Y; }
  getPC(): number { return this.PC; }
  getSP(): number { return this.SP; }
  setA(v: number): void { this.A = v & 0xFF; }
  setX(v: number): void { this.X = v & 0xFF; }
  setY(v: number): void { this.Y = v & 0xFF; }
  setPC(v: number): void { this.PC = v & 0xFFFF; }

  private rd(a: number): number { return this.mem.read(a & 0xFFFF) & 0xFF; }
  private wr(a: number, v: number): void { this.mem.write(a & 0xFFFF, v & 0xFF); }
  // 6502 page-wrap bug on indirect JMP: high byte wraps within page
  private rd16wrap(a: number): number { return this.rd(a) | (this.rd((a & 0xFF00) | ((a + 1) & 0xFF)) << 8); }

  private fetch(): number { return this.rd(this.PC++); }
  private fetch16(): number { const lo = this.fetch(); const hi = this.fetch(); return lo | (hi << 8); }

  private push(v: number): void { this.wr(0x0100 | this.SP, v); this.SP = (this.SP - 1) & 0xFF; }
  private pop(): number { this.SP = (this.SP + 1) & 0xFF; return this.rd(0x0100 | this.SP); }

  private getP(): number {
    return (this.N << 7) | (this.V << 6) | (1 << 5) | (this.B << 4) |
           (this.D << 3) | (this.I << 2) | (this.Z << 1) | this.C;
  }
  private setP(v: number): void {
    this.N = (v >> 7) & 1; this.V = (v >> 6) & 1; this.B = (v >> 4) & 1;
    this.D = (v >> 3) & 1; this.I = (v >> 2) & 1; this.Z = (v >> 1) & 1; this.C = v & 1;
  }
  private nz(v: number): void { this.N = (v >> 7) & 1; this.Z = v === 0 ? 1 : 0; }

  private adc(val: number): void {
    // Decimal mode (D flag) not implemented: NES 2A03 has no BCD hardware.
    // SID/SAP music drivers rarely use BCD for audio logic, so this is acceptable.
    const r = this.A + val + this.C;
    this.V = (~(this.A ^ val) & (this.A ^ r) & 0x80) ? 1 : 0;
    this.C = r > 0xFF ? 1 : 0;
    this.A = r & 0xFF; this.nz(this.A);
  }
  private sbc(val: number): void { this.adc(val ^ 0xFF); }
  private cmp(a: number, b: number): void {
    const r = a - b;
    this.N = (r >> 7) & 1;
    this.Z = (r & 0xFF) === 0 ? 1 : 0;
    this.C = a >= b ? 1 : 0;
  }
  private branch(cond: boolean): void {
    const off = this.fetch();
    if (cond) this.PC = (this.PC + (off < 0x80 ? off : off - 0x100)) & 0xFFFF;
  }
  private asl(v: number): number { this.C = (v >> 7) & 1; v = (v << 1) & 0xFF; this.nz(v); return v; }
  private lsr(v: number): number { this.C = v & 1; v = v >> 1; this.nz(v); return v; }
  private rol(v: number): number { const c = this.C; this.C = (v >> 7) & 1; v = ((v << 1) | c) & 0xFF; this.nz(v); return v; }
  private ror(v: number): number { const c = this.C; this.C = v & 1; v = (v >> 1) | (c << 7); this.nz(v); return v; }

  /** Execute one instruction, return cycles consumed. */
  step(): number {
    const op = this.fetch();
    switch (op) {
      // ── LDA ──
      case 0xA9: { const v = this.fetch();                           this.A = v; this.nz(v); return 2; }
      case 0xA5: { const v = this.rd(this.fetch());                  this.A = v; this.nz(v); return 3; }
      case 0xB5: { const v = this.rd((this.fetch()+this.X)&0xFF);   this.A = v; this.nz(v); return 4; }
      case 0xAD: { const v = this.rd(this.fetch16());                this.A = v; this.nz(v); return 4; }
      case 0xBD: { const v = this.rd(this.fetch16()+this.X);        this.A = v; this.nz(v); return 4; }
      case 0xB9: { const v = this.rd(this.fetch16()+this.Y);        this.A = v; this.nz(v); return 4; }
      case 0xA1: { const zp=(this.fetch()+this.X)&0xFF; const v=this.rd(this.rd16wrap(zp)); this.A=v; this.nz(v); return 6; }
      case 0xB1: { const zp=this.fetch(); const v=this.rd(this.rd16wrap(zp)+this.Y); this.A=v; this.nz(v); return 5; }
      // ── LDX ──
      case 0xA2: { const v=this.fetch();                           this.X=v; this.nz(v); return 2; }
      case 0xA6: { const v=this.rd(this.fetch());                  this.X=v; this.nz(v); return 3; }
      case 0xB6: { const v=this.rd((this.fetch()+this.Y)&0xFF);   this.X=v; this.nz(v); return 4; }
      case 0xAE: { const v=this.rd(this.fetch16());                this.X=v; this.nz(v); return 4; }
      case 0xBE: { const v=this.rd(this.fetch16()+this.Y);        this.X=v; this.nz(v); return 4; }
      // ── LDY ──
      case 0xA0: { const v=this.fetch();                           this.Y=v; this.nz(v); return 2; }
      case 0xA4: { const v=this.rd(this.fetch());                  this.Y=v; this.nz(v); return 3; }
      case 0xB4: { const v=this.rd((this.fetch()+this.X)&0xFF);   this.Y=v; this.nz(v); return 4; }
      case 0xAC: { const v=this.rd(this.fetch16());                this.Y=v; this.nz(v); return 4; }
      case 0xBC: { const v=this.rd(this.fetch16()+this.X);        this.Y=v; this.nz(v); return 4; }
      // ── STA ──
      case 0x85: { this.wr(this.fetch(), this.A); return 3; }
      case 0x95: { this.wr((this.fetch()+this.X)&0xFF, this.A); return 4; }
      case 0x8D: { this.wr(this.fetch16(), this.A); return 4; }
      case 0x9D: { this.wr(this.fetch16()+this.X, this.A); return 5; }
      case 0x99: { this.wr(this.fetch16()+this.Y, this.A); return 5; }
      case 0x81: { const zp=(this.fetch()+this.X)&0xFF; this.wr(this.rd16wrap(zp), this.A); return 6; }
      case 0x91: { const zp=this.fetch(); this.wr(this.rd16wrap(zp)+this.Y, this.A); return 6; }
      // ── STX ──
      case 0x86: { this.wr(this.fetch(), this.X); return 3; }
      case 0x96: { this.wr((this.fetch()+this.Y)&0xFF, this.X); return 4; }
      case 0x8E: { this.wr(this.fetch16(), this.X); return 4; }
      // ── STY ──
      case 0x84: { this.wr(this.fetch(), this.Y); return 3; }
      case 0x94: { this.wr((this.fetch()+this.X)&0xFF, this.Y); return 4; }
      case 0x8C: { this.wr(this.fetch16(), this.Y); return 4; }
      // ── Transfers ──
      case 0xAA: { this.X=this.A; this.nz(this.X); return 2; }
      case 0xA8: { this.Y=this.A; this.nz(this.Y); return 2; }
      case 0x8A: { this.A=this.X; this.nz(this.A); return 2; }
      case 0x98: { this.A=this.Y; this.nz(this.A); return 2; }
      case 0xBA: { this.X=this.SP; this.nz(this.X); return 2; }
      case 0x9A: { this.SP=this.X; return 2; }
      // ── Stack ──
      case 0x48: { this.push(this.A); return 3; }
      case 0x68: { this.A=this.pop(); this.nz(this.A); return 4; }
      case 0x08: { this.push(this.getP() | 0x10); return 3; }
      case 0x28: { this.setP(this.pop()); return 4; }
      // ── ADC ──
      case 0x69: { this.adc(this.fetch()); return 2; }
      case 0x65: { this.adc(this.rd(this.fetch())); return 3; }
      case 0x75: { this.adc(this.rd((this.fetch()+this.X)&0xFF)); return 4; }
      case 0x6D: { this.adc(this.rd(this.fetch16())); return 4; }
      case 0x7D: { this.adc(this.rd(this.fetch16()+this.X)); return 4; }
      case 0x79: { this.adc(this.rd(this.fetch16()+this.Y)); return 4; }
      case 0x61: { const zp=(this.fetch()+this.X)&0xFF; this.adc(this.rd(this.rd16wrap(zp))); return 6; }
      case 0x71: { const zp=this.fetch(); this.adc(this.rd(this.rd16wrap(zp)+this.Y)); return 5; }
      // ── SBC ──
      case 0xE9: { this.sbc(this.fetch()); return 2; }
      case 0xE5: { this.sbc(this.rd(this.fetch())); return 3; }
      case 0xF5: { this.sbc(this.rd((this.fetch()+this.X)&0xFF)); return 4; }
      case 0xED: { this.sbc(this.rd(this.fetch16())); return 4; }
      case 0xFD: { this.sbc(this.rd(this.fetch16()+this.X)); return 4; }
      case 0xF9: { this.sbc(this.rd(this.fetch16()+this.Y)); return 4; }
      case 0xE1: { const zp=(this.fetch()+this.X)&0xFF; this.sbc(this.rd(this.rd16wrap(zp))); return 6; }
      case 0xF1: { const zp=this.fetch(); this.sbc(this.rd(this.rd16wrap(zp)+this.Y)); return 5; }
      // ── AND ──
      case 0x29: { this.A&=this.fetch(); this.nz(this.A); return 2; }
      case 0x25: { this.A&=this.rd(this.fetch()); this.nz(this.A); return 3; }
      case 0x35: { this.A&=this.rd((this.fetch()+this.X)&0xFF); this.nz(this.A); return 4; }
      case 0x2D: { this.A&=this.rd(this.fetch16()); this.nz(this.A); return 4; }
      case 0x3D: { this.A&=this.rd(this.fetch16()+this.X); this.nz(this.A); return 4; }
      case 0x39: { this.A&=this.rd(this.fetch16()+this.Y); this.nz(this.A); return 4; }
      case 0x21: { const zp=(this.fetch()+this.X)&0xFF; this.A&=this.rd(this.rd16wrap(zp)); this.nz(this.A); return 6; }
      case 0x31: { const zp=this.fetch(); this.A&=this.rd(this.rd16wrap(zp)+this.Y); this.nz(this.A); return 5; }
      // ── ORA ──
      case 0x09: { this.A|=this.fetch(); this.nz(this.A); return 2; }
      case 0x05: { this.A|=this.rd(this.fetch()); this.nz(this.A); return 3; }
      case 0x15: { this.A|=this.rd((this.fetch()+this.X)&0xFF); this.nz(this.A); return 4; }
      case 0x0D: { this.A|=this.rd(this.fetch16()); this.nz(this.A); return 4; }
      case 0x1D: { this.A|=this.rd(this.fetch16()+this.X); this.nz(this.A); return 4; }
      case 0x19: { this.A|=this.rd(this.fetch16()+this.Y); this.nz(this.A); return 4; }
      case 0x01: { const zp=(this.fetch()+this.X)&0xFF; this.A|=this.rd(this.rd16wrap(zp)); this.nz(this.A); return 6; }
      case 0x11: { const zp=this.fetch(); this.A|=this.rd(this.rd16wrap(zp)+this.Y); this.nz(this.A); return 5; }
      // ── EOR ──
      case 0x49: { this.A^=this.fetch(); this.nz(this.A); return 2; }
      case 0x45: { this.A^=this.rd(this.fetch()); this.nz(this.A); return 3; }
      case 0x55: { this.A^=this.rd((this.fetch()+this.X)&0xFF); this.nz(this.A); return 4; }
      case 0x4D: { this.A^=this.rd(this.fetch16()); this.nz(this.A); return 4; }
      case 0x5D: { this.A^=this.rd(this.fetch16()+this.X); this.nz(this.A); return 4; }
      case 0x59: { this.A^=this.rd(this.fetch16()+this.Y); this.nz(this.A); return 4; }
      case 0x41: { const zp=(this.fetch()+this.X)&0xFF; this.A^=this.rd(this.rd16wrap(zp)); this.nz(this.A); return 6; }
      case 0x51: { const zp=this.fetch(); this.A^=this.rd(this.rd16wrap(zp)+this.Y); this.nz(this.A); return 5; }
      // ── CMP/CPX/CPY ──
      case 0xC9: { this.cmp(this.A, this.fetch()); return 2; }
      case 0xC5: { this.cmp(this.A, this.rd(this.fetch())); return 3; }
      case 0xD5: { this.cmp(this.A, this.rd((this.fetch()+this.X)&0xFF)); return 4; }
      case 0xCD: { this.cmp(this.A, this.rd(this.fetch16())); return 4; }
      case 0xDD: { this.cmp(this.A, this.rd(this.fetch16()+this.X)); return 4; }
      case 0xD9: { this.cmp(this.A, this.rd(this.fetch16()+this.Y)); return 4; }
      case 0xC1: { const zp=(this.fetch()+this.X)&0xFF; this.cmp(this.A,this.rd(this.rd16wrap(zp))); return 6; }
      case 0xD1: { const zp=this.fetch(); this.cmp(this.A,this.rd(this.rd16wrap(zp)+this.Y)); return 5; }
      case 0xE0: { this.cmp(this.X, this.fetch()); return 2; }
      case 0xE4: { this.cmp(this.X, this.rd(this.fetch())); return 3; }
      case 0xEC: { this.cmp(this.X, this.rd(this.fetch16())); return 4; }
      case 0xC0: { this.cmp(this.Y, this.fetch()); return 2; }
      case 0xC4: { this.cmp(this.Y, this.rd(this.fetch())); return 3; }
      case 0xCC: { this.cmp(this.Y, this.rd(this.fetch16())); return 4; }
      // ── BIT ──
      case 0x24: { const v=this.rd(this.fetch()); this.Z=(this.A&v)?0:1; this.N=(v>>7)&1; this.V=(v>>6)&1; return 3; }
      case 0x2C: { const v=this.rd(this.fetch16()); this.Z=(this.A&v)?0:1; this.N=(v>>7)&1; this.V=(v>>6)&1; return 4; }
      // ── INC/DEC ──
      case 0xE6: { const a=this.fetch(); const v=(this.rd(a)+1)&0xFF; this.wr(a,v); this.nz(v); return 5; }
      case 0xF6: { const a=(this.fetch()+this.X)&0xFF; const v=(this.rd(a)+1)&0xFF; this.wr(a,v); this.nz(v); return 6; }
      case 0xEE: { const a=this.fetch16(); const v=(this.rd(a)+1)&0xFF; this.wr(a,v); this.nz(v); return 6; }
      case 0xFE: { const a=this.fetch16()+this.X; const v=(this.rd(a)+1)&0xFF; this.wr(a,v); this.nz(v); return 7; }
      case 0xC6: { const a=this.fetch(); const v=(this.rd(a)-1)&0xFF; this.wr(a,v); this.nz(v); return 5; }
      case 0xD6: { const a=(this.fetch()+this.X)&0xFF; const v=(this.rd(a)-1)&0xFF; this.wr(a,v); this.nz(v); return 6; }
      case 0xCE: { const a=this.fetch16(); const v=(this.rd(a)-1)&0xFF; this.wr(a,v); this.nz(v); return 6; }
      case 0xDE: { const a=this.fetch16()+this.X; const v=(this.rd(a)-1)&0xFF; this.wr(a,v); this.nz(v); return 7; }
      case 0xE8: { this.X=(this.X+1)&0xFF; this.nz(this.X); return 2; }
      case 0xCA: { this.X=(this.X-1)&0xFF; this.nz(this.X); return 2; }
      case 0xC8: { this.Y=(this.Y+1)&0xFF; this.nz(this.Y); return 2; }
      case 0x88: { this.Y=(this.Y-1)&0xFF; this.nz(this.Y); return 2; }
      // ── ASL ──
      case 0x0A: { this.A=this.asl(this.A); return 2; }
      case 0x06: { const a=this.fetch(); this.wr(a,this.asl(this.rd(a))); return 5; }
      case 0x16: { const a=(this.fetch()+this.X)&0xFF; this.wr(a,this.asl(this.rd(a))); return 6; }
      case 0x0E: { const a=this.fetch16(); this.wr(a,this.asl(this.rd(a))); return 6; }
      case 0x1E: { const a=this.fetch16()+this.X; this.wr(a,this.asl(this.rd(a))); return 7; }
      // ── LSR ──
      case 0x4A: { this.A=this.lsr(this.A); return 2; }
      case 0x46: { const a=this.fetch(); this.wr(a,this.lsr(this.rd(a))); return 5; }
      case 0x56: { const a=(this.fetch()+this.X)&0xFF; this.wr(a,this.lsr(this.rd(a))); return 6; }
      case 0x4E: { const a=this.fetch16(); this.wr(a,this.lsr(this.rd(a))); return 6; }
      case 0x5E: { const a=this.fetch16()+this.X; this.wr(a,this.lsr(this.rd(a))); return 7; }
      // ── ROL ──
      case 0x2A: { this.A=this.rol(this.A); return 2; }
      case 0x26: { const a=this.fetch(); this.wr(a,this.rol(this.rd(a))); return 5; }
      case 0x36: { const a=(this.fetch()+this.X)&0xFF; this.wr(a,this.rol(this.rd(a))); return 6; }
      case 0x2E: { const a=this.fetch16(); this.wr(a,this.rol(this.rd(a))); return 6; }
      case 0x3E: { const a=this.fetch16()+this.X; this.wr(a,this.rol(this.rd(a))); return 7; }
      // ── ROR ──
      case 0x6A: { this.A=this.ror(this.A); return 2; }
      case 0x66: { const a=this.fetch(); this.wr(a,this.ror(this.rd(a))); return 5; }
      case 0x76: { const a=(this.fetch()+this.X)&0xFF; this.wr(a,this.ror(this.rd(a))); return 6; }
      case 0x6E: { const a=this.fetch16(); this.wr(a,this.ror(this.rd(a))); return 6; }
      case 0x7E: { const a=this.fetch16()+this.X; this.wr(a,this.ror(this.rd(a))); return 7; }
      // ── JMP / JSR / RTS / RTI ──
      case 0x4C: { this.PC=this.fetch16(); return 3; }
      case 0x6C: { this.PC=this.rd16wrap(this.fetch16()); return 5; }
      case 0x20: {
        const addr=this.fetch16();
        const ret=this.PC-1;
        this.push((ret>>8)&0xFF); this.push(ret&0xFF);
        this.PC=addr; return 6;
      }
      case 0x60: {
        const lo=this.pop(); const hi=this.pop();
        this.PC=(lo|(hi<<8))+1; return 6;
      }
      case 0x40: {
        this.setP(this.pop());
        const lo=this.pop(); const hi=this.pop();
        this.PC=lo|(hi<<8); return 6;
      }
      // ── Branches ──
      case 0x90: { this.branch(this.C===0); return 2; }  // BCC
      case 0xB0: { this.branch(this.C===1); return 2; }  // BCS
      case 0xF0: { this.branch(this.Z===1); return 2; }  // BEQ
      case 0xD0: { this.branch(this.Z===0); return 2; }  // BNE
      case 0x30: { this.branch(this.N===1); return 2; }  // BMI
      case 0x10: { this.branch(this.N===0); return 2; }  // BPL
      case 0x70: { this.branch(this.V===1); return 2; }  // BVS
      case 0x50: { this.branch(this.V===0); return 2; }  // BVC
      // ── Flag ops ──
      case 0x18: { this.C=0; return 2; } // CLC
      case 0x38: { this.C=1; return 2; } // SEC
      case 0x58: { this.I=0; return 2; } // CLI
      case 0x78: { this.I=1; return 2; } // SEI
      case 0xD8: { this.D=0; return 2; } // CLD
      case 0xF8: { this.D=1; return 2; } // SED
      case 0xB8: { this.V=0; return 2; } // CLV
      // ── NOP and unofficial NOPs (commonly used in NSF/SID code) ──
      case 0xEA: return 2;
      case 0x1A: case 0x3A: case 0x5A: case 0x7A: case 0xDA: case 0xFA: return 2;
      case 0x80: case 0x82: case 0x89: case 0xC2: case 0xE2: { this.fetch(); return 2; }
      case 0x04: case 0x44: case 0x64: { this.fetch(); return 3; }
      case 0x0C: { this.fetch16(); return 4; }
      case 0x14: case 0x34: case 0x54: case 0x74: case 0xD4: case 0xF4: { this.fetch(); return 4; }
      case 0x1C: case 0x3C: case 0x5C: case 0x7C: case 0xDC: case 0xFC: { this.fetch16(); return 4; }
      case 0x00: {
        // BRK: consume padding byte; treat as fatal driver error / stop execution
        // BCD on the NES is disabled; on C64/Atari it is implemented in hardware but
        // music drivers rarely use it for audio logic.
        this.fetch(); // skip padding byte
        return 200_000; // exhaust remaining cycle budget — prevents hanging on $00 sea
      }
      default: return 2; // unknown opcode → treat as NOP (safe fallback)
    }
  }

  /** Run exactly N instructions. */
  runSteps(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  /** Run until PC == targetPC or cycleLimit exceeded. Returns cycles consumed. */
  runUntilPC(targetPC: number, cycleLimit: number): number {
    let cycles = 0;
    while (cycles < cycleLimit && this.PC !== targetPC) {
      cycles += this.step();
    }
    return cycles;
  }

  /**
   * Call subroutine at addr and run until it returns (SP returns to initial level).
   * Uses cycle limit as safety net.
   * NOTE: After this returns, PC is left at $FFFF (the fake return address).
   * Callers should not rely on getPC() after callSubroutine.
   * PUBLIC so NSF/SID/SAP parsers can call it directly.
   */
  callSubroutine(addr: number, maxCycles = 200_000): void {
    const targetSP = this.SP;
    // Push fake return address — the exact value doesn't matter, SP tracking stops the loop
    this.push(0xFF); this.push(0xFE);
    this.PC = addr;
    let cycles = 0;
    while (cycles < maxCycles) {
      cycles += this.step();
      // Stop when SP returns to the level before we pushed the fake return address
      if (this.SP >= targetSP) break;
    }
  }

  /**
   * Run music-player pattern: init once, then call play `frames` times.
   * NSF/SID/SAP drivers follow this pattern exactly.
   */
  runPlayer(initAddr: number, playAddr: number, initA: number, initX: number, frames: number, maxCyclesPerFrame = 200_000): void {
    this.setA(initA);
    this.setX(initX);
    this.callSubroutine(initAddr);
    for (let f = 0; f < frames; f++) {
      this.callSubroutine(playAddr, maxCyclesPerFrame);
    }
  }
}
